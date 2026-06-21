/**
 * NanoClaw Agent Runner v2
 *
 * Runs inside a container. All IO goes through the session DB.
 * No stdin, no stdout markers, no IPC files.
 *
 * Config is read from /workspace/agent/container.json (mounted RO).
 * Only TZ and OneCLI networking vars come from env.
 *
 * Mount structure:
 *   /workspace/
 *     inbound.db        ← host-owned session DB (container reads only)
 *     outbound.db       ← container-owned session DB
 *     .heartbeat        ← container touches for liveness detection
 *     outbox/           ← outbound files
 *     agent/            ← agent group folder (CLAUDE.md, container.json, working files)
 *       container.json  ← per-group config (RO nested mount)
 *     global/           ← shared global memory (RO)
 *   /app/src/           ← shared agent-runner source (RO)
 *   /app/skills/        ← shared skills (RO)
 *   /home/node/.claude/ ← Claude SDK state + skill symlinks (RW)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './config.js';
import { buildSystemPromptAddendum } from './destinations.js';
// Providers barrel — each enabled provider self-registers on import.
// Provider skills append imports to providers/index.ts.
import './providers/index.js';
import { createProvider, type ProviderName } from './providers/factory.js';
import { runPollLoop } from './poll-loop.js';

/**
 * Resolve `@./relative/path` imports (as used in CLAUDE.md composed files)
 * and return the concatenated content. Handles one level of nesting.
 */
function resolveClaudeImports(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  return raw
    .split('\n')
    .map(line => {
      const m = line.match(/^@(\.\/[^\s]+)$/);
      if (!m) return line;
      const target = path.resolve(dir, m[1]);
      if (!fs.existsSync(target)) return '';
      return fs.readFileSync(target, 'utf8');
    })
    .join('\n');
}

/**
 * Load the full agent system prompt from the workspace CLAUDE.md stack:
 * /app/CLAUDE.md (base) + fragments + CLAUDE.local.md (per-group persona).
 * Used by non-Claude-Code providers that don't auto-load CLAUDE files.
 */
function loadFullSystemContext(agentDir: string): string {
  const parts: string[] = [];
  const claudeMd = path.join(agentDir, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    parts.push(resolveClaudeImports(claudeMd));
  }
  const localMd = path.join(agentDir, 'CLAUDE.local.md');
  if (fs.existsSync(localMd)) {
    const local = fs.readFileSync(localMd, 'utf8').trim();
    if (local) parts.push(local);
  }
  return parts.join('\n\n');
}

function log(msg: string): void {
  console.error(`[agent-runner] ${msg}`);
}

const CWD = '/workspace/agent';

async function main(): Promise<void> {
  const config = loadConfig();
  const providerName = config.provider.toLowerCase() as ProviderName;

  log(`Starting v2 agent-runner (provider: ${providerName})`);

  // Runtime-generated system-prompt addendum: agent identity (name) plus
  // the live destinations map. For Claude Code, everything else is loaded
  // automatically from /workspace/agent/CLAUDE.md and CLAUDE.local.md.
  // For other providers (Gemini, etc.) we load the full CLAUDE stack here.
  const addendum = buildSystemPromptAddendum(config.assistantName || undefined);
  const isClaudeProvider = providerName === 'claude';
  const claudeContext = isClaudeProvider ? '' : loadFullSystemContext(CWD);
  const instructions = claudeContext ? `${claudeContext}\n\n${addendum}` : addendum;

  // Discover additional directories mounted at /workspace/extra/*
  const additionalDirectories: string[] = [];
  const extraBase = '/workspace/extra';
  if (fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        additionalDirectories.push(fullPath);
      }
    }
    if (additionalDirectories.length > 0) {
      log(`Additional directories: ${additionalDirectories.join(', ')}`);
    }
  }

  // MCP server path — bun runs TS directly; no tsc build step in-image.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'mcp-tools', 'index.ts');

  // Build MCP servers config: nanoclaw built-in + any from container.json
  const mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }> = {
    nanoclaw: {
      command: 'bun',
      args: ['run', mcpServerPath],
      env: {},
    },
  };

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    mcpServers[name] = serverConfig;
    log(`Additional MCP server: ${name} (${serverConfig.command})`);
  }

  const provider = createProvider(providerName, {
    assistantName: config.assistantName || undefined,
    mcpServers,
    env: { ...process.env },
    additionalDirectories: additionalDirectories.length > 0 ? additionalDirectories : undefined,
    model: config.model,
    effort: config.effort,
  });

  await runPollLoop({
    provider,
    providerName,
    cwd: CWD,
    systemContext: { instructions },
  });
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';

import { registerProvider } from './provider-registry.js';
import type { AgentProvider, AgentQuery, ProviderEvent, ProviderOptions, QueryInput } from './types.js';

function log(msg: string): void {
  console.error(`[gemini-provider] ${msg}`);
}

// ── mnemon integration ──

const MNEMON_GUIDE_PATH = path.join(process.env.HOME ?? '/home/node', '.mnemon', 'prompt', 'guide.md');

function loadMnemonGuide(): string {
  try {
    if (fs.existsSync(MNEMON_GUIDE_PATH)) return fs.readFileSync(MNEMON_GUIDE_PATH, 'utf8').trim();
  } catch { /* unavailable */ }
  return '';
}

function mnemonRecall(message: string, cwd: string): string {
  const query = message.replace(/["\n\r]/g, ' ').slice(0, 80).trim();
  if (!query) return '';
  try {
    const out = execSync(`mnemon recall "${query}" --limit 5 2>/dev/null || true`, {
      cwd, timeout: 5_000, encoding: 'utf8',
    }).trim();
    if (out) return `[Memory context — recalled for this message]\n${out}\n[/Memory context]\n\n`;
  } catch { /* mnemon unavailable */ }
  return '';
}

// ── Tool definitions ──

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'bash',
    description: 'Execute a bash command in the working directory. Use for running ncl, shell operations, etc.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: 'Bash command to run' },
        timeout: { type: Type.NUMBER, description: 'Timeout in ms (default 30000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: 'Path to the file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates it if absent).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: 'Path to the file' },
        content: { type: Type.STRING, description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace an exact string in a file. Fails if old_string is not found.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: 'Path to the file' },
        old_string: { type: Type.STRING, description: 'Exact string to find' },
        new_string: { type: Type.STRING, description: 'Replacement string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
];

// ── Tool execution ──

function resolvePath(p: string, cwd: string): string {
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

function executeTool(name: string, args: Record<string, unknown>, cwd: string): string {
  try {
    switch (name) {
      case 'bash': {
        const command = args.command as string;
        const timeout = (args.timeout as number | undefined) ?? 30_000;
        try {
          return execSync(command, { cwd, timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) || '(no output)';
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; message?: string };
          return ((e.stdout ?? '') + (e.stderr ? `\nSTDERR: ${e.stderr}` : '')) || e.message || 'Command failed';
        }
      }
      case 'read_file':
        return fs.readFileSync(resolvePath(args.path as string, cwd), 'utf8');
      case 'write_file': {
        const p = resolvePath(args.path as string, cwd);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, args.content as string, 'utf8');
        return `Written: ${p}`;
      }
      case 'edit_file': {
        const p = resolvePath(args.path as string, cwd);
        const src = fs.readFileSync(p, 'utf8');
        const oldStr = args.old_string as string;
        if (!src.includes(oldStr)) return `Error: old_string not found in ${p}`;
        fs.writeFileSync(p, src.replace(oldStr, args.new_string as string), 'utf8');
        return `Edited: ${p}`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Conversation history ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeminiContent = { role: string; parts: any[] };
type GeminiHistory = GeminiContent[];

const SESSIONS_DIR = '.gemini-sessions';
const MAX_HISTORY = 40;

function historyPath(sessionId: string, cwd: string): string {
  return path.join(cwd, SESSIONS_DIR, `${sessionId}.json`);
}

function loadHistory(continuation: string | undefined, cwd: string): { id: string; history: GeminiHistory } {
  const id = continuation ?? randomUUID();
  if (!continuation) return { id, history: [] };
  const p = historyPath(continuation, cwd);
  if (!fs.existsSync(p)) {
    log(`Session ${continuation} not found, starting fresh`);
    return { id, history: [] };
  }
  try {
    return { id, history: JSON.parse(fs.readFileSync(p, 'utf8')) as GeminiHistory };
  } catch (err) {
    log(`Failed to load session: ${err}`);
    return { id, history: [] };
  }
}

function saveHistory(id: string, history: GeminiHistory, cwd: string): void {
  const trimmed = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
  const p = historyPath(id, cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(trimmed), 'utf8');
}

// ── Credentials ──

function setupCredentials(): void {
  const inline = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (inline && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const tmp = path.join(os.tmpdir(), `gcp-sa-${process.pid}.json`);
    let json: string;
    try {
      json = Buffer.from(inline, 'base64').toString('utf8');
      JSON.parse(json);
    } catch {
      json = inline;
    }
    fs.writeFileSync(tmp, json, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp;
    log(`Credentials written to ${tmp}`);
  }
}

// ── Provider ──

export class GeminiProvider implements AgentProvider {
  readonly supportsNativeSlashCommands = false;

  private modelId: string;
  private client: GoogleGenAI;

  constructor(options: ProviderOptions = {}) {
    setupCredentials();
    this.modelId = options.model ?? 'gemini-3.5-flash';
    const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
    if (!projectId) log('WARNING: GOOGLE_CLOUD_PROJECT not set');
    this.client = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: 'global',
    });
  }

  isSessionInvalid(_err: unknown): boolean {
    return false;
  }

  query(input: QueryInput): AgentQuery {
    const pending: string[] = [];
    let ended = false;
    let aborted = false;
    let wakeup: (() => void) | null = null;

    const push = (msg: string) => { pending.push(msg); wakeup?.(); };
    const end = () => { ended = true; wakeup?.(); };
    const abort = () => { aborted = true; ended = true; wakeup?.(); };

    const self = this;

    async function* run(): AsyncGenerator<ProviderEvent> {
      const { id, history } = loadHistory(input.continuation, input.cwd);
      yield { type: 'init', continuation: id };

      const guide = loadMnemonGuide();
      const baseSystem = input.systemContext?.instructions ?? '';
      const systemInstruction = guide ? `${baseSystem}\n\n---\n\n${guide}` : baseSystem;

      const queue = [input.prompt];

      while (!aborted) {
        const msg = queue.shift() ?? pending.shift();
        if (!msg) {
          if (ended) break;
          await new Promise<void>((r) => { wakeup = r; });
          wakeup = null;
          continue;
        }

        const recalled = mnemonRecall(msg, input.cwd);
        const augmented = recalled ? `${recalled}${msg}` : msg;

        yield { type: 'activity' };
        history.push({ role: 'user', parts: [{ text: augmented }] });

        try {
          const result: string | null = yield* self.runTurn(history, systemInstruction, input.cwd);
          saveHistory(id, history, input.cwd);
          yield { type: 'activity' };
          yield { type: 'result', text: result };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log(`Turn error: ${errMsg}`);
          yield { type: 'error', message: errMsg, retryable: false };
          break;
        }
      }
    }

    return { push, end, abort, events: run() };
  }

  private async *runTurn(
    history: GeminiHistory,
    systemInstruction: string,
    cwd: string,
  ): AsyncGenerator<ProviderEvent, string | null> {
    const tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
    const config = {
      tools,
      ...(systemInstruction ? { systemInstruction } : {}),
    };

    const contents = [...history];

    for (let i = 0; i < 25; i++) {
      yield { type: 'activity' };

      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents,
        config,
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) throw new Error('Empty Gemini response');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = candidate.content.parts;
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0) {
        const text = parts.filter((p) => p.text).map((p) => p.text as string).join('').trim() || null;
        history.push({ role: 'model', parts });
        return text;
      }

      // Preserve full parts (including thoughtSignature) in history
      history.push({ role: 'model', parts });
      contents.push({ role: 'model', parts });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseParts: any[] = [];
      for (const part of functionCalls) {
        const fc = part.functionCall;
        yield { type: 'progress', message: `${fc.name}(${JSON.stringify(fc.args).slice(0, 60)})` };
        yield { type: 'activity' };
        const result = executeTool(fc.name, fc.args as Record<string, unknown>, cwd);
        log(`Tool ${fc.name} → ${result.slice(0, 80)}`);
        responseParts.push({
          functionResponse: { name: fc.name, response: { output: result } },
        });
      }

      const toolMsg: GeminiContent = { role: 'user', parts: responseParts };
      history.push(toolMsg);
      contents.push(toolMsg);
    }

    return '(reached tool iteration limit)';
  }
}

registerProvider('gemini', (opts) => new GeminiProvider(opts));

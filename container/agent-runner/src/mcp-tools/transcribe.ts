/**
 * Voice note / audio transcription MCP tool.
 *
 * When Claude sees [audio: file.ogg — saved to inbox/.../file.ogg], it calls
 * transcribe_audio with that path. This tool reads the file from the agent
 * workspace and sends it to Groq's Whisper endpoint (free, fast, OGG-native).
 *
 * Credentials: add GROQ_API_KEY to OneCLI vault. Requests to api.groq.com
 * are intercepted by the OneCLI proxy which injects the key automatically.
 * Falls back to OPENAI_API_KEY / api.openai.com if Groq is not configured.
 *
 * Tool: transcribe_audio
 */
import { readFileSync, existsSync } from 'fs';
import { join, resolve, basename } from 'path';
import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function log(msg: string): void {
  console.error(`[transcribe] ${msg}`);
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

const WORKSPACE = '/workspace/group';

/** Resolve a relative path (from the formatter) to an absolute path inside the workspace. */
function resolveAudioPath(inputPath: string): string | null {
  // Strip any leading slash so join works cleanly
  const rel = inputPath.replace(/^\/+/, '');
  const candidates = [
    resolve(join(WORKSPACE, rel)),
    resolve(join(WORKSPACE, 'sessions', rel)),
    resolve(inputPath), // already absolute
  ];
  for (const p of candidates) {
    // Safety: must stay inside workspace or be a readable file
    if (existsSync(p)) return p;
  }
  return null;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';

async function transcribe(filePath: string, language?: string): Promise<string> {
  const audioData = readFileSync(filePath);
  const fileName = basename(filePath);

  // Detect MIME type from extension
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'ogg';
  const mime: Record<string, string> = {
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };
  const contentType = mime[ext] ?? 'audio/ogg';

  const form = new FormData();
  form.append('file', new Blob([audioData], { type: contentType }), fileName);
  form.append('model', 'whisper-large-v3-turbo');
  if (language) form.append('language', language);
  form.append('response_format', 'text');

  // Try Groq first (free tier, fast), fall back to OpenAI
  for (const url of [GROQ_URL, OPENAI_URL]) {
    log(`Trying transcription via ${url}`);
    const res = await fetch(url, { method: 'POST', body: form });

    if (res.status === 401 || res.status === 403) {
      log(`Auth failed for ${url}, trying next`);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`Transcription API error ${res.status}: ${body}`);
    }
    const text = await res.text();
    return text.trim();
  }

  throw new Error(
    'Transcription failed: no working API key found. Add GROQ_API_KEY or OPENAI_API_KEY to your OneCLI vault.'
  );
}

const tools: McpToolDefinition[] = [
  {
    tool: {
      name: 'transcribe_audio',
      description:
        'Transcribe a voice note or audio file to text. Call this whenever you receive a message containing [audio: ...] — pass the file path shown after "saved to". Returns the spoken text.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'File path of the audio file, e.g. "inbox/msg-123/attachment.ogg". Taken directly from the [audio: ... saved to <path>] reference in the message.',
          },
          language: {
            type: 'string',
            description:
              'Optional ISO-639-1 language code (e.g. "en", "hi") to improve accuracy. Omit for auto-detection.',
          },
        },
        required: ['path'],
      },
    },
    handler: async (args) => {
      const { path: inputPath, language } = args as { path: string; language?: string };

      if (!inputPath) return err('path is required');

      const filePath = resolveAudioPath(inputPath);
      if (!filePath) {
        return err(
          `Audio file not found: ${inputPath}. ` +
            `Checked inside ${WORKSPACE}. ` +
            `Make sure the path matches what appeared in the [audio: ...] reference.`
        );
      }

      log(`Transcribing ${filePath}`);

      try {
        const transcript = await transcribe(filePath, language);
        log(`Transcript: ${transcript.slice(0, 80)}...`);
        return ok(transcript);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`Transcription error: ${msg}`);
        return err(msg);
      }
    },
  },
];

registerTools(tools);

/**
 * Gmail MCP tools.
 *
 * list_gmail / read_gmail: IMAP via curl, using GMAIL_USER + GMAIL_APP_PASSWORD.
 * send_gmail: SMTP via curl, same credentials.
 *
 * No OAuth or ADC needed — App Password covers everything.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function log(msg: string): void {
  console.error(`[gmail] ${msg}`);
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

// ── IMAP helpers ──

const IMAP_BASE = 'imaps://imap.gmail.com:993/INBOX';

function imapCredentials(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return { user, pass };
}

/** Run an IMAP SEARCH command and return sequence numbers. */
function imapSearch(imap: string, user: string, pass: string): number[] {
  const cmd = `curl --silent --ssl-reqd "${IMAP_BASE}" --user "${user}:${pass}" --request "${imap}"`;
  try {
    const out = execSync(cmd, { timeout: 20_000, encoding: 'utf8' });
    const match = out.match(/\* SEARCH([\d\s]*)/);
    if (!match || !match[1].trim()) return [];
    return match[1].trim().split(/\s+/).filter(Boolean).map(Number);
  } catch (e) {
    throw new Error(`IMAP SEARCH failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Fetch a message by sequence number. Returns raw RFC 2822 text. */
function imapFetch(seqNum: number, user: string, pass: string): string {
  const cmd = `curl --silent --ssl-reqd "${IMAP_BASE};MAILINDEX=${seqNum}" --user "${user}:${pass}"`;
  return execSync(cmd, { timeout: 20_000, encoding: 'utf8' });
}

/** Parse a header value from a raw email string. */
function parseHeader(raw: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, 'im');
  return raw.match(re)?.[1]?.replace(/\r?\n[ \t]/g, ' ').trim() ?? '';
}

/** Extract plain-text body from raw RFC 2822 message. Strips headers. */
function extractPlainBody(raw: string): string {
  // Find the blank line separating headers from body
  const sep = raw.search(/\r?\n\r?\n/);
  if (sep === -1) return '';
  let body = raw.slice(sep).trim();

  // If multipart, find the first text/plain part
  const boundary = raw.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  if (boundary) {
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'));
    for (const part of parts) {
      if (/content-type:\s*text\/plain/i.test(part)) {
        const partSep = part.search(/\r?\n\r?\n/);
        if (partSep !== -1) {
          body = part.slice(partSep).trim();
          break;
        }
      }
    }
  }

  // Remove quoted-printable soft line breaks
  body = body.replace(/=\r?\n/g, '');
  // Decode common QP sequences
  body = body.replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

  return body.slice(0, 2000); // cap at 2000 chars for snippet
}

/** Translate a Gmail-style query to an IMAP SEARCH command. */
function toImapSearch(query: string): string {
  const parts: string[] = [];

  if (query.includes('is:unread')) parts.push('UNSEEN');

  // after:YYYY/MM/DD
  const afterMatch = query.match(/after:(\d{4})\/(\d{2})\/(\d{2})/);
  if (afterMatch) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = `${parseInt(afterMatch[3])}-${months[parseInt(afterMatch[2]) - 1]}-${afterMatch[1]}`;
    parts.push(`SINCE ${d}`);
  }

  // from:email
  const fromMatch = query.match(/from:([^\s]+)/);
  if (fromMatch) parts.push(`FROM "${fromMatch[1]}"`);

  // subject:word
  const subjMatch = query.match(/subject:([^\s]+)/);
  if (subjMatch) parts.push(`SUBJECT "${subjMatch[1]}"`);

  // Default: last 24 hours
  if (parts.length === 0) {
    const yesterday = new Date(Date.now() - 86_400_000);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    parts.push(`SINCE ${yesterday.getDate()}-${months[yesterday.getMonth()]}-${yesterday.getFullYear()}`);
  }

  return `SEARCH ${parts.join(' ')}`;
}

// ── Tools ──

export const listGmail: McpToolDefinition = {
  tool: {
    name: 'list_gmail',
    description:
      'List recent Gmail messages via IMAP. Returns sender, subject, date, and snippet. Use to get the overnight email digest for morning briefing. Default query returns emails from the last 24 hours.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            "Filter query. Supports: 'is:unread', 'after:YYYY/MM/DD', 'from:email', 'subject:word'. Defaults to emails from last 24 hours.",
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of messages to return (default 10, max 20)',
        },
      },
      required: [],
    },
  },
  async handler(args) {
    const creds = imapCredentials();
    if (!creds) return err('GMAIL_USER and GMAIL_APP_PASSWORD env vars are not set.');

    const query = (args.query as string | undefined) ?? '';
    const maxResults = Math.min(Number(args.max_results ?? 10), 20);
    const imapCmd = toImapSearch(query);

    log(`list_gmail: ${imapCmd}`);

    let seqNums: number[];
    try {
      seqNums = imapSearch(imapCmd, creds.user, creds.pass);
    } catch (e) {
      return err(String(e));
    }

    if (seqNums.length === 0) return ok('No messages found.');

    // Take the most recent N (IMAP returns oldest-first)
    const toFetch = seqNums.slice(-maxResults).reverse();
    const results: string[] = [];

    for (const seq of toFetch) {
      try {
        const raw = imapFetch(seq, creds.user, creds.pass);
        const from = parseHeader(raw, 'From');
        const subject = parseHeader(raw, 'Subject');
        const date = parseHeader(raw, 'Date');
        const snippet = extractPlainBody(raw).replace(/\s+/g, ' ').slice(0, 200);
        results.push(`#${seq} | From: ${from} | Subject: ${subject} | Date: ${date}\nSnippet: ${snippet}`);
      } catch {
        results.push(`#${seq} | (fetch failed)`);
      }
    }

    return ok(results.join('\n\n---\n\n'));
  },
};

export const readGmail: McpToolDefinition = {
  tool: {
    name: 'read_gmail',
    description: 'Read the full content of a Gmail message. Use the sequence number (#N) from list_gmail results.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message_id: {
          type: 'string',
          description: 'The message sequence number from list_gmail (the #N value)',
        },
      },
      required: ['message_id'],
    },
  },
  async handler(args) {
    const creds = imapCredentials();
    if (!creds) return err('GMAIL_USER and GMAIL_APP_PASSWORD env vars are not set.');

    const raw_id = args.message_id as string;
    const seqNum = parseInt(raw_id.replace('#', ''), 10);
    if (isNaN(seqNum)) return err('Invalid message_id — use the #N number from list_gmail');

    log(`read_gmail: fetching #${seqNum}`);
    try {
      const raw = imapFetch(seqNum, creds.user, creds.pass);
      const from = parseHeader(raw, 'From');
      const subject = parseHeader(raw, 'Subject');
      const date = parseHeader(raw, 'Date');
      const body = extractPlainBody(raw);
      return ok(`From: ${from}\nSubject: ${subject}\nDate: ${date}\n\n${body || '(no readable body)'}`);
    } catch (e) {
      return err(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};

export const sendGmail: McpToolDefinition = {
  tool: {
    name: 'send_gmail',
    description:
      'Send an email via Gmail SMTP. IMPORTANT: Never send without explicit per-message confirmation from the user.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Plain text email body' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  async handler(args) {
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;

    if (!to || !subject || !body) return err('to, subject, and body are required');

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
      return err('GMAIL_USER and GMAIL_APP_PASSWORD env vars are not set. Add them to .env and restart the host.');
    }

    const raw = [
      `From: ${gmailUser}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n');

    const tmpFile = path.join(os.tmpdir(), `gmail-send-${Date.now()}.eml`);
    try {
      fs.writeFileSync(tmpFile, raw, 'utf8');

      const cmd = [
        'curl', '--silent', '--show-error',
        '--ssl-reqd',
        '--url', 'smtps://smtp.gmail.com:465',
        '--user', `${gmailUser}:${gmailPass}`,
        '--mail-from', gmailUser,
        '--mail-rcpt', to,
        '--upload-file', tmpFile,
      ].join(' ');

      log(`send_gmail: sending to=${to} subject="${subject}"`);
      execSync(cmd, { timeout: 15_000 });
      log('send_gmail: sent ok');
      return ok(`Email sent to ${to}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(`SMTP send failed: ${msg}`);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  },
};

registerTools([listGmail, readGmail, sendGmail]);

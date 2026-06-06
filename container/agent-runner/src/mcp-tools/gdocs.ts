/**
 * Google Docs + Drive MCP tools.
 *
 * Credentials are injected by the OneCLI HTTPS proxy — no auth headers
 * or credential files needed here. Requests to *.googleapis.com are
 * intercepted and get a valid OAuth token attached automatically.
 *
 * Tools: list_google_docs, read_google_doc, append_to_google_doc, create_google_doc
 */
import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function log(msg: string): void {
  console.error(`[gdocs] ${msg}`);
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

const DOCS_BASE = 'https://docs.googleapis.com/v1/documents';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

/** Strip a Google Docs URL down to just the document ID if the user pastes a full URL. */
function extractDocId(input: string): string {
  const match = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

/**
 * Extract plain text from a Google Docs document body.
 * Walks the structural elements and concatenates paragraph text runs,
 * preserving newlines between paragraphs and list items.
 */
function extractText(body: { content?: unknown[] }): string {
  const lines: string[] = [];

  function walkElement(el: unknown): void {
    if (!el || typeof el !== 'object') return;
    const elem = el as Record<string, unknown>;

    if (elem.paragraph) {
      const para = elem.paragraph as { elements?: unknown[] };
      const runs: string[] = [];
      for (const pe of para.elements ?? []) {
        const run = pe as Record<string, unknown>;
        if (run.textRun) {
          const tr = run.textRun as { content?: string };
          if (tr.content) runs.push(tr.content);
        }
      }
      const line = runs.join('').replace(/\n$/, '');
      if (line) lines.push(line);
    } else if (elem.table) {
      const table = elem.table as { tableRows?: unknown[] };
      for (const row of table.tableRows ?? []) {
        const r = row as { tableCells?: unknown[] };
        for (const cell of r.tableCells ?? []) {
          const c = cell as { content?: unknown[] };
          for (const ce of c.content ?? []) walkElement(ce);
        }
      }
    }
  }

  for (const el of body.content ?? []) walkElement(el);
  return lines.join('\n');
}

/** Check for a gateway / auth error in a fetch Response and return a message. */
async function checkAuthError(res: Response, service = 'Google Docs'): Promise<string | null> {
  if (res.ok) return null;
  if (res.status === 401 || res.status === 403) {
    let connectUrl = '';
    try {
      const body = (await res.json()) as Record<string, unknown>;
      if (typeof body.connect_url === 'string') connectUrl = body.connect_url;
    } catch {
      // ignore parse failure
    }
    if (connectUrl) {
      return `${service} is not connected. Connect it here: ${connectUrl}`;
    }
    return `${service} returned ${res.status}. Connect the service in the OneCLI dashboard.`;
  }
  return `${service} API error ${res.status}: ${await res.text().catch(() => '(no body)')}`;
}

export const listGoogleDocs: McpToolDefinition = {
  tool: {
    name: 'list_google_docs',
    description:
      "List the user's Google Docs (most recently modified first). Use to help the user pick a document when they don't know the ID.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: "Optional search string to filter by title (e.g. 'meeting notes')",
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results (default 20, max 50)',
        },
      },
      required: [],
    },
  },
  async handler(args) {
    const query = args.query as string | undefined;
    const limit = Math.min(Number(args.limit ?? 20), 50);

    let q = "mimeType='application/vnd.google-apps.document' and trashed=false";
    if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;

    const params = new URLSearchParams({
      q,
      pageSize: String(limit),
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime,webViewLink)',
    });

    const url = `${DRIVE_BASE}/files?${params}`;
    log(`list_google_docs: GET ${url}`);

    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      return err(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const authErr = await checkAuthError(res, 'Google Drive');
    if (authErr) return err(authErr);

    const data = (await res.json()) as { files?: { id: string; name: string; modifiedTime: string; webViewLink: string }[] };
    const files = data.files ?? [];
    if (files.length === 0) return ok('No documents found.');

    const lines = files.map(
      (f) => `• ${f.name}\n  ID: ${f.id}\n  Modified: ${f.modifiedTime.slice(0, 10)}\n  ${f.webViewLink}`,
    );
    return ok(lines.join('\n\n'));
  },
};

export const readGoogleDoc: McpToolDefinition = {
  tool: {
    name: 'read_google_doc',
    description:
      'Read the full text content of a Google Doc. Accepts the document ID or a full Google Docs URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: {
          type: 'string',
          description: "The document ID or full Google Docs URL (e.g. https://docs.google.com/document/d/DOCUMENT_ID/edit)",
        },
      },
      required: ['document_id'],
    },
  },
  async handler(args) {
    const raw = args.document_id as string;
    if (!raw) return err('document_id is required');
    const docId = extractDocId(raw);

    const url = `${DOCS_BASE}/${docId}`;
    log(`read_google_doc: GET ${url}`);

    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      return err(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const authErr = await checkAuthError(res, 'Google Docs');
    if (authErr) return err(authErr);

    const doc = (await res.json()) as { title?: string; body?: { content?: unknown[] } };
    const title = doc.title ?? '(untitled)';
    const text = extractText(doc.body ?? {});

    if (!text.trim()) return ok(`Document "${title}" is empty.`);
    return ok(`# ${title}\n\n${text}`);
  },
};

export const appendToGoogleDoc: McpToolDefinition = {
  tool: {
    name: 'append_to_google_doc',
    description:
      'Append text to the end of an existing Google Doc. Creates a new paragraph. Accepts the document ID or a full Google Docs URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        document_id: {
          type: 'string',
          description: 'The document ID or full Google Docs URL',
        },
        content: {
          type: 'string',
          description: 'Text to append. Markdown-style line breaks are preserved.',
        },
        heading: {
          type: 'string',
          description: "Optional heading to prepend before the content (e.g. a date or section title)",
        },
      },
      required: ['document_id', 'content'],
    },
  },
  async handler(args) {
    const raw = args.document_id as string;
    if (!raw) return err('document_id is required');
    const content = args.content as string;
    if (!content) return err('content is required');
    const heading = args.heading as string | undefined;
    const docId = extractDocId(raw);

    // Get current end-of-document index so we can insert there.
    const getUrl = `${DOCS_BASE}/${docId}?fields=body.content`;
    log(`append_to_google_doc: fetching doc end index`);
    let getRes: Response;
    try {
      getRes = await fetch(getUrl);
    } catch (e) {
      return err(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    const authErr = await checkAuthError(getRes, 'Google Docs');
    if (authErr) return err(authErr);

    const docMeta = (await getRes.json()) as { body?: { content?: Array<{ endIndex?: number }> } };
    const bodyContent = docMeta.body?.content ?? [];
    // The last structural element's endIndex is the doc end; subtract 1 to stay inside the body.
    const lastEl = bodyContent[bodyContent.length - 1];
    const insertAt = (lastEl?.endIndex ?? 2) - 1;

    // Build batch update requests.
    const textToInsert = heading ? `\n${heading}\n${content}\n` : `\n${content}\n`;

    const batchUrl = `${DOCS_BASE}/${docId}:batchUpdate`;
    const body = JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: insertAt },
            text: textToInsert,
          },
        },
      ],
    });

    log(`append_to_google_doc: POST ${batchUrl} (insert at ${insertAt})`);
    let res: Response;
    try {
      res = await fetch(batchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (e) {
      return err(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const writeErr = await checkAuthError(res, 'Google Docs');
    if (writeErr) return err(writeErr);

    log(`append_to_google_doc: success`);
    return ok(`Appended to document. View it at: https://docs.google.com/document/d/${docId}/edit`);
  },
};

export const createGoogleDoc: McpToolDefinition = {
  tool: {
    name: 'create_google_doc',
    description:
      'Create a new Google Doc with a title and initial content. Returns the document ID and URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Document title',
        },
        content: {
          type: 'string',
          description: 'Initial text content for the document',
        },
      },
      required: ['title', 'content'],
    },
  },
  async handler(args) {
    const title = args.title as string;
    if (!title) return err('title is required');
    const content = (args.content as string) ?? '';

    // Step 1: create the doc via the Docs API (sets the title).
    log(`create_google_doc: creating "${title}"`);
    let createRes: Response;
    try {
      createRes = await fetch(DOCS_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } catch (e) {
      return err(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }

    const authErr = await checkAuthError(createRes, 'Google Docs');
    if (authErr) return err(authErr);

    const created = (await createRes.json()) as { documentId?: string };
    const docId = created.documentId;
    if (!docId) return err('Google Docs API did not return a document ID');

    // Step 2: insert the initial content if provided.
    if (content.trim()) {
      const batchUrl = `${DOCS_BASE}/${docId}:batchUpdate`;
      try {
        const batchRes = await fetch(batchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: 1 }, text: content } }],
          }),
        });
        const batchErr = await checkAuthError(batchRes, 'Google Docs');
        if (batchErr) {
          // Doc was created but content insert failed — still return the doc URL.
          log(`create_google_doc: content insert failed: ${batchErr}`);
          return ok(
            `Document created (content insert failed — you can add text manually).\nID: ${docId}\nhttps://docs.google.com/document/d/${docId}/edit`,
          );
        }
      } catch (e) {
        log(`create_google_doc: content insert error: ${e}`);
      }
    }

    log(`create_google_doc: success, id=${docId}`);
    return ok(
      `Document created: "${title}"\nID: ${docId}\nhttps://docs.google.com/document/d/${docId}/edit`,
    );
  },
};

registerTools([listGoogleDocs, readGoogleDoc, appendToGoogleDoc, createGoogleDoc]);

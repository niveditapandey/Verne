---
name: google-docs
description: >-
  Google Docs integration. Use when the user asks you to read, search, create,
  or write to a Google Doc. Also use at the end of a research or planning session
  to offer to save a summary. Requires Google Docs and Drive to be connected via
  OneCLI (handled automatically by the gateway).
compatibility: Requires OneCLI gateway (HTTPS_PROXY set in environment)
metadata:
  author: nanoclaw
  version: "1.0.0"
---

# Google Docs

You can read from and write to the user's Google Docs via four tools.
Credentials are injected automatically by the OneCLI gateway — you never
handle tokens directly.

## Tools

### `list_google_docs`
List recent documents. Use when the user says "show me my docs", "find my
notes on X", or refers to a document by name without giving an ID.

```
list_google_docs()                          # 20 most recent
list_google_docs(query="meeting notes")     # filter by title
list_google_docs(limit=10)
```

### `read_google_doc`
Read the full text of a document. Accepts a document ID **or** a full
Google Docs URL — you can paste either:

```
read_google_doc(document_id="1BxiM...")
read_google_doc(document_id="https://docs.google.com/document/d/1BxiM.../edit")
```

Use when the user says "what does my X doc say", "read my notes", or shares
a Google Docs link.

### `append_to_google_doc`
Append text to the end of an existing document. Use when the user says "add
this to my notes", "save this summary to my doc", or "log this to Google Docs".

```
append_to_google_doc(
  document_id="1BxiM...",
  content="The key takeaways were...",
  heading="2026-06-06"          # optional — added as a section title
)
```

### `create_google_doc`
Create a new document with a title and initial content. Returns the document
ID and URL. Use when the user says "create a new doc for X" or "start a
notes file for this project".

```
create_google_doc(
  title="Singapore Relocation Checklist",
  content="## To-do\n- ..."
)
```

## When to use

- User says "save this to my notes" / "add this to Google Docs" → `append_to_google_doc`
- User shares a Google Docs URL and asks what it says → `read_google_doc`
- User says "what does my [document name] say" → `list_google_docs` first, then `read_google_doc`
- End of a long research or planning session → offer to save a summary with `create_google_doc` or `append_to_google_doc`
- User says "create a doc for..." → `create_google_doc`

## If a request fails with 401 / 403

The OneCLI gateway will include a `connect_url` in the error response.
Show it to the user:

> Google Docs isn't connected yet. Connect it here: [connect_url]

After they connect, retry the original request automatically.

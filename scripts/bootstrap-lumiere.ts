/**
 * One-time bootstrap for Lumiere agent.
 * Creates a session, scaffolds the inbound.db, and seeds the recurring
 * morning briefing task so it fires at 07:30 IST without waiting for NP
 * to send a first message.
 *
 * Run once: pnpm exec tsx scripts/bootstrap-lumiere.ts
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { initDb, getDb } from '../src/db/connection.js';
import { DATA_DIR } from '../src/config.js';
import { initSessionFolder, openInboundDb } from '../src/session-manager.js';

const LUMIERE_GROUP_ID = 'ag-1781462268671-rn13pt';
const LUMIERE_MG_ID    = 'mg-1780859754503-y8cr90'; // NP's +65 self-chat

// ── 1. Check no active session already exists ──────────────────────────────
const DB_PATH = path.join(DATA_DIR, 'v2.db');
initDb(DB_PATH);
const db = getDb();
const existing = db.prepare(
  "SELECT id FROM sessions WHERE agent_group_id=? AND status='active' LIMIT 1"
).get(LUMIERE_GROUP_ID) as { id: string } | undefined;

if (existing) {
  console.log(`Lumiere already has a session: ${existing.id} — nothing to do.`);
  process.exit(0);
}

// ── 2. Create session row ──────────────────────────────────────────────────
const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
db.prepare(
  `INSERT INTO sessions (id, agent_group_id, messaging_group_id, status, container_status, created_at, last_active)
   VALUES (?, ?, ?, 'active', 'stopped', datetime('now'), datetime('now'))`
).run(sessionId, LUMIERE_GROUP_ID, LUMIERE_MG_ID);
console.log(`Created session: ${sessionId}`);

// ── 3. Scaffold session directory + DBs ───────────────────────────────────
initSessionFolder(LUMIERE_GROUP_ID, sessionId);
const inDb = openInboundDb(LUMIERE_GROUP_ID, sessionId);
const sessDir = path.join(DATA_DIR, 'v2-sessions', LUMIERE_GROUP_ID, sessionId);
console.log(`Initialised inbound.db at ${sessDir}`);

// ── 4. Seed morning briefing as recurring task ─────────────────────────────
// 02:00 UTC = 07:30 IST. First fire: next occurrence of 02:00 UTC.
const now = new Date();
const firstFire = new Date(now);
firstFire.setUTCHours(2, 0, 0, 0);
if (firstFire <= now) firstFire.setUTCDate(firstFire.getUTCDate() + 1);

const taskId = `task-lumiere-morning-${Date.now()}`;
const content = JSON.stringify({
  prompt: 'Deliver the morning briefing to np-whatsapp-sg as described in your instructions.',
});

inDb.prepare(
  `INSERT INTO messages_in
     (id, seq, timestamp, status, tries, process_after, recurrence, kind, content, series_id, trigger, on_wake)
   VALUES
     (@id, @seq, datetime('now'), 'pending', 0, @processAfter, @recurrence, 'task', @content, @id, 1, 0)`
).run({
  id:          taskId,
  seq:         2,   // even = host-assigned
  processAfter: firstFire.toISOString(),
  recurrence:  '0 2 * * *',
  content,
});

console.log(`Morning briefing task seeded: ${taskId}`);
console.log(`First fire: ${firstFire.toISOString()} (07:30 IST)`);
console.log('Done — Lumiere will wake tomorrow morning for her first briefing.');

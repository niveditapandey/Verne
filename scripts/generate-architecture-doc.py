"""Generate NanoClaw architecture docx for Lumière & Verne."""
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

doc = Document()

# ── Page margins ──────────────────────────────────────────────────────────────
section = doc.sections[0]
section.page_width  = Inches(8.5)
section.page_height = Inches(11)
section.left_margin   = Inches(1)
section.right_margin  = Inches(1)
section.top_margin    = Inches(1)
section.bottom_margin = Inches(1)

# ── Palette ───────────────────────────────────────────────────────────────────
BLACK     = RGBColor(0x1A, 0x1A, 0x2E)
NAVY      = RGBColor(0x16, 0x21, 0x3E)
TEAL      = RGBColor(0x0F, 0x3A, 0x5C)
GOLD      = RGBColor(0xE2, 0xB9, 0x5C)
LIGHT_GREY= RGBColor(0xF5, 0xF6, 0xFA)
MID_GREY  = RGBColor(0xD0, 0xD3, 0xDE)
DARK_GREY = RGBColor(0x5A, 0x5F, 0x7A)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
LUMIERE   = RGBColor(0x6C, 0x63, 0xFF)   # purple-blue for Lumière
VERNE     = RGBColor(0x0E, 0xA5, 0xE9)   # sky-blue for Verne

# ── Helpers ───────────────────────────────────────────────────────────────────
def rgb_hex(rgb: RGBColor) -> str:
    return '%02X%02X%02X' % (rgb[0], rgb[1], rgb[2])

def set_cell_bg(cell, rgb: RGBColor):
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  rgb_hex(rgb))
    tcPr.append(shd)

def set_cell_border(cell, top=None, bottom=None, left=None, right=None):
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        if val:
            el = OxmlElement(f'w:{side}')
            el.set(qn('w:val'),   val.get('val',   'single'))
            el.set(qn('w:sz'),    val.get('sz',    '4'))
            el.set(qn('w:space'), val.get('space', '0'))
            el.set(qn('w:color'), val.get('color', '000000'))
            tcBorders.append(el)
    tcPr.append(tcBorders)

def paragraph_bg(para, rgb: RGBColor):
    pPr  = para._p.get_or_add_pPr()
    shd  = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  rgb_hex(rgb))
    pPr.append(shd)

def heading1(text, colour=NAVY):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after  = Pt(6)
    run = p.add_run(text)
    run.bold = True
    run.font.size  = Pt(16)
    run.font.color.rgb = colour
    # bottom border
    pPr = p._p.get_or_add_pPr()
    pb  = OxmlElement('w:pBdr')
    bot = OxmlElement('w:bottom')
    bot.set(qn('w:val'),   'single')
    bot.set(qn('w:sz'),    '6')
    bot.set(qn('w:space'), '1')
    bot.set(qn('w:color'), rgb_hex(colour))
    pb.append(bot)
    pPr.append(pb)
    return p

def heading2(text, colour=TEAL):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after  = Pt(4)
    run = p.add_run(text)
    run.bold = True
    run.font.size  = Pt(13)
    run.font.color.rgb = colour
    return p

def heading3(text, colour=DARK_GREY):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after  = Pt(2)
    run = p.add_run(text)
    run.bold = True
    run.font.size  = Pt(11)
    run.font.color.rgb = colour
    return p

def body(text, indent=0):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    if indent:
        p.paragraph_format.left_indent = Inches(indent * 0.25)
    run = p.add_run(text)
    run.font.size = Pt(10)
    run.font.color.rgb = BLACK
    return p

def bullet(text, level=0, bold_prefix=None):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.left_indent = Inches(0.25 + level * 0.2)
    if bold_prefix:
        r = p.add_run(bold_prefix)
        r.bold = True
        r.font.size = Pt(10)
        r.font.color.rgb = BLACK
    r2 = p.add_run(text)
    r2.font.size = Pt(10)
    r2.font.color.rgb = BLACK
    return p

def code_block(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after  = Pt(6)
    p.paragraph_format.left_indent  = Inches(0.25)
    p.paragraph_format.right_indent = Inches(0.25)
    paragraph_bg(p, LIGHT_GREY)
    run = p.add_run(text)
    run.font.name = 'Courier New'
    run.font.size = Pt(9)
    run.font.color.rgb = TEAL
    return p

def label_value(label, value, label_colour=TEAL):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r1 = p.add_run(label + ': ')
    r1.bold = True
    r1.font.size = Pt(10)
    r1.font.color.rgb = label_colour
    r2 = p.add_run(value)
    r2.font.size = Pt(10)
    r2.font.color.rgb = BLACK
    return p

def simple_table(headers, rows, hdr_bg=NAVY, hdr_fg=WHITE, alt_bg=LIGHT_GREY):
    cols = len(headers)
    t = doc.add_table(rows=1 + len(rows), cols=cols)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.LEFT

    # header row
    hdr_row = t.rows[0]
    for i, h in enumerate(headers):
        cell = hdr_row.cells[i]
        set_cell_bg(cell, hdr_bg)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = p.add_run(h)
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = hdr_fg

    # data rows
    for ri, row in enumerate(rows):
        tr = t.rows[ri + 1]
        bg = alt_bg if ri % 2 == 0 else WHITE
        for ci, cell_text in enumerate(row):
            cell = tr.cells[ci]
            set_cell_bg(cell, bg)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(str(cell_text))
            run.font.size = Pt(9)
            run.font.color.rgb = BLACK

    doc.add_paragraph()
    return t

def callout(text, colour=GOLD):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after  = Pt(8)
    p.paragraph_format.left_indent  = Inches(0.3)
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  rgb_hex(colour))
    pPr.append(shd)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(9)
    run.font.color.rgb = BLACK
    return p

def agent_banner(name, tagline, colour):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    cell = t.rows[0].cells[0]
    set_cell_bg(cell, colour)
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r1 = p.add_run(name + '  ')
    r1.bold = True
    r1.font.size = Pt(14)
    r1.font.color.rgb = WHITE
    r2 = p.add_run(tagline)
    r2.font.size = Pt(10)
    r2.font.color.rgb = RGBColor(0xDD, 0xDD, 0xFF)
    doc.add_paragraph()

def page_break():
    doc.add_page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  COVER
# ═══════════════════════════════════════════════════════════════════════════════
# Title block via a 1-col table
t = doc.add_table(rows=1, cols=1)
cell = t.rows[0].cells[0]
set_cell_bg(cell, NAVY)
p = cell.paragraphs[0]
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(24)
p.paragraph_format.space_after  = Pt(8)
r = p.add_run('NanoClaw v2')
r.bold = True
r.font.size = Pt(28)
r.font.color.rgb = WHITE

p2 = cell.add_paragraph()
p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
p2.paragraph_format.space_after = Pt(6)
r2 = p2.add_run('Architecture & Agent Reference')
r2.font.size = Pt(14)
r2.font.color.rgb = GOLD

p3 = cell.add_paragraph()
p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
p3.paragraph_format.space_after = Pt(20)
r3 = p3.add_run('Lumière  ·  Verne  ·  Infrastructure')
r3.font.size = Pt(11)
r3.font.color.rgb = MID_GREY

doc.add_paragraph()

# Agent identity row
t2 = doc.add_table(rows=1, cols=2)
t2.alignment = WD_TABLE_ALIGNMENT.CENTER

cl = t2.rows[0].cells[0]
set_cell_bg(cl, LUMIERE)
pl = cl.paragraphs[0]
pl.alignment = WD_ALIGN_PARAGRAPH.CENTER
pl.paragraph_format.space_before = Pt(10)
pl.paragraph_format.space_after  = Pt(10)
r = pl.add_run('✦  LUMIÈRE')
r.bold = True
r.font.size = Pt(13)
r.font.color.rgb = WHITE
pl.add_run('\n')
r2 = pl.add_run('Personal logistics · daily rhythm')
r2.font.size = Pt(9)
r2.font.color.rgb = RGBColor(0xCC, 0xCC, 0xFF)

cv = t2.rows[0].cells[1]
set_cell_bg(cv, VERNE)
pv = cv.paragraphs[0]
pv.alignment = WD_ALIGN_PARAGRAPH.CENTER
pv.paragraph_format.space_before = Pt(10)
pv.paragraph_format.space_after  = Pt(10)
r = pv.add_run('◆  VERNE')
r.bold = True
r.font.size = Pt(13)
r.font.color.rgb = WHITE
pv.add_run('\n')
r2 = pv.add_run('Business strategy · task management')
r2.font.size = Pt(9)
r2.font.color.rgb = RGBColor(0xBB, 0xE8, 0xFF)

doc.add_paragraph()
p_date = doc.add_paragraph()
p_date.alignment = WD_ALIGN_PARAGRAPH.RIGHT
r_date = p_date.add_run('June 2026  |  GCE asia-southeast1-b  |  Gemini 3.5 Flash')
r_date.font.size = Pt(9)
r_date.font.color.rgb = DARK_GREY

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  1. PRODUCT OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════════
heading1('1. Product Overview')

body(
    'NanoClaw v2 is a self-hosted personal AI agent platform. A single Node.js host '
    'process orchestrates per-session agent containers on Google Cloud (GCE). '
    'Platform messages arrive via channel adapters (WhatsApp Baileys, Telegram), '
    'route through an entity model, and wake isolated Docker containers running '
    'Bun + the Claude Agent SDK. All IO between host and container passes through '
    'SQLite session databases — no IPC, no stdin piping, no shared memory.'
)

heading2('1.1  System Purpose')
bullet('Always-on agents even when user\'s laptop is off (hosted on GCE VM)')
bullet('Multi-platform: WhatsApp (Baileys) + Telegram, with per-agent channel assignments')
bullet('Scheduled autonomous tasks: morning briefings, reminders, follow-ups')
bullet('Full agent memory via mnemon knowledge graph (persisted across sessions)')
bullet('Credential-safe: API keys injected at runtime via OneCLI vault (optional)')

heading2('1.2  Tech Stack')
simple_table(
    ['Layer', 'Technology', 'Version / Notes'],
    [
        ['Host runtime',       'Node.js',                  'v22.23 — pnpm workspace'],
        ['Agent runtime',      'Bun',                      'Latest — inside Docker container'],
        ['AI provider',        'Google Gemini (Vertex AI)', 'gemini-3.5-flash via @google/genai'],
        ['Orchestration',      'Docker Engine',            '29.6.0 on GCE VM'],
        ['Session storage',    'SQLite (better-sqlite3)',  'Two-DB split per session'],
        ['WhatsApp',           'Baileys (WA Multi-Device)', '@whiskeysockets/baileys'],
        ['Telegram',           'Telegram Bot API',         'Long-poll + webhook mode'],
        ['Cloud platform',     'Google Cloud (GCE)',       'e2-small, asia-southeast1-b'],
        ['Agent memory',       'mnemon knowledge graph',   'Persisted per agent-group'],
        ['Language (host)',    'TypeScript',               'Compiled to dist/ by tsc'],
        ['Language (agent)',   'TypeScript',               'Run directly by Bun (no compile step)'],
        ['Service manager',    'systemd',                  'nanoclaw.service on Linux VM'],
    ]
)

heading2('1.3  Agents at a Glance')
simple_table(
    ['Property', 'Lumière', 'Verne'],
    [
        ['Role',              'Personal logistics & daily rhythm',   'Business strategy & task management'],
        ['Named after',       'Lumière brothers (cinema)',           'Jules Verne (author)'],
        ['Primary channel',   'WhatsApp (+6586574113)',              'Telegram + WhatsApp'],
        ['AI model',          'gemini-3.5-flash (Vertex AI)',        'gemini-3.5-flash (Vertex AI)'],
        ['Provider',          'gemini',                              'gemini'],
        ['Group folder',      'groups/lumiere/',                     'groups/dm-with-np/'],
        ['Agent group ID',    'ag-1781462268671-rn13pt',             'ag-1780827517764-1vwzco'],
        ['Session mode',      'Shared session per messaging group',  'Shared session per messaging group'],
        ['Scheduled tasks',   '07:30 IST daily morning briefing',   'None (reactive)'],
        ['Skills',            'all (includes WhatsApp formatting)',  'all'],
        ['Memory',            'Shared mnemon graph with Verne',      'Shared mnemon graph with Lumière'],
    ]
)

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  2. HIGH-LEVEL ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════════
heading1('2. High-Level Architecture')

heading2('2.1  Five-Layer Data Flow')
body(
    'A message travels through five logical layers before the agent produces a reply. '
    'Each layer is isolated — failure in one does not corrupt others.'
)

simple_table(
    ['Layer', 'Component', 'What happens'],
    [
        ['1 · Ingestion',    'Channel adapters\n(WhatsApp / Telegram)',
         'Raw platform event → normalised NanoClaw message. '
         'Allowlist checked. Unknown senders handled per messaging-group policy.'],
        ['2 · Routing',      'src/router.ts',
         'Message → messaging group → agent group → session lookup/create. '
         'Writes to inbound.db (messages_in table). Calls wakeContainer().'],
        ['3 · Container',    'Docker (nanoclaw-agent-v2-fda71831:latest)',
         'Bun process: polls inbound.db, calls Gemini API, executes MCP tools, '
         'writes response to outbound.db.'],
        ['4 · Delivery',     'src/delivery.ts',
         'Polls outbound.db every ~1s. Delivers messages_out via the originating '
         'channel adapter. Handles system actions (schedule_task, cli_request).'],
        ['5 · Persistence',  'SQLite + mnemon',
         'Session DBs for in-flight state. mnemon graph for long-term agent memory. '
         'Central v2.db for users, groups, wirings, roles.'],
    ]
)

heading2('2.2  Two-DB Session Split')
body(
    'Every session has exactly TWO SQLite files under '
    'data/v2-sessions/<session_id>/. This eliminates cross-mount lock contention '
    'because each file has exactly one writer.'
)
simple_table(
    ['File', 'Writer', 'Reader', 'Key tables'],
    [
        ['inbound.db',  'Host (Node)',      'Container (Bun)',
         'messages_in, destinations, session_routing, processing_ack'],
        ['outbound.db', 'Container (Bun)', 'Host (Node)',
         'messages_out, session_state'],
    ]
)
callout(
    '⚑  Heartbeat: the container touches /workspace/.heartbeat every ~30 s. '
    'Host sweep detects stale containers by comparing mtime. '
    'No DB write is needed for heartbeat — avoids WAL contention.'
)

heading2('2.3  Entity Model (Central DB)')
code_block(
    'users          (id "<channel>:<handle>", kind, display_name)\n'
    'user_roles     (user_id, role, agent_group_id)    — owner | admin\n'
    'agent_groups   (workspace, memory, CLAUDE.md, personality, container config)\n'
    'messaging_groups (one chat/channel on one platform; unknown_sender_policy)\n'
    'messaging_group_agents (session_mode, trigger_rules, priority)\n'
    'sessions       (agent_group_id + messaging_group_id + thread_id → container)\n'
    'container_configs  (per-group: provider, model, packages, MCP servers, mounts)'
)

heading2('2.4  Container Spawn Flow')
body('When a message arrives and no container is running for that session:')
for step, desc in [
    ('1', 'router.ts writes message to inbound.db, calls wakeContainer(session)'),
    ('2', 'container-runner.ts calls materializeContainerJson() — writes fresh container.json from DB'),
    ('3', 'buildMounts() assembles all volume mounts (session dir, group dir, agent-runner src, skills)'),
    ('4', 'buildContainerArgs() constructs the docker run command (env vars, GCP creds, user mapping)'),
    ('5', 'spawn("docker", args) starts the container; stderr piped to host log at DEBUG level'),
    ('6', 'Container Bun process starts, reads container.json, polls inbound.db, calls Gemini'),
    ('7', 'Agent writes responses to outbound.db; delivery.ts delivers via adapter'),
    ('8', 'Container exits when idle timeout reached or explicit shutdown; heartbeat stops'),
]:
    bullet(desc, bold_prefix=f'Step {step}: ')

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  3. AGENT DEEP-DIVES
# ═══════════════════════════════════════════════════════════════════════════════
heading1('3. Agent Deep-Dives')

# ── 3.1 Lumière ──────────────────────────────────────────────────────────────
agent_banner('✦  LUMIÈRE', '— Personal Logistics & Daily Rhythm', LUMIERE)

heading2('3.1  Identity & Personality', colour=LUMIERE)
label_value('Full name',   'Lumière (he/him)', LUMIERE)
label_value('Named after', 'The Lumière brothers — inventors who brought everyday life into the light')
label_value('Role',        'Nivedita\'s personal EA: logistics, daily rhythm, travel, personal admin')
label_value('Tone',        'Warm but not soft. Organised without being rigid. Steady when she\'s stressed')
label_value('Counterpart', 'Shares mnemon knowledge graph with Verne. No re-explaining needed across agents')

heading2('3.2  Channel & Scheduling', colour=LUMIERE)
label_value('Primary channel',  'WhatsApp — platform ID 6586574113@s.whatsapp.net')
label_value('Trigger mode',     'mention (responds to Lumière\'s number in WhatsApp DM)')
label_value('Scheduled task',   'Morning briefing — cron 30 7 * * * (07:30 IST daily)')
label_value('Task series ID',   'task-lumiere-morning-1781465221117')
label_value('Next scheduled',   '2026-06-21 02:00 UTC = 07:30 IST')

heading2('3.3  Morning Briefing', colour=LUMIERE)
body('Every morning Lumière autonomously:')
bullet('Scans 15+ AI news sources across US / Europe+UK / Asia+ME / India using agent-browser')
bullet('Checks Gmail for overnight emails (once Gmail OAuth scopes are activated)')
bullet('Checks mnemon for flagged items and pending to-dos')
bullet('Composes a < 300-word WhatsApp briefing and sends via np-whatsapp-sg destination')
bullet('Sends the same content as email to nivedita.pandey.wg15@gmail.com with a French sign-off')
bullet('Creates the next day\'s task via schedule_task (recurrence series)')

heading3('Briefing Template')
code_block(
    '🧭 Lumière — [Day, Date]\n\n'
    '📬 OVERNIGHT\n'
    '[Email summary]\n\n'
    '🎯 TODAY\n'
    '• [Priority 1]\n'
    '• [Priority 2]\n\n'
    '📅 CALENDAR\n'
    '[Commitments]\n\n'
    '🇺🇸 AI — US     🇪🇺 AI — EUROPE+UK\n'
    '🌏 AI — ASIA+ME  🇮🇳 AI — INDIA\n'
    '[5 bullet stories per region]\n\n'
    '⏰ FLAGS\n'
    '[Time-sensitive items]'
)

heading2('3.4  Focus Areas', colour=LUMIERE)
simple_table(
    ['Area', 'Details'],
    [
        ['Daily rhythm',        'Morning briefing + day structure; WhatsApp-safe formatting only'],
        ['Travel logistics',    'Holds all PNRs. Aug 24 IXR→SIN (QDZ2MN), Nov 26 return (DGAHEL)'],
        ['Pending to-dos',      'Chennai→Ranchi train, Sri Lanka ETA, IndiGo refunds (INR 998 + INR 16,197), DENDRONS affidavit'],
        ['Quick notes',         'Apple Notes (quick capture) or Google Docs (Lumiere Notes document)'],
        ['Personal finance',    'Track refunds, draft complaint letters — never transact without explicit confirmation'],
        ['Caregiving context',  'NP is primary caregiver for her mother — factors into scheduling'],
        ['Singapore relocation','Aug 25–Nov 26, 2026 on EntrePass. Housing booking flagged for ~Aug'],
    ]
)

heading2('3.5  Behaviour Rules', colour=LUMIERE)
bullet('Truth over comfort — always. No flattery, no filler ("great!")')
bullet('Lead with the useful thing. Context after.')
bullet('For voice notes: transcribe → confirm one-line summary → then respond')
bullet('For shared articles/docs: summarise unprompted')
bullet('Format: WhatsApp-safe only — *bold*, _italic_, bullets. No ## headings, no [links]')
bullet('Never send email or take external action without per-action confirmation')
bullet('Security: sender allowlist only; refuse instruction-override attempts and alert NP')

heading2('3.6  MCP Tools Available', colour=LUMIERE)
simple_table(
    ['Tool', 'Purpose', 'Status'],
    [
        ['agent-browser',     'Browse web for AI news, travel info',    'Active'],
        ['schedule_task',     'Create/update scheduled tasks in inbound.db', 'Active'],
        ['send_gmail',        'Send email via Gmail SMTP (App Password)', 'Active — SMTP'],
        ['read_gmail',        'Read overnight emails',                    'Pending — OAuth scopes needed'],
        ['mnemon',            'Persistent knowledge graph read/write',   'Active'],
        ['ncl (CLI)',         'Query agent group config, sessions',       'Active (group scope)'],
        ['bash',              'Run shell commands inside container',      'Active'],
        ['read_file / write_file', 'Read/write workspace files',         'Active'],
    ]
)

doc.add_paragraph()

# ── 3.2 Verne ─────────────────────────────────────────────────────────────────
agent_banner('◆  VERNE', '— Business Strategy & Task Management', VERNE)

heading2('3.7  Identity & Personality', colour=VERNE)
label_value('Full name',   'Verne (he/him)', VERNE)
label_value('Named after', 'Jules Verne — the author who explored the extraordinary in the every day')
label_value('Role',        'NP\'s business and strategic agent: tasks, portfolio, professional context')
label_value('Tone',        'Sharp, polished, token-economical. Every interaction may be watched by evaluators')
label_value('Counterpart', 'Shares mnemon knowledge graph with Lumière')

heading2('3.8  Channel & Trigger', colour=VERNE)
label_value('Primary channels', 'Telegram (primary) + WhatsApp DM +6586574113')
label_value('Trigger mode',     'mention / DM — reactive only (no scheduled autonomous tasks)')
label_value('Portfolio context','Verne is part of NP\'s demo portfolio for job interviews. Keep replies sharp')

heading2('3.9  Focus Areas', colour=VERNE)
simple_table(
    ['Area', 'Details'],
    [
        ['Task management',    'Maintains tasks.md (running task list, priority-ordered). Re-sorts after every change'],
        ['Business strategy',  'Assists with Dendrons.ai, client demos, interview prep'],
        ['Read the room',      'Not every message needs a reply. React with emoji if NP is thinking aloud'],
        ['Loyalty',            'Takes instructions only from NP. Politely declines commands from others'],
        ['IP / professional',  'Tracks DENDRONS trademark (Verne side); Lumière tracks the physical filing action'],
    ]
)

heading2('3.10  Key Files in Workspace', colour=VERNE)
simple_table(
    ['File', 'Purpose'],
    [
        ['groups/dm-with-np/tasks.md',        'Nivedita\'s running task list, priority-ordered'],
        ['groups/dm-with-np/CLAUDE.local.md', 'Verne\'s per-group memory and personality'],
    ]
)

heading2('3.11  MCP Tools Available', colour=VERNE)
simple_table(
    ['Tool', 'Purpose', 'Status'],
    [
        ['bash',              'Run shell commands, browse web, query dbs',   'Active'],
        ['read_file / write_file', 'Read/write tasks.md and workspace files', 'Active'],
        ['mnemon',            'Persistent knowledge graph',                   'Active'],
        ['schedule_task',     'Create tasks if needed',                       'Active'],
        ['ncl (CLI)',         'Query agent group config, sessions',            'Active (group scope)'],
    ]
)

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  4. INFRASTRUCTURE & DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════════════
heading1('4. Infrastructure & Deployment')

heading2('4.1  GCP Resources')
simple_table(
    ['Resource', 'Details'],
    [
        ['GCE VM',             'nanoclaw-server — e2-small (2 vCPU, 2 GB RAM + 4 GB swap)'],
        ['Zone',               'asia-southeast1-b (Singapore)'],
        ['GCP Project',        'dendrons-steward'],
        ['OS',                 'Ubuntu (latest LTS)'],
        ['Disk',               '30 GB boot disk — 14 GB used, 16 GB free'],
        ['Service Account',    '687313251174-compute@developer.gserviceaccount.com'],
        ['SA Role',            'roles/aiplatform.user on dendrons-steward'],
        ['Vertex AI API',      'aiplatform.googleapis.com — enabled on dendrons-steward'],
        ['GCP Credits',        'Valid through October 2026 (first-party credits)'],
        ['Network',            'Default VPC; no external load balancer — webhook port 3080'],
    ]
)

heading2('4.2  VM File Layout')
code_block(
    '/home/nivedita_dendrons_ai/\n'
    '├── dist/              # Compiled host JS (tsc output from src/)\n'
    '├── container/         # Agent-runner source + Dockerfile + skills\n'
    '│   ├── agent-runner/src/   # Bun agent-runner (mounted read-only into containers)\n'
    '│   ├── skills/            # Container skills (onecli-gateway, welcome, etc.)\n'
    '│   └── Dockerfile\n'
    '├── groups/            # Per-agent-group filesystems\n'
    '│   ├── lumiere/       # Lumière workspace + CLAUDE.md + container.json\n'
    '│   └── dm-with-np/    # Verne workspace + CLAUDE.md + container.json\n'
    '├── data/\n'
    '│   ├── v2.db          # Central SQLite DB\n'
    '│   └── v2-sessions/   # Per-session inbound.db + outbound.db\n'
    '├── store/auth/        # WhatsApp Baileys session (paired device auth)\n'
    '├── logs/              # nanoclaw.log + nanoclaw.error.log\n'
    '└── .env               # Runtime env vars (no credentials)\n'
)

heading2('4.3  Environment Variables (.env)')
simple_table(
    ['Variable', 'Value / Purpose'],
    [
        ['TZ',                      'Asia/Calcutta — host timezone for cron scheduling'],
        ['ASSISTANT_HAS_OWN_NUMBER','true — WhatsApp is NanoClaw\'s own registered number'],
        ['PORT / WEBHOOK_PORT',     '3080 — webhook server port'],
        ['GOOGLE_CLOUD_PROJECT',    'dendrons-steward'],
        ['GOOGLE_CLOUD_LOCATION',   'us-central1'],
        ['TELEGRAM_BOT_TOKEN',      'Secret — Telegram bot auth'],
        ['GMAIL_USER',              'nivedita.pandey.wg15@gmail.com'],
        ['GMAIL_APP_PASSWORD',      'Secret — Gmail App Password for SMTP'],
        ['ONECLI_URL',              'Not set — OneCLI not installed on GCE (optional)'],
    ]
)

heading2('4.4  Docker Image')
label_value('Image name (VM)',   'nanoclaw-agent-v2-fda71831:latest')
label_value('Image name (laptop)','nanoclaw-agent-v2-00f808de:latest')
label_value('Architecture',      'linux/amd64 (built on laptop with --platform linux/amd64)')
label_value('Size',              '~780 MB compressed / ~3.14 GB uncompressed')
body(
    'The image name includes an install slug derived from sha1(cwd)[:8]. '
    'The laptop CWD is /Users/niveditapandey/nanoclaw → slug 00f808de. '
    'The VM CWD is /home/nivedita_dendrons_ai → slug fda71831. '
    'After transferring the image to the VM, it must be retagged to match the VM slug.'
)
code_block('docker tag nanoclaw-agent-v2-00f808de:latest nanoclaw-agent-v2-fda71831:latest')

heading2('4.5  Container Volume Mounts (per spawn)')
simple_table(
    ['Host Path', 'Container Path', 'Mode'],
    [
        ['data/v2-sessions/<ag>/<sess>/',          '/workspace',                    'RW'],
        ['groups/<folder>/',                        '/workspace/agent',              'RW'],
        ['groups/<folder>/container.json',          '/workspace/agent/container.json','RO'],
        ['groups/<folder>/CLAUDE.md',               '/workspace/agent/CLAUDE.md',   'RO'],
        ['groups/<folder>/.claude-fragments/',      '/workspace/agent/.claude-fragments','RO'],
        ['container/CLAUDE.md',                     '/app/CLAUDE.md',               'RO'],
        ['data/v2-sessions/<ag>/.claude-shared/',   '/home/node/.claude',           'RW'],
        ['data/v2-sessions/<ag>/.mnemon/',          '/home/node/.mnemon',           'RW'],
        ['container/agent-runner/src/',             '/app/src',                     'RO'],
        ['container/skills/',                       '/app/skills',                  'RO'],
        ['~/.config/gcloud/adc.json (if present)',  '/workspace/gcloud-adc.json',   'RO'],
    ]
)

heading2('4.6  systemd Service')
code_block(
    '[Unit]\n'
    'Description=NanoClaw Agent Service\n'
    'After=network.target docker.service\n'
    'Requires=docker.service\n\n'
    '[Service]\n'
    'Type=simple\n'
    'User=nivedita_dendrons_ai\n'
    'WorkingDirectory=/home/nivedita_dendrons_ai\n'
    'ExecStartPre=/bin/chmod 666 /var/run/docker.sock\n'
    'ExecStart=/usr/bin/node /home/nivedita_dendrons_ai/dist/index.js\n'
    'Restart=always\n'
    'RestartSec=10\n'
    'StandardOutput=append:/home/nivedita_dendrons_ai/logs/nanoclaw.log\n'
    'StandardError=append:/home/nivedita_dendrons_ai/logs/nanoclaw.error.log\n'
    'Environment=HOME=/home/nivedita_dendrons_ai\n'
    'Environment=PATH=/usr/local/bin:/usr/bin:/bin\n'
    'Environment=LOG_LEVEL=debug\n\n'
    '[Install]\n'
    'WantedBy=multi-user.target'
)

heading2('4.7  Gemini / Vertex AI Auth')
body(
    'On the GCE VM, Gemini API calls are authenticated via the VM\'s attached service account '
    '(687313251174-compute@developer.gserviceaccount.com) through the GCE metadata server. '
    'No ADC file or GOOGLE_APPLICATION_CREDENTIALS is needed — the @google/genai SDK picks up '
    'the service account automatically when running on GCE. '
    'GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are passed as env vars to each container.'
)
bullet('On laptop: ADC file (~/.config/gcloud/application_default_credentials.json) is mounted into containers')
bullet('On GCE: No ADC file — metadata server handles auth transparently')
bullet('Model: gemini-3.5-flash via Vertex AI endpoint (location: global)')

heading2('4.8  Migrate Back to Laptop (Oct 2026)')
callout(
    '⚑  GCP credits expire end of October 2026. A migration script is at '
    '~/migrate-back-to-laptop.sh on the VM. Run it FROM the laptop after credits expire.'
)
bullet('Script stops VM service, rsyncs data/groups/store/auth back to laptop')
bullet('Re-enables launchd com.nanoclaw-v2-00f808de service on laptop')
bullet('A cloud routine (trig_01Ck5TXZFCRUFyJqzKfEY1hw) fires 2026-10-28T03:30Z to remind via Google Drive')

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  5. KNOWN BUGS & FIXES
# ═══════════════════════════════════════════════════════════════════════════════
heading1('5. Known Bugs & Fixes')

bugs = [
    {
        'id': 'BUG-001',
        'title': 'Containers crash with exit code 1 — Gemini "Authentication is not set up"',
        'root': (
            'GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION were only passed to '
            'containers inside the ADC file existence check (if fs.existsSync(adcPath)). '
            'On GCE there is no ADC file, so GCP env vars were never injected. '
            '@google/genai throws "Authentication is not set up" if project is empty at construction.'
        ),
        'fix': (
            'Moved GCP env var injection outside the ADC check in src/container-runner.ts. '
            'Both vars are now always passed. ADC file mount remains conditional.'
        ),
        'file': 'src/container-runner.ts — buildContainerArgs()',
    },
    {
        'id': 'BUG-002',
        'title': 'Containers crash with exit code 125 — OneCLI 401 on GCE',
        'root': (
            'OneCLI SDK defaults to https://app.onecli.sh when ONECLI_URL is not set. '
            'onecli.ensureAgent() was called unconditionally before checking if ONECLI_URL exists, '
            'causing a 401 from the cloud OneCLI service. Docker receives a throw before '
            'spawn, logs exit code 125.'
        ),
        'fix': (
            'Wrapped both ensureAgent() and applyContainerConfig() calls inside '
            'if (ONECLI_URL) { ... } else { log.info("OneCLI not configured, skipping") }. '
            'OneCLI is now fully optional — if ONECLI_URL is not set, containers spawn without it.'
        ),
        'file': 'src/container-runner.ts — buildContainerArgs()',
    },
    {
        'id': 'BUG-003',
        'title': 'Containers exit code 125 — image name slug mismatch between laptop and VM',
        'root': (
            'Install slug is sha1(cwd)[:8]. Laptop CWD = /Users/niveditapandey/nanoclaw → 00f808de. '
            'VM CWD = /home/nivedita_dendrons_ai → fda71831. '
            'Image was transferred as nanoclaw-agent-v2-00f808de:latest but VM looks for '
            'nanoclaw-agent-v2-fda71831:latest. Docker tried to pull from Docker Hub, failed, exit 125.'
        ),
        'fix': (
            'Retagged the image on the VM:\n'
            'docker tag nanoclaw-agent-v2-00f808de:latest nanoclaw-agent-v2-fda71831:latest\n'
            'Persistent fix: set CONTAINER_IMAGE env var or retag after every image rebuild.'
        ),
        'file': 'src/install-slug.ts + src/config.ts (CONTAINER_IMAGE)',
    },
    {
        'id': 'BUG-004',
        'title': 'Docker exit code 125 — socket permission error under systemd',
        'root': (
            'nivedita_dendrons_ai was added to the docker group but systemd did not '
            'load the supplemental group for the running service process. '
            '/var/run/docker.sock was srw-rw---- (group docker) but the Node process '
            'had no effective docker group membership.'
        ),
        'fix': (
            'Added ExecStartPre=/bin/chmod 666 /var/run/docker.sock to the systemd unit. '
            'This runs as root before the service starts, making the socket world-writable. '
            'Persistent across reboots.'
        ),
        'file': '/etc/systemd/system/nanoclaw.service',
    },
    {
        'id': 'BUG-005',
        'title': 'OOM during Docker image build on VM (e2-small)',
        'root': (
            'e2-small has 2 GB RAM. pnpm install -g claude-code during container build '
            'allocates ~2-3 GB and was killed by OOM. Build failed silently.'
        ),
        'fix': (
            'Added 4 GB swap file on the VM:\n'
            'sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile\n'
            'sudo mkswap /swapfile && sudo swapon /swapfile\n'
            'Added to /etc/fstab for persistence. Build now succeeds.'
        ),
        'file': 'container/Dockerfile (pnpm global install block)',
    },
    {
        'id': 'BUG-006',
        'title': 'WhatsApp error 440 (conflict) — two instances holding the same session',
        'root': (
            'Both the laptop NanoClaw (launchd) and the VM NanoClaw (systemd) were running '
            'simultaneously with the same WhatsApp Baileys auth session. '
            'WhatsApp allows only one active connection per device registration.'
        ),
        'fix': (
            'Stopped laptop service:\n'
            'launchctl unload ~/Library/LaunchAgents/com.nanoclaw-v2-00f808de.plist\n'
            'VM took over the session cleanly. Only one host should run at a time.'
        ),
        'file': 'store/auth/ (Baileys session files)',
    },
]

for bug in bugs:
    t = doc.add_table(rows=1, cols=1)
    cell = t.rows[0].cells[0]
    set_cell_bg(cell, NAVY)
    p = cell.paragraphs[0]
    r = p.add_run(f"{bug['id']}  —  {bug['title']}")
    r.bold = True
    r.font.size = Pt(10)
    r.font.color.rgb = WHITE
    doc.add_paragraph()

    heading3('Root cause', DARK_GREY)
    body(bug['root'], indent=1)
    heading3('Fix', DARK_GREY)
    body(bug['fix'], indent=1)
    label_value('Affected file', bug['file'], DARK_GREY)
    doc.add_paragraph()

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  6. WHATSAPP SETUP
# ═══════════════════════════════════════════════════════════════════════════════
heading1('6. WhatsApp Setup & Status')

heading2('6.1  Current State')
simple_table(
    ['Item', 'Status'],
    [
        ['Baileys session',       'Active — paired and running on VM'],
        ['Lumière DM channel',    'Active — +65 8657 4113 is Lumière\'s number'],
        ['Verne WhatsApp',        'Active — same number, routed by NanoClaw wiring'],
        ['Morning briefing',      'Scheduled — next run 07:30 IST tomorrow'],
        ['Gmail OAuth (read)',     'PENDING — App Password works for send; OAuth scopes needed for read'],
    ]
)

heading2('6.2  WhatsApp Architecture')
body('NanoClaw uses Baileys (WhatsApp Web multi-device protocol) — not the official WhatsApp Cloud API.')
bullet('Auth stored in store/auth/ — transferred from laptop to VM during migration')
bullet('Session is treated as a single "device registration"; only one NanoClaw instance should run at a time')
bullet('ASSISTANT_HAS_OWN_NUMBER=true — NanoClaw owns the number, not mirroring a user phone')
bullet('Groups are discovered via metadata sync at startup (~404 groups logged)')

heading2('6.3  Pending: Gmail OAuth for Read Access')
callout(
    '⚑  Lumière currently sends email (SMTP via App Password) but cannot read Gmail. '
    'Morning briefing\'s "OVERNIGHT" section requires OAuth read access. '
    'Complete these steps to activate it.'
)
body('Steps to enable Gmail read:')
bullet('Go to Google Cloud Console → dendrons-steward project → APIs & Services → Credentials')
bullet('Create OAuth 2.0 Client ID (Desktop App type) and download the JSON')
bullet('Run the OAuth consent flow once to generate a refresh token')
bullet('Store the refresh token securely (OneCLI vault or .env on VM)')
bullet('Wire the refresh token to the read_gmail MCP tool in container/agent-runner/src/mcp-tools/gmail.ts')
bullet('Test by asking Lumière: "What emails did I get overnight?"')

heading2('6.4  WhatsApp Message Flow')
code_block(
    'WhatsApp (user phone) → Baileys on VM\n'
    '    → src/channels/whatsapp.ts (normalise message)\n'
    '    → src/router.ts (messaging group → agent group → session)\n'
    '    → inbound.db  →  Container (Bun + Gemini)\n'
    '    → outbound.db →  src/delivery.ts\n'
    '    → Baileys send → WhatsApp (user phone)'
)

heading2('6.5  Telegram Setup')
body('Telegram is fully active. Verne is the primary Telegram agent.')
bullet('Bot token stored in TELEGRAM_BOT_TOKEN env var on VM')
bullet('Long-poll mode + webhook registered at /webhook/telegram (port 3080)')
bullet('Verne responds to DMs on Telegram; same session as WhatsApp (shared session mode)')

page_break()

# ═══════════════════════════════════════════════════════════════════════════════
#  7. OPERATIONS RUNBOOK
# ═══════════════════════════════════════════════════════════════════════════════
heading1('7. Operations Runbook')

heading2('7.1  Common Commands')
simple_table(
    ['Task', 'Command'],
    [
        ['SSH to VM',               'gcloud compute ssh nanoclaw-server --zone=asia-southeast1-b --project=dendrons-steward'],
        ['View live host log',       'tail -f ~/logs/nanoclaw.log'],
        ['View error log',           'tail -f ~/logs/nanoclaw.error.log'],
        ['Restart service',          'sudo systemctl restart nanoclaw'],
        ['Check service status',     'sudo systemctl status nanoclaw'],
        ['List running containers',  'docker ps'],
        ['Check Docker images',      'docker images'],
        ['Rebuild agent image',      'cd ~/; ./container/build.sh'],
        ['Query central DB',         'node scripts/q.ts data/v2.db "SELECT ..."'],
        ['Retag image after rebuild','docker tag nanoclaw-agent-v2-00f808de:latest nanoclaw-agent-v2-fda71831:latest'],
    ]
)

heading2('7.2  Troubleshooting Checklist')
for check, action in [
    ('Agent not responding',           'Check ~/logs/nanoclaw.error.log for wakeContainer errors'),
    ('Container exits code 125',       'Check docker.sock permissions: ls -la /var/run/docker.sock (should be 666)'),
    ('Container exits code 125 (alt)', 'Verify image tag: docker images | grep fda71831'),
    ('Container exits code 1',         'Check nanoclaw.log for DEBUG lines from container (Gemini auth, missing files)'),
    ('WhatsApp not receiving',         'Check store/auth/ exists; check Baileys logs for error 440 (conflict)'),
    ('Scheduled task not firing',      'Query inbound.db: SELECT * FROM messages_in WHERE status="pending"'),
    ('Gemini API errors',              'Verify: gcloud auth print-access-token (VM metadata server must be reachable)'),
    ('OOM during build',               'Check swap: free -h (should show 4 GB swap)'),
]:
    bullet(action, bold_prefix=f'{check}: ')

heading2('7.3  Log Locations')
simple_table(
    ['Log', 'Path', 'Content'],
    [
        ['Host log',    '~/logs/nanoclaw.log',       'All INFO + DEBUG events: routing, spawn, delivery, agent debug output'],
        ['Error log',   '~/logs/nanoclaw.error.log', 'WARN + ERROR: wakeContainer failures, OneCLI errors, crashes'],
        ['Container',   'Captured in host log',       'Container stdout/stderr piped to host at DEBUG level'],
        ['systemd',     'journalctl -u nanoclaw',     'Service start/stop events and early crashes before logging starts'],
    ]
)

heading2('7.4  Key File Paths Summary')
simple_table(
    ['Purpose', 'Path'],
    [
        ['NanoClaw root',         '/home/nivedita_dendrons_ai/'],
        ['systemd unit',          '/etc/systemd/system/nanoclaw.service'],
        ['Central DB',            '/home/nivedita_dendrons_ai/data/v2.db'],
        ['Lumière session',       'data/v2-sessions/ag-1781462268671-rn13pt/sess-.../'],
        ['Verne session',         'data/v2-sessions/ag-1780827517764-1vwzco/sess-.../'],
        ['Lumière group',         '/home/nivedita_dendrons_ai/groups/lumiere/'],
        ['Verne group',           '/home/nivedita_dendrons_ai/groups/dm-with-np/'],
        ['WhatsApp auth',         '/home/nivedita_dendrons_ai/store/auth/'],
        ['Agent-runner source',   '/home/nivedita_dendrons_ai/container/agent-runner/src/'],
        ['Migration script',      '/home/nivedita_dendrons_ai/migrate-back-to-laptop.sh'],
    ]
)

# ── Save ───────────────────────────────────────────────────────────────────────
out = '/Users/niveditapandey/nanoclaw/NanoClaw-Architecture.docx'
doc.save(out)
print(f'Saved: {out}')

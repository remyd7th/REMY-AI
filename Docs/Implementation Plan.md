# Remy AI — Implementation Plan

Source of truth: `Docs/Remy AI.md` (PRD) + `README.md`
Current state: PRD phase, no code. Repo: https://github.com/remyd7th/REMY-AI
Guiding principle: **organize, assist, suggest, execute — user stays in control.**
Guiding question: "What needs my attention, and how can you help me get it done?"

---

## Phase 0 — Scope Lock (Week 1)

Goal: freeze MVP, avoid scope creep from PRD §20-21.

**In scope (MVP):**
1. AI Chat, 2. Tasks, 3. Calendar/Scheduling, 4. Email assist, 5. Docs assist,
6. Follow-ups, 7. Dashboard, 8. Permissions, 9. Preferences/Memory

**Explicitly out of MVP:** payments/expenses, team management, advanced automation, CRM (PRD §21 → Phase 10).

Deliverables:
- Frozen user stories per MVP feature with acceptance criteria
- Success metrics from PRD §22 (missed deadlines, missed follow-ups, time saved, context switches)
- Prototype user journeys: Morning briefing → Day execution → End-of-day progress (PRD §18)

Exit: MVP story list signed off.

---

## Phase 1 — Design System & UX (Weeks 2-3)

Goal: Remy feels professional, calm, organized, proactive — not robotic/bossy (PRD §19).

**1.1 Brand tokens**
- Colors: neutral base (slate/white) + 1 primary (e.g. deep teal #0F766E) + amber for needs-attention, red only for overdue. Dark-mode ready.
- Type: Inter / system stack. Scale: 12/14/16/20/24/32. Mono for timestamps.
- Spacing/radius: 4pt grid, 8-12px radius cards, 1px borders.
- Voice: concise, clear, action-first. E.g. "2 overdue, 1 blocks tomorrow's meeting. Reorganize?" not paragraphs.

**1.2 IA / Navigation**
- Left nav: Today, Chat, Tasks, Calendar, Inbox (email), Docs, Follow-ups, [Workspaces switcher]
- Top: workspace switcher (My Work / Sarah-CEO / John-Client / Team per PRD §14) + permission badge (what Remy can do alone)
- Right rail (contextual): selected task/email/meeting detail + Remy suggestion + Approve/Deny

**1.3 Core screens (Figma first)**
1. Today Dashboard: priority tasks, meetings, important emails, overdue follow-ups, docs needing attention, progress (PRD §13)
2. Chat: streamed responses, suggested actions as chips [Create checklist] [Draft follow-up] [Show options], inline approval cards (Draft → Approve → Send)
3. Tasks list + board, Calendar week view with conflict highlighting, Email triage (Important/Needs reply/Summarized), Doc viewer with summary pane
4. Permissions center + Memory editor (view/edit/remove preferences per PRD §15-16)

**1.4 Component library**
- Build in code as: Button, Input, Card, Badge, Avatar, Modal, ApprovalCard, SuggestionChip, EmptyState, Skeleton, Toast
- Use Tailwind + shadcn/ui as base, do not hand-roll.
- Accessibility: keyboard nav, focus states, ARIA for chat stream, contrast AA.

Exit: Figma prototype covering Morning/Day/End-of-day flows + token sheet.

---

## Phase 2 — Architecture Decisions

Locked MVP stack (per user decisions — local-first, no Supabase, no Vercel):

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui. PWA for mobile reminders. Runs locally via `pnpm dev` / Docker.
- **Backend:** Single API: NestJS (Node) OR FastAPI (Python) — still to pick. Recommendation: NestJS if team is JS-heavy, FastAPI if AI-heavy. Expose REST + SSE for chat streaming. Runs locally in Docker alongside web.
- **DB (local Postgres — pick one):**
  - Recommended: Docker `pgvector/pgvector:pg16` image — gives you Postgres 16 + pgvector (needed for memory/doc retrieval) in one container, no install hassle, easy backup via volume.
  - Alternative without Docker: direct install from postgresql.org + `CREATE EXTENSION vector;` + pgAdmin for GUI.
  - ORM: Prisma/Drizzle. Redis (Docker `redis:7`, BullMQ) for reminders, follow-up checks, email sync jobs.
- **Files:** Cloudflare R2 (S3-compatible) for docs. Use AWS SDK v3 with R2 endpoint + API tokens. Local dev still hits R2 (no local emulator needed); presigned URLs for upload/download.
- **Auth:** Better Auth (self-hosted, Postgres-backed) + OAuth (Google/Microsoft) from day 1 — needed for calendar/email integrations. No Clerk/Auth.js, no Supabase Auth.
- **AI layer:** LLM provider-agnostic gateway (OpenAI-compatible interface). Function-calling/tools for: createTask, scheduleMeeting, draftEmail, summarizeDoc, suggestFollowUp. Vector store = pgvector in local Postgres for memory + doc retrieval. No training/fine-tune in MVP.
- **Voice:** Web Speech API first, Whisper + TTS later.
- **Hosting (for now): local device only.** Docker Compose: `web + api + postgres + redis`. No Vercel, no Supabase, no cloud DB. Cloud deploy deferred to post-MVP.
- **Monorepo:** `apps/web`, `apps/api`, `packages/ui`, `packages/types`, `packages/prompts`

Key decisions still to lock:
1. Backend language (NestJS vs FastAPI)
2. Local run shape (plain `pnpm dev` vs Docker Compose — recommend Compose so Postgres+Redis start together)
3. LLM provider + cost guardrails
4. Google/Microsoft OAuth scopes (least privilege)
5. Multi-tenancy: `workspaceId` on every row (user / executive / client / team)

Non-negotiables:
- Every AI side-effect goes through Permission Gate (see Phase 4)
- Every row scoped by `workspaceId + userId`
- Audit log for all sends/schedules/shares

Exit: ADR docs (1 page per decision) in `Docs/ADR/`.

---

## Phase 3 — Data Model & API Contracts (Week 4)

Core tables (all with `id, workspaceId, userId, createdAt, updatedAt`):

- `workspaces(id, type: personal|executive|client|team, name, prefsJson)`
- `tasks(id, title, status, priority, dueAt, recurrence, parentId, assignee, source: chat|manual|remy)`
- `events(id, title, startsAt, endsAt, attendees, location, status, externalId)`
- `emails(id, externalId, threadId, from, subject, snippet, bodyRef, importance, needsReply, status)`
- `documents(id, title, type, storageKey, summary, extractedJson)`
- `followups(id, kind: email|meeting|doc|payment|task, refId, dueAt, status, lastNudgedAt)`
- `memories(id, scope: global|workspace, key, value, updatedBy)`
- `permissions(id, scope, action: sendEmail|schedule|shareDoc|payment, level: always|ask|never)`
- `approvals(id, action, payloadJson, status: pending|approved|denied|executed, requestedBy: remy|user)`
- `audit_log(id, actor, action, target, result)`

API sketch:
- `POST /chat` (stream) → {reply, suggestedActions[], pendingApproval?}
- `CRUD /tasks`, `/events`, `/followups`, `/documents`, `/memories`, `/permissions`
- `POST /approvals/:id/approve|deny`
- `GET /today` → aggregated dashboard payload (tasks, meetings, emails, follow-ups, docs, progress)

Exit: Prisma schema + OpenAPI for above.

---

## Phase 4 — Core Platform (Weeks 5-6) — build first

Order matters. Build in this order:

1. Auth + Workspaces with Better Auth (Postgres-backed, local DB) — switch without losing context, PRD §14
2. Permission Gate middleware: `always → execute + log`, `ask → create approval + notify`, `never → block`. UI ApprovalCard. No feature ships without this.
3. Memory/Preferences CRUD + per-workspace override (PRD §15)
4. `GET /today` aggregator + Daily/Weekly progress calculators (PRD §13)
5. Background workers: reminder scheduler, overdue detector, unanswered-email detector (powers Proactive engine)

Exit: user can switch workspaces, set "ask before sending", save "meetings after 10am", see Today feed with stub data.

---

## Phase 5 — Feature Build (Weeks 7-12)

Build thin vertical slices, each: UI → API → AI tool → permission check → audit.

1. **Chat Assistant:** streaming chat, tool router, chips for actions. Acceptance: "organize my tasks for tomorrow" creates/ reprioritizes with approval.
2. **Tasks:** CRUD, subtasks, recurrence, priority, overdue highlighting, suggest-reorganize prompt (PRD §6).
3. **Calendar:** create/reschedule/cancel, conflict detect, suggest-times ("45-min with Sarah next week"), agenda prep checklist.
4. **Email:** list + importance scoring (rules first, ML later), summarize, draft/rewrite/tone adjust, unanswered tracker → draft follow-up.
5. **Docs:** upload/list/search, summarize, extract key points, notes → polished doc, compare v1/v2.
6. **Follow-ups:** unified inbox of outstanding items across email/meeting/doc/task + nudges + one-click draft.
7. **Dashboard:** Today + Week views + insights ("follow-ups unresolved") — answers "what needs attention?"

Each slice demoed via PRD §18 journeys.

---

## Phase 6 — Proactive Engine (Week 13)

Rule-based first, no magic:
- Triggers: meeting in <24h with no prep task; proposal sent +3d no reply; overdue tasks ≥2; payment/event conflict.
- Pattern: Notice → Suggest → User decides (PRD §17). Never auto-send if permission=ask.
- Digest jobs: morning briefing (06:00 user tz), end-of-day progress.
- Kill-switch: mute proactivity per workspace + global quiet hours.

Exit: 4 triggers live with Approve/Dismiss telemetry.

---

## Phase 7 — Integrations (Weeks 10-14, parallel)

- Calendar: Google Calendar + Microsoft Graph (read free/busy, create/update/delete, webhooks)
- Email: Gmail + Outlook (read, send via approval, thread tracking). Store minimal body, encrypt tokens.
- Storage: Cloudflare R2 as primary doc store (S3-compatible SDK, presigned URLs). Drive/Dropbox import deferred to post-MVP.
- Notifications: email + push + in-app. Timezone-aware.
- Voice: STT button in chat → text intent (full duplex later).

Security: OAuth least-privilege, token rotation, per-workspace disconnect.

---

## Phase 8 — Quality, Security, Privacy (continuous + Week 14 hardening)

- Tests: Vitest/Jest unit (permission gate, schedulers), Playwright e2e for Morning→EOD journey, LLM eval set (20 golden prompts, tone + tool-correctness).
- Security: app-level workspace scoping tests (every query filtered by workspaceId+userId), rate limits, prompt-injection guard (never execute tool from email/doc body without approval), PII redaction in logs.
- Privacy: memory view/edit/delete, data export/delete per workspace, retention policy.
- Perf budgets: Today <800ms p95 (cached), chat first token <2s.

---

## Phase 9 — DevOps & Release (Week 15)

- Env (local-only for now): Docker Compose (`web + api + postgres + redis`). Migrations via Prisma. Secrets in local `.env` (never commit). No Vercel, no Supabase, no cloud DB.
- CI: lint + typecheck + tests + e2e smoke (run locally via `pnpm` / Docker; cloud CI deferred).
- Observability: Sentry + Posthog (approval accept rate, suggestion usefulness, follow-up recovery rate), LLM cost dashboard, audit log viewer.
- Beta: 5-10 EAs/VAs, onboard with 1 executive + 1 client workspace each. Measure PRD §22 outcomes weekly.

---

## Phase 10 — Post-MVP (per PRD §21)

Only after approval-rate >70% and retention: payments/expenses, team roles, CRM-lite, workflow automation, industry templates, advanced research/reporting.

---

## Immediate next steps (pick one)

1. Lock remaining stack (NestJS vs FastAPI, LLM provider)
2. Approve Figma scope for Today + Chat + ApprovalCard
3. Create `apps/web + apps/api` scaffold + local Postgres (Docker pgvector) + Better Auth + R2 wiring

Suggested repo layout after scaffold:
```
apps/web app/(today|chat|tasks|calendar|inbox|docs|followups|settings)/
apps/api src/(chat|tasks|events|emails|docs|followups|memory|permissions|approvals|digests)/
packages/types packages/prompts Docs/ADR/
```

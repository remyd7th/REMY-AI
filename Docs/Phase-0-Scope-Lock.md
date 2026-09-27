# Phase 0 — Scope Lock (Frozen MVP)

Status: IN PROGRESS → APPROVED when you sign off.
Source: `Docs/Remy AI.md` §20 (MVP), §18 (journeys), §22 (success). Plan: `Docs/Implementation Plan.md`.

## 0.1 In scope (MVP — 9 items, frozen)

1. AI Chat Assistant
2. Task Management
3. Calendar & Scheduling
4. Email Assistance
5. Document Assistance
6. Follow-Up Management
7. Dashboard (Today + Week + Insights)
8. Permission System
9. Personalized Preferences / Memory

## 0.2 Explicitly OUT of MVP (→ Phase 10)

Payments/expenses, team roles, CRM-lite, workflow automation, industry templates, advanced research/reporting, full voice duplex. Any request touching these gets logged to BACKLOG, not built.

## 0.3 Frozen user stories + acceptance criteria

### 1. Chat
- As a VA/EA I can send "organize my tasks for tomorrow" and get a reprioritized plan with Approve/Dismiss.
  - AC: streamed first token <2s; suggested actions render as chips; no side-effect without permission gate; every tool call logged.

### 2. Tasks
- I can CRUD tasks with deadline, priority, recurrence, subtasks, workspace (My Work / executive / client).
  - AC: overdue highlighted signal-red; "8 tasks, 2 overdue, 1 blocks meeting" summary works; reorganize suggestion requires approval.

### 3. Calendar
- I can create/reschedule/cancel meetings, see conflicts, get time suggestions ("45-min with Sarah next week"), and get a prep checklist prompt <24h before.
  - AC: conflict detection on create; suggestion respects per-workspace prefs (e.g. "after 10am"); cancel of important meeting requires approval.

### 4. Email
- I can triage (Important / Needs reply / Summarized), summarize long threads, draft/rewrite with tone control, and see unanswered tracker with one-click follow-up draft.
  - AC: send NEVER executes when permission=ask (creates approval); drafts editable before send; minimal body stored, tokens encrypted.

### 5. Documents
- I can upload/list/search docs, summarize, extract key points, turn notes into polished docs, compare v1/v2.
  - AC: R2 presigned upload works; summary pane renders; extraction output as structured JSON + human text.

### 6. Follow-ups
- I get a unified outstanding list (email/meeting/doc/task) with nudges (e.g. proposal +3d no reply) and one-click draft.
  - AC: snooze/dismiss tracked; resolved follow-up disappears within one sync cycle.

### 7. Dashboard
- I see Today (tasks, meetings, emails, follow-ups, docs, progress) + Week totals + one insight ("follow-ups unresolved").
  - AC: Today loads <800ms p95 cached; answers "what needs attention?" above the fold; empty states for each panel.

### 8. Permissions
- I can set per-action levels (always / ask / never) for sendEmail, schedule, shareDoc, payment; change anytime; see audit log.
  - AC: gate middleware enforced on every AI side-effect; `ask` creates ApprovalCard + notification; `never` blocks with explanation.

### 9. Memory/Preferences
- I can save global + per-workspace prefs ("meetings after 10am", "short professional emails") and view/edit/delete them.
  - AC: workspace override wins over global; delete removes from retrieval immediately; export/delete per workspace supported.

## 0.4 Success metrics (from PRD §22, measured in beta)

- Missed deadlines ↓, missed follow-ups ↓ (primary)
- Repetitive admin time ↓, context switches ↓ (self-report + event counts)
- Approval accept rate (target >70% before Phase 10), suggestion dismiss rate
- Follow-up recovery rate (nudged → resolved within 7d)
- Retention: weekly active EA/VA through beta

## 0.5 Prototype journeys (must demo before Phase 5 exit)

- Morning: briefing (3 priority, 2 meetings, 4 emails, 1 overdue follow-up, 1 doc) + prep checklist offer
- Day: "schedule with David" → options → approval → scheduled
- Later: unanswered proposal nudge → draft → approve → sent
- EOD: progress (7 done / 2 remaining / 1 pending / 3 meetings / 5 emails) + tomorrow suggestion

## 0.6 Sign-off

- [ ] You approve stories + AC above (reply "Phase 0 approved")
- [ ] BACKLOG file created for out-of-scope requests
- [ ] Counts as Phase 0 exit → unlocks Phase 1 (Figma)

BACKLOG (seed): payments/expenses, team management, CRM-lite, automation, industry assistants.

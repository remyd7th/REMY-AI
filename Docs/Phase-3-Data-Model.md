# Phase 3 — Data Model & API Contracts (Executing)

Status: IN PROGRESS. Depends on: Phase 2 (APPROVED, NestJS).
DB: local Postgres (`DATABASE_URL`), ORM Prisma. Every row scoped by `workspaceId + userId`.

## 3.1 Tables (see `apps/api/prisma/schema.prisma`)

- `workspaces(id, type: personal|executive|client|team, name, prefsJson)`
- `tasks(id, title, status, priority, dueAt, recurrence, parentId, assignee, source)`
- `events(id, title, startsAt, endsAt, attendees, location, status, externalId)`
- `emails(id, externalId, threadId, from, subject, snippet, bodyRef, importance, needsReply, status)`
- `documents(id, title, type, storageKey [R2], summary, extractedJson)`
- `followups(id, kind, refId, dueAt, status, lastNudgedAt)`
- `memories(id, scope: global|workspace, key, value)` + pgvector embedding (added Phase 6)
- `permissions(id, scope, action, level: always|ask|never)`
- `approvals(id, action, payloadJson, status: pending|approved|denied|executed)`
- `audit_log(id, actor, action, target, result)`
- Better Auth: `user, session, account, verification` (Better Auth managed)

## 3.2 API contracts (NestJS, `apps/api`)

- `POST /chat` (SSE stream) → `{ reply, suggestedActions[], pendingApproval? }`
- `CRUD /tasks /events /followups /documents /memories /permissions`
- `POST /approvals/:id/approve|deny`
- `GET /today` → `{ tasks, meetings, emails, followups, docs, progress }`
- Rules: permission gate middleware on all mutating AI routes; `ask` → 201 approval + notify; audit write on every send/schedule/share.

## Exit (→ Phase 4 core platform)

- [ ] `prisma validate` + first migration run against local `remy` DB (needs Docker up)
- [ ] Contracts reviewed
- [ ] You reply "Phase 3 approved"

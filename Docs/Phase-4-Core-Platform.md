# Phase 4 — Core Platform (Executing)

Status: IN PROGRESS. Depends on: Phase 3 (APPROVED). Stack: NestJS + Prisma + Better Auth, local Postgres (native, PG18 running, `remy` DB verified).

## Build order

1. API scaffold (`apps/api`, NestJS, REST + SSE) + Prisma client wired to `DATABASE_URL`
2. Better Auth wired (Postgres-backed, Google/Microsoft OAuth stubs)
3. Workspaces module (CRUD + switch, `workspaceId` scoping util)
4. Permission Gate (guard/middleware: always→execute+log, ask→approval+notify, never→block) + Approvals endpoints
5. Memory/Preferences CRUD + `GET /today` aggregator
6. Workers (in-process first, BullMQ+Redis when available): reminders, overdue detector, unanswered-email detector

## Conventions (locked)

- Every query filtered by `workspaceId + userId` (see `schema.prisma`)
- Every send/schedule/share writes `AuditLog`
- No AI side-effect without gate check — even in dev

## Exit (→ Phase 5 features)

- [ ] `GET /today` returns stub-aggregated payload against real DB
- [ ] Approval flow demoable (create → approve → executed + audit)
- [ ] You reply "Phase 4 approved"

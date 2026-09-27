# Phase 2 — Architecture (Executing)

Status: IN PROGRESS. Depends on: Phase 0 + 1 (APPROVED).
Locks: Next.js 14, local Postgres (pgvector), Better Auth, Cloudflare R2, local-only Docker. No Supabase, no Vercel.

## 2.1 Locked decisions (ADRs in `Docs/ADR/`)

| # | Decision | Choice | Why |
|---|---|---|---|
| 0001 | Local Postgres | Docker `pgvector/pgvector:pg16` + volume | Zero subscription, pgvector built in for memory/doc retrieval, easy backup |
| 0002 | Auth | Better Auth (Postgres-backed) + Google/Microsoft OAuth | Self-hosted, no vendor lock, meets calendar/email needs |
| 0003 | Storage | Cloudflare R2 (S3 SDK, presigned URLs) | S3-compatible, cheap, works from local dev |
| 0004 | Hosting | Local Docker Compose only (`web + api + postgres + redis`) | Your constraint; cloud deferred post-MVP |
| 0005 | Backend language | OPEN: NestJS vs FastAPI | NestJS if JS-heavy team; FastAPI if AI-heavy. API slot ready either way |
| 0006 | LLM | OPEN: provider-agnostic gateway (OpenAI-compatible) | Cost guardrails + eval set before lock |

Non-negotiables: permission gate on every AI side-effect; `workspaceId+userId` on every row; audit log on sends/schedules/shares.

## 2.2 Local runtime (`docker-compose.yml`)

- `db`: `pgvector/pgvector:pg16`, port 5432, volume `pgdata`, `POSTGRES_DB=remy`
- `redis`: `redis:7`, port 6379 (BullMQ: reminders, overdue, email-sync)
- `web` / `api`: run via `pnpm dev` locally for now; containerization in Phase 9. Compose starts infra only.
- Secrets: `.env` (never commit); `.env.example` checked in.

## 2.3 Repo layout (scaffolded this phase)

```
docker-compose.yml  .env.example  pnpm-workspace.yaml  package.json
apps/web/           (Next.js 14 — scaffold next step after backend pick)
apps/api/           (slot: NestJS or FastAPI)
packages/ui/tokens.css  packages/types/  packages/prompts/  Docs/ADR/
```

## Exit (→ Phase 3 data model)

- [ ] `docker compose up -d db redis` verified (needs Docker Desktop — still pending on your machine)
- [ ] ADRs merged
- [ ] Backend pick made (NestJS vs FastAPI)
- [ ] You reply "Phase 2 approved"

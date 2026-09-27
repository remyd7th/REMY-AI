# ADR-0004 — Local-only hosting

Status: ACCEPTED. Date: 2026-09-27.

Context: no Vercel, no cloud for now.
Decision: Docker Compose (`db + redis` now; `web + api` containerized Phase 9). Dev via `pnpm dev`.
Consequences: no preview envs; LAN-only beta; cloud deploy deferred post-MVP.

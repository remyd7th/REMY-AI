# ADR-0003 — Cloudflare R2 for docs

Status: ACCEPTED. Date: 2026-09-27.

Context: need doc storage without Supabase.
Decision: Cloudflare R2 via AWS SDK v3, presigned URLs. Drive/Dropbox import deferred.
Consequences: R2 keys in `.env`; local dev still hits R2 (no emulator).

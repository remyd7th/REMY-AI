# ADR-0001 — Local Postgres with pgvector

Status: ACCEPTED. Date: 2026-09-27.

Context: Supabase subscription unavailable; local-first constraint.
Decision: Docker `pgvector/pgvector:pg16`, volume `pgdata`, ORM Prisma/Drizzle.
Consequences: need Docker Desktop + backups via volume snapshots; pgvector enables memory/doc retrieval without extra service.

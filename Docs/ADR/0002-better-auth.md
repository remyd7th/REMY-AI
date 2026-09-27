# ADR-0002 — Better Auth

Status: ACCEPTED. Date: 2026-09-27.

Context: need self-hosted auth + Google/Microsoft OAuth for calendar/email.
Decision: Better Auth, Postgres-backed. No Clerk/Auth.js/Supabase Auth.
Consequences: own session tables + OAuth wiring; full data ownership.

# ADR-0005 — Backend language (ACCEPTED: NestJS)

Status: ACCEPTED (NestJS). Date: 2026-09-28.

Options were: NestJS (TypeScript, shared types with Next.js) vs FastAPI (Python, AI-native).
Decision: NestJS — single TypeScript monorepo with Next.js, native fit for Better Auth + Prisma, solo-builder velocity.
Consequences: API in `apps/api` (NestJS, REST + SSE); Python only if a later AI microservice is justified.

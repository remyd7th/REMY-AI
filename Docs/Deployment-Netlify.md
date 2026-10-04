# Deploying Remy AI (free tier path)

Split hosting — each piece lives where it's free and fits:

| Piece | Where | Cost | Auto-deploy |
|---|---|---|---|
| Web (Next.js) | Netlify (this repo) | $0 + free `*.netlify.app` domain | Yes, on every `git push` to `main` |
| API (NestJS) | Render free web service (Docker or Node) | $0 (spins down when idle; first request ~30s) | Yes, on every `git push` |
| Postgres | Neon free tier (or Netlify's Neon integration) | $0 | n/a |
| Files | Cloudflare R2 (already wired) | $0 at this scale | n/a |
| LLM | Groq free tier (`GROQ_API_KEY`) — Ollama can't run on servers | $0 within limits | n/a |

## A. Push the code (done by your assistant)

All deploy config is committed: `netlify.toml`, migration files, env-driven
CORS/origins. Nothing secret is committed — secrets live in host dashboards.

## B. Database (Neon, ~5 min, you)

1. https://neon.tech → New project → Postgres 16 → copy the connection string.
2. Locally once: `DATABASE_URL=<neon-string> pnpm --filter api exec prisma migrate deploy`
   (applies all migrations to the cloud DB without touching local data).

## C. API (Render, ~10 min, you)

1. https://render.com → New → Web Service → select repo `REMY-AI`.
2. Root directory: `apps/api`. Build: `pnpm install && pnpm run build`.
   Start: `node dist/main`. Plan: Free.
3. Environment variables:
   - `DATABASE_URL` = Neon string
   - `BETTER_AUTH_SECRET` = new random 32+ chars (generate fresh, don't reuse local)
   - `BETTER_AUTH_URL` = `https://remyaii.netlify.app` (the PUBLIC origin users
     see — the OAuth callback goes through the Netlify proxy, so this must be
     the Netlify domain, not the Render one)
   - `WEB_URL` = `https://remyaii.netlify.app`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (same values as local)
   - `R2_*` (same values as local)
   - `GROQ_API_KEY`, `GROQ_MODEL=llama-3.3-70b-versatile`, `LLM_PROVIDER=groq`
   - `OLLAMA_*` — leave unset (no Ollama on servers; gateway falls through)
4. Deploy → note the `https://<your-api>.onrender.com` URL.
5. In Google Cloud Console → Credentials → your OAuth client → add Authorized
   redirect URI: `https://<your-api>.onrender.com/api/auth/callback/google`.

## D. Web (Netlify, ~5 min, you)

1. https://app.netlify.com → Add new site → Import from GitHub → `REMY-AI`.
   (Config auto-reads from `netlify.toml`, including the `/api/*` proxy.)
2. Site settings → Environment variables → add:
   - `NEXT_PUBLIC_API_URL` = `https://remyaii.netlify.app/api` (same origin —
     proxied to Render by `netlify.toml`; this keeps login cookies first-party)
3. Site settings → Change site name → e.g. `remy-ai` → live at
   `https://remy-ai.netlify.app` (or your pick, if free).
4. Trigger deploy (auto on push afterwards).

## E. Google Console redirect URIs (both required)

Your OAuth client must list **both** callback URLs (add each under
Authorized redirect URIs):
- `https://remy-ai-api.onrender.com/api/auth/callback/google` (direct API)
- `https://remyaii.netlify.app/api/auth/callback/google` (via Netlify proxy —
  this is the one the app actually uses)

## F. Verify

1. Open the Netlify URL → landing loads.
2. Sign in with Google (add your prod callback + domain to test users if needed).
3. Today loads real data, chat answers via Groq, approvals flow works.

## Notes

- Render free sleeps after inactivity: first API call after idle takes ~30s.
  The web shows loading states meanwhile — expected, not broken.
- Never commit `.env`. Rotate any secret that was ever pasted in chat.
- `test-chat.ps1` at repo root is a local dev script, not part of deploys.

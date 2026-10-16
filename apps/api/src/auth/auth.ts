import * as fs from 'node:fs';
import * as path from 'node:path';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
// Import-time env: this module reads process.env when evaluated, which runs
// before ConfigModule parses .env — so load the repo-root .env here first.
for (const f of [path.join(process.cwd(), '..', '..', '.env'), path.join(process.cwd(), '.env')]) {
  try {
    if (fs.existsSync(f)) process.loadEnvFile(f);
  } catch {
    /* missing file — fall through to existing env */
  }
}

const prisma = new PrismaClient();

const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;

const norm = (v: string | undefined, fallback: string) =>
  (v ?? fallback).trim().replace(/\/+$/, '');

// Transactional email sends via Resend (RESEND_API_KEY + EMAIL_FROM in
// .env) with zero extra dependencies. If those vars are missing, the flows
// fail with an actionable message instead of pretending.
// Never log or return reset/verification tokens — Better Auth keeps them
// server-side in the Verification table, and they travel only inside the
// emailed links.
const EMAIL_NOT_CONFIGURED =
  'Email delivery is not configured yet. Ask your Remy AI administrator to ' +
  'set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (or RESEND_API_KEY) plus ' +
  'EMAIL_FROM in .env, then try again.';

// Sends a transactional email via Resend's HTTPS API (no extra dependency).
// Throws a user-safe error when unconfigured or when delivery fails —
// callers surface the message, never tokens or keys.
async function sendAuthEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error(EMAIL_NOT_CONFIGURED);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: to.trim(), subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email delivery failed (status ${res.status}). ${detail.slice(0, 160)}`.trim());
  }
}

const verificationEmailHtml = (name: string, url: string) =>
  `<p>Hi ${name},</p>` +
  `<p>Confirm your Remy AI email address by clicking the link below:</p>` +
  `<p><a href="${url}">Verify my email</a></p>` +
  `<p>If the button doesn't work, paste this link into your browser:<br>${url}</p>` +
  `<p>If you didn't create a Remy AI account, ignore this email.</p>`;

const resetEmailHtml = (name: string, url: string) =>
  `<p>Hi ${name},</p>` +
  `<p>Someone requested a password reset for your Remy AI account. ` +
  `Click below to choose a new password (link expires in 1 hour):</p>` +
  `<p><a href="${url}">Reset my password</a></p>` +
  `<p>If the button doesn't work, paste this link into your browser:<br>${url}</p>` +
  `<p>If that wasn't you, ignore this email — your password stays unchanged.</p>`;

// Google provider activates only when both env vars are set — sign-in
// returns a clear error otherwise instead of crashing boot.
export const auth = betterAuth({
  baseURL: norm(process.env.BETTER_AUTH_URL, 'http://localhost:4000'),
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  // Env-driven so Google OAuth + session cookies work on a VPS domain too:
  // set BETTER_AUTH_URL (this API) and WEB_URL (web app) in .env.
  trustedOrigins: [
    norm(process.env.BETTER_AUTH_URL, 'http://localhost:4000'),
    norm(process.env.WEB_URL, 'http://localhost:3000'),
  ],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { suspendedAt: true } });
          return user && !user.suspendedAt ? undefined : false;
        },
        after: async (session) => {
          const now = new Date();
          await Promise.all([
            prisma.user.update({ where: { id: session.userId }, data: { lastLoginAt: now, lastActivityAt: now } }),
            prisma.securityEvent.create({ data: { userId: session.userId, actorId: session.userId, type: 'login.success', details: {
              source: 'better-auth', sessionCreatedAt: session.createdAt.toISOString(), sessionExpiresAt: session.expiresAt.toISOString(),
              ...(session.userAgent ? { userAgent: session.userAgent } : {}),
            } } }),
          ]).catch(() => {});
        },
      },
      delete: {
        after: async (session) => {
          await prisma.securityEvent.create({ data: { userId: session.userId, actorId: session.userId, type: 'logout.success', details: {
            source: 'better-auth', sessionCreatedAt: session.createdAt.toISOString(), sessionExpiresAt: session.expiresAt.toISOString(),
            ...(session.userAgent ? { userAgent: session.userAgent } : {}),
          } } }).catch(() => {});
        },
      },
    },
    user: {
      update: {
        after: async (user, context) => {
          if (user.emailVerified && context?.path?.includes('verify-email')) {
            await prisma.securityEvent.create({ data: { userId: user.id, actorId: user.id, type: 'email.verified', details: { source: 'better-auth' } } }).catch(() => {});
          }
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith('/sign-in/') && !ctx.path.startsWith('/sign-up/') && !ctx.path.startsWith('/callback/')) return;
      const returned = ctx.context.returned;
      if (returned instanceof Response && returned.status >= 400) {
        const method = ctx.path.includes('/social') || ctx.path.startsWith('/callback/') ? 'social' : 'credential';
        await prisma.securityEvent.create({ data: {
          type: 'login.failed', outcome: 'failure', details: { method, source: 'better-auth' },
        } }).catch(() => {});
      }
    }),
  },
  // Email + password (Better Auth scrypt-hashes passwords into Account.password;
  // never custom-hash or log plaintext). Works independently of Google OAuth.
  // requireEmailVerification stays false on purpose: verification is
  // encouraged (email sent at signup, status shown in-app) but never a
  // lockout — sign-in works immediately.
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail(user.email, 'Reset your Remy AI password', resetEmailHtml(user.name ?? user.email, url));
    },
    onPasswordReset: async ({ user }) => {
      await prisma.securityEvent.create({
        data: { userId: user.id, actorId: user.id, type: 'password.reset', details: { source: 'better-auth' } },
      }).catch(() => {});
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Best-effort: registration must never fail because a verification
      // email bounced (e.g. free-tier sender limits). Failures are logged
      // server-side (no tokens/keys) and the user can resend from
      // /verify-email, where errors ARE surfaced.
      try {
        await sendAuthEmail(user.email, 'Verify your Remy AI email', verificationEmailHtml(user.name ?? user.email, url));
      } catch (e) {
        console.error(`Verification email not sent for user ${user.id}: ${(e as Error).message}`);
      }
    },
  },
  // Never auto-link accounts on email match alone: a password account and a
  // Google account sharing an address stay separate until ownership is proven.
  account: {
    accountLinking: { enabled: false },
  },
  rateLimit: { enabled: true, window: 60, max: 100 },
  ...(googleId && googleSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleId,
            clientSecret: googleSecret,
            accessType: 'offline',
            prompt: 'select_account consent',
            scope: [
              'openid',
              'email',
              'profile',
              'https://www.googleapis.com/auth/gmail.readonly',
              'https://www.googleapis.com/auth/gmail.send',
              'https://www.googleapis.com/auth/calendar',
            ],
          },
        },
      }
    : {}),
});

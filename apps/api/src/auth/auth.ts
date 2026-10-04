import * as fs from 'node:fs';
import * as path from 'node:path';
import { betterAuth } from 'better-auth';
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
  emailAndPassword: { enabled: false },
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

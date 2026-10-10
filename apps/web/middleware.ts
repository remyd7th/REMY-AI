import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** App routes that require a signed-in user. Everything else is public. */
const PROTECTED = [
  '/today',
  '/workflows',
  '/chat',
  '/tasks',
  '/calendar',
  '/approvals',
  '/emails',
  '/followups',
  '/documents',
  '/activity',
  '/integrations',
  '/settings',
  '/permissions',
  '/workspaces',
];

/** Cookie name fragments Better Auth uses for its session cookie. */
const SESSION_HINTS = ['session_token', 'better-auth'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const guarded = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!guarded) return NextResponse.next();

  const hasSession = req.cookies
    .getAll()
    .some((c) => SESSION_HINTS.some((h) => c.name.includes(h)));
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/signin';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|sw.js|manifest.webmanifest|icons|favicon.ico).*)',
  ],
};

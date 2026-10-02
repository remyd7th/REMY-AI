import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { auth } from './auth';

// Single choke point: every /api route (except /api/auth/*) requires a
// Better Auth session. The server-side user id overwrites any client-sent
// userId, so callers can never act as another user.
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  async use(req: any, _res: any, next: () => void) {
    const url: string = req.originalUrl ?? req.url ?? req.path ?? '';
    if (url.startsWith('/api/auth')) return next();
    const session = await auth.api
      .getSession({ headers: req.headers })
      .catch(() => null);
    if (!session?.user) {
      throw new UnauthorizedException({ code: 'signed_out', message: 'Sign in at /signin' });
    }
    const uid = (session.user as { id: string }).id;
    if (req.body && typeof req.body === 'object' && 'userId' in req.body) req.body.userId = uid;
    if (req.query && typeof req.query === 'object' && 'userId' in req.query) req.query.userId = uid;
    req.authUser = session.user;
    next();
  }
}

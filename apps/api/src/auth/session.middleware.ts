import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { auth } from './auth';
import { PrismaService } from '../prisma.service';

// Single choke point: every /api route (except /api/auth/*) requires a
// Better Auth session. The server-side user id overwrites any client-sent
// userId, so callers can never act as another user.
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: any, _res: any, next: () => void) {
    const url: string = req.originalUrl ?? req.url ?? req.path ?? '';
    if (url.startsWith('/api/auth') || url.startsWith('/api/health')) return next();
    const session = await auth.api
      .getSession({ headers: req.headers, query: { disableCookieCache: true } })
      .catch(() => null);
    if (!session?.user) {
      throw new UnauthorizedException({ code: 'signed_out', message: 'Sign in at /signin' });
    }
    const uid = (session.user as { id: string }).id;
    const user = await this.prisma.user.findUnique({ where: { id: uid }, select: { suspendedAt: true } });
    if (!user || user.suspendedAt) {
      throw new UnauthorizedException({ code: 'account_suspended', message: 'This account cannot access Remy AI.' });
    }
    const activityCutoff = new Date(Date.now() - 5 * 60 * 1000);
    await this.prisma.user.updateMany({
      where: { id: uid, suspendedAt: null, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: activityCutoff } }] },
      data: { lastActivityAt: new Date() },
    });
    if (req.body && typeof req.body === 'object' && 'userId' in req.body) req.body.userId = uid;
    if (req.query && typeof req.query === 'object' && 'userId' in req.query) req.query.userId = uid;
    req.authUser = session.user;
    next();
  }
}

import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Body,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type AuthRequest = { authUser?: { id?: string } };
type Actor = { id: string; email: string; platformRole: string };
const MAX_PAGE_SIZE = 100;
const pageNumber = (v: string | undefined, fallback: number, max: number) => {
  const n = Number(v ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new BadRequestException('Invalid pagination value.');
  return n;
};
const isoDate = (v: string | undefined) => {
  if (!v) return undefined;
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date filter.');
  return date;
};

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}
  private readonly actionWindows = new Map<string, { started: number; count: number }>();

  private configuredSuperAdmins() {
    return (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  }

  private isSuperAdmin(actor: Actor) {
    return actor.platformRole === 'superAdmin' || this.configuredSuperAdmins().includes(actor.email.toLowerCase());
  }

  private async actor(req: AuthRequest): Promise<Actor> {
    const id = req.authUser?.id;
    if (!id) throw new ForbiddenException('Super Admin access required.');
    const actor = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, platformRole: true },
    });
    if (!actor || !this.isSuperAdmin(actor)) {
      throw new ForbiddenException('Super Admin access required.');
    }
    return actor;
  }

  // Universal access-level lookup: every authenticated user may call this.
  // It reports what the caller may do but grants nothing by itself.
  @Get('access')
  async access(@Req() req: AuthRequest) {
    const id = req.authUser?.id;
    if (!id) throw new ForbiddenException('Sign in required.');
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, platformRole: true,
        memberships: {
          select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    if (!user) throw new ForbiddenException('Sign in required.');
    const orgAdminOf = user.memberships
      .filter((m) => ['owner', 'admin'].includes(m.role))
      .map((m) => ({ ...m.organization, role: m.role }));
    return {
      user: { id: user.id, email: user.email, name: user.name, platformRole: user.platformRole },
      isSuperAdmin: this.isSuperAdmin({ id: user.id, email: user.email, platformRole: user.platformRole }),
      isOrgAdmin: orgAdminOf.length > 0,
      orgAdminOf,
      memberOf: user.memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }

  private async requireSuperAdmin(req: AuthRequest): Promise<Actor> {
    const actor = await this.actor(req);
    if (!this.isSuperAdmin(actor)) {
      throw new ForbiddenException('Super Admin access required for this action.');
    }
    const now = Date.now();
    const window = this.actionWindows.get(actor.id);
    if (!window || now - window.started >= 60_000) this.actionWindows.set(actor.id, { started: now, count: 1 });
    else {
      if (window.count >= 120) throw new HttpException('Administrator request limit reached. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
      window.count += 1;
    }
    return actor;
  }

  @Get('overview')
  async overview(@Req() req: AuthRequest) {
    const currentActor = await this.actor(req);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [users, activeSessions, recentlyActiveUsers, suspendedUsers, recentEvents] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.session.count({ where: { expiresAt: { gt: now } } }),
      this.prisma.user.count({ where: { lastActivityAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.securityEvent.findMany({
        orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, userId: true, actorId: true, type: true, outcome: true, createdAt: true,
          user: { select: { name: true, email: true } } },
      }),
    ]);
    const isSuperAdmin = this.isSuperAdmin(currentActor);
    return { users, activeSessions, recentlyActiveUsers, suspendedUsers,
      isSuperAdmin, recentEvents: isSuperAdmin ? recentEvents : [] };
  }

  @Get('users')
  async users(
    @Req() req: AuthRequest,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('authMethod') authMethod?: string,
    @Query('organizationId') organizationId?: string,
    @Query('registeredFrom') registeredFrom?: string,
    @Query('registeredTo') registeredTo?: string,
    @Query('activeWithinDays') activeWithinDays?: string,
    @Query('sort') sort?: string,
    @Query('direction') direction?: string,
    @Query('page') pageValue?: string,
    @Query('pageSize') sizeValue?: string,
  ) {
    await this.actor(req);
    const page = pageNumber(pageValue, 1, 1_000_000);
    const pageSize = pageNumber(sizeValue, 25, MAX_PAGE_SIZE);
    const allowedSort = ['createdAt', 'lastLoginAt', 'lastActivityAt', 'email', 'name'] as const;
    const orderByField = allowedSort.includes(sort as (typeof allowedSort)[number]) ? sort as (typeof allowedSort)[number] : 'createdAt';
    if (direction && direction !== 'asc' && direction !== 'desc') throw new BadRequestException('Invalid sort direction.');
    if (status && !['active', 'suspended', 'pending_verification'].includes(status)) throw new BadRequestException('Invalid account status.');
    const registeredStart = isoDate(registeredFrom);
    const registeredEnd = isoDate(registeredTo);
    if (registeredEnd && /^\d{4}-\d{2}-\d{2}$/.test(registeredTo ?? '')) registeredEnd.setUTCHours(23, 59, 59, 999);
    if (registeredStart && registeredEnd && registeredStart > registeredEnd) throw new BadRequestException('Registration date range is reversed.');
    const days = activeWithinDays ? Number(activeWithinDays) : undefined;
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new BadRequestException('Invalid activity window.');
    const now = new Date();
    const where: Prisma.UserWhereInput = {};
    const search = q?.trim().slice(0, 160);
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { id: { contains: search } },
    ];
    if (status === 'suspended') where.suspendedAt = { not: null };
    if (status === 'pending_verification') { where.suspendedAt = null; where.emailVerified = false; }
    if (status === 'active') { where.suspendedAt = null; where.emailVerified = true; }
    if (authMethod) where.accounts = { some: { providerId: authMethod.slice(0, 80) } };
    if (organizationId) where.memberships = { some: { organizationId } };
    if (registeredStart || registeredEnd) where.createdAt = { gte: registeredStart, lte: registeredEnd };
    if (days) where.lastActivityAt = { gte: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where, orderBy: { [orderByField]: direction === 'asc' ? 'asc' : 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, name: true, email: true, emailVerified: true, createdAt: true,
          suspendedAt: true, platformRole: true, lastLoginAt: true, lastActivityAt: true,
          accounts: { select: { providerId: true } },
          memberships: { select: { role: true, organization: { select: { id: true, name: true, slug: true } } } },
          _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
        },
      }),
    ]);
    return {
      page, pageSize, total,
      users: rows.map(({ _count, ...user }) => ({
        ...user,
        status: user.suspendedAt ? 'suspended' : user.emailVerified ? 'active' : 'pending_verification',
        authMethods: [...new Set(user.accounts.map((account) => account.providerId))],
        activeSessionCount: _count.sessions,
      })),
    };
  }

  @Get('users/:id')
  async userDetails(@Req() req: AuthRequest, @Param('id') id: string) {
    const currentActor = await this.actor(req);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, image: true, emailVerified: true, createdAt: true,
        suspendedAt: true, suspensionReason: true, platformRole: true, lastLoginAt: true, lastActivityAt: true,
        accounts: { select: { providerId: true, createdAt: true } },
        memberships: { select: { role: true, createdAt: true, organization: { select: { id: true, name: true, slug: true } } } },
        sessions: { where: { expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true, updatedAt: true, expiresAt: true, userAgent: true } },
        securityEvents: { orderBy: { createdAt: 'desc' }, take: 50,
          select: { id: true, type: true, outcome: true, actorId: true, organizationId: true, details: true, createdAt: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    const isSuperAdmin = this.isSuperAdmin(currentActor);
    return { ...user, sessions: isSuperAdmin ? user.sessions : [], securityEvents: isSuperAdmin ? user.securityEvents : [],
      status: user.suspendedAt ? 'suspended' : user.emailVerified ? 'active' : 'pending_verification' };
  }

  @Get('sessions')
  async activeSessions(@Req() req: AuthRequest, @Query('page') pageValue?: string, @Query('pageSize') sizeValue?: string) {
    await this.requireSuperAdmin(req);
    const page = pageNumber(pageValue, 1, 1_000_000);
    const pageSize = pageNumber(sizeValue, 25, MAX_PAGE_SIZE);
    const now = new Date();
    const where = { expiresAt: { gt: now }, user: { suspendedAt: null } };
    const [total, sessions] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true, userAgent: true,
          user: { select: { name: true, email: true, lastActivityAt: true } } } }),
    ]);
    return { page, pageSize, total, sessions };
  }

  @Get('login-history')
  async loginHistory(
    @Req() req: AuthRequest,
    @Query('page') pageValue?: string,
    @Query('pageSize') sizeValue?: string,
    @Query('type') type?: string,
    @Query('outcome') outcome?: string,
    @Query('userId') userId?: string,
  ) {
    await this.requireSuperAdmin(req);
    const page = pageNumber(pageValue, 1, 1_000_000);
    const pageSize = pageNumber(sizeValue, 25, MAX_PAGE_SIZE);
    const where: Prisma.SecurityEventWhereInput = {};
    if (type) where.type = type.slice(0, 80);
    if (outcome) where.outcome = outcome.slice(0, 30);
    if (userId) where.userId = userId.slice(0, 120);
    const [total, events] = await Promise.all([
      this.prisma.securityEvent.count({ where }),
      this.prisma.securityEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, userId: true, actorId: true, organizationId: true, type: true, outcome: true, details: true, createdAt: true,
          user: { select: { name: true, email: true } } } }),
    ]);
    return { page, pageSize, total, events };
  }

  @Get('organizations')
  async organizations(@Req() req: AuthRequest) {
    await this.actor(req);
    return this.prisma.organization.findMany({ orderBy: { name: 'asc' }, select: {
      id: true, name: true, slug: true, createdAt: true,
      _count: { select: { memberships: true } },
    } });
  }

  @Get('organizations/:id/members')
  async organizationMembers(@Req() req: AuthRequest, @Param('id') organizationId: string,
    @Query('page') pageValue?: string, @Query('pageSize') sizeValue?: string, @Query('q') q?: string) {
    await this.requireSuperAdmin(req);
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) {
      throw new NotFoundException('Organization not found.');
    }
    const page = pageNumber(pageValue, 1, 100_000);
    const pageSize = pageNumber(sizeValue, 25, MAX_PAGE_SIZE);
    const search = q?.trim().slice(0, 160);
    const where: Prisma.OrganizationMembershipWhereInput = {
      organizationId,
      ...(search ? { user: { OR: [ { name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } } ] } } : {}),
    };
    const [total, memberships] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, emailVerified: true, suspendedAt: true } } } }),
    ]);
    return { page, pageSize, total, members: memberships.map(({ user, ...membership }) => ({
      ...membership, user: { ...user, status: user.suspendedAt ? 'suspended' : user.emailVerified ? 'active' : 'pending_verification' },
    })) };
  }

  @Get('access-control')
  async accessControl(@Req() req: AuthRequest) {
    await this.requireSuperAdmin(req);
    const configured = this.configuredSuperAdmins();
    return this.prisma.user.findMany({ where: { OR: [{ platformRole: { in: ['admin', 'superAdmin'] } }, { email: { in: configured } }] },
      orderBy: { email: 'asc' }, select: { id: true, name: true, email: true, platformRole: true, createdAt: true } });
  }

  @Patch('users/:id/role')
  async setRole(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { role?: string }) {
    const actor = await this.requireSuperAdmin(req);
    if (body.role !== 'user' && body.role !== 'admin') throw new BadRequestException('Role must be user or admin.');
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, platformRole: true, email: true } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.platformRole === 'superAdmin' || this.configuredSuperAdmins().includes(user.email?.toLowerCase() ?? '')) throw new ForbiddenException('Configured Super Admin role cannot be changed here.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({ where: { id }, data: { platformRole: body.role }, select: { id: true, email: true, platformRole: true } });
      await tx.securityEvent.create({ data: { userId: id, actorId: actor.id, type: 'admin.role.changed', details: { role: body.role } } });
      return changed;
    });
    return updated;
  }

  @Post('users/:id/suspend')
  async suspend(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    const actor = await this.requireSuperAdmin(req);
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, suspendedAt: true, email: true, platformRole: true } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.platformRole === 'superAdmin' || this.configuredSuperAdmins().includes(user.email.toLowerCase())) throw new ForbiddenException('Configured Super Admin accounts cannot be suspended here.');
    const reason = body.reason?.trim().slice(0, 500) || null;
    const now = new Date();
    const { updated, sessions } = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({ where: { id }, data: { suspendedAt: now, suspensionReason: reason }, select: { id: true, email: true, suspendedAt: true } });
      const deleted = await tx.session.deleteMany({ where: { userId: id } });
      await tx.securityEvent.create({ data: { userId: id, actorId: actor.id, type: 'account.suspended', details: { reason, revokedSessions: deleted.count } } });
      if (deleted.count) await tx.securityEvent.create({ data: { userId: id, actorId: actor.id, type: 'session.revoked', details: { revokedSessions: deleted.count, reason: 'account_suspended' } } });
      return { updated: changed, sessions: deleted };
    });
    return { ...updated, revokedSessions: sessions.count };
  }

  @Post('users/:id/reactivate')
  async reactivate(@Req() req: AuthRequest, @Param('id') id: string) {
    const actor = await this.requireSuperAdmin(req);
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, platformRole: true, email: true } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.platformRole === 'superAdmin' || this.configuredSuperAdmins().includes(user.email.toLowerCase())) throw new ForbiddenException('Configured Super Admin accounts cannot be changed here.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({ where: { id }, data: { suspendedAt: null, suspensionReason: null }, select: { id: true, email: true, suspendedAt: true } });
      await tx.securityEvent.create({ data: { userId: id, actorId: actor.id, type: 'account.reactivated' } });
      return changed;
    });
    return updated;
  }

  @Post('sessions/:id/revoke')
  async revokeSession(@Req() req: AuthRequest, @Param('id') id: string) {
    const actor = await this.requireSuperAdmin(req);
    const session = await this.prisma.session.findUnique({ where: { id }, select: { id: true, userId: true, createdAt: true, expiresAt: true, userAgent: true } });
    if (!session) throw new NotFoundException('Active session not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.session.delete({ where: { id } });
      await tx.securityEvent.create({ data: { userId: session.userId, actorId: actor.id, type: 'session.revoked', details: {
        sessionId: id, sessionCreatedAt: session.createdAt.toISOString(), sessionExpiresAt: session.expiresAt.toISOString(),
        ...(session.userAgent ? { userAgent: session.userAgent } : {}),
      } } });
    });
    return { revoked: true };
  }

  @Post('users/:id/revoke-sessions')
  async revokeUserSessions(@Req() req: AuthRequest, @Param('id') id: string) {
    const actor = await this.requireSuperAdmin(req);
    if (!(await this.prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('User not found.');
    const deleted = await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.session.deleteMany({ where: { userId: id } });
      await tx.securityEvent.create({ data: { userId: id, actorId: actor.id, type: 'session.revoked', details: { revokedSessions: sessions.count } } });
      return sessions;
    });
    return { revokedSessions: deleted.count };
  }

  @Post('organizations')
  async createOrganization(@Req() req: AuthRequest, @Body() body: { name?: string; slug?: string }) {
    const actor = await this.requireSuperAdmin(req);
    const name = body.name?.trim().slice(0, 120);
    const slug = body.slug?.trim().toLowerCase();
    if (!name || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
      throw new BadRequestException('Provide a name and a valid organization slug.');
    }
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: { name, slug } });
      await tx.securityEvent.create({ data: { actorId: actor.id, organizationId: created.id, type: 'organization.created', details: { name: created.name, slug: created.slug } } });
      return created;
    });
    return org;
  }

  @Post('organizations/:id/members')
  async addOrganizationMember(@Req() req: AuthRequest, @Param('id') organizationId: string, @Body() body: { userId?: string; role?: string }) {
    const actor = await this.requireSuperAdmin(req);
    if (!body.userId || !['owner', 'admin', 'member'].includes(body.role ?? 'member')) throw new BadRequestException('Provide a user ID and valid membership role.');
    const [org, user] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } }),
    ]);
    if (!org || !user) throw new NotFoundException('Organization or user not found.');
    const membership = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.organizationMembership.upsert({ where: { organizationId_userId: { organizationId, userId: user.id } },
        create: { organizationId, userId: user.id, role: body.role ?? 'member' }, update: { role: body.role ?? 'member' },
        select: { id: true, organizationId: true, userId: true, role: true } });
      await tx.securityEvent.create({ data: { userId: user.id, actorId: actor.id, organizationId, type: 'organization.member.changed', details: { role: changed.role } } });
      return changed;
    });
    return membership;
  }

  @Patch('organizations/:id/members/:userId')
  async updateOrganizationMember(@Req() req: AuthRequest, @Param('id') organizationId: string, @Param('userId') userId: string, @Body() body: { role?: string }) {
    const actor = await this.requireSuperAdmin(req);
    if (!['owner', 'admin', 'member'].includes(body.role ?? '')) throw new BadRequestException('Invalid membership role.');
    const membership = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.organizationMembership.update({ where: { organizationId_userId: { organizationId, userId } },
        data: { role: body.role }, select: { id: true, organizationId: true, userId: true, role: true } }).catch(() => null);
      if (changed) await tx.securityEvent.create({ data: { userId, actorId: actor.id, organizationId, type: 'organization.member.changed', details: { role: changed.role } } });
      return changed;
    });
    if (!membership) throw new NotFoundException('Organization membership not found.');
    return membership;
  }

  @Delete('organizations/:id/members/:userId')
  async removeOrganizationMember(@Req() req: AuthRequest, @Param('id') organizationId: string, @Param('userId') userId: string) {
    const actor = await this.requireSuperAdmin(req);
    const deleted = await this.prisma.$transaction(async (tx) => {
      const removed = await tx.organizationMembership.deleteMany({ where: { organizationId, userId } });
      if (removed.count) await tx.securityEvent.create({ data: { userId, actorId: actor.id, organizationId, type: 'organization.member.removed' } });
      return removed;
    });
    if (!deleted.count) throw new NotFoundException('Organization membership not found.');
    return { removed: true };
  }
}

@Controller('organization-admin')
export class OrganizationAdminController {
  constructor(private readonly prisma: PrismaService) {}

  private async organization(req: AuthRequest, organizationId: string) {
    const userId = req.authUser?.id;
    if (!userId) throw new ForbiddenException('Organization administrator access required.');
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) throw new ForbiddenException('You cannot administer this organization.');
    return { userId };
  }

  @Get('organizations')
  async organizations(@Req() req: AuthRequest) {
    const userId = req.authUser?.id;
    if (!userId) throw new ForbiddenException('Organization administrator access required.');
    return this.prisma.organizationMembership.findMany({
      where: { userId, role: { in: ['owner', 'admin'] } }, orderBy: { organization: { name: 'asc' } },
      select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
    });
  }

  // Every membership of the caller, any role — powers the universal Admin
  // landing page ("your access level") without exposing other users.
  @Get('mine')
  async mine(@Req() req: AuthRequest) {
    const userId = req.authUser?.id;
    if (!userId) throw new ForbiddenException('Sign in required.');
    return this.prisma.organizationMembership.findMany({
      where: { userId }, orderBy: { organization: { name: 'asc' } },
      select: { role: true, createdAt: true, organization: { select: { id: true, name: true, slug: true } } },
    });
  }

  private configuredSuperAdmins() {
    return (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  }

  private isProtectedAccount(user: { platformRole: string; email: string }) {
    return user.platformRole === 'superAdmin' || this.configuredSuperAdmins().includes(user.email.toLowerCase());
  }

  // Org-scoped suspension. Same protections as the platform endpoint, plus:
  // organization owners can only be changed through the Super Admin portal.
  @Post(':organizationId/members/:userId/suspend')
  async suspendMember(
    @Req() req: AuthRequest,
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    const { userId: actorId } = await this.organization(req, organizationId);
    const [target, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, platformRole: true, suspendedAt: true } }),
      this.prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId } }, select: { role: true },
      }),
    ]);
    if (!target || !membership) throw new NotFoundException('Organization member not found.');
    if (this.isProtectedAccount({ platformRole: target.platformRole, email: target.email })) {
      throw new ForbiddenException('Super Admin accounts cannot be changed here.');
    }
    if (membership.role === 'owner') throw new ForbiddenException('Organization owners can only be changed through the Super Admin portal.');
    const reason = body.reason?.trim().slice(0, 500) || null;
    const { updated, revoked } = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({
        where: { id: userId }, data: { suspendedAt: new Date(), suspensionReason: reason },
        select: { id: true, email: true, suspendedAt: true },
      });
      const sessions = await tx.session.deleteMany({ where: { userId } });
      await tx.securityEvent.create({ data: { userId, actorId, organizationId, type: 'account.suspended', details: { reason, revokedSessions: sessions.count } } });
      return { updated: changed, revoked: sessions.count };
    });
    return { ...updated, revokedSessions: revoked };
  }

  @Post(':organizationId/members/:userId/reactivate')
  async reactivateMember(
    @Req() req: AuthRequest,
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
  ) {
    const { userId: actorId } = await this.organization(req, organizationId);
    const [target, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, platformRole: true } }),
      this.prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId } }, select: { role: true },
      }),
    ]);
    if (!target || !membership) throw new NotFoundException('Organization member not found.');
    if (this.isProtectedAccount({ platformRole: target.platformRole, email: target.email })) {
      throw new ForbiddenException('Super Admin accounts cannot be changed here.');
    }
    if (membership.role === 'owner') throw new ForbiddenException('Organization owners can only be changed through the Super Admin portal.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({
        where: { id: userId }, data: { suspendedAt: null, suspensionReason: null },
        select: { id: true, email: true, suspendedAt: true },
      });
      await tx.securityEvent.create({ data: { userId, actorId, organizationId, type: 'account.reactivated' } });
      return changed;
    });
    return updated;
  }

  @Get(':organizationId/members')
  async members(@Req() req: AuthRequest, @Param('organizationId') organizationId: string,
    @Query('q') q?: string, @Query('page') pageValue?: string, @Query('pageSize') sizeValue?: string) {
    await this.organization(req, organizationId);
    const page = pageNumber(pageValue, 1, 1_000_000);
    const pageSize = pageNumber(sizeValue, 25, MAX_PAGE_SIZE);
    const search = q?.trim().slice(0, 160);
    const where: Prisma.OrganizationMembershipWhereInput = {
      organizationId,
      ...(search ? { user: { OR: [ { name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } } ] } } : {}),
    };
    const [total, memberships] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({ where, orderBy: { user: { email: 'asc' } }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, emailVerified: true,
          suspendedAt: true, lastActivityAt: true } } } }),
    ]);
    return { page, pageSize, total, members: memberships.map(({ user, ...membership }) => ({
      ...membership, user: { ...user, status: user.suspendedAt ? 'suspended' : user.emailVerified ? 'active' : 'pending_verification' },
    })) };
  }

  @Get(':organizationId/activity')
  async activity(@Req() req: AuthRequest, @Param('organizationId') organizationId: string,
    @Query('page') pageValue?: string, @Query('pageSize') sizeValue?: string) {
    await this.organization(req, organizationId);
    const page = pageNumber(pageValue, 1, 1_000_000);
    const pageSize = pageNumber(sizeValue, 25, MAX_PAGE_SIZE);
    const [total, events] = await Promise.all([
      this.prisma.securityEvent.count({ where: { organizationId } }),
      this.prisma.securityEvent.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, userId: true, actorId: true, type: true, outcome: true, details: true, createdAt: true,
          user: { select: { name: true, email: true } } } }),
    ]);
    return { page, pageSize, total, events };
  }
}

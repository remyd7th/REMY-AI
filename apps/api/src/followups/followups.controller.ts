import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const scoped = (workspaceId: string, userId: string) => ({ workspaceId, userId });

// Unified outstanding-action inbox across email/meeting/doc/task.
// Detection scan feeds Phase 6 proactive digests; writes always via approvals.
@Controller('followups')
export class FollowupsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.followup.findMany({
      where: { ...scoped(workspaceId, userId), ...(status ? { status } : {}) },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Outstanding: open/nudged with dueAt within the next 48h (or overdue).
  @Get('due')
  due(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    const horizon = new Date(Date.now() + 48 * 3600_000);
    return this.prisma.followup.findMany({
      where: {
        ...scoped(workspaceId, userId),
        status: { in: ['open', 'nudged'] },
        OR: [{ dueAt: null }, { dueAt: { lte: horizon } }],
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  @Post()
  async create(
    @Body()
    body: { userId: string; workspaceId: string; kind: string; refId: string; dueAt?: string },
  ) {
    return (await this.ensure(body)).row;
  }

  private async ensure(body: {
    userId: string;
    workspaceId: string;
    kind: string;
    refId: string;
    dueAt?: string;
  }) {
    const existing = await this.prisma.followup.findFirst({
      where: {
        ...scoped(body.workspaceId, body.userId),
        kind: body.kind,
        refId: body.refId,
        status: { in: ['open', 'nudged'] },
      },
    });
    if (existing) return { row: existing, created: false };
    const row = await this.prisma.followup.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        kind: body.kind,
        refId: body.refId,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      },
    });
    return { row, created: true };
  }

  // Nudge: stamp + return a draft-follow-up action for the referenced item.
  @Post(':id/nudge')
  async nudge(@Param('id') id: string) {
    const fu = await this.prisma.followup.update({
      where: { id },
      data: { status: 'nudged', lastNudgedAt: new Date() },
    });
    return {
      ...fu,
      suggestedAction: {
        label: 'Draft follow-up',
        method: 'POST',
        endpoint: '/api/chat',
        body: { message: `Draft a follow-up for my ${fu.kind} (${fu.refId})` },
      },
    };
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.prisma.followup.update({ where: { id }, data: { status: 'resolved' } });
  }

  // Detection scan (idempotent): unanswered emails >3d + prep-less meetings <48h.
  @Post('scan')
  async scan(@Body() body: { userId: string; workspaceId: string }) {
    const { userId, workspaceId } = body;
    const scope = scoped(workspaceId, userId);
    const now = new Date();
    const created: unknown[] = [];

    const staleEmails = await this.prisma.email.findMany({
      where: { ...scope, needsReply: true, status: 'open', createdAt: { lt: new Date(now.getTime() - 3 * 86_400_000) } },
    });
    for (const e of staleEmails) {
      const r = await this.ensure({ userId, workspaceId, kind: 'email', refId: e.id });
      if (r.created) created.push(r.row);
    }

    const meetings = await this.prisma.event.findMany({
      where: { ...scope, startsAt: { gte: now, lte: new Date(now.getTime() + 48 * 3600_000) } },
    });
    for (const m of meetings) {
      const prep = await this.prisma.task.count({
        where: { ...scope, status: 'open', dueAt: { lte: m.startsAt } },
      });
      if (prep === 0) {
        const r = await this.ensure({ userId, workspaceId, kind: 'meeting', refId: m.id, dueAt: m.startsAt.toISOString() });
        if (r.created) created.push(r.row);
      }
    }
    return { scannedAt: now, created: created.length };
  }
}

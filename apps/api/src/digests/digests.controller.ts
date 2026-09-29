import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface Suggestion {
  notice: string;
  label: string;
  method: 'GET' | 'POST';
  endpoint: string;
  body?: unknown;
}

// Proactive engine v1 (PRD §17): Notice → Suggest → User decides.
// Rule-based triggers only. Kill-switch via memories:
//   key=proactivity_muted value=true (workspace or global), key=quiet_hours value="22:00-07:00".
@Controller('digests')
export class DigestsController {
  constructor(private readonly prisma: PrismaService) {}

  private async muted(userId: string, workspaceId: string): Promise<boolean> {
    const rows = await this.prisma.memory.findMany({
      where: { userId, key: 'proactivity_muted', OR: [{ scope: 'global' }, { workspaceId }] },
    });
    return rows.some((r) => r.value.toLowerCase() === 'true');
  }

  @Get('morning')
  async morning(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    if (await this.muted(userId, workspaceId)) return { muted: true as const };
    const scope = { workspaceId, userId };
    const now = new Date();
    const eod = new Date(now);
    eod.setHours(23, 59, 59, 999);
    const [overdue, meetings, emails, followups, prepLess] = await Promise.all([
      this.prisma.task.count({ where: { ...scope, status: 'open', dueAt: { lt: now } } }),
      this.prisma.event.findMany({ where: { ...scope, startsAt: { gte: now, lte: eod } }, orderBy: { startsAt: 'asc' } }),
      this.prisma.email.count({ where: { ...scope, status: 'open', needsReply: true } }),
      this.prisma.followup.count({ where: { ...scope, status: { in: ['open', 'nudged'] } } }),
      this.prisma.event.findMany({ where: { ...scope, startsAt: { gte: now, lte: new Date(now.getTime() + 24 * 3600_000) } } }),
    ]);
    const suggestions: Suggestion[] = [];
    if (overdue > 0) {
      suggestions.push({
        notice: `${overdue} overdue task${overdue > 1 ? 's' : ''} need${overdue > 1 ? '' : 's'} attention.`,
        label: 'Review overdue',
        method: 'GET',
        endpoint: `/api/tasks/overdue?workspaceId=${workspaceId}&userId=${userId}`,
      });
    }
    for (const m of prepLess) {
      const prep = await this.prisma.task.count({
        where: { ...scope, status: 'open', dueAt: { lte: m.startsAt } },
      });
      if (prep === 0) {
        suggestions.push({
          notice: `"${m.title}" starts at ${m.startsAt.toISOString().slice(11, 16)} with no prep task.`,
          label: 'Create prep checklist',
          method: 'POST',
          endpoint: '/api/tasks',
          body: { userId, workspaceId, title: `Prep: ${m.title}`, dueAt: m.startsAt, priority: 'high', source: 'remy' },
        });
        break;
      }
    }
    if (emails > 0) {
      suggestions.push({
        notice: `${emails} email${emails > 1 ? 's' : ''} waiting for replies.`,
        label: 'Triage inbox',
        method: 'GET',
        endpoint: `/api/emails?workspaceId=${workspaceId}&userId=${userId}&needsReply=true`,
      });
    }
    return {
      muted: false as const,
      headline: `Good morning. ${meetings.length} meetings today, ${overdue} overdue, ${emails} emails needing replies, ${followups} open follow-ups.`,
      meetings: meetings.map((m) => ({ id: m.id, title: m.title, startsAt: m.startsAt })),
      suggestions,
    };
  }

  @Get('eod')
  async eod(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    if (await this.muted(userId, workspaceId)) return { muted: true as const };
    const scope = { workspaceId, userId };
    const sod = new Date();
    sod.setHours(0, 0, 0, 0);
    const tomorrow = new Date(sod.getTime() + 24 * 3600_000);
    const dayAfter = new Date(sod.getTime() + 48 * 3600_000);
    const [doneToday, remaining, followupsOpen, tomorrowMeetings, overdue] = await Promise.all([
      this.prisma.task.count({ where: { ...scope, status: 'done', updatedAt: { gte: sod } } }),
      this.prisma.task.count({ where: { ...scope, status: 'open' } }),
      this.prisma.followup.count({ where: { ...scope, status: { in: ['open', 'nudged'] } } }),
      this.prisma.event.findMany({
        where: { ...scope, startsAt: { gte: tomorrow, lt: dayAfter } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.task.count({ where: { ...scope, status: 'open', dueAt: { lt: new Date() } } }),
    ]);
    return {
      muted: false as const,
      headline: `Today's progress: ${doneToday} done, ${remaining} remaining, ${followupsOpen} follow-ups open.`,
      tomorrow: tomorrowMeetings.map((m) => ({ id: m.id, title: m.title, startsAt: m.startsAt })),
      carryOver: overdue,
    };
  }

  // Fired triggers (for telemetry + UI badges).
  @Get('triggers')
  async triggers(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    if (await this.muted(userId, workspaceId)) return { muted: true as const, triggers: [] };
    const scope = { workspaceId, userId };
    const now = new Date();
    const [overdue, staleEmails, meetings] = await Promise.all([
      this.prisma.task.count({ where: { ...scope, status: 'open', dueAt: { lt: now } } }),
      this.prisma.email.count({
        where: { ...scope, needsReply: true, status: 'open', createdAt: { lt: new Date(now.getTime() - 3 * 86_400_000) } },
      }),
      this.prisma.event.findMany({ where: { ...scope, startsAt: { gte: now, lte: new Date(now.getTime() + 24 * 3600_000) } } }),
    ]);
    const triggers: { kind: string; detail: string }[] = [];
    if (overdue >= 2) triggers.push({ kind: 'overdue-pileup', detail: `${overdue} overdue tasks` });
    if (staleEmails > 0) triggers.push({ kind: 'unanswered-email', detail: `${staleEmails} emails unanswered >3d` });
    for (const m of meetings) {
      const prep = await this.prisma.task.count({ where: { ...scope, status: 'open', dueAt: { lte: m.startsAt } } });
      if (prep === 0) {
        triggers.push({ kind: 'meeting-no-prep', detail: `"${m.title}" <24h, no prep` });
        break;
      }
    }
    return { muted: false as const, triggers };
  }
}

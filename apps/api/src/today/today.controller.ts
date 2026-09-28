import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// GET /api/today — real aggregator over workspace-scoped rows.
@Controller('today')
export class TodayController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getToday(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    const scope = { workspaceId: workspaceId ?? '', userId: userId ?? '' };
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const [openTasks, overdueTasks, meetings, emails, followups, docs, doneCount] =
      await Promise.all([
        this.prisma.task.findMany({
          where: { ...scope, status: 'open' },
          orderBy: [{ dueAt: 'asc' }],
          take: 10,
        }),
        this.prisma.task.count({
          where: { ...scope, status: 'open', dueAt: { lt: now } },
        }),
        this.prisma.event.findMany({
          where: { ...scope, startsAt: { gte: now, lte: endOfDay } },
          orderBy: { startsAt: 'asc' },
        }),
        this.prisma.email.findMany({
          where: { ...scope, status: 'open', needsReply: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.followup.findMany({
          where: { ...scope, status: { in: ['open', 'nudged'] } },
          orderBy: { dueAt: 'asc' },
          take: 10,
        }),
        this.prisma.document.findMany({
          where: scope,
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
        this.prisma.task.count({ where: { ...scope, status: 'done' } }),
      ]);
    return {
      tasks: openTasks,
      overdueCount: overdueTasks,
      meetings,
      emails,
      followups,
      docs,
      progress: { done: doneCount, remaining: openTasks.length },
    };
  }
}

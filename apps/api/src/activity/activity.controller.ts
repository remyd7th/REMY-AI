import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Recent activity: audit log + approvals + completed tasks, newest first.
@Controller('activity')
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async feed(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    const [audits, approvals, tasks] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.approval.findMany({ where: { workspaceId, userId }, orderBy: { updatedAt: 'desc' }, take: 10 }),
      this.prisma.task.findMany({ where: { workspaceId, userId, status: 'done' }, orderBy: { updatedAt: 'desc' }, take: 10 }),
    ]);
    const rows: { at: Date; icon: string; tone: string; title: string; sub?: string }[] = [
      ...audits.map((a) => ({ at: a.createdAt, icon: '✓', tone: '#A3E635', title: `${a.actor} ${a.action}`, sub: a.target })),
      ...approvals.map((a) => ({
        at: a.updatedAt,
        icon: a.status === 'pending' ? '⚡' : '✓',
        tone: a.status === 'pending' ? '#FFC800' : '#A3E635',
        title: a.status === 'pending' ? 'Approval required' : `Approval ${a.status}`,
        sub: a.action,
      })),
      ...tasks.map((t) => ({ at: t.updatedAt, icon: '✓', tone: '#A3E635', title: 'Task completed', sub: t.title })),
    ];
    return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20);
  }
}

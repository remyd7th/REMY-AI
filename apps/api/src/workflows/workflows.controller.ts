import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const scoped = (workspaceId: string, userId: string) => ({ workspaceId, userId });

const TEMPLATES: { name: string; description: string; trigger: string; steps: string[] }[] = [
  { name: 'Client Follow-up', description: 'Detect quiet clients, draft a personal note, schedule the nudge.', trigger: 'New client added', steps: ['Find contacts with no reply in 3 days', 'Draft personalized message', 'Ask for approval', 'Schedule follow-up reminder'] },
  { name: 'Email Triage', description: 'Sort the inbox into important, needs-reply and FYI.', trigger: 'Every morning', steps: ['Fetch unread emails', 'Score importance', 'Summarize top threads', 'Draft follow-ups for approval'] },
  { name: 'Meeting Preparation', description: 'Build a prep checklist before every meeting.', trigger: 'Meeting in 24h', steps: ['Find meetings without prep', 'Pull related docs and threads', 'Create prep checklist task'] },
  { name: 'Daily Briefing', description: 'Morning digest: tasks, meetings, emails, follow-ups.', trigger: 'Every morning', steps: ['Count overdue and due items', 'List today meetings', 'Compose briefing'] },
  { name: 'Document Processing', description: 'Turn raw notes into polished, summarized documents.', trigger: 'Notes added', steps: ['Structure the notes', 'Summarize key points', 'Extract figures and dates'] },
  { name: 'Appointment Reminder', description: 'Remind attendees and confirm upcoming meetings.', trigger: 'Meeting in 48h', steps: ['Find upcoming meetings', 'Draft reminder', 'Ask for approval'] },
];

// Workflows: automation templates. A run materializes each step as a task
// plus a run record — execution of side-effects still needs approvals.
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.workflow.findMany({ where: scoped(workspaceId, userId), orderBy: { createdAt: 'asc' }, include: { _count: { select: { runs: true } } } });
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.prisma.workflow.findUniqueOrThrow({ where: { id }, include: { runs: { orderBy: { createdAt: 'desc' }, take: 5 } } });
  }

  @Post('seed')
  async seed(@Body() body: { userId: string; workspaceId: string }) {
    const out = [];
    for (const t of TEMPLATES) {
      const existing = await this.prisma.workflow.findFirst({
        where: { ...scoped(body.workspaceId, body.userId), name: t.name },
      });
      if (existing) {
        out.push(existing);
        continue;
      }
      out.push(await this.prisma.workflow.create({ data: { ...scoped(body.workspaceId, body.userId), ...t } }));
    }
    return out;
  }

  @Post()
  create(@Body() body: { userId: string; workspaceId: string; name: string; description?: string; trigger?: string; steps?: string[] }) {
    return this.prisma.workflow.create({
      data: {
        ...scoped(body.workspaceId, body.userId),
        name: body.name,
        description: body.description ?? '',
        trigger: body.trigger ?? 'manual',
        steps: body.steps ?? [],
      },
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const k of ['name', 'description', 'trigger', 'steps', 'status']) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    return this.prisma.workflow.update({ where: { id }, data: data as never });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.workflow.delete({ where: { id } });
  }

  @Post(':id/run')
  async run(@Param('id') id: string, @Body() body: { userId: string; workspaceId: string }) {
    const wf = await this.prisma.workflow.findUniqueOrThrow({ where: { id } });
    const steps = Array.isArray(wf.steps) ? (wf.steps as string[]) : [];
    const log: string[] = [];
    for (const s of steps) {
      const task = await this.prisma.task.create({
        data: { ...scoped(body.workspaceId, body.userId), title: `${wf.name}: ${s}`, priority: 'normal', source: 'workflow' },
      });
      log.push(`task:${task.id}`);
    }
    await this.prisma.workflow.update({ where: { id }, data: { lastRunAt: new Date() } });
    return this.prisma.workflowRun.create({
      data: { workflowId: id, userId: body.userId, workspaceId: body.workspaceId, status: 'completed', log },
    });
  }
}

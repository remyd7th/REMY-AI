import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const priorities = new Set(['low', 'normal', 'high', 'urgent']);
const statuses = new Set(['open', 'in_progress', 'done']);

function parseDate(value: unknown, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${label} must be a date.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${label} must be a valid date.`);
  return date;
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.task.findMany({
      where: { workspaceId, userId, ...(status ? { status } : {}) },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  @Get('overdue')
  overdue(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.task.findMany({
      where: { workspaceId, userId, status: { in: ['open', 'in_progress'] }, dueAt: { lt: new Date() } },
      orderBy: { dueAt: 'asc' },
    });
  }

  // Persisted reminder dates are surfaced whenever the authenticated app asks
  // for its task inbox. This remains useful after a browser restart, without
  // pretending that a scheduler or push-notification worker is installed.
  @Get('reminders')
  async reminders(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    const now = new Date();
    const [due, overdue] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId, userId, status: { in: ['open', 'in_progress'] }, remindAt: { lte: now } },
        orderBy: { remindAt: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { workspaceId, userId, status: { in: ['open', 'in_progress'] }, dueAt: { lt: now } },
        orderBy: { dueAt: 'asc' },
      }),
    ]);
    return { due, overdue };
  }

  @Post()
  async create(
    @Body() body: {
      userId: string;
      workspaceId: string;
      title: string;
      description?: string;
      priority?: string;
      dueAt?: string | null;
      remindAt?: string | null;
      recurrence?: string;
      parentId?: string;
      assignee?: string;
      source?: string;
    },
  ) {
    const title = body.title?.trim();
    if (!title || title.length > 200) throw new BadRequestException('Task title is required and must be 200 characters or fewer.');
    const priority = body.priority ?? 'normal';
    if (!priorities.has(priority)) throw new BadRequestException('Choose Low, Normal, High, or Urgent priority.');
    const workspace = await this.prisma.workspace.findFirst({ where: { id: body.workspaceId, userId: body.userId }, select: { id: true } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    return this.prisma.task.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title,
        description: body.description?.trim() ?? '',
        priority,
        dueAt: parseDate(body.dueAt, 'Due date'),
        remindAt: parseDate(body.remindAt, 'Reminder'),
        recurrence: body.recurrence?.trim() || null,
        parentId: body.parentId,
        assignee: body.assignee,
        source: body.source ?? 'manual',
      },
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const task = await this.prisma.task.findFirst({ where: { id, workspaceId, userId } });
    if (!task) throw new NotFoundException('Task not found.');
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) {
        throw new BadRequestException('Task title is required and must be 200 characters or fewer.');
      }
      data.title = body.title.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string' || body.description.length > 5000) throw new BadRequestException('Task notes must be 5,000 characters or fewer.');
      data.description = body.description.trim();
    }
    if (body.priority !== undefined) {
      if (typeof body.priority !== 'string' || !priorities.has(body.priority)) throw new BadRequestException('Choose Low, Normal, High, or Urgent priority.');
      data.priority = body.priority;
    }
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !statuses.has(body.status)) throw new BadRequestException('Choose Open, In Progress, or Completed status.');
      data.status = body.status;
      data.completedAt = body.status === 'done' ? task.completedAt ?? new Date() : null;
    }
    if (body.dueAt !== undefined) data.dueAt = parseDate(body.dueAt, 'Due date');
    if (body.remindAt !== undefined) data.remindAt = parseDate(body.remindAt, 'Reminder');
    if (body.recurrence !== undefined) data.recurrence = typeof body.recurrence === 'string' ? body.recurrence.trim() || null : null;
    return this.prisma.task.update({ where: { id }, data: data as never });
  }

  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
  ) {
    const task = await this.prisma.task.findFirst({ where: { id, workspaceId, userId } });
    if (!task) throw new NotFoundException('Task not found.');
    return this.prisma.task.update({ where: { id }, data: { status: 'done', completedAt: task.completedAt ?? new Date() } });
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
  ) {
    const result = await this.prisma.task.deleteMany({ where: { id, workspaceId, userId } });
    if (!result.count) throw new NotFoundException('Task not found.');
    return { deleted: true };
  }
}

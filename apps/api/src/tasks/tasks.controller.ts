import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const scoped = (workspaceId: string, userId: string) => ({ workspaceId, userId });

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
      where: { ...scoped(workspaceId, userId), ...(status ? { status } : {}) },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  @Get('overdue')
  overdue(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.task.findMany({
      where: { ...scoped(workspaceId, userId), status: 'open', dueAt: { lt: new Date() } },
      orderBy: { dueAt: 'asc' },
    });
  }

  @Post()
  create(
    @Body()
    body: {
      userId: string;
      workspaceId: string;
      title: string;
      priority?: string;
      dueAt?: string;
      recurrence?: string;
      parentId?: string;
      assignee?: string;
      source?: string;
    },
  ) {
    return this.prisma.task.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title: body.title,
        priority: body.priority ?? 'normal',
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        recurrence: body.recurrence,
        parentId: body.parentId,
        assignee: body.assignee,
        source: body.source ?? 'manual',
      },
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data: Record<string, unknown> = { ...body };
    if (typeof data.dueAt === 'string') data.dueAt = new Date(data.dueAt);
    delete data.id;
    delete data.workspaceId;
    delete data.userId;
    return this.prisma.task.update({ where: { id }, data: data as never });
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.prisma.task.update({ where: { id }, data: { status: 'done' } });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.task.delete({ where: { id } });
  }
}

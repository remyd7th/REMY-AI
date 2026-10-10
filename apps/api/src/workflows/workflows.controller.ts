import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkflowRunner } from './workflow-runner';
import { generatePlan, starterTemplates, type PlanStep } from './workflow-plan';

const scoped = (workspaceId: string, userId: string) => ({ workspaceId, userId });

// Workflows: user-defined automations. Runs execute gather/prepare steps for
// real and pause at approvals — side-effects only ever create approvals,
// delivery happens through the existing approval flow.
@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorkflowRunner,
  ) {}

  @Get()
  list(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.workflow.findMany({
      where: scoped(workspaceId, userId),
      orderBy: { createdAt: 'asc' },
      include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.prisma.workflow.findUniqueOrThrow({
      where: { id },
      include: { runs: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
  }

  @Post('seed')
  async seed(@Body() body: { userId: string; workspaceId: string }) {
    const out = [];
    for (const t of starterTemplates()) {
      const existing = await this.prisma.workflow.findFirst({
        where: { ...scoped(body.workspaceId, body.userId), name: t.name },
      });
      if (existing) {
        out.push(existing);
        continue;
      }
      out.push(
        await this.prisma.workflow.create({
          data: { ...scoped(body.workspaceId, body.userId), name: t.name, description: t.description, trigger: t.trigger, steps: t.steps as never },
        }),
      );
    }
    return out;
  }

  // Natural language → reviewable plan (nothing is saved until Activate).
  @Post('generate')
  generate(@Body() body: { message: string }) {
    return generatePlan(body.message ?? '');
  }

  @Post()
  create(
    @Body()
    body: {
      userId: string; workspaceId: string; name: string; description?: string;
      trigger?: string; steps?: PlanStep[]; status?: string;
    },
  ) {
    return this.prisma.workflow.create({
      data: {
        ...scoped(body.workspaceId, body.userId),
        name: body.name,
        description: body.description ?? '',
        trigger: body.trigger ?? 'Manual',
        steps: (body.steps ?? []) as never,
        status: body.status ?? 'draft',
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
    return this.runner.execute(id, body.userId, body.workspaceId);
  }
}

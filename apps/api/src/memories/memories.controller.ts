import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Personalized memory (PRD §15): global prefs + per-workspace overrides.
// Resolution rule: workspace value wins over global; delete removes immediately.
@Controller('memories')
export class MemoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('userId') userId: string, @Query('workspaceId') workspaceId?: string) {
    return this.prisma.memory.findMany({
      where: {
        userId,
        OR: [{ scope: 'global' }, ...(workspaceId ? [{ workspaceId }] : [])],
      },
      orderBy: { key: 'asc' },
    });
  }

  // Effective value: workspace override first, else global, else null.
  @Get('effective')
  async effective(
    @Query('userId') userId: string,
    @Query('workspaceId') workspaceId: string,
    @Query('key') key: string,
  ) {
    const override = await this.prisma.memory.findFirst({ where: { userId, workspaceId, key } });
    if (override) return { key, value: override.value, from: 'workspace' };
    const global = await this.prisma.memory.findFirst({
      where: { userId, scope: 'global', key, workspaceId: null },
    });
    if (global) return { key, value: global.value, from: 'global' };
    return { key, value: null, from: 'none' };
  }

  @Post()
  async upsert(
    @Body() body: { userId: string; key: string; value: string; workspaceId?: string },
  ) {
    const scope = body.workspaceId ? 'workspace' : 'global';
    const where = body.workspaceId
      ? { userId: body.userId, workspaceId: body.workspaceId, key: body.key }
      : { userId: body.userId, scope: 'global', key: body.key, workspaceId: null };
    const existing = await this.prisma.memory.findFirst({ where });
    if (existing) {
      return this.prisma.memory.update({ where: { id: existing.id }, data: { value: body.value, scope } });
    }
    return this.prisma.memory.create({
      data: { userId: body.userId, key: body.key, value: body.value, scope, workspaceId: body.workspaceId ?? null },
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { value: string }) {
    return this.prisma.memory.update({ where: { id }, data: { value: body.value } });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.memory.delete({ where: { id } });
  }
}

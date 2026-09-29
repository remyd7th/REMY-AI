import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Permission rules (PRD §16): view + set per-action levels.
// Enforced by PermissionGate on every AI side-effect.
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('userId') userId: string, @Query('scope') scope?: string) {
    return this.prisma.permission.findMany({
      where: { userId, ...(scope ? { scope } : {}) },
      orderBy: { action: 'asc' },
    });
  }

  @Put()
  async set(
    @Body() body: { userId: string; scope?: string; action: string; level: 'always' | 'ask' | 'never' },
  ) {
    const scope = body.scope ?? 'global';
    const existing = await this.prisma.permission.findUnique({
      where: { userId_scope_action: { userId: body.userId, scope, action: body.action } },
    });
    if (existing) {
      return this.prisma.permission.update({ where: { id: existing.id }, data: { level: body.level } });
    }
    return this.prisma.permission.create({
      data: { userId: body.userId, scope, action: body.action, level: body.level },
    });
  }
}

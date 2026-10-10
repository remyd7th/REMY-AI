import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('userId') userId: string) {
    return this.prisma.workspace.findMany({
      where: { userId: userId ?? '' },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post()
  create(@Body() body: { userId: string; name: string; type?: string; prefs?: Record<string, unknown> }) {
    return this.prisma.workspace.create({
      data: {
        userId: body.userId,
        name: body.name,
        type: (body.type as 'personal' | 'executive' | 'client' | 'team') ?? 'personal',
        prefs: (body.prefs ?? {}) as never,
      },
    });
  }
}

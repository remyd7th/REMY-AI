import { Controller, Get, Post, Body } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Body() body: { userId: string }) {
    return this.prisma.workspace.findMany({
      where: { userId: body?.userId ?? '' },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post()
  create(@Body() body: { userId: string; name: string; type?: string }) {
    return this.prisma.workspace.create({
      data: {
        userId: body.userId,
        name: body.name,
        type: (body.type as 'personal' | 'executive' | 'client' | 'team') ?? 'personal',
      },
    });
  }
}

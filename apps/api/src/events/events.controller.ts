import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const scoped = (workspaceId: string, userId: string) => ({ workspaceId, userId });

@Controller('events')
export class EventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.event.findMany({
      where: scoped(workspaceId, userId),
      orderBy: { startsAt: 'asc' },
    });
  }

  // Meetings starting within the next `hours` (default 24), with prep flag:
  // hasPrep = an open task is due no later than the meeting start.
  @Get('needing-prep')
  async needingPrep(
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Query('hours') hours?: string,
  ) {
    const now = new Date();
    const horizon = new Date(now.getTime() + Number(hours ?? 24) * 3600_000);
    const meetings = await this.prisma.event.findMany({
      where: { ...scoped(workspaceId, userId), startsAt: { gte: now, lte: horizon } },
      orderBy: { startsAt: 'asc' },
    });
    return Promise.all(
      meetings.map(async (m) => ({
        ...m,
        hasPrep:
          (await this.prisma.task.count({
            where: {
              ...scoped(workspaceId, userId),
              status: 'open',
              dueAt: { lte: m.startsAt },
            },
          })) > 0,
      })),
    );
  }

  // Suggest free slots for `durationMin` on `date` (YYYY-MM-DD) between 09:00–17:00.
  @Get('suggest')
  async suggest(
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Query('date') date: string,
    @Query('durationMin') durationMin?: string,
  ) {
    const durMs = Number(durationMin ?? 45) * 60_000;
    const dayStart = new Date(`${date}T09:00:00`);
    const dayEnd = new Date(`${date}T17:00:00`);
    const busy = await this.prisma.event.findMany({
      where: {
        ...scoped(workspaceId, userId),
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      orderBy: { startsAt: 'asc' },
    });
    const slots: { startsAt: Date; endsAt: Date }[] = [];
    let cursor = dayStart.getTime();
    for (const b of busy) {
      const bs = b.startsAt.getTime();
      const be = b.endsAt.getTime();
      if (bs - cursor >= durMs) slots.push({ startsAt: new Date(cursor), endsAt: new Date(cursor + durMs) });
      cursor = Math.max(cursor, be);
    }
    if (dayEnd.getTime() - cursor >= durMs) {
      slots.push({ startsAt: new Date(cursor), endsAt: new Date(cursor + durMs) });
    }
    return slots.slice(0, 5);
  }

  @Post()
  async create(
    @Body()
    body: {
      userId: string;
      workspaceId: string;
      title: string;
      startsAt: string;
      endsAt: string;
      attendees?: unknown;
      location?: string;
    },
  ) {
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const clash = await this.prisma.event.findFirst({
      where: {
        ...scoped(body.workspaceId, body.userId),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (clash) {
      throw new ConflictException({
        message: 'Scheduling conflict',
        with: { id: clash.id, title: clash.title, startsAt: clash.startsAt, endsAt: clash.endsAt },
      });
    }
    return this.prisma.event.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title: body.title,
        startsAt,
        endsAt,
        attendees: body.attendees ?? [],
        location: body.location,
      },
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data: Record<string, unknown> = { ...body };
    if (typeof data.startsAt === 'string') data.startsAt = new Date(data.startsAt);
    if (typeof data.endsAt === 'string') data.endsAt = new Date(data.endsAt);
    delete data.id;
    delete data.workspaceId;
    delete data.userId;
    return this.prisma.event.update({ where: { id }, data: data as never });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.event.delete({ where: { id } });
  }
}

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GoogleService } from './google.service';

// One-way sync: Google → Remy (dedupe by externalId). Remy remains the
// workspace; sends still flow through approvals + permission gate.
@Controller('google')
export class GoogleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
  ) {}

  @Get('status')
  async status(@Query('userId') userId: string) {
    return { connected: await this.google.connected(userId) };
  }

  @Post('sync')
  async sync(@Body() body: { userId: string; workspaceId: string }) {
    const { userId, workspaceId } = body;
    let emails = 0;
    let events = 0;
    for (const m of await this.google.listGmail(userId)) {
      const exists = await this.prisma.email.findUnique({ where: { externalId: m.id } });
      if (exists) continue;
      await this.prisma.email.create({
        data: {
          userId,
          workspaceId,
          externalId: m.id,
          from: m.from,
          subject: m.subject,
          snippet: m.snippet,
          importance: 'normal',
          needsReply: false,
        },
      });
      emails++;
    }
    for (const e of await this.google.listCalendar(userId)) {
      const exists = await this.prisma.event.findFirst({ where: { userId, workspaceId, externalId: e.externalId } });
      if (exists || !e.startsAt || !e.endsAt) continue;
      await this.prisma.event.create({
        data: {
          userId,
          workspaceId,
          externalId: e.externalId,
          title: e.title,
          startsAt: new Date(e.startsAt),
          endsAt: new Date(e.endsAt),
          attendees: e.attendees,
          location: e.location,
        },
      });
      events++;
    }
    return { emails, events };
  }
}

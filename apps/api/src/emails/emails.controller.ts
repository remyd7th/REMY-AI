import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const scoped = (workspaceId: string, userId: string) => ({ workspaceId, userId });

const TONES: Record<string, { greeting: string; close: string }> = {
  professional: { greeting: 'Hello', close: 'Best regards' },
  friendly: { greeting: 'Hi there', close: 'Warm regards' },
  formal: { greeting: 'Dear', close: 'Respectfully' },
};

const BODIES: Record<string, string> = {
  'follow-up':
    'I wanted to follow up on my previous message and check whether you have had a chance to review it. Please let me know if you need anything from my side.',
  reschedule:
    'I need to suggest a change to our scheduled time. Please let me know which of the suggested alternatives works best for you, and I will confirm promptly.',
  'thank-you':
    'Thank you for your time and input. I appreciate it and will follow up with next steps shortly.',
};

@Controller('emails')
export class EmailsController {
  constructor(private readonly prisma: PrismaService) {}

  // Triage list: filter by importance / status / needsReply.
  @Get()
  list(
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Query('importance') importance?: string,
    @Query('status') status?: string,
    @Query('needsReply') needsReply?: string,
  ) {
    return this.prisma.email.findMany({
      where: {
        ...scoped(workspaceId, userId),
        ...(importance ? { importance } : {}),
        ...(status ? { status } : {}),
        ...(needsReply !== undefined ? { needsReply: needsReply === 'true' } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Unanswered tracker: needsReply + created before cutoff. Full LLM
  // follow-up drafting lands with the chat gateway; v1 returns the targets.
  @Get('unanswered')
  unanswered(
    @Query('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Query('olderThanDays') olderThanDays?: string,
  ) {
    const cutoff = new Date(Date.now() - Number(olderThanDays ?? 3) * 86_400_000);
    return this.prisma.email.findMany({
      where: { ...scoped(workspaceId, userId), needsReply: true, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Ingest (manual now; Gmail/Outlook sync lands in Phase 7).
  @Post('ingest')
  ingest(
    @Body()
    body: {
      userId: string;
      workspaceId: string;
      from: string;
      subject: string;
      snippet?: string;
      importance?: string;
      needsReply?: boolean;
    },
  ) {
    return this.prisma.email.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        from: body.from,
        subject: body.subject,
        snippet: body.snippet,
        importance: body.importance ?? 'normal',
        needsReply: body.needsReply ?? false,
      },
    });
  }

  // Rule-based summary (LLM summarization lands with Ollama gateway).
  @Get(':id/summary')
  async summary(@Param('id') id: string) {
    const email = await this.prisma.email.findUniqueOrThrow({ where: { id } });
    const text = email.snippet ?? '';
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      id: email.id,
      subject: email.subject,
      from: email.from,
      preview: text.slice(0, 280),
      wordCount: words,
      needsReply: email.needsReply,
      importance: email.importance,
      note: 'Rule-based v1 — LLM summary lands with the chat gateway',
    };
  }

  // Template draft composer → creates a pending Approval (Draft → Approve → Send).
  @Post('draft')
  async draft(
    @Body()
    body: {
      userId: string;
      workspaceId: string;
      to: string;
      purpose?: string;
      tone?: string;
      context?: string;
    },
  ) {
    const tone = TONES[body.tone ?? 'professional'] ?? TONES.professional;
    const purpose = body.purpose ?? 'follow-up';
    const paragraph = BODIES[purpose] ?? BODIES['follow-up'];
    const composed = `${tone.greeting} ${body.to},\n\n${paragraph}${
      body.context ? `\n\nContext: ${body.context}` : ''
    }\n\n${tone.close}`;
    return this.prisma.approval.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        action: 'sendEmail',
        payload: {
          to: body.to,
          subject: `Follow-up${body.context ? `: ${body.context}` : ''}`,
          purpose,
          tone: body.tone ?? 'professional',
          body: composed,
        },
      },
    });
  }

  @Patch(':id/replied')
  replied(@Param('id') id: string) {
    return this.prisma.email.update({
      where: { id },
      data: { status: 'replied', needsReply: false },
    });
  }
}

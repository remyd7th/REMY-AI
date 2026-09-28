import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { R2Service } from './r2.service';

const scoped = (workspaceId: string, userId: string) => ({ workspaceId, userId });

// Naive v1 text helpers (LLM versions land with the Ollama gateway).
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  @Get()
  list(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.document.findMany({
      where: scoped(workspaceId, userId),
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.prisma.document.findUniqueOrThrow({ where: { id } });
  }

  // Register metadata after a direct-to-R2 upload (key = R2 object key).
  @Post()
  create(
    @Body() body: { userId: string; workspaceId: string; title: string; type?: string; storageKey: string },
  ) {
    return this.prisma.document.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title: body.title,
        type: body.type ?? 'doc',
        storageKey: body.storageKey,
      },
    });
  }

  // Turn raw notes into a polished doc record (structure now, LLM polish later).
  @Post('from-notes')
  fromNotes(
    @Body() body: { userId: string; workspaceId: string; title: string; notes: string; storageKey?: string },
  ) {
    const pts = sentences(body.notes);
    const polished = `${body.title}\n\n${pts.join('\n')}`;
    return this.prisma.document.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title: body.title,
        type: 'notes',
        storageKey: body.storageKey ?? `notes/${Date.now()}.txt`,
        summary: pts.slice(0, 3).join(' '),
        extracted: { polished, points: pts.length },
      },
    });
  }

  @Post(':id/summarize')
  async summarize(@Param('id') id: string, @Body() body: { text: string }) {
    const pts = sentences(body.text);
    const summary = pts.slice(0, 3).join(' ');
    return this.prisma.document.update({
      where: { id },
      data: { summary, extracted: { sentences: pts.length } },
    });
  }

  // Key-point extraction v1: sentences containing digits or longer than 12 words.
  @Post(':id/extract')
  async extract(@Param('id') id: string, @Body() body: { text: string }) {
    const pts = sentences(body.text);
    const keyPoints = pts.filter((s) => /\d/.test(s) || s.split(/\s+/).length > 12).slice(0, 8);
    const missing = keyPoints.length === 0 ? ['No figures, dates, or detailed points detected'] : [];
    return this.prisma.document.update({
      where: { id },
      data: { extracted: { keyPoints, missing } },
    });
  }

  @Post('upload-url')
  async uploadUrl(@Body() body: { filename: string; contentType: string }) {
    const key = `uploads/${Date.now()}-${body.filename}`;
    const url = await this.r2.uploadUrl(key, body.contentType);
    return { key, url, configured: true };
  }

  @Get(':id/download-url')
  async downloadUrl(@Param('id') id: string) {
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id } });
    const url = await this.r2.downloadUrl(doc.storageKey);
    return { key: doc.storageKey, url, configured: true };
  }
}

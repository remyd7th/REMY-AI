import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { R2Service } from './r2.service';

// Naive v1 text helpers (LLM versions land with the Ollama gateway).
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Single upload policy shared by upload-url validation and the frontend. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** Strip path components and unsafe characters so keys are predictable. */
function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const clean = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120);
  if (!clean || clean === '.' || clean === '..') throw new BadRequestException('File name is not valid.');
  return clean;
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  /** The caller's workspace must exist and belong to them — otherwise every
   *  later write would die on a foreign-key violation with no useful message. */
  private async requireWorkspace(workspaceId: string, userId: string) {
    if (!workspaceId) throw new BadRequestException('Select a workspace first.');
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
      select: { id: true },
    });
    if (!workspace) {
      throw new NotFoundException(
        'Workspace not found. It may have been deleted — pick another workspace and try again.',
      );
    }
    return workspace;
  }

  private owned(id: string, userId: string) {
    return this.prisma.document.findFirst({ where: { id, userId } });
  }

  @Get()
  list(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    if (!workspaceId) return [];
    return this.prisma.document.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get(':id')
  async one(@Param('id') id: string, @Query('userId') userId: string) {
    const doc = await this.owned(id, userId);
    if (!doc) throw new NotFoundException('Document not found.');
    return doc;
  }

  // Step 1 of direct-to-R2 upload: validate, then hand out a presigned URL.
  // The returned key is namespaced per user so uploads can never collide
  // with (or overwrite) another user's objects.
  @Post('upload-url')
  async uploadUrl(
    @Body() body: { filename: string; contentType: string; size: number; workspaceId: string; userId: string },
  ) {
    const userId = body.userId;
    await this.requireWorkspace(body.workspaceId, userId);
    if (!body.filename || typeof body.filename !== 'string' || body.filename.length > 180) {
      throw new BadRequestException('File name is not valid.');
    }
    const safe = safeFilename(body.filename);
    const ext = extOf(safe);
    const expected = ALLOWED_TYPES[ext];
    if (!expected) {
      throw new BadRequestException(
        `“.${ext || '?'}” files are not supported. Use PDF, Word, TXT, CSV, Excel, PowerPoint, PNG, or JPG.`,
      );
    }
    if (body.contentType && body.contentType !== expected && body.contentType !== 'application/octet-stream') {
      throw new BadRequestException('Content type does not match the file extension.');
    }
    if (!Number.isFinite(body.size) || body.size <= 0) {
      throw new BadRequestException('File size is not valid.');
    }
    if (body.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File is ${(body.size / 1048576).toFixed(1)} MB — the limit is ${MAX_FILE_SIZE / 1048576} MB.`,
      );
    }
    const key = `uploads/${userId}/${Date.now()}-${safe}`;
    const url = await this.r2.uploadUrl(key, expected);
    return { key, url, maxSize: MAX_FILE_SIZE, mimeType: expected, configured: true };
  }

  // Step 2: register metadata after the bytes reached storage.
  @Post()
  async create(
    @Body()
    body: {
      userId: string;
      workspaceId: string;
      title: string;
      type?: string;
      storageKey: string;
      mimeType?: string;
      size?: number;
    },
  ) {
    const title = body.title?.trim();
    if (!title || title.length > 180) {
      throw new BadRequestException('Document title is required (180 characters or fewer).');
    }
    await this.requireWorkspace(body.workspaceId, body.userId);
    const prefix = `uploads/${body.userId}/`;
    if (!body.storageKey?.startsWith(prefix) && !body.storageKey?.startsWith('notes/')) {
      throw new BadRequestException('Storage reference is not valid for this upload.');
    }
    if (body.size !== undefined && (!Number.isInteger(body.size) || body.size < 0 || body.size > MAX_FILE_SIZE)) {
      throw new BadRequestException('File size is not valid.');
    }
    return this.prisma.document.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title,
        type: body.type ?? 'upload',
        storageKey: body.storageKey,
        mimeType: body.mimeType ?? ALLOWED_TYPES[extOf(safeFilename(title))] ?? null,
        size: body.size ?? null,
      },
    });
  }

  // Turn raw notes into a polished doc record (structure now, LLM polish later).
  @Post('from-notes')
  async fromNotes(
    @Body() body: { userId: string; workspaceId: string; title: string; notes: string; storageKey?: string },
  ) {
    const title = body.title?.trim();
    if (!title || title.length > 180) {
      throw new BadRequestException('Document title is required (180 characters or fewer).');
    }
    if (!body.notes?.trim()) throw new BadRequestException('Notes text is required.');
    await this.requireWorkspace(body.workspaceId, body.userId);
    const pts = sentences(body.notes);
    const polished = `${title}\n\n${pts.join('\n')}`;
    return this.prisma.document.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        title,
        type: 'notes',
        storageKey: body.storageKey ?? `notes/${Date.now()}.txt`,
        mimeType: 'text/plain',
        summary: pts.slice(0, 3).join(' '),
        extracted: { polished, points: pts.length },
      },
    });
  }

  @Post(':id/summarize')
  async summarize(@Param('id') id: string, @Body() body: { text: string; userId?: string }) {
    if (!body.text?.trim()) throw new BadRequestException('Text to summarize is required.');
    const doc = await this.owned(id, body.userId ?? '');
    if (!doc) throw new NotFoundException('Document not found.');
    const pts = sentences(body.text);
    const summary = pts.slice(0, 3).join(' ');
    return this.prisma.document.update({
      where: { id },
      data: { summary, extracted: { sentences: pts.length } },
    });
  }

  // Key-point extraction v1: sentences containing digits or longer than 12 words.
  @Post(':id/extract')
  async extract(@Param('id') id: string, @Body() body: { text: string; userId?: string }) {
    if (!body.text?.trim()) throw new BadRequestException('Text to analyze is required.');
    const doc = await this.owned(id, body.userId ?? '');
    if (!doc) throw new NotFoundException('Document not found.');
    const pts = sentences(body.text);
    const keyPoints = pts.filter((s) => /\d/.test(s) || s.split(/\s+/).length > 12).slice(0, 8);
    const missing = keyPoints.length === 0 ? ['No figures, dates, or detailed points detected'] : [];
    return this.prisma.document.update({
      where: { id },
      data: { extracted: { keyPoints, missing } },
    });
  }

  @Patch(':id/rename')
  async rename(@Param('id') id: string, @Body() body: { title: string; userId: string }) {
    const title = body.title?.trim();
    if (!title || title.length > 180) {
      throw new BadRequestException('Document title is required (180 characters or fewer).');
    }
    const doc = await this.owned(id, body.userId);
    if (!doc) throw new NotFoundException('Document not found.');
    return this.prisma.document.update({ where: { id }, data: { title } });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('userId') userId: string) {
    const doc = await this.owned(id, userId);
    if (!doc) throw new NotFoundException('Document not found.');
    await this.r2.deleteObject(doc.storageKey).catch(() => {
      /* Metadata deletion is authoritative; a missing object is not fatal. */
    });
    await this.prisma.document.delete({ where: { id } });
    return { deleted: true };
  }

  @Get(':id/download-url')
  async downloadUrl(@Param('id') id: string, @Query('userId') userId: string) {
    const doc = await this.owned(id, userId);
    if (!doc) throw new NotFoundException('Document not found.');
    const url = await this.r2.downloadUrl(doc.storageKey);
    return { key: doc.storageKey, url, configured: true };
  }
}

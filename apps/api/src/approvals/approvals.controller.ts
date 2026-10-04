import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PermissionGate } from '../permissions/permission.gate';
import { GoogleService } from '../google/google.service';
import { R2Service } from '../documents/r2.service';
import { isEmail } from '../chat/email-parse';

// Approval lifecycle: create (pending) → approve|deny → execute (guarded) + audit.
// sendEmail approvals deliver via Gmail when Google is connected; otherwise
// execution is rejected with a clear error (nothing is silently recorded).
const asList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.length > 0) return [v];
  return [];
};
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly r2: R2Service,
  ) {}

  @Post()
  create(
    @Body()
    body: { userId: string; workspaceId: string; action: string; payload: unknown },
  ) {
    return this.prisma.approval.create({
      data: {
        userId: body.userId,
        workspaceId: body.workspaceId,
        action: body.action,
        payload: body.payload ?? {},
      },
    });
  }

  @Get()
  list(@Query('workspaceId') workspaceId: string, @Query('userId') userId: string) {
    return this.prisma.approval.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.prisma.approval.update({ where: { id }, data: { status: 'approved' } });
  }

  @Post(':id/deny')
  deny(@Param('id') id: string) {
    return this.prisma.approval.update({ where: { id }, data: { status: 'denied' } });
  }

  // Edit a draft's payload before it is executed. Editing an approved draft
  // sends it back to pending so the change gets re-reviewed.
  @Patch(':id')
  async edit(@Param('id') id: string, @Body() body: { payload?: unknown }) {
    const current = await this.prisma.approval.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'pending' && current.status !== 'approved') {
      throw new ForbiddenException('Only pending or approved drafts can be edited');
    }
    return this.prisma.approval.update({
      where: { id },
      data: { payload: (body.payload ?? {}) as never, status: 'pending' },
    });
  }

  // Guarded execution: PermissionGate enforces always|ask|never before we run.
  @Post('execute')
  @UseGuards(PermissionGate)
  async execute(
    @Body()
    body: { userId: string; workspaceId: string; action: string; approvalId: string },
  ) {
    const pending = await this.prisma.approval.findUniqueOrThrow({ where: { id: body.approvalId } });
    const payload = pending.payload as {
      to?: unknown; cc?: unknown; bcc?: unknown; subject?: string; body?: string; attachments?: unknown;
    };
    const to = asList(payload.to);
    const cc = asList(payload.cc);
    const bcc = asList(payload.bcc);
    const wanted = [...to, ...cc, ...bcc];
    if (body.action === 'sendEmail') {
      if (to.length === 0) {
        throw new BadRequestException('Cannot send: no recipients. Edit the draft and add at least one To address.');
      }
      const bad = wanted.filter((a) => !isEmail(a));
      if (bad.length > 0) {
        throw new BadRequestException(
          `Cannot send: "${bad.join('", "')}" ${bad.length === 1 ? 'is' : 'are'} not email addresses. Edit the draft and fix them first.`,
        );
      }
      if (!(await this.google.connected(body.userId))) {
        throw new ForbiddenException('Google not connected — sign in with Google first, then execute again.');
      }
    }
    // Resolve attachment titles against the user's Documents → R2 bytes.
    const attachments: { filename: string; mimeType: string; contentBase64: string }[] = [];
    for (const title of asList(payload.attachments)) {
      const doc = await this.prisma.document.findFirst({
        where: { userId: body.userId, workspaceId: body.workspaceId, title: { contains: title, mode: 'insensitive' } },
      });
      if (!doc) {
        throw new BadRequestException(`Cannot send: no document matching "${title}" found. Upload it first or remove the attachment.`);
      }
      const file = await this.r2.getObject(doc.storageKey);
      if (file.bytes.length > 10 * 1024 * 1024) {
        throw new BadRequestException(`Cannot send: "${doc.title}" exceeds the 10 MB attachment limit.`);
      }
      attachments.push({
        filename: doc.title.includes('.') ? doc.title : `${doc.title}.txt`,
        mimeType: file.contentType,
        contentBase64: file.bytes.toString('base64'),
      });
    }
    let delivered: unknown = { mode: 'recorded' };
    if (body.action === 'sendEmail' && payload.body) {
      delivered = await this.google.sendGmail(body.userId, to, payload.subject ?? '(no subject)', payload.body, {
        cc,
        bcc,
        attachments,
      });
      // Record the sent mail so it shows up under Emails + follow-ups.
      const sender = (await this.prisma.user.findUnique({ where: { id: body.userId } }))?.email ?? 'me';
      await this.prisma.email.create({
        data: {
          userId: body.userId,
          workspaceId: body.workspaceId,
          from: sender,
          subject: payload.subject ?? '(no subject)',
          snippet: `To: ${[...to, ...cc.map((c) => `cc:${c}`), ...bcc.map((c) => `bcc:${c}`)].join(', ')} | ${(payload.body ?? '').slice(0, 200)}`,
          importance: 'normal',
          needsReply: false,
          status: 'sent',
        },
      });
    }
    const approval = await this.prisma.approval.update({
      where: { id: body.approvalId },
      data: { status: 'executed' },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: body.userId,
        actor: 'remy',
        action: body.action,
        target: `approval:${body.approvalId}`,
        result: `executed:${JSON.stringify(delivered).slice(0, 200)}`,
      },
    });
    return { ...approval, delivered };
  }
}

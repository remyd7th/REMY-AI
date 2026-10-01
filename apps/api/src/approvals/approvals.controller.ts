import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PermissionGate } from '../permissions/permission.gate';
import { GoogleService } from '../google/google.service';

// Approval lifecycle: create (pending) → approve|deny → execute (guarded) + audit.
// sendEmail approvals actually deliver via Gmail when Google is connected;
// otherwise execution is recorded without external side-effects.
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
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

  // Guarded execution: PermissionGate enforces always|ask|never before we run.
  @Post('execute')
  @UseGuards(PermissionGate)
  async execute(
    @Body()
    body: { userId: string; workspaceId: string; action: string; approvalId: string },
  ) {
    const pending = await this.prisma.approval.findUniqueOrThrow({ where: { id: body.approvalId } });
    const payload = pending.payload as { to?: string; subject?: string; body?: string };
    let delivered: unknown = { mode: 'recorded' };
    if (body.action === 'sendEmail' && payload.to && payload.body && (await this.google.connected(body.userId))) {
      delivered = await this.google.sendGmail(body.userId, payload.to, payload.subject ?? '(no subject)', payload.body);
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

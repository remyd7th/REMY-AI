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

// Approval lifecycle: create (pending) → approve|deny → execute (guarded) + audit.
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly prisma: PrismaService) {}

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
        result: 'executed',
      },
    });
    return approval;
  }
}

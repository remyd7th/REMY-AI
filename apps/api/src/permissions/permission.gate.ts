import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Permission Gate: always → allow; ask → require approved Approval; never → block.
// Phase 4: enforcement point. Approval creation/notify lands with Phase 5 chat slice.
@Injectable()
export class PermissionGate implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const { userId, scope = 'global', action } = req.body ?? {};
    if (!userId || !action) return true; // non-AI routes pass through
    const perm = await this.prisma.permission.findUnique({
      where: { userId_scope_action: { userId, scope, action } },
    });
    const level = perm?.level ?? 'ask';
    if (level === 'always') return true;
    if (level === 'never') throw new ForbiddenException(`Blocked by permission: ${action}`);
    const approvalId = req.body?.approvalId;
    if (!approvalId) throw new ForbiddenException(`Approval required for: ${action}`);
    const approval = await this.prisma.approval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.status !== 'approved' || approval.action !== action) {
      throw new ForbiddenException(`Valid approval required for: ${action}`);
    }
    return true;
  }
}

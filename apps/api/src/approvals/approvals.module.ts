import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ApprovalsController } from './approvals.controller';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [ApprovalsController],
})
export class ApprovalsModule {}

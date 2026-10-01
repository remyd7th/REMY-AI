import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { GoogleModule } from '../google/google.module';
import { ApprovalsController } from './approvals.controller';

@Module({
  imports: [PrismaModule, PermissionsModule, GoogleModule],
  controllers: [ApprovalsController],
})
export class ApprovalsModule {}

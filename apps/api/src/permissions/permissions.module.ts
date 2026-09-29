import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { PermissionGate } from './permission.gate';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PermissionsController],
  providers: [PermissionGate],
  exports: [PermissionGate],
})
export class PermissionsModule {}

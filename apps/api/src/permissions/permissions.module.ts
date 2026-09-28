import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { PermissionGate } from './permission.gate';

@Module({ imports: [PrismaModule], providers: [PermissionGate], exports: [PermissionGate] })
export class PermissionsModule {}

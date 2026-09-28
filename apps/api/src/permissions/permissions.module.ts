import { Module } from '@nestjs/common';
import { PermissionGate } from './permission.gate';

@Module({ providers: [PermissionGate], exports: [PermissionGate] })
export class PermissionsModule {}

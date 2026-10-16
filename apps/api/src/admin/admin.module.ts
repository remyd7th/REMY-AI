import { Module } from '@nestjs/common';
import { AdminController, OrganizationAdminController } from './admin.controller';

@Module({ controllers: [AdminController, OrganizationAdminController] })
export class AdminModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { WorkspacesController } from './workspaces.controller';

@Module({ imports: [PrismaModule], controllers: [WorkspacesController] })
export class WorkspacesModule {}

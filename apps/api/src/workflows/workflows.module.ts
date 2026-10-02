import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { WorkflowsController } from './workflows.controller';

@Module({ imports: [PrismaModule], controllers: [WorkflowsController] })
export class WorkflowsModule {}

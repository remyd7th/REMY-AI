import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { GoogleModule } from '../google/google.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowRunner } from './workflow-runner';

@Module({ imports: [PrismaModule, GoogleModule], controllers: [WorkflowsController], providers: [WorkflowRunner] })
export class WorkflowsModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { TasksController } from './tasks.controller';

@Module({ imports: [PrismaModule], controllers: [TasksController] })
export class TasksModule {}

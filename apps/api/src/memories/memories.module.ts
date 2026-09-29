import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MemoriesController } from './memories.controller';

@Module({ imports: [PrismaModule], controllers: [MemoriesController] })
export class MemoriesModule {}

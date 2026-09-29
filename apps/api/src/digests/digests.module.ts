import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { DigestsController } from './digests.controller';

@Module({ imports: [PrismaModule], controllers: [DigestsController] })
export class DigestsModule {}

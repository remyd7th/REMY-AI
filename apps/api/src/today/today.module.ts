import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { TodayController } from './today.controller';

@Module({ imports: [PrismaModule], controllers: [TodayController] })
export class TodayModule {}

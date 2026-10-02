import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { ActivityController } from './activity.controller';

@Module({ imports: [PrismaModule], controllers: [ActivityController] })
export class ActivityModule {}

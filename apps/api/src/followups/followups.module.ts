import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { FollowupsController } from './followups.controller';

@Module({ imports: [PrismaModule], controllers: [FollowupsController] })
export class FollowupsModule {}

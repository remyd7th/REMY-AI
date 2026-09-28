import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { EmailsController } from './emails.controller';

@Module({ imports: [PrismaModule], controllers: [EmailsController] })
export class EmailsModule {}

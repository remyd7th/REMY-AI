import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { GoogleService } from './google.service';
import { GoogleController } from './google.controller';

@Module({ imports: [PrismaModule], controllers: [GoogleController], providers: [GoogleService], exports: [GoogleService] })
export class GoogleModule {}

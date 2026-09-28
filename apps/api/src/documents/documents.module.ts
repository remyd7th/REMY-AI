import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { DocumentsController } from './documents.controller';
import { R2Service } from './r2.service';

@Module({ imports: [PrismaModule], controllers: [DocumentsController], providers: [R2Service] })
export class DocumentsModule {}

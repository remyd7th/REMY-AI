import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ChatController } from './chat.controller';
import { LlmService } from './llm.service';
import { ChatToolsService } from './chat-tools.service';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [ChatController],
  providers: [LlmService, ChatToolsService],
})
export class ChatModule {}

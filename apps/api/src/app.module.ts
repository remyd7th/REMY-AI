import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module';import { WorkspacesModule } from './workspaces/workspaces.module';
import { SessionMiddleware } from './auth/session.middleware';
import { PermissionsModule } from './permissions/permissions.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { TasksModule } from './tasks/tasks.module';
import { EventsModule } from './events/events.module';
import { EmailsModule } from './emails/emails.module';
import { DocumentsModule } from './documents/documents.module';
import { ChatModule } from './chat/chat.module';
import { FollowupsModule } from './followups/followups.module';
import { MemoriesModule } from './memories/memories.module';
import { DigestsModule } from './digests/digests.module';
import { AuthModule } from './auth/auth.module';
import { GoogleModule } from './google/google.module';
import { TodayModule } from './today/today.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    WorkspacesModule,
    PermissionsModule,
    ApprovalsModule,
    TasksModule,
    EventsModule,
    EmailsModule,
    DocumentsModule,
    ChatModule,
    FollowupsModule,
    MemoriesModule,
    DigestsModule,
    AuthModule,
    GoogleModule,
    TodayModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { TasksModule } from './tasks/tasks.module';
import { EventsModule } from './events/events.module';
import { TodayModule } from './today/today.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WorkspacesModule,
    PermissionsModule,
    ApprovalsModule,
    TasksModule,
    EventsModule,
    TodayModule,
  ],
})
export class AppModule {}

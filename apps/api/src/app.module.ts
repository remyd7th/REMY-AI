import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { PermissionsModule } from './permissions/permissions.module';
import { TodayModule } from './today/today.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WorkspacesModule,
    PermissionsModule,
    TodayModule,
  ],
})
export class AppModule {}

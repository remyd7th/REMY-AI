import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { PermissionsModule } from './permissions/permissions.module';
import { TodayModule } from './today/today.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WorkspacesModule,
    PermissionsModule,
    TodayModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}

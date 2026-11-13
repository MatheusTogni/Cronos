import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ClassesModule } from './classes/classes.module';
import { GameModule } from './game/game.module';
import { ImagesModule } from './images/images.module';
import { PrismaModule } from './prisma/prisma.module';
import { LogViewInterceptor } from './realtime/log-view.interceptor';
import { RealtimeModule } from './realtime/realtime.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    RealtimeModule,
    UsersModule,
    ClassesModule,
    CampaignsModule,
    GameModule,
    ImagesModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: LogViewInterceptor }],
})
export class AppModule {}

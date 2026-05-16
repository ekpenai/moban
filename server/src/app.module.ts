import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PsdService } from './psd.service';
import { WinstonLoggerService } from './logger.service';
import { CleanupService } from './cleanup.service';
import { S3Service } from './s3.service';
import { Template } from './template.entity';
import { Setting } from './setting.entity';
import { WxUser } from './wx-user.entity';
import { WechatAuthService } from './wechat-auth.service';
import { UserFavorite } from './user-favorite.entity';
import { UserDraft } from './user-draft.entity';
import { UserDataService } from './user-data.service';
import { AuthTokenService } from './auth-token.service';
import { ArabicReshapeService } from './arabic-reshape.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot(
      {
        rootPath: join(process.cwd(), 'uploads'),
        serveRoot: '/uploads',
      },
      {
        rootPath: join(process.cwd(), '..', 'images'),
        serveRoot: '/images',
      },
      {
        rootPath: join(process.cwd(), 'images'),
        serveRoot: '/sys-images',
      }
    ),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisPassword =
          configService.get<string>('REDIS_PASSWORD') ||
          configService.get<string>('REDIS_PASS') ||
          undefined;
        const redisUsername =
          configService.get<string>('REDIS_USERNAME') ||
          configService.get<string>('REDIS_USER') ||
          undefined;
        return {
          redis: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            username: redisUsername,
            password: redisPassword,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'renderQueue',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASS'),
        database: configService.get<string>('DB_NAME'),
        entities: [Template, Setting, WxUser, UserFavorite, UserDraft],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Template, Setting, WxUser, UserFavorite, UserDraft]),
  ],
  controllers: [AppController],
  providers: [
    PsdService,
    WinstonLoggerService,
    CleanupService,
    S3Service,
    WechatAuthService,
    UserDataService,
    AuthTokenService,
    ArabicReshapeService,
  ],
})
export class AppModule { }

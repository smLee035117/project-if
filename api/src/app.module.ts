import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PlaysModule } from './plays/plays.module.js';

import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),
    PlaysModule, DatabaseModule,RedisModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

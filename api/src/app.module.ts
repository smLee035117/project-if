import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PlaysModule } from './plays/plays.module.js';

@Module({
  imports: [PlaysModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { PlaysController } from './plays.controller.js';
import { PlaysService } from './plays.service.js';

@Module({
  controllers: [PlaysController],
  providers: [PlaysService]
})
export class PlaysModule {}

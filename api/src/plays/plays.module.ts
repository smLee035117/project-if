import { Module } from '@nestjs/common';
import { PlaysController } from './plays.controller.js';
import { PlaysService } from './plays.service.js';

import { DatabaseModule } from '../database/database.module.js';



@Module({
  imports: [DatabaseModule],
  controllers: [PlaysController],
  providers: [PlaysService]
})
export class PlaysModule {}

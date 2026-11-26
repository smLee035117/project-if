import { Module } from '@nestjs/common';
import { PlaysController } from './plays.controller.js';
import { PlaysService } from './plays.service.js';
import { PlayRecoveryBootstrapService } from './play-recovery-bootstrap.service.js';

import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';

import { PlaysV2Controller } from './plays-v2.controller.js';
import { DevPlaygroundController } from './dev-playground.controller.js';
import { ScenariosV2Controller } from './scenarios-v2.controller.js';

@Module({
  imports: [DatabaseModule , RedisModule],
    controllers: [PlaysController, PlaysV2Controller, DevPlaygroundController, ScenariosV2Controller,],
  providers: [PlaysService,PlayRecoveryBootstrapService]
})
export class PlaysModule {}

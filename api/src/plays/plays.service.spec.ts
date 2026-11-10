import { Test, TestingModule } from '@nestjs/testing';
import { PlaysService } from './plays.service.js';

import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';


import { describe, beforeEach, expect, test, it, vi } from 'vitest';


import { loadScenario } from './scenario-loader.js';
import { createInitialPlayData } from './play-engine.js';
import { ConflictException } from '@nestjs/common';


describe('PlaysService', () => {
    let service: PlaysService;

    const redisMock = {
      updatePlayIfCurrent: vi.fn().mockResolvedValue(false),
    };


    beforeEach(async () => {
      vi.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [ 
          PlaysService,
              {
                provide: DatabaseService,
                useValue: {},
              },
              {
                  provide: RedisService,
                  useValue: redisMock,
              },
        ],
      }).compile();

      service = module.get<PlaysService>(PlaysService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });



    test('Redis 저장 실패 시 ConflictException이 발생한다', async () => {
      // 1. 정상적인 PlayData 준비
      const playData = createInitialPlayData(
        'blackout_test_01',
        4,
        0,
      );
      
      // 2. getPlayForGuest()가 해당 데이터를 반환하도록 설정
      vi.spyOn(service, 'getPlayForGuest').mockResolvedValue(playData);

      const scenario = await loadScenario('blackout_test_01');

      const stage = scenario.stages[0];

      const stageId = stage.stageId;
      const choiceId = stage.choices[0].id;
       
      // 3. submitChoice() 호출

      await expect(
        service.submitChoice('test-play-id', choiceId, stageId),
      ).rejects.toBeInstanceOf(ConflictException);

      // 4. ConflictException 발생 여부 검증

      expect(redisMock.updatePlayIfCurrent).toHaveBeenCalledOnce();
      
    });

});

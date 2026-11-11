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
      deletePendingPlayResult: vi.fn(),
    };

    const databaseMock = {
      savePlayResult: vi.fn(),

    };

    beforeEach(async () => {
      vi.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [ 
          PlaysService,
              {
                provide: DatabaseService,
                useValue: databaseMock,
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


    
  test('Redis 갱신 성공 후 MySQL 저장에 실패하면 오류가 발생한다', async () => {

    // 1. createInitialPlayData()로 기존 시나리오의 플레이 데이터 생성


      const playData = createInitialPlayData(
            'blackout_test_01',
            4,
            0,
      );


    // 2. currentStep을 마지막 단계인 2로 변경
      playData.currentStep = 2;

    // 3. getPlayForGuest()가 해당 데이터를 반환하도록 설정
      vi.spyOn(service, 'getPlayForGuest').mockResolvedValue(playData);


      const scenario = await loadScenario('blackout_test_01');

      const stage = scenario.stages[2];

      const stageId = stage.stageId;
      const choiceId = stage.choices[0].id;


    // 4. redisMock은 성공, databaseMock은 실패하도록 설정
    redisMock.updatePlayIfCurrent.mockResolvedValueOnce(true);

    databaseMock.savePlayResult.mockRejectedValueOnce(
      new Error('DB 저장 실패 테스트'),
    );



    // 이후 submitChoice() 호출과 expect()를 작성하겠습니다.
    await expect(
      service.submitChoice('test-play-id', choiceId, stageId),
    ).rejects.toThrow('DB 저장 실패 테스트');



    expect(redisMock.updatePlayIfCurrent).toHaveBeenCalledOnce();

    expect(databaseMock.savePlayResult).toHaveBeenCalledOnce();

    expect(databaseMock.savePlayResult).toHaveBeenCalledWith(
      'test-play-id',
      expect.objectContaining({ state: 'CLEARED' }),
    );

  expect(redisMock.deletePendingPlayResult).not.toHaveBeenCalled();

  });


  test('MySQL 저장 성공 후 pending 삭제가 호출된다', async () => {
      // 직접 구현

       const playData = createInitialPlayData(
            'blackout_test_01',
            4,
            0,
      );


    // 2. currentStep을 마지막 단계인 2로 변경
      playData.currentStep = 2;

    // 3. getPlayForGuest()가 해당 데이터를 반환하도록 설정
      
      vi.spyOn(service, 'getPlayForGuest').mockResolvedValue(playData);
      
      redisMock.updatePlayIfCurrent.mockResolvedValueOnce(true);
      databaseMock.savePlayResult.mockResolvedValueOnce(undefined);


      const scenario = await loadScenario('blackout_test_01');

      const stage = scenario.stages[2];

      const stageId = stage.stageId;
      const choiceId = stage.choices[0].id;


      
      await service.submitChoice('test-play-id', choiceId, stageId);
      
      expect(playData.state).toEqual('CLEARED');



      expect(redisMock.updatePlayIfCurrent).toHaveBeenCalledOnce();

    expect(databaseMock.savePlayResult).toHaveBeenCalledOnce();

    expect(redisMock.deletePendingPlayResult).toHaveBeenCalledOnce();

    expect(redisMock.deletePendingPlayResult).toHaveBeenCalledWith('test-play-id');


  });


});





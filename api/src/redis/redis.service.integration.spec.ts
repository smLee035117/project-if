import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { beforeAll, afterAll, expect, test } from 'vitest';

import { RedisService } from './redis.service.js';
import type { PlayData } from '../plays/types/play.js';
import e from 'express';

import { createInitialPlayDataV2 } from '../plays/play-engine-v2.js';
import { loadScenarioV2 } from '../plays/scenario-loader-v2.js';

import { executeActionV2 } from '../plays/action-engine-v2.js';

const service = new RedisService();

// 테스트 데이터 삭제용 연결
const cleanupClient = createClient({
  url: 'redis://127.0.0.1:6379',
});

//const playId = `test-${randomUUID()}`;
const playIds: string[] = [];

beforeAll(async () => {
  await cleanupClient.connect();
  await service.onModuleInit();
});

afterAll(async () => {
  try {
    if (cleanupClient.isReady) {
      for (const id of playIds) {
        await cleanupClient.del([
          `play:${id}`,
          `play:v2:${id}`,
          `pending:play-result:${id}`,
          `pending:v2:play-result:${id}`,
        ]);
      }
    }
  } finally {
    if (cleanupClient.isOpen) {
      await cleanupClient.close();
    }

    await service.onModuleDestroy();
  }
});

test('이전 단계 기준의 저장 요청은 기존 결과를 덮어쓰지 않는다', async () => {

  const playId = `test-${randomUUID()}`;
  playIds.push(playId);

  const initial: PlayData = {
    userId: 4,
    userType: 0,
    score: 100,
    state: 'PLAYING',
    currentStep: 0,
    scenarioId: 'blackout_test_01',
  };

  // 두 요청이 같은 초기 상태를 읽고 계산한 결과
  const resultA: PlayData = {
    ...initial,
    score: 100,
    currentStep: 1,
  };

  const resultB: PlayData = {
    ...initial,
    score: 95,
    currentStep: 1,
  };

  await service.savePlay(playId, initial);

  
  const resA = await service.updatePlayIfCurrent(playId,0,resultA);
  expect(resA).toBe(true);  

  const resB = await service.updatePlayIfCurrent(playId,0,resultB);
  expect(resB).toBe(false);


  const getResA = await service.getPlay(playId);
  expect(getResA).toEqual(resultA);
  
});


test('동시 저장 요청 중 하나만 성공한다', async () => {

  const playId = `test-${randomUUID()}`;
  playIds.push(playId);

  const initial: PlayData = {
    userId: 4,
    userType: 0,
    score: 100,
    state: 'PLAYING',
    currentStep: 0,
    scenarioId: 'blackout_test_01',
  };

  // 두 요청이 같은 초기 상태를 읽고 계산한 결과
  const resultA: PlayData = {
    ...initial,
    score: 100,
    currentStep: 1,
  };

  const resultB: PlayData = {
    ...initial,
    score: 95,
    currentStep: 1,
  };


  await service.savePlay(playId, initial);

  const [resA, resB] = await Promise.all([
    service.updatePlayIfCurrent(playId, 0, resultA),
    service.updatePlayIfCurrent(playId, 0, resultB),
  ]);

  const isXor: boolean = resA !== resB; 

  expect(isXor).toBe(true);

  const getRes = await service.getPlay(playId);
  const expected = resA ? resultA : resultB;
  expect(getRes).toEqual(expected);

});

test('종료 상태로 갱신하면 pending 결과도 저장된다', async () => {
  
    const playId = `test-${randomUUID()}`;
    playIds.push(playId);

    const initial: PlayData = {
      userId: 4,
      userType: 0,
      score: 100,
      state: 'PLAYING',
      currentStep: 2,
      scenarioId: 'blackout_test_01',
    };

    const resultA: PlayData = {
      ...initial,
      state: 'CLEARED',
    
    };

     await service.savePlay(playId, initial);

     const resA = await service.updatePlayIfCurrent(playId, 2, resultA);

     expect(resA).toBe(true);

     const getRes = await service.getPlay(playId);

    const pending = await cleanupClient.get(`pending:play-result:${playId}`);     
    expect(pending).not.toBeNull();

    expect(getRes).toEqual(resultA);
    expect(JSON.parse(pending!)).toEqual(getRes);

});

test('CAS 검증에 실패하면 pending 결과를 저장하지 않는다', async () => {
  // 직접 구현

   // 1. playId 생성 및 정리 목록 등록

    // 2. 초기 PlayData 구성 (currentStep: 0)

    // 3. 종료 상태의 resultA 구성 (state: CLEARED)

    // 4. Redis에 initial 저장

    // 5. expectedStep을 1로 설정해 CAS 요청

    // 6. CAS 반환값이 false인지 검증

    // 7. Redis의 플레이 데이터를 다시 조회

    // 8. 조회 결과가 initial과 동일한지 검증

    // 9. pending 키 조회

    // 10. pending 데이터가 null인지 검증

    const playId = `test-${randomUUID()}`;
    playIds.push(playId);

    const initial: PlayData = {
      userId: 4,
      userType: 0,
      score: 100,
      state: 'PLAYING',
      currentStep: 0,
      scenarioId: 'blackout_test_01',
    };


    const resultA: PlayData = {
      ...initial,
      state: 'CLEARED',
    
    };

     await service.savePlay(playId, initial);

     const resA = await service.updatePlayIfCurrent(playId, 1, resultA);

     expect(resA).toBe(false);


     const getRes = await service.getPlay(playId);

     expect(getRes).toEqual(initial);

     const pending = await cleanupClient.get(`pending:play-result:${playId}`);     
    expect(pending).toBeNull();


});


test('pending 결과를 조회하고 삭제 후에는 null을 반환한다', async () => {
  // 직접 구현
    const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const initial: PlayData = {
        userId: 4,
        userType: 0,
        score: 100,
        state: 'PLAYING',
        currentStep: 0,
        scenarioId: 'blackout_test_01',
      };


      const resultA: PlayData = {
        ...initial,
        state: 'CLEARED',
      
      };

      await service.savePlay(playId, initial);

      const resA = await service.updatePlayIfCurrent(playId, initial.currentStep, resultA);
      expect(resA).toBe(true);

      const chk = await service.getPendingPlayResult(playId);
      expect(chk).toEqual(resultA);

      const pending = await cleanupClient.get(`pending:play-result:${playId}`);    
      expect(pending).not.toBeNull();
      await service.deletePendingPlayResult(playId);
      
      const pendingAfter = await cleanupClient.get(`pending:play-result:${playId}`);
      expect(pendingAfter).toBeNull();




      const getRes = await service.getPlay(playId);
      expect(getRes).not.toBeNull();

      expect(getRes).toEqual(resultA);

});


test('GIVEN_UP 상태에서는 pending 결과를 생성하지 않는다', async () => {
        // 1. 테스트용 playId 생성
        const playId = `test-${randomUUID()}`;
        playIds.push(playId);

        // 2. 초기 PlayData 생성
        const initial: PlayData = {
            userId: 4,
            userType: 0,
            score: 100,
            state: 'PLAYING',
            currentStep: 0,
            scenarioId: 'blackout_test_01',
        };

        // 3. Redis에 초기 데이터 저장
        await service.savePlay(playId, initial);

        // 4. 중도 포기 상태 생성
        const givenUpData: PlayData = {
            ...initial,
            state: 'GIVEN_UP',
        };

        // 5. CAS 갱신 실행
        const updated = await service.updatePlayIfCurrent(
            playId,
            initial.currentStep,
            givenUpData,
        );

        // 6. CAS 성공 검증
        // 직접 구현
        expect(updated).toBe(true);

        // 7. Redis 플레이 상태가 GIVEN_UP으로 변경됐는지 검증
        // 직접 구현
        expect(await service.getPlay(playId)).toEqual(givenUpData);
        // 8. pending이 생성되지 않았는지 검증
        // 직접 구현
        expect(await service.getPendingPlayResult(playId)).toBeNull();


    });

    test('V2 플레이를 별도 키에 저장하고 조회한다', async () => {
        const playId = `test-${randomUUID()}`;
        playIds.push(playId);

        const scenario = await loadScenarioV2('apartment_fire_01');

        const initial = createInitialPlayDataV2(
            scenario,
            4,
            0,
        );

        await service.savePlayV2(playId, initial);

        const saved = await service.getPlayV2(playId);

        expect(saved).toEqual(initial);

        // V1 저장 영역과 분리되었는지 검증
        expect(await service.getPlay(playId)).toBeNull();

        // TTL이 설정되었는지 검증
        const ttl = await cleanupClient.ttl(`play:v2:${playId}`);

        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(3600);
    });

    test('V2 플레이 생성 시 기존 데이터를 덮어쓰지 않는다', async () => {
        const playId = `test-${randomUUID()}`;
        playIds.push(playId);

        const scenario = await loadScenarioV2('apartment_fire_01');
        const initial = createInitialPlayDataV2(scenario, 4, 0);

        await service.savePlayV2(playId, initial);

        const modified = {
            ...initial,
            version: 1,
        };

        await expect(
            service.savePlayV2(playId, modified),
        ).rejects.toThrow('이미 존재하는 V2 플레이 ID입니다.');

        expect(await service.getPlayV2(playId)).toEqual(initial);
    });


    test('V2 행동 결과를 버전 기준으로 저장한다', async () => {
      const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const scenario =
        await loadScenarioV2('apartment_fire_01');

      const initial =
        createInitialPlayDataV2(scenario, 4, 0);

      const next = executeActionV2(
        initial,
        scenario,
        'E01-A',
      ).playData;

      await service.savePlayV2(playId, initial);

      expect(
        await service.updatePlayV2IfVersion(
          playId,
          0,
          next,
        ),
      ).toBe(true);

      expect(await service.getPlayV2(playId))
        .toEqual(next);
    });

    test('V2에서 이전 버전 요청은 저장을 거부한다', async () => {
      const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const scenario =
        await loadScenarioV2('apartment_fire_01');

      const initial =
        createInitialPlayDataV2(scenario, 4, 0);

      const next = executeActionV2(
        initial,
        scenario,
        'E01-A',
      ).playData;

      await service.savePlayV2(playId, initial);

      expect(
        await service.updatePlayV2IfVersion(
          playId, 0, next,
        ),
      ).toBe(true);

      expect(
        await service.updatePlayV2IfVersion(
          playId, 0, next,
        ),
      ).toBe(false);

      expect(await service.getPlayV2(playId))
        .toEqual(next);
    });

    test('V2 동시 요청 중 정확히 하나만 저장된다', async () => {
      const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const scenario =
        await loadScenarioV2('apartment_fire_01');

      const initial =
        createInitialPlayDataV2(scenario, 4, 0);

      const nextA = {
        ...initial,
        version: 1,
        storyTimeMinutes: 1,
      };

      const nextB = {
        ...initial,
        version: 1,
        storyTimeMinutes: 2,
      };

      await service.savePlayV2(playId, initial);

      const [resultA, resultB] = await Promise.all([
        service.updatePlayV2IfVersion(
          playId, 0, nextA,
        ),
        service.updatePlayV2IfVersion(
          playId, 0, nextB,
        ),
      ]);

      expect(resultA).not.toBe(resultB);

      expect(await service.getPlayV2(playId))
        .toEqual(resultA ? nextA : nextB);
    });


    test('V2 종료 시 pending 결과가 함께 저장된다', async () => {
      const scenario = await loadScenarioV2('apartment_fire_01');

      for (const state of ['CLEARED', 'FAILED'] as const) {
          const playId = `test-${randomUUID()}`;
          playIds.push(playId);

          const initial = createInitialPlayDataV2(
              scenario, 4, 0,
          );

          const finished = {
              ...initial,
              state,
              version: 1,
              endingId: `TEST_${state}`,
              storyTimeMinutes: 5,
          };

          await service.savePlayV2(playId, initial);

          const updated = await service.updatePlayV2IfVersion(
              playId, 0, finished,
          );

          expect(updated).toBe(true);
          expect(await service.getPlayV2(playId)).toEqual(finished);

          const pendingKey =
              `pending:v2:play-result:${playId}`;

          const pending = await cleanupClient.get(pendingKey);

          expect(pending).not.toBeNull();
          expect(JSON.parse(pending!)).toEqual(finished);

          // pending은 일반 플레이 TTL과 독립적으로 보관
          expect(await cleanupClient.ttl(pendingKey)).toBe(-1);
      }
  });

  test('V2 CAS 실패 시 pending을 생성하지 않는다', async () => {
      const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const scenario = await loadScenarioV2('apartment_fire_01');
      const initial = createInitialPlayDataV2(scenario, 4, 0);

      const finished = {
          ...initial,
          state: 'CLEARED' as const,
          endingId: 'TEST_CLEAR',
          version: 2,
      };

      await service.savePlayV2(playId, initial);

      const updated = await service.updatePlayV2IfVersion(
          playId, 1, finished,
      );

      expect(updated).toBe(false);
      expect(await service.getPlayV2(playId)).toEqual(initial);

      expect(
          await cleanupClient.get(
              `pending:v2:play-result:${playId}`,
          ),
      ).toBeNull();
  });

  test('V2 동시 종료 요청 중 하나만 pending을 생성한다', async () => {
      const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const scenario = await loadScenarioV2('apartment_fire_01');
      const initial = createInitialPlayDataV2(scenario, 4, 0);

      const resultA = {
          ...initial,
          state: 'CLEARED' as const,
          endingId: 'ENDING_A',
          version: 1,
      };

      const resultB = {
          ...initial,
          state: 'FAILED' as const,
          endingId: 'ENDING_B',
          version: 1,
      };

      await service.savePlayV2(playId, initial);

      const [savedA, savedB] = await Promise.all([
          service.updatePlayV2IfVersion(playId, 0, resultA),
          service.updatePlayV2IfVersion(playId, 0, resultB),
      ]);

      expect(savedA).not.toBe(savedB);

      const expected = savedA ? resultA : resultB;

      expect(await service.getPlayV2(playId)).toEqual(expected);

      const pending = await cleanupClient.get(
          `pending:v2:play-result:${playId}`,
      );

      expect(JSON.parse(pending!)).toEqual(expected);
  });

  test('V2 진행 중 행동은 pending을 생성하지 않는다', async () => {
      const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const scenario = await loadScenarioV2('apartment_fire_01');
      const initial = createInitialPlayDataV2(scenario, 4, 0);

      const next = executeActionV2(
          initial, scenario, 'E01-A',
      ).playData;

      await service.savePlayV2(playId, initial);

      expect(
          await service.updatePlayV2IfVersion(playId, 0, next),
      ).toBe(true);

      expect(next.state).toBe('PLAYING');

      expect(
          await cleanupClient.get(
              `pending:v2:play-result:${playId}`,
          ),
      ).toBeNull();
  });

  test('V2 GIVEN_UP 상태는 pending을 생성하지 않는다', async () => {
      const playId = `test-${randomUUID()}`;
      playIds.push(playId);

      const scenario = await loadScenarioV2('apartment_fire_01');
      const initial = createInitialPlayDataV2(scenario, 4, 0);

      const givenUp = {
          ...initial,
          state: 'GIVEN_UP' as const,
          version: 1,
      };

      await service.savePlayV2(playId, initial);

      expect(
          await service.updatePlayV2IfVersion(playId, 0, givenUp),
      ).toBe(true);

      expect(await service.getPlayV2(playId)).toEqual(givenUp);

      expect(
          await cleanupClient.get(
              `pending:v2:play-result:${playId}`,
          ),
      ).toBeNull();
  });
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { beforeAll, afterAll, test, expect } from 'vitest';

import { DatabaseService } from './database.service.js';

import type { PlayData } from '../plays/types/play.js';

import { createConnection, type Connection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

interface PlayResultRow extends RowDataPacket {
  user_no: number;
  scenario_id: string;
  score: number;
  result_state: string;
}


interface CountRow extends RowDataPacket {
  cnt: number;
}


let moduleRef: TestingModule;
let service: DatabaseService;
let verifyConnection: Connection;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        envFilePath: '../.env',
      }),
    ],
    providers: [DatabaseService],
  }).compile();

  service = moduleRef.get(DatabaseService);
  await moduleRef.init();

  verifyConnection = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

});

afterAll(async () => {
    await moduleRef.close();

    await verifyConnection.end();
});


test('종료된 플레이 결과를 MySQL에 저장한다', async () => {
    const playId = `test-result-${randomUUID()}`;

    const playData: PlayData = {
        userId: 4,
        userType: 0,
        score: 85,
        state: 'CLEARED',
        currentStep: 1,
        scenarioId: 'blackout_test_01',
    };


    try {

        await expect(service.savePlayResult(playId,playData)).resolves.toBeUndefined();
            const [rows] = await verifyConnection.execute<PlayResultRow[]>(
            `SELECT user_no, scenario_id, score, result_state
            FROM user_play_log
            WHERE play_id = ?`,
            [playId],
        );

        // expect() 검증
        expect(rows.length).toBe(1);
        expect(rows[0].user_no).toBe(playData.userId);
        expect(rows[0].scenario_id).toBe(playData.scenarioId);
        expect(rows[0].score).toBe(playData.score);
        expect(rows[0].result_state).toBe(playData.state);

        } finally {
            // 테스트 데이터 삭제
            await verifyConnection.execute(
                'DELETE FROM user_play_log WHERE play_id = ?',
                [playId],
        );
    }
    


});


test('진행 중인 플레이 결과는 저장하지 않는다', async () => {
    const playId = `test-playing-${randomUUID()}`;

    const playData: PlayData = {
        userId: 4,
        userType: 0,
        score: 85,
        state: 'PLAYING',
        currentStep: 1,
        scenarioId: 'blackout_test_01',
    };

    // 1. savePlayResult()에서 예외가 발생하는지 검증
    await expect(
            service.savePlayResult(playId, playData)
    ).rejects.toThrow('진행 중인 플레이는 저장할 수 없습니다.');

    // 2. SELECT로 실제 저장된 데이터가 없는지 검증

   // 2. 실제 MySQL에도 저장되지 않았는지 확인
    const [rows] = await verifyConnection.execute<PlayResultRow[]>(
    `SELECT user_no, scenario_id, score, result_state
    FROM user_play_log
    WHERE play_id = ?`,
    [playId],
    );

    expect(rows.length).toBe(0);
});



test('동일한 playId와 동일한 결과를 재저장하면 성공하고, DB에는 1건만 유지된다', async () => {
    const playId = `test-duplicate-${randomUUID()}`;

    const playData: PlayData = {
      userId: 4,
      userType: 0,
      score: 85,
      state: 'CLEARED',
      currentStep: 1,
      scenarioId: 'blackout_test_01',
    };

    try {
      // 1. 첫 번째 저장 성공
      await expect(
      service.savePlayResult(playId, playData)
      ).resolves.toBeUndefined();

      // 2. 동일한 결과를 다시 저장해도 오류 없이 성공하는지 확인
      await expect(
          service.savePlayResult(playId, playData)
          ).resolves.toBeUndefined();

      // 3. 재저장 이후에도 DB 기록이 정확히 1건인지 확인
      const [rows] = await verifyConnection.execute<CountRow[]>(
          `SELECT COUNT(*) AS cnt
          FROM user_play_log
          WHERE play_id = ?`,
          [playId],
      );

      expect(rows[0].cnt).toBe(1);


    } finally {
      await verifyConnection.execute(
        'DELETE FROM user_play_log WHERE play_id = ?',
        [playId],
      );
    }
});


test('동일한 playId에 서로 다른 결과를 저장하면 거절한다', async () => {
    const playId = `test-duplicate-${randomUUID()}`;

    const playData: PlayData = {
      userId: 4,
      userType: 0,
      score: 85,
      state: 'CLEARED',
      currentStep: 1,
      scenarioId: 'blackout_test_01',
    };

    try {
        await expect(
        service.savePlayResult(playId, playData)
      ).resolves.toBeUndefined();

      const modifiedPlayData = {
        ...playData,
        score: 80,
      };

      await expect(
        service.savePlayResult(playId, modifiedPlayData)
      ).rejects.toThrow('기존 플레이 결과와 저장 요청이 일치하지 않습니다.');

      const [rows] = await verifyConnection.execute<PlayResultRow[]>(
            `SELECT score
            FROM user_play_log
            WHERE play_id = ?`,
            [playId],
      );


      expect(rows.length).toBe(1);
      expect(rows[0].score).toBe(85);
    } finally {
        await verifyConnection.execute(
                'DELETE FROM user_play_log WHERE play_id = ?',
                [playId],
        );
    }
    

    


});


test('GIVEN_UP 상태의 플레이 결과는 MySQL에 저장하지 않는다', async () => {
    const playId = `test-givenup-${randomUUID()}`;

    const playData: PlayData = {
      userId: 4,
      userType: 0,
      score: 100,
      state: 'GIVEN_UP',
      currentStep: 1,
      scenarioId: 'blackout_test_01',
    };

    // 1. savePlayResult()가 저장을 거절하는지 검증
    await expect(
          service.savePlayResult(playId, playData)
    ).rejects.toThrow('이미 포기한 플레이는 저장할 수 없습니다.')
    // 2. MySQL에서 해당 playId 조회
    const [rows] = await verifyConnection.execute<PlayResultRow[]>(
      `SELECT user_no, scenario_id, score, result_state
      FROM user_play_log
      WHERE play_id = ?`,
      [playId],
    );


    // 3. 실제 저장된 결과가 0건인지 검증
    expect(rows.length).toBe(0);

});

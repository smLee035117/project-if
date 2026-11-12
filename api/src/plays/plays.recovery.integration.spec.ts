
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { createClient } from 'redis';
import { createConnection, type Connection } from 'mysql2/promise';
import { beforeAll, afterAll, test, expect, vi } from 'vitest';

import { PlaysService } from './plays.service.js';
import { RedisService } from '../redis/redis.service.js';
import { DatabaseService } from '../database/database.service.js';
import { createInitialPlayData } from './play-engine.js';

import type { RowDataPacket } from 'mysql2';

describe('Plays Recovery Integration', () => {
  let moduleRef: TestingModule;
  let playsService: PlaysService;
  let redisService: RedisService;
  let databaseService: DatabaseService;

  let verifyConnection: Connection;
  let cleanupClient: ReturnType<typeof createClient>;

  const playId = `test-recovery-${randomUUID()}`;
  let userId: number | null = null;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '../.env',
        }),
      ],
      providers: [
        PlaysService,
        RedisService,
        DatabaseService,
      ],
    }).compile();

    await moduleRef.init();

    playsService = moduleRef.get(PlaysService);
    redisService = moduleRef.get(RedisService);
    databaseService = moduleRef.get(DatabaseService);

    cleanupClient = createClient({
      url: 'redis://127.0.0.1:6379',
    });

    await cleanupClient.connect();

    verifyConnection = await createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
  });

  afterAll(async () => {
    // 테스트용 Redis 데이터 정리
    await cleanupClient.del([
      `play:${playId}`,
      `pending:play-result:${playId}`,
    ]);

    // 테스트용 MySQL 결과 정리
    await verifyConnection.execute(
      'DELETE FROM user_play_log WHERE play_id = ?',
      [playId],
    );

    // 테스트용 사용자 정리
    if (userId !== null) {
      await verifyConnection.execute(
        'DELETE FROM users WHERE user_no = ?',
        [userId],
      );
    }

    await verifyConnection.end();
    await cleanupClient.close();
    await moduleRef.close();
  });

  test('Redis pending 결과를 MySQL에 복구한다', async () => {
    userId = await databaseService.createGuestUser();

    const playData = createInitialPlayData(
      'blackout_test_01',
      userId,
      0,
    );
    playData.currentStep = 2;

    await redisService.savePlay(playId,playData);

    const completedData = {
        ...playData,
        state: 'CLEARED' as const,
    };

    const updated = await redisService.updatePlayIfCurrent(
        playId,
        playData.currentStep,
        completedData,
    );


    // CAS가 성공했는지
    expect(updated).toBe(true);

    // 실제 Redis에 pending 데이터가 생성됐는지
    const pending = await redisService.getPendingPlayResult(playId);
    expect(pending).toEqual(completedData);


    const scanSpy = vi.spyOn(redisService, 'scanPendingPlayIds')
    .mockResolvedValueOnce([playId]);

    try {
        await playsService.recoverPendingPlayResults();

        const [rows] = await verifyConnection.execute<RowDataPacket[]>(
            `SELECT user_no, scenario_id, score, result_state
            FROM user_play_log
            WHERE play_id = ?`,
            [playId],
        );

        expect(rows.length).toBe(1);
        expect(rows[0].user_no).toBe(userId);
        expect(rows[0].scenario_id).toBe(completedData.scenarioId);
        expect(rows[0].score).toBe(completedData.score);
        expect(rows[0].result_state).toBe('CLEARED');

        const pendingAfter =
            await redisService.getPendingPlayResult(playId);

        expect(pendingAfter).toBeNull();
    } finally {
        scanSpy.mockRestore();
    }

  });



    


});

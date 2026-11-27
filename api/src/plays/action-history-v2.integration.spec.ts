
import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { createClient } from 'redis';
import { createConnection, type Connection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

import {
  beforeAll,
  afterAll,
  test,
  expect,
  vi,
} from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { PlaysService } from './plays.service.js';

import { loadScenarioV2 } from './scenario-loader-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { executeActionV2 } from './action-engine-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';

import type { PlayDataV2 } from './types/play-v2.js';

interface HistoryRow extends RowDataPacket {
  action_history: unknown;
  ending_id: string;
  play_version: number;
}

let moduleRef: TestingModule;
let redisService: RedisService;
let databaseService: DatabaseService;
let playsService: PlaysService;

let connection: Connection;
let cleanupClient: ReturnType<typeof createClient>;
let userId: number;

const playIds: string[] = [];

function makePlayId(): string {
  const id = `test-history-${randomUUID()}`;
  playIds.push(id);
  return id;
}

function normalizeJson(value: unknown): unknown {
  return typeof value === 'string'
    ? JSON.parse(value)
    : value;
}

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        envFilePath: '../.env',
      }),
    ],
    providers: [
      DatabaseService,
      RedisService,
      PlaysService,
    ],
  }).compile();

  await moduleRef.init();

  redisService = moduleRef.get(RedisService);
  databaseService = moduleRef.get(DatabaseService);
  playsService = moduleRef.get(PlaysService);

  cleanupClient = createClient({
    url: 'redis://127.0.0.1:6379',
  });

  await cleanupClient.connect();

  connection = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  userId = await databaseService.createGuestUser();
});

afterAll(async () => {
  try {
    if (connection) {
      for (const playId of playIds) {
        await connection.execute(
          'DELETE FROM user_play_log_v2 WHERE play_id = ?',
          [playId],
        );
      }

      if (userId !== undefined) {
        await connection.execute(
          'DELETE FROM users WHERE user_no = ?',
          [userId],
        );
      }
    }

    if (cleanupClient?.isReady) {
        for (const playId of playIds) {
            await cleanupClient.del([
            `play:v2:${playId}`,
            `pending:v2:play-result:${playId}`,
            ]);
        }

        if (userId !== undefined) {
            await cleanupClient.del(
                `active:v2:${userId}:apartment_fire_01`,
            );
        }
    }
  } finally {
    if (connection) {
      await connection.end();
    }

    if (cleanupClient?.isOpen) {
      await cleanupClient.close();
    }

    if (moduleRef) {
      await moduleRef.close();
    }
  }
});

test(
  '행동 1회가 이력 1건을 생성하고 원본은 변경하지 않는다',
  async () => {
    const scenario = await loadScenarioV2(
      'apartment_fire_01',
    );

    const initial = createInitialPlayDataV2(
      scenario,
      userId,
      0,
    );

    expect(initial.actionHistory).toEqual([]);

    const result = executeActionV2(
      initial,
      scenario,
      'F_START_CALL',
    );

    expect(initial.actionHistory).toEqual([]);
    expect(result.playData.actionHistory).toHaveLength(1);

    expect(result.playData.actionHistory?.[0]).toMatchObject({
      sequence: 1,
      fromSceneId: 'F_LIVING',
      actionId: 'F_START_CALL',
      actionText: expect.any(String),
      resultText: result.resultText,
      startedAtMinute: 0,
      endedAtMinute: 1,
    });

    const view = buildPlayViewV2(
      result.playData,
      scenario,
    );

    expect(view.actionHistory).toBeUndefined();

    expect(JSON.stringify(view))
      .not.toContain('scenarioState');
  },
);

test(
  '종료 이력이 CAS, Pending, MySQL에 동일하게 저장되고 복구된다',
  async () => {
    const scenario = await loadScenarioV2(
      'apartment_fire_01',
    );

    const playId = makePlayId();

    let current: PlayDataV2 = createInitialPlayDataV2(
      scenario,
      userId,
      0,
    );

    await redisService.savePlayV2(playId, current);

    const actions = [
      'F_START_WAIT',
      'F_START_WAIT',
      'F_START_WAIT',
      'F_START_WAIT',
      'F_START_WAIT',
      'F_START_WAIT',
      'F_INSIDE_END',
    ];

    for (const actionId of actions) {
      const next = executeActionV2(
        current,
        scenario,
        actionId,
      ).playData;

      const updated =
        await redisService.updatePlayV2IfVersion(
          playId,
          current.version,
          next,
        );

      expect(updated).toBe(true);
      current = next;
    }

    expect(current.state).toBe('CLEARED');
    expect(current.endingId).toBe('SAFE_INSIDE');
    expect(current.actionHistory).toHaveLength(7);

    expect(
      current.actionHistory?.map(
        (entry) => entry.sequence,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const saved =
      await redisService.getPlayV2(playId);

    const pending =
      await redisService.getPendingPlayResultV2(playId);

    expect(saved?.actionHistory)
      .toEqual(current.actionHistory);

    expect(pending?.actionHistory)
      .toEqual(current.actionHistory);

    const view = buildPlayViewV2(
      current,
      scenario,
    );

    expect(view.ending?.id).toBe('SAFE_INSIDE');
    expect(view.actionHistory).toHaveLength(7);

    expect(view.actionHistory?.[6]?.actionId)
      .toBe('F_INSIDE_END');

    expect(JSON.stringify(view))
      .not.toContain('scenarioState');

    const scanSpy = vi.spyOn(
      redisService,
      'scanPendingPlayIdsV2',
    ).mockResolvedValue([playId]);

    try {
      await playsService.recoverPendingPlayResultsV2();
    } finally {
      scanSpy.mockRestore();
    }

    const [rows] = await connection.execute<HistoryRow[]>(
      `SELECT
         action_history,
         ending_id,
         play_version
       FROM user_play_log_v2
       WHERE play_id = ?`,
      [playId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.ending_id).toBe('SAFE_INSIDE');
    expect(rows[0]?.play_version).toBe(7);

    expect(normalizeJson(rows[0]?.action_history))
      .toEqual(current.actionHistory);

    expect(
      await redisService.getPendingPlayResultV2(playId),
    ).toBeNull();

    // 동일한 이력 재저장은 허용
    await databaseService.savePlayResultV2(
      playId,
      current,
    );

    // 종료 결과가 같아도 이력이 다르면 거부
    const tampered = structuredClone(current);

    tampered.actionHistory![0]!.resultText =
      '조작된 결과';

    await expect(
      databaseService.savePlayResultV2(
        playId,
        tampered,
      ),
    ).rejects.toThrow(
      '기존 V2 플레이 결과와 저장 요청이 일치하지 않습니다.',
    );
  },
);

test(
  '동시 행동 중 CAS에 성공한 이력만 저장된다',
  async () => {
    const scenario = await loadScenarioV2(
      'apartment_fire_01',
    );

    const playId = makePlayId();

    const initial = createInitialPlayDataV2(
      scenario,
      userId,
      0,
    );

    await redisService.savePlayV2(
      playId,
      initial,
    );

    const first = executeActionV2(
      initial,
      scenario,
      'F_START_CALL',
    ).playData;

    const second = executeActionV2(
      initial,
      scenario,
      'F_START_NEWS',
    ).playData;

    const [firstSucceeded, secondSucceeded] =
      await Promise.all([
        redisService.updatePlayV2IfVersion(
          playId,
          0,
          first,
        ),
        redisService.updatePlayV2IfVersion(
          playId,
          0,
          second,
        ),
      ]);

    // 정확히 하나의 요청만 성공
    expect(
      Number(firstSucceeded) +
      Number(secondSucceeded),
    ).toBe(1);

    const stored =
      await redisService.getPlayV2(playId);

    expect(stored?.version).toBe(1);
    expect(stored?.actionHistory).toHaveLength(1);

    const expectedActionId = firstSucceeded
      ? 'F_START_CALL'
      : 'F_START_NEWS';

    expect(stored?.actionHistory?.[0]?.actionId)
      .toBe(expectedActionId);

    expect(stored?.actionHistory?.[0]?.sequence)
      .toBe(1);

    expect(stored?.actionHistory?.[0]?.endedAtMinute)
      .toBe(stored?.storyTimeMinutes);
  },
);

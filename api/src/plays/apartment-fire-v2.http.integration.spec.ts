
import { Test } from '@nestjs/testing';
import {
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import cookieParser from 'cookie-parser';
import request from 'supertest';
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

import { PlaysModule } from './plays.module.js';
import { PlaysService } from './plays.service.js';
import { RedisService } from '../redis/redis.service.js';
import { DatabaseService } from '../database/database.service.js';

import { loadScenarioV2 } from './scenario-loader-v2.js';
import { selectFireVariantV2 } from './fire-variant-v2.js';

// API 생성 경로는 유지하고 상황 선택 결과만 고정합니다.
vi.mock('./fire-variant-v2.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./fire-variant-v2.js')>();

  return {
    ...original,
    selectFireVariantV2: vi.fn(original.selectFireVariantV2),
  };
});

interface ResultRow extends RowDataPacket {
  user_no: number;
  scenario_id: string;
  scenario_version: string;
  result_state: string;
  ending_id: string;
  play_version: number;
  story_time_minutes: number;
}

let app: INestApplication;
let redisService: RedisService;
let databaseService: DatabaseService;
let playsService: PlaysService;
let connection: Connection;
let cleanupClient: ReturnType<typeof createClient>;

const playIds: string[] = [];
const userIds = new Set<number>();

type Variant = 'X' | 'Y' | 'Z';

async function startFirePlay(variant: Variant = 'X') {
  // 생성 순간의 선택만 고정합니다. Redis를 사후 수정하지 않습니다.
  vi.mocked(selectFireVariantV2).mockReturnValueOnce(variant);

  const response = await request(app.getHttpServer())
    .post('/v2/plays')
    .send({ scenarioId: 'apartment_fire_01' });

  expect(response.status).toBe(201);

  const playId: string = response.body.playId;
  playIds.push(playId);

  const cookieHeader = response.headers['set-cookie'];
  const rawCookie = Array.isArray(cookieHeader)
    ? cookieHeader[0]
    : cookieHeader;

  if (typeof rawCookie !== 'string') {
    throw new Error('게스트 쿠키가 없습니다.');
  }

  const cookie = rawCookie.split(';')[0];
  const original = await redisService.getPlayV2(playId);

  expect(original).not.toBeNull();

  if (!original) {
    throw new Error('Redis 플레이 생성 실패');
  }

  userIds.add(original.userId);

  expect(original.scenarioId).toBe('apartment_fire_01');
  expect(original.scenarioState.world.incidentVariant).toBe(variant);
  expect(original.version).toBe(0);

  return { playId, cookie, version: 0, userId: original.userId };
}

function submitAction(
  playId: string,
  cookie: string,
  actionId: string,
  expectedVersion: number,
) {
  return request(app.getHttpServer())
    .post(`/v2/plays/${playId}/actions`)
    .set('Cookie', cookie)
    .send({ actionId, expectedVersion });
}

async function getSavedResults(playId: string): Promise<ResultRow[]> {
  const [rows] = await connection.execute<ResultRow[]>(
    `SELECT
       user_no,
       scenario_id,
       scenario_version,
       result_state,
       ending_id,
       play_version,
       story_time_minutes
     FROM user_play_log_v2
     WHERE play_id = ?`,
    [playId],
  );

  return rows;
}

// X 상황에서 12분까지 대기하여 F_CLEAR에 도달
async function advanceXToClear(
  playId: string,
  cookie: string,
  startVersion = 0,
) {
  let version = startVersion;

  for (let i = 0; i < 6; i++) {
    const response = await submitAction(
      playId,
      cookie,
      'F_START_WAIT',
      version,
    );

    expect(response.status).toBe(200);

    version++;

    expect(response.body.view.version).toBe(version);
    expect(response.body.view.storyTimeMinutes).toBe(
      (i + 1) * 2,
    );
  }

  const play = await redisService.getPlayV2(playId);

  expect(play?.currentStageId).toBe('F_CLEAR');
  expect(play?.scenarioState.world.clear).toBe(true);

  return version;
}

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');

  // 테스트 전 실제 화재 JSON 로딩 확인
  const scenario = await loadScenarioV2(
    'apartment_fire_01',
  );

  expect(scenario.schemaVersion).toBe(2);

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '../.env',
      }),
      PlaysModule,
    ],
  }).compile();

  app = moduleRef.createNestApplication();

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe());

  await app.init();

  redisService = app.get(RedisService);
  databaseService = app.get(DatabaseService);
  playsService = app.get(PlaysService);

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
});

afterAll(async () => {
  try {
    // 테스트에서 생성한 결과와 계정만 정리합니다.
    if (connection) {
      for (const playId of playIds) {
        await connection.execute(
          'DELETE FROM user_play_log_v2 WHERE play_id = ?',
          [playId],
        );
      }

      for (const userId of userIds) {
        await connection.execute(
          'DELETE FROM guest_sessions WHERE user_no = ?',
          [userId],
        );

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
    }
  } finally {
    if (connection) await connection.end();

    if (cleanupClient?.isOpen) {
      await cleanupClient.close();
    }

    if (app) await app.close();

    vi.unstubAllEnvs();
  }
});

// ---------------------------------------------------------
// 1. X 상황 실제 API 정상 완주
// ---------------------------------------------------------
test('실제 화재 X: HTTP 완주와 Redis/MySQL 결과가 일치한다', async () => {
  const { playId, cookie, userId } = await startFirePlay();

  const initial = await request(app.getHttpServer())
    .get(`/v2/plays/${playId}`)
    .set('Cookie', cookie);

  expect(initial.status).toBe(200);
  expect(initial.body.state).toBe('PLAYING');
  expect(initial.body.version).toBe(0);

  // 외부 응답에 비공개 상태를 노출하지 않습니다.
  expect(JSON.stringify(initial.body))
    .not.toContain('scenarioState');
  expect(JSON.stringify(initial.body))
    .not.toContain('incidentVariant');

  const version = await advanceXToClear(playId, cookie);

  expect(version).toBe(6);

  const finished = await submitAction(
    playId,
    cookie,
    'F_INSIDE_END',
    version,
  );

  expect(finished.status).toBe(200);

  expect(finished.body.view).toMatchObject({
    state: 'CLEARED',
    version: 7,
    storyTimeMinutes: 13,
    ending: {
      id: 'SAFE_INSIDE',
    },
  });

  expect(finished.body.view.actions).toEqual([]);

  const redisData = await redisService.getPlayV2(playId);

  expect(redisData?.state).toBe('CLEARED');
  expect(redisData?.endingId).toBe('SAFE_INSIDE');
  expect(redisData?.version).toBe(7);
  expect(redisData?.timelineProgress.pending).toEqual({});

  const rows = await getSavedResults(playId);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    user_no: userId,
    scenario_id: 'apartment_fire_01',
    result_state: 'CLEARED',
    ending_id: 'SAFE_INSIDE',
    play_version: 7,
    story_time_minutes: 13,
  });

  expect(rows[0]?.scenario_version)
    .toBe(redisData?.scenarioVersion);

  expect(
    await redisService.getPendingPlayResultV2(playId),
  ).toBeNull();

  // 종료 후 같은 행동을 다시 제출해도 결과는 변하지 않습니다.
  const repeated = await submitAction(
    playId,
    cookie,
    'F_INSIDE_END',
    7,
  );

  expect(repeated.status).toBe(409);
  expect(await getSavedResults(playId)).toHaveLength(1);
});

// ---------------------------------------------------------
// 2. Y 상황 실제 API 실패 엔딩
// ---------------------------------------------------------
test('실제 화재 Y: 계단 연기 노출 후 FAILED 결과를 저장한다', async () => {
  const { playId, cookie, version: initialVersion } =
    await startFirePlay('Y');

  let version = initialVersion;

  const steps = [
    ['F_START_DOOR', 'F_ENTRY', 1],
    ['F_ENTER_HALL', 'F_STAIR_DOOR', 3],
    ['F_CHECK_STAIR', 'F_STAIR_VIEW', 4],
    ['F_DESCEND', 'F_UPPER', 6],
    ['F_FORCE_DOWN', 'F_UPPER', 8],
  ] as const;

  for (const [actionId, sceneId, minute] of steps) {
    const response = await submitAction(
      playId,
      cookie,
      actionId,
      version,
    );

    expect(response.status).toBe(200);

    version++;

    expect(response.body.view.currentSceneId).toBe(sceneId);
    expect(response.body.view.storyTimeMinutes).toBe(minute);
    expect(response.body.view.version).toBe(version);
  }

  const redisData = await redisService.getPlayV2(playId);

  expect(redisData?.scenarioState.world.stairSmoke).toBe(true);
  expect(redisData?.scenarioState.player.exposed).toBe(true);
  expect(redisData?.scenarioState.player.incapacitated).toBe(true);

  expect(redisData?.state).toBe('FAILED');
  expect(redisData?.endingId).toBe('EXPOSURE_FAILURE');

  const rows = await getSavedResults(playId);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    result_state: 'FAILED',
    ending_id: 'EXPOSURE_FAILURE',
    story_time_minutes: 8,
    play_version: version,
  });

  expect(
    await redisService.getPendingPlayResultV2(playId),
  ).toBeNull();
});

// ---------------------------------------------------------
// 3. 게스트 소유권 및 과거 버전 요청
// ---------------------------------------------------------
test('다른 게스트와 과거 버전 요청을 거절한다', async () => {
  const owner = await startFirePlay();
  const other = await startFirePlay();

  const noCookie = await request(app.getHttpServer())
    .get(`/v2/plays/${owner.playId}`);

  expect(noCookie.status).toBe(401);

  const wrongOwner = await request(app.getHttpServer())
    .get(`/v2/plays/${owner.playId}`)
    .set('Cookie', other.cookie);

  expect(wrongOwner.status).toBe(404);

  const first = await submitAction(
    owner.playId,
    owner.cookie,
    'F_START_CALL',
    0,
  );

  expect(first.status).toBe(200);
  expect(first.body.view.version).toBe(1);

  // 이미 사용한 expectedVersion = 0
  const stale = await submitAction(
    owner.playId,
    owner.cookie,
    'F_START_NEWS',
    0,
  );

  expect(stale.status).toBe(409);

  const redisData = await redisService.getPlayV2(owner.playId);

  expect(redisData?.version).toBe(1);
  expect(redisData?.storyTimeMinutes).toBe(1);
});

// ---------------------------------------------------------
// 4. 실제 Redis CAS 동시 행동 처리
// ---------------------------------------------------------
test('동일 버전의 동시 행동 요청 중 하나만 성공한다', async () => {
  const { playId, cookie } = await startFirePlay();

  const [responseA, responseB] = await Promise.all([
    submitAction(playId, cookie, 'F_START_CALL', 0),
    submitAction(playId, cookie, 'F_START_NEWS', 0),
  ]);

  expect(
    [responseA.status, responseB.status].sort(),
  ).toEqual([200, 409]);

  const redisData = await redisService.getPlayV2(playId);

  expect(redisData?.state).toBe('PLAYING');
  expect(redisData?.version).toBe(1);

  // 진행 중인 플레이는 MySQL 결과 테이블에 저장하지 않습니다.
  expect(await getSavedResults(playId)).toHaveLength(0);
});

// ---------------------------------------------------------
// 5. 실제 화재 종료 시 MySQL 장애와 Pending 복구
// ---------------------------------------------------------
test('실제 화재 종료 시 DB 장애가 나면 Pending으로 복구한다', async () => {
  const { playId, cookie } = await startFirePlay();

  const version = await advanceXToClear(playId, cookie);

  // 실제 DB 연결은 유지하고 저장 메서드만 한 번 실패시킵니다.
  const saveSpy = vi.spyOn(
    databaseService,
    'savePlayResultV2',
  ).mockRejectedValueOnce(
    new Error('F-1-5 의도적인 MySQL 저장 장애'),
  );

  try {
    const response = await submitAction(
      playId,
      cookie,
      'F_INSIDE_END',
      version,
    );

    expect(response.status).toBe(500);
  } finally {
    saveSpy.mockRestore();
  }

  // HTTP 500이어도 Redis 종료 상태와 Pending은 남아야 합니다.
  const redisData = await redisService.getPlayV2(playId);

  expect(redisData?.state).toBe('CLEARED');
  expect(redisData?.endingId).toBe('SAFE_INSIDE');
  expect(redisData?.version).toBe(7);

  const pending = await redisService.getPendingPlayResultV2(playId);

  expect(pending?.state).toBe('CLEARED');
  expect(pending?.endingId).toBe('SAFE_INSIDE');

  expect(await getSavedResults(playId)).toHaveLength(0);

  // 다른 테스트 플레이에 영향을 주지 않도록
  // 이번 playId만 복구 대상으로 제한합니다.
  const scanSpy = vi.spyOn(
    redisService,
    'scanPendingPlayIdsV2',
  ).mockResolvedValue([playId]);

  try {
    await playsService.recoverPendingPlayResultsV2();
  } finally {
    scanSpy.mockRestore();
  }

  const rows = await getSavedResults(playId);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    result_state: 'CLEARED',
    ending_id: 'SAFE_INSIDE',
    story_time_minutes: 13,
    play_version: 7,
  });

  expect(
    await redisService.getPendingPlayResultV2(playId),
  ).toBeNull();

  // 복구 후에도 재행동 불가
  const repeated = await submitAction(
    playId,
    cookie,
    'F_INSIDE_END',
    7,
  );

  expect(repeated.status).toBe(409);
});

// ---------------------------------------------------------
// 6. 실제 생성한 Z 상황이 행동 후에도 유지되는지 검증
// ---------------------------------------------------------
test('실제 화재 Z: 생성한 상황이 유지되고 외부로 공개되지 않는다', async () => {
  const { playId, cookie, version } = await startFirePlay('Z');

  const response = await submitAction(
    playId, cookie, 'F_START_WAIT', version,
  );

  expect(response.status).toBe(200);
  expect(response.body.view.version).toBe(1);
  expect(response.body.view.storyTimeMinutes).toBe(2);

  const redisData = await redisService.getPlayV2(playId);

  expect(redisData?.scenarioState.world.incidentVariant).toBe('Z');
  expect(redisData?.version).toBe(1);

  const fetched = await request(app.getHttpServer())
    .get(`/v2/plays/${playId}`)
    .set('Cookie', cookie);

  expect(fetched.status).toBe(200);
  expect(fetched.body.version).toBe(1);

  expect(JSON.stringify(fetched.body))
    .not.toContain('incidentVariant');
});

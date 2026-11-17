import { Test } from '@nestjs/testing';
import {
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';

import request from 'supertest';
import cookieParser from 'cookie-parser';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';

import { PlaysV2Controller } from './plays-v2.controller.js';
import { PlaysService } from './plays.service.js';

import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

import { loadScenarioV2 } from './scenario-loader-v2.js';

// Keep HTTP contracts independent of frequently revised narrative JSON.
vi.mock('./scenario-loader-v2.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./scenario-loader-v2.js')>();

  return {
    ...original,
    loadScenarioV2: async (scenarioId: string) => {
      if (scenarioId === 'v2_test_01') {
        const { createV2TestScenario } =
          await import('./test-fixtures/v2-test-scenario.js');
        return createV2TestScenario();
      }
      return original.loadScenarioV2(scenarioId);
    },
  };
});

import { createInitialPlayDataV2 } from './play-engine-v2.js';

describe('Plays V2 HTTP', () => {
  let app: INestApplication;

  const databaseMock = {
    createGuestWithSession: vi.fn(),
    findGuestUserId: vi.fn(),
  };

  const redisMock = {
    savePlayV2: vi.fn(),
    getPlayV2: vi.fn(),
     updatePlayV2IfVersion: vi.fn(),
  };

  const validToken = 'a'.repeat(64);

  beforeAll(async () => {
    const moduleRef =
      await Test.createTestingModule({
        controllers: [PlaysV2Controller],
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

    app = moduleRef.createNestApplication();

    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());

    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();

    databaseMock.createGuestWithSession
      .mockResolvedValue(4);

    redisMock.savePlayV2
      .mockResolvedValue(undefined);

    redisMock.updatePlayV2IfVersion.mockResolvedValue(false);
  });

  afterAll(async () => {
    await app.close();
  });

  it('V2 플레이 생성 시 안전한 응답과 쿠키를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/v2/plays')
      .send({
        scenarioId: 'v2_test_01',
      });

    expect(response.status).toBe(201);

    expect(response.body.playId)
      .toEqual(expect.any(String));

    expect(response.body.view).toMatchObject({
      scenarioId: 'v2_test_01',
      state: 'PLAYING',
      version: 0,
      currentSceneId: 'E01',
      storyTimeMinutes: 0,
    });

    const bodyText = JSON.stringify(response.body);

    expect(bodyText).not.toContain('scenarioState');
    expect(bodyText).not.toContain('insideSmoke');
    expect(bodyText).not.toContain('"userId"');
    expect(bodyText).not.toContain('"outcomes"');

    expect(redisMock.savePlayV2)
      .toHaveBeenCalledWith(
        response.body.playId,
        expect.objectContaining({
          scenarioId: 'v2_test_01',
          userId: 4,
          version: 0,
        }),
      );

    const cookies = response.headers['set-cookie'];

    expect(JSON.stringify(cookies))
      .toContain('guest_token=');

    expect(JSON.stringify(cookies))
      .toContain('HttpOnly');
  });

  it('본인 플레이를 조회하면 공개 정보만 반환한다', async () => {
    const scenario =
      await loadScenarioV2('v2_test_01');

    const playData =
      createInitialPlayDataV2(scenario, 4, 0);

    playData.version = 3;

    databaseMock.findGuestUserId
      .mockResolvedValueOnce(4);

    redisMock.getPlayV2
      .mockResolvedValueOnce(playData);

    const response = await request(app.getHttpServer())
      .get('/v2/plays/test-play')
      .set('Cookie', `guest_token=${validToken}`);

    expect(response.status).toBe(200);

    expect(response.body.version).toBe(3);
    expect(response.body.currentSceneId).toBe('E01');

    expect(JSON.stringify(response.body))
      .not.toContain('insideSmoke');

    expect(redisMock.getPlayV2)
      .toHaveBeenCalledWith('test-play');
  });

  it('쿠키가 없으면 조회를 거부한다', async () => {
    const response = await request(app.getHttpServer())
      .get('/v2/plays/test-play');

    expect(response.status).toBe(401);

    expect(redisMock.getPlayV2)
      .not.toHaveBeenCalled();
  });

  it('다른 사용자의 플레이 조회를 거부한다', async () => {
    const scenario =
      await loadScenarioV2('v2_test_01');

    const playData =
      createInitialPlayDataV2(scenario, 4, 0);

    databaseMock.findGuestUserId
      .mockResolvedValueOnce(9);

    redisMock.getPlayV2
      .mockResolvedValueOnce(playData);

    const response = await request(app.getHttpServer())
      .get('/v2/plays/test-play')
      .set('Cookie', `guest_token=${validToken}`);

    expect(response.status).toBe(404);
  });

  it('만료되거나 없는 플레이는 404를 반환한다', async () => {
    databaseMock.findGuestUserId
      .mockResolvedValueOnce(4);

    redisMock.getPlayV2
      .mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer())
      .get('/v2/plays/missing-play')
      .set('Cookie', `guest_token=${validToken}`);

    expect(response.status).toBe(404);
  });

  it('등록되지 않은 V2 시나리오는 404를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/v2/plays')
      .send({
        scenarioId: 'unknown_scenario',
      });

    expect(response.status).toBe(404);

    expect(redisMock.savePlayV2)
      .not.toHaveBeenCalled();

    expect(databaseMock.createGuestWithSession)
      .not.toHaveBeenCalled();
  });

  it('잘못된 시나리오 ID 타입은 400을 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/v2/plays')
      .send({
        scenarioId: 123,
      });

    expect(response.status).toBe(400);

    expect(redisMock.savePlayV2)
      .not.toHaveBeenCalled();
  });


  async function prepareOwnedV2Play() {
    const scenario = await loadScenarioV2('v2_test_01');
    const playData = createInitialPlayDataV2(scenario, 4, 0);

    databaseMock.findGuestUserId.mockResolvedValue(4);
    redisMock.getPlayV2.mockResolvedValue(playData);

    return playData;
  }

    it('V2 행동 실행 성공 시 결과와 변경된 view를 반환한다', async () => {
    await prepareOwnedV2Play();

    redisMock.updatePlayV2IfVersion.mockResolvedValueOnce(true);

    const response = await request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .set('Cookie', `guest_token=${validToken}`)
        .send({
        actionId: 'E01-A',
        expectedVersion: 0,
        });

    expect(response.status).toBe(200);
    expect(response.body.resultText)
        .toBe('119에 현재 상황을 신고했습니다.');

    expect(response.body.view).toMatchObject({
        state: 'PLAYING',
        version: 1,
        storyTimeMinutes: 1,
        currentSceneId: 'E01',
    });

    expect(response.body.view.actions[0].available)
        .toBe(false);

    expect(JSON.stringify(response.body))
        .not.toContain('insideSmoke');

    expect(redisMock.updatePlayV2IfVersion)
        .toHaveBeenCalledWith(
        'test-play',
        0,
        expect.objectContaining({
            version: 1,
            storyTimeMinutes: 1,
            scenarioState: expect.objectContaining({
            player: expect.objectContaining({
                reported119: true,
            }),
            }),
        }),
        );
    });

    it('이미 변경된 플레이 버전으로 행동을 요청하면 409를 반환한다', async () => {
    const playData = await prepareOwnedV2Play();

    playData.version = 1;

    const response = await request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .set('Cookie', `guest_token=${validToken}`)
        .send({
        actionId: 'E01-A',
        expectedVersion: 0,
        });

    expect(response.status).toBe(409);

    expect(redisMock.updatePlayV2IfVersion)
        .not.toHaveBeenCalled();
    });

    it('V2 동시 행동 요청 중 하나만 성공한다', async () => {
    await prepareOwnedV2Play();

    redisMock.updatePlayV2IfVersion
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

    const submit = () =>
        request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .set('Cookie', `guest_token=${validToken}`)
        .send({
            actionId: 'E01-A',
            expectedVersion: 0,
        });

    const [responseA, responseB] = await Promise.all([
        submit(),
        submit(),
    ]);

    expect(
        [responseA.status, responseB.status].sort(),
    ).toEqual([200, 409]);

    expect(redisMock.updatePlayV2IfVersion)
        .toHaveBeenCalledTimes(2);
    });

    it('존재하지 않는 행동 ID를 거부한다', async () => {
    await prepareOwnedV2Play();

    const response = await request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .set('Cookie', `guest_token=${validToken}`)
        .send({
        actionId: 'UNKNOWN_ACTION',
        expectedVersion: 0,
        });

    expect(response.status).toBe(400);

    expect(redisMock.updatePlayV2IfVersion)
        .not.toHaveBeenCalled();
    });

    it('현재 실행할 수 없는 행동을 거부한다', async () => {
    const playData = await prepareOwnedV2Play();

    playData.scenarioState.player.reported119 = true;

    const response = await request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .set('Cookie', `guest_token=${validToken}`)
        .send({
        actionId: 'E01-A',
        expectedVersion: 0,
        });

    expect(response.status).toBe(409);

    expect(redisMock.updatePlayV2IfVersion)
        .not.toHaveBeenCalled();
    });

    it('쿠키 없는 행동 요청을 거부한다', async () => {
    const response = await request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .send({
        actionId: 'E01-A',
        expectedVersion: 0,
        });

    expect(response.status).toBe(401);

    expect(redisMock.updatePlayV2IfVersion)
        .not.toHaveBeenCalled();
    });

    it('다른 사용자의 플레이 변경을 거부한다', async () => {
    await prepareOwnedV2Play();

    databaseMock.findGuestUserId.mockResolvedValue(9);

    const response = await request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .set('Cookie', `guest_token=${validToken}`)
        .send({
        actionId: 'E01-A',
        expectedVersion: 0,
        });

    expect(response.status).toBe(404);

    expect(redisMock.updatePlayV2IfVersion)
        .not.toHaveBeenCalled();
    });

    it('잘못된 expectedVersion 값을 거부한다', async () => {
    const response = await request(app.getHttpServer())
        .post('/v2/plays/test-play/actions')
        .set('Cookie', `guest_token=${validToken}`)
        .send({
        actionId: 'E01-A',
        expectedVersion: -1,
        });

    expect(response.status).toBe(400);

    expect(redisMock.updatePlayV2IfVersion)
        .not.toHaveBeenCalled();
    });
});
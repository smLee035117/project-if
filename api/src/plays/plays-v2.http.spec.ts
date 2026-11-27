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
    afterEach,
    vi,
} from 'vitest';

import { PlaysV2Controller } from './plays-v2.controller.js';
import { PlaysService } from './plays.service.js';

import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

import { loadScenarioV2 } from './scenario-loader-v2.js';

import { isLoopbackRequest } from './local-request.js';

vi.mock('./local-request.js', () => ({
    isLoopbackRequest: vi.fn(),
}));

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
    getActivePlayIdV2: vi.fn(),
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
        .mockResolvedValue('CREATED');

      redisMock.getActivePlayIdV2
        .mockResolvedValue(null);

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

    expect(JSON.stringify(cookies))
        .toContain('Max-Age=604800');
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


    describe('시나리오 공개 정책', () => {

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        it.each([
            ['production', true, 404],
            ['production', false, 404],
            ['development', true, 201],
            ['development', false, 404],
            ['test', true, 201],
            ['test', false, 201],
            [undefined, true, 404],
            ['unknown', true, 404],
        ] as const)(
            '환경=%s, 로컬 접속=%s → 비공개 시나리오 응답 %s',
            async (environment, isLoopback, expectedStatus) => {

                vi.stubEnv('NODE_ENV', environment);

                vi.mocked(isLoopbackRequest)
                    .mockReturnValue(isLoopback);

                const response = await request(app.getHttpServer())
                    .post('/v2/plays')
                    .send({
                        scenarioId: 'apartment_fire_01',
                    });

                expect(response.status).toBe(expectedStatus);

                if (expectedStatus === 404) {
                    expect(databaseMock.createGuestWithSession)
                        .not.toHaveBeenCalled();

                    expect(redisMock.savePlayV2)
                        .not.toHaveBeenCalled();
                } else {
                    expect(redisMock.savePlayV2)
                        .toHaveBeenCalledTimes(1);
                }
            },
        );

        it('운영 환경에서도 공개 시나리오는 시작할 수 있다', async () => {

            vi.stubEnv('NODE_ENV', 'production');

            vi.mocked(isLoopbackRequest)
                .mockReturnValue(false);

            const response = await request(app.getHttpServer())
                .post('/v2/plays')
                .send({
                    scenarioId: 'office_fire_01',
                });

            expect(response.status).toBe(201);

            expect(response.body.view.scenarioId)
                .toBe('office_fire_01');

            expect(redisMock.savePlayV2)
                .toHaveBeenCalledTimes(1);
        });

    });


    it('V2 활성 플레이 조회 시 기존 playId와 공개 view를 반환한다', async () => {
        const playData = await prepareOwnedV2Play();

        playData.version = 3;

        redisMock.getActivePlayIdV2
            .mockResolvedValue('test-play');

        const response = await request(app.getHttpServer())
            .get('/v2/plays/active/v2_test_01')
            .set('Cookie', `guest_token=${validToken}`);

        expect(response.status).toBe(200);

        expect(response.body.activePlay).toMatchObject({
            playId: 'test-play',
            view: {
                scenarioId: 'v2_test_01',
                state: 'PLAYING',
                version: 3,
            },
        });

        expect(redisMock.getActivePlayIdV2)
            .toHaveBeenCalledWith(4, 'v2_test_01');

        expect(redisMock.getPlayV2)
            .toHaveBeenCalledWith('test-play');

        expect(databaseMock.findGuestUserId)
            .toHaveBeenCalledTimes(1);

        const bodyText = JSON.stringify(response.body);

        expect(bodyText).not.toContain('"userId"');
        expect(bodyText).not.toContain('scenarioState');
        expect(bodyText).not.toContain('insideSmoke');
    });


    it('V2 활성 플레이가 없으면 activePlay null을 반환한다', async () => {
        databaseMock.findGuestUserId
            .mockResolvedValue(4);

        redisMock.getActivePlayIdV2
            .mockResolvedValue(null);

        const response = await request(app.getHttpServer())
            .get('/v2/plays/active/v2_test_01')
            .set('Cookie', `guest_token=${validToken}`);

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            activePlay: null,
        });

        expect(redisMock.getPlayV2)
            .not.toHaveBeenCalled();
    });


    it('V2 쿠키 없는 활성 플레이 조회를 거부한다', async () => {
        const response = await request(app.getHttpServer())
            .get('/v2/plays/active/v2_test_01');

        expect(response.status).toBe(401);

        expect(redisMock.getActivePlayIdV2)
            .not.toHaveBeenCalled();
    });

    it('V2 만료된 게스트 세션의 활성 플레이 조회를 거부한다', async () => {
        databaseMock.findGuestUserId
            .mockResolvedValue(null);

        const response = await request(app.getHttpServer())
            .get('/v2/plays/active/v2_test_01')
            .set('Cookie', `guest_token=${validToken}`);

        expect(response.status).toBe(401);

        expect(redisMock.getActivePlayIdV2)
            .not.toHaveBeenCalled();
    });


    it.each([
        'MISSING',
        'WRONG_OWNER',
        'WRONG_SCENARIO',
        'FINISHED',
    ] as const)(
        'V2 유효하지 않은 활성 플레이(%s)는 null을 반환한다',
        async (condition) => {
            const playData = await prepareOwnedV2Play();

            redisMock.getActivePlayIdV2
                .mockResolvedValue('test-play');

            switch (condition) {
                case 'MISSING':
                    redisMock.getPlayV2.mockResolvedValue(null);
                    break;

                case 'WRONG_OWNER':
                    playData.userId = 9;
                    break;

                case 'WRONG_SCENARIO':
                    playData.scenarioId = 'other_scenario';
                    break;

                case 'FINISHED':
                    playData.state = 'CLEARED';
                    break;
            }

            const response = await request(app.getHttpServer())
                .get('/v2/plays/active/v2_test_01')
                .set('Cookie', `guest_token=${validToken}`);

            expect(response.status).toBe(200);

            expect(response.body).toEqual({
                activePlay: null,
            });
        },
    );


    it.each([
        ['ACTIVE_PLAY_EXISTS', 409],
        ['PLAY_ID_CONFLICT', 500],
    ] as const)(
        'V2 저장 결과 %s에 대해 HTTP %s를 반환한다',
        async (saveResult, expectedStatus) => {
            databaseMock.findGuestUserId
                .mockResolvedValue(4);

            redisMock.savePlayV2
                .mockResolvedValue(saveResult);

            const response = await request(app.getHttpServer())
                .post('/v2/plays')
                .set('Cookie', `guest_token=${validToken}`)
                .send({
                    scenarioId: 'v2_test_01',
                });

            expect(response.status).toBe(expectedStatus);

            expect(response.body.playId).toBeUndefined();
        },
    );

    it('V2 플레이 포기 시 GIVEN_UP 상태와 증가된 버전을 반환한다', async () => {
        const playData = await prepareOwnedV2Play();

        playData.version = 3;
        playData.storyTimeMinutes = 5;

        redisMock.updatePlayV2IfVersion
            .mockResolvedValueOnce(true);

        const response = await request(app.getHttpServer())
            .post('/v2/plays/test-play/give-up')
            .set('Cookie', `guest_token=${validToken}`)
            .send({
                expectedVersion: 3,
            });

        expect(response.status).toBe(200);

        expect(response.body).toMatchObject({
            state: 'GIVEN_UP',
            version: 4,
            storyTimeMinutes: 5,
            actions: [],
        });

        expect(response.body.ending).toBeUndefined();

        expect(redisMock.updatePlayV2IfVersion)
            .toHaveBeenCalledWith(
                'test-play',
                3,
                {
                    ...playData,
                    state: 'GIVEN_UP',
                    version: 4,
                },
            );

        // 기존 원본 객체가 변경되지 않았는지 확인
        expect(playData.state).toBe('PLAYING');
        expect(playData.version).toBe(3);
    });

    it('V2 쿠키 없는 포기 요청을 거부한다', async () => {
        const response = await request(app.getHttpServer())
            .post('/v2/plays/test-play/give-up')
            .send({
                expectedVersion: 0,
            });

        expect(response.status).toBe(401);

        expect(redisMock.updatePlayV2IfVersion)
            .not.toHaveBeenCalled();
    });

    it('V2 다른 사용자의 플레이 포기를 거부한다', async () => {
        await prepareOwnedV2Play();

        databaseMock.findGuestUserId
            .mockResolvedValue(9);

        const response = await request(app.getHttpServer())
            .post('/v2/plays/test-play/give-up')
            .set('Cookie', `guest_token=${validToken}`)
            .send({
                expectedVersion: 0,
            });

        expect(response.status).toBe(404);

        expect(redisMock.updatePlayV2IfVersion)
            .not.toHaveBeenCalled();
    });

    it.each([
        'CLEARED',
        'FAILED',
        'GIVEN_UP',
    ] as const)(
        'V2 이미 종료된 플레이(%s)의 포기 요청을 거부한다',
        async (state) => {
            const playData = await prepareOwnedV2Play();

            playData.state = state;

            const response = await request(app.getHttpServer())
                .post('/v2/plays/test-play/give-up')
                .set('Cookie', `guest_token=${validToken}`)
                .send({
                    expectedVersion: 0,
                });

            expect(response.status).toBe(409);

            expect(redisMock.updatePlayV2IfVersion)
                .not.toHaveBeenCalled();
        },
    );

    it('V2 이전 버전의 포기 요청을 거부한다', async () => {
        const playData = await prepareOwnedV2Play();

        playData.version = 2;

        const response = await request(app.getHttpServer())
            .post('/v2/plays/test-play/give-up')
            .set('Cookie', `guest_token=${validToken}`)
            .send({
                expectedVersion: 1,
            });

        expect(response.status).toBe(409);

        expect(redisMock.updatePlayV2IfVersion)
            .not.toHaveBeenCalled();
    });

    it('V2 포기 요청의 CAS 갱신 실패 시 409를 반환한다', async () => {
        await prepareOwnedV2Play();

        redisMock.updatePlayV2IfVersion
            .mockResolvedValueOnce(false);

        const response = await request(app.getHttpServer())
            .post('/v2/plays/test-play/give-up')
            .set('Cookie', `guest_token=${validToken}`)
            .send({
                expectedVersion: 0,
            });

        expect(response.status).toBe(409);

        expect(redisMock.updatePlayV2IfVersion)
            .toHaveBeenCalledTimes(1);
    });

    it.each([
        -1,
        1.5,
        '1',
        null,
        undefined,
    ])(
        'V2 잘못된 포기 요청 버전(%s)을 거부한다',
        async (expectedVersion) => {
            const response = await request(app.getHttpServer())
                .post('/v2/plays/test-play/give-up')
                .set('Cookie', `guest_token=${validToken}`)
                .send({
                    expectedVersion,
                });

            expect(response.status).toBe(400);

            expect(redisMock.updatePlayV2IfVersion)
                .not.toHaveBeenCalled();
        },
    );


});
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
    describe, test, expect,
    beforeAll, afterAll, beforeEach, afterEach, vi,
} from 'vitest';

import { PlaysController } from './plays.controller.js';
import { PlaysService } from './plays.service.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

import { createInitialPlayData } from './play-engine.js';
import { loadScenario } from './scenario-loader.js';

describe('Plays HTTP', () => {
  let app: INestApplication;
  let service: PlaysService;

  const redisMock = {
    updatePlayIfCurrent: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PlaysController],
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

    service = moduleRef.get<PlaysService>(PlaysService);

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    redisMock.updatePlayIfCurrent.mockReset();
  });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

  afterAll(async () => {
    await app.close();
  });



  test('Redis 갱신 실패 시 HTTP 409를 반환한다', async () => {
    const playData = createInitialPlayData(
        'blackout_test_01',
        4,
        0,
    );

    vi.spyOn(service, 'getPlayForGuest')
        .mockResolvedValue(playData);

    redisMock.updatePlayIfCurrent.mockResolvedValueOnce(false);

    const scenario = await loadScenario('blackout_test_01');
    const stage = scenario.stages[0];

    const stageId = stage.stageId;
    const choiceId = stage.choices[0].id;



    const response = await request(app.getHttpServer())
    .post('/plays/test-play-id/choices')
    .send({
        stageId,
        choiceId,
    });


    expect(response.status).toBe(409);

    expect(response.body.message).toBe('플레이 상태가 변경되었거나 만료되었습니다. 다시 조회해 주세요.');
    
    expect(redisMock.updatePlayIfCurrent).toHaveBeenCalledOnce();

});


test('Redis 갱신 성공 시 HTTP 201을 반환한다', async () => {
    const playData = createInitialPlayData(
        'blackout_test_01',
        4,
        0,
    );

    vi.spyOn(service, 'getPlayForGuest')
        .mockResolvedValue(playData);

    redisMock.updatePlayIfCurrent.mockResolvedValueOnce(true);

    const scenario = await loadScenario('blackout_test_01');
    const stage = scenario.stages[0];

    const stageId = stage.stageId;
    const choiceId = stage.choices[0].id;



    const response = await request(app.getHttpServer())
    .post('/plays/test-play-id/choices')
    .send({
        stageId,
        choiceId,
    });


    expect(response.status).toBe(201);

    expect(response.body.id).toBe(choiceId);
    
    expect(redisMock.updatePlayIfCurrent).toHaveBeenCalledOnce();

});


    test.each([
        ['GET', '/plays'],
        ['GET', '/plays/scenarios/blackout_test_01'],
        ['POST', '/plays/echo'],
        ['POST', '/plays'],
        ['GET', '/plays/cookie-check'],
        ['GET', '/plays/test-play-id'],
        ['POST', '/plays/test-play-id/choices'],
    ] as const)(
        '운영 환경에서는 V1 API %s %s 접근을 차단한다',
        async (method, path) => {
            vi.stubEnv('NODE_ENV', 'production');

            const client = request(app.getHttpServer());

            const response = method === 'GET'
                ? await client.get(path)
                : await client.post(path).send({});

            expect(response.status).toBe(404);

            expect(redisMock.updatePlayIfCurrent)
                .not.toHaveBeenCalled();
        },
    );

    test('로컬 개발 환경에서는 V1 API 접근을 허용한다', async () => {
        vi.stubEnv('NODE_ENV', 'development');

        const response = await request(app.getHttpServer())
            .get('/plays/cookie-check');

        expect(response.status).toBe(200);
    });

    test('테스트 환경에서는 V1 API 접근을 허용한다', async () => {
        vi.stubEnv('NODE_ENV', 'test');

        const response = await request(app.getHttpServer())
            .get('/plays/cookie-check');

        expect(response.status).toBe(200);
    });

    test('실행 환경이 설정되지 않으면 V1 API 접근을 차단한다', async () => {
        vi.stubEnv('NODE_ENV', undefined);

        const response = await request(app.getHttpServer())
            .get('/plays/cookie-check');

        expect(response.status).toBe(404);
    });

});
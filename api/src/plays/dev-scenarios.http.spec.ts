import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';

import request from 'supertest';

import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    afterEach,
    vi,
} from 'vitest';

import { DevPlaygroundController } from './dev-playground.controller.js';
import { PlaysService } from './plays.service.js';
import { isLoopbackRequest } from './local-request.js';

vi.mock('./local-request.js', () => ({
    isLoopbackRequest: vi.fn(),
}));

describe('Dev Scenarios HTTP', () => {

    let app: INestApplication;

    beforeAll(async () => {

        const moduleRef = await Test.createTestingModule({
            controllers: [DevPlaygroundController],
            providers: [
                {
                    provide: PlaysService,
                    useValue: {},
                },
            ],
        }).compile();

        app = moduleRef.createNestApplication();

        await app.init();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetAllMocks();
    });

    afterAll(async () => {
        await app.close();
    });

    it('로컬 개발 환경에서는 전체 시나리오를 반환한다', async () => {

        vi.stubEnv('NODE_ENV', 'development');

        vi.mocked(isLoopbackRequest)
            .mockReturnValue(true);

        const response = await request(app.getHttpServer())
            .get('/dev/scenarios');

        expect(response.status).toBe(200);

        expect(response.body).toHaveLength(5);

        expect(
            response.body.map(
                (scenario: { scenarioId: string }) =>
                    scenario.scenarioId
            ).sort()
        ).toEqual([
            'apartment_fire_01',
            'basement_flood_01',
            'blackout_resource_01',
            'lost_hiking_01',
            'office_fire_01',
        ]);
    });

    it.each([
        ['development', false],
        ['production', true],
        ['production', false],
        ['test', true],
        ['test', false],
        [undefined, true],
        ['unknown', true],
    ] as const)(
        '환경=%s, 로컬 접속=%s이면 접근을 거부한다',
        async (environment, isLoopback) => {

            vi.stubEnv('NODE_ENV', environment);

            vi.mocked(isLoopbackRequest)
                .mockReturnValue(isLoopback);

            const response = await request(app.getHttpServer())
                .get('/dev/scenarios');

            expect(response.status).toBe(404);
        },
    );

});
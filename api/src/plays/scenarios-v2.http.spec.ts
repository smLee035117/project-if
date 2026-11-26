import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
    beforeAll,
    afterAll,
    describe,
    it,
    expect,
} from 'vitest';

import { ScenariosV2Controller } from './scenarios-v2.controller.js';
import { loadScenarioV2 } from './scenario-loader-v2.js';

describe('Scenarios V2 HTTP API', () => {

    let app: INestApplication;

    beforeAll(async () => {

        const moduleRef = await Test.createTestingModule({
            controllers: [ScenariosV2Controller],
        }).compile();

        app = moduleRef.createNestApplication();

        await app.init();
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    it('인증 없이 공개 시나리오 목록을 조회할 수 있다', async () => {

        const response = await request(app.getHttpServer())
            .get('/v2/scenarios');

        expect(response.status).toBe(200);

        expect(Array.isArray(response.body)).toBe(true);
    });

    it('공개된 시나리오만 반환한다', async () => {

        const response = await request(app.getHttpServer())
            .get('/v2/scenarios');

        expect(response.status).toBe(200);

        const original = await loadScenarioV2('office_fire_01');

        expect(response.body).toEqual([
            {
                scenarioId: original.scenarioId,
                title: original.title,
                version: original.version,
            },
        ]);
    });

    it('목록 응답에 내부 시나리오 데이터를 노출하지 않는다', async () => {

        const response = await request(app.getHttpServer())
            .get('/v2/scenarios');

        expect(response.status).toBe(200);
        expect(response.body.length).toBeGreaterThan(0);

        for (const scenario of response.body) {
            expect(Object.keys(scenario).sort()).toEqual([
                'scenarioId',
                'title',
                'version',
            ]);
        }
    });
});
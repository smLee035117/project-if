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
import { RedisService } from '../redis/redis.service.js';

import { loadScenarioV2 } from './scenario-loader-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { executeActionV2 } from './action-engine-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';

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
let connection: Connection;
let cleanupClient: ReturnType<typeof createClient>;

const playIds: string[] = [];
const userIds = new Set<number>();

beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');

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

const cases = [
    {
        endingId: 'END_EVACUATED',
        actions: [
            'LEAVE_NOW',
            'CALL_ELEV',
            'RIDE',
            'GO_EXIT',
            'GO_HOME',
        ],
    },
    {
        endingId: 'END_EXPOSED_EXIT',
        actions: [
            'FINISH',
            'STAIRS',
            'RETURN_BUDS',
            'STAIRS_PASS_5',
            'DOWN1',
            'ENTER_HALL',
            'GO_EXIT',
            'GO_HOME',
        ],
    },
    {
        endingId: 'END_RESCUED',
        actions: [
            'LEAVE_NOW',
            'STAIRS',
            'IGNORE_BUDS',
            'BACK_UP_6',
            'CALL_OFFICE',
            'WAIT_RESCUE',
            'WAIT_RESCUE',
            'WAIT_RESCUE',
            'WAIT_RESCUE',
        ],
    },
    {
        endingId: 'END_FAILED',
        actions: [
            'FINISH',
            'STAIRS',
            'IGNORE_BUDS',
            'BACK_UP_6',
            'RETURN_STAIR',
            'DESCEND_AGAIN',
            'ENTER_HALL',
            'KEEP_GOING',
            'SEARCH_EXIT',
        ],
    },
];

const fractionalEndings = new Set<string>();

test.each(cases)(
    '$endingId: HTTP·Redis·MySQL 결과가 일치한다',
    async ({ endingId, actions }) => {
        const scenario = await loadScenarioV2('office_fire_01');

        const started = await request(app.getHttpServer())
            .post('/v2/plays')
            .send({
                scenarioId: 'office_fire_01',
            });

        expect(started.status).toBe(201);

        const playId: string = started.body.playId;

        playIds.push(playId);

        const cookieHeader = started.headers['set-cookie'];

        const rawCookie = Array.isArray(cookieHeader)
            ? cookieHeader[0]
            : cookieHeader;

        if (typeof rawCookie !== 'string') {
            throw new Error('게스트 쿠키가 없습니다.');
        }

        const cookie = rawCookie.split(';')[0];

        const original = await redisService.getPlayV2(playId);

        if (!original) {
            throw new Error('Redis 플레이 생성 실패');
        }

        userIds.add(original.userId);

        let expectedPlay = createInitialPlayDataV2(
            scenario,
            original.userId,
            0,
        );

        let version = 0;

        for (const actionId of actions) {
            expectedPlay = executeActionV2(
                expectedPlay,
                scenario,
                actionId,
            ).playData;

            const expectedView = buildPlayViewV2(
                expectedPlay,
                scenario,
            );

            const response = await request(app.getHttpServer())
                .post(`/v2/plays/${playId}/actions`)
                .set('Cookie', cookie)
                .send({
                    actionId,
                    expectedVersion: version,
                });

            expect(response.status).toBe(200);

            version++;

            expect(response.body.view).toMatchObject({
                state: expectedView.state,
                version,
                currentSceneId: expectedView.currentSceneId,
                storyTimeMinutes: expectedView.storyTimeMinutes,
                sceneDescription: expectedView.sceneDescription,
            });

            if (expectedView.ending) {
                expect(response.body.view.ending)
                    .toEqual(expectedView.ending);
            }

            const redisData = await redisService.getPlayV2(playId);

            expect(redisData?.version).toBe(version);

            expect(redisData?.storyTimeMinutes)
                .toBe(expectedPlay.storyTimeMinutes);

            expect(redisData?.scenarioState)
                .toEqual(expectedPlay.scenarioState);

            expect(redisData?.timelineProgress)
                .toEqual(expectedPlay.timelineProgress);

            if (expectedPlay.state === 'PLAYING') {
                const [rows] = await connection.execute<ResultRow[]>(
                    'SELECT play_id FROM user_play_log_v2 WHERE play_id = ?',
                    [playId],
                );

                expect(rows).toHaveLength(0);
            }
        }

        expect(expectedPlay.endingId).toBe(endingId);
        expect(expectedPlay.state).not.toBe('PLAYING');

        const finalRedis = await redisService.getPlayV2(playId);

        expect(finalRedis?.endingId).toBe(endingId);
        expect(finalRedis?.state).toBe(expectedPlay.state);
        expect(finalRedis?.version).toBe(actions.length);

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

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            user_no: original.userId,
            scenario_id: 'office_fire_01',
            scenario_version: finalRedis?.scenarioVersion,
            result_state: expectedPlay.state,
            ending_id: endingId,
            play_version: actions.length,
            story_time_minutes: expectedPlay.storyTimeMinutes,
        });

        expect(
            await redisService.getPendingPlayResultV2(playId),
        ).toBeNull();

        if (!Number.isInteger(expectedPlay.storyTimeMinutes)) {
            fractionalEndings.add(endingId);
        }

        console.info({
            endingId,
            state: expectedPlay.state,
            version,
            storyTimeMinutes: expectedPlay.storyTimeMinutes,
        });

        const repeated = await request(app.getHttpServer())
            .post(`/v2/plays/${playId}/actions`)
            .set('Cookie', cookie)
            .send({
                actionId: actions[actions.length - 1],
                expectedVersion: version,
            });

        expect(repeated.status).toBe(409);
    },
    30_000,
);

test('소수점 종료 시간이 MySQL까지 유지되는 경로가 존재한다', () => {
    expect(fractionalEndings.size).toBeGreaterThan(0);
});
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
import { validateScenarioV2 } from './scenario-validator-v2.js';

import type { ScenarioV2 } from './types/scenario-v2.js';

// 실제 시나리오 파일을 변경하지 않고,
// 이 테스트에서만 종료 가능한 시나리오를 제공합니다.
vi.mock('./scenario-loader-v2.js', async (importOriginal) => {
    const original =
        await importOriginal<
            typeof import('./scenario-loader-v2.js')
        >();

    return {
        ...original,

        loadScenarioV2: async (scenarioId: string) => {
            if (scenarioId !== 'e4_api_test_01') {
                return original.loadScenarioV2(scenarioId);
            }

            const scenario: ScenarioV2 = {
                schemaVersion: 2,
                scenarioId: 'e4_api_test_01',
                version: '1.0.0',
                title: 'E4 API 종료 검증',
                initialSceneId: 'E01',

                initialState: {
                    world: {},
                    player: {
                        outcome: 'NONE',
                    },
                    knowledge: {
                        knownFacts: [],
                    },
                },

                scenes: [
                    {
                        id: 'E01',
                        description: '테스트 장면입니다.',
                        actions: [
                            {
                                id: 'CLEAR',
                                text: '성공으로 종료한다',
                                when: [],
                                durationMinutes: 1,
                                outcomes: [
                                    {
                                        when: [],
                                        resultText: '성공했습니다.',
                                        effects: [
                                            {
                                                type: 'SET',
                                                path: 'player.outcome',
                                                value: 'CLEAR',
                                            },
                                        ],
                                        transition: {
                                            type: 'END',
                                            endingId: 'E_CLEAR',
                                        },
                                    },
                                ],
                            },
                            {
                                id: 'FAIL',
                                text: '실패로 종료한다',
                                when: [],
                                durationMinutes: 2,
                                outcomes: [
                                    {
                                        when: [],
                                        resultText: '실패했습니다.',
                                        effects: [
                                            {
                                                type: 'SET',
                                                path: 'player.outcome',
                                                value: 'FAIL',
                                            },
                                        ],
                                        transition: {
                                            type: 'END',
                                            endingId: 'E_FAIL',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],

                endings: [
                    {
                        id: 'E_CLEAR',
                        state: 'CLEARED',
                        title: '성공 엔딩',
                        description: '정상 종료 테스트',
                        requirements: [
                            {
                                path: 'player.outcome',
                                op: 'EQ',
                                value: 'CLEAR',
                            },
                        ],
                    },
                    {
                        id: 'E_FAIL',
                        state: 'FAILED',
                        title: '실패 엔딩',
                        description: '실패 종료 테스트',
                        requirements: [
                            {
                                path: 'player.outcome',
                                op: 'EQ',
                                value: 'FAIL',
                            },
                        ],
                    },
                ],
            };

            return structuredClone(scenario);
        },
    };
});

interface ResultRow extends RowDataPacket {
    result_state: string;
    ending_id: string;
    play_version: number;
    story_time_minutes: number;
}

let app: INestApplication;
let connection: Connection;
let cleanupClient: ReturnType<typeof createClient>;

let redisService: RedisService;
let databaseService: DatabaseService;
let playsService: PlaysService;

const playIds: string[] = [];
const userIds = new Set<number>();

async function startTestPlay() {
    const response = await request(app.getHttpServer())
        .post('/v2/plays')
        .send({
            scenarioId: 'e4_api_test_01',
        });

    expect(response.status).toBe(201);

    const playId: string = response.body.playId;
    playIds.push(playId);

    const playData = await redisService.getPlayV2(playId);

    expect(playData).not.toBeNull();
    userIds.add(playData!.userId);

    const setCookie = response.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookie)
        ? setCookie[0]
        : setCookie;

    if (typeof rawCookie !== 'string') {
        throw new Error('게스트 쿠키가 발급되지 않았습니다.');
    }

    const cookie = rawCookie.split(';')[0];

    return { playId, cookie };
}

async function getSavedResults(
    playId: string,
): Promise<ResultRow[]> {
    const [rows] = await connection.execute<ResultRow[]>(
        `SELECT
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

beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const scenario =
        await loadScenarioV2('e4_api_test_01');

    validateScenarioV2(scenario);

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

test.each([
    {
        actionId: 'CLEAR',
        state: 'CLEARED',
        endingId: 'E_CLEAR',
        minutes: 1,
    },
    {
        actionId: 'FAIL',
        state: 'FAILED',
        endingId: 'E_FAIL',
        minutes: 2,
    },
])(
    '$state 종료 시 HTTP와 MySQL 결과가 일치한다',
    async ({ actionId, state, endingId, minutes }) => {
        const { playId, cookie } = await startTestPlay();

        const response = await request(app.getHttpServer())
            .post(`/v2/plays/${playId}/actions`)
            .set('Cookie', cookie)
            .send({
                actionId,
                expectedVersion: 0,
            });

        expect(response.status).toBe(200);
        expect(response.body.view).toMatchObject({
            state,
            version: 1,
            storyTimeMinutes: minutes,
            ending: {
                id: endingId,
            },
        });

        expect(response.body.view.actions).toEqual([]);

        const redisData = await redisService.getPlayV2(playId);

        expect(redisData?.state).toBe(state);
        expect(redisData?.endingId).toBe(endingId);

        const rows = await getSavedResults(playId);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            result_state: state,
            ending_id: endingId,
            play_version: 1,
            story_time_minutes: minutes,
        });

        expect(
            await redisService.getPendingPlayResultV2(playId),
        ).toBeNull();

        // 종료 이후 추가 행동 요청 거절
        const repeated = await request(app.getHttpServer())
            .post(`/v2/plays/${playId}/actions`)
            .set('Cookie', cookie)
            .send({
                actionId,
                expectedVersion: 1,
            });

        expect(repeated.status).toBe(409);
        expect(await getSavedResults(playId)).toHaveLength(1);
    },
);

test('MySQL 장애 시 HTTP 오류 후 pending으로 복구한다', async () => {
    const { playId, cookie } = await startTestPlay();

    const saveSpy = vi.spyOn(
        databaseService,
        'savePlayResultV2',
    ).mockRejectedValueOnce(
        new Error('E4 의도적 DB 장애'),
    );

    try {
        const response = await request(app.getHttpServer())
            .post(`/v2/plays/${playId}/actions`)
            .set('Cookie', cookie)
            .send({
                actionId: 'CLEAR',
                expectedVersion: 0,
            });

        expect(response.status).toBe(500);
    } finally {
        saveSpy.mockRestore();
    }

    // HTTP 오류가 발생해도 Redis 종료 상태는 확정됨
    const playData = await redisService.getPlayV2(playId);

    expect(playData?.state).toBe('CLEARED');
    expect(playData?.version).toBe(1);

    const pending =
        await redisService.getPendingPlayResultV2(playId);

    expect(pending?.state).toBe('CLEARED');
    expect(await getSavedResults(playId)).toHaveLength(0);

    // 해당 테스트 플레이만 복구하도록 범위 제한
    const scanSpy = vi.spyOn(
        redisService,
        'scanPendingPlayIdsV2',
    ).mockResolvedValue([playId]);

    try {
        await playsService.recoverPendingPlayResultsV2();
    } finally {
        scanSpy.mockRestore();
    }

    expect(await getSavedResults(playId)).toHaveLength(1);

    expect(
        await redisService.getPendingPlayResultV2(playId),
    ).toBeNull();
});

test('실제 동시 종료 요청에서는 하나만 성공한다', async () => {
    const { playId, cookie } = await startTestPlay();

    const submit = (actionId: string) =>
        request(app.getHttpServer())
            .post(`/v2/plays/${playId}/actions`)
            .set('Cookie', cookie)
            .send({
                actionId,
                expectedVersion: 0,
            });

    const [responseA, responseB] = await Promise.all([
        submit('CLEAR'),
        submit('FAIL'),
    ]);

    expect(
        [responseA.status, responseB.status].sort(),
    ).toEqual([200, 409]);

    const successful =
        responseA.status === 200 ? responseA : responseB;

    const redisData = await redisService.getPlayV2(playId);
    const rows = await getSavedResults(playId);

    expect(rows).toHaveLength(1);

    expect(rows[0]?.result_state)
        .toBe(successful.body.view.state);

    expect(rows[0]?.ending_id)
        .toBe(redisData?.endingId);

    expect(
        await redisService.getPendingPlayResultV2(playId),
    ).toBeNull();
});
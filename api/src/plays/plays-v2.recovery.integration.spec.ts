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

import { PlaysService } from './plays.service.js';
import { RedisService } from '../redis/redis.service.js';
import { DatabaseService } from '../database/database.service.js';

import { loadScenarioV2 } from './scenario-loader-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';

interface ResultRow extends RowDataPacket {
    cnt: number;
    result_state: string;
    ending_id: string;
}

let moduleRef: TestingModule;
let playsService: PlaysService;
let redisService: RedisService;
let databaseService: DatabaseService;

let connection: Connection;
let cleanupClient: ReturnType<typeof createClient>;
let userId: number;

const playIds: string[] = [];

async function createPendingV2Play(): Promise<string> {
    const playId = `test-v2-recovery-${randomUUID()}`;
    playIds.push(playId);

    const scenario = await loadScenarioV2('apartment_fire_01');

    const initial = createInitialPlayDataV2(
        scenario,
        userId,
        0,
    );

    const finished = {
        ...initial,
        state: 'CLEARED' as const,
        endingId: 'TEST_END',
        version: 1,
        storyTimeMinutes: 5,
    };

    await redisService.savePlayV2(playId, initial);

    const updated = await redisService.updatePlayV2IfVersion(
        playId,
        0,
        finished,
    );

    expect(updated).toBe(true);

    return playId;
}

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
        if (cleanupClient?.isReady) {
            for (const playId of playIds) {
                await cleanupClient.del([
                    `play:v2:${playId}`,
                    `pending:v2:play-result:${playId}`,
                ]);
            }
        }

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
    } finally {
        if (connection) await connection.end();
        if (cleanupClient?.isOpen) await cleanupClient.close();
        if (moduleRef) await moduleRef.close();
    }
});

test('V2 pending 결과를 MySQL에 복구한다', async () => {
    const playId = await createPendingV2Play();

    const pendingBefore =
        await redisService.getPendingPlayResultV2(playId);

    expect(pendingBefore?.state).toBe('CLEARED');

    // 다른 테스트의 pending과 간섭하지 않도록 대상 제한
    const scanSpy = vi.spyOn(
        redisService,
        'scanPendingPlayIdsV2',
    ).mockResolvedValue([playId]);

    try {
        await playsService.recoverPendingPlayResultsV2();

        const [rows] = await connection.execute<ResultRow[]>(
            `SELECT
                COUNT(*) AS cnt,
                MAX(result_state) AS result_state,
                MAX(ending_id) AS ending_id
             FROM user_play_log_v2
             WHERE play_id = ?`,
            [playId],
        );

        expect(rows[0]?.cnt).toBe(1);
        expect(rows[0]?.result_state).toBe('CLEARED');
        expect(rows[0]?.ending_id).toBe('TEST_END');

        expect(
            await redisService.getPendingPlayResultV2(playId),
        ).toBeNull();

        // 다시 복구해도 결과가 중복되지 않아야 함
        await playsService.recoverPendingPlayResultsV2();

        const [after] = await connection.execute<ResultRow[]>(
            `SELECT COUNT(*) AS cnt
             FROM user_play_log_v2
             WHERE play_id = ?`,
            [playId],
        );

        expect(after[0]?.cnt).toBe(1);
    } finally {
        scanSpy.mockRestore();
    }
});

test('MySQL 저장 실패 시 V2 pending을 유지하고 재복구한다', async () => {
    const playId = await createPendingV2Play();

    const scanSpy = vi.spyOn(
        redisService,
        'scanPendingPlayIdsV2',
    ).mockResolvedValue([playId]);

    const saveSpy = vi.spyOn(
        databaseService,
        'savePlayResultV2',
    ).mockRejectedValueOnce(
        new Error('의도적인 MySQL 저장 실패'),
    );

    try {
        await playsService.recoverPendingPlayResultsV2();

        // 저장 실패 후에도 pending이 유지돼야 함
        expect(
            await redisService.getPendingPlayResultV2(playId),
        ).not.toBeNull();

        const [before] = await connection.execute<ResultRow[]>(
            `SELECT COUNT(*) AS cnt
             FROM user_play_log_v2
             WHERE play_id = ?`,
            [playId],
        );

        expect(before[0]?.cnt).toBe(0);

        // 정상 DB 메서드로 복구 재시도
        saveSpy.mockRestore();

        await playsService.recoverPendingPlayResultsV2();

        const [after] = await connection.execute<ResultRow[]>(
            `SELECT COUNT(*) AS cnt
             FROM user_play_log_v2
             WHERE play_id = ?`,
            [playId],
        );

        expect(after[0]?.cnt).toBe(1);

        expect(
            await redisService.getPendingPlayResultV2(playId),
        ).toBeNull();
    } finally {
        saveSpy.mockRestore();
        scanSpy.mockRestore();
    }
});
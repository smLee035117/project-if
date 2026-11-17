import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import { createConnection, type Connection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

import {
    beforeAll,
    afterAll,
    test,
    expect,
} from 'vitest';

import { DatabaseService } from './database.service.js';
import { createInitialPlayDataV2 } from '../plays/play-engine-v2.js';
import { createV2TestScenario } from '../plays/test-fixtures/v2-test-scenario.js';

import type { PlayDataV2 } from '../plays/types/play-v2.js';

interface ResultRow extends RowDataPacket {
    result_state: string;
    ending_id: string;
    scenario_version: string;
    story_time_minutes: number;
    play_version: number;
}

interface CountRow extends RowDataPacket {
    cnt: number;
}

let moduleRef: TestingModule;
let service: DatabaseService;
let connection: Connection;
let userId: number;

const playIds: string[] = [];

function newPlayId(): string {
    const playId = `test-v2-${randomUUID()}`;
    playIds.push(playId);
    return playId;
}

async function createFinishedPlay(): Promise<PlayDataV2> {
    const scenario = createV2TestScenario();

    const playData = createInitialPlayDataV2(
        scenario,
        userId,
        0,
    );

    playData.state = 'CLEARED';
    playData.endingId = 'TEST_DONE';
    playData.version = 1;
    playData.storyTimeMinutes = 1;
    playData.scenarioState.player.reported119 = true;

    return playData;
}

beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({
                envFilePath: '../.env',
            }),
        ],
        providers: [DatabaseService],
    }).compile();

    await moduleRef.init();

    service = moduleRef.get(DatabaseService);

    connection = await createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    userId = await service.createGuestUser();
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

            await connection.end();
        }
    } finally {
        if (moduleRef) {
            await moduleRef.close();
        }
    }
});

test('V2 종료 결과를 MySQL에 저장한다', async () => {
    const playId = newPlayId();
    const playData = await createFinishedPlay();

    await service.savePlayResultV2(playId, playData);

    const [rows] = await connection.execute<ResultRow[]>(
        `SELECT
            result_state,
            ending_id,
            scenario_version,
            story_time_minutes,
            play_version
         FROM user_play_log_v2
         WHERE play_id = ?`,
        [playId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        result_state: 'CLEARED',
        ending_id: 'TEST_DONE',
        scenario_version: playData.scenarioVersion,
        story_time_minutes: 1,
        play_version: 1,
    });
});

test('동일한 V2 종료 결과의 재저장을 허용한다', async () => {
    const playId = newPlayId();
    const playData = await createFinishedPlay();

    await service.savePlayResultV2(playId, playData);
    await service.savePlayResultV2(playId, playData);

    const [rows] = await connection.execute<CountRow[]>(
        `SELECT COUNT(*) AS cnt
         FROM user_play_log_v2
         WHERE play_id = ?`,
        [playId],
    );

    expect(rows[0]?.cnt).toBe(1);
});

test('동일한 playId의 서로 다른 V2 결과를 거부한다', async () => {
    const playId = newPlayId();
    const playData = await createFinishedPlay();

    await service.savePlayResultV2(playId, playData);

    const modified = {
        ...playData,
        endingId: 'OTHER_ENDING',
    };

    await expect(
        service.savePlayResultV2(playId, modified),
    ).rejects.toThrow(
        '기존 V2 플레이 결과와 저장 요청이 일치하지 않습니다.',
    );

    const [rows] = await connection.execute<ResultRow[]>(
        `SELECT ending_id
         FROM user_play_log_v2
         WHERE play_id = ?`,
        [playId],
    );

    expect(rows[0]?.ending_id).toBe('TEST_DONE');
});

test('PLAYING과 GIVEN_UP 결과를 저장하지 않는다', async () => {
    const playId = newPlayId();
    const playData = await createFinishedPlay();

    for (const state of ['PLAYING', 'GIVEN_UP'] as const) {
        await expect(
            service.savePlayResultV2(playId, {
                ...playData,
                state,
            }),
        ).rejects.toThrow(
            '종료되지 않은 V2 플레이는 저장할 수 없습니다.',
        );
    }

    const [rows] = await connection.execute<CountRow[]>(
        `SELECT COUNT(*) AS cnt
         FROM user_play_log_v2
         WHERE play_id = ?`,
        [playId],
    );

    expect(rows[0]?.cnt).toBe(0);
});

test('endingId가 없는 V2 종료 결과를 거부한다', async () => {
    const playId = newPlayId();
    const playData = await createFinishedPlay();

    delete playData.endingId;

    await expect(
        service.savePlayResultV2(playId, playData),
    ).rejects.toThrow(
        'V2 엔딩 ID가 올바르지 않습니다.',
    );
});
import { Injectable, OnModuleInit, OnModuleDestroy, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, type Pool,  } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket  } from 'mysql2';

import type { PlayData } from '../plays/types/play.js';

import type { PlayDataV2 } from '../plays/types/play-v2.js';

interface GuestSessionRow extends RowDataPacket {
  user_no: number;
}

interface PlayResultRow extends RowDataPacket {
  user_no: number;
  scenario_id: string;
  score: number;
  result_state: string;
}


interface PlayResultV2Row extends RowDataPacket {
    user_no: number;
    scenario_id: string;
    scenario_version: string;
    result_state: string;
    ending_id: string;
    story_time_minutes: number;
    play_version: number;
}


@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy  {
    private readonly pool: Pool;

    constructor(private readonly configService: ConfigService) {
        this.pool = createPool({
        host: this.configService.getOrThrow<string>('DB_HOST'),
        port: Number(this.configService.getOrThrow<string>('DB_PORT')),
        user: this.configService.getOrThrow<string>('DB_USER'),
        password: this.configService.getOrThrow<string>('DB_PASSWORD'),
        database: this.configService.getOrThrow<string>('DB_NAME'),
        waitForConnections: true,
        connectionLimit: 10,
        });
    }

    async checkConnection(): Promise<void> {
        const [rows] = await this.pool.query('SELECT 1 AS ok');
        console.log(rows);
    }

    async onModuleInit(): Promise<void> {
        await this.checkConnection();
    }

    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
         console.log('End')
    }

    async createGuestUser(): Promise<number> {
        const [result] = await this.pool.execute<ResultSetHeader>(
            'INSERT INTO users (user_type) VALUES (?)',
            [0],
        );

        return result.insertId;
    }

    async findGuestUserId(tokenHash: string): Promise<number | null> {
        const [rows] = await this.pool.execute<GuestSessionRow[]>(
            `SELECT user_no
            FROM guest_sessions
            WHERE token_hash = ?
            AND expires_at > UTC_TIMESTAMP()
            LIMIT 1`,
            [tokenHash],
        );

        return rows[0]?.user_no ?? null;
    }

    async createGuestWithSession(tokenHash: string): Promise<number> {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            // 사용자 생성
            const [result] = await connection.execute<ResultSetHeader>(
            'INSERT INTO users (user_type) VALUES (?)',
            [0],
            );

            // 게스트 세션 생성
            await connection.execute(
            `INSERT INTO guest_sessions
            (token_hash, user_no, expires_at)
            VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))`,
            [tokenHash, result.insertId],
            );

            await connection.commit();

            return result.insertId;
        } catch (error: unknown) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }



    async savePlayResult(
        playId: string,
        playData: PlayData,
    ): Promise<void> {
         

        

        // 1. PLAYING 상태라면 저장 거절

        if(playData.state === 'PLAYING') {
            throw new Error('진행 중인 플레이는 저장할 수 없습니다.');
        }

        if(playData.state === 'GIVEN_UP') {
            throw new Error('이미 포기한 플레이는 저장할 수 없습니다.');
        }

        // 2. INSERT SQL 작성
        const sql = 'INSERT INTO user_play_log (play_id, user_no, scenario_id, score, result_state, finished_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))';
        // 3. this.pool.execute()로 저장

        try {
            await this.pool.execute(sql, [
                playId,
                playData.userId,
                playData.scenarioId,
                playData.score,
                playData.state,
            ]);
            } catch (error) {
            if (
                error instanceof Error &&
                'code' in error &&
                error.code === 'ER_DUP_ENTRY'
            ) {
                // 다음 단계: 기존 저장 결과 조회 및 비교
                const selectSQL = 'SELECT user_no, scenario_id, score, result_state FROM user_play_log WHERE play_id = ?;';
                
                const [rows] = await this.pool.execute<PlayResultRow[]>(selectSQL, [playId],);

                if (rows.length === 0) {
                    throw new Error('중복 키 오류가 발생했지만 기존 플레이 결과를 찾을 수 없습니다.');
                    
                }

                const exsting = rows[0];

                if(exsting.user_no === playData.userId &&
                    exsting.scenario_id === playData.scenarioId &&
                    exsting.score === playData.score &&
                    exsting.result_state === playData.state
                ) {

                     return;
                }

                throw new Error('기존 플레이 결과와 저장 요청이 일치하지 않습니다.');

            } else {
                throw error;
            }
        }

    }


    async savePlayResultV2(
        playId: string,
        playData: PlayDataV2,
    ): Promise<void> {
        if (
            playData.state !== 'CLEARED' &&
            playData.state !== 'FAILED'
        ) {
            throw new Error(
                '종료되지 않은 V2 플레이는 저장할 수 없습니다.',
            );
        }

        if (
            typeof playData.endingId !== 'string' ||
            playData.endingId.trim().length === 0
        ) {
            throw new Error('V2 엔딩 ID가 올바르지 않습니다.');
        }

        if (
            !Number.isFinite(playData.storyTimeMinutes) ||
            playData.storyTimeMinutes < 0
        ) {
            throw new Error('V2 진행 시간이 올바르지 않습니다.');
        }

        if (
            !Number.isSafeInteger(playData.version) ||
            playData.version <= 0 ||
            playData.version > 4294967295
        ) {
            throw new Error('V2 플레이 버전이 올바르지 않습니다.');
        }

        const sql = `
            INSERT INTO user_play_log_v2 (
                play_id,
                user_no,
                scenario_id,
                scenario_version,
                result_state,
                ending_id,
                story_time_minutes,
                play_version,
                finished_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))
        `;

        try {
            await this.pool.execute(sql, [
                playId,
                playData.userId,
                playData.scenarioId,
                playData.scenarioVersion,
                playData.state,
                playData.endingId,
                playData.storyTimeMinutes,
                playData.version,
            ]);
        } catch (error: unknown) {
            const isDuplicate =
                error instanceof Error &&
                'code' in error &&
                error.code === 'ER_DUP_ENTRY';

            if (!isDuplicate) {
                throw error;
            }

            const [rows] =
                await this.pool.execute<PlayResultV2Row[]>(
                    `SELECT
                        user_no,
                        scenario_id,
                        scenario_version,
                        result_state,
                        ending_id,
                        story_time_minutes,
                        play_version
                    FROM user_play_log_v2
                    WHERE play_id = ?`,
                    [playId],
                );

            const existing = rows[0];

            if (!existing) {
                throw new Error(
                    '중복된 V2 플레이 결과를 찾을 수 없습니다.',
                );
            }

            const isSameResult =
                existing.user_no === playData.userId &&
                existing.scenario_id === playData.scenarioId &&
                existing.scenario_version === playData.scenarioVersion &&
                existing.result_state === playData.state &&
                existing.ending_id === playData.endingId &&
                existing.story_time_minutes ===
                    playData.storyTimeMinutes &&
                existing.play_version === playData.version;

            if (isSameResult) {
                return;
            }

            throw new Error(
                '기존 V2 플레이 결과와 저장 요청이 일치하지 않습니다.',
            );
        }
    }

}
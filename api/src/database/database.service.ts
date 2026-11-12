import { Injectable, OnModuleInit, OnModuleDestroy, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, type Pool,  } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket  } from 'mysql2';

import type { PlayData } from '../plays/types/play.js';

interface GuestSessionRow extends RowDataPacket {
  user_no: number;
}

interface PlayResultRow extends RowDataPacket {
  user_no: number;
  scenario_id: string;
  score: number;
  result_state: string;
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

}
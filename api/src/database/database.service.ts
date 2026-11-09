import { Injectable, OnModuleInit, OnModuleDestroy, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, type Pool,  } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket  } from 'mysql2';

interface GuestSessionRow extends RowDataPacket {
  user_no: number;
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

}
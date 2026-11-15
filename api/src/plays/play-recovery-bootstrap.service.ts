import {
    Injectable,
    type OnApplicationBootstrap,
    type OnApplicationShutdown,
} from '@nestjs/common';

import { PlaysService } from './plays.service.js';

const RECOVERY_INTERVAL_MS = 60_000;

@Injectable()
export class PlayRecoveryBootstrapService
    implements OnApplicationBootstrap, OnApplicationShutdown {

    private recoveryTimer: ReturnType<typeof setInterval> | null = null;
    private recoveryInProgress = false;

    constructor(
        private readonly playsService: PlaysService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (process.env.NODE_ENV === 'test') {
            return;
        }

        // 서버 시작 시 즉시 한 번 복구
        await this.recoverOnce();

        // 중복 타이머 생성 방지
        if (this.recoveryTimer !== null) {
            return;
        }

        // 이후 60초 간격으로 재시도
        this.recoveryTimer = setInterval(() => {
            void this.recoverOnce();
        }, RECOVERY_INTERVAL_MS);

        this.recoveryTimer.unref();
    }

    onApplicationShutdown(): void {
        if (this.recoveryTimer !== null) {
            clearInterval(this.recoveryTimer);
            this.recoveryTimer = null;
        }
    }

    private async recoverOnce(): Promise<void> {
        // 동일 인스턴스에서 복구 작업 중복 실행 방지
        if (this.recoveryInProgress) {
            return;
        }

        this.recoveryInProgress = true;

        try {
            try {
                await this.playsService.recoverPendingPlayResults();
            } catch (error: unknown) {
                console.error(
                    'V1 pending 복구 실행 실패:',
                    error,
                );
            }

            try {
                await this.playsService.recoverPendingPlayResultsV2();
            } catch (error: unknown) {
                console.error(
                    'V2 pending 복구 실행 실패:',
                    error,
                );
            }
        } finally {
            this.recoveryInProgress = false;
        }
    }
}
import { afterEach, expect, test, vi } from 'vitest';

import { PlayRecoveryBootstrapService } from
  './play-recovery-bootstrap.service.js';

import { PlaysService } from './plays.service.js';

import { Test } from '@nestjs/testing';
import { PlaysModule } from './plays.module.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('개발 환경에서 복구 메서드를 한 번 실행한다', async () => {
  // 1. 환경변수를 development로 변경
    vi.stubEnv('NODE_ENV', 'development');
  // 2. recoverPendingPlayResults Mock 생성
    const playsMock = {
        recoverPendingPlayResults: vi.fn().mockResolvedValue(undefined),
    };

  // 3. PlayRecoveryBootstrapService 인스턴스 생성
    const bootstrapService = new PlayRecoveryBootstrapService(
        playsMock as unknown as PlaysService,
    );

  // 4. onApplicationBootstrap() 호출
    await bootstrapService.onApplicationBootstrap();

  // 5. 복구 메서드가 정확히 한 번 호출됐는지 검증
  expect(playsMock.recoverPendingPlayResults).toHaveBeenCalledOnce();

});

test('테스트 환경에서 자동 복구를 실행하지 않는다', async () => {
  // 1. 환경변수를 test로 변경
    vi.stubEnv('NODE_ENV', 'test');
  // 2. recoverPendingPlayResults Mock 생성
    const playsMock = {
        recoverPendingPlayResults: vi.fn().mockResolvedValue(undefined),
    };

  // 3. PlayRecoveryBootstrapService 인스턴스 생성
    const bootstrapService = new PlayRecoveryBootstrapService(
        playsMock as unknown as PlaysService,
    );

  // 4. onApplicationBootstrap() 호출
    await bootstrapService.onApplicationBootstrap();

  // 5. 복구 메서드가 호출되지 않았는지 검증
  expect(playsMock.recoverPendingPlayResults).not.toHaveBeenCalled();

});


test('복구 실패 시에도 서버 초기화를 중단하지 않는다', async () => {
  // 1. NODE_ENV를 development로 설정
    vi.stubEnv('NODE_ENV', 'development');
  // 2. 복구 메서드가 Error를 발생시키도록 Mock 설정
    const playsMock = {
        recoverPendingPlayResults: vi.fn().mockRejectedValue(
            new Error('Redis SCAN 실패'),
        ),
    };

  // 3. PlayRecoveryBootstrapService 인스턴스 생성
    const bootstrapService = new PlayRecoveryBootstrapService(
        playsMock as unknown as PlaysService,
    );

  // 4. onApplicationBootstrap() 실행
   await expect(
        bootstrapService.onApplicationBootstrap(),
    ).resolves.toBeUndefined();


  // 5. 예외 없이 완료됐는지 검증
    expect(playsMock.recoverPendingPlayResults).toHaveBeenCalledOnce();

});



test('NestJS 모듈 초기화 시 자동 복구를 한 번 실행한다', async () => {
    // 1. 개발 환경 설정
	   vi.stubEnv('NODE_ENV', 'development');

    // 2. PlaysService Mock 생성
    const playsMock = {
        recoverPendingPlayResults: vi.fn().mockResolvedValue(undefined),
    };

    // 3. NestJS 테스트 모듈 구성
    const moduleRef = await Test.createTestingModule({
        imports: [PlaysModule],
    })
        .overrideProvider(PlaysService)
        .useValue(playsMock)
        .overrideProvider(DatabaseService)
        .useValue({})
        .overrideProvider(RedisService)
        .useValue({})
        .compile();

    try {
        // 4. NestJS 모듈 초기화
        await moduleRef.init();


        // 5. 복구 메서드가 정확히 한 번 호출됐는지 검증
        expect(playsMock.recoverPendingPlayResults).toHaveBeenCalledOnce();


    } finally {
        // 6. 테스트 모듈 종료
        await moduleRef.close();
    }
});

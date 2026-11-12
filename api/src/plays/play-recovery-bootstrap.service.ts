
import {
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';

import { PlaysService } from './plays.service.js';



@Injectable()
export class PlayRecoveryBootstrapService
  implements OnApplicationBootstrap {

  constructor(
    private readonly playsService: PlaysService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {

    // 1. 테스트 환경이라면 자동 복구 실행하지 않기
    if(process.env.NODE_ENV === 'test') {
        return
    }
    
    try{
        // 2. try 블록에서 복구 메서드 실행
        await this.playsService.recoverPendingPlayResults();

    } catch(error: unknown) {
        // 3. catch 블록에서 복구 실행 오류 기록
        console.error('서버 시작 시 pending 복구 실패:', error);
    }

    
  }
}

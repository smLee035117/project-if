import { Injectable, NotFoundException } from '@nestjs/common';
import { loadScenario, ScenarioNotFoundError } from './scenario-loader.js';

import { createInitialPlayData,  } from './play-engine.js';
import type { PlayData, ChoiceGrade } from './types/play.js';

import { DatabaseService } from '../database/database.service.js';


import {
  generateGuestToken,
  hashGuestToken,
} from '../guest/guest-token.js';



@Injectable()
export class PlaysService {

  constructor(
    private readonly databaseService: DatabaseService,
  ) {}



  getPlays(): string {
    return 'Plays API 정상 작동';
  }

  

  async getScenario(scenarioId: string) {
    try {
      const scenario = await loadScenario(scenarioId);

      return {
        scenarioId: scenario.scenarioId,
        title: scenario.title,
        totalStages: scenario.stages.length,
      };
    } catch (error: unknown) {
      if (error instanceof ScenarioNotFoundError) {
        throw new NotFoundException('시나리오를 찾을 수 없습니다.');
      }

      throw error;
    }
  }


  async startPlay(
    scenarioId: string,
    guestToken?: string,
  ): Promise<{ playData: PlayData; newToken: string | null }> {

    // 1. 시나리오 검증
    const scenario = await this.getScenario(scenarioId);

    // 2. 기존 게스트 조회 또는 신규 생성
    const { userId, newToken } =
      await this.getOrCreateGuest(guestToken);

    // 3. 플레이 초기 상태 생성
    const playData = createInitialPlayData(
      scenario.scenarioId,
      userId,
      0,
    );

    return { playData, newToken };
  }

  async getOrCreateGuest(guestToken?: string) {
    // 기존 게스트 조회
    if (guestToken && /^[0-9a-f]{64}$/.test(guestToken)) {
      const tokenHash = hashGuestToken(guestToken);

      const userId =
        await this.databaseService.findGuestUserId(tokenHash);

      if (userId !== null) {
        return {
          userId,
          newToken: null,
        };
      }
    }

    // 신규 게스트 생성
    const newToken = generateGuestToken();
    const tokenHash = hashGuestToken(newToken);

    const userId =
      await this.databaseService.createGuestWithSession(tokenHash);

    return {
      userId,
      newToken,
    };
  }


}

import { Injectable, NotFoundException, UnauthorizedException, BadRequestException, ConflictException,InternalServerErrorException } from '@nestjs/common';
import { loadScenario, ScenarioNotFoundError } from './scenario-loader.js';

import { createInitialPlayData, changeScore, } from './play-engine.js';
import type { PlayData, ChoiceGrade } from './types/play.js';

import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';


import {
  generateGuestToken,
  hashGuestToken,
} from '../guest/guest-token.js';
import { createPlayId } from './play-id.js';



@Injectable()
export class PlaysService {

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
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
  ): Promise<{playId:string, playData: PlayData; newToken: string | null }> {

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

    //
    const playId = createPlayId();
    await this.redisService.savePlay(playId,playData);
    
    return { playId,playData, newToken };
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


  async getPlayForGuest(
    playId: string,
    guestToken?: string,
  ): Promise<PlayData> {




    // 1. 게스트 토큰 확인
      if (!guestToken || !/^[0-9a-f]{64}$/.test(guestToken)) {
        throw new UnauthorizedException('게스트 인증이 필요합니다.');
      }

      const tokenHash = hashGuestToken(guestToken);

      // 2. 토큰 해시를 이용해 기존 userId 조회
      const userId =
        await this.databaseService.findGuestUserId(tokenHash);
      if (userId === null) {
        throw new UnauthorizedException('유효하지 않은 게스트 세션입니다.');
      }


        // 3. Redis에서 playId로 PlayData 조회
      const data = await this.redisService.getPlay(playId);
      if(data === null) {
        throw new NotFoundException('플레이를 찾을 수 없습니다.');
      }




      // 4. 저장된 userId와 요청한 userId 비교

      if (userId !== data.userId) {
        // return {
        //   userId,
        //   newToken: null,
        // };
        throw new NotFoundException('플레이를 찾을 수 없습니다.');
      }





      // 5. 정상이라면 PlayData 반환
      return data;




  }



    async submitChoice(
      playId: string, choiceId: string,stageId:string, guestToken?: string,
    ) : Promise<object> {



        const playData = await this.getPlayForGuest(playId,typeof guestToken === 'string' ? guestToken : undefined,);

        if(playData.state !== 'PLAYING') {
          //ConflictException
           throw new ConflictException('진행 중인 플레이가 아닙니다.');
        }



        const scenarioData = await loadScenario(playData.scenarioId);

        const stage = scenarioData.stages[playData.currentStep];

        // 여기서 stage가 없으면 InternalServerErrorException을 던집니다.
        if(!stage) {
           throw new InternalServerErrorException('스테이지를 찾을 수 없습니다.');
        }

        if(stage.stageId !== stageId ) {
          throw new ConflictException('현재 진행 단계와 일치하지 않는 요청입니다.');
        }

        const choice = stage.choices.find(
          (item) => item.id === choiceId,
        );

        if(!choice) {
          throw new BadRequestException('요청이 잘못되었습니다.');
        }

        const expectedStep = playData.currentStep;


        changeScore(playData, choice.grade, scenarioData.stages.length);

        const updated = await this.redisService.updatePlayIfCurrent(playId,expectedStep,playData);

        if(!updated) {
          throw new ConflictException('플레이 상태가 변경되었거나 만료되었습니다. 다시 조회해 주세요.');
        }

        if('PLAYING' !== playData.state && 'GIVEN_UP' !== playData.state) {
          await this.databaseService.savePlayResult(playId,playData);
          await this.redisService.deletePendingPlayResult(playId);
        }

        const data = {
            'id': choice.id,
            'grade': choice.grade,
            playData,
        }



        return data;
    }


}

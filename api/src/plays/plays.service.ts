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


import { loadScenarioV2 } from './scenario-loader-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { selectFireVariantV2 } from './fire-variant-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';

import type { ScenarioV2 } from './types/scenario-v2.js';
import type { PlayDataV2 } from './types/play-v2.js';
import type { PlayViewV2 } from './types/play-view-v2.js';

import { executeActionV2 } from './action-engine-v2.js';


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


  async recoverPendingPlayResults(): Promise<void> {


    const playIds = await this.redisService.scanPendingPlayIds();

    for (const playId of playIds) {
      try {


        const pendingData =
          await this.redisService.getPendingPlayResult(playId);

        if (pendingData === null) {
          continue;
        }



        if('PLAYING' !== pendingData.state && 'GIVEN_UP' !== pendingData.state) {
          await this.databaseService.savePlayResult(playId,pendingData);

          await this.redisService.deletePendingPlayResult(playId);


        }



      } catch (error: unknown) {

        console.error(`복구 실패: ${playId}`, error);


      }
    }
  }


    private async loadScenarioV2ForApi(
    scenarioId: string,
  ): Promise<ScenarioV2> {
    try {
      return await loadScenarioV2(scenarioId);
    } catch (error: unknown) {
      if (error instanceof ScenarioNotFoundError) {
        throw new NotFoundException(
          'V2 시나리오를 찾을 수 없습니다.',
        );
      }

      throw error;
    }
  }

  async startPlayV2(
    scenarioId: string,
    guestToken?: string,
  ): Promise<{
    playId: string;
    view: PlayViewV2;
    newToken: string | null;
  }> {
    // 시나리오 검증
    const scenario =
      await this.loadScenarioV2ForApi(scenarioId);

    // 기존 게스트 인증 구조 재사용
    const { userId, newToken } =
      await this.getOrCreateGuest(guestToken);

    // V2 초기 상태 생성
    const playData = createInitialPlayDataV2(
      scenario,
      userId,
      0,
    );

    // 화재 상황은 새 플레이를 생성할 때 한 번만 추첨합니다.
    if (scenario.scenarioId === 'apartment_fire_01') {
      playData.scenarioState.world.incidentVariant = selectFireVariantV2();
    }

    // 외부 공개 데이터 구성
    const view = buildPlayViewV2(playData, scenario);

    // Redis에 V2 데이터 저장
    const playId = createPlayId();

    const saveResult = await this.redisService.savePlayV2(
      playId,
      playData,
    );



    if (saveResult === 'PLAY_ID_CONFLICT') {
        throw new InternalServerErrorException(
            '플레이 ID 생성에 실패했습니다.',
        );
    }

    if (saveResult === 'ACTIVE_PLAY_EXISTS') {
        throw new ConflictException(
            '이미 진행 중인 플레이가 존재합니다.',
        );
    }


    return {
      playId,
      view,
      newToken,
    };
  }


    private async requireGuestUserId(
        guestToken?: string,
    ): Promise<number> {


        if (!guestToken || !/^[0-9a-f]{64}$/.test(guestToken)) {
            throw new UnauthorizedException('게스트 인증이 필요합니다.');
        }

        const tokenHash = hashGuestToken(guestToken);

        const userId =
            await this.databaseService.findGuestUserId(tokenHash);
        if (userId === null) {
            throw new UnauthorizedException('유효하지 않은 게스트 세션입니다.');
        }

        return userId;
    }


    async getActivePlayV2ForGuest(
        scenarioId: string,
        guestToken?: string,
    ): Promise<{
        playId: string;
        view: PlayViewV2;
    } | null> {

        const userId =
            await this.requireGuestUserId(guestToken);

        const playId = await this.redisService.getActivePlayIdV2(userId,scenarioId);

        if (playId === null) {
            return null;
        }

        const playData =
            await this.redisService.getPlayV2(playId);


        if (playData === null || playData.userId !== userId || playData.scenarioId !== scenarioId || playData.state !== 'PLAYING') {
            return null;
        }



        const scenario =
            await this.loadScenarioV2ForApi(
                playData.scenarioId,
            );

        const view = buildPlayViewV2(
            playData,
            scenario,
        );


        return {
            playId,
            view,
        };



    }



    async getPlayDataV2ForGuest(
        playId: string,
        guestToken?: string,
    ): Promise<PlayDataV2> {

        const userId =
            await this.requireGuestUserId(guestToken);

        const playData =
            await this.redisService.getPlayV2(playId);

        if (
            playData === null ||
            playData.userId !== userId
        ) {
            throw new NotFoundException(
                '플레이를 찾을 수 없습니다.',
            );
        }

        return playData;
    }
  async getPlayViewV2ForGuest(
    playId: string,
    guestToken?: string,
  ): Promise<PlayViewV2> {
    const playData =
      await this.getPlayDataV2ForGuest(
        playId,
        guestToken,
      );

    const scenario =
      await this.loadScenarioV2ForApi(
        playData.scenarioId,
      );

    return buildPlayViewV2(
      playData,
      scenario,
    );
  }

  async submitActionV2(
    playId: string,
    actionId: string,
    expectedVersion: number,
    guestToken?: string,
  ): Promise<{
    resultText: string;
    view: PlayViewV2;
  }> {
    const playData =
      await this.getPlayDataV2ForGuest(
        playId,
        guestToken,
      );

    if (
      playData.version !== expectedVersion ||
      playData.state !== 'PLAYING'
    ) {
      throw new ConflictException(
        '플레이 상태가 변경되었습니다. 다시 조회해 주세요.',
      );
    }

    const scenario =
      await this.loadScenarioV2ForApi(
        playData.scenarioId,
      );

    // 공개 조회 결과를 이용해 행동 존재 여부와
    // 실행 가능 여부를 먼저 검사합니다.
    const currentView = buildPlayViewV2(
      playData,
      scenario,
    );

    const action = currentView.actions.find(
      (item) => item.id === actionId,
    );

    if (!action) {
      throw new BadRequestException(
        '현재 장면에 존재하지 않는 행동입니다.',
      );
    }

    if (!action.available) {
      throw new ConflictException(
        '현재 상태에서 실행할 수 없는 행동입니다.',
      );
    }

    const result = executeActionV2(
      playData,
      scenario,
      actionId,
    );

    // 저장 전에 응답 생성까지 검증합니다.
    const nextView = buildPlayViewV2(
      result.playData,
      scenario,
    );

    const updated =
      await this.redisService.updatePlayV2IfVersion(
        playId,
        expectedVersion,
        result.playData,
      );

    if (!updated) {
      throw new ConflictException(
        '플레이 상태가 변경되었거나 만료되었습니다. 다시 조회해 주세요.',
      );
    }

    if (
        result.playData.state === 'CLEARED' ||
        result.playData.state === 'FAILED'
    ) {
        await this.databaseService.savePlayResultV2(
            playId,
            result.playData,
        );

        await this.redisService.deletePendingPlayResultV2(
            playId,
        );
    }

    return {
      resultText: result.resultText,
      view: nextView,
    };
  }



  async recoverPendingPlayResultsV2(): Promise<void> {
      const playIds =
          await this.redisService.scanPendingPlayIdsV2();

      for (const playId of playIds) {
          try {
              const pendingData =
                  await this.redisService.getPendingPlayResultV2(
                      playId,
                  );

              if (pendingData === null) {
                  continue;
              }

              if (
                  pendingData.state !== 'CLEARED' &&
                  pendingData.state !== 'FAILED'
              ) {
                  console.error(
                      `V2 pending 상태 오류: ${playId}`,
                  );
                  continue;
              }

              await this.databaseService.savePlayResultV2(
                  playId,
                  pendingData,
              );

              await this.redisService.deletePendingPlayResultV2(
                  playId,
              );
          } catch (error: unknown) {
              console.error(
                  `V2 pending 복구 실패: ${playId}`,
                  error,
              );
          }
      }
  }

}

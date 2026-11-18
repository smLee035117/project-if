
import type {
    ScenarioState,
    PlayDataV2,
    ExecuteActionResultV2,
} from './types/play-v2.js';

import type { ScenarioV2, OutcomeV2, TimeEventV2,} from './types/scenario-v2.js';



import {
    evaluateConditions,
    applyEffect,
} from './state-engine-v2.js';

export {
    evaluateCondition,
    evaluateConditions,
    applyEffect,
} from './state-engine-v2.js';

import { advanceTimeV2 ,scheduleRelativeEventsV2, buildScheduledTimeEventsV2, completeHandledEventsV2  } from './time-engine-v2.js';




export function selectOutcome(
    state: ScenarioState,
    outcomes: OutcomeV2[],
): OutcomeV2 {

    const matched: OutcomeV2[] = [];

    // 1. outcomes를 for...of로 순회
    for( const outcome of outcomes) {
    // 2. evaluateConditions()로 각 결과의 when 검사

        if(evaluateConditions(state,outcome.when)) {
            // 3. 조건이 참이라면 matched 배열에 추가
            matched.push(outcome);
        }



    }


    // 4. matched의 개수가 정확히 1개인지 검사
    if(matched.length !== 1) {
          throw new Error('잘못된 진행입니다.');
    }
    // 5. 선택된 outcome 반환
    const selected = matched[0];

    if (!selected) {
        throw new Error('선택된 결과가 없습니다.');
    }

    return selected;
}





export function executeActionV2(
    playData: PlayDataV2,
    scenario: ScenarioV2,
    actionId: string,
): ExecuteActionResultV2  {

    //현재 플레이가 PLAYING 상태인지
    if(playData.state !== 'PLAYING') {
        // 에러처리.
         throw new Error('플레이 상태가 아닙니다.');
    }

    // 플레이와 시나리오 ID 및 버전이 일치하는지
    if(playData.scenarioId !== scenario.scenarioId ||
        playData.scenarioVersion !== scenario.version
    ) {
        // 에러처리.
         throw new Error('시나리오 확인에 실패했습니다.');
    }


    // 현재 장면이 시나리오에 존재하는지
    const scene = scenario.scenes.find(
        (scene) => scene.id === playData.currentStageId
    );

    if(typeof scene === 'undefined') {
        // 에러처리.
         throw new Error('시나리오에 현재 장면이 존재하지 않습니다.');
    }


    // 요청한 행동이 현재 장면에 존재하는지

    const action = scene?.actions.find(
        (action) => action.id === actionId
    );

    if(typeof action === 'undefined') {
        // 에러처리.
         throw new Error('현재 장면에 요청한 행동이 존재하지 않습니다.');
    }

    // 행동의 when 조건을 만족하는지
    if(!evaluateConditions(playData.scenarioState,action.when) ) {
        throw new Error('행동 조건을 만족하지 않습니다.');
    }

    
    const scheduledEvents: TimeEventV2[] = buildScheduledTimeEventsV2(scenario.timeline??[],playData.timelineProgress);

    

    const timeResult = advanceTimeV2(
        playData.scenarioState,
        playData.storyTimeMinutes,
        action.durationMinutes,
        [
            ...(scenario.timeEvents ?? []),
            ...scheduledEvents,
        ],
    );


    const outcome = selectOutcome(timeResult.scenarioState,action.outcomes);

    // if(outcome.transition.type !== 'STAY') {
    //      throw new Error('transition type을 만족하지 않습니다.');
    // }




    const nextScenarioState = applyEffect(
        timeResult.scenarioState,
        outcome.effects,
    );


     let nextStageId = playData.currentStageId;

     let nextEndingId = playData.endingId;

     let nextPlayState: PlayDataV2['state'] = playData.state;

    
    if (outcome.transition.type === 'GOTO') {
        const nextSceneId = outcome.transition.sceneId;

        const nextScene = scenario.scenes.find(
            (scene) => scene.id === nextSceneId
        );

        if (nextScene === undefined) {
            throw new Error('유효한 다음 장면 정보가 없습니다.');
        }

        // 1. 변경 전에 모든 위치 정보 검증
        if (nextScene.location !== undefined) {
            if (
                typeof nextScene.location !== 'string' ||
                nextScene.location.trim().length === 0 ||
                typeof nextScenarioState.player.location !== 'string'
            ) {
                throw new Error(
                    '장면 이동에 필요한 위치 정보가 올바르지 않습니다.',
                );
            }
        }

        // 2. 검증 완료 후 상태 변경
        nextStageId = nextScene.id;

        if (nextScene.location !== undefined) {
            nextScenarioState.player.location = nextScene.location;
        }
    } else if (outcome.transition.type === 'END') {
        //throw new Error('END는 아직 구현하지 않았습니다.');

        const endingId = outcome.transition.endingId

        const ending = scenario.endings.find(
            (ending) => ending.id === endingId
        );

        if(typeof ending === 'undefined') {
            throw new Error('유효한 엔딩 정보가 없습니다.');
        }


        if(!evaluateConditions(nextScenarioState, ending.requirements)) {
            throw new Error('엔딩 조건을 만족하지 못했습니다.');
        }

        nextEndingId = endingId;
        nextPlayState = ending.state;
    }


    let nextTimelineProgress = completeHandledEventsV2(
        playData.timelineProgress,
        timeResult.handledEventIds,
    );

    if (nextPlayState === 'PLAYING') {
        nextTimelineProgress = scheduleRelativeEventsV2(
            playData.scenarioState,
            nextScenarioState,
            timeResult.endMinute,
            scenario.timeline ?? [],
            nextTimelineProgress,
        );
    } else {
        nextTimelineProgress = {
            ...nextTimelineProgress,
            pending: {},
        };
    }




    return {
        playData : {
            ...playData,
            currentStageId: nextStageId,
            scenarioState: nextScenarioState,
            storyTimeMinutes: timeResult.endMinute,
            version: playData.version + 1,
            endingId: nextEndingId,
            state: nextPlayState,
            timelineProgress: nextTimelineProgress,
        } ,
        resultText : outcome.resultText,

    };



}

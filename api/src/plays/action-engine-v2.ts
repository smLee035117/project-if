
import type { ScenarioState,PlayDataV2 } from './types/play-v2.js';
import type { ConditionV2, EffectV2, OutcomeV2, } from './types/scenario-v2.js';
import { getStateValue } from './state-access-v2.js';

import type { ScenarioV2 } from './types/scenario-v2.js';




export function evaluateCondition(
    state: ScenarioState,
    condition: ConditionV2,
): boolean {

    const currentValue = getStateValue(
        state,
        condition.path,
    );

    const value = condition.value;

    

    switch (condition.op) {
        case 'EQ':
            return currentValue === value;

        case 'NEQ':
            return currentValue !== value;

        case 'GT':
        case 'GTE':
        case 'LT':
        case 'LTE': {
            if (
                typeof currentValue !== 'number' ||
                typeof value !== 'number'
            ) {
                throw new Error('숫자 비교에는 number 타입이 필요합니다.');
            }

            switch (condition.op) {
                case 'GT':
                    return currentValue > value;
                case 'GTE':
                    return currentValue >= value;
                case 'LT':
                    return currentValue < value;
                case 'LTE':
                    return currentValue <= value;
                default:
                    throw new Error('지원하지 않는 숫자 비교 연산자입니다.');
            }
        }
        case 'INCLUDES':
            {
                if ( !Array.isArray(currentValue) ||
                    typeof condition.value !== 'string') {
                        throw new Error('INCLUDES 연산자의 자료형이 올바르지 않습니다.');
                }

                return currentValue.includes(condition.value);
            }

        default:
            throw new Error('지원하지 않는 조건 연산자입니다.');
    }
  

  
    

}


export function evaluateConditions(
    state: ScenarioState,
    conditions:  ConditionV2[],
): boolean {


    return conditions.every(
        (condition) => evaluateCondition(state, condition)
    );

}




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



export function applyEffect(
    state: ScenarioState,
    effects: EffectV2[],
) :ScenarioState {

    const nextState = structuredClone(state);

    for(const effect of effects) {
        if (effect.type !== 'SET') {
            throw new Error('지원하지 않는 처리입니다.');
        }
    
        const [section, key] = effect.path.split('.');
        if (
            (section !== 'world' && section !== 'player') ||
            !key
        ) {
            throw new Error('허용되지 않은 상태 영역입니다.');
        }

        const currentValue = getStateValue(nextState, effect.path);

        if (typeof currentValue !== typeof effect.value) {
           throw new Error(`${effect.path}의 값 형식이 다릅니다.`);
        } 

        if(typeof effect.value === 'number'  && !Number.isFinite(effect.value)) {
            throw new Error(`value 범위가 올바르지 않습니다.`);
        }

         nextState[section][key] = effect.value;



        
    }


    return nextState;
}


export function executeActionV2(
    playData: PlayDataV2,
    scenario: ScenarioV2,
    actionId: string,
): PlayDataV2 {

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

    const outcome = selectOutcome(playData.scenarioState,action.outcomes);

    // if(outcome.transition.type !== 'STAY') {
    //      throw new Error('transition type을 만족하지 않습니다.');
    // }

   


    const nextScenarioState = applyEffect(
        playData.scenarioState,
        outcome.effects,
    );


     let nextStageId = playData.currentStageId;

     let nextEndingId = playData.endingId;

     let nextPlayState: PlayDataV2['state'] = playData.state;

    if (outcome.transition.type === 'GOTO') {
        // 목적지 장면 검색
        // 목적지가 존재하는지 검사
        // 이동할 currentStageId 결정
        const nextSceneId = outcome.transition.sceneId;

        const nextScene = scenario.scenes.find(
            (scene) => scene.id === nextSceneId
        );
        if(typeof nextScene === 'undefined') {
            throw new Error('유효한 다음 장면 정보가 없습니다.');
        }
        nextStageId = nextScene.id;
        

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

    return {
        ...playData,
        currentStageId: nextStageId,
        scenarioState: nextScenarioState,
        storyTimeMinutes: playData.storyTimeMinutes + action.durationMinutes,
        version: playData.version + 1,
        endingId : nextEndingId,
        state : nextPlayState
    };



}

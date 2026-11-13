
import type { ScenarioState,PlayDataV2 } from './types/play-v2.js';
import type { ConditionV2, EffectV2 } from './types/scenario-v2.js';
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

    

    if (condition.op !== 'EQ') {
        throw new Error('지원하지 않는 조건 연산자입니다.');
    }
    
    return currentValue === condition.value;
    

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
    if(!evaluateCondition(playData.scenarioState,action.when) ) {
        throw new Error('행동 조건을 만족하지 않습니다.');
    }

    if(action.transition.type !== 'STAY') {
         throw new Error('transition type을 만족하지 않습니다.');
    }

    const nextScenarioState = applyEffect(
        playData.scenarioState,
        action.effects,
    );

    return {
        ...playData,
        scenarioState: nextScenarioState,
        storyTimeMinutes: playData.storyTimeMinutes + action.durationMinutes,
        version: playData.version + 1,
    };



}

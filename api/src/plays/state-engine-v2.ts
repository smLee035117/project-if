
import type { ScenarioState } from './types/play-v2.js';
import type { ConditionV2, EffectV2 } from './types/scenario-v2.js';
import { getStateValue } from './state-access-v2.js';




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



export function applyEffect(
    state: ScenarioState,
    effects: EffectV2[],
) :ScenarioState {

    const nextState = structuredClone(state);

    for(const effect of effects) {

        if (effect.type === 'APPEND_UNIQUE') {
            if (
                effect.path !== 'knowledge.knownFacts' ||
                typeof effect.value !== 'string' ||
                effect.value.trim().length === 0
            ) {
                throw new Error('APPEND_UNIQUE 효과가 올바르지 않습니다.');
            }

            const knownFacts = nextState.knowledge.knownFacts;

            if (!knownFacts.includes(effect.value)) {
                knownFacts.push(effect.value);
            }

            continue;
        }

        if (effect.type === 'REMOVE') {
            if (
                effect.path !== 'knowledge.knownFacts' ||
                typeof effect.value !== 'string' ||
                effect.value.trim().length === 0
            ) {
                throw new Error('REMOVE 효과가 올바르지 않습니다.');
            }

            nextState.knowledge.knownFacts =
                nextState.knowledge.knownFacts.filter(
                    (fact) => fact !== effect.value,
                );

            continue;
        }

        if (effect.type !== 'SET' && effect.type !== 'ADD') {
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

        // SET 일때
        if(effect.type === 'SET') { 
            nextState[section][key] = effect.value;
        }
        

        // ADD 일때
        if (effect.type === 'ADD') {
            if (
                typeof currentValue !== 'number' ||
                typeof effect.value !== 'number'
            ) {
                throw new Error('ADD는 숫자 상태에만 사용할 수 있습니다.');
            }

            const result = currentValue + effect.value;

            if (!Number.isFinite(result)) {
                throw new Error('ADD 계산 결과가 올바르지 않습니다.');
            }

            nextState[section][key] = result;
        }
            

        
    }


    return nextState;
}

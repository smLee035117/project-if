
import type { ScenarioState } from './types/play-v2.js';
import type { ConditionV2, EffectV2, ValueReferenceV2, ActionEvaluationContextV2, } from './types/scenario-v2.js';
import { getStateValue } from './state-access-v2.js';




export function evaluateCondition(
    state: ScenarioState,
    condition: ConditionV2,
    context?: ActionEvaluationContextV2,
): boolean {

    if (condition.op === 'AND') {
        return condition.conditions.every(
            (child) => evaluateCondition(state, child, context)
        );


    } else if(condition.op === 'OR') {
        return condition.conditions.some(
            (child) => evaluateCondition(state, child, context)
        );
    } else if(condition.op === 'NOT'){
        return !evaluateCondition(state, condition.condition,context);
    }



    let currentValue: string | number | boolean | string[];
    let value: string | number | boolean | string[];


    if('path' in condition) {
        currentValue = getStateValue(
            state,
            condition.path,
        );

        value = condition.value;

    } else {

        if(undefined === context) {
            throw new Error('context 값이 없습니다.');
        }

        currentValue = resolveValueReferenceV2(condition.left,context);

        value = typeof condition.value === 'object'
        ? resolveValueReferenceV2(condition.value,context)
        : condition.value;

    }





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
                    typeof value !== 'string') {
                        throw new Error('INCLUDES 연산자의 자료형이 올바르지 않습니다.');
                }

                return currentValue.includes(value);
            }

        default:
            throw new Error('지원하지 않는 조건 연산자입니다.');
    }





}

export function resolveValueReferenceV2(
    reference: ValueReferenceV2,
    context: ActionEvaluationContextV2,
): string | number | boolean | string[] {



    switch(reference.kind) {
        case 'STATE':
        const state = reference.at === 'ACTION_START'
        ? context.startState
        : context.endState;

        return getStateValue(state,reference.path);

        case 'TIME':
            const minute = reference.at === 'ACTION_START'
            ?  context.startMinute
            : context.endMinute;
        return minute;


    }


}


export function evaluateConditions(
    state: ScenarioState,
    conditions:  ConditionV2[],
     context?: ActionEvaluationContextV2,
): boolean {


    return conditions.every(
        (condition) => evaluateCondition(state, condition , context)
    );

}



export function applyEffect(
    state: ScenarioState,
    effects: EffectV2[],
    context?: ActionEvaluationContextV2,
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

        if (effect.type !== 'SET' && effect.type !== 'ADD' &&
            effect.type !== 'SET_FROM' ) {
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

        let value: string | number | boolean | string[];



        if (effect.type === 'SET_FROM') {

            // context가 없으면 오류 발생
             if(context === undefined) {
                throw new Error('context 값이 필요합니다.');
            }
            // effect.from을 해석하여 value에 대입
            value = resolveValueReferenceV2(effect.from,context);

        } else {

            // 기존 effect.value를 value에 대입
            value = effect.value;
        }

        if (Array.isArray(value)) {
            throw new Error('배열 값은 대입할 수 없습니다.');
        }


        if (typeof currentValue !== typeof value) {
           throw new Error(`${effect.path}의 값 형식이 다릅니다.`);
        }

        if(typeof value === 'number'  && !Number.isFinite(value)) {
            throw new Error(`value 범위가 올바르지 않습니다.`);
        }

        // SET 또는 SET_FROM 일때
        if(effect.type === 'SET' || effect.type === 'SET_FROM') {
            nextState[section][key] = value;
        }


        // ADD 일때
        if (effect.type === 'ADD') {
            if (
                typeof currentValue !== 'number' ||
                typeof value !== 'number'
            ) {
                throw new Error('ADD는 숫자 상태에만 사용할 수 있습니다.');
            }

            const result = currentValue + value;

            if (!Number.isFinite(result)) {
                throw new Error('ADD 계산 결과가 올바르지 않습니다.');
            }

            nextState[section][key] = result;
        }



    }


    return nextState;
}


export function assertActionConditionVisibleV2(
    condition: ConditionV2,
): void {
    if (condition.op === 'AND' || condition.op === 'OR') {
        for (const child of condition.conditions) {
            assertActionConditionVisibleV2(child);
        }

        return;
    }

    if (condition.op === 'NOT') {
        assertActionConditionVisibleV2(condition.condition);
        return;
    }

    function checkPath(path: string): void {
        if (path.startsWith('world.')) {
            throw new Error(
                '비공개 world 상태를 행동 실행 조건에 사용할 수 없습니다.',
            );
        }
    }

    function checkReference(reference: ValueReferenceV2): void {
        if (reference.kind === 'STATE') {
            checkPath(reference.path);
        }

        if (reference.at !== 'ACTION_START') {
            throw new Error(
                '행동 실행 조건은 ACTION_START만 참조할 수 있습니다.',
            );
        }
    }

    if ('path' in condition) {
        checkPath(condition.path);
        return;
    }

    checkReference(condition.left);

    if (typeof condition.value === 'object') {
        checkReference(condition.value);
    }
}

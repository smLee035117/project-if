import type { ScenarioState } from './types/play-v2.js';
import type { ScenarioV2 } from './types/scenario-v2.js';
import { getStateValue } from './state-access-v2.js';

// null과 배열을 제외한 객체인지 확인
function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

// 비어 있지 않은 문자열인지 확인
function isNonEmptyString(value: unknown): value is string {
 
 
    return typeof value === "string" && value.trim().length > 0;
}


function isStateValue(
    value: unknown,
): value is string | number | boolean {
    return (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (
            typeof value === 'number' &&
            Number.isFinite(value)
        )
    );
}


function validateCondition(
    condition: unknown,
    label: string,
    initialState: ScenarioState,
): void {
    // 조건 객체인지 확인
    // path 유효성 검사
    // 연산자별 유효성 검사
    // 값의 자료형 검사
    
    // 1. condition이 객체인지 검사
    
    if (!isRecord(condition)) {
        throw new Error(`${label}는 객체여야 합니다.`);
    }
    // 2. condition.path가 유효한 문자열인지 검사
    if(!isNonEmptyString(condition.path)){
        throw new Error(`${label}.path가 올바르지 않습니다.`);
    }

    // 3. condition.op가 지원하는 연산자인지 검사

    switch (condition.op) {
        case 'EQ':
        case 'NEQ':
            break;

        case 'GT':
        case 'GTE':
        case 'LT':
        case 'LTE': {
                const checkVal = getStateValue(initialState, condition.path);
                if(
                    typeof checkVal !== 'number' || typeof condition.value !== 'number' 
                ) {
                    throw new Error(`${label}.value는 숫자여야 합니다.`);
                }
            }
            break;

        case 'INCLUDES': {
                const checkVal = getStateValue(initialState, condition.path);

                if (
                    !Array.isArray(checkVal) ||
                    typeof condition.value !== 'string'
                ) {
                    throw new Error(`${label}.INCLUDES 자료형이 올바르지 않습니다.`);
                }

                return;
            }
        default:
            throw new Error(`${label}.op가 올바르지 않습니다.`);
    }


    // 5. validateStateValueType()으로 상태 필드와 자료형 비교
    validateStateValueType(
        initialState,
        condition.path,
        condition.value,
    );


}


function validateStateValueType(
    state: ScenarioState,
    path: string,
    value: unknown,
): void {

    const currentValue = getStateValue(state, path);

     if (!isStateValue(value)) {
        throw new Error(`${path}에 설정할 값이 올바르지 않습니다.`);
    }

    // TODO: 기존 값과 새로운 값의 타입 비교
    const valueType = typeof value;
    const currentValueType = typeof currentValue;

    // TODO: 타입이 다르면 Error 발생

    if(valueType !== currentValueType) {
         throw new Error(`${path}의 값 형식이 다릅니다.`);
    }
}

function validateStateMap(
    value: unknown,
    label: string,
): void {
    if (!isRecord(value)) {
        throw new Error(`${label}는 객체여야 합니다.`);
    }

    for (const [key, stateValue] of Object.entries(value)) {
        if (!isStateValue(stateValue)) {
            throw new Error(`${label}.${key}의 값이 올바르지 않습니다.`);
        }
    }
}

function validateInitialState(
    value: unknown,
): asserts value is ScenarioState {

    if (!isRecord(value)) {
        throw new Error('initialState는 객체여야 합니다.');
    }

    validateStateMap(value.world, 'initialState.world');
    validateStateMap(value.player, 'initialState.player');

    if (!isRecord(value.knowledge)) {
        throw new Error('initialState.knowledge는 객체여야 합니다.');
    }

    if (!Array.isArray(value.knowledge.knownFacts)) {
        throw new Error('knownFacts는 배열이어야 합니다.');
    }

    for (const [index, fact] of value.knowledge.knownFacts.entries()) {
        if (typeof fact !== 'string') {
            throw new Error(
                `initialState.knowledge.knownFacts[${index}]는 문자열이어야 합니다.`,
            );
        }
    }
}


// 시나리오 전체 구조 검사
export function validateScenarioV2(value: unknown): asserts value is ScenarioV2 {
    if (!isRecord(value)) {
        throw new Error("시나리오는 객체여야 합니다.");
    }

    if (value.schemaVersion !== 2) {
        throw new Error("지원하지 않는 시나리오 버전입니다.");
    }

    if (!isNonEmptyString(value.scenarioId)) {
        throw new Error("scenarioId는 비어 있지 않은 문자열이어야 합니다.");
    }

    if (!isNonEmptyString(value.initialSceneId)) {
        throw new Error("initialSceneId는 비어 있지 않은 문자열이어야 합니다.");
    }


    if (!isNonEmptyString(value.title)) {
        throw new Error("title은 비어 있지 않은 문자열이어야 합니다.");
    }

    if (!Array.isArray(value.scenes) || value.scenes.length === 0) {
        throw new Error("scenes는 비어 있지 않은 배열이어야 합니다.");
    }


    validateInitialState(value.initialState);

    if (!Array.isArray(value.endings) || value.endings.length === 0) {
        throw new Error('endings는 비어 있지 않은 배열이어야 합니다.');
    }


    const endingIds = new Set<string>();

    for (const [index, ending] of value.endings.entries()) {
        const label = `endings[${index}]`;

        if (!isRecord(ending)) {
            throw new Error(`${label}는 객체여야 합니다.`);
        }

        if (!isNonEmptyString(ending.id)) {
            throw new Error(`${label}.id가 올바르지 않습니다.`);
        }

        if (endingIds.has(ending.id)) {
            throw new Error(`${label}.id가 중복되었습니다.`);
        }

        endingIds.add(ending.id);

        if (ending.state !== 'CLEARED' && ending.state !== 'FAILED') {
            throw new Error(`${label}.state가 올바르지 않습니다.`);
        }

        if (!isNonEmptyString(ending.title)) {
            throw new Error(`${label}.title이 올바르지 않습니다.`);
        }

        if (!isNonEmptyString(ending.description)) {
            throw new Error(`${label}.description이 올바르지 않습니다.`);
        }

        if (!Array.isArray(ending.requirements)) {
            throw new Error(`${label}.requirements는 배열이어야 합니다.`);
        }

        for (const [reqIndex, req] of ending.requirements.entries()) {
            const reqLabel = `${label}.requirements[${reqIndex}]`;

            validateCondition (
                req,
                reqLabel,
                value.initialState,
            );
        }
    }

    if (!isNonEmptyString(value.version)) {
        throw new Error('version이 올바르지 않습니다.');
    }

    for (const [sceneIndex, scene] of value.scenes.entries()) {
        const sceneLabel = `scenes[${sceneIndex}]`;

        if (!isRecord(scene)) {
            throw new Error(`${sceneLabel}는 객체여야 합니다.`);
        }

        if (!isNonEmptyString(scene.id)) {
            throw new Error(`${sceneLabel}.id가 올바르지 않습니다.`);
        }

        if (!isNonEmptyString(scene.description)) {
            throw new Error(`${sceneLabel}.description이 올바르지 않습니다.`);
        }

        if (!Array.isArray(scene.actions)) {
            throw new Error(`${sceneLabel}.actions는 배열이어야 합니다.`);
        }
        
        for (const [actionIndex, action] of scene.actions.entries()) {
             const actionLabel = `${sceneLabel}.actions[${actionIndex}]`;
            
                 // id: string;
                // text: string;
                // when: ConditionV2;
                // effects: EffectV2[];
                // durationMinutes: number;
                // transition: TransitionV2;

            
            if (!isRecord(action)) {
                throw new Error(`${actionLabel}는 객체여야 합니다.`);
            }


            if (!isNonEmptyString(action.id)) {
                throw new Error(`${actionLabel}.id가 올바르지 않습니다.`);
            }

            if (!isNonEmptyString(action.text)) {
                throw new Error(`${actionLabel}.text가 올바르지 않습니다.`);
            }

            if (
                typeof action.durationMinutes !== 'number' ||
                !Number.isFinite(action.durationMinutes) ||
                action.durationMinutes < 0
            ) {
                throw new Error(`${actionLabel}.durationMinutes가 올바르지 않습니다.`);
            }


            // action.when

            if(!Array.isArray(action.when)){
                throw new Error(`${actionLabel}.when 은 배열이어야 합니다.`);
            }

            for (const [conditionIndex, condition] of action.when.entries()) {
                const conditionLabel = `${actionLabel}.when[${conditionIndex}]`; 
                    validateCondition (
                        condition,
                        conditionLabel,
                        value.initialState,
                    );


            }

            //action.outcomes
            if (!Array.isArray(action.outcomes) || action.outcomes.length === 0) {
                throw new Error(`${actionLabel}.outcomes 은 비어있지 않은 배열이어야 합니다.`);                
            }
            for (const [outcomeIndex, outcome] of action.outcomes.entries()) {
                const outcomeLabel = `${actionLabel}.outcomes[${outcomeIndex}]`; 
                
                if (!isRecord(outcome)) {
                    throw new Error(`${outcomeLabel}는 객체여야 합니다.`);
                }

                if (!isNonEmptyString(outcome.resultText)) {
                    throw new Error(`${outcomeLabel}.resultText는 비어 있지 않은 문자열이어야 합니다.`);
                }


                if(!Array.isArray(outcome.when)){
                    throw new Error(`${outcomeLabel}.when 은 배열이어야 합니다.`);
                }

                for (const [outcomeCondiIndex, outcomeCondi] of outcome.when.entries()) {
                    const outcomeCondiLabel = `${outcomeLabel}.when[${outcomeCondiIndex}]`; 

                    validateCondition (
                        outcomeCondi,
                        outcomeCondiLabel,
                        value.initialState,
                    );


                }

                if(!Array.isArray(outcome.effects)){
                    throw new Error(`${outcomeLabel}.effects 은 배열이어야 합니다.`);
                }

                for (const [outcomeEffectIndex, outcomeEffect] of outcome.effects.entries()) {
                    const outcomeEffectLabel = `${outcomeLabel}.effects[${outcomeEffectIndex}]`; 

                    if (!isRecord(outcomeEffect)) {
                        throw new Error(`${outcomeEffectLabel}는 객체여야 합니다.`);
                    }


                    if (outcomeEffect.type !== 'SET') {
                        throw new Error(`${outcomeEffectLabel}.type이 올바르지 않습니다.`);
                    }

                    if(!isNonEmptyString(outcomeEffect.path)){
                        throw new Error(`${outcomeEffectLabel}.path가 올바르지 않습니다.`);
                    }


                    if(typeof outcomeEffect.value !== 'string' &&
                        !(typeof outcomeEffect.value === 'number' && Number.isFinite(outcomeEffect.value)) && 
                        typeof outcomeEffect.value !== 'boolean' ){
                            throw new Error(`${outcomeEffectLabel}.value가 올바르지 않습니다.`);
                    }

                    // 5. validateStateValueType()으로 상태 필드와 자료형 비교
                    validateStateValueType(
                        value.initialState,
                        outcomeEffect.path,
                        outcomeEffect.value,
                    );



                }


                //outcome.transition
                if (!isRecord(outcome.transition)) {
                        throw new Error(`${outcomeLabel}는 객체여야 합니다.`);
                }



                if(outcome.transition.type !== 'STAY' &&
                    outcome.transition.type !== 'GOTO' &&
                    outcome.transition.type !== 'END' ){
                        throw new Error(`${outcomeLabel}.transition.type이 올바르지 않습니다.`);
                }

                if (outcome.transition.type === 'GOTO') {
                    const sceneId = outcome.transition.sceneId;

                    if (!isNonEmptyString(sceneId)) {
                        throw new Error(`${outcomeLabel}.transition.sceneId가 올바르지 않습니다.`);
                    }

                    const exists = value.scenes.some(
                        (scene) => isRecord(scene) && scene.id === sceneId
                    );

                    if (!exists) {
                        throw new Error(`${outcomeLabel}.transition.sceneId에 해당하는 장면이 없습니다.`);
                    }
                }

                if (outcome.transition.type === 'END') {
                    const endingId = outcome.transition.endingId;

                    if (!isNonEmptyString(endingId)) {
                        throw new Error(`${outcomeLabel}.transition.endingId가 올바르지 않습니다.`);
                    }

                    const exists = value.endings.some(
                        (ending) => isRecord(ending) && ending.id === endingId
                    );

                    if (!exists) {
                        throw new Error(`${outcomeLabel}.transition.endingId에 해당하는 엔딩이 없습니다.`);
                    }
                }



            }


        }

    }

    const exists = value.scenes.some(
        (scene) => scene.id === value.initialSceneId,
    );

    if (!exists) {
        throw new Error("initialSceneId에 해당하는 장면이 없습니다.");
    }
}
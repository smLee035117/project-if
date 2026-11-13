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

            if(!isRecord(action.when)){
                throw new Error(`${actionLabel}.when 은 객체여야 합니다.`);
            }

            if(!isNonEmptyString(action.when.path)){
                throw new Error(`${actionLabel}.when.path가 올바르지 않습니다.`);
            }

            if(action.when.op !== 'EQ'){
                throw new Error(`${actionLabel}.when.op가 올바르지 않습니다.`);
            }

            const conditionValue = action.when.value;

            if(typeof conditionValue !== 'string' &&
                !(typeof conditionValue === 'number' && Number.isFinite(conditionValue)) && 
                typeof conditionValue !== 'boolean' ){
                throw new Error(`${actionLabel}.when.value가 올바르지 않습니다.`);
            }

            validateStateValueType(
                value.initialState,
                action.when.path,
                action.when.value,
            );


            // action.effects
            if (!Array.isArray(action.effects)) {
                throw new Error(`${actionLabel}.effects는 배열이어야 합니다.`);
            }

            for (const [effectIndex, effect] of action.effects.entries()) {
                const effectLabel = `${actionLabel}.effects[${effectIndex}]`;

                if (!isRecord(effect)) {
                    throw new Error(`${effectLabel}는 객체여야 합니다.`);
                }

                if (effect.type !== 'SET') {
                    throw new Error(`${effectLabel}.type이 올바르지 않습니다.`);
                }

                if (!isNonEmptyString(effect.path)) {
                    throw new Error(`${effectLabel}.path가 올바르지 않습니다.`);
                }

                const effectValue = effect.value;

                if (
                    typeof effectValue !== 'string' &&
                    typeof effectValue !== 'boolean' &&
                    !(
                        typeof effectValue === 'number' &&
                        Number.isFinite(effectValue)
                    )
                ) {
                    throw new Error(`${effectLabel}.value가 올바르지 않습니다.`);
                }

                validateStateValueType(
                    value.initialState,
                    effect.path,
                    effect.value,
                );

            }

            // action.transition
            if (!isRecord(action.transition)) {
                throw new Error(`${actionLabel}.transition은 객체여야 합니다.`);
            }

            if (action.transition.type !== 'STAY') {
                throw new Error(`${actionLabel}.transition.type이 올바르지 않습니다.`);
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
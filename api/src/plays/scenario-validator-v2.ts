import type { ScenarioState } from './types/play-v2.js';
import type {
    ScenarioV2,
    ConditionV2,
} from './types/scenario-v2.js';

import { getStateValue } from './state-access-v2.js';

import {
    assertActionConditionVisibleV2,
} from './state-engine-v2.js';
import { isObject } from 'class-validator';

// null과 배열을 제외한 객체인지 확인
function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}
type ReferenceScopeV2 = 'NONE' | 'START' | 'ACTION';

function validateValueReference(
    reference: unknown,
    label: string,
    initialState: ScenarioState,
    scope: ReferenceScopeV2,
): string | number | boolean | string[] {
    if (!isRecord(reference)) {
        throw new Error(`${label}는 객체여야 합니다.`);
    }

    if (scope === 'NONE') {
        throw new Error(
            `${label}: 행동 평가 참조를 사용할 수 없습니다.`,
        );
    }

    if (
        reference.at !== 'ACTION_START' &&
        reference.at !== 'ACTION_END'
    ) {
        throw new Error(`${label}.at이 올바르지 않습니다.`);
    }

    if (
        scope === 'START' &&
        reference.at !== 'ACTION_START'
    ) {
        throw new Error(
            `${label}: ACTION_START만 참조할 수 있습니다.`,
        );
    }

    if (reference.kind === 'TIME') {
        if (Object.hasOwn(reference, 'path')) {
            throw new Error(
                `${label}: TIME 참조에는 path를 사용할 수 없습니다.`,
            );
        }

        return 0;
    }

    if (reference.kind === 'STATE') {
        if (!isNonEmptyString(reference.path)) {
            throw new Error(
                `${label}.path가 올바르지 않습니다.`,
            );
        }

        return getStateValue(initialState, reference.path);
    }

    throw new Error(`${label}.kind가 올바르지 않습니다.`);
}
// 비어 있지 않은 문자열인지 확인
function isNonEmptyString(value: unknown): value is string {


    return typeof value === "string" && value.trim().length > 0;
}

function hasValidTimePrecision(value: number): boolean {
    return Number(value.toFixed(2)) === value;
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
    scope: ReferenceScopeV2 = 'NONE',
): void {
    if (!isRecord(condition)) {
        throw new Error(`${label}는 객체여야 합니다.`);
    }

    // AND / OR 그룹 검증
    if (condition.op === 'AND' || condition.op === 'OR') {
        if (!Array.isArray(condition.conditions)) {
            throw new Error(
                `${label}.conditions는 배열이어야 합니다.`,
            );
        }

        for (const [index, child] of condition.conditions.entries()) {
            validateCondition(
                child,
                `${label}.conditions[${index}]`,
                initialState,
                scope,
            );
        }

        return;
    }

    // NOT 그룹 검증
    if (condition.op === 'NOT') {
        validateCondition(
            condition.condition,
            `${label}.condition`,
            initialState,
            scope,
        );

        return;
    }

    let leftValue: string | number | boolean | string[];
    let rightValue: string | number | boolean | string[];

    const hasPath = Object.hasOwn(condition, 'path');
    const hasLeft = Object.hasOwn(condition, 'left');

    if (hasPath === hasLeft) {
        throw new Error(
            `${label}.path 또는 left가 올바르지 않습니다.`,
        );
    }

    // 기존 path 기반 조건
    if (hasPath) {
        if (!isNonEmptyString(condition.path)) {
            throw new Error(
                `${label}.path가 올바르지 않습니다.`,
            );
        }

        leftValue = getStateValue(
            initialState,
            condition.path,
        );

        if (!isStateValue(condition.value)) {
            throw new Error(
                `${label}.value가 올바르지 않습니다.`,
            );
        }

        rightValue = condition.value;

    } else {
        // 동적 참조 조건
        leftValue = validateValueReference(
            condition.left,
            `${label}.left`,
            initialState,
            scope,
        );

        if (isRecord(condition.value)) {
            rightValue = validateValueReference(
                condition.value,
                `${label}.value`,
                initialState,
                scope,
            );
        } else {
            if (!isStateValue(condition.value)) {
                throw new Error(
                    `${label}.value가 올바르지 않습니다.`,
                );
            }

            rightValue = condition.value;
        }
    }

    // 연산자별 자료형 검증
    switch (condition.op) {
        case 'EQ':
        case 'NEQ':
            if (
                Array.isArray(leftValue) ||
                Array.isArray(rightValue) ||
                typeof leftValue !== typeof rightValue
            ) {
                throw new Error(
                    `${label}의 값 형식이 다릅니다.`,
                );
            }

            break;

        case 'GT':
        case 'GTE':
        case 'LT':
        case 'LTE':
            if (
                typeof leftValue !== 'number' ||
                typeof rightValue !== 'number'
            ) {
                throw new Error(
                    `${label}.value는 숫자여야 합니다.`,
                );
            }

            break;

        case 'INCLUDES':
            if (
                !Array.isArray(leftValue) ||
                typeof rightValue !== 'string'
            ) {
                throw new Error(
                    `${label}.INCLUDES 자료형이 올바르지 않습니다.`,
                );
            }

            break;

        default:
            throw new Error(
                `${label}.op가 올바르지 않습니다.`,
            );
    }
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



function validateEffect(
    effect: unknown,
    label: string,
    initialState: ScenarioState,
    scope: ReferenceScopeV2 = 'NONE',
): void {
    if (!isRecord(effect)) {
        throw new Error(`${label}는 객체여야 합니다.`);
    }

    if (!isNonEmptyString(effect.path)) {
        throw new Error(`${label}.path가 올바르지 않습니다.`);
    }

    switch (effect.type) {
        case 'SET': {
            validateStateValueType(
                initialState,
                effect.path,
                effect.value,
            );
            break;
        }
        case 'SET_FROM': {
            if (
                !effect.path.startsWith('world.') &&
                !effect.path.startsWith('player.')
            ) {
                throw new Error(
                    `${label}.path가 올바르지 않습니다.`,
                );
            }

            const referencedValue = validateValueReference(
                effect.from,
                `${label}.from`,
                initialState,
                scope,
            );

            validateStateValueType(
                initialState,
                effect.path,
                referencedValue,
            );

            break;
        }

        case 'ADD': {
            if (
                typeof effect.value !== 'number' ||
                !Number.isFinite(effect.value)
            ) {
                throw new Error(`${label}.value는 유한한 숫자여야 합니다.`);
            }

            const currentValue = getStateValue(
                initialState,
                effect.path,
            );

            if (typeof currentValue !== 'number') {
                throw new Error(`${label}.ADD 대상은 숫자여야 합니다.`);
            }

            break;
        }

        case 'APPEND_UNIQUE':
        case 'REMOVE': {
            if (effect.path !== 'knowledge.knownFacts') {
                throw new Error(`${label}.path가 올바르지 않습니다.`);
            }

            if (!isNonEmptyString(effect.value)) {
                throw new Error(`${label}.value는 문자열이어야 합니다.`);
            }

            break;
        }

        default:
            throw new Error(`${label}.type이 올바르지 않습니다.`);
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

    if (value.timeline !== undefined) {
        if (!Array.isArray(value.timeline)) {
            throw new Error('timeline은 배열이어야 합니다.');
        }

        const eventIds = new Set<string>();

        for (const [index, event] of value.timeline.entries()) {
            const label = `timeline[${index}]`;

            if (!isRecord(event)) {
                throw new Error(`${label}는 객체여야 합니다.`);
            }

            if (!isNonEmptyString(event.eventId)) {
                throw new Error(`${label}.eventId가 올바르지 않습니다.`);
            }

            if (eventIds.has(event.eventId)) {
                throw new Error(`${label}.eventId가 중복되었습니다.`);
            }

            eventIds.add(event.eventId);

            if (!isNonEmptyString(event.description)) {
                throw new Error(`${label}.description이 올바르지 않습니다.`);
            }

            const hasAtMinute = Object.hasOwn(event, 'atMinute');
            const hasAfter = Object.hasOwn(event, 'after');

            // 절대 시간과 상대 시간은 동시에 사용할 수 없음
            if (hasAtMinute === hasAfter) {
                throw new Error(`${label}의 시간 설정이 올바르지 않습니다.`);
            }

            let conditions: unknown;

            if (hasAtMinute) {
                if (
                    typeof event.atMinute !== 'number' ||
                    !Number.isFinite(event.atMinute) ||
                    event.atMinute <= 0 ||
                    !hasValidTimePrecision(event.atMinute)
                ) {
                    throw new Error(`${label}.atMinute가 올바르지 않습니다.`);
                }

                conditions = event.when;
            } else {
                if (!isRecord(event.after)) {
                    throw new Error(`${label}.after가 올바르지 않습니다.`);
                }

                if (event.after.trigger !== 'WHEN_BECOMES_TRUE') {
                    throw new Error(`${label}.after.trigger가 올바르지 않습니다.`);
                }

                if (
                    typeof event.after.delayMinutes !== 'number' ||
                    !Number.isFinite(event.after.delayMinutes) ||
                    event.after.delayMinutes <= 0 ||
                    !hasValidTimePrecision(event.after.delayMinutes)
                ) {
                    throw new Error(`${label}.after.delayMinutes가 올바르지 않습니다.`);
                }

                if (Object.hasOwn(event, 'when')) {
                    throw new Error(`${label}.when은 after.when을 사용해야 합니다.`);
                }

                conditions = event.after.when;
            }

            if (!Array.isArray(conditions)) {
                throw new Error(`${label}의 조건은 배열이어야 합니다.`);
            }

            for (const [i, condition] of conditions.entries()) {
                validateCondition(
                    condition,
                    `${label}.when[${i}]`,
                    value.initialState,
                );
            }

            if (
                !Array.isArray(event.effects) ||
                event.effects.length === 0
            ) {
                throw new Error(`${label}.effects가 올바르지 않습니다.`);
            }

            for (const [i, effect] of event.effects.entries()) {
                validateEffect(
                    effect,
                    `${label}.effects[${i}]`,
                    value.initialState,
                );
            }
        }
    }




if (value.timeEvents !== undefined) {
    if (!Array.isArray(value.timeEvents)) {
        throw new Error('timeEvents는 배열이어야 합니다.');
    }

    const eventIds = new Set<string>();

    for (const [index, event] of value.timeEvents.entries()) {
            const label = `timeEvents[${index}]`;

            if (!isRecord(event)) {
                throw new Error(`${label}는 객체여야 합니다.`);
            }

            if (!isNonEmptyString(event.id)) {
                throw new Error(`${label}.id가 올바르지 않습니다.`);
            }

            if (eventIds.has(event.id)) {
                throw new Error(`${label}.id가 중복되었습니다.`);
            }

            eventIds.add(event.id);

            if (
                typeof event.atMinute !== 'number' ||
                !Number.isFinite(event.atMinute) ||
                event.atMinute <= 0 ||
                !hasValidTimePrecision(event.atMinute)
            ) {
                throw new Error(`${label}.atMinute가 올바르지 않습니다.`);
            }

            if (!Array.isArray(event.when)) {
                throw new Error(`${label}.when은 배열이어야 합니다.`);
            }

            for (const [conditionIndex, condition] of event.when.entries()) {
                validateCondition(
                    condition,
                    `${label}.when[${conditionIndex}]`,
                    value.initialState,
                );
            }

            if (!Array.isArray(event.effects) || event.effects.length === 0) {
                throw new Error(`${label}.effects는 비어 있지 않은 배열이어야 합니다.`);
            }

            for (const [effectIndex, effect] of event.effects.entries()) {
                if (
                    isRecord(effect) &&
                    effect.path === 'knowledge.knownFacts'
                ) {
                    throw new Error(
                        `${label}.effects는 지식 정보를 직접 변경할 수 없습니다.`,
                    );
                }

                validateEffect(
                    effect,
                    `${label}.effects[${effectIndex}]`,
                    value.initialState,
                );
            }
        }
    }



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

        validateNarratives(
            ending.narratives,
            label,
            value.initialState,
        );


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

    const sceneIds = new Set<string>();

    for (const [sceneIndex, scene] of value.scenes.entries()) {
        const sceneLabel = `scenes[${sceneIndex}]`;

        if (!isRecord(scene)) {
            throw new Error(`${sceneLabel}는 객체여야 합니다.`);
        }

        if (!isNonEmptyString(scene.id)) {
            throw new Error(`${sceneLabel}.id가 올바르지 않습니다.`);
        }

        if (sceneIds.has(scene.id)) {
            throw new Error(`${sceneLabel}.id가 중복되었습니다.`);
        }

        sceneIds.add(scene.id);


        if (
        scene.location !== undefined &&
        !isNonEmptyString(scene.location)
        ) {
        throw new Error(`${sceneLabel}.location이 올바르지 않습니다.`);
        }

        if (
        scene.description !== undefined &&
        !isNonEmptyString(scene.description)
        ) {
        throw new Error(`${sceneLabel}.description이 올바르지 않습니다.`);
        }

        validateNarratives(
            scene.narratives,
            sceneLabel,
            value.initialState,
        );

        if (
        !isNonEmptyString(scene.description) &&
        scene.narratives === undefined
        ) {
        throw new Error(`${sceneLabel}에 장면 서술이 없습니다.`);
        }


        if (!Array.isArray(scene.actions)) {
            throw new Error(`${sceneLabel}.actions는 배열이어야 합니다.`);
        }

        const actionIds = new Set<string>();

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

            if (actionIds.has(action.id)) {
                throw new Error(`${actionLabel}.id가 중복되었습니다.`);
            }

            actionIds.add(action.id);

            if (!isNonEmptyString(action.text)) {
                throw new Error(`${actionLabel}.text가 올바르지 않습니다.`);
            }

            if (
                typeof action.durationMinutes !== 'number' ||
                !Number.isFinite(action.durationMinutes) ||
                action.durationMinutes < 0 ||
                !hasValidTimePrecision(action.durationMinutes)
            ) {
                throw new Error(`${actionLabel}.durationMinutes가 올바르지 않습니다.`);
            }


            // action.when

            if(!Array.isArray(action.when)){
                throw new Error(`${actionLabel}.when 은 배열이어야 합니다.`);
            }

            for (const [conditionIndex, condition] of action.when.entries()) {
                const conditionLabel =
                    `${actionLabel}.when[${conditionIndex}]`;

                validateCondition(
                    condition,
                    conditionLabel,
                    value.initialState,
                    'START',
                );

                assertActionConditionVisibleV2(
                    condition as ConditionV2,
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
                          'ACTION',
                    );


                }

                if(!Array.isArray(outcome.effects)){
                    throw new Error(`${outcomeLabel}.effects 은 배열이어야 합니다.`);
                }



                for (const [effectIndex, effect] of outcome.effects.entries()) {
                    validateEffect(
                        effect,
                        `${outcomeLabel}.effects[${effectIndex}]`,
                        value.initialState,
                          'ACTION',
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



function validateNarratives(
    narratives: unknown,
    parentLabel: string,
    initialState: ScenarioState,
): void {
    if(narratives === undefined) {
        return ;
    }

    if ( !Array.isArray(narratives) || narratives.length === 0  ) {
        throw new Error(`${parentLabel}.narratives가 올바르지 않습니다.`);
    }

    for (const [index, narrative] of narratives.entries()) {

        const label = `${parentLabel}.narratives[${index}]`;

        if(!isRecord(narrative)) {
            throw new Error(`${label}는 객체여야 합니다.`);
        }

        if(!isNonEmptyString(narrative.text)) {
            throw new Error(`${label}.text는 유효한 문자열이어야 합니다.`);
        }

        if(!Array.isArray(narrative.when)) {
           throw new Error(`${label}.when는 유효한 문자열이어야 합니다.`);
        }

        for (const [i, condition] of narrative.when.entries()) {
            const conditionLabel = `${label}.when[${i}]`;
            validateCondition(condition,conditionLabel,initialState);
        }

    }


}

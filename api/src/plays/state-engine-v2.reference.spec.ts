import { describe, expect, test } from 'vitest';
import { resolveValueReferenceV2 ,
        evaluateCondition,
        applyEffect,} from './state-engine-v2.js';
import type {
    ActionEvaluationContextV2,
} from './types/scenario-v2.js';

const context: ActionEvaluationContextV2 = {
    startState: {
        world: {},
        player: {
            smokePhase: 2,
            canReport: false,
        },
        knowledge: {
            knownFacts: ['FIRE'],
        },
    },
    endState: {
        world: {},
        player: {
            smokePhase: 3,
            canReport: true,
        },
        knowledge: {
            knownFacts: ['FIRE', 'SMOKE'],
        },
    },
    startMinute: 9,
    endMinute: 10,
};

describe('resolveValueReferenceV2', () => {
    test('행동 시작 상태를 읽는다', () => {
        expect(resolveValueReferenceV2({
            kind: 'STATE',
            at: 'ACTION_START',
            path: 'player.smokePhase',
        }, context)).toBe(2);
    });

    test('행동 종료 상태를 읽는다', () => {
        expect(resolveValueReferenceV2({
            kind: 'STATE',
            at: 'ACTION_END',
            path: 'player.smokePhase',
        }, context)).toBe(3);
    });

    test('행동 시작 시각을 읽는다', () => {
        expect(resolveValueReferenceV2({
            kind: 'TIME',
            at: 'ACTION_START',
        }, context)).toBe(9);
    });

    test('행동 종료 시각을 읽는다', () => {
        expect(resolveValueReferenceV2({
            kind: 'TIME',
            at: 'ACTION_END',
        }, context)).toBe(10);
    });

    test('false도 정상적인 상태값으로 반환한다', () => {
        expect(resolveValueReferenceV2({
            kind: 'STATE',
            at: 'ACTION_START',
            path: 'player.canReport',
        }, context)).toBe(false);
    });

    test('배열 상태도 참조할 수 있다', () => {
        expect(resolveValueReferenceV2({
            kind: 'STATE',
            at: 'ACTION_END',
            path: 'knowledge.knownFacts',
        }, context)).toEqual(['FIRE', 'SMOKE']);
    });
});

describe('evaluateCondition - 동적 참조 비교', () => {
    test('기존 path 기반 조건을 유지한다', () => {
        expect(evaluateCondition(context.startState, {
            path: 'player.smokePhase',
            op: 'EQ',
            value: 2,
        })).toBe(true);
    });

    test('상태 참조와 리터럴 값을 비교한다', () => {
        expect(evaluateCondition(context.startState, {
            left: {
                kind: 'STATE',
                at: 'ACTION_END',
                path: 'player.smokePhase',
            },
            op: 'EQ',
            value: 3,
        }, context)).toBe(true);
    });

    test('행동 시작 시각과 숫자를 비교한다', () => {
        expect(evaluateCondition(context.startState, {
            left: {
                kind: 'TIME',
                at: 'ACTION_START',
            },
            op: 'LT',
            value: 9.5,
        }, context)).toBe(true);
    });

    test('행동 시작 상태와 종료 상태를 비교한다', () => {
        expect(evaluateCondition(context.startState, {
            left: {
                kind: 'STATE',
                at: 'ACTION_START',
                path: 'player.smokePhase',
            },
            op: 'NEQ',
            value: {
                kind: 'STATE',
                at: 'ACTION_END',
                path: 'player.smokePhase',
            },
        }, context)).toBe(true);
    });

    test('비교 조건을 충족하지 않으면 false를 반환한다', () => {
        expect(evaluateCondition(context.startState, {
            left: {
                kind: 'TIME',
                at: 'ACTION_START',
            },
            op: 'GT',
            value: 10,
        }, context)).toBe(false);
    });

    test('참조 조건에 context가 없으면 오류가 발생한다', () => {
        expect(() => evaluateCondition(context.startState, {
            left: {
                kind: 'TIME',
                at: 'ACTION_START',
            },
            op: 'EQ',
            value: 9,
        })).toThrow();
    });

    test('참조한 배열에 특정 값이 포함되어 있는지 확인한다', () => {
        expect(evaluateCondition(context.startState, {
            left: {
                kind: 'STATE',
                at: 'ACTION_END',
                path: 'knowledge.knownFacts',
            },
            op: 'INCLUDES',
            value: 'SMOKE',
        }, context)).toBe(true);
    });
});


describe('evaluateCondition - 중첩 논리 조건', () => {
    const phase2 = {
        path: 'player.smokePhase',
        op: 'EQ',
        value: 2,
    } as const;

    const phase3 = {
        path: 'player.smokePhase',
        op: 'EQ',
        value: 3,
    } as const;

    test('AND는 모든 조건을 만족해야 한다', () => {
        expect(evaluateCondition(context.startState, {
            op: 'AND',
            conditions: [phase2, phase3],
        })).toBe(false);
    });

    test('AND의 모든 조건이 참이면 true를 반환한다', () => {
        expect(evaluateCondition(context.startState, {
            op: 'AND',
            conditions: [phase2, phase2],
        })).toBe(true);
    });

    test('OR는 하나 이상의 조건을 만족하면 된다', () => {
        expect(evaluateCondition(context.startState, {
            op: 'OR',
            conditions: [phase2, phase3],
        })).toBe(true);
    });

    test('OR의 모든 조건이 거짓이면 false를 반환한다', () => {
        expect(evaluateCondition(context.startState, {
            op: 'OR',
            conditions: [phase3, phase3],
        })).toBe(false);
    });

    test('NOT은 조건 평가 결과를 반전한다', () => {
        expect(evaluateCondition(context.startState, {
            op: 'NOT',
            condition: phase2,
        })).toBe(false);
    });

    test('AND, OR, NOT을 중첩하여 평가한다', () => {
        expect(evaluateCondition(context.startState, {
            op: 'AND',
            conditions: [
                phase2,
                {
                    op: 'OR',
                    conditions: [
                        phase3,
                        {
                            op: 'NOT',
                            condition: phase3,
                        },
                    ],
                },
            ],
        })).toBe(true);
    });

    test('중첩 조건 내부에도 context가 전달된다', () => {
        expect(evaluateCondition(context.startState, {
            op: 'AND',
            conditions: [
                phase2,
                {
                    op: 'OR',
                    conditions: [
                        phase3,
                        {
                            op: 'NOT',
                            condition: {
                                left: {
                                    kind: 'TIME',
                                    at: 'ACTION_END',
                                },
                                op: 'LT',
                                value: 10,
                            },
                        },
                    ],
                },
            ],
        }, context)).toBe(true);
    });
});

describe('applyEffect - SET_FROM', () => {
    test('행동 시작 상태의 값을 대입한다', () => {
        const result = applyEffect(context.endState, [{
            type: 'SET_FROM',
            path: 'player.smokePhase',
            from: {
                kind: 'STATE',
                at: 'ACTION_START',
                path: 'player.smokePhase',
            },
        }], context);

        expect(result.player.smokePhase).toBe(2);
    });

    test('행동 종료 시각을 대입한다', () => {
        const result = applyEffect(context.startState, [{
            type: 'SET_FROM',
            path: 'player.smokePhase',
            from: {
                kind: 'TIME',
                at: 'ACTION_END',
            },
        }], context);

        expect(result.player.smokePhase).toBe(10);
    });

    test('boolean 참조값을 대입한다', () => {
        const result = applyEffect(context.endState, [{
            type: 'SET_FROM',
            path: 'player.canReport',
            from: {
                kind: 'STATE',
                at: 'ACTION_START',
                path: 'player.canReport',
            },
        }], context);

        expect(result.player.canReport).toBe(false);
    });

    test('context가 없으면 오류가 발생한다', () => {
        expect(() => applyEffect(context.startState, [{
            type: 'SET_FROM',
            path: 'player.smokePhase',
            from: {
                kind: 'TIME',
                at: 'ACTION_START',
            },
        }])).toThrow();
    });

    test('대입할 값의 자료형이 다르면 오류가 발생한다', () => {
        expect(() => applyEffect(context.startState, [{
            type: 'SET_FROM',
            path: 'player.canReport',
            from: {
                kind: 'TIME',
                at: 'ACTION_START',
            },
        }], context)).toThrow();
    });

    test('배열 참조값의 대입을 차단한다', () => {
        expect(() => applyEffect(context.startState, [{
            type: 'SET_FROM',
            path: 'player.smokePhase',
            from: {
                kind: 'STATE',
                at: 'ACTION_END',
                path: 'knowledge.knownFacts',
            },
        }], context)).toThrow(/배열/);
    });

    test('원본 상태를 변경하지 않는다', () => {
        const original = structuredClone(context.endState);

        const result = applyEffect(original, [{
            type: 'SET_FROM',
            path: 'player.smokePhase',
            from: {
                kind: 'STATE',
                at: 'ACTION_START',
                path: 'player.smokePhase',
            },
        }], context);

        expect(original.player.smokePhase).toBe(3);
        expect(result.player.smokePhase).toBe(2);
    });

    test('기존 SET과 ADD를 context 없이 처리한다', () => {
        const result = applyEffect(context.startState, [
            {
                type: 'SET',
                path: 'player.smokePhase',
                value: 5,
            },
            {
                type: 'ADD',
                path: 'player.smokePhase',
                value: 2,
            },
        ]);

        expect(result.player.smokePhase).toBe(7);
    });
});

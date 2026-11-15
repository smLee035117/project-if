
import { describe, it, expect } from 'vitest';
import { advanceTimeV2 } from './time-engine-v2.js';
import type { ScenarioState } from './types/play-v2.js';
import type { TimeEventV2 } from './types/scenario-v2.js';

describe('advanceTimeV2', () => {
    const createState = (): ScenarioState => ({
        world: {
            corridorSmoke: false,
            dangerLevel: 0,
        },
        player: {
            health: 100,
        },
        knowledge: {
            knownFacts: ['alarm_heard'],
        },
    });

    it('시간 범위 안에 있는 이벤트만 실행한다', () => {
        const events: TimeEventV2[] = [
            {
                id: 'SMOKE',
                atMinute: 4,
                when: [],
                effects: [{
                    type: 'SET',
                    path: 'world.corridorSmoke',
                    value: true,
                }],
            },
        ];

        const original = createState();
        const result = advanceTimeV2(original, 2, 5, events);

        expect(result.endMinute).toBe(7);
        expect(result.scenarioState.world.corridorSmoke).toBe(true);
        expect(original.world.corridorSmoke).toBe(false);
        expect(result.scenarioState.knowledge.knownFacts)
            .toEqual(['alarm_heard']);
    });

    it('발생 시각순으로 이벤트를 처리한다', () => {
        const events: TimeEventV2[] = [
            {
                id: 'SECOND',
                atMinute: 6,
                when: [{
                    path: 'world.corridorSmoke',
                    op: 'EQ',
                    value: true,
                }],
                effects: [{
                    type: 'ADD',
                    path: 'world.dangerLevel',
                    value: 10,
                }],
            },
            {
                id: 'FIRST',
                atMinute: 4,
                when: [],
                effects: [{
                    type: 'SET',
                    path: 'world.corridorSmoke',
                    value: true,
                }],
            },
        ];

        const result = advanceTimeV2(createState(), 2, 5, events);

        expect(result.scenarioState.world.corridorSmoke).toBe(true);
        expect(result.scenarioState.world.dangerLevel).toBe(10);
    });

    it('시작 시각의 이벤트는 재실행하지 않는다', () => {
        const events: TimeEventV2[] = [{
            id: 'PAST',
            atMinute: 2,
            when: [],
            effects: [{
                type: 'ADD',
                path: 'world.dangerLevel',
                value: 10,
            }],
        }];

        const result = advanceTimeV2(createState(), 2, 5, events);

        expect(result.scenarioState.world.dangerLevel).toBe(0);
    });

    it('종료 시각의 이벤트는 실행한다', () => {
        const events: TimeEventV2[] = [{
            id: 'END_BOUNDARY',
            atMinute: 7,
            when: [],
            effects: [{
                type: 'ADD',
                path: 'world.dangerLevel',
                value: 10,
            }],
        }];

        const result = advanceTimeV2(createState(), 2, 5, events);

        expect(result.scenarioState.world.dangerLevel).toBe(10);
    });

    it('이벤트 적용 중 오류가 발생해도 원본은 유지한다', () => {
        const original = createState();

        const events: TimeEventV2[] = [
            {
                id: 'FIRST',
                atMinute: 3,
                when: [],
                effects: [{
                    type: 'ADD',
                    path: 'world.dangerLevel',
                    value: 10,
                }],
            },
            {
                id: 'INVALID',
                atMinute: 4,
                when: [],
                effects: [{
                    type: 'ADD',
                    path: 'world.dangerLevel',
                    value: Number.MAX_VALUE,
                }],
            },
            {
                id: 'OVERFLOW',
                atMinute: 5,
                when: [],
                effects: [{
                    type: 'ADD',
                    path: 'world.dangerLevel',
                    value: Number.MAX_VALUE,
                }],
            },
        ];

        expect(() => advanceTimeV2(original, 2, 5, events)).toThrow();

        expect(original.world.dangerLevel).toBe(0);
    });
});

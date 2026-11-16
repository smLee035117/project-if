
import { describe, it, test, expect } from 'vitest';
import { advanceTimeV2 ,scheduleRelativeEventsV2, buildScheduledTimeEventsV2, completeHandledEventsV2  } from './time-engine-v2.js';
import type { ScenarioState , TimelineProgressV2  } from './types/play-v2.js';
import type { TimeEventV2 , TimelineEventV2 } from './types/scenario-v2.js';

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


test('상대 시간 이벤트를 최초 상태 전이 시 예약한다', () => {
    const beforeState: ScenarioState = {
        world: {},
        player: { reported119: false },
        knowledge: { knownFacts: [] },
    };

    const afterState: ScenarioState = {
        world: {},
        player: { reported119: true },
        knowledge: { knownFacts: [] },
    };

    const timeline: TimelineEventV2[] = [
        {
            eventId: 'RESCUE',
            description: '신고 6분 후 구조대 도착',
            after: {
                trigger: 'WHEN_BECOMES_TRUE',
                delayMinutes: 6,
                when: [
                    {
                        path: 'player.reported119',
                        op: 'EQ',
                        value: true,
                    },
                ],
            },
            effects: [
                {
                    type: 'SET',
                    path: 'player.reported119',
                    value: true,
                },
            ],
        },
    ];

    const progress: TimelineProgressV2 = {
        pending: {},
        processed: [],
    };

    // 4분에 신고 → 10분으로 예약
    const first = scheduleRelativeEventsV2(
        beforeState, afterState, 4, timeline, progress,
    );

    expect(first.pending).toEqual({ RESCUE: 10 });
    expect(first.processed).toEqual([]);

    // 원본 진행 상태가 변경되지 않았는지 확인
    expect(progress.pending).toEqual({});

    // 이미 예약된 사건은 다시 예약되지 않음
    const second = scheduleRelativeEventsV2(
        beforeState, afterState, 8, timeline, first,
    );

    expect(second.pending).toEqual({ RESCUE: 10 });

    // 이미 처리된 사건은 다시 예약되지 않음
    const completed: TimelineProgressV2 = {
        pending: {},
        processed: ['RESCUE'],
    };

    const third = scheduleRelativeEventsV2(
        beforeState, afterState, 12, timeline, completed,
    );

    expect(third.pending).toEqual({});

    // true → true라면 신규 예약 없음
    const fourth = scheduleRelativeEventsV2(
        afterState, afterState, 4, timeline, progress,
    );

    expect(fourth.pending).toEqual({});
});



describe('buildScheduledTimeEventsV2', () => {
    const timeline: TimelineEventV2[] = [
        {
            eventId: 'SMOKE',
            description: '5분 후 연기 발생',
            atMinute: 5,
            when: [],
            effects: [
                {
                    type: 'SET',
                    path: 'world.insideSmoke',
                    value: true,
                },
            ],
        },
        {
            eventId: 'RESCUE',
            description: '신고 후 6분 뒤 구조',
            after: {
                trigger: 'WHEN_BECOMES_TRUE',
                delayMinutes: 6,
                when: [
                    {
                        path: 'player.reported119',
                        op: 'EQ',
                        value: true,
                    },
                ],
            },
            effects: [
                {
                    type: 'SET',
                    path: 'world.rescueArrived',
                    value: true,
                },
            ],
        },
        {
            eventId: 'HELP',
            description: '도움 요청 후 도착',
            after: {
                trigger: 'WHEN_BECOMES_TRUE',
                delayMinutes: 10,
                when: [
                    {
                        path: 'player.requestedHelp',
                        op: 'EQ',
                        value: true,
                    },
                ],
            },
            effects: [
                {
                    type: 'SET',
                    path: 'world.helpArrived',
                    value: true,
                },
            ],
        },
    ];

    test('절대 이벤트와 예약된 상대 이벤트만 변환한다', () => {
        const progress: TimelineProgressV2 = {
            pending: { RESCUE: 10 },
            processed: [],
        };

        const originalTimeline = structuredClone(timeline);
        const originalProgress = structuredClone(progress);

        const result = buildScheduledTimeEventsV2(
            timeline,
            progress,
        );

        expect(result.map((event) => event.id))
            .toEqual(['SMOKE', 'RESCUE']);

        expect(result.map((event) => event.atMinute))
            .toEqual([5, 10]);

        // 상대 이벤트는 예약 조건을 재검사하지 않음
        expect(result[1]?.when).toEqual([]);

        // 원본 불변성
        expect(timeline).toEqual(originalTimeline);
        expect(progress).toEqual(originalProgress);
    });

    test('이미 처리된 상대 이벤트는 제외한다', () => {
        const progress: TimelineProgressV2 = {
            pending: { RESCUE: 10 },
            processed: ['RESCUE'],
        };

        const result = buildScheduledTimeEventsV2(
            timeline,
            progress,
        );

        // 절대 이벤트만 남아야 함
        expect(result.map((event) => event.id))
            .toEqual(['SMOKE']);
    });
});



test('처리 이력은 발생 시각순이며 조건이 거짓인 이벤트도 포함한다', () => {
    const state: ScenarioState = {
        world: {
            count: 0,
            active: false,
        },
        player: {},
        knowledge: { knownFacts: [] },
    };

    const events: TimeEventV2[] = [
        {
            id: 'A',
            atMinute: 10,
            when: [],
            effects: [
                { type: 'ADD', path: 'world.count', value: 1 },
            ],
        },
        {
            id: 'B',
            atMinute: 3,
            when: [
                { path: 'world.active', op: 'EQ', value: true },
            ],
            effects: [
                { type: 'ADD', path: 'world.count', value: 100 },
            ],
        },
        {
            id: 'C',
            atMinute: 7,
            when: [],
            effects: [
                { type: 'ADD', path: 'world.count', value: 1 },
            ],
        },
    ];

    const result = advanceTimeV2(state, 0, 12, events);

    expect(result.handledEventIds).toEqual(['B', 'C', 'A']);
    expect(result.scenarioState.world.count).toBe(2);
    expect(result.endMinute).toBe(12);

    // 원본 상태는 유지
    expect(state.world.count).toBe(0);
});



describe('completeHandledEventsV2', () => {
    test('예약된 이벤트를 처리 완료 상태로 변경한다', () => {
        const progress = {
            pending: {
                RESCUE: 10,
                HELP: 15,
            },
            processed: ['SMOKE'],
        };

        const result = completeHandledEventsV2(
            progress,
            ['RESCUE', 'BLACKOUT'],
        );

        expect(result.pending).toEqual({
            HELP: 15,
        });

        expect(result.processed).toEqual([
            'SMOKE',
            'RESCUE',
            'BLACKOUT',
        ]);
    });

    test('이미 처리된 이벤트를 중복 기록하지 않는다', () => {
        const progress = {
            pending: {},
            processed: ['SMOKE'],
        };

        const result = completeHandledEventsV2(
            progress,
            ['SMOKE', 'SMOKE', 'BLACKOUT', 'BLACKOUT'],
        );

        expect(result.processed).toEqual([
            'SMOKE',
            'BLACKOUT',
        ]);
    });

    test('원본 진행 상태는 변경하지 않는다', () => {
        const progress = {
            pending: { RESCUE: 10 },
            processed: ['SMOKE'],
        };

        const original = structuredClone(progress);

        const result = completeHandledEventsV2(
            progress,
            ['RESCUE'],
        );

        expect(progress).toEqual(original);
        expect(result).not.toBe(progress);
        expect(result.pending).not.toBe(progress.pending);
        expect(result.processed).not.toBe(progress.processed);
    });
});


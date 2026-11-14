import { test, expect } from 'vitest';
import { applyEffect,executeActionV2, evaluateCondition } from './action-engine-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import type { ScenarioState } from './types/play-v2.js';
import type { EffectV2, ScenarioV2 } from './types/scenario-v2.js';



const scenario: ScenarioV2 = {
  schemaVersion: 2,
  scenarioId: 'apartment_fire_01',
  version: '1.0.0',
  title: '경보가 울린 밤',
  initialSceneId: 'E01',
  initialState: {
    world: {
      incidentVariant: 'Y',
      fireFloor: 10,
      insideSmoke: false,
    },
    player: {
      location: 'HOME_LIVING',
      reported119: false,
    },
    knowledge: {
      knownFacts: ['alarm_heard'],
    },
    
  },
  scenes: [
    {
      id: 'E01',
      description: '거실에서 화재경보가 울린다.',
      actions: [],
    },
  ],
  "endings": [
  {
    "id": "TEST_DONE",
    "state": "CLEARED",
    "title": "테스트 종료",
    "description": "엔딩 기능 검증용입니다.",
    "requirements": [
      {
        "path": "player.reported119",
        "op": "EQ",
        "value": true
      }
    ]
  }
]
};

    const playDataV2 = createInitialPlayDataV2(scenario, 4, 0);


test('V2 상태값 변경 확인하기', () => {
    
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: true,
        },
    ];
    
    const nextState = applyEffect(playDataV2.scenarioState,effects);


    expect(playDataV2.scenarioState.player.reported119).toBe(false);
    expect(nextState.player.reported119).toBe(true);
    expect(nextState).not.toBe(playDataV2.scenarioState);
});


test('V2 상태값 변경 여러개 동시에 적용되는지 확인하기', () => {
    
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: true,
        },
        {
            type: 'SET',
            path: 'player.location',
            value: 'HALLWAY',
        },
    ];
    
    const nextState = applyEffect(playDataV2.scenarioState,effects);


    expect(playDataV2.scenarioState.player.reported119).toBe(false);
    expect(nextState.player.reported119).toBe(true);


    expect(playDataV2.scenarioState.player.location).toBe('HOME_LIVING');
    expect(nextState.player.location).toBe('HALLWAY');

    expect(nextState).not.toBe(playDataV2.scenarioState);
});



test('V2 다중 효과 적용 중 오류 발생 시 원본 상태를 유지한다', () => {
    
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: true,
        },
        {
            type: 'SET',
            path: 'player.unknown',
            value: 100,
        },
    ];
    //expect(() => validateScenarioV2(scenario)).toThrow();
    expect(() => applyEffect(playDataV2.scenarioState,effects)).toThrow('존재하지 않는 값입니다.');
    

    expect(playDataV2.scenarioState.player.reported119).toBe(false);
    expect(playDataV2.scenarioState.player.location).toBe('HOME_LIVING');


});



test('V2 효과의 자료형이 다르면 거부한다', () => {
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: 100,
        },
    ];

    expect(() => applyEffect(playDataV2.scenarioState, effects))
        .toThrow('값 형식이 다릅니다.');
});

test('V2 효과가 비어 있으면 상태값을 유지한다', () => {
    const originalState = playDataV2.scenarioState;

    const nextState = applyEffect(originalState, []);

    expect(nextState).toEqual(originalState);
    expect(nextState).not.toBe(originalState);
});





test('GOTO 실행 시 장면이 변경되고 원본은 유지된다', () => {
    const testScenario: ScenarioV2 = structuredClone(scenario);

    const startScene = testScenario.scenes.find(
        (scene) => scene.id === 'E01'
    );

    if (!startScene) {
        throw new Error('시작 장면이 없습니다.');
    }

    testScenario.scenes.push({
        id: 'E02',
        description: '다음 장면',
        actions: [],
    });

    startScene.actions.push({
        id: 'MOVE',
        text: '다음 장면으로 이동한다.',
        when: [],
        durationMinutes: 2,
        outcomes: [
            {
                when: [],
                resultText: '다음 장면에 도착했습니다.',
                effects: [],
                transition: {
                    type: 'GOTO',
                    sceneId: 'E02',
                },
            },
        ],
    });

    const original = createInitialPlayDataV2(testScenario, 4, 0);
    const result = executeActionV2(original, testScenario, 'MOVE');

    expect(result.currentStageId).toBe('E02');
    expect(result.version).toBe(1);
    expect(result.storyTimeMinutes).toBe(2);

    // 원본 데이터는 변경되지 않아야 함
    expect(original.currentStageId).toBe('E01');
    expect(original.version).toBe(0);
    expect(original.storyTimeMinutes).toBe(0);
    expect(result).not.toBe(original);
});



test('END 실행 시 효과 적용 후 엔딩 조건을 판정한다', () => {
    const testScenario = structuredClone(scenario);

    testScenario.endings.push({
        id: 'TEST_CLEAR',
        state: 'CLEARED',
        title: '테스트 성공',
        description: '정상 종료 테스트',
        requirements: [
            {
                path: 'player.reported119',
                op: 'EQ',
                value: true,
            },
        ],
    });

    testScenario.scenes[0].actions.push({
        id: 'FINISH',
        text: '신고 후 종료',
        when: [],
        durationMinutes: 1,
        outcomes: [
            {
                when: [],
                resultText: '신고했습니다.',
                effects: [
                    {
                        type: 'SET',
                        path: 'player.reported119',
                        value: true,
                    },
                ],
                transition: {
                    type: 'END',
                    endingId: 'TEST_CLEAR',
                },
            },
        ],
    });

    const original = createInitialPlayDataV2(testScenario, 4, 0);
    const result = executeActionV2(original, testScenario, 'FINISH');

    expect(result.state).toBe('CLEARED');
    expect(result.endingId).toBe('TEST_CLEAR');
    expect(result.scenarioState.player.reported119).toBe(true);
    expect(result.version).toBe(1);

    expect(original.state).toBe('PLAYING');
    expect(original.scenarioState.player.reported119).toBe(false);
});

function createEndingTestScenario(
    endingState: 'CLEARED' | 'FAILED',
    requiredReported119: boolean,
): ScenarioV2 {
    const testScenario = structuredClone(scenario);

    testScenario.endings.push({
        id: 'TEST_END',
        state: endingState,
        title: '테스트 엔딩',
        description: '엔딩 처리 검증',
        requirements: [
            {
                path: 'player.reported119',
                op: 'EQ',
                value: requiredReported119,
            },
        ],
    });

    const scene = testScenario.scenes.find(
        (scene) => scene.id === 'E01'
    );

    if (!scene) {
        throw new Error('테스트 장면이 없습니다.');
    }

    scene.actions.push({
        id: 'END_TEST',
        text: '종료 행동',
        when: [],
        durationMinutes: 2,
        outcomes: [
            {
                when: [],
                resultText: '행동을 완료했습니다.',
                effects: [
                    {
                        type: 'SET',
                        path: 'player.reported119',
                        value: true,
                    },
                ],
                transition: {
                    type: 'END',
                    endingId: 'TEST_END',
                },
            },
        ],
    });

    return testScenario;
}


test('FAILED 엔딩도 정상적으로 종료 처리한다', () => {
    const testScenario = createEndingTestScenario('FAILED', true);

    const original = createInitialPlayDataV2(testScenario, 4, 0);
    const result = executeActionV2(original, testScenario, 'END_TEST');

    expect(result.state).toBe('FAILED');
    expect(result.endingId).toBe('TEST_END');
    expect(result.version).toBe(1);
    expect(result.storyTimeMinutes).toBe(2);

    expect(original.state).toBe('PLAYING');
    expect(original.endingId).toBeUndefined();
});

test('엔딩 조건 불충족 시 원본 플레이 데이터가 유지된다', () => {
    const testScenario = createEndingTestScenario('CLEARED', false);

    const original = createInitialPlayDataV2(testScenario, 4, 0);
    const snapshot = structuredClone(original);

    expect(() =>
        executeActionV2(original, testScenario, 'END_TEST')
    ).toThrow('엔딩 조건을 만족하지 못했습니다.');

    expect(original).toEqual(snapshot);
});


test('EQ와 NEQ 조건을 올바르게 평가한다', () => {
    const playData = createInitialPlayDataV2(scenario, 4, 0);
    const state = playData.scenarioState;

    // 현재 reported119 = false

    expect(evaluateCondition(state, {
        path: 'player.reported119',
        op: 'EQ',
        value: false,
    })).toBe(true);

    expect(evaluateCondition(state, {
        path: 'player.reported119',
        op: 'NEQ',
        value: true,
    })).toBe(true);

    expect(evaluateCondition(state, {
        path: 'player.reported119',
        op: 'NEQ',
        value: false,
    })).toBe(false);
});


test('숫자 비교 연산자 4종을 올바르게 평가한다', () => {
    const state: ScenarioState = {
        world: { fireFloor: 10 },
        player: {},
        knowledge: { knownFacts: [] },
    };

    const check = (op: 'GT' | 'GTE' | 'LT' | 'LTE', value: number) =>
        evaluateCondition(state, {
            path: 'world.fireFloor',
            op,
            value,
        });

    expect(check('GT', 9)).toBe(true);
    expect(check('GT', 10)).toBe(false);

    expect(check('GTE', 10)).toBe(true);
    expect(check('GTE', 11)).toBe(false);

    expect(check('LT', 11)).toBe(true);
    expect(check('LT', 10)).toBe(false);

    expect(check('LTE', 10)).toBe(true);
    expect(check('LTE', 9)).toBe(false);
});

test('숫자 비교에 문자열을 사용하면 거부한다', () => {
    const state: ScenarioState = {
        world: { fireFloor: 10 },
        player: {},
        knowledge: { knownFacts: [] },
    };

    expect(() =>
        evaluateCondition(state, {
            path: 'world.fireFloor',
            op: 'GT',
            value: '9',
        }),
    ).toThrow();
});

describe('INCLUDES 조건 평가', () => {
    const state: ScenarioState = {
        world: { fireFloor: 10 },
        player: { reported119: false },
        knowledge: {
            knownFacts: ['alarm_heard', 'smoke_seen'],
        },
    };

    it('배열에 존재하는 값을 찾으면 true를 반환한다', () => {
        expect(evaluateCondition(state, {
            path: 'knowledge.knownFacts',
            op: 'INCLUDES',
            value: 'alarm_heard',
        })).toBe(true);
    });

    it('배열에 없는 값을 찾으면 false를 반환한다', () => {
        expect(evaluateCondition(state, {
            path: 'knowledge.knownFacts',
            op: 'INCLUDES',
            value: 'fire_confirmed',
        })).toBe(false);
    });

    it('배열이 아닌 상태에 INCLUDES를 사용하면 거부한다', () => {
        expect(() => evaluateCondition(state, {
            path: 'player.reported119',
            op: 'INCLUDES',
            value: 'alarm_heard',
        })).toThrow();
    });

    it('비교값이 문자열이 아니면 거부한다', () => {
        expect(() => evaluateCondition(state, {
            path: 'knowledge.knownFacts',
            op: 'INCLUDES',
            value: 123,
        })).toThrow();
    });
});
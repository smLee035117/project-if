import { test, expect } from 'vitest';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import type { ScenarioV2 } from './types/scenario-v2.js';
import { executeActionV2 } from './action-engine-v2.js';
import { loadScenarioV2 } from './scenario-loader-v2.js';

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
  endings: [
    {
      id: 'TEST_DONE',
      state: 'CLEARED',
      title: '테스트 종료',
      description: '엔딩 기능 검증용입니다.',
      requirements: [],
    },
  ],

};


test('V2 플레이의 초기 상태를 생성한다', () => {
  const result = createInitialPlayDataV2(scenario, 4, 0);

  expect(result.score).toBe(100);

  // 나머지 검증 조건을 작성해 보세요.
    expect(result.state).toBe('PLAYING');
    expect(result.currentStep).toBe(0);
    expect(result.currentStageId).toBe('E01');
    expect(result.version).toBe(0);
    expect(result.scenarioVersion).toBe('1.0.0');
    expect(result.storyTimeMinutes).toBe(0);
    expect(result.scenarioState.world.fireFloor).toBe(10);
    expect(result.scenarioState.player.reported119).toBe(false);

});



test('서로 다른 플레이는 상태 객체를 공유하지 않는다', () => {
    const playA = createInitialPlayDataV2(scenario, 4, 0);
    const playB = createInitialPlayDataV2(scenario, 5, 0);

    playA.scenarioState.player.reported119 = true;

    expect(playB.scenarioState.player.reported119).toBe(false);
    expect(scenario.initialState.player.reported119).toBe(false);
});


test('E01-A 행동 실행 시 상태, 시간, 버전이 갱신된다', () => {
    const testScenario = structuredClone(scenario);

    const startScene = testScenario.scenes[0];

    if (!startScene) {
        throw new Error('테스트 시작 장면이 없습니다.');
    }

    startScene.actions.push({
        id: 'E01-A',
        text: '119에 신고한다.',
        when: [],
        durationMinutes: 1,
        outcomes: [
            {
                when: [],
                resultText: '119에 현재 상황을 신고했습니다.',
                effects: [
                    {
                        type: 'SET',
                        path: 'player.reported119',
                        value: true,
                    },
                ],
                transition: { type: 'STAY' },
            },
        ],
    });

    const original = createInitialPlayDataV2(
        testScenario, 4, 0,
    );

    const { playData: result, resultText } =
        executeActionV2(original, testScenario, 'E01-A');

    expect(result.scenarioState.player.reported119).toBe(true);
    expect(result.storyTimeMinutes).toBe(1);
    expect(result.version).toBe(1);
    expect(result.currentStageId).toBe('E01');
    expect(resultText).toBe('119에 현재 상황을 신고했습니다.');

    // 새 시간 이벤트 진행 상태 확인
    expect(result.timelineProgress).toEqual({
        pending: {},
        processed: [],
    });

    // 원본 불변성 확인
    expect(original.scenarioState.player.reported119).toBe(false);
    expect(original.storyTimeMinutes).toBe(0);
    expect(original.version).toBe(0);
    expect(original.timelineProgress).toEqual({
        pending: {},
        processed: [],
    });
});

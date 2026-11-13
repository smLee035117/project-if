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

test('E01-A 행동 실행 시 상태, 시간, 버전이 갱신된다', async () => {

    // 1. V2 시나리오 로딩
  const scenario = await loadScenarioV2('apartment_fire_01');

    // 2. 초기 PlayDataV2 생성
    const playA = createInitialPlayDataV2(scenario, 4, 0);


    // 3. executeActionV2() 실행
    const nextState = executeActionV2(playA,scenario,'E01-A');


    // 4. 실행 결과 검증
    // reported119: true
    // storyTimeMinutes: 1
    // version: 1
    // currentStageId: 'E01'
    expect(nextState.scenarioState.player.reported119).toBe(true);
    expect(nextState.storyTimeMinutes).toBe(1);
    expect(nextState.version).toBe(1);
    expect(nextState.currentStageId).toBe('E01');


    // 5. 원본 PlayDataV2가 변경되지 않았는지 검증

    
    // 원본 상태 유지 확인
    expect(playA.scenarioState.player.reported119).toBe(false);
    expect(playA.storyTimeMinutes).toBe(0);
    expect(playA.version).toBe(0);

    // 원본과 반환 객체가 다른지 확인
    expect(nextState).not.toBe(playA);

});
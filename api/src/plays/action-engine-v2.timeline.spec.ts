
import { describe, expect, test } from 'vitest';

import { executeActionV2 } from './action-engine-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import type { PlayDataV2 } from './types/play-v2.js';
import type {
  ActionV2,
  EffectV2,
  ScenarioV2,
  TransitionV2,
} from './types/scenario-v2.js';

// 실제 콘텐츠 JSON에 의존하지 않는 엔진 연결 테스트 전용 시나리오입니다.
function createTimelineScenario(): ScenarioV2 {
  const action = (
    id: string,
    durationMinutes: number,
    effects: EffectV2[] = [],
    transition: TransitionV2 = { type: 'STAY' },
  ): ActionV2 => ({
    id,
    text: id,
    when: [],
    durationMinutes,
    outcomes: [
      { when: [], resultText: id, effects, transition },
    ],
  });

  return {
    schemaVersion: 2,
    scenarioId: 'timeline_test_01',
    version: '1.0.0',
    title: '상대 시간 이벤트 검증',
    initialSceneId: 'START',
    initialState: {
      world: { rescueCount: 0 },
      player: { location: 'START', reported119: false },
      knowledge: { knownFacts: [] },
    },
    scenes: [
      {
        id: 'START',
        description: '이벤트 테스트 장면',
        actions: [
          action('PREPARE', 10),
          action('REPORT', 2, [
            { type: 'SET', path: 'player.reported119', value: true },
          ]),
          action('RESET_REPORT', 1, [
            { type: 'SET', path: 'player.reported119', value: false },
          ]),
          action('WAIT5', 5),
          action('WAIT2', 2),
          action('END_REPORT', 2, [
            { type: 'SET', path: 'player.reported119', value: true },
          ], { type: 'END', endingId: 'DONE' }),
        ],
      },
    ],
    endings: [
      {
        id: 'DONE',
        state: 'CLEARED',
        title: '완료',
        description: '검증용 종료',
        requirements: [
          { path: 'player.reported119', op: 'EQ', value: true },
        ],
      },
    ],
    timeline: [
      {
        eventId: 'RESCUE',
        description: '신고 완료 17분 후 구조대 도착',
        after: {
          trigger: 'WHEN_BECOMES_TRUE',
          delayMinutes: 17,
          when: [
            { path: 'player.reported119', op: 'EQ', value: true },
          ],
        },
        // ADD를 사용해 중복 실행을 수치로 검증합니다.
        effects: [
          { type: 'ADD', path: 'world.rescueCount', value: 1 },
        ],
      },
    ],
  };
}

function beginAndReport(scenario: ScenarioV2) {
  const original = createInitialPlayDataV2(scenario, 4, 0);
  const prepared = executeActionV2(original, scenario, 'PREPARE').playData;
  const reported = executeActionV2(prepared, scenario, 'REPORT').playData;

  return { original, prepared, reported };
}

function run(
  scenario: ScenarioV2,
  play: PlayDataV2,
  actionId: string,
): PlayDataV2 {
  return executeActionV2(play, scenario, actionId).playData;
}

describe('B-1: 행동 엔진과 상대 시간 이벤트 연결', () => {
  test('조건이 false → true로 바뀌면 행동 종료 시각 + 17분으로 예약한다', () => {
    const scenario = createTimelineScenario();
    const { original, prepared, reported } = beginAndReport(scenario);

    expect(prepared.storyTimeMinutes).toBe(10);
    expect(prepared.timelineProgress.pending).toEqual({});

    expect(reported.storyTimeMinutes).toBe(12);
    expect(reported.scenarioState.player.reported119).toBe(true);
    expect(reported.timelineProgress.pending).toEqual({ RESCUE: 29 });
    expect(reported.timelineProgress.processed).toEqual([]);
    expect(reported.version).toBe(2);

    // 이전 플레이를 덮어쓰지 않아야 합니다.
    expect(original.storyTimeMinutes).toBe(0);
    expect(original.scenarioState.player.reported119).toBe(false);
    expect(original.timelineProgress.pending).toEqual({});
    expect(prepared.timelineProgress.pending).toEqual({});
  });

  test('29분 전에는 실행되지 않고 29분에 정확히 한 번 실행한다', () => {
    const scenario = createTimelineScenario();
    const { reported } = beginAndReport(scenario);

    let before = reported;
    before = run(scenario, before, 'WAIT5'); // 17분
    before = run(scenario, before, 'WAIT5'); // 22분
    before = run(scenario, before, 'WAIT5'); // 27분

    expect(before.storyTimeMinutes).toBe(27);
    expect(before.scenarioState.world.rescueCount).toBe(0);
    expect(before.timelineProgress.pending).toEqual({ RESCUE: 29 });
    expect(before.timelineProgress.processed).toEqual([]);

    const atBoundary = run(scenario, before, 'WAIT2'); // 29분

    expect(atBoundary.storyTimeMinutes).toBe(29);
    expect(atBoundary.scenarioState.world.rescueCount).toBe(1);
    expect(atBoundary.timelineProgress.pending).toEqual({});
    expect(atBoundary.timelineProgress.processed).toEqual(['RESCUE']);

    const after = run(scenario, atBoundary, 'WAIT5'); // 34분

    expect(after.storyTimeMinutes).toBe(34);
    expect(after.scenarioState.world.rescueCount).toBe(1);
    expect(after.timelineProgress.pending).toEqual({});
    expect(after.timelineProgress.processed).toEqual(['RESCUE']);

    // 다음 행동이 과거 결과를 변경해서는 안 됩니다.
    expect(before.scenarioState.world.rescueCount).toBe(0);
    expect(before.timelineProgress.pending).toEqual({ RESCUE: 29 });
    expect(atBoundary.scenarioState.world.rescueCount).toBe(1);
  });

  test('조건이 다시 참이 되더라도 최초 예약 시각을 변경하지 않는다', () => {
    const scenario = createTimelineScenario();
    const { reported } = beginAndReport(scenario); // 12분, 29분 예약

    const reset = run(scenario, reported, 'RESET_REPORT'); // 13분
    const reportedAgain = run(scenario, reset, 'REPORT'); // 15분

    expect(reset.scenarioState.player.reported119).toBe(false);
    expect(reportedAgain.scenarioState.player.reported119).toBe(true);
    expect(reportedAgain.timelineProgress.pending).toEqual({ RESCUE: 29 });
    expect(reportedAgain.timelineProgress.processed).toEqual([]);
  });

  test('종료되는 행동은 상대 시간 이벤트를 새로 예약하지 않는다', () => {
    const scenario = createTimelineScenario();
    const original = createInitialPlayDataV2(scenario, 4, 0);
    const ended = run(scenario, original, 'END_REPORT');

    expect(ended.state).toBe('CLEARED');
    expect(ended.endingId).toBe('DONE');
    expect(ended.scenarioState.player.reported119).toBe(true);
    expect(ended.timelineProgress.pending).toEqual({});
    expect(ended.timelineProgress.processed).toEqual([]);
  });
});

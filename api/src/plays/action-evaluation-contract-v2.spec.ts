import { describe, expect, test } from 'vitest';

import { executeActionV2 } from './action-engine-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';
import { validateScenarioV2 } from './scenario-validator-v2.js';
import { advanceTimeV2 } from './time-engine-v2.js';
import type { StateValue } from './types/play-v2.js';
import type {
  ConditionV2,
  EffectV2,
  OutcomeV2,
  ScenarioV2,
} from './types/scenario-v2.js';

// 제안된 데이터 형태를 테스트에서만 선언합니다.
// 구현 후 엔진의 실제 타입으로 교체할 수 있습니다.
type Moment = 'ACTION_START' | 'ACTION_END';
type StatePath = `player.${string}` | `world.${string}`;
type ValueRef =
  | { kind: 'TIME'; at: Moment }
  | { kind: 'STATE'; at: Moment; path: StatePath };
type ContractCondition =
  | ConditionV2
  | {
      left: ValueRef;
      op: Exclude<ConditionV2['op'], 'INCLUDES'>;
      value: StateValue | ValueRef;
    }
  | { op: 'AND' | 'OR'; conditions: ContractCondition[] }
  | { op: 'NOT'; condition: ContractCondition };
type ContractEffect =
  | EffectV2
  | { type: 'SET_FROM'; path: StatePath; from: ValueRef };
type ContractOutcome = Omit<OutcomeV2, 'when' | 'effects'> & {
  when: ContractCondition[];
  effects: ContractEffect[];
};

const time = (at: Moment): ValueRef => ({ kind: 'TIME', at });
const state = (at: Moment, path: StatePath): ValueRef => ({
  kind: 'STATE',
  at,
  path,
});

function outcome(
  resultText: string,
  when: ContractCondition[] = [],
  effects: ContractEffect[] = [],
): ContractOutcome {
  return { resultText, when, effects, transition: { type: 'STAY' } };
}

function reportScenario(
  when: ContractCondition[],
  outcomes: ContractOutcome[],
): ScenarioV2 {
  const scenario = {
    schemaVersion: 2,
    scenarioId: 'action_contract_test',
    version: '1.0.0',
    title: '행동 평가 계약 테스트',
    initialSceneId: 'HALL',
    initialState: {
      world: { alarmActive: false },
      player: {
        canReport: true,
        smokePhase: 2,
        lastReportPhase: 1,
        reportStartedAt: 0,
        reportEndedAt: 0,
        phaseAtCompletion: 0,
      },
      knowledge: { knownFacts: [] },
    },
    scenes: [{
      id: 'HALL',
      description: '공용 홀입니다.',
      actions: [{
        id: 'REPORT',
        text: '119에 신고한다',
        when,
        durationMinutes: 1,
        outcomes,
      }],
    }],
    endings: [{
      id: 'DONE',
      title: '종료',
      description: '검증용 종료입니다.',
      state: 'CLEARED',
      requirements: [],
    }],
    timeEvents: [{
      id: 'smoke-worsens',
      atMinute: 9.5,
      when: [],
      effects: [
        { type: 'SET', path: 'player.smokePhase', value: 3 },
        { type: 'SET', path: 'player.canReport', value: false },
        { type: 'SET', path: 'world.alarmActive', value: true },
      ],
    }],
  } as const;

  // JSON 로더가 받는 형태를 현행 엔진에도 전달해 동작 수준에서 검증합니다.
  return scenario as unknown as ScenarioV2;
}

function playAt(scenario: ScenarioV2, minute: number) {
  return { ...createInitialPlayDataV2(scenario, 1, 0), storyTimeMinutes: minute };
}

const canReport: ConditionV2 = { path: 'player.canReport', op: 'EQ', value: true };
const hasNewPhase: ContractCondition = {
  left: state('ACTION_START', 'player.smokePhase'),
  op: 'GT',
  value: state('ACTION_START', 'player.lastReportPhase'),
};

describe('기존 V2 행동 평가 순서', () => {
  test.each([[3.49, 3.5], [4.49, 4.5]])(
    'T+%s에는 사건을 적용하지 않고 T+%s에 한 번 적용한다',
    (before, boundary) => {
      const scenario = reportScenario([], [outcome('신고 완료')]);
      const initial = scenario.initialState;
      const events = [{
        id: 'boundary',
        atMinute: boundary,
        when: [],
        effects: [{ type: 'ADD' as const, path: 'player.smokePhase', value: 1 }],
      }];

      const earlier = advanceTimeV2(initial, before - 0.25, 0.25, events);
      expect(earlier.endMinute).toBe(before);
      expect(earlier.handledEventIds).toEqual([]);
      expect(earlier.scenarioState.player.smokePhase).toBe(2);

      const exact = advanceTimeV2(earlier.scenarioState, earlier.endMinute, 0.01, events);
      expect(exact.endMinute).toBe(boundary);
      expect(exact.handledEventIds).toEqual(['boundary']);
      expect(exact.scenarioState.player.smokePhase).toBe(3);

      const later = advanceTimeV2(exact.scenarioState, exact.endMinute, 0.25, events);
      expect(later.handledEventIds).toEqual([]);
      expect(later.scenarioState.player.smokePhase).toBe(3);
    },
  );

  test('행동 허용은 시작 상태, 기존 상수 조건은 이벤트 반영 후 상태를 본다', () => {
    const scenario = reportScenario([canReport], [
      outcome('악화 전', [{ path: 'player.smokePhase', op: 'EQ', value: 2 }]),
      outcome('악화 후', [{ path: 'player.smokePhase', op: 'EQ', value: 3 }]),
    ]);
    validateScenarioV2(scenario);
    const before = playAt(scenario, 9);
    const result = executeActionV2(before, scenario, 'REPORT');

    expect(result.resultText).toBe('악화 후');
    expect(result.playData.storyTimeMinutes).toBe(10);
    expect(result.playData.timelineProgress.processed).toEqual(['smoke-worsens']);
    expect(result.playData.scenarioState.player.canReport).toBe(false);
    expect(before.scenarioState.player).toMatchObject({ smokePhase: 2, canReport: true });
    expect(() => executeActionV2(result.playData, scenario, 'REPORT')).toThrow(/행동 조건/);
  });
});

describe('행동 시작·종료 평가 확장 계약', () => {
  test('분기는 같은 행동의 시작 상태, 종료 상태와 두 시각을 함께 읽을 수 있다', () => {
    const scenario = reportScenario([canReport], [
      outcome('통화 도중 악화', [
        { left: time('ACTION_START'), op: 'LT', value: 9.5 },
        { left: time('ACTION_END'), op: 'GTE', value: 9.5 },
        { left: state('ACTION_START', 'player.smokePhase'), op: 'EQ', value: 2 },
        { left: state('ACTION_END', 'player.smokePhase'), op: 'EQ', value: 3 },
      ]),
    ]);

    expect(executeActionV2(playAt(scenario, 9), scenario, 'REPORT').resultText)
      .toBe('통화 도중 악화');
  });

  test('단계 2에 시작해 단계 3에 끝나도 신고 단계는 2로 기록한다', () => {
    const scenario = reportScenario([], [outcome('신고 완료', [], [
      { type: 'SET_FROM', path: 'player.reportStartedAt', from: time('ACTION_START') },
      { type: 'SET_FROM', path: 'player.reportEndedAt', from: time('ACTION_END') },
      {
        type: 'SET_FROM',
        path: 'player.lastReportPhase',
        from: state('ACTION_START', 'player.smokePhase'),
      },
      {
        type: 'SET_FROM',
        path: 'player.phaseAtCompletion',
        from: state('ACTION_END', 'player.smokePhase'),
      },
    ])]);
    const before = playAt(scenario, 9);
    const { playData } = executeActionV2(before, scenario, 'REPORT');

    expect(playData.scenarioState.player).toMatchObject({
      reportStartedAt: 9,
      reportEndedAt: 10,
      smokePhase: 3,
      lastReportPhase: 2,
      phaseAtCompletion: 3,
    });
    expect(playData.actionHistory?.at(-1)).toMatchObject({
      startedAtMinute: 9,
      endedAtMinute: 10,
    });
    expect(before.scenarioState.player.lastReportPhase).toBe(1);
  });

  test('같은 시작 단계의 반복 신고를 화면과 실행 모두에서 차단한다', () => {
    const scenario = reportScenario([hasNewPhase], [outcome('신고 완료', [], [{
      type: 'SET_FROM',
      path: 'player.lastReportPhase',
      from: state('ACTION_START', 'player.smokePhase'),
    }])]);
    const before = playAt(scenario, 9);
    before.scenarioState.player.lastReportPhase = 2;

    // 통화 도중에 새 단계가 될 예정이라는 사실만으로 신고가 열리면 안 됩니다.
    expect(() => executeActionV2(before, scenario, 'REPORT')).toThrow(/행동 조건/);
    expect(buildPlayViewV2(before, scenario).actions[0]?.available).toBe(false);

    const after = playAt(scenario, 10);
    after.scenarioState.player.lastReportPhase = 2;
    after.scenarioState.player.smokePhase = 3;
    expect(buildPlayViewV2(after, scenario).actions[0]?.available).toBe(true);
    const submitted = executeActionV2(after, scenario, 'REPORT').playData;
    expect(submitted.scenarioState.player.lastReportPhase).toBe(3);
    expect(buildPlayViewV2(submitted, scenario).actions[0]?.available).toBe(false);
  });

  test('중첩 OR·NOT 그룹을 읽되 기존 최상위 배열은 AND로 유지한다', () => {
    const scenario = reportScenario([canReport, {
      op: 'OR',
      conditions: [
        { path: 'player.smokePhase', op: 'EQ', value: 1 },
        {
          op: 'NOT',
          condition: {
            op: 'AND',
            conditions: [
              { path: 'player.smokePhase', op: 'EQ', value: 2 },
              { path: 'player.lastReportPhase', op: 'EQ', value: 2 },
            ],
          },
        },
      ],
    }], [outcome('신고 완료')]);
    expect(() => validateScenarioV2(scenario)).not.toThrow();
    const play = playAt(scenario, 5);

    expect(buildPlayViewV2(play, scenario).actions[0]?.available).toBe(true);
    play.scenarioState.player.lastReportPhase = 2;
    expect(buildPlayViewV2(play, scenario).actions[0]?.available).toBe(false);
    play.scenarioState.player.smokePhase = 1;
    expect(buildPlayViewV2(play, scenario).actions[0]?.available).toBe(true);
    play.scenarioState.player.canReport = false;
    expect(buildPlayViewV2(play, scenario).actions[0]?.available).toBe(false);
  });

  test.each([
    { path: 'world.alarmActive', op: 'EQ', value: true } satisfies ContractCondition,
    {
      left: state('ACTION_START', 'player.canReport'),
      op: 'EQ',
      value: state('ACTION_START', 'world.alarmActive'),
    } satisfies ContractCondition,
  ])('행동 노출 검증은 중첩 조건의 비공개 world 참조를 거절한다 (%j)', (hidden) => {
    const scenario = reportScenario([{
      op: 'OR',
      conditions: [canReport, { op: 'NOT', condition: hidden }],
    }], [outcome('신고 완료')]);

    expect(() => validateScenarioV2(scenario)).toThrow(/비공개 world/);
  });

  test('검증기는 숫자 참조를 숫자 상태에만 대입하도록 검사한다', () => {
    const numeric = reportScenario([], [outcome('신고 완료', [], [{
      type: 'SET_FROM',
      path: 'player.reportStartedAt',
      from: time('ACTION_START'),
    }])]);
    expect(() => validateScenarioV2(numeric)).not.toThrow();
    const wrongType = reportScenario([], [outcome('신고 완료', [], [{
      type: 'SET_FROM',
      path: 'player.canReport',
      from: time('ACTION_START'),
    }])]);
    expect(() => validateScenarioV2(wrongType)).toThrow();
  });
});


import { describe, test, expect } from 'vitest';

import { loadScenarioV2 } from './scenario-loader-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { executeActionV2 } from './action-engine-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';

import type { PlayDataV2 } from './types/play-v2.js';
import type { ScenarioV2 } from './types/scenario-v2.js';

function execute(
  play: PlayDataV2,
  scenario: ScenarioV2,
  actionId: string,
): PlayDataV2 {
  return executeActionV2(play, scenario, actionId).playData;
}

function semanticKey(play: PlayDataV2): string {
  // 실제 게임 시간과 요청 버전은 의도적으로 제외합니다.
  // 시간만 흐르고 상황이 같다면 동일한 의미의 상태입니다.
  return JSON.stringify({
    scene: play.currentStageId,
    state: play.state,
    endingId: play.endingId ?? null,
    scenarioState: play.scenarioState,
    timelineProgress: play.timelineProgress,
  });
}

describe('화재 시나리오: 반복 및 정체 상태 검증', () => {
  test('X: 계단 반복 탐색이 진압 후 대기 종료 흐름으로 연결된다', async () => {
    const scenario = await loadScenarioV2('apartment_fire_01');

    let play = createInitialPlayDataV2(scenario, 1, 0);

    const steps = [
      'F_START_DOOR',
      'F_ENTER_HALL',
      'F_CHECK_STAIR',
      'F_GUIDED_DESCEND',
      'F_LOWER_BACK',
      'F_CHECK_STAIR',
      'F_GUIDED_DESCEND',
      'F_LOWER_BACK',
      'F_CHECK_STAIR',
    ];

    for (const actionId of steps) {
      play = execute(play, scenario, actionId);
    }

    expect(play.storyTimeMinutes).toBe(12);
    expect(play.scenarioState.world.clear).toBe(true);

    // 이전에는 여기서 다시 F_STAIR_VIEW로 이동할 수 있었습니다.
    expect(play.currentStageId).toBe('F_WAIT');
    expect(play.scenarioState.player.clearHeard).toBe(true);

    play = execute(play, scenario, 'F_HOME_DOOR');

    expect(play.currentStageId).toBe('F_CLEAR');

    play = execute(play, scenario, 'F_INSIDE_END');

    expect(play.state).toBe('CLEARED');
    expect(play.endingId).toBe('SAFE_INSIDE');
  });

  test('Y: 현관 왕복을 반복해도 해소 안내 후 종료로 이어진다', async () => {
    const scenario = structuredClone(
      await loadScenarioV2('apartment_fire_01'),
    );
    scenario.initialState.world.incidentVariant = 'Y';

    let play = createInitialPlayDataV2(scenario, 1, 0);

    play = execute(play, scenario, 'F_START_DOOR');
    play = execute(play, scenario, 'F_ENTRY_BACK');

    // 진압 이전의 현관 확인 및 복귀는 허용합니다.
    for (let i = 0; i < 7; i++) {
      play = execute(play, scenario, 'F_HOME_DOOR');
      expect(play.currentStageId).toBe('F_ENTRY');

      play = execute(play, scenario, 'F_ENTRY_BACK');
      expect(play.currentStageId).toBe('F_WAIT');
    }

    expect(play.storyTimeMinutes).toBe(16);
    expect(play.scenarioState.world.clear).toBe(false);

    // 16분 → 17분: 화재 해소 이벤트
    play = execute(play, scenario, 'F_HOME_DOOR');

    expect(play.storyTimeMinutes).toBe(17);
    expect(play.scenarioState.world.clear).toBe(true);
    expect(play.currentStageId).toBe('F_CLEAR');

    play = execute(play, scenario, 'F_INSIDE_END');

    expect(play.state).toBe('CLEARED');
    expect(play.endingId).toBe('SAFE_INSIDE');
  });

  test('Z: 실내 연기가 발생하면 기존 대피 흐름을 유지한다', async () => {
    const scenario = structuredClone(
      await loadScenarioV2('apartment_fire_01'),
    );
    scenario.initialState.world.incidentVariant = 'Z';

    let play = createInitialPlayDataV2(scenario, 1, 0);

    for (let i = 0; i < 6; i++) {
      play = execute(play, scenario, 'F_START_WAIT');
    }

    // 12분에는 공용 홀에만 연기가 있습니다.
    expect(play.scenarioState.world.hallSmoke).toBe(true);
    expect(play.scenarioState.world.insideSmoke).toBe(false);

    // 12분 → 13분: 실내 연기 발생
    play = execute(play, scenario, 'F_START_DOOR');

    expect(play.scenarioState.world.insideSmoke).toBe(true);
    expect(play.scenarioState.world.clear).toBe(false);
    expect(play.currentStageId).toBe('F_SMOKE');
  });

  test.each(['X', 'Y'])(
    '%s: 화재 해소 후 의미 없는 상태 순환이 존재하지 않는다',
    async (variant) => {
      const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
      );
      scenario.initialState.world.incidentVariant = variant;

      const initial = createInitialPlayDataV2(scenario, 1, 0);

      const queue: PlayDataV2[] = [initial];
      const visited = new Set<string>([
        `${initial.storyTimeMinutes}:${semanticKey(initial)}`,
      ]);

      const stableStates: PlayDataV2[] = [];

      const LIMIT = 20_000;
      const STABLE_MINUTE = 18;

      // 먼저 18분 이후에 도달할 수 있는 상태들을 찾습니다.
      // 화재 JSON의 마지막 절대시간 이벤트는 17분입니다.
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const play = queue[cursor]!;

        if (play.state !== 'PLAYING') {
          continue;
        }

        if (play.storyTimeMinutes >= STABLE_MINUTE) {
          stableStates.push(play);
          continue;
        }

        const view = buildPlayViewV2(play, scenario);

        for (const action of view.actions) {
          if (!action.available) continue;

          const next = execute(play, scenario, action.id);

          const key =
            `${next.storyTimeMinutes}:${semanticKey(next)}`;

          if (visited.has(key)) continue;

          visited.add(key);

          if (queue.length >= LIMIT) {
            throw new Error(
              `[${variant}] 탐색 제한 초과: ${LIMIT}`,
            );
          }

          queue.push(next);
        }
      }

      // 이후에는 시간만 증가하고 동일 상태가 반복되는
      // 순환 구조가 있는지 검사합니다.
      const completed = new Set<string>();
      const activePath = new Map<string, number>();

      function inspect(
        play: PlayDataV2,
        path: string[],
      ): void {
        if (play.state !== 'PLAYING') return;

        if (
          Object.keys(play.timelineProgress.pending).length > 0
        ) {
          throw new Error(
            `[${variant}] 예약 이벤트가 있는 상태는 ` +
            '시간 독립적인 순환 검사 대상이 아닙니다.',
          );
        }

        const key = semanticKey(play);
        const cycleStart = activePath.get(key);

        if (cycleStart !== undefined) {
          throw new Error(
            `[${variant}] 의미 없는 반복 발견: ` +
            path.slice(cycleStart).join(' → '),
          );
        }

        if (completed.has(key)) return;

        activePath.set(key, path.length);

        const view = buildPlayViewV2(play, scenario);

        for (const action of view.actions) {
          if (!action.available) continue;

          const next = execute(play, scenario, action.id);

          inspect(next, [...path, action.id]);
        }

        activePath.delete(key);
        completed.add(key);
      }

      for (const play of stableStates) {
        inspect(play, []);
      }

      console.info(
        `[${variant}] 18분 이후 시작 상태 ${stableStates.length}개, ` +
        `순환 검사 상태 ${completed.size}개`,
      );

      expect(visited.size).toBeGreaterThan(1);
    },
  );
});

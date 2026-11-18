
import { describe, test, expect } from 'vitest';

import { loadScenarioV2 } from './scenario-loader-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';


import { executeActionV2 } from './action-engine-v2.js';

describe('F-1: 화재 시나리오 실제 콘텐츠 검증', () => {
  test.each(['X', 'Y', 'Z'])(
    '%s 상황에서 정상적으로 플레이를 시작한다',
    async (variant) => {
      // 실제 화재 시나리오 로딩
      const original = await loadScenarioV2(
        'apartment_fire_01',
      );

      // 원본 JSON을 변경하지 않고 테스트용 복제
      const scenario = structuredClone(original);

      scenario.initialState.world.incidentVariant = variant;

      // 플레이 시작
      const playData = createInitialPlayDataV2(
        scenario,
        1,
        0,
      );

      // 사용자에게 공개되는 화면 데이터 생성
      const view = buildPlayViewV2(playData, scenario);

      // 초기 상태 검증
      expect(playData.state).toBe('PLAYING');
      expect(playData.version).toBe(0);
      expect(playData.storyTimeMinutes).toBe(0);

      // 선택한 상황이 유지되는지 확인
      expect(
        playData.scenarioState.world.incidentVariant,
      ).toBe(variant);

      // 초기 장면과 행동 목록 확인
      expect(view.currentSceneId).toBe(
        scenario.initialSceneId,
      );

      expect(view.sceneDescription.length)
        .toBeGreaterThan(0);

      expect(view.actions.length)
        .toBeGreaterThan(0);

      expect(view.actions.some(action => action.available))
        .toBe(true);

      // 최초에는 시간 이벤트 예약 없음
      expect(playData.timelineProgress).toEqual({
        pending: {},
        processed: [],
      });

      // 복제한 테스트 데이터가 원본에 영향을 주지 않음
      expect(original.initialState.world.incidentVariant)
        .toBe('X');
    },
  );



    test('X 상황: 4분 동행 제안, 12분 상황 해소', async () => {
    const scenario = await loadScenarioV2('apartment_fire_01');
    let play = createInitialPlayDataV2(scenario, 1, 0);

    // 0분 → 4분
    for (let i = 0; i < 2; i++) {
        play = executeActionV2(play, scenario, 'F_START_WAIT').playData;
    }

    expect(play.storyTimeMinutes).toBe(4);
    expect(play.scenarioState.world.escortOffered).toBe(true);
    expect(play.scenarioState.world.stairSmoke).toBe(false);

    // 4분 → 12분
    for (let i = 0; i < 4; i++) {
        play = executeActionV2(play, scenario, 'F_START_WAIT').playData;
    }

    expect(play.storyTimeMinutes).toBe(12);
    expect(play.scenarioState.world.clear).toBe(true);
    expect(play.currentStageId).toBe('F_CLEAR');
    });

    test('Y 상황: 6분 계단 연기, 17분 상황 해소', async () => {
    const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
    );
    scenario.initialState.world.incidentVariant = 'Y';

    let play = createInitialPlayDataV2(scenario, 1, 0);

    // 0분 → 6분
    for (let i = 0; i < 3; i++) {
        play = executeActionV2(play, scenario, 'F_START_WAIT').playData;
    }

    expect(play.storyTimeMinutes).toBe(6);
    expect(play.scenarioState.world.stairSmoke).toBe(true);
    expect(play.scenarioState.world.escortOffered).toBe(false);

    // 6분 → 16분
    for (let i = 0; i < 5; i++) {
        play = executeActionV2(play, scenario, 'F_START_WAIT').playData;
    }

    expect(play.scenarioState.world.clear).toBe(false);

    // 16분 → 18분: 17분 이벤트가 포함됩니다.
    play = executeActionV2(
        play, scenario, 'F_START_WAIT',
    ).playData;

    expect(play.storyTimeMinutes).toBe(18);
    expect(play.scenarioState.world.clear).toBe(true);
    expect(play.currentStageId).toBe('F_CLEAR');
    });

    test('Z 상황: 계단 → 홀 → 실내 연기 순서', async () => {
    const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
    );
    scenario.initialState.world.incidentVariant = 'Z';

    let play = createInitialPlayDataV2(scenario, 1, 0);

    // 0분 → 8분
    for (let i = 0; i < 4; i++) {
        play = executeActionV2(play, scenario, 'F_START_WAIT').playData;
    }

    expect(play.storyTimeMinutes).toBe(8);
    expect(play.scenarioState.world.stairSmoke).toBe(false);

    // 8분 → 10분: 9분 계단 연기
    play = executeActionV2(
        play, scenario, 'F_START_WAIT',
    ).playData;

    expect(play.scenarioState.world.stairSmoke).toBe(true);

    // 10분 → 12분: 공용 홀 연기
    play = executeActionV2(
        play, scenario, 'F_START_WAIT',
    ).playData;

    expect(play.scenarioState.world.hallSmoke).toBe(true);
    expect(play.scenarioState.world.insideSmoke).toBe(false);

    // 12분 → 14분: 13분 실내 연기
    play = executeActionV2(
        play, scenario, 'F_START_WAIT',
    ).playData;

    expect(play.storyTimeMinutes).toBe(14);
    expect(play.scenarioState.world.insideSmoke).toBe(true);
    expect(play.currentStageId).toBe('F_SMOKE');
    expect(play.scenarioState.world.clear).toBe(false);
    });



    test.each([
    ['X', 6, 13],
    ['Y', 9, 19],
    ])(
    '%s 상황: 대기 후 SAFE_INSIDE 엔딩에 도달한다',
    async (variant, waitCount, expectedMinute) => {
        const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
        );

        scenario.initialState.world.incidentVariant = variant;

        let play = createInitialPlayDataV2(scenario, 1, 0);

        for (let i = 0; i < waitCount; i++) {
        play = executeActionV2(
            play,
            scenario,
            'F_START_WAIT',
        ).playData;
        }

        expect(play.currentStageId).toBe('F_CLEAR');

        play = executeActionV2(
        play,
        scenario,
        'F_INSIDE_END',
        ).playData;

        expect(play.state).toBe('CLEARED');
        expect(play.endingId).toBe('SAFE_INSIDE');
        expect(play.storyTimeMinutes).toBe(expectedMinute);
        expect(play.timelineProgress.pending).toEqual({});

        // 종료 후에는 추가 행동을 허용하지 않습니다.
        expect(() =>
        executeActionV2(play, scenario, 'F_INSIDE_END'),
        ).toThrow();
    },
    );

    test('Z 상황: 대피공간에서 구조되어 RESCUED 엔딩에 도달한다', async () => {
    const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
    );

    scenario.initialState.world.incidentVariant = 'Z';

    let play = createInitialPlayDataV2(scenario, 1, 0);

    // 0분 → 14분: 실내 연기 발생
    for (let i = 0; i < 7; i++) {
        play = executeActionV2(
        play,
        scenario,
        'F_START_WAIT',
        ).playData;
    }

    expect(play.currentStageId).toBe('F_SMOKE');

    // 14분 → 15분: 대피공간 이동
    play = executeActionV2(
        play, scenario, 'F_REFUGE',
    ).playData;

    expect(play.currentStageId).toBe('F_REFUGE_ROOM');

    // 15분 → 16분: 대피 위치 신고
    play = executeActionV2(
        play, scenario, 'F_REFUGE_CALL',
    ).playData;

    expect(play.timelineProgress.pending)
        .toEqual({ F_RESCUE_READY: 22 });

    // 16분 → 22분: 구조 인력 도착
    play = executeActionV2(
        play, scenario, 'F_REFUGE_WAIT',
    ).playData;

    expect(play.scenarioState.world.rescueReady).toBe(true);
    expect(play.currentStageId).toBe('F_CONTACT');

    // 구조 인력 안내를 따라 이동
    play = executeActionV2(
        play, scenario, 'F_ESCORT',
    ).playData;

    play = executeActionV2(
        play, scenario, 'F_RESCUE_FINISH',
    ).playData;

    expect(play.state).toBe('CLEARED');
    expect(play.endingId).toBe('RESCUED');
    expect(play.storyTimeMinutes).toBe(25);
    expect(play.timelineProgress.pending).toEqual({});
    expect(play.timelineProgress.processed)
        .toContain('F_RESCUE_READY');
    });



    test('Y 상황: 계단 연기 노출 후 실패 엔딩에 도달한다', async () => {
    const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
    );
    scenario.initialState.world.incidentVariant = 'Y';

    let play = createInitialPlayDataV2(scenario, 1, 0);

    const steps = [
        ['F_START_DOOR', 'F_ENTRY', 1],
        ['F_ENTER_HALL', 'F_STAIR_DOOR', 3],
        ['F_CHECK_STAIR', 'F_STAIR_VIEW', 4],
        ['F_DESCEND', 'F_UPPER', 6],
    ] as const;

    for (const [actionId, expectedScene, expectedMinute] of steps) {
        play = executeActionV2(
        play,
        scenario,
        actionId,
        ).playData;

        expect(play.currentStageId).toBe(expectedScene);
        expect(play.storyTimeMinutes).toBe(expectedMinute);
    }

    // 6분에 발생한 계단 연기 이벤트가 반영됩니다.
    expect(play.scenarioState.world.stairSmoke).toBe(true);
    expect(play.scenarioState.player.exposed).toBe(true);
    expect(play.timelineProgress.processed)
        .toContain('F_Y_STAIR');

    // 위험한 행동을 계속하면 실패 엔딩에 도달합니다.
    play = executeActionV2(
        play,
        scenario,
        'F_FORCE_DOWN',
    ).playData;

    expect(play.storyTimeMinutes).toBe(8);
    expect(play.state).toBe('FAILED');
    expect(play.endingId).toBe('EXPOSURE_FAILURE');
    expect(play.scenarioState.player.incapacitated).toBe(true);

    // 실패 이후 행동은 거절됩니다.
    expect(() =>
        executeActionV2(play, scenario, 'F_FORCE_DOWN'),
    ).toThrow();
    });






    test.each(['X', 'Y', 'Z'])(
    '%s 상황: 제한된 범위에서 진행 불능과 엔진 예외를 탐색한다',
    async (variant) => {
        const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
        );
        scenario.initialState.world.incidentVariant = variant;

        const MAX_DEPTH = 12;
        const MAX_MINUTES = 26;
        const MAX_STATES = 10_000;

        type Play = ReturnType<typeof createInitialPlayDataV2>;

        type SearchNode = {
        play: Play;
        path: string[];
        depth: number;
        };

        // 같은 게임 상태를 여러 경로에서 발견해도 중복 탐색하지 않습니다.
        // version은 요청 횟수이므로 탐색 상태 식별에서는 제외합니다.
        function stateKey(play: Play): string {
        return JSON.stringify({
            scene: play.currentStageId,
            state: play.state,
            endingId: play.endingId ?? null,
            minute: play.storyTimeMinutes,
            scenarioState: play.scenarioState,
            timelineProgress: play.timelineProgress,
        });
        }

        const initial = createInitialPlayDataV2(scenario, 1, 0);

        const queue: SearchNode[] = [
        { play: initial, path: [], depth: 0 },
        ];

        const visited = new Set<string>([stateKey(initial)]);
        const foundEndings = new Set<string>();

        // 너비 우선 탐색(BFS)
        for (let cursor = 0; cursor < queue.length; cursor++) {
        const { play, path, depth } = queue[cursor]!;

        let view: ReturnType<typeof buildPlayViewV2>;

        try {
            view = buildPlayViewV2(play, scenario);
        } catch (error) {
            throw new Error(
            `[${variant}] 장면 구성 실패\n` +
            `장면: ${play.currentStageId}\n` +
            `시간: ${play.storyTimeMinutes}\n` +
            `경로: ${path.join(' → ')}\n` +
            `원인: ${String(error)}`,
            );
        }

        if (play.state !== 'PLAYING') {
            if (play.endingId) {
            foundEndings.add(play.endingId);
            }
            continue;
        }

        const availableActions = view.actions.filter(
            (action) => action.available,
        );

        // 종료되지 않았는데 아무 행동도 할 수 없다면 진행 불능입니다.
        if (availableActions.length === 0) {
            throw new Error(
            `[${variant}] 진행 불능 발견\n` +
            `장면: ${play.currentStageId}\n` +
            `시간: ${play.storyTimeMinutes}\n` +
            `경로: ${path.join(' → ')}`,
            );
        }

        // 제한에 도달하면 더 확장하지 않습니다.
        if (
            depth >= MAX_DEPTH ||
            play.storyTimeMinutes >= MAX_MINUTES
        ) {
            continue;
        }

        for (const action of availableActions) {
            const nextPath = [...path, action.id];

            let nextPlay: Play;

            try {
            nextPlay = executeActionV2(
                play,
                scenario,
                action.id,
            ).playData;
            } catch (error) {
            throw new Error(
                `[${variant}] 행동 실행 실패\n` +
                `장면: ${play.currentStageId}\n` +
                `시간: ${play.storyTimeMinutes}\n` +
                `경로: ${nextPath.join(' → ')}\n` +
                `원인: ${String(error)}`,
            );
            }

            const key = stateKey(nextPlay);

            if (visited.has(key)) {
            continue;
            }

            visited.add(key);

            if (queue.length >= MAX_STATES) {
            throw new Error(
                `[${variant}] 탐색 상태 상한 초과: ${MAX_STATES}`,
            );
            }

            queue.push({
            play: nextPlay,
            path: nextPath,
            depth: depth + 1,
            });
        }
        }

        console.info(
        `[${variant}] 탐색 상태 ${visited.size}개, ` +
        `발견 엔딩: ${[...foundEndings].join(', ')}`,
        );

        expect(visited.size).toBeGreaterThan(1);
        expect(foundEndings.size).toBeGreaterThan(0);
    },
    );



    test('Z 상황: 연기에 노출된 후 구조 엔딩에 도달한다', async () => {
    const scenario = structuredClone(
        await loadScenarioV2('apartment_fire_01'),
    );
    scenario.initialState.world.incidentVariant = 'Z';

    let play = createInitialPlayDataV2(scenario, 1, 0);

    const steps = [
        ['F_START_DOOR', 'F_ENTRY', 1],
        ['F_ENTER_HALL', 'F_STAIR_DOOR', 3],
        ['F_CHECK_STAIR', 'F_STAIR_VIEW', 4],
        ['F_DESCEND', 'F_LOWER', 6],
        ['F_GO_OUT', 'F_UPPER', 10],
        ['F_UPPER_BACK', 'F_STAIR_BLOCKED', 11],
        ['F_BLOCK_BACK', 'F_WAIT', 12],
        ['F_HOME_WAIT', 'F_SMOKE', 14],
        ['F_REFUGE', 'F_REFUGE_ROOM', 15],
        ['F_REFUGE_CALL', 'F_REFUGE_ROOM', 16],
        ['F_REFUGE_WAIT', 'F_CONTACT', 22],
        ['F_ESCORT', 'F_RESCUED', 24],
        ['F_RESCUE_FINISH', 'F_RESCUED', 25],
    ] as const;

    for (const [actionId, expectedScene, expectedMinute] of steps) {
        play = executeActionV2(
        play,
        scenario,
        actionId,
        ).playData;

        expect(play.currentStageId).toBe(expectedScene);
        expect(play.storyTimeMinutes).toBe(expectedMinute);
    }

    expect(play.scenarioState.player.exposed).toBe(true);
    expect(play.scenarioState.world.rescueReady).toBe(true);

    expect(play.state).toBe('CLEARED');
    expect(play.endingId).toBe('RESCUED_WITH_EXPOSURE');

    expect(play.timelineProgress.pending).toEqual({});
    expect(play.timelineProgress.processed)
        .toContain('F_RESCUE_READY');
    });



});

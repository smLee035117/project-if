import { describe, test, expect } from 'vitest';

import { loadScenarioV2 } from './scenario-loader-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';
import { executeActionV2 } from './action-engine-v2.js';

describe('사무실 화재 V2 실제 콘텐츠 검증', () => {
    test('초기 플레이 상태를 정상적으로 구성한다', async () => {
        const scenario = await loadScenarioV2('office_fire_01');

        const play = createInitialPlayDataV2(scenario, 1, 0);
        const view = buildPlayViewV2(play, scenario);

        expect(play.state).toBe('PLAYING');
        expect(play.version).toBe(0);
        expect(play.storyTimeMinutes).toBe(0);
        expect(view.currentSceneId).toBe(scenario.initialSceneId);

        expect(view.actions.some(action => action.available))
            .toBe(true);

        expect(scenario.scenes).toHaveLength(20);
        expect(scenario.endings).toHaveLength(9);
    });

    test('실제 엔진에서 행동 전이와 엔딩 도달성을 탐색한다', async () => {
        const scenario = await loadScenarioV2('office_fire_01');

        const MAX_DEPTH = 40;
        const MAX_MINUTES = 60;
        const MAX_STATES = 50_000;

        type Play = ReturnType<typeof createInitialPlayDataV2>;

        type SearchNode = {
            play: Play;
            path: string[];
        };

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
            { play: initial, path: [] },
        ];

        const visited = new Set<string>([stateKey(initial)]);
        const foundEndings = new Map<string, string[]>();
        const foundActions = new Set<string>();
        const foundScenes = new Set<string>();

        let transitions = 0;
        let limitReached = false;

        for (let cursor = 0; cursor < queue.length; cursor++) {
            const { play, path } = queue[cursor]!;

            const context =
                `장면: ${play.currentStageId}\n` +
                `시간: ${play.storyTimeMinutes}\n` +
                `경로: ${path.join(' → ')}`;

            let view: ReturnType<typeof buildPlayViewV2>;

            try {
                view = buildPlayViewV2(play, scenario);
            } catch (error) {
                throw new Error(
                    `장면 구성 실패\n${context}\n` +
                    `원인: ${String(error)}`,
                );
            }

            foundScenes.add(play.currentStageId);

            if (play.state !== 'PLAYING') {
                expect(view.actions).toEqual([]);
                expect(view.ending?.id).toBe(play.endingId);

                if (play.endingId && !foundEndings.has(play.endingId)) {
                    foundEndings.set(play.endingId, path);
                }

                continue;
            }

            const availableActions = view.actions.filter(
                action => action.available,
            );

            if (availableActions.length === 0) {
                throw new Error(`진행 불능 발견\n${context}`);
            }

            if (
                path.length >= MAX_DEPTH ||
                play.storyTimeMinutes >= MAX_MINUTES
            ) {
                limitReached = true;
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
                        `행동 실행 실패\n${context}\n` +
                        `행동: ${action.id}\n` +
                        `원인: ${String(error)}`,
                    );
                }

                transitions++;

                foundActions.add(
                    `${play.currentStageId}/${action.id}`,
                );

                expect(nextPlay.version).toBe(play.version + 1);

                expect(nextPlay.storyTimeMinutes)
                    .toBeGreaterThanOrEqual(play.storyTimeMinutes);

                const key = stateKey(nextPlay);

                if (visited.has(key)) {
                    continue;
                }

                if (visited.size >= MAX_STATES) {
                    limitReached = true;
                    continue;
                }

                visited.add(key);

                queue.push({
                    play: nextPlay,
                    path: nextPath,
                });
            }
        }

        const expectedEndings = scenario.endings
            .map(ending => ending.id)
            .sort();

        const expectedActions = scenario.scenes
            .flatMap(scene =>
                scene.actions.map(
                    action => `${scene.id}/${action.id}`,
                ),
            )
            .sort();

        const missingEndings = expectedEndings.filter(
            id => !foundEndings.has(id),
        );

        const missingActions = expectedActions.filter(
            id => !foundActions.has(id),
        );

        console.info({
            exploredStates: visited.size,
            transitions,
            reachedScenes: foundScenes.size,
            reachedActions: foundActions.size,
            reachedEndings: foundEndings.size,
            missingEndings,
            missingActions,
            limitReached,
        });

        for (const [endingId, path] of foundEndings) {
            console.info(
                `[${endingId}] ${path.join(' → ')}`,
            );
        }

        expect(missingEndings).toEqual([]);
        expect(missingActions).toEqual([]);
    }, 120_000);
});
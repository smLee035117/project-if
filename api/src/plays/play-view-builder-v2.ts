
import type { PlayDataV2 } from './types/play-v2.js';
import type { ScenarioV2 } from './types/scenario-v2.js';
import type {
    PlayViewV2,
    PlayActionViewV2,
} from './types/play-view-v2.js';

import { evaluateConditions } from './state-engine-v2.js';

export function buildPlayViewV2(
    playData: PlayDataV2,
    scenario: ScenarioV2,
): PlayViewV2 {
    // 플레이와 시나리오의 일치 여부 확인
    if (
        playData.scenarioId !== scenario.scenarioId ||
        playData.scenarioVersion !== scenario.version
    ) {
        throw new Error('시나리오 정보가 일치하지 않습니다.');
    }

    // 현재 장면 조회
    const scene = scenario.scenes.find(
        (item) => item.id === playData.currentStageId,
    );

    if (!scene) {
        throw new Error('현재 장면을 찾을 수 없습니다.');
    }

    // 현재 플레이 중일 때만 행동 제공
    const actions: PlayActionViewV2[] =
        playData.state === 'PLAYING'
            ? scene.actions.map((action) => {
                  // 숨겨진 world 상태를 행동 가능 여부로 노출하지 않음
                  if (
                      action.when.some((condition) =>
                          condition.path.startsWith('world.'),
                      )
                  ) {
                      throw new Error(
                          '행동 실행 조건에 비공개 world 상태를 사용할 수 없습니다.',
                      );
                  }

                  return {
                      id: action.id,
                      text: action.text,
                      available: evaluateConditions(
                          playData.scenarioState,
                          action.when,
                      ),
                  };
              })
            : [];

    // 종료된 경우에만 엔딩 제공
    let ending: PlayViewV2['ending'];

    if (
        playData.state === 'CLEARED' ||
        playData.state === 'FAILED'
    ) {
        const found = scenario.endings.find(
            (item) => item.id === playData.endingId,
        );

        if (!found) {
            throw new Error('엔딩 정보를 찾을 수 없습니다.');
        }

        ending = {
            id: found.id,
            title: found.title,
            description: found.description,
        };
    }

    return {
        scenarioId: scenario.scenarioId,
        scenarioTitle: scenario.title,
        state: playData.state,
        version: playData.version,
        currentSceneId: scene.id,
        sceneDescription: scene.description,
        storyTimeMinutes: playData.storyTimeMinutes,
        knownFacts: [...playData.scenarioState.knowledge.knownFacts],
        actions,
        ...(ending ? { ending } : {}),
    };
}

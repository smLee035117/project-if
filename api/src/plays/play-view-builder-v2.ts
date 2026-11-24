
import type { PlayDataV2 , ScenarioState} from './types/play-v2.js';
import type { ScenarioV2 , SceneV2 ,    ActionEvaluationContextV2,} from './types/scenario-v2.js';
import type {
    PlayViewV2,
    PlayActionViewV2,
} from './types/play-view-v2.js';

import { evaluateConditions,
    assertActionConditionVisibleV2, } from './state-engine-v2.js';

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

    const startContext: ActionEvaluationContextV2 = {
        startState: playData.scenarioState,
        endState: playData.scenarioState,
        startMinute: playData.storyTimeMinutes,
        endMinute: playData.storyTimeMinutes,
    };

    // 현재 플레이 중일 때만 행동 제공
    const actions: PlayActionViewV2[] =
        playData.state === 'PLAYING'
            ? scene.actions.map((action) => {
                for (const condition of action.when) {
                    assertActionConditionVisibleV2(condition);
                }

                return {
                    id: action.id,
                    text: action.text,
                    available: evaluateConditions(
                        playData.scenarioState,
                        action.when,
                        startContext,
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
        sceneDescription: resolveSceneDescription(
            scene,
            playData.scenarioState,
            ),
        storyTimeMinutes: playData.storyTimeMinutes,
        knownFacts: [...playData.scenarioState.knowledge.knownFacts],
        actions,
        ...(ending
            ? {
                ending,
                actionHistory: (playData.actionHistory ?? []).map(
                    (entry) => ({ ...entry }),
                ),
              }
            : {}),
    };
}


function resolveSceneDescription(
  scene: SceneV2,
  state: ScenarioState,
): string {
  // 1. narratives가 있다면 when 조건에 맞는 서술 검색
  // 2. 일치하는 서술은 정확히 하나여야 함
  // 3. narratives가 없다면 기존 description 사용
  // 4. 유효한 서술이 없으면 오류 발생

  if (typeof scene.narratives === 'undefined') {
         if (typeof scene.description === 'undefined') {
            throw new Error('유효한 서술이 존재하지 않습니다.');
        }

        return scene.description;
    }

    const result: string[] = [];
  for(const narrative of scene.narratives) {
    if(evaluateConditions(state, narrative.when)) {
        result.push(narrative.text);
    }

  }

  const description = result[0];

  if(result.length !== 1 || description === undefined) {
    throw new Error(`장면 ${scene.id}: 일치하는 서술 ${result.length}개`);
  } else {
    return result[0];
  }




}
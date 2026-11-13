import type { PlayDataV2 } from './types/play-v2.js';
import type { ScenarioV2 } from './types/scenario-v2.js';
import { createInitialPlayData } from './play-engine.js';

export function createInitialPlayDataV2(
  scenario: ScenarioV2,
  userId: number,
  userType: number,
): PlayDataV2 {

    const playData = createInitialPlayData(scenario.scenarioId,userId,userType);
    const playData2:PlayDataV2 = {
        ...playData,
        currentStageId : scenario.initialSceneId,
        scenarioVersion : scenario.version,
        version : 0,
        storyTimeMinutes : 0,
        scenarioState: structuredClone(scenario.initialState)
    }

    

    return playData2;

}
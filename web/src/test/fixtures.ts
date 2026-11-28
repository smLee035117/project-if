
import type {
    PlayViewV2,
    PlayResponse,
} from '../types/play'

export const SCENARIO_ID = 'office_fire_01'
export const PLAY_ID = 'test-play-id'

export function makeView(
    overrides: Partial<PlayViewV2> = {},
): PlayViewV2 {
    return {
        scenarioId: SCENARIO_ID,
        scenarioTitle: '퇴근하겠습니다',
        state: 'PLAYING',
        version: 0,
        currentSceneId: 'OFFICE_START',
        sceneDescription: '초기 사무실 장면',
        storyTimeMinutes: 0,
        knownFacts: [],
        actions: [
            {
                id: 'LEAVE_NOW',
                text: '바로 퇴근한다',
                available: true,
            },
        ],
        ...overrides,
    }
}

export function makePlay(
    overrides: Partial<PlayViewV2> = {},
): PlayResponse {
    return {
        playId: PLAY_ID,
        view: makeView(overrides),
    }
}

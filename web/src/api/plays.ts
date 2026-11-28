
import { request } from './http'

import type {
    ScenarioSummary,
    PlayResponse,
    ActivePlayResponse,
    PlayViewV2,
    ActionResponse,
} from '../types/play'

export function getScenarios(): Promise<ScenarioSummary[]> {
    return request<ScenarioSummary[]>('/v2/scenarios')
}

export function startPlay(
    scenarioId: string,
): Promise<PlayResponse> {
    return request<PlayResponse>('/v2/plays', {
        method: 'POST',
        body: JSON.stringify({ scenarioId }),
    })
}

export function getActivePlay(
    scenarioId: string,
): Promise<ActivePlayResponse> {
    return request<ActivePlayResponse>(
        `/v2/plays/active/${encodeURIComponent(scenarioId)}`,
    )
}

export function getPlay(
    playId: string,
): Promise<PlayViewV2> {
    return request<PlayViewV2>(
        `/v2/plays/${encodeURIComponent(playId)}`,
    )
}

export function submitAction(
    playId: string,
    actionId: string,
    expectedVersion: number,
): Promise<ActionResponse> {
    return request<ActionResponse>(
        `/v2/plays/${encodeURIComponent(playId)}/actions`,
        {
            method: 'POST',
            body: JSON.stringify({
                actionId,
                expectedVersion,
            }),
        },
    )
}

export function giveUpPlay(
    playId: string,
    expectedVersion: number,
): Promise<PlayViewV2> {
    return request<PlayViewV2>(
        `/v2/plays/${encodeURIComponent(playId)}/give-up`,
        {
            method: 'POST',
            body: JSON.stringify({ expectedVersion }),
        },
    )
}

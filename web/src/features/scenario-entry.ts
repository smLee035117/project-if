
import { ApiError } from '../api/http'
import {
    getActivePlay,
    startPlay,
    giveUpPlay,
} from '../api/plays'
import type { PlayResponse } from '../types/play'

export async function findActivePlay(
    scenarioId: string,
): Promise<PlayResponse | null> {
    try {
        const response = await getActivePlay(scenarioId)
        return response.activePlay
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            return null
        }

        throw error
    }
}

export type StartResult =
    | { kind: 'started'; play: PlayResponse }
    | { kind: 'existing'; play: PlayResponse }

export async function createPlay(
    scenarioId: string,
): Promise<StartResult> {
    try {
        const play = await startPlay(scenarioId)
        return { kind: 'started', play }
    } catch (error) {
        const uncertain =
            !(error instanceof ApiError) ||
            error.status >= 500

        if (
            uncertain ||
            (error instanceof ApiError && error.status === 409)
        ) {
            const active = await findActivePlay(scenarioId)

            if (active) {
                return { kind: 'existing', play: active }
            }
        }

        throw error
    }
}

export async function restartPlay(
    play: PlayResponse,
): Promise<StartResult> {
    const view = await giveUpPlay(
        play.playId,
        play.view.version,
    )

    if (view.state !== 'GIVEN_UP') {
        throw new Error('기존 플레이를 종료하지 못했습니다.')
    }

    return createPlay(play.view.scenarioId)
}

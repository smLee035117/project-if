
import { ApiError } from '../api/http'
import {
    getPlay,
    submitAction,
    giveUpPlay,
} from '../api/plays'
import type { PlayViewV2 } from '../types/play'

export interface PlayUpdate {
    view: PlayViewV2
    resultText: string | null
    notice: string | null
}

async function recoverPlay(
    playId: string,
    expectedVersion: number,
    error: unknown,
): Promise<PlayUpdate> {
    if (
        error instanceof ApiError &&
        error.status < 500 &&
        error.status !== 409
    ) {
        throw error
    }

    const view = await getPlay(playId)

    const changed =
        view.version !== expectedVersion ||
        view.state !== 'PLAYING'

    return {
        view,
        resultText: null,
        notice: changed
            ? '서버의 최신 진행 상태를 불러왔습니다.'
            : '현재 상태를 확인했습니다. 행동을 다시 선택해 주세요.',
    }
}

export async function executeAction(
    playId: string,
    actionId: string,
    expectedVersion: number,
): Promise<PlayUpdate> {
    try {
        const response = await submitAction(
            playId,
            actionId,
            expectedVersion,
        )

        return {
            view: response.view,
            resultText: response.resultText,
            notice: null,
        }
    } catch (error) {
        return recoverPlay(
            playId,
            expectedVersion,
            error,
        )
    }
}

export async function abandonPlay(
    playId: string,
    expectedVersion: number,
): Promise<PlayUpdate> {
    try {
        const view = await giveUpPlay(
            playId,
            expectedVersion,
        )

        return {
            view,
            resultText: null,
            notice: null,
        }
    } catch (error) {
        return recoverPlay(
            playId,
            expectedVersion,
            error,
        )
    }
}


import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

import {
    getPlay,
    submitAction,
    giveUpPlay,
} from '../api/plays'

import { ApiError } from '../api/http'

import {
    executeAction,
    abandonPlay,
} from './play-session'

import {
    makeView,
    PLAY_ID,
} from '../test/fixtures'

vi.mock('../api/plays', () => ({
    getPlay: vi.fn(),
    submitAction: vi.fn(),
    giveUpPlay: vi.fn(),
}))

describe('play-session', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('행동 성공 시 새로운 상태와 결과를 반환한다', async () => {
        const view = makeView({
            version: 1,
            storyTimeMinutes: 1,
        })

        vi.mocked(submitAction).mockResolvedValue({
            view,
            resultText: '복도로 이동했다.',
        })

        const result = await executeAction(
            PLAY_ID,
            'LEAVE_NOW',
            0,
        )

        expect(submitAction).toHaveBeenCalledWith(
            PLAY_ID,
            'LEAVE_NOW',
            0,
        )

        expect(result.view).toEqual(view)
        expect(result.resultText).toBe('복도로 이동했다.')
        expect(result.notice).toBeNull()
        expect(getPlay).not.toHaveBeenCalled()
    })

    it('409 충돌 시 최신 상태를 조회하고 행동을 재전송하지 않는다', async () => {
        const latest = makeView({
            version: 1,
            currentSceneId: 'HALL6',
        })

        vi.mocked(submitAction).mockRejectedValue(
            new ApiError(409, null),
        )

        vi.mocked(getPlay).mockResolvedValue(latest)

        const result = await executeAction(
            PLAY_ID,
            'LEAVE_NOW',
            0,
        )

        expect(getPlay).toHaveBeenCalledWith(PLAY_ID)
        expect(submitAction).toHaveBeenCalledTimes(1)
        expect(result.view).toEqual(latest)
        expect(result.resultText).toBeNull()
        expect(result.notice).not.toBeNull()
    })

    it('응답 유실 이후 이미 반영된 상태를 복원한다', async () => {
        const latest = makeView({ version: 1 })

        vi.mocked(submitAction).mockRejectedValue(
            new TypeError('Network error'),
        )

        vi.mocked(getPlay).mockResolvedValue(latest)

        const result = await executeAction(
            PLAY_ID,
            'LEAVE_NOW',
            0,
        )

        expect(result.view.version).toBe(1)
        expect(submitAction).toHaveBeenCalledTimes(1)
        expect(result.resultText).toBeNull()
    })

    it('500 응답 이후 종료 상태를 복원한다', async () => {
        const latest = makeView({
            version: 1,
            state: 'CLEARED',
            actions: [],
        })

        vi.mocked(submitAction).mockRejectedValue(
            new ApiError(500, null),
        )

        vi.mocked(getPlay).mockResolvedValue(latest)

        const result = await executeAction(
            PLAY_ID,
            'LEAVE_NOW',
            0,
        )

        expect(result.view.state).toBe('CLEARED')
        expect(submitAction).toHaveBeenCalledTimes(1)
    })

    it('서버 상태가 변경되지 않았다면 재선택을 안내한다', async () => {
        vi.mocked(submitAction).mockRejectedValue(
            new TypeError('Network error'),
        )

        vi.mocked(getPlay).mockResolvedValue(
            makeView({ version: 0 }),
        )

        const result = await executeAction(
            PLAY_ID,
            'LEAVE_NOW',
            0,
        )

        expect(result.view.version).toBe(0)
        expect(result.notice).toContain('다시 선택')
        expect(submitAction).toHaveBeenCalledTimes(1)
    })

    it.each([400, 401, 404])(
        '%i 응답은 자동 복구하지 않고 호출자에게 전달한다',
        async (status) => {
            const error = new ApiError(status, null)

            vi.mocked(submitAction).mockRejectedValue(error)

            await expect(
                executeAction(PLAY_ID, 'LEAVE_NOW', 0),
            ).rejects.toBe(error)

            expect(getPlay).not.toHaveBeenCalled()
        },
    )

    it('상태 재조회까지 실패하면 오류를 전달한다', async () => {
        const error = new TypeError('Server unavailable')

        vi.mocked(submitAction).mockRejectedValue(error)
        vi.mocked(getPlay).mockRejectedValue(error)

        await expect(
            executeAction(PLAY_ID, 'LEAVE_NOW', 0),
        ).rejects.toBe(error)

        expect(submitAction).toHaveBeenCalledTimes(1)
        expect(getPlay).toHaveBeenCalledTimes(1)
    })

    it('플레이 포기 시 종료 상태를 반환한다', async () => {
        const view = makeView({
            state: 'GIVEN_UP',
            version: 1,
            actions: [],
        })

        vi.mocked(giveUpPlay).mockResolvedValue(view)

        const result = await abandonPlay(PLAY_ID, 0)

        expect(giveUpPlay).toHaveBeenCalledWith(PLAY_ID, 0)
        expect(result.view.state).toBe('GIVEN_UP')
        expect(result.resultText).toBeNull()
        expect(result.notice).toBeNull()
    })

    it('포기 요청 충돌 시 최신 종료 상태를 복원한다', async () => {
        vi.mocked(giveUpPlay).mockRejectedValue(
            new ApiError(409, null),
        )

        vi.mocked(getPlay).mockResolvedValue(
            makeView({
                state: 'GIVEN_UP',
                version: 1,
                actions: [],
            }),
        )

        const result = await abandonPlay(PLAY_ID, 0)

        expect(result.view.state).toBe('GIVEN_UP')
        expect(giveUpPlay).toHaveBeenCalledTimes(1)
        expect(getPlay).toHaveBeenCalledTimes(1)
    })
})

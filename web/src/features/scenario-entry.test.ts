
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

import { ApiError } from '../api/http'
import {
    getActivePlay,
    startPlay,
    giveUpPlay,
} from '../api/plays'

import {
    findActivePlay,
    createPlay,
    restartPlay,
} from './scenario-entry'

import {
    makePlay,
    makeView,
    SCENARIO_ID,
    PLAY_ID,
} from '../test/fixtures'

vi.mock('../api/plays', () => ({
    getActivePlay: vi.fn(),
    startPlay: vi.fn(),
    giveUpPlay: vi.fn(),
}))

describe('scenario-entry', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('기존 활성 플레이를 반환한다', async () => {
        const play = makePlay()

        vi.mocked(getActivePlay).mockResolvedValue({
            activePlay: play,
        })

        expect(
            await findActivePlay(SCENARIO_ID),
        ).toEqual(play)

        expect(getActivePlay).toHaveBeenCalledWith(
            SCENARIO_ID,
        )
    })

    it('활성 플레이가 없으면 null을 반환한다', async () => {
        vi.mocked(getActivePlay).mockResolvedValue({
            activePlay: null,
        })

        expect(
            await findActivePlay(SCENARIO_ID),
        ).toBeNull()
    })

    it('첫 방문의 401 응답은 활성 플레이 없음으로 처리한다', async () => {
        vi.mocked(getActivePlay).mockRejectedValue(
            new ApiError(401, null),
        )

        expect(
            await findActivePlay(SCENARIO_ID),
        ).toBeNull()
    })

    it('활성 플레이 조회 중 서버 오류는 호출자에게 전달한다', async () => {
        const error = new ApiError(500, null)

        vi.mocked(getActivePlay).mockRejectedValue(error)

        await expect(
            findActivePlay(SCENARIO_ID),
        ).rejects.toBe(error)
    })

    it('신규 플레이 생성에 성공한다', async () => {
        const play = makePlay()

        vi.mocked(startPlay).mockResolvedValue(play)

        expect(
            await createPlay(SCENARIO_ID),
        ).toEqual({
            kind: 'started',
            play,
        })

        expect(startPlay).toHaveBeenCalledWith(
            SCENARIO_ID,
        )

        expect(getActivePlay).not.toHaveBeenCalled()
    })

    it('중복 생성 충돌 시 기존 활성 플레이를 반환한다', async () => {
        const play = makePlay({ version: 3 })

        vi.mocked(startPlay).mockRejectedValue(
            new ApiError(409, null),
        )

        vi.mocked(getActivePlay).mockResolvedValue({
            activePlay: play,
        })

        expect(
            await createPlay(SCENARIO_ID),
        ).toEqual({
            kind: 'existing',
            play,
        })

        expect(startPlay).toHaveBeenCalledTimes(1)

        expect(getActivePlay).toHaveBeenCalledWith(
            SCENARIO_ID,
        )
    })

    it.each([
        new TypeError('Network error'),
        new ApiError(500, null),
    ])('생성 결과가 불명확하면 활성 플레이를 조회한다', async (error) => {
        const play = makePlay()

        vi.mocked(startPlay).mockRejectedValue(error)

        vi.mocked(getActivePlay).mockResolvedValue({
            activePlay: play,
        })

        expect(
            await createPlay(SCENARIO_ID),
        ).toEqual({
            kind: 'existing',
            play,
        })

        expect(startPlay).toHaveBeenCalledTimes(1)
    })

    it('충돌 후 활성 플레이가 없더라도 자동 생성하지 않는다', async () => {
        const error = new ApiError(409, null)

        vi.mocked(startPlay).mockRejectedValue(error)

        vi.mocked(getActivePlay).mockResolvedValue({
            activePlay: null,
        })

        await expect(
            createPlay(SCENARIO_ID),
        ).rejects.toBe(error)

        expect(startPlay).toHaveBeenCalledTimes(1)
    })

    it('잘못된 생성 요청은 활성 조회 없이 오류를 전달한다', async () => {
        const error = new ApiError(400, null)

        vi.mocked(startPlay).mockRejectedValue(error)

        await expect(
            createPlay(SCENARIO_ID),
        ).rejects.toBe(error)

        expect(getActivePlay).not.toHaveBeenCalled()
    })

    it('기존 플레이 포기 성공 후 새 플레이를 생성한다', async () => {
        const previous = makePlay({ version: 3 })

        const next = {
            ...makePlay(),
            playId: 'new-play-id',
        }

        vi.mocked(giveUpPlay).mockResolvedValue(
            makeView({
                state: 'GIVEN_UP',
                version: 4,
                actions: [],
            }),
        )

        vi.mocked(startPlay).mockResolvedValue(next)

        expect(
            await restartPlay(previous),
        ).toEqual({
            kind: 'started',
            play: next,
        })

        expect(giveUpPlay).toHaveBeenCalledWith(
            PLAY_ID,
            3,
        )

        expect(startPlay).toHaveBeenCalledWith(
            SCENARIO_ID,
        )

        expect(giveUpPlay).toHaveBeenCalledBefore(
            vi.mocked(startPlay),
        )
    })

    it('기존 플레이 포기에 실패하면 새 플레이를 생성하지 않는다', async () => {
        const error = new ApiError(409, null)

        vi.mocked(giveUpPlay).mockRejectedValue(error)

        await expect(
            restartPlay(makePlay()),
        ).rejects.toBe(error)

        expect(startPlay).not.toHaveBeenCalled()
    })

    it('포기 응답이 GIVEN_UP이 아니면 새 플레이를 생성하지 않는다', async () => {
        vi.mocked(giveUpPlay).mockResolvedValue(
            makeView({ state: 'PLAYING' }),
        )

        await expect(
            restartPlay(makePlay()),
        ).rejects.toThrow(
            '기존 플레이를 종료하지 못했습니다.',
        )

        expect(startPlay).not.toHaveBeenCalled()
    })
})

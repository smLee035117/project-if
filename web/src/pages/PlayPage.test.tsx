
/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import userEvent from '@testing-library/user-event'

import {
  MemoryRouter,
  Routes,
  Route,
} from 'react-router-dom'

import PlayPage from './PlayPage'
import { getPlay } from '../api/plays'
import { ApiError } from '../api/http'

import {
  executeAction,
  abandonPlay,
} from '../features/play-session'

import type { PlayUpdate } from '../features/play-session'

import {
  makeView,
  PLAY_ID,
} from '../test/fixtures'

vi.mock('../api/plays', () => ({
  getPlay: vi.fn(),
}))

vi.mock('../features/play-session', () => ({
  executeAction: vi.fn(),
  abandonPlay: vi.fn(),
}))

function renderPlayPage() {
  return render(
    <MemoryRouter initialEntries={[`/plays/${PLAY_ID}`]}>
      <Routes>
        <Route
          path="/plays/:playId"
          element={<PlayPage />}
        />
        <Route path="/" element={<p>시나리오 목록</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('플레이 조회 중 로딩 화면을 표시한다', async () => {
    let resolveView!: (value: ReturnType<typeof makeView>) => void

    vi.mocked(getPlay).mockReturnValue(
      new Promise((resolve) => {
        resolveView = resolve
      }),
    )

    renderPlayPage()

    expect(
      screen.getByText('플레이를 불러오는 중입니다.'),
    ).toBeInTheDocument()

    await act(async () => {
      resolveView(makeView())
    })

    expect(
      screen.getByText('초기 사무실 장면'),
    ).toBeInTheDocument()
  })

  it('실행 가능한 선택지만 표시한다', async () => {
    vi.mocked(getPlay).mockResolvedValue(
      makeView({
        actions: [
          {
            id: 'AVAILABLE',
            text: '가능한 행동',
            available: true,
          },
          {
            id: 'UNAVAILABLE',
            text: '불가능한 행동',
            available: false,
          },
        ],
      }),
    )

    renderPlayPage()

    expect(
      await screen.findByRole('button', {
        name: '가능한 행동',
      }),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('button', {
        name: '불가능한 행동',
      }),
    ).not.toBeInTheDocument()
  })

  it('행동 실행 후 장면과 버전 및 결과를 갱신한다', async () => {
    const user = userEvent.setup()

    vi.mocked(getPlay).mockResolvedValue(
      makeView(),
    )

    vi.mocked(executeAction).mockResolvedValue({
      view: makeView({
        version: 1,
        storyTimeMinutes: 1,
        sceneDescription: '6층 복도에 도착했다.',
      }),
      resultText: '사무실에서 나왔다.',
      notice: null,
    })

    renderPlayPage()

    await user.click(
      await screen.findByRole('button', {
        name: '바로 퇴근한다',
      }),
    )

    expect(executeAction).toHaveBeenCalledWith(
      PLAY_ID,
      'LEAVE_NOW',
      0,
    )

    expect(
      await screen.findByText('6층 복도에 도착했다.'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('사무실에서 나왔다.'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('버전: 1'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('경과 시간: 1분'),
    ).toBeInTheDocument()
  })

  it('요청 처리 중 연속 클릭과 다른 행동 실행을 차단한다', async () => {
    vi.mocked(getPlay).mockResolvedValue(
      makeView({
        actions: [
          {
            id: 'ACTION_A',
            text: '행동 A',
            available: true,
          },
          {
            id: 'ACTION_B',
            text: '행동 B',
            available: true,
          },
        ],
      }),
    )

    let resolveUpdate!: (value: PlayUpdate) => void

    vi.mocked(executeAction).mockReturnValue(
      new Promise<PlayUpdate>((resolve) => {
        resolveUpdate = resolve
      }),
    )

    renderPlayPage()

    const first = await screen.findByRole('button', {
      name: '행동 A',
    })

    const second = screen.getByRole('button', {
      name: '행동 B',
    })

    act(() => {
      fireEvent.click(first)
      fireEvent.click(first)
      fireEvent.click(second)
    })

    expect(executeAction).toHaveBeenCalledTimes(1)

    expect(first).toBeDisabled()
    expect(second).toBeDisabled()

    expect(
      screen.getByText('요청을 처리하는 중입니다.'),
    ).toBeInTheDocument()

    await act(async () => {
      resolveUpdate({
        view: makeView({ version: 1 }),
        resultText: '행동 완료',
        notice: null,
      })
    })

    expect(
      screen.getByText('버전: 1'),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: '바로 퇴근한다',
      }),
    ).toBeEnabled()

    expect(executeAction).toHaveBeenCalledTimes(1)
  })

  it('엔딩과 행동 이력을 표시한다', async () => {
    vi.mocked(getPlay).mockResolvedValue(
      makeView({
        state: 'CLEARED',
        version: 1,
        actions: [],
        ending: {
          id: 'END_TEST',
          title: '안전한 대피',
          description: '건물 밖으로 대피했다.',
        },
        actionHistory: [
          {
            sequence: 1,
            fromSceneId: 'OFFICE_START',
            toSceneId: 'OUTSIDE',
            actionId: 'LEAVE_NOW',
            actionText: '건물 밖으로 이동한다',
            resultText: '안전하게 도착했다.',
            startedAtMinute: 0,
            endedAtMinute: 1,
          },
        ],
      }),
    )

    renderPlayPage()

    expect(
      await screen.findByText('안전한 대피'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('건물 밖으로 대피했다.'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('건물 밖으로 이동한다'),
    ).toBeInTheDocument()

    expect(
      screen.getByText('안전하게 도착했다.'),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('button', {
        name: '플레이 포기',
      }),
    ).not.toBeInTheDocument()
  })

  it('인증 실패 안내를 표시한다', async () => {
    vi.mocked(getPlay).mockRejectedValue(
      new ApiError(401, null),
    )

    renderPlayPage()

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      '게스트 세션이 없거나 만료되었습니다.',
    )
  })

  it('만료된 플레이의 안내 화면을 표시한다', async () => {
    vi.mocked(getPlay).mockRejectedValue(
      new ApiError(404, null),
    )

    renderPlayPage()

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      '플레이가 존재하지 않거나 만료되었습니다.',
    )
  })

  it('통신 실패 이후 재조회하여 플레이를 복원한다', async () => {
    const user = userEvent.setup()

    vi.mocked(getPlay)
      .mockRejectedValueOnce(
        new TypeError('Network error'),
      )
      .mockResolvedValueOnce(makeView())

    renderPlayPage()

    expect(
      await screen.findByRole('alert'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: '다시 조회',
      }),
    )

    expect(
      await screen.findByText('초기 사무실 장면'),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('alert'),
    ).not.toBeInTheDocument()

    expect(getPlay).toHaveBeenCalledTimes(2)
  })

  it('포기 확인 후 종료 화면으로 전환한다', async () => {
    const user = userEvent.setup()

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    vi.mocked(getPlay).mockResolvedValue(makeView())

    vi.mocked(abandonPlay).mockResolvedValue({
      view: makeView({
        state: 'GIVEN_UP',
        version: 1,
        actions: [],
      }),
      resultText: null,
      notice: null,
    })

    renderPlayPage()

    await user.click(
      await screen.findByRole('button', {
        name: '플레이 포기',
      }),
    )

    expect(abandonPlay).toHaveBeenCalledWith(
      PLAY_ID,
      0,
    )

    expect(
      await screen.findByText('플레이를 포기했습니다.'),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('button', {
        name: '바로 퇴근한다',
      }),
    ).not.toBeInTheDocument()
  })

  it('포기를 취소하면 서버에 요청하지 않는다', async () => {
    const user = userEvent.setup()

    vi.spyOn(window, 'confirm').mockReturnValue(false)

    vi.mocked(getPlay).mockResolvedValue(makeView())

    renderPlayPage()

    await user.click(
      await screen.findByRole('button', {
        name: '플레이 포기',
      }),
    )

    expect(abandonPlay).not.toHaveBeenCalled()

    expect(
      screen.getByRole('button', {
        name: '바로 퇴근한다',
      }),
    ).toBeEnabled()
  })
})


import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPlay } from '../api/plays'
import { ApiError } from '../api/http'
import {
  executeAction,
  abandonPlay,
} from '../features/play-session'
import type { PlayUpdate } from '../features/play-session'
import type { PlayViewV2 } from '../types/play'
import EndingView from '../components/EndingView'

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return '유효하지 않은 요청입니다.'
      case 401:
        return '게스트 세션이 없거나 만료되었습니다.'
      case 404:
        return '플레이가 존재하지 않거나 만료되었습니다.'
    }
  }

  return '서버와 통신하지 못했습니다. 현재 상태를 다시 확인해 주세요.'
}

export default function PlayPage() {
  const { playId } = useParams<{ playId: string }>()

  if (!playId) {
    return <p>잘못된 플레이 주소입니다.</p>
  }

  return (
    <PlaySession
      key={playId}
      playId={playId}
    />
  )
}

function PlaySession({ playId }: { playId: string }) {
  const [view, setView] = useState<PlayViewV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resultText, setResultText] = useState<string | null>(null)

  const requestLock = useRef(false)

  useEffect(() => {
    let cancelled = false

    getPlay(playId)
      .then((data) => {
        if (!cancelled) {
          setView(data)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(getErrorMessage(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [playId])

  async function runUpdate(
    task: () => Promise<PlayUpdate>,
  ) {
    if (requestLock.current) return

    requestLock.current = true
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const update = await task()

      setView(update.view)
      setResultText(update.resultText)
      setNotice(update.notice)
    } catch (error) {
      setError(getErrorMessage(error))
      setResultText(null)
    } finally {
      requestLock.current = false
      setBusy(false)
    }
  }

  function handleAction(actionId: string) {
    if (
      !view ||
      view.state !== 'PLAYING' ||
      requestLock.current ||
      error
    ) {
      return
    }

    void runUpdate(() =>
      executeAction(
        playId,
        actionId,
        view.version,
      ),
    )
  }

  function handleGiveUp() {
    if (
      !view ||
      view.state !== 'PLAYING' ||
      requestLock.current ||
      error
    ) {
      return
    }

    const confirmed = window.confirm(
      '현재 플레이를 포기하시겠습니까?',
    )

    if (!confirmed) return

    void runUpdate(() =>
      abandonPlay(playId, view.version),
    )
  }

  async function refreshPlay() {
    if (requestLock.current) return

    requestLock.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    setResultText(null)

    try {
      const latest = await getPlay(playId)
      setView(latest)
      setNotice('현재 진행 상태를 확인했습니다.')
    } catch (error) {
      setError(getErrorMessage(error))
    } finally {
      requestLock.current = false
      setBusy(false)
    }
  }

  if (loading) {
    return <p>플레이를 불러오는 중입니다.</p>
  }

  if (!view) {
    return (
      <main>
        <p role="alert">
          {error ?? '플레이 정보가 없습니다.'}
        </p>

        <button
          disabled={busy}
          onClick={() => void refreshPlay()}
        >
          다시 조회
        </button>

        <p>
          <Link to="/">시나리오 목록으로 돌아가기</Link>
        </p>
      </main>
    )
  }

  return (
    <main>
      <h1>{view.scenarioTitle}</h1>

      <p>상태: {view.state}</p>
      <p>버전: {view.version}</p>
      <p>경과 시간: {view.storyTimeMinutes}분</p>

      <hr />

      {resultText && (
        <section aria-live="polite">
          <h2>행동 결과</h2>
          <p>{resultText}</p>
        </section>
      )}

      {notice && (
        <p role="status">{notice}</p>
      )}

      {error && (
        <section>
          <p role="alert">{error}</p>

          <button
            disabled={busy}
            onClick={() => void refreshPlay()}
          >
            현재 상태 다시 조회
          </button>
        </section>
      )}

      {view.state === 'PLAYING' ? (
        <>
          <section>
            <h2>현재 상황</h2>
            <p>{view.sceneDescription}</p>
          </section>

          <section>
            <h2>선택지</h2>

            {view.actions
              .filter((action) => action.available)
              .map((action) => (
                <p key={action.id}>
                  <button
                    disabled={busy || Boolean(error)}
                    onClick={() => handleAction(action.id)}
                  >
                    {action.text}
                  </button>
                </p>
              ))}
          </section>

          {busy && <p>요청을 처리하는 중입니다.</p>}

          <hr />

          <button
            disabled={busy || Boolean(error)}
            onClick={handleGiveUp}
          >
            플레이 포기
          </button>

          <p>
            <Link to="/">시나리오 목록으로 돌아가기</Link>
          </p>
        </>
      ) : (
        <EndingView view={view} />
      )}
    </main>
  )
}


import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPlay } from '../api/plays'
import { ApiError } from '../api/http'
import type { PlayViewV2 } from '../types/play'

export default function PlayPage() {
  const { playId } = useParams<{ playId: string }>()

  const [view, setView] = useState<PlayViewV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!playId) return

    let cancelled = false

    getPlay(playId)
      .then((data) => {
        if (!cancelled) {
          setView(data)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return

        if (error instanceof ApiError) {
          if (error.status === 401) {
            setError('게스트 세션이 없거나 만료되었습니다.')
            return
          }

          if (error.status === 404) {
            setError('플레이가 존재하지 않거나 만료되었습니다.')
            return
          }
        }

        setError('플레이 정보를 불러오지 못했습니다.')
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

  if (!playId) {
    return <p>잘못된 플레이 주소입니다.</p>
  }

  if (loading) {
    return <p>플레이를 불러오는 중입니다.</p>
  }

  if (error || !view) {
    return (
      <main>
        <p role="alert">{error ?? '플레이 정보가 없습니다.'}</p>
        <Link to="/">시나리오 목록으로 돌아가기</Link>
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

      <p>{view.sceneDescription}</p>

      <h2>선택지</h2>

      {view.actions
        .filter((action) => action.available)
        .map((action) => (
          <p key={action.id}>{action.text}</p>
        ))}

      <hr />

      <Link to="/">시나리오 목록으로 돌아가기</Link>
    </main>
  )
}

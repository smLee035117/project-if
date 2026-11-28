
import { Link } from 'react-router-dom'
import type { PlayViewV2 } from '../types/play'

interface EndingViewProps {
  view: PlayViewV2
}

export default function EndingView({
  view,
}: EndingViewProps) {
  if (view.state === 'PLAYING') {
    return null
  }

  if (view.state === 'GIVEN_UP') {
    return (
      <section>
        <h2>플레이를 포기했습니다.</h2>
        <Link to="/">시나리오 목록으로 돌아가기</Link>
      </section>
    )
  }

  return (
    <section>
      <h2>
        {view.ending?.title ?? '플레이 종료'}
      </h2>

      <p>
        {view.state === 'CLEARED'
          ? '생존'
          : '실패'}
      </p>

      <p>{view.ending?.description}</p>

      <h3>플레이 기록</h3>

      <p>
        총 경과 시간: {view.storyTimeMinutes}분
      </p>

      <ol>
        {(view.actionHistory ?? []).map((entry) => (
          <li key={entry.sequence}>
            <p>
              <strong>{entry.actionText}</strong>
            </p>

            <p>
              {entry.startedAtMinute}분
              {' → '}
              {entry.endedAtMinute}분
            </p>

            <p>{entry.resultText}</p>
          </li>
        ))}
      </ol>

      <Link to="/">시나리오 목록으로 돌아가기</Link>
    </section>
  )
}

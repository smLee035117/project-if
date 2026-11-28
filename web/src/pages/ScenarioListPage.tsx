
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getScenarios } from '../api/plays'
import {
  findActivePlay,
  createPlay,
  restartPlay,
} from '../features/scenario-entry'
import type {
  ScenarioSummary,
  PlayResponse,
} from '../types/play'

export default function ScenarioListPage() {
  const navigate = useNavigate()

  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [selected, setSelected] = useState<ScenarioSummary | null>(null)
  const [activePlay, setActivePlay] = useState<PlayResponse | null>(null)

  const requestLock = useRef(false)

  useEffect(() => {
    let cancelled = false

    getScenarios()
      .then((data) => {
        if (!cancelled) {
          setScenarios(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('시나리오 목록을 불러오지 못했습니다.')
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
  }, [])

  async function runRequest(task: () => Promise<void>) {
    if (requestLock.current) return

    requestLock.current = true
    setBusy(true)
    setEntryError(null)

    try {
      await task()
    } catch {
      setSelected(null)
      setActivePlay(null)
      setEntryError(
        '요청을 완료하지 못했습니다. 시나리오를 다시 선택해 현재 상태를 확인해 주세요.',
      )
    } finally {
      requestLock.current = false
      setBusy(false)
    }
  }

  function enterPlay(play: PlayResponse) {
    navigate(`/plays/${encodeURIComponent(play.playId)}`)
  }

  function selectScenario(scenario: ScenarioSummary) {
    void runRequest(async () => {
      setSelected(null)
      setActivePlay(null)

      const active = await findActivePlay(scenario.scenarioId)

      setSelected(scenario)
      setActivePlay(active)
    })
  }

  function handleStart() {
    if (!selected) return

    const scenarioId = selected.scenarioId

    void runRequest(async () => {
      const result = await createPlay(scenarioId)

      if (result.kind === 'existing') {
        setActivePlay(result.play)
        return
      }

      enterPlay(result.play)
    })
  }

  function handleRestart() {
    if (!activePlay || requestLock.current) return

    const confirmed = window.confirm(
      '기존 진행 기록을 포기하고 새로 시작하시겠습니까?',
    )

    if (!confirmed) return

    const previousPlay = activePlay

    void runRequest(async () => {
      const result = await restartPlay(previousPlay)

      if (result.kind === 'existing') {
        setActivePlay(result.play)
        return
      }

      enterPlay(result.play)
    })
  }

  if (loading) {
    return <p>시나리오를 불러오는 중입니다.</p>
  }

  if (error) {
    return <p role="alert">{error}</p>
  }

  return (
    <main>
      <h1>Project IF</h1>
      <h2>시나리오 선택</h2>

      {scenarios.length === 0 && (
        <p>공개된 시나리오가 없습니다.</p>
      )}

      {scenarios.map((scenario) => (
        <article key={scenario.scenarioId}>
          <h3>{scenario.title}</h3>
          <p>Version: {scenario.version}</p>

          <button
            disabled={busy}
            onClick={() => selectScenario(scenario)}
          >
            시나리오 선택
          </button>
        </article>
      ))}

      {selected && (
        <section>
          <h2>{selected.title}</h2>

          {activePlay ? (
            <>
              <p>진행 중인 플레이가 있습니다.</p>

              <button
                disabled={busy}
                onClick={() => enterPlay(activePlay)}
              >
                이어하기
              </button>

              <button
                disabled={busy}
                onClick={handleRestart}
              >
                새로 시작
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={handleStart}
            >
              게임 시작
            </button>
          )}
        </section>
      )}

      {busy && <p>요청을 처리하는 중입니다.</p>}

      {entryError && (
        <p role="alert">{entryError}</p>
      )}
    </main>
  )
}

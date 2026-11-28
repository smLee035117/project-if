
import { useEffect, useState } from 'react'
import { getScenarios } from '../api/plays'
import type { ScenarioSummary } from '../types/play'

export default function ScenarioListPage() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        </article>
      ))}
    </main>
  )
}

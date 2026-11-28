
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ScenarioListPage from './pages/ScenarioListPage'
import PlayPage from './pages/PlayPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScenarioListPage />} />

        <Route
          path="/plays/:playId"
          element={<PlayPage />}
        />
      </Routes>
    </BrowserRouter>
  )
}

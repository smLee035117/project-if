
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ScenarioListPage from './pages/ScenarioListPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScenarioListPage />} />
      </Routes>
    </BrowserRouter>
  )
}

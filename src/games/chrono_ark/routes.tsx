import { Routes, Route, Navigate } from "react-router-dom"
import DashboardPage from "./pages/Dashboard"
import ModDetail from "./pages/Details"
import GlossaryPage from "./pages/Glossary"
import StatisticsPage from "./pages/Statistics"

/**
 * Routes contributed by the Chrono Ark game manifest.
 *
 * Mounted by the App-level router under the active-game subtree. Bare `/`
 * redirects to the dashboard so the game's namespace always has a default
 * landing page when the user switches games.
 *
 * @returns A `Routes` element with all Chrono Ark page routes.
 */
export function ChronoArkRoutes() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/translation/:modId" element={<ModDetail />} />
            <Route path="/glossary" element={<GlossaryPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    )
}

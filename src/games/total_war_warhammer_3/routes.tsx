import { Routes, Route, Navigate } from "react-router-dom"
import DashboardPage from "./pages/Dashboard"
import SupportedModsPage from "./pages/SupportedMods"
import EffectsPage from "./pages/Effects"
import RunnerPage from "./pages/Runner"

/**
 * Routes contributed by the Total War: Warhammer III game manifest.
 *
 * Mounted by the App-level router under the active-game subtree. Bare `/`
 * redirects to `/dashboard` so the game's namespace always has a default
 * landing page when the user switches games.
 *
 * @returns A `Routes` element with all TW3 page routes.
 */
export function TotalWarWarhammer3Routes() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/supported-mods" element={<SupportedModsPage />} />
            <Route path="/effects" element={<EffectsPage />} />
            <Route path="/runner" element={<RunnerPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    )
}

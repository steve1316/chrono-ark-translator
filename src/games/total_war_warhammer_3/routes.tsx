import { Routes, Route, Navigate } from "react-router-dom"
import DashboardPage from "./pages/Dashboard"
import RunnerPage from "./pages/Runner"
import SupportedModFormPage from "./pages/SupportedModForm"
import SupportedModsPage from "./pages/SupportedMods"
import ValidatePage from "./pages/Validate"

/**
 * Routes contributed by the Total War: Warhammer III game manifest.
 *
 * @returns A `Routes` element with all TW3 page routes.
 */
export function TotalWarWarhammer3Routes() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/supported-mods" element={<SupportedModsPage />} />
            <Route path="/supported-mods/new" element={<SupportedModFormPage />} />
            <Route path="/supported-mods/edit/:packageName" element={<SupportedModFormPage />} />
            <Route path="/validate" element={<ValidatePage />} />
            <Route path="/runner" element={<RunnerPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    )
}

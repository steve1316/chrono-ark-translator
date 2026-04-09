import { useState, useEffect } from "react"
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import DashboardPage from "./pages/Dashboard"
import ModDetail from "./pages/Details"
import GlossaryPage from "./pages/Glossary"
import StatisticsPage from "./pages/Statistics"
import SettingsPage from "./pages/Settings"
import type { ModStatus, Stats } from "./shared_types"
import { API_BASE } from "./config"
import "./index.css"

function App() {
    const [mods, setMods] = useState<ModStatus[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState<Stats | null>(null)

    const navigate = useNavigate()
    const location = useLocation()
    // Detail pages use a wider `container-fluid` layout to give the string
    // table more horizontal space, while other pages use the narrower `container`.
    const isDetailPage = location.pathname.startsWith("/mods/")

    /**
     * Fetches the list of all mods from the backend.
     *
     * Hits `GET /api/mods` and expects a JSON array of {@link ModStatus} objects.
     * On failure the error is logged but the UI is not disrupted (mods list
     * simply keeps its previous value).
     */
    const fetchMods = async () => {
        try {
            const res = await fetch(`${API_BASE}/mods`)
            const data = await res.json()
            setMods(data)
        } catch (err) {
            console.error("Failed to fetch mods:", err)
        }
    }

    /**
     * Deep-refreshes all mods by recalculating translation progress from disk.
     *
     * Hits `POST /api/mods/refresh` which re-extracts every mod's localization
     * strings and recomputes translated/total counts from scratch, matching the
     * same progress logic the detail page uses.  This is slower than
     * {@link fetchMods} (which reads cached snapshots) but guarantees accurate
     * counts even for mods whose detail page has never been opened.
     *
     * Called by the Dashboard "Refresh" button.  On failure the error is logged
     * but the UI keeps its previous value.
     */
    const refreshMods = async () => {
        try {
            const res = await fetch(`${API_BASE}/mods/refresh`, { method: "POST" })
            const data = await res.json()
            setMods(data)
        } catch (err) {
            console.error("Failed to refresh mods:", err)
        }
    }

    /**
     * Fetches global translation statistics from the backend.
     *
     * Hits `GET /api/stats` and expects a JSON {@link Stats} object containing
     * aggregate metrics like global progress percentage and translation-memory
     * cache hit counts.
     */
    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_BASE}/stats`)
            const data = await res.json()
            setStats(data)
        } catch (err) {
            console.error("Failed to fetch stats:", err)
        }
    }

    // Fetch mods and stats in parallel on first mount.
    // The loading spinner stays visible until both requests settle.
    useEffect(() => {
        const init = async () => {
            await Promise.all([fetchMods(), fetchStats()])
            setLoading(false)
        }
        init()
    }, [])

    // Re-fetch mods whenever the user navigates back to the dashboard so that
    // counts stay in sync with changes made on other pages (e.g. Clear English).
    useEffect(() => {
        if (!loading && location.pathname === "/dashboard") {
            fetchMods()
        }
    }, [location.pathname])

    /**
     * Rescans a mod's workshop folder on disk and updates the backend database.
     *
     * Hits `POST /api/mods/{modId}/sync`. After a successful sync the mod list
     * is re-fetched so the dashboard reflects any newly discovered or removed
     * localization strings.
     *
     * @param modId - The unique identifier of the mod to sync.
     */
    const handleModSync = async (modId: string) => {
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/sync`, { method: "POST" })
            await res.json()
            fetchMods()
        } catch (err) {
            console.error("Failed to sync mod:", err)
        }
    }

    return (
        <>
            <Sidebar />

            {/* Detail pages get the wider container-fluid for the string table. */}
            <main className={isDetailPage ? "container-fluid" : "container"}>
                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                        <h2 style={{ color: "var(--text-dim)", animation: "pulse 2s infinite" }}>Loading resources...</h2>
                    </div>
                ) : (
                    <Routes>
                        {/* Redirect bare "/" to the dashboard. */}
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />

                        {/* --- Dashboard: mod grid overview --- */}
                        <Route path="/dashboard" element={<DashboardPage mods={mods} onModSelect={(modId) => navigate(`/mods/${modId}`)} onModSync={handleModSync} onRefresh={refreshMods} />} />

                        {/* --- Mod detail: string editor and translation actions --- */}
                        <Route path="/mods/:modId" element={<ModDetail onBack={() => navigate("/dashboard")} />} />

                        {/* --- Statistics: aggregate translation metrics --- */}
                        <Route path="/statistics" element={<StatisticsPage stats={stats} />} />

                        {/* --- Glossary: per-mod term management --- */}
                        <Route path="/glossary" element={<GlossaryPage />} />

                        {/* --- Settings: provider configuration (currently read-only) --- */}
                        <Route path="/settings" element={<SettingsPage />} />

                        {/* Catch-all: redirect unknown routes back to dashboard. */}
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                )}
            </main>
        </>
    )
}

export default App

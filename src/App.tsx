import { useState, useEffect } from "react"
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import ModGrid from "./components/ModGrid"
import ModDetail from "./components/ModDetail"
import GlossaryPage from "./components/GlossaryPage"
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

    /**
     * Sends untranslated strings for a mod to the chosen AI translation provider.
     *
     * Hits `POST /api/translate` with `{ mod_id, provider }`. The backend
     * translates all untranslated strings and optionally returns glossary term
     * suggestions. On success the mod list is refreshed so progress bars update.
     *
     * @param provider - The AI provider key (e.g. "claude", "deepl").
     * @param modId - The unique identifier of the mod to translate.
     * @returns A result object indicating success/failure, a user-facing message,
     *          and optionally the translated key-value pairs.
     */
    const handleTranslate = async (provider: string, modId: string): Promise<{ success: boolean; message: string; translations?: Record<string, string> }> => {
        try {
            const res = await fetch(`${API_BASE}/translate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mod_id: modId, provider }),
            })
            const data = await res.json()
            if (!res.ok) {
                return { success: false, message: data.detail || "Unknown error" }
            }
            // Refresh the mod list so dashboard progress bars reflect the new translations.
            fetchMods()
            const msg = `Translated ${data.translated} strings.${data.suggestions > 0 ? ` ${data.suggestions} glossary term suggestions pending review.` : ""}`
            return { success: true, message: msg, translations: data.translations }
        } catch (err) {
            console.error("Translation failed:", err)
            return { success: false, message: "Translation failed. Could not reach the server." }
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
                        <Route
                            path="/dashboard"
                            element={
                                <>
                                    <div className="dashboard-header">
                                        <div className="title-group">
                                            <h1>Workshop Dashboard</h1>
                                            <p>Manage and translate your Chrono Ark mods</p>
                                        </div>
                                        <button className="btn btn-outline" onClick={fetchMods}>
                                            Refresh
                                        </button>
                                    </div>
                                    <ModGrid mods={mods} onModSelect={(modId) => navigate(`/mods/${modId}`)} onModSync={handleModSync} />
                                </>
                            }
                        />

                        {/* --- Mod detail: string editor and translation actions --- */}
                        <Route path="/mods/:modId" element={<ModDetail onBack={() => navigate("/dashboard")} onTranslate={(provider, modId) => handleTranslate(provider, modId)} />} />

                        {/* --- Statistics: aggregate translation metrics --- */}
                        <Route
                            path="/statistics"
                            element={
                                stats ? (
                                    <div className="stats-view animate-fade-in">
                                        <div className="dashboard-header">
                                            <div className="title-group">
                                                <h1>System Statistics</h1>
                                                <p>Translation memory and global progress</p>
                                            </div>
                                        </div>

                                        <div className="mod-grid">
                                            <div className="glass-card stat-card" style={{ padding: "2rem", textAlign: "center" }}>
                                                <h2 style={{ fontSize: "3rem", color: "var(--accent-primary)" }}>{stats.global_progress}%</h2>
                                                <p style={{ color: "var(--text-dim)" }}>Global Progress</p>
                                            </div>
                                            <div className="glass-card stat-card" style={{ padding: "2rem", textAlign: "center" }}>
                                                <h2 style={{ fontSize: "3rem", color: "var(--accent-secondary)" }}>{stats.tm_entries}</h2>
                                                <p style={{ color: "var(--text-dim)" }}>Translation Memory Entries</p>
                                            </div>
                                            <div className="glass-card stat-card" style={{ padding: "2rem", textAlign: "center" }}>
                                                <h2 style={{ fontSize: "3rem", color: "var(--success)" }}>{stats.tm_hits}</h2>
                                                <p style={{ color: "var(--text-dim)" }}>Total Cache Hits</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div>No statistics available.</div>
                                )
                            }
                        />

                        {/* --- Glossary: per-mod term management --- */}
                        <Route path="/glossary" element={<GlossaryPage />} />

                        {/* --- Settings: provider configuration (currently read-only) --- */}
                        <Route
                            path="/settings"
                            element={
                                <div className="settings-view">
                                    <div className="dashboard-header">
                                        <div className="title-group">
                                            <h1>Settings</h1>
                                            <p>API Keys and Provider Configuration</p>
                                        </div>
                                    </div>
                                    <div className="glass-card" style={{ padding: "2rem", color: "var(--text-dim)" }}>
                                        <p style={{ marginBottom: "1.5rem" }}>
                                            Active Provider: <strong>Claude (Default)</strong>
                                        </p>
                                        <p>Configuration is currently managed via backend environment variables and system settings.</p>
                                    </div>
                                </div>
                            }
                        />

                        {/* Catch-all: redirect unknown routes back to dashboard. */}
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                )}
            </main>
        </>
    )
}

export default App

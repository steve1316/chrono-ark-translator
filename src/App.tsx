import { useState, useEffect } from "react"
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import ModGrid from "./components/ModGrid"
import ModDetail from "./components/ModDetail"
import GlossaryPage from "./components/GlossaryPage"
import type { ModStatus, Stats } from "./shared_types"
import "./index.css"

const API_BASE = "http://localhost:8000/api"

/**
 * Main application component that handles routing and global state.
 * @returns The rendered application.
 */
function App() {
    const [mods, setMods] = useState<ModStatus[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState<Stats | null>(null)
    const navigate = useNavigate()
    const location = useLocation()
    const isDetailPage = location.pathname.startsWith("/mods/")

    /**
     * Fetches the list of all mods from the backend.
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

    useEffect(() => {
        const init = async () => {
            await Promise.all([fetchMods(), fetchStats()])
            setLoading(false)
        }
        init()
    }, [])

    /**
     * Synchronizes a specific mod's files with the backend.
     * @param modId - The ID of the mod to sync.
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
     * Triggers the translation process for a mod.
     * @param modId - The ID of the mod to translate.
     * @param provider - The AI provider to use.
     * @param dryRun - Whether to perform a dry run without actual translation.
     */
    const handleTranslate = async (modId: string, provider: string, dryRun: boolean): Promise<{ success: boolean; message: string; translations?: Record<string, string> }> => {
        try {
            const res = await fetch(`${API_BASE}/translate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mod_id: modId, provider, dry_run: dryRun }),
            })
            const data = await res.json()
            if (!res.ok) {
                return { success: false, message: data.detail || "Unknown error" }
            }
            if (dryRun) {
                if (data.total_strings === 0) {
                    return { success: true, message: "All strings are already translated." }
                }
                const estimates = Object.entries(data.estimates || {})
                    .map(([lang, est]: [string, any]) => `${lang}: ~$${est.estimated_cost_usd}`)
                    .join(", ")
                return { success: true, message: `Dry run for ${data.total_strings} strings via ${data.provider}\n\n${estimates}` }
            } else {
                fetchMods()
                const msg = `Translated ${data.translated} strings.${data.suggestions > 0 ? ` ${data.suggestions} glossary term suggestions pending review.` : ""}`
                return { success: true, message: msg, translations: data.translations }
            }
        } catch (err) {
            console.error("Translation failed:", err)
            return { success: false, message: "Translation failed. Could not reach the server." }
        }
    }

    return (
        <>
            <Sidebar />

            <main className={isDetailPage ? "container-fluid" : "container"}>
                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                        <h2 style={{ color: "var(--text-dim)", animation: "pulse 2s infinite" }}>Loading resources...</h2>
                    </div>
                ) : (
                    <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />

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

                        <Route path="/mods/:modId" element={<ModDetail onBack={() => navigate("/dashboard")} onTranslate={(provider, dryRun, modId) => handleTranslate(modId, provider, dryRun)} />} />

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

                        <Route path="/glossary" element={<GlossaryPage />} />

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

                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                )}
            </main>
        </>
    )
}

export default App

import { useState, useEffect } from "react"
import { Routes, Route, Navigate, useParams, useMatch } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import { getBranding } from "./components/GameSwitcher/branding"
import SettingsPage from "./pages/Settings"
import { API_BASE } from "./config"
import { getGameBySlug, slugForId } from "./games/registry"
import "./games/chrono_ark" // side-effect: registers manifest
import "./games/total_war_warhammer_3" // side-effect: registers manifest
import "./index.css"

/**
 * Renders the resolved game's route subtree, or redirects home when the slug is unknown.
 * @returns The active game's routes, or a redirect to `/`.
 */
function GameSubtree() {
    const { gameSlug } = useParams<{ gameSlug: string }>()
    const manifest = gameSlug ? getGameBySlug(gameSlug) : undefined
    if (!manifest) return <Navigate to="/" replace />
    return manifest.routes()
}

/**
 * App shell: a persistent sidebar plus the routed page area. The active game is the `:gameSlug` URL segment (source of truth); the persisted
 * `active_game` setting only seeds the default redirect for `/`.
 * @returns The application shell.
 */
function App() {
    const [defaultGameId, setDefaultGameId] = useState<string>("chrono_ark")
    const [loading, setLoading] = useState(true)

    // The persisted game id only picks the default redirect target for "/". The URL is the source of truth thereafter.
    useEffect(() => {
        fetch(`${API_BASE}/settings`)
            .then((r) => r.json())
            .then((data) => setDefaultGameId(data.active_game ?? "chrono_ark"))
            .catch((err) => console.error("Failed to load active game:", err))
            .finally(() => setLoading(false))
    }, [])

    // Active game for the sidebar comes from the URL slug; fall back to the persisted default off-slug (e.g. /settings).
    const match = useMatch("/:gameSlug/*")
    const activeSlug = match?.params.gameSlug
    const activeGameId = (activeSlug && getGameBySlug(activeSlug)?.id) || defaultGameId
    const isDetailPage = !!useMatch("/:gameSlug/translation/*")
    const defaultSlug = slugForId(defaultGameId) ?? "chrono_ark"

    // Page titles and active filter pills follow the game in the URL. The variables live on <html> so portaled dialogs inherit them too.
    // Off-game routes (e.g. /settings) remove them so the CSS default applies.
    const onGameRoute = !!(activeSlug && getGameBySlug(activeSlug))
    const branding = getBranding(activeGameId)
    useEffect(() => {
        const root = document.documentElement.style
        if (onGameRoute) {
            root.setProperty("--game-accent", branding.accent)
            root.setProperty("--game-accent-gradient", branding.gradient)
        } else {
            root.removeProperty("--game-accent")
            root.removeProperty("--game-accent-gradient")
        }
    }, [onGameRoute, branding.accent, branding.gradient])

    return (
        <>
            <Sidebar activeGameId={activeGameId} />

            {/* Detail pages get the wider container-fluid for the string table. */}
            <main className={isDetailPage ? "container-fluid" : "container"}>
                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                        <h2 style={{ color: "var(--text-dim)", animation: "pulse 2s infinite" }}>Loading resources...</h2>
                    </div>
                ) : (
                    <Routes>
                        {/* --- Cross-game Settings: provider configuration, game path --- */}
                        <Route path="/settings" element={<SettingsPage />} />

                        {/* --- Active game's subtree, namespaced by URL slug --- */}
                        <Route path="/:gameSlug/*" element={<GameSubtree />} />

                        {/* --- Root + unknown paths redirect to the persisted game's dashboard --- */}
                        <Route path="*" element={<Navigate to={`/${defaultSlug}/dashboard`} replace />} />
                    </Routes>
                )}
            </main>
        </>
    )
}

export default App

import { useState, useEffect } from "react"
import { Routes, Route, Navigate, useParams, useMatch, useLocation } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import ErrorBoundary from "./ui/ErrorBoundary"
import LoadingState from "./ui/LoadingState"
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
 * App shell: a persistent sidebar plus the routed page area. The active game is the `:gameSlug` URL segment (source of truth). Off-game routes
 * such as `/settings` keep the last game visited, and fall back to the persisted `active_game` setting on a direct visit.
 * @returns The application shell.
 */
function App() {
    const [defaultGameId, setDefaultGameId] = useState<string>("chrono_ark")
    const [loading, setLoading] = useState(true)
    // The game of the last game route visited, so /settings stays in the game the user came from.
    const [lastGameId, setLastGameId] = useState<string | null>(null)
    const location = useLocation()

    // The persisted game id only picks the default redirect target for "/". The URL is the source of truth thereafter.
    useEffect(() => {
        fetch(`${API_BASE}/settings`)
            .then((r) => r.json())
            .then((data) => setDefaultGameId(data.active_game ?? "chrono_ark"))
            .catch((err) => console.error("Failed to load active game:", err))
            .finally(() => setLoading(false))
    }, [])

    // Active game comes from the URL slug. Off-slug (e.g. /settings) it is the last game visited, then the persisted default.
    const match = useMatch("/:gameSlug/*")
    const activeSlug = match?.params.gameSlug
    const routeGameId = activeSlug ? getGameBySlug(activeSlug)?.id : undefined
    // Remember the route's game while rendering (React's derived-state pattern), so the first /settings render already uses it.
    if (routeGameId && routeGameId !== lastGameId) setLastGameId(routeGameId)
    const activeGameId = routeGameId || lastGameId || defaultGameId
    const isDetailPage = !!useMatch("/:gameSlug/translation/*")
    const defaultSlug = slugForId(defaultGameId) ?? "chrono_ark"

    // Page titles and active filter pills follow the active game, including on /settings. The variables live on <html> so portaled dialogs
    // inherit them too.
    const branding = getBranding(activeGameId)
    useEffect(() => {
        const root = document.documentElement.style
        root.setProperty("--game-accent", branding.accent)
        root.setProperty("--game-accent-gradient", branding.gradient)
    }, [branding.accent, branding.gradient])

    return (
        <>
            <Sidebar activeGameId={activeGameId} />

            {/* Detail pages get the wider container-fluid for the string table. */}
            <main className={isDetailPage ? "container-fluid" : "container"}>
                {loading ? (
                    <LoadingState message="Loading resources..." />
                ) : (
                    <ErrorBoundary key={location.pathname}>
                        <Routes>
                            {/* --- Cross-game Settings: provider configuration, game path --- */}
                            <Route path="/settings" element={<SettingsPage />} />

                            {/* --- Active game's subtree, namespaced by URL slug --- */}
                            <Route path="/:gameSlug/*" element={<GameSubtree />} />

                            {/* --- Root + unknown paths redirect to the persisted game's dashboard --- */}
                            <Route path="*" element={<Navigate to={`/${defaultSlug}/dashboard`} replace />} />
                        </Routes>
                    </ErrorBoundary>
                )}
            </main>
        </>
    )
}

export default App

import { useState, useEffect } from "react"
import { Routes, Route, useLocation } from "react-router-dom"
import Sidebar from "./components/Sidebar"
import SettingsPage from "./pages/Settings"
import { API_BASE } from "./config"
import { getGame } from "./games/registry"
import "./games/chrono_ark" // side-effect: registers manifest
import "./games/total_war_warhammer_3" // side-effect: registers manifest
import "./index.css"

function App() {
    const [activeGameId, setActiveGameId] = useState<string>("chrono_ark")
    const [loading, setLoading] = useState(true)

    const location = useLocation()
    // Detail pages use a wider `container-fluid` layout to give the string
    // table more horizontal space, while other pages use the narrower `container`.
    const isDetailPage = location.pathname.startsWith("/translation/")

    // Load the active game id from the backend on first mount. The active
    // game's subtree only renders once this resolves so the initial route
    // matches the persisted choice rather than the hard-coded default.
    useEffect(() => {
        fetch(`${API_BASE}/settings`)
            .then((r) => r.json())
            .then((data) => setActiveGameId(data.active_game ?? "chrono_ark"))
            .catch((err) => console.error("Failed to load active game:", err))
            .finally(() => setLoading(false))
    }, [])

    const game = getGame(activeGameId)

    return (
        <>
            <Sidebar activeGameId={activeGameId} onGameChange={setActiveGameId} />

            {/* Detail pages get the wider container-fluid for the string table. */}
            <main className={isDetailPage ? "container-fluid" : "container"}>
                {loading || !game ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                        <h2 style={{ color: "var(--text-dim)", animation: "pulse 2s infinite" }}>Loading resources...</h2>
                    </div>
                ) : (
                    <Routes>
                        {/* --- Cross-game Settings: provider configuration, game path --- */}
                        <Route path="/settings" element={<SettingsPage />} />

                        {/* --- Active game's subtree --- */}
                        <Route path="/*" element={game.routes()} />
                    </Routes>
                )}
            </main>
        </>
    )
}

export default App

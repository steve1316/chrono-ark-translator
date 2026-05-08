import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { fetchGames, type GameMetadata } from "../../api/games"
import { API_BASE } from "../../config"

interface GameSwitcherProps {
    activeGameId: string
    onChange: (gameId: string) => void
}

/**
 * Dropdown control that lets the user switch between registered games.
 *
 * Loads the list of games from `GET /api/games` on mount and posts the
 * selected game id back to `POST /api/settings` so the backend rotates its
 * adapter and persists the choice. Once the backend acknowledges the switch
 * the parent's `onChange` handler updates the App-level active-game state and
 * the URL is reset to `/` so the new game's default route can take over.
 *
 * Args:
 *     activeGameId: The currently active game's id, used as the selected option.
 *     onChange: Called with the new game id after the backend confirms the switch.
 *
 * Returns:
 *     The rendered switcher JSX, or `null` while the games list is still loading.
 */
const GameSwitcher = ({ activeGameId, onChange }: GameSwitcherProps) => {
    const [games, setGames] = useState<GameMetadata[]>([])
    const navigate = useNavigate()

    useEffect(() => {
        fetchGames()
            .then(setGames)
            .catch((err) => console.error("Failed to load games:", err))
    }, [])

    const handleSelect = async (gameId: string) => {
        if (gameId === activeGameId) return
        const res = await fetch(`${API_BASE}/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active_game: gameId }),
        })
        if (res.ok) {
            onChange(gameId)
            // Reset URL so the new game's <Navigate> redirects to its default page,
            // avoiding a blank screen if the previous URL belonged to the prior game.
            navigate("/")
        }
    }

    if (games.length === 0) return null

    return (
        <div style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
            <select
                value={activeGameId}
                onChange={(e) => handleSelect(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", background: "var(--bg-elevated)", color: "var(--text)" }}
            >
                {games.map((g) => (
                    <option key={g.game_id} value={g.game_id}>
                        {g.display_name}
                    </option>
                ))}
            </select>
        </div>
    )
}

export default GameSwitcher

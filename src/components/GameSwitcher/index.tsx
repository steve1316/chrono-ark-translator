import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useNavigate } from "react-router-dom"
import { fetchGames, type GameMetadata } from "../../api/games"
import { API_BASE } from "../../config"
import { getBranding } from "./branding"

interface GameSwitcherProps {
    /** The currently active game's id. Used to mark the matching pill as `aria-checked` and to skip the POST when re-clicked. */
    activeGameId: string
    /** Called with the new game id after the backend confirms the switch. */
    onChange: (gameId: string) => void
}

/**
 * Two-pill segmented toggle for switching between registered games. Each pill shows the game's square logo (or a single-letter glyph fallback) and is wired as a `role="radio"` inside a `role="radiogroup"`.
 * Selection POSTs `{ active_game: gameId }` to `/api/settings`, calls `onChange`, then resets the URL to `/` so the new game's default route can take over.
 *
 * @param activeGameId The currently active game's id.
 * @param onChange Called with the new game id after the backend confirms the switch.
 * @returns The radiogroup of pills, or `null` while the games list is still loading.
 */
const GameSwitcher = ({ activeGameId, onChange }: GameSwitcherProps) => {
    const [games, setGames] = useState<GameMetadata[]>([])
    const navigate = useNavigate()
    const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({})

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
            // Reset URL so the new game's <Navigate> redirects to its default page, avoiding a blank screen if the previous URL belonged to the prior game.
            navigate("/")
        }
    }

    const handleKey = (evt: KeyboardEvent<HTMLButtonElement>, idx: number) => {
        if (games.length === 0) return
        if (evt.key === "ArrowRight" || evt.key === "ArrowDown") {
            evt.preventDefault()
            const next = games[(idx + 1) % games.length]
            pillRefs.current[next.game_id]?.focus()
        } else if (evt.key === "ArrowLeft" || evt.key === "ArrowUp") {
            evt.preventDefault()
            const prev = games[(idx - 1 + games.length) % games.length]
            pillRefs.current[prev.game_id]?.focus()
        } else if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault()
            const current = games[idx]
            void handleSelect(current.game_id)
        }
    }

    if (games.length === 0) return null

    return (
        <div role="radiogroup" aria-label="Active game" className="game-switcher">
            {games.map((g, idx) => {
                const branding = getBranding(g.game_id)
                const selected = g.game_id === activeGameId
                const pillStyle: React.CSSProperties = selected
                    ? {
                          borderColor: branding.accent,
                          boxShadow: `0 0 14px ${hexToRgba(branding.accent, 0.28)}`,
                          backgroundImage: `${branding.gradient}, var(--glass-bg)`,
                          backgroundBlendMode: "overlay",
                      }
                    : {}
                return (
                    <button
                        key={g.game_id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={g.display_name}
                        tabIndex={selected ? 0 : -1}
                        ref={(el) => {
                            pillRefs.current[g.game_id] = el
                        }}
                        onClick={() => void handleSelect(g.game_id)}
                        onKeyDown={(e) => handleKey(e, idx)}
                        className={`game-switcher__pill${selected ? " game-switcher__pill--active" : ""}`}
                        style={pillStyle}
                    >
                        {branding.logo ? (
                            <img src={branding.logo} alt={g.display_name} className="game-switcher__logo" draggable={false} />
                        ) : (
                            <span className="game-switcher__fallback" aria-hidden="true">
                                {g.display_name.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

/**
 * Converts a `#rrggbb` color string to `rgba(r,g,b,alpha)`. Used to derive accent glows from the per-game accent color at runtime. Falls back to a neutral grey on parse failure.
 *
 * @param hex A `#rrggbb` color string.
 * @param alpha Alpha value between 0 and 1.
 * @returns An `rgba(...)` string usable directly in a CSS `box-shadow`.
 */
function hexToRgba(hex: string, alpha: number): string {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!match) return `rgba(148, 163, 184, ${alpha})`
    const r = parseInt(match[1], 16)
    const g = parseInt(match[2], 16)
    const b = parseInt(match[3], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default GameSwitcher

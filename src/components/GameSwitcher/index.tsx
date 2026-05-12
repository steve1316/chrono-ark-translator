import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { fetchGames, type GameMetadata } from "../../api/games"
import { API_BASE } from "../../config"

interface GameSwitcherProps {
    /** The currently active game's id; used to highlight the matching option and label the trigger. */
    activeGameId: string
    /** Called with the new game id after the backend confirms the switch. */
    onChange: (gameId: string) => void
}

/**
 * Glass-card dropdown that lets the user switch between registered games. Loads the list of games from `GET /api/games` on mount. Clicking the trigger button toggles an absolutely-positioned menu of options below. Selecting a non-active option posts to `POST /api/settings` so the backend rotates its adapter, calls `onChange` to update App-level state, then resets the URL to `/` so the new game's default route can take over.
 *
 * @param activeGameId The currently active game's id; used to highlight the matching option and label the trigger.
 * @param onChange Called with the new game id after the backend confirms the switch.
 * @returns A glass-card trigger plus an optional menu, or `null` while the games list is still loading.
 */
const GameSwitcher = ({ activeGameId, onChange }: GameSwitcherProps) => {
    const [games, setGames] = useState<GameMetadata[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const navigate = useNavigate()

    useEffect(() => {
        fetchGames()
            .then(setGames)
            .catch((err) => console.error("Failed to load games:", err))
    }, [])

    useEffect(() => {
        if (!isOpen) return

        const onOutsideClick = (evt: MouseEvent) => {
            const target = evt.target as Node
            if (wrapperRef.current && target && !wrapperRef.current.contains(target)) {
                setIsOpen(false)
            }
        }

        const onKey = (evt: KeyboardEvent) => {
            if (evt.key === "Escape") setIsOpen(false)
        }

        document.addEventListener("mousedown", onOutsideClick)
        document.addEventListener("keydown", onKey)

        return () => {
            document.removeEventListener("mousedown", onOutsideClick)
            document.removeEventListener("keydown", onKey)
        }
    }, [isOpen])

    const handleSelect = async (gameId: string) => {
        setIsOpen(false)
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

    if (games.length === 0) return null

    const active = games.find((g) => g.game_id === activeGameId)
    const activeLabel = active?.display_name ?? activeGameId

    return (
        <div ref={wrapperRef} style={{ position: "relative", padding: "0.5rem 0.25rem", borderBottom: "1px solid var(--glass-border, #333)", zIndex: 100 }}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls="gameswitcher-listbox"
                onClick={() => setIsOpen((o) => !o)}
                style={{
                    width: "100%",
                    padding: "0.5rem 0.5rem",
                    background: "var(--glass-bg, rgba(255,255,255,0.05))",
                    border: "1px solid var(--glass-border, #333)",
                    borderRadius: 6,
                    color: "var(--text-main, #eee)",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                }}
            >
                <span style={{ whiteSpace: "nowrap" }}>{activeLabel}</span>
                <span
                    aria-hidden="true"
                    style={{
                        display: "inline-block",
                        transition: "transform 0.15s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        fontSize: "0.7rem",
                        color: "var(--text-dim, #777)",
                    }}
                >
                    v
                </span>
            </button>
            {isOpen && (
                <ul
                    id="gameswitcher-listbox"
                    role="listbox"
                    style={{
                        listStyle: "none",
                        margin: 0,
                        padding: "0.25rem",
                        position: "absolute",
                        top: "100%",
                        left: "0.25rem",
                        right: "0.25rem",
                        background: "var(--bg-color, #05070a)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        border: "1px solid var(--glass-border, rgba(255,255,255,0.1))",
                        borderRadius: 6,
                        zIndex: 10,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                    }}
                >
                    {games.map((g) => {
                        const selected = g.game_id === activeGameId
                        return (
                            <li
                                key={g.game_id}
                                role="option"
                                aria-selected={selected}
                                tabIndex={0}
                                onClick={() => handleSelect(g.game_id)}
                                onKeyDown={(evt) => {
                                    if (evt.key === "Enter" || evt.key === " ") {
                                        evt.preventDefault()
                                        handleSelect(g.game_id)
                                    }
                                }}
                                style={{
                                    padding: "0.5rem 0.75rem",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    background: selected ? "var(--glass-bg-strong, rgba(255,255,255,0.08))" : "transparent",
                                    color: "var(--text-main, #eee)",
                                    fontSize: "0.9rem",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                                onMouseEnter={(e) => {
                                    if (!selected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                                }}
                                onMouseLeave={(e) => {
                                    if (!selected) e.currentTarget.style.background = "transparent"
                                }}
                            >
                                <span style={{ whiteSpace: "nowrap" }}>{g.display_name}</span>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}

export default GameSwitcher

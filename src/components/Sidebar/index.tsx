import React from "react"
import { NavLink } from "react-router-dom"
import { FaCog } from "react-icons/fa"
import GameSwitcher from "../GameSwitcher"
import { getGame } from "../../games/registry"

interface SidebarProps {
    activeGameId: string
    onGameChange: (gameId: string) => void
}

/**
 * Persistent sidebar navigation component displayed on every page.
 *
 * Renders the `GameSwitcher` followed by the active game's nav entries (pulled
 * from the registry manifest) and the cross-game Settings link. Each link
 * uses React Router's `NavLink` so the currently active route is highlighted
 * via the "active" CSS class.
 *
 * Args:
 *     activeGameId: The currently active game's id, used to look up the manifest.
 *     onGameChange: Forwarded to the `GameSwitcher` so the App can update state.
 *
 * Returns:
 *     The rendered sidebar JSX containing the game switcher and navigation links.
 */
const Sidebar: React.FC<SidebarProps> = ({ activeGameId, onGameChange }) => {
    const game = getGame(activeGameId)
    return (
        <div className="sidebar">
            {/* --- Game switcher --- selects which game's subtree is active. */}
            <GameSwitcher activeGameId={activeGameId} onChange={onGameChange} />

            {/* --- Navigation Links ---
                The active game's manifest contributes per-game entries; the
                cross-game Settings link is always rendered last. Inline styles
                ensure consistent layout regardless of global button styles. */}
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.5rem" }}>
                {game?.nav.map((entry) => (
                    <NavLink
                        key={entry.to}
                        to={entry.to}
                        className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                        style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                    >
                        {entry.icon} {entry.label}
                    </NavLink>
                ))}
                {/* Settings -- API keys, provider configuration, game path */}
                <NavLink
                    to="/settings"
                    className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                    style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                >
                    <FaCog /> Settings
                </NavLink>
            </nav>
        </div>
    )
}

export default Sidebar

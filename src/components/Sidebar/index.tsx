import React from "react"
import { NavLink } from "react-router-dom"
import { FaCog } from "react-icons/fa"
import GameSwitcher from "../GameSwitcher"
import { getBranding } from "../GameSwitcher/branding"
import { getGame } from "../../games/registry"

interface SidebarProps {
    activeGameId: string
    onGameChange: (gameId: string) => void
}

/**
 * Persistent sidebar navigation displayed on every page. Renders, in order: the `GameSwitcher` segmented toggle, an active-game header (gradient title + capability subtitle + hairline divider), then the active game's nav entries (from the registry manifest) and the cross-game Settings link. Each link uses `NavLink` so the current route is highlighted via the `active` class.
 *
 * @param activeGameId The currently active game's id, used to look up the manifest and branding.
 * @param onGameChange Forwarded to the `GameSwitcher` so the App can update state.
 * @returns The rendered sidebar JSX.
 */
const Sidebar: React.FC<SidebarProps> = ({ activeGameId, onGameChange }) => {
    const game = getGame(activeGameId)
    const branding = getBranding(activeGameId)
    const hasBranding = branding.subtitle.length > 0
    const titleStyle: React.CSSProperties = hasBranding
        ? {
              backgroundImage: branding.gradient,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
          }
        : {}
    const displayName = game?.displayName ?? humanizeGameId(activeGameId)

    return (
        <div className="sidebar">
            <GameSwitcher activeGameId={activeGameId} onChange={onGameChange} />

            <div className="sidebar__game-header">
                <div data-testid="sidebar-game-title" className="sidebar__game-title" style={titleStyle}>
                    {displayName}
                </div>
                {hasBranding && (
                    <div data-testid="sidebar-game-subtitle" className="sidebar__game-subtitle">
                        {branding.subtitle}
                    </div>
                )}
                <div data-testid="sidebar-game-divider" className="sidebar__game-divider" />
            </div>

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

/**
 * Converts a snake_case game id (e.g. `"future_game"`) into a Title Case label (e.g. `"Future Game"`). Used as the fallback when a game id has no registered manifest entry.
 *
 * @param gameId The raw `game_id` string.
 * @returns A human-friendly display name derived from the id.
 */
function humanizeGameId(gameId: string): string {
    return gameId
        .split("_")
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

export default Sidebar

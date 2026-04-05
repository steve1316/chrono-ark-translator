import React from "react"
import { NavLink } from "react-router-dom"
import { MdDashboard } from "react-icons/md"
import { FaBook, FaChartLine, FaCog } from "react-icons/fa"

/**
 * Persistent sidebar navigation component displayed on every page.
 *
 * Renders a vertical list of icon-labeled links to the application's
 * top-level routes. Each link uses React Router's `NavLink` so that the
 * currently active route is automatically highlighted via the "active"
 * CSS class.
 *
 * @returns The rendered sidebar JSX containing navigation links
 */
const Sidebar: React.FC = () => {
    return (
        <div className="sidebar">
            {/* --- Navigation Links ---
                Each NavLink conditionally applies the "active" class based
                on the current route, providing visual feedback for the
                selected page. Inline styles ensure consistent layout
                regardless of global button/anchor styles. */}
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {/* Dashboard -- mod overview and translation progress */}
                <NavLink
                    to="/dashboard"
                    className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                    style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                >
                    <MdDashboard /> Dashboard
                </NavLink>
                {/* Glossary -- global and per-mod terminology management */}
                <NavLink
                    to="/glossary"
                    className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                    style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                >
                    <FaBook /> Glossary
                </NavLink>
                {/* Statistics -- translation memory and progress metrics */}
                <NavLink
                    to="/statistics"
                    className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                    style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                >
                    <FaChartLine /> Statistics
                </NavLink>
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

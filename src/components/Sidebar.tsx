import React from "react"
import { NavLink } from "react-router-dom"
import { MdDashboard } from "react-icons/md"
import { FaBook, FaChartLine, FaCog } from "react-icons/fa"

/**
 * Sidebar component for application navigation.
 * @returns The rendered sidebar.
 */
const Sidebar: React.FC = () => {
    return (
        <div className="sidebar">
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {/* Dashboard navigation link. */}
                <NavLink
                    to="/dashboard"
                    className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                    style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                >
                    <MdDashboard /> Dashboard
                </NavLink>
                {/* Glossary navigation link. */}
                <NavLink
                    to="/glossary"
                    className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                    style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                >
                    <FaBook /> Glossary
                </NavLink>
                {/* Statistics navigation link. */}
                <NavLink
                    to="/statistics"
                    className={({ isActive }) => `nav-link btn-outline ${isActive ? "active" : ""}`}
                    style={{ border: "none", textAlign: "left", width: "100%", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}
                >
                    <FaChartLine /> Statistics
                </NavLink>
                {/* Settings navigation link. */}
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

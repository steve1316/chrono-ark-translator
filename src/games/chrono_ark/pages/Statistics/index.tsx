import React, { useEffect, useState } from "react"
import type { Stats } from "../../../../shared_types"
import { API_BASE } from "../../../../config"

/**
 * The statistics page displays the translation memory and global progress.
 *
 * Fetches its own stats from `GET /api/stats` (a cross-game endpoint exposed
 * by the settings router) on mount. Renders a placeholder while the fetch is
 * in flight or if it fails.
 *
 * @returns A React component that displays the translation memory and global progress.
 */
const StatisticsPage: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null)

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch(`${API_BASE}/stats`)
                const data = await res.json()
                setStats(data)
            } catch (err) {
                console.error("Failed to fetch stats:", err)
            }
        }
        fetchStats()
    }, [])

    if (!stats) {
        return <div>No statistics available.</div>
    }

    return (
        <div className="stats-view animate-fade-in">
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>System Statistics</h1>
                    <p>Translation memory and global progress</p>
                </div>
            </div>

            <div className="mod-grid">
                <div className="glass-card stat-card" style={{ padding: "2rem", textAlign: "center" }}>
                    <h2 style={{ fontSize: "3rem", color: "var(--accent-primary)" }}>{stats.global_progress}%</h2>
                    <p style={{ color: "var(--text-dim)" }}>Global Progress</p>
                </div>
                <div className="glass-card stat-card" style={{ padding: "2rem", textAlign: "center" }}>
                    <h2 style={{ fontSize: "3rem", color: "var(--accent-secondary)" }}>{stats.tm_entries}</h2>
                    <p style={{ color: "var(--text-dim)" }}>Translation Memory Entries</p>
                </div>
                <div className="glass-card stat-card" style={{ padding: "2rem", textAlign: "center" }}>
                    <h2 style={{ fontSize: "3rem", color: "var(--success)" }}>{stats.tm_hits}</h2>
                    <p style={{ color: "var(--text-dim)" }}>Total Cache Hits</p>
                </div>
            </div>
        </div>
    )
}

export default StatisticsPage

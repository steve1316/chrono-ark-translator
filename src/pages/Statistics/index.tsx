import React from "react"
import type { Stats } from "../../shared_types"

interface StatisticsPageProps {
    /** The statistics to display. */
    stats: Stats | null
}

/**
 * The statistics page displays the translation memory and global progress.
 * @param stats - The statistics to display.
 * @returns A React component that displays the translation memory and global progress.
 */
const StatisticsPage: React.FC<StatisticsPageProps> = ({ stats }) => {
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

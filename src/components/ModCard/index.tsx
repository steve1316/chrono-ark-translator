import React from "react"
import { FaSteam, FaSync } from "react-icons/fa"
import type { ModStatus } from "../../shared_types"
import { API_BASE } from "../../config"

/**
 * Props accepted by the {@link ModCard} component.
 */
interface ModCardProps {
    /** Full mod summary object including name, progress, and optional preview image. */
    mod: ModStatus
    /** Called when the user clicks "View Strings" to navigate to the mod detail page. */
    onClick: (modId: string) => void
    /** Called when the user clicks the resync button to rescan the workshop folder. */
    onSync: (modId: string) => void
    /** Current search query for highlighting matching characters in name/author. */
    searchQuery?: string
}

/**
 * Wraps substrings matching `query` in a highlight span. Returns the original
 * text unchanged when the query is empty.
 */
function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query) return text
    const lower = text.toLowerCase()
    const q = query.toLowerCase()
    const idx = lower.indexOf(q)
    if (idx === -1) return text
    return (
        <>
            {text.slice(0, idx)}
            <span style={{ background: "rgba(56, 189, 248, 0.3)", borderRadius: "2px" }}>{text.slice(idx, idx + query.length)}</span>
            {text.slice(idx + query.length)}
        </>
    )
}

/**
 * Dashboard card for a single mod, displaying its preview image, translation
 * progress bar, summary statistics, and action buttons (view, Steam link, sync).
 *
 * Wrapped in `React.memo` to avoid unnecessary re-renders when sibling cards
 * update -- the card only re-renders when its own `mod`, `onClick`, or `onSync`
 * props change.
 *
 * @param mod - The mod status data to display.
 * @param onClick - Handler invoked with the mod ID when the user wants to view its strings.
 * @param onSync - Handler invoked with the mod ID when the user wants to rescan files.
 * @param searchQuery - Optional search string for highlighting matched text in name/author.
 * @returns The rendered mod card JSX.
 */
const ModCard: React.FC<ModCardProps> = React.memo(({ mod, onClick, onSync, searchQuery = "" }) => {
    return (
        <div className="glass-card mod-card animate-fade-in">
            {/* --- Preview Image --- */}
            {/* Only rendered when the backend has found a preview image for the mod.
                Images are lazy-loaded to avoid blocking the initial paint of the grid. */}
            {mod.preview_image && (
                <div className="mod-preview">
                    <img src={`${API_BASE}${mod.preview_image}`} alt={mod.name} loading="lazy" />
                </div>
            )}
            <div className="mod-card-content">
                {/* --- Header: name, author, ID badge --- */}
                <div className="mod-header">
                    <div className="mod-info">
                        <h3>{highlightMatch(mod.name, searchQuery)}</h3>
                        <span className="author">by {highlightMatch(mod.author || "Unknown", searchQuery)}</span>
                    </div>
                    <span className="id-badge">{mod.id}</span>
                </div>

                {/* --- Translation Progress --- */}
                <div className="progress-section">
                    <div className="progress-info">
                        <span>{mod.percentage}% Translated</span>
                        <span>
                            {mod.translated} / {mod.total} strings
                        </span>
                    </div>
                    <div className="progress-bar-bg">
                        {/* Width driven directly by the percentage; CSS handles the gradient color. */}
                        <div className="progress-bar-fill" style={{ width: `${mod.percentage}%` }}></div>
                    </div>
                </div>

                {/* --- Quick Stats --- */}
                <div className="mod-stats">
                    <div className="stat-item">
                        <span className="stat-value">{mod.untranslated}</span>
                        <span className="stat-label">Remaining</span>
                    </div>
                    <div className="stat-item">
                        {/* DLL mods contain embedded strings extracted via decompilation;
                            CSV mods use standard Chrono Ark localization spreadsheets. */}
                        <span className="stat-value">{mod.has_dll ? "DLL" : "CSV"}</span>
                        <span className="stat-label">Format</span>
                    </div>
                </div>

                {/* --- Action Buttons --- */}
                <div className="mod-actions">
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onClick(mod.id)}>
                        View Strings
                    </button>
                    {/* Steam Workshop link -- only shown if the mod has a URL. */}
                    {mod.url && (
                        <a
                            href={mod.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline"
                            title="Open mod page"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "42px",
                                height: "42px",
                                textDecoration: "none",
                                color: "var(--text-main)",
                                padding: "0",
                            }}
                        >
                            <FaSteam size={20} />
                        </a>
                    )}
                    {/* Resync triggers POST /api/mods/{id}/sync to re-read files from disk. */}
                    <button className="btn btn-outline" onClick={() => onSync(mod.id)} title="Rescan workshop folder">
                        <FaSync />
                    </button>
                </div>
            </div>
        </div>
    )
})

export default ModCard

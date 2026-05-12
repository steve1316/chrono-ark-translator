import React from "react"
import { FaExclamationCircle, FaSteam, FaSync } from "react-icons/fa"
import type { ModStatus } from "../../shared_types"
import { API_BASE } from "../../config"
import { highlightMatch } from "../../utils/text"
import WorkshopCard from "../WorkshopCard"

/** Props for ModCard. */
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
 * Dashboard card for a single mod. Wraps `WorkshopCard` with the Chrono Ark
 * mod-specific body (progress, stats, action buttons).
 *
 * Wrapped in `React.memo` to avoid unnecessary re-renders when sibling cards update.
 *
 * @param mod The mod status data to display.
 * @param onClick Handler invoked with the mod ID when the user wants to view its strings.
 * @param onSync Handler invoked with the mod ID when the user wants to rescan files.
 * @param searchQuery Optional search string for highlighting matched text in name/author.
 * @returns The rendered mod card JSX.
 */
const ModCard: React.FC<ModCardProps> = React.memo(({ mod, onClick, onSync, searchQuery = "" }) => {
    const previewImageUrl = mod.preview_image ? `${API_BASE}${mod.preview_image}` : null
    return (
        <WorkshopCard
            data-mod-id={mod.id}
            previewImageUrl={previewImageUrl}
            previewAlt={mod.name}
            title={highlightMatch(mod.name, searchQuery)}
            idBadge={mod.id}
            subtitle={<>by {highlightMatch(mod.author || "Unknown", searchQuery)}</>}
        >
            <div className="progress-section">
                <div className="progress-info">
                    <span>{mod.percentage}% Translated</span>
                    <span>
                        {mod.translated} / {mod.total} strings
                    </span>
                </div>
                <div className="progress-bar-bg" style={{ display: "flex" }}>
                    {mod.user_translated > 0 && (
                        <div
                            title={`${mod.user_translated} translated by you`}
                            style={{
                                height: "100%",
                                width: `${(mod.user_translated / mod.total) * 100}%`,
                                background: "var(--accent-gradient)",
                                transition: "width 1s ease-out",
                            }}
                        />
                    )}
                    {mod.untouched > 0 && (
                        <div
                            title={`${mod.untouched} untouched (pre-existing English)`}
                            style={{
                                height: "100%",
                                width: `${(mod.untouched / mod.total) * 100}%`,
                                background: "rgba(148, 163, 184, 0.5)",
                                transition: "width 1s ease-out",
                            }}
                        />
                    )}
                </div>
            </div>
            <div className="mod-stats">
                <div className="stat-item">
                    <span className="stat-value">{mod.untranslated}</span>
                    <span className="stat-label">Remaining</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{mod.has_dll ? "DLL" : "CSV"}</span>
                    <span className="stat-label">Format</span>
                </div>
                {mod.has_changes && (
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            fontSize: "0.7rem",
                            padding: "0.25rem 0.5rem",
                            background: "rgba(251, 191, 36, 0.15)",
                            border: "1px solid rgba(251, 191, 36, 0.3)",
                            borderRadius: "6px",
                            color: "#fbbf24",
                            fontWeight: 600,
                        }}
                        title="Has unsynced changes"
                    >
                        <FaExclamationCircle size={10} />
                        Needs Sync
                    </span>
                )}
            </div>
            <div className="mod-actions">
                <button className={`btn ${mod.untranslated > 0 ? "btn-warning" : "btn-primary"}`} style={{ flex: 1 }} onClick={() => onClick(mod.id)}>
                    View Strings
                </button>
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
                <button className="btn btn-outline" onClick={() => onSync(mod.id)} title="Rescan workshop folder">
                    <FaSync />
                </button>
            </div>
        </WorkshopCard>
    )
})

export default ModCard

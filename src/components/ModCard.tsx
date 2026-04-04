import React from "react"
import { FaSteam, FaSync } from "react-icons/fa"
import type { ModStatus } from "../shared_types"

const API_BASE = "http://localhost:8000"

interface ModCardProps {
    mod: ModStatus
    onClick: (modId: string) => void
    onSync: (modId: string) => void
}

/**
 * Component representing a single mod card in the dashboard grid.
 * @param mod - The mod status data.
 * @param onClick - Handle clicking the card to view details.
 * @param onSync - Handle syncing the mod with the workshop folder.
 * @returns The rendered mod card.
 */
const ModCard: React.FC<ModCardProps> = React.memo(({ mod, onClick, onSync }) => {
    return (
        <div className="glass-card mod-card animate-fade-in">
            {mod.preview_image && (
                <div className="mod-preview">
                    <img src={`${API_BASE}${mod.preview_image}`} alt={mod.name} loading="lazy" />
                </div>
            )}
            <div className="mod-card-content">
                <div className="mod-header">
                    <div className="mod-info">
                        <h3>{mod.name}</h3>
                        <span className="author">by {mod.author || "Unknown"}</span>
                    </div>
                    <span className="id-badge">{mod.id}</span>
                </div>

                <div className="progress-section">
                    <div className="progress-info">
                        <span>{mod.percentage}% Translated</span>
                        <span>
                            {mod.translated} / {mod.total} strings
                        </span>
                    </div>
                    <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${mod.percentage}%` }}></div>
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
                </div>

                <div className="mod-actions">
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onClick(mod.id)}>
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
            </div>
        </div>
    )
})

export default ModCard

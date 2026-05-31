import React, { type ReactNode } from "react"
import { Link } from "react-router-dom"
import { FaExclamationCircle, FaSteam, FaSync } from "react-icons/fa"
import WorkshopCard from "../WorkshopCard"

/** One stat box rendered in the `mod-stats` row. */
export interface ModCardStat {
    /** Stat value (numeric or short label). */
    value: ReactNode
    /** Caption rendered below the value. */
    label: ReactNode
}

/** One segment of the stacked progress bar. */
export interface ModCardProgressSegment {
    /** Segment width as a percentage of the bar (0-100). */
    widthPercent: number
    /** CSS `background` value for the segment. */
    background: string
    /** Optional tooltip text. */
    title?: string
}

/** Progress section configuration. */
export interface ModCardProgress {
    /** Top-left label (e.g. `"75% Translated"` or `"Not yet scanned"`). */
    leftLabel: ReactNode
    /** Top-right label (e.g. `"15 / 20 strings"`). Omit to render only the left label. */
    rightLabel?: ReactNode
    /** Bar segments rendered left-to-right. Empty array renders an empty bar. */
    segments: ModCardProgressSegment[]
}

/** Primary action button or link. Either `to` (Link) or `onClick` (button) must be set, not both. */
export type ModCardPrimaryAction = {
    /** Button text. */
    label: ReactNode
    /** Color variant. Defaults to `"primary"`. */
    variant?: "primary" | "warning"
} & ({ to: string; onClick?: never } | { onClick: () => void; to?: never })

/** Props for ModCard. */
interface ModCardProps {
    /** Unique mod identifier (used for the `data-mod-id` attribute). */
    id: string
    /** Card title rendered as an h3. */
    title: ReactNode
    /** Badge text rendered to the right of the title (e.g. workshop id). */
    idBadge: string
    /** Optional subtitle line beneath the title (author, language pair, parent link, etc.). */
    subtitle?: ReactNode
    /** Optional preview image URL. Null/missing renders a placeholder. */
    previewImageUrl?: string | null
    /** Progress section content. */
    progress: ModCardProgress
    /** Stat boxes rendered in the `mod-stats` row. */
    stats: ModCardStat[]
    /** Optional inline badge nodes appended after the stat boxes (e.g. `NeedsSyncBadge`). */
    badges?: ReactNode
    /** Primary action - rendered as a `<Link>` when `to` is set, otherwise as a `<button>`. */
    primaryAction: ModCardPrimaryAction
    /** Optional external URL rendered as a Steam icon link. */
    steamUrl?: string | null
    /** Optional sync action. When undefined, the sync icon button is hidden. */
    onSync?: () => void
}

/**
 * Reusable dashboard card for a single mod. Composes `WorkshopCard` with a progress bar,
 * stat boxes, optional badges, and an action row. All variant content is supplied via props
 * so the same component fits both Chrono Ark mods (via `ModGrid`) and WH3 translation mods
 * (via `TranslationModCard`).
 *
 * Wrapped in `React.memo` to avoid unnecessary re-renders when sibling cards update.
 *
 * @param props See `ModCardProps`.
 * @returns The rendered mod card.
 */
const ModCard: React.FC<ModCardProps> = React.memo((props) => {
    const { id, title, idBadge, subtitle, previewImageUrl, progress, stats, badges, primaryAction, steamUrl, onSync } = props
    const variantClass = primaryAction.variant === "warning" ? "btn-warning" : "btn-primary"
    return (
        <WorkshopCard data-mod-id={id} previewImageUrl={previewImageUrl ?? null} previewAlt={typeof title === "string" ? title : "Mod"} title={title} idBadge={idBadge} subtitle={subtitle}>
            <div className="progress-section">
                <div className="progress-info">
                    <span>{progress.leftLabel}</span>
                    {progress.rightLabel != null && <span>{progress.rightLabel}</span>}
                </div>
                <div className="progress-bar-bg" style={{ display: "flex" }}>
                    {progress.segments.map((seg, i) => (
                        <div
                            key={i}
                            title={seg.title}
                            style={{
                                height: "100%",
                                width: `${seg.widthPercent}%`,
                                background: seg.background,
                                transition: "width 1s ease-out",
                            }}
                        />
                    ))}
                </div>
            </div>
            <div className="mod-stats">
                {stats.map((stat, i) => (
                    <div key={i} className="stat-item">
                        <span className="stat-value">{stat.value}</span>
                        <span className="stat-label">{stat.label}</span>
                    </div>
                ))}
                {badges}
            </div>
            <div className="mod-actions">
                {primaryAction.to != null ? (
                    <Link to={primaryAction.to} className={`btn ${variantClass}`} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                        {primaryAction.label}
                    </Link>
                ) : (
                    <button className={`btn ${variantClass}`} style={{ flex: 1 }} onClick={primaryAction.onClick}>
                        {primaryAction.label}
                    </button>
                )}
                {steamUrl && (
                    <a
                        href={steamUrl}
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
                {onSync && (
                    <button className="btn btn-outline" onClick={onSync} title="Rescan workshop folder">
                        <FaSync />
                    </button>
                )}
            </div>
        </WorkshopCard>
    )
})

/**
 * "Needs Sync" badge used by Chrono Ark mods that have unsynced translation changes.
 * Exported so callers building their `badges` prop can reuse it.
 *
 * @returns The rendered badge.
 */
export const NeedsSyncBadge: React.FC = () => (
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
)

export default ModCard

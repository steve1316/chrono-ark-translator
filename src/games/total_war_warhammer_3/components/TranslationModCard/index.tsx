import React from "react"
import { Link } from "react-router-dom"

import WorkshopCard from "../../../../components/WorkshopCard"
import type { WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"

/** Props for TranslationModCard. */
export interface TranslationModCardProps {
    /** The translation mod registry summary. */
    mod: WH3TranslationModSummary
    /** Latest rescan result, or `null` when the mod has not been scanned this session. */
    progress: WH3RescanSummary | null
}

/**
 * Dashboard card for a single WH3 translation mod. Mirrors the visual chrome of
 * `PackCard` but swaps the rebuild/publish actions for a single `Translate ->`
 * link that routes to the per-mod translation detail page. The card also surfaces
 * the parent mod link(s), the source / target language pill, and a progress bar
 * derived from the most recent rescan.
 *
 * @param mod The translation mod registry summary.
 * @param progress Latest rescan result, or `null` when not yet scanned.
 * @returns The rendered card.
 */
const TranslationModCard: React.FC<TranslationModCardProps> = ({ mod, progress }) => {
    const parents = mod.parent_workshop_ids
    const total = progress ? progress.counts.translated + progress.counts.untranslated + progress.counts.stale : 0
    const done = progress ? progress.counts.translated + progress.counts.stale : 0
    const stale = progress?.counts.stale ?? 0
    const percent = total > 0 ? Math.round((done / total) * 100) : 0

    return (
        <WorkshopCard title={mod.display_name} idBadge={mod.workshop_id}>
            <div className="translation-mod-meta">
                <span className="translation-lang-pill">
                    {mod.source_language} -&gt; {mod.target_language}
                </span>
                {parents.length === 1 ? (
                    <a
                        href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${parents[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="translation-parent-link"
                        aria-label={`parent mod ${parents[0]}`}
                    >
                        Parent mod
                    </a>
                ) : (
                    <span className="translation-parent-link" title={parents.join(", ")}>
                        Translates {parents.length} mods
                    </span>
                )}
            </div>

            {progress ? (
                <div className="translation-progress">
                    <div className="translation-progress-bar" aria-label={`${done} of ${total} strings translated`}>
                        <div className="translation-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="translation-progress-label">
                        {done} / {total} strings
                        {stale > 0 && <span className="translation-stale-count"> ({stale} stale)</span>}
                    </div>
                </div>
            ) : (
                <div className="translation-progress-placeholder">Not yet scanned</div>
            )}

            <div className="mod-actions" style={{ flexWrap: "nowrap", gap: "0.5rem" }}>
                <Link
                    to={`/translation-mods/${mod.workshop_id}`}
                    className="btn btn-primary"
                    style={{ height: "42px", padding: "0 0.9rem", fontSize: "0.875rem", display: "inline-flex", alignItems: "center" }}
                >
                    Translate -&gt;
                </Link>
            </div>
        </WorkshopCard>
    )
}

export default TranslationModCard

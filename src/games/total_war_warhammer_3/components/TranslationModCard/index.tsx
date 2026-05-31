import React from "react"

import ModCard, { type ModCardProgressSegment, type ModCardStat } from "../../../../components/ModCard"
import type { WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"

/** Props for TranslationModCard. */
export interface TranslationModCardProps {
    /** The translation mod registry summary. */
    mod: WH3TranslationModSummary
    /** Latest rescan result, or `null` when the mod has not been scanned this session. */
    progress: WH3RescanSummary | null
}

/**
 * Dashboard card for a single WH3 translation mod. Renders via the shared `ModCard`
 * shell so it matches the Chrono Ark mod card design: title + workshop-id badge,
 * source-to-target language pill + parent-mod link subtitle, segmented progress bar
 * (fresh + stale), stat boxes (Untranslated + optional Stale), and a `Translate ->`
 * link routing to the per-mod translation detail page.
 *
 * @param mod The translation mod registry summary.
 * @param progress Latest rescan result, or `null` when not yet scanned.
 * @returns The rendered card.
 */
const TranslationModCard: React.FC<TranslationModCardProps> = ({ mod, progress }) => {
    const parents = mod.parent_workshop_ids
    const counts = progress?.counts ?? null
    const translated = counts?.translated ?? 0
    const stale = counts?.stale ?? 0
    const untranslated = counts?.untranslated ?? 0
    const total = counts ? translated + untranslated + stale : 0
    const done = counts ? translated + stale : 0
    const percent = total > 0 ? Math.round((done / total) * 100) : 0

    const singleParent = parents.length === 1 ? parents[0] : null
    const steamUrl = singleParent ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${singleParent}` : null

    const segments: ModCardProgressSegment[] = []
    if (counts && total > 0) {
        if (translated > 0) {
            segments.push({
                widthPercent: (translated / total) * 100,
                background: "var(--accent-gradient)",
                title: `${translated} fresh translations`,
            })
        }
        if (stale > 0) {
            segments.push({
                widthPercent: (stale / total) * 100,
                background: "rgba(251, 191, 36, 0.5)",
                title: `${stale} stale translations`,
            })
        }
    }

    const stats: ModCardStat[] = counts ? [{ value: untranslated, label: "Untranslated" }, ...(stale > 0 ? [{ value: stale, label: "Stale" }] : [])] : []

    return (
        <ModCard
            id={mod.workshop_id}
            title={mod.display_name}
            idBadge={mod.workshop_id}
            subtitle={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="translation-lang-pill">
                        {mod.source_language} -&gt; {mod.target_language}
                    </span>
                    {singleParent ? (
                        <a href={steamUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="translation-parent-link" aria-label={`parent mod ${singleParent}`}>
                            Parent mod
                        </a>
                    ) : (
                        <span className="translation-parent-link" title={parents.join(", ")}>
                            Translates {parents.length} mods
                        </span>
                    )}
                </span>
            }
            progress={{
                leftLabel: counts ? `${percent}% Translated` : "Not yet scanned",
                rightLabel: counts ? `${done} / ${total} strings` : undefined,
                segments,
            }}
            stats={stats}
            primaryAction={{
                label: <>Translate -&gt;</>,
                variant: untranslated > 0 ? "warning" : "primary",
                to: `/translation-mods/${mod.workshop_id}`,
            }}
            steamUrl={steamUrl}
        />
    )
}

export default TranslationModCard

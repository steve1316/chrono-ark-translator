import React from "react"
import { useNavigate } from "react-router-dom"

import ModCard, { NeedsSyncBadge, type ModCardProgressSegment, type ModCardStat } from "../../../../components/ModCard"
import { API_BASE } from "../../../../config"
import type { WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"

/** Props for TranslationModCard. */
export interface TranslationModCardProps {
    /** The translation mod registry summary. */
    mod: WH3TranslationModSummary
    /** Latest rescan result, or `null` when the mod has not been scanned this session. */
    progress: WH3RescanSummary | null
    /** Called when the user clicks the rescan icon button. Receives the mod's workshop id. */
    onRescan: (workshopId: string) => void
}

/**
 * Dashboard card for a single WH3 translation mod. Renders via the shared `ModCard` shell so
 * the layout matches Chrono Ark's mod card exactly: preview image, title + workshop-id badge,
 * optional parent-mod-link subtitle, tri-color progress bar (translated gradient + stale amber),
 * stat boxes (`Remaining` + `Format`), optional `Needs Sync` badge, and an action row with a
 * `View Strings` button (warning color when untranslated rows remain), the parent mod's Steam
 * link, and a rescan icon button.
 *
 * @param mod The translation mod registry summary.
 * @param progress Latest rescan result, or `null` when not yet scanned.
 * @param onRescan Callback fired when the rescan icon is clicked.
 * @returns The rendered card.
 */
const TranslationModCard: React.FC<TranslationModCardProps> = ({ mod, progress, onRescan }) => {
    const navigate = useNavigate()
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

    const stats: ModCardStat[] = [
        { value: untranslated, label: "Remaining" },
        { value: "LOC", label: "Format" },
    ]

    return (
        <ModCard
            id={mod.workshop_id}
            title={mod.display_name}
            idBadge={mod.workshop_id}
            subtitle={
                singleParent ? (
                    <a href={steamUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="translation-parent-link" aria-label={`parent mod ${singleParent}`}>
                        Parent mod
                    </a>
                ) : parents.length > 1 ? (
                    <span className="translation-parent-link" title={parents.join(", ")}>
                        Translates {parents.length} mods
                    </span>
                ) : undefined
            }
            previewImageUrl={mod.preview_image_url ? `${API_BASE}${mod.preview_image_url}` : null}
            progress={{
                leftLabel: counts ? `${percent}% Translated` : "Not yet scanned",
                rightLabel: counts ? `${done} / ${total} strings` : undefined,
                segments,
            }}
            stats={stats}
            badges={progress?.has_unsynced_changes ? <NeedsSyncBadge /> : undefined}
            primaryAction={{
                label: "View Strings",
                variant: untranslated > 0 ? "warning" : "primary",
                onClick: () => navigate(`/translation-mods/${mod.workshop_id}`),
            }}
            steamUrl={steamUrl}
            onSync={() => onRescan(mod.workshop_id)}
        />
    )
}

export default TranslationModCard

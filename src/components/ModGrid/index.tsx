import React from "react"
import ModCard, { NeedsSyncBadge, type ModCardProgressSegment } from "../ModCard"
import { API_BASE } from "../../config"
import { highlightMatch } from "../../utils/text"
import type { ModStatus } from "../../shared_types"

/**
 * Props accepted by the {@link ModGrid} component.
 */
interface ModGridProps {
    /** Array of mod summaries to render as cards. */
    mods: ModStatus[]
    /** Called when the user clicks a card to view its translation strings. Receives the mod ID. */
    onModSelect: (modId: string) => void
    /** Called when the user clicks the sync/rescan button on a card. Receives the mod ID. */
    onModSync: (modId: string) => void
    /** Current search query used to highlight matching text in mod cards. */
    searchQuery?: string
}

/**
 * Responsive CSS-grid layout that renders one {@link ModCard} per mod.
 *
 * This is a pure presentational component -- it owns no state and simply maps
 * the `mods` array to cards, delegating user interactions upward via callbacks.
 * The grid layout (column count, gap) is controlled by the `.mod-grid` CSS class.
 *
 * @param mods The list of mod summaries to display as cards.
 * @param onModSelect Callback invoked when the user clicks a mod card.
 * @param onModSync Callback invoked when the user triggers a mod resync.
 * @param searchQuery Optional search string for highlighting matched text.
 * @returns The rendered grid of mod cards.
 */
const ModGrid: React.FC<ModGridProps> = ({ mods, onModSelect, onModSync, searchQuery = "" }) => {
    return (
        <div className="mod-grid">
            {mods.map((mod) => {
                const segments: ModCardProgressSegment[] = []
                if (mod.user_translated > 0 && mod.total > 0) {
                    segments.push({
                        widthPercent: (mod.user_translated / mod.total) * 100,
                        background: "var(--accent-gradient)",
                        title: `${mod.user_translated} translated by you`,
                    })
                }
                if (mod.untouched > 0 && mod.total > 0) {
                    segments.push({
                        widthPercent: (mod.untouched / mod.total) * 100,
                        background: "rgba(148, 163, 184, 0.5)",
                        title: `${mod.untouched} untouched (pre-existing English)`,
                    })
                }
                return (
                    <ModCard
                        key={mod.id}
                        id={mod.id}
                        title={highlightMatch(mod.name, searchQuery)}
                        idBadge={mod.id}
                        subtitle={<>by {highlightMatch(mod.author || "Unknown", searchQuery)}</>}
                        previewImageUrl={mod.preview_image ? `${API_BASE}${mod.preview_image}` : null}
                        progress={{
                            leftLabel: `${mod.percentage}% Translated`,
                            rightLabel: `${mod.translated} / ${mod.total} strings`,
                            segments,
                        }}
                        stats={[
                            { value: mod.untranslated, label: "Remaining" },
                            { value: mod.has_dll ? "DLL" : "CSV", label: "Format" },
                        ]}
                        badges={mod.has_changes ? <NeedsSyncBadge /> : undefined}
                        primaryAction={{
                            label: "View Strings",
                            variant: mod.untranslated > 0 ? "warning" : "primary",
                            onClick: () => onModSelect(mod.id),
                        }}
                        steamUrl={mod.url}
                        onSync={() => onModSync(mod.id)}
                    />
                )
            })}
        </div>
    )
}

export default ModGrid

import React from "react"
import ModCard from "../ModCard"
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
 * @param mods - The list of mod summaries to display as cards.
 * @param onModSelect - Callback invoked when the user clicks a mod card.
 * @param onModSync - Callback invoked when the user triggers a mod resync.
 * @param searchQuery - Optional search string for highlighting matched text.
 * @returns The rendered grid of mod cards.
 */
const ModGrid: React.FC<ModGridProps> = ({ mods, onModSelect, onModSync, searchQuery = "" }) => {
    return (
        <div className="mod-grid">
            {/* Each mod gets a unique key via mod.id so React can efficiently reconcile the list. */}
            {mods.map((mod) => (
                <ModCard key={mod.id} mod={mod} onClick={onModSelect} onSync={onModSync} searchQuery={searchQuery} />
            ))}
        </div>
    )
}

export default ModGrid

import React from "react"
import { VirtuosoGrid } from "react-virtuoso"
import ModCard from "./ModCard"
import type { ModStatus } from "../shared_types"

interface ModGridProps {
    mods: ModStatus[]
    onModSelect: (modId: string) => void
    onModSync: (modId: string) => void
}

/**
 * Grid component that displays a list of mods using virtualized scrolling.
 * @param mods - List of mods to display.
 * @param onModSelect - Callback when a mod is selected.
 * @param onModSync - Callback when a mod is synced.
 * @returns The rendered mod grid.
 */
const ModGrid: React.FC<ModGridProps> = ({ mods, onModSelect, onModSync }) => {
    // Use VirtuosoGrid for performance optimization.
    return (
        <VirtuosoGrid
            totalCount={mods.length}
            listClassName="mod-grid"
            itemContent={(index) => {
                const mod = mods[index]
                return <ModCard key={mod.id} mod={mod} onClick={onModSelect} onSync={onModSync} />
            }}
            useWindowScroll
        />
    )
}

export default ModGrid

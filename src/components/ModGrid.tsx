import React from "react"
import ModCard from "./ModCard"
import type { ModStatus } from "../shared_types"

interface ModGridProps {
    mods: ModStatus[]
    onModSelect: (modId: string) => void
    onModSync: (modId: string) => void
}

/**
 * Grid component that displays a list of mods.
 * @param mods - List of mods to display.
 * @param onModSelect - Callback when a mod is selected.
 * @param onModSync - Callback when a mod is synced.
 * @returns The rendered mod grid.
 */
const ModGrid: React.FC<ModGridProps> = ({ mods, onModSelect, onModSync }) => {
    return (
        <div className="mod-grid">
            {mods.map((mod) => (
                <ModCard key={mod.id} mod={mod} onClick={onModSelect} onSync={onModSync} />
            ))}
        </div>
    )
}

export default ModGrid

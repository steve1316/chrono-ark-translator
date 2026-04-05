import React from "react"
import ModGrid from "../../components/ModGrid"
import type { ModStatus } from "../../shared_types"

interface DashboardPageProps {
    mods: ModStatus[]
    onModSelect: (modId: string) => void
    onModSync: (modId: string) => void
    onRefresh: () => void
}

/**
 * The dashboard page displays a grid of all mods and their translation progress.
 * @param mods - The list of mods to display.
 * @param onModSelect - The callback function to handle mod selection.
 * @param onModSync - The callback function to handle mod sync.
 * @param onRefresh - The callback function to handle refresh.
 * @returns A React component that displays a grid of all mods and their translation progress.
 */
const DashboardPage: React.FC<DashboardPageProps> = ({ mods, onModSelect, onModSync, onRefresh }) => {
    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Workshop Dashboard</h1>
                    <p>Manage and translate your Chrono Ark mods</p>
                </div>
                <button className="btn btn-outline" onClick={onRefresh}>
                    Refresh
                </button>
            </div>
            <ModGrid mods={mods} onModSelect={onModSelect} onModSync={onModSync} />
        </>
    )
}

export default DashboardPage

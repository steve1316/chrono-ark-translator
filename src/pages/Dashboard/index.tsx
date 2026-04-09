import React, { useState, useMemo, useEffect, useRef } from "react"
import { FaSearch } from "react-icons/fa"
import ModGrid from "../../components/ModGrid"
import type { ModStatus } from "../../shared_types"

interface DashboardPageProps {
    mods: ModStatus[]
    onModSelect: (modId: string) => void
    onModSync: (modId: string) => void
    onRefresh: () => Promise<void> | void
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
    const [search, setSearch] = useState("")
    const [cardWidth, setCardWidth] = useState<number | undefined>(undefined)
    const [refreshing, setRefreshing] = useState(false)
    const gridWrapperRef = useRef<HTMLDivElement>(null)

    /**
     * Wraps the parent-provided onRefresh callback with local loading state
     * so the Refresh button shows a "Refreshing…" label and is disabled
     * while the (potentially slow) deep-refresh request is in flight.
     */
    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            await onRefresh()
        } finally {
            setRefreshing(false)
        }
    }

    const filteredMods = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return mods
        return mods.filter((mod) => mod.name.toLowerCase().includes(query) || (mod.author ?? "").toLowerCase().includes(query))
    }, [mods, search])

    // Observe the first mod card's width so the search bar can match it exactly.
    useEffect(() => {
        const wrapper = gridWrapperRef.current
        if (!wrapper) return

        const updateWidth = () => {
            const firstCard = wrapper.querySelector(".mod-card")
            if (firstCard) setCardWidth(firstCard.getBoundingClientRect().width)
        }

        updateWidth()
        const observer = new ResizeObserver(updateWidth)
        observer.observe(wrapper)
        return () => observer.disconnect()
    }, [filteredMods.length])

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Workshop Dashboard</h1>
                    <p>Manage and translate your Chrono Ark mods</p>
                </div>
                {/* Search bar width matches the mod-grid card column; Refresh sits beside it. */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ position: "relative", width: cardWidth ?? 320 }}>
                        <FaSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                        <input
                            type="text"
                            placeholder="Search by name or author..."
                            className="btn-outline"
                            style={{ width: "100%", padding: "0.75rem 0.75rem 0.75rem 2.5rem", borderRadius: "8px", background: "rgba(0,0,0,0.2)" }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-outline" onClick={handleRefresh} disabled={refreshing}>
                        {refreshing ? "Refreshing…" : "Refresh"}
                    </button>
                </div>
            </div>

            <div ref={gridWrapperRef}>
                <ModGrid mods={filteredMods} onModSelect={onModSelect} onModSync={onModSync} searchQuery={search.trim()} />
            </div>
        </>
    )
}

export default DashboardPage

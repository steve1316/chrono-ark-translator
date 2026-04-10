import React, { useState, useMemo, useEffect, useRef } from "react"
import { FaSearch } from "react-icons/fa"
import ModGrid from "../../components/ModGrid"
import EstimateTotalCostModal from "../../components/EstimateTotalCostModal"
import type { ModStatus } from "../../shared_types"
import { API_BASE } from "../../config"

interface DashboardPageProps {
    mods: ModStatus[]
    onModSelect: (modId: string) => void
    onModSync: (modId: string) => void
    onRefresh: (mods: ModStatus[]) => void
}

/**
 * The dashboard page displays a grid of all mods and their translation progress.
 * @param mods - The list of mods to display.
 * @param onModSelect - The callback function to handle mod selection.
 * @param onModSync - The callback function to handle mod sync.
 * @param onRefresh - Callback to update the parent mods state with fresh data.
 * @returns A React component that displays a grid of all mods and their translation progress.
 */
const DashboardPage: React.FC<DashboardPageProps> = ({ mods, onModSelect, onModSync, onRefresh }) => {
    const [search, setSearch] = useState("")
    const [cardWidth, setCardWidth] = useState<number | undefined>(undefined)
    const [refreshing, setRefreshing] = useState(false)
    const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; mod_name: string } | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    const gridWrapperRef = useRef<HTMLDivElement>(null)
    const [estimating, setEstimating] = useState(false)
    const [estimateProgress, setEstimateProgress] = useState<{ current: number; total: number; mod_name: string } | null>(null)
    const [estimateResults, setEstimateResults] = useState<
        {
            mod_id: string
            mod_name: string
            total_strings: number
            provider: string
            estimates: Record<string, { estimated_input_tokens: number; estimated_output_tokens: number; estimated_cost_usd: number; model: string; note: string }>
        }[]
    >([])
    const [showEstimateModal, setShowEstimateModal] = useState(false)
    const estimateAbortRef = useRef<AbortController | null>(null)

    // Abort any in-flight refresh when the component unmounts (page refresh / navigation).
    useEffect(() => {
        return () => {
            abortRef.current?.abort()
            estimateAbortRef.current?.abort()
        }
    }, [])

    /**
     * Deep-refreshes every mod by streaming progress from POST /api/mods/refresh.
     *
     * The endpoint re-extracts each mod's localization strings and recomputes
     * translated/total counts from scratch, emitting an SSE progress event per
     * mod (used to update the button label) and a final event with the complete
     * results list (forwarded to onRefresh to update App-level state).
     *
     * An AbortController is attached so the request is cancelled automatically
     * when the component unmounts (navigation / page refresh) or when the user
     * clicks Refresh again while a previous run is still in progress.
     */
    const handleRefresh = async () => {
        // Abort a previous refresh if one is still running.
        abortRef.current?.abort()

        const controller = new AbortController()
        abortRef.current = controller

        setRefreshing(true)
        setRefreshProgress(null)

        try {
            const res = await fetch(`${API_BASE}/mods/refresh`, {
                method: "POST",
                signal: controller.signal,
            })
            const reader = res.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) return

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const text = decoder.decode(value)
                for (const line of text.split("\n")) {
                    if (!line.startsWith("data: ")) continue
                    try {
                        const event = JSON.parse(line.slice(6))
                        if (event.done) {
                            onRefresh(event.results)
                        } else {
                            setRefreshProgress(event)
                        }
                    } catch {
                        /* skip malformed lines */
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                console.error("Failed to refresh mods:", err)
            }
        } finally {
            setRefreshing(false)
            setRefreshProgress(null)
            abortRef.current = null
        }
    }

    /**
     * Estimates translation costs for all mods by streaming progress from POST /api/translate/estimate-all.
     *
     * The endpoint computes token and cost estimates per mod for each configured
     * provider, emitting an SSE progress event per mod and a final done event.
     * Results are accumulated and shown in the EstimateTotalCostModal.
     *
     * An AbortController is attached so the request is cancelled automatically
     * when the component unmounts or when the handler is invoked again while a
     * previous run is still in progress.
     */
    const handleEstimate = async () => {
        estimateAbortRef.current?.abort()

        const controller = new AbortController()
        estimateAbortRef.current = controller

        setEstimating(true)
        setEstimateProgress(null)
        setEstimateResults([])

        try {
            const res = await fetch(`${API_BASE}/translate/estimate-all`, {
                method: "POST",
                signal: controller.signal,
            })
            const reader = res.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) return

            const accumulated: typeof estimateResults = []

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const text = decoder.decode(value)
                for (const line of text.split("\n")) {
                    if (!line.startsWith("data: ")) continue
                    try {
                        const event = JSON.parse(line.slice(6))
                        if (event.done) {
                            setShowEstimateModal(true)
                        } else {
                            accumulated.push({
                                mod_id: event.mod_id,
                                mod_name: event.mod_name,
                                total_strings: event.total_strings,
                                provider: event.provider,
                                estimates: event.estimates,
                            })
                            setEstimateResults([...accumulated])
                            setEstimateProgress({ current: event.current, total: event.total, mod_name: event.mod_name })
                        }
                    } catch {
                        /* skip malformed lines */
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                console.error("Failed to estimate costs:", err)
            }
        } finally {
            setEstimating(false)
            setEstimateProgress(null)
            estimateAbortRef.current = null
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
                        {refreshing && refreshProgress ? `Refreshing (${refreshProgress.current}/${refreshProgress.total})…` : refreshing ? "Refreshing…" : "Refresh"}
                    </button>
                    <button className="btn btn-outline" onClick={handleEstimate} disabled={estimating || refreshing}>
                        {estimating && estimateProgress ? `Estimating (${estimateProgress.current}/${estimateProgress.total})…` : estimating ? "Estimating…" : "Estimate Total Cost"}
                    </button>
                </div>
            </div>

            <div ref={gridWrapperRef}>
                <ModGrid mods={filteredMods} onModSelect={onModSelect} onModSync={onModSync} searchQuery={search.trim()} />
            </div>
            {showEstimateModal && <EstimateTotalCostModal results={estimateResults} onClose={() => setShowEstimateModal(false)} />}
        </>
    )
}

export default DashboardPage

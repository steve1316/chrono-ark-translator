import React, { useState, useMemo, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { FaSearch } from "react-icons/fa"
import ModGrid from "../../../../components/ModGrid"
import EstimateTotalCostModal from "../../../../components/EstimateTotalCostModal"
import type { ModStatus } from "../../../../shared_types"
import { gameApi } from "../../../../api/games"
import { filterMods } from "../../../../utils/modFilters"

/**
 * The dashboard page displays a grid of all mods and their translation progress.
 *
 * Fetches its own mod list from the Chrono Ark game API on mount, re-fetches
 * after any per-mod sync, and navigates to the detail page on selection.
 *
 * @returns A React component that displays a grid of all mods and their translation progress.
 */
const DashboardPage: React.FC = () => {
    const navigate = useNavigate()
    const [mods, setMods] = useState<ModStatus[]>([])
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

    /**
     * Fetches the list of all mods from the Chrono Ark game API.
     *
     * Hits `GET /api/games/chrono_ark/mods` and replaces local state with the
     * returned array of `ModStatus` objects. Errors are logged but do not
     * surface to the UI; the existing list is preserved on failure.
     */
    const fetchMods = async () => {
        try {
            const res = await gameApi("chrono_ark").get("/mods")
            const data = await res.json()
            setMods(data)
        } catch (err) {
            console.error("Failed to fetch mods:", err)
        }
    }

    // Fetch mods on first mount.
    useEffect(() => {
        fetchMods()
    }, [])

    /**
     * Rescans a mod's workshop folder on disk and updates the backend database.
     *
     * Hits `POST /api/games/chrono_ark/mods/{modId}/sync`. After a successful
     * sync the mod list is re-fetched so the dashboard reflects any newly
     * discovered or removed localization strings.
     *
     * Args:
     *     modId: The unique identifier of the mod to sync.
     */
    const handleModSync = async (modId: string) => {
        try {
            await gameApi("chrono_ark").post(`/mods/${modId}/sync`)
            fetchMods()
        } catch (err) {
            console.error("Failed to sync mod:", err)
        }
    }

    // Abort any in-flight refresh when the component unmounts (page refresh / navigation).
    useEffect(() => {
        return () => {
            abortRef.current?.abort()
            estimateAbortRef.current?.abort()
        }
    }, [])

    /**
     * Deep-refreshes every mod by streaming progress from POST `/api/games/chrono_ark/mods/refresh`.
     *
     * The endpoint re-extracts each mod's localization strings and recomputes
     * translated/total counts from scratch, emitting an SSE progress event per
     * mod (used to update the button label) and a final event with the complete
     * results list (which replaces local mod state).
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
            const res = await gameApi("chrono_ark").post("/mods/refresh", undefined, { signal: controller.signal })
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
                            setMods(event.results)
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
     * Estimates translation costs for all mods by streaming progress from POST `/api/games/chrono_ark/translate/estimate-all`.
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
            const res = await gameApi("chrono_ark").post("/translate/estimate-all", undefined, { signal: controller.signal })
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

    const filteredMods = useMemo(() => filterMods(mods, search), [mods, search])

    // Scroll to the mod card the user was last viewing when returning from the detail page.
    useEffect(() => {
        const lastMod = sessionStorage.getItem("lastViewedMod")
        if (!lastMod) return
        sessionStorage.removeItem("lastViewedMod")
        requestAnimationFrame(() => {
            const card = document.querySelector(`[data-mod-id="${lastMod}"]`)
            card?.scrollIntoView({ behavior: "instant", block: "center" })
        })
    }, [filteredMods])

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

    /**
     * Remembers the selected mod for the dashboard scroll-restore effect, then
     * routes to the mod detail page.
     *
     * Args:
     *     modId: The unique identifier of the mod the user clicked.
     */
    const handleModSelect = (modId: string) => {
        sessionStorage.setItem("lastViewedMod", modId)
        navigate(`/mods/${modId}`)
    }

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
                <ModGrid mods={filteredMods} onModSelect={handleModSelect} onModSync={handleModSync} searchQuery={search.trim()} />
            </div>
            {showEstimateModal && <EstimateTotalCostModal results={estimateResults} onClose={() => setShowEstimateModal(false)} />}
        </>
    )
}

export default DashboardPage

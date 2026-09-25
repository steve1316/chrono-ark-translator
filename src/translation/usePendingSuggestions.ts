import { useCallback, useEffect, useState } from "react"

import { gameApi } from "../api/games"
import type { TermSuggestion } from "../shared_types"

/** A result message for the page's feedback banner. */
export interface SuggestionsBanner {
    /** Banner tone. */
    type: "success" | "error"
    /** Banner text. */
    message: string
}

/** What `usePendingSuggestions` returns. */
export interface PendingSuggestions {
    /** Pending glossary term suggestions for the mod. */
    suggestions: TermSuggestion[]
    /** Re-fetches the pending list. */
    refresh: () => Promise<void>
    /** Scans the mod for new terms, refreshes the list, and reports the result through the banner callback. */
    scan: () => Promise<void>
    /** True while a scan is running. */
    scanning: boolean
}

/**
 * Pending glossary suggestions for one mod, shared by every game's translation page. Loads the list on mount and runs the Scan for Terms flow.
 *
 * @param gameId Backend game id, e.g. "chrono_ark".
 * @param modId The mod's id.
 * @param onBanner Receives the scan result or error for the page banner.
 * @returns The list, a refresh function, the scan action, and the scanning flag.
 */
export function usePendingSuggestions(gameId: string, modId: string, onBanner: (banner: SuggestionsBanner) => void): PendingSuggestions {
    const [suggestions, setSuggestions] = useState<TermSuggestion[]>([])
    const [scanning, setScanning] = useState(false)

    const refresh = useCallback(async () => {
        if (!modId) return
        try {
            const res = await gameApi(gameId).get(`/mods/${modId}/glossary/suggestions`)
            if (!res.ok) return
            const data = await res.json()
            setSuggestions(Array.isArray(data) ? data : [])
        } catch {
            /* keep the last known list */
        }
    }, [gameId, modId])

    useEffect(() => {
        refresh()
    }, [refresh])

    const scan = useCallback(async () => {
        setScanning(true)
        try {
            const res = await gameApi(gameId).post(`/mods/${modId}/glossary/suggestions/scan`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                onBanner({ type: "error", message: `Scan failed: ${data.detail || res.statusText || "Unknown error"}` })
                return
            }
            if (data.new > 0) {
                await refresh()
                onBanner({ type: "success", message: `Found ${data.new} new glossary term suggestion(s).` })
            } else {
                onBanner({ type: "success", message: "No new glossary terms found." })
            }
        } catch (err) {
            onBanner({ type: "error", message: `Scan failed: ${(err as Error).message}` })
        } finally {
            setScanning(false)
        }
    }, [gameId, modId, onBanner, refresh])

    return { suggestions, refresh, scan, scanning }
}

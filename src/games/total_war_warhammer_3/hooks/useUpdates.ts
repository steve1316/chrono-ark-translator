import { useEffect, useState } from "react"
import { fetchUpdates, syncUpdates, RegistryError, type UpdateReport } from "../api"

const INTERVAL_MS = 5000

let latestReport: UpdateReport | null = null
let latestError: RegistryError | null = null
let intervalId: number | null = null

/** Snapshot broadcast to every subscriber on each tick. */
interface Snapshot {
    /** Latest report from the backend, or `null` before the first successful fetch. */
    report: UpdateReport | null
    /** Set when the most recent fetch failed; `null` after a successful fetch. */
    error: RegistryError | null
}

const subscribers = new Set<(snap: Snapshot) => void>()

const broadcast = () => {
    const snap: Snapshot = { report: latestReport, error: latestError }
    subscribers.forEach((cb) => cb(snap))
}

const tick = async (): Promise<void> => {
    try {
        latestReport = await fetchUpdates()
        latestError = null
    } catch (err) {
        if (err instanceof RegistryError) {
            latestError = err
        } else {
            // Network errors, JSON parse failures, etc. surface as a synthetic RegistryError
            // so the UI flips out of loading state and can render a banner.
            const detail = err instanceof Error ? err.message : "Unknown error during updates fetch"
            latestError = new RegistryError(0, detail, null)
        }
        // Preserve latestReport on failure so the UI keeps its last-known good data.
    }
    broadcast()
}

const startPolling = () => {
    if (intervalId !== null) return
    tick()
    intervalId = window.setInterval(tick, INTERVAL_MS)
}

const stopPolling = () => {
    if (intervalId === null) return
    window.clearInterval(intervalId)
    intervalId = null
}

/** Return shape of `useUpdates`. */
interface UseUpdatesResult {
    /** Latest report from the backend, or `null` before first fetch. */
    report: UpdateReport | null
    /** True between subscribe and first response (i.e. no data and no error yet). */
    loading: boolean
    /** Set when the most recent fetch failed; cleared on the next success. */
    error: RegistryError | null
    /** Trigger an immediate out-of-band poll and broadcast the result to all subscribers.
     *  Resolves when the broadcast completes. */
    refresh: () => Promise<void>
    /** POST /updates/sync, then immediately broadcast the fresh report. Resolves when both complete. */
    sync: () => Promise<void>
}

/**
 * Returns the latest TW3 mod update report. The poll is shared across all callers via a
 * module-level subscriber set, so multiple mounted hooks produce only one request per `INTERVAL_MS`.
 *
 * @returns Object with `report`, `loading`, `error`, a `refresh` callback, and a `sync` callback.
 */
export function useUpdates(): UseUpdatesResult {
    const [snap, setSnap] = useState<Snapshot>({ report: latestReport, error: latestError })

    useEffect(() => {
        subscribers.add(setSnap)
        if (subscribers.size === 1) startPolling()
        // Push the latest known state into this subscriber on subscribe so it does not have to wait
        // up to INTERVAL_MS for the first update.
        setSnap({ report: latestReport, error: latestError })
        return () => {
            subscribers.delete(setSnap)
            if (subscribers.size === 0) stopPolling()
        }
    }, [])

    const sync = async (): Promise<void> => {
        try {
            await syncUpdates()
        } finally {
            await tick()
        }
    }

    return {
        report: snap.report,
        error: snap.error,
        loading: snap.report === null && snap.error === null,
        refresh: tick,
        sync,
    }
}

/** Test-only: reset the module singleton between tests. */
export function _resetUseUpdatesForTests() {
    stopPolling()
    subscribers.clear()
    latestReport = null
    latestError = null
}

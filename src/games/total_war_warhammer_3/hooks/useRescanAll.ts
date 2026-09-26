import { useCallback, useEffect, useRef, useState } from "react"

import type { TaskProgress } from "../../../dashboard/progressLabel"
import type { WH3RescanSummary } from "../../../shared_types"
import { rescanMod } from "../translationApi"

/** State and actions returned by `useRescanAll`. */
export interface RescanAll {
    /** Latest rescan result per workshop id. Missing until that mod has been scanned this session. */
    progressByMod: Record<string, WH3RescanSummary | null>
    /** Position in the running batch, or null while idle. */
    progress: TaskProgress | null
    /** True while a batch is running. */
    running: boolean
    /** Rescans the given mods one at a time, cancelling any batch already running. */
    rescanAll: (ids: string[]) => Promise<void>
    /** Rescans one mod outside any batch, e.g. from a card's rescan button. A failure leaves its card as it was. */
    rescanOne: (id: string) => Promise<void>
}

/**
 * Rescans WH3 translation mods one at a time so the dashboard can show "n / total". A new batch cancels the one already running, and
 * leaving the page cancels the batch so no rescans keep running in the background.
 *
 * @returns Per-mod results, batch progress and the rescan actions.
 */
export function useRescanAll(): RescanAll {
    const [progressByMod, setProgressByMod] = useState<Record<string, WH3RescanSummary | null>>({})
    const [progress, setProgress] = useState<TaskProgress | null>(null)
    const [running, setRunning] = useState(false)
    const controllerRef = useRef<AbortController | null>(null)
    const unmountedRef = useRef(false)

    useEffect(() => {
        unmountedRef.current = false
        return () => {
            unmountedRef.current = true
            controllerRef.current?.abort()
        }
    }, [])

    const rescanAll = useCallback(async (ids: string[]) => {
        if (unmountedRef.current) return
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setRunning(true)

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i]
            setProgress({ current: i + 1, total: ids.length })
            try {
                const summary = await rescanMod(id, controller.signal)
                if (controller.signal.aborted) return
                setProgressByMod((prev) => ({ ...prev, [id]: summary }))
            } catch {
                if (controller.signal.aborted) return
                // A failed rescan leaves that card on its previous result. The rest of the batch still runs.
            }
        }

        controllerRef.current = null
        setRunning(false)
        setProgress(null)
    }, [])

    const rescanOne = useCallback(async (id: string) => {
        try {
            const summary = await rescanMod(id)
            if (!unmountedRef.current) setProgressByMod((prev) => ({ ...prev, [id]: summary }))
        } catch {
            // The card keeps its previous result.
        }
    }, [])

    return { progressByMod, progress, running, rescanAll, rescanOne }
}

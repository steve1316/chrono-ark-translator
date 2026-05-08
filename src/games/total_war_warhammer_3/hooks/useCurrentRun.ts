import { useEffect, useState } from "react"
import type { RunState } from "../api"
import { getCurrentRun } from "../api"

/**
 * Polls `GET /run` every `intervalMs` ms (default 2000) and returns the latest state.
 *
 * @param intervalMs Polling interval in milliseconds.
 * @returns The latest known run state. Defaults to `{status: "idle"}` until the first poll completes.
 */
export function useCurrentRun(intervalMs: number = 2000): RunState {
    const [state, setState] = useState<RunState>({ status: "idle" })

    useEffect(() => {
        let cancelled = false
        const tick = async () => {
            try {
                const next = await getCurrentRun()
                if (!cancelled) setState(next)
            } catch {
                if (!cancelled) setState({ status: "idle" })
            }
        }
        tick()
        const id = window.setInterval(tick, intervalMs)
        return () => {
            cancelled = true
            window.clearInterval(id)
        }
    }, [intervalMs])

    return state
}

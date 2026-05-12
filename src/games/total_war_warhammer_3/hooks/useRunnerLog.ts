import { useEffect, useState } from "react"

/** A discriminated union of entries shown in the Runner terminal. */
export type LogEntry =
    | {
          /** Discriminator for streamed stdout lines. */
          kind: "data"
          /** Raw stdout line. */
          line: string
          /** ISO timestamp when the backend emitted the line. */
          ts: string
      }
    | {
          /** Discriminator for run-boundary separator lines (start/end). */
          kind: "separator"
          /** Human-readable text rendered inline (e.g. "--- Starting <label> at <time> ---"). */
          text: string
      }

/** Maximum entries retained in the shared singleton. Older entries are dropped FIFO. */
export const MAX_LINES = 5000

let _lines: LogEntry[] = []
const subscribers = new Set<(lines: LogEntry[]) => void>()

function notify() {
    for (const sub of subscribers) sub(_lines)
}

/**
 * Append one entry to the shared log. Trims to `MAX_LINES` and notifies all subscribers.
 *
 * @param entry Entry to append.
 */
export function appendLine(entry: LogEntry) {
    _lines = [..._lines, entry].slice(-MAX_LINES)
    notify()
}

/** Empty the shared log and notify all subscribers. */
export function clearLog() {
    _lines = []
    notify()
}

/**
 * Subscribe to the shared runner log. State is held in a module-level singleton so navigating away from the Runner page and back keeps the buffer intact.
 *
 * @returns The current `LogEntry[]`. Re-renders the consumer when `appendLine` or `clearLog` are called.
 */
export function useRunnerLog(): LogEntry[] {
    const [state, setState] = useState<LogEntry[]>(_lines)
    useEffect(() => {
        subscribers.add(setState)
        setState(_lines)
        return () => {
            subscribers.delete(setState)
        }
    }, [])
    return state
}

/** Test-only: reset the module singleton between tests. */
export function _resetUseRunnerLogForTests() {
    _lines = []
    subscribers.clear()
}

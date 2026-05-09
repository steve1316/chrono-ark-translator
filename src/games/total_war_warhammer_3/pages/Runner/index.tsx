import { useEffect, useRef, useState } from "react"
import { cancelRun, getCurrentRun, runStreamUrl, startRun } from "../../api"
import type { RunState } from "../../api"
import { useCurrentRun } from "../../hooks/useCurrentRun"

const SCRIPTS: { id: string; label: string }[] = [
    { id: "update_dynamic_rors", label: "Dynamic RoR (default)" },
    { id: "update_dynamic_rors_vanilla", label: "Dynamic RoR (--vanilla)" },
    { id: "update_double_unit_size", label: "2x Unit Size" },
    { id: "update_modified_attribute_mods", label: "Modified Attributes (3 packs)" },
    { id: "process_main_units_tables", label: "Land Encounters" },
    { id: "update", label: "Update" },
]

/** A single line of streamed stdout from the active run. */
interface LogLine {
    /** The text content of the log line. */
    line: string
    /** ISO timestamp of when the line was emitted. */
    ts: string
}

/** Payload delivered on the SSE "done" event when a run finishes. */
interface DoneEvent {
    /** Process exit code, or null if the process was killed. */
    exit_code: number | null
    /** Total wall-clock seconds the run took, or null if unavailable. */
    duration_seconds: number | null
}

/**
 * TW3 Runner page: starts helper_scripts/update_*.py via subprocess and streams
 * the live stdout via SSE. Single-run-at-a-time; cancel via DELETE.
 *
 * @returns A button grid in idle state, or a live log + cancel button when a run is in flight.
 */
export default function RunnerPage() {
    const polledRun = useCurrentRun()
    const [localRun, setLocalRun] = useState<RunState | null>(null)
    const run = localRun ?? polledRun
    const [lines, setLines] = useState<LogLine[]>([])
    const [doneInfo, setDoneInfo] = useState<{ scriptId: string; info: DoneEvent } | null>(null)
    const sourceRef = useRef<EventSource | null>(null)
    // Tracks whether polledRun has been updated at least once since localRun was set.
    const polledAfterLocalSet = useRef(false)

    // Mark that a fresh poll response has arrived whenever polledRun changes.
    useEffect(() => {
        polledAfterLocalSet.current = true
    }, [polledRun])

    // Keep localRun in sync: once the poll catches up, clear the override.
    useEffect(() => {
        if (localRun && polledAfterLocalSet.current) setLocalRun(null)
    }, [polledRun, localRun])

    useEffect(() => {
        if (run.status !== "running") {
            sourceRef.current?.close()
            sourceRef.current = null
            return
        }
        if (sourceRef.current) return // already attached

        const es = new EventSource(runStreamUrl())
        sourceRef.current = es
        setLines([])
        setDoneInfo(null)

        es.onmessage = (evt) => {
            try {
                const payload = JSON.parse(evt.data) as LogLine
                setLines((prev) => [...prev, payload])
            } catch {
                /* ignore malformed lines */
            }
        }
        es.addEventListener("done", (evt) => {
            try {
                const info = JSON.parse((evt as MessageEvent).data) as DoneEvent
                setDoneInfo({ scriptId: run.status === "running" ? run.script_id : "", info })
            } catch {
                /* ignore */
            }
            es.close()
            sourceRef.current = null
        })
        return () => {
            es.close()
            sourceRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run.status, run.status === "running" ? run.run_id : null])

    const handleStart = async (scriptId: string) => {
        try {
            await startRun(scriptId)
            // Immediately refresh state so the UI switches to log view without waiting for the next poll.
            const next = await getCurrentRun()
            polledAfterLocalSet.current = false
            setLocalRun(next)
        } catch (err) {
            console.error("Failed to start run", err)
        }
    }

    if (run.status === "running") {
        return (
            <>
                <div className="dashboard-header">
                    <div className="title-group">
                        <h1>Running: {run.script_id}</h1>
                        <p>Started at {new Date(run.started_at).toLocaleTimeString()}</p>
                    </div>
                    <button className="btn btn-outline" onClick={cancelRun}>
                        Cancel
                    </button>
                </div>
                <pre style={{ maxHeight: 600, overflowY: "auto", padding: "1rem", background: "rgba(0,0,0,0.3)", fontFamily: "monospace" }}>
                    {lines.map((l, i) => (
                        <div key={i}>{l.line}</div>
                    ))}
                </pre>
            </>
        )
    }

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Runner</h1>
                    <p>Run any of the helper_scripts/update_*.py scripts.</p>
                </div>
            </div>
            {doneInfo && (
                <div className="glass-card" style={{ padding: "1rem", marginBottom: "0.75rem" }}>
                    Last run: {doneInfo.scriptId} exited with code {doneInfo.info.exit_code} in {doneInfo.info.duration_seconds?.toFixed(0)}s.
                </div>
            )}
            <div className="mod-grid">
                {SCRIPTS.map((s) => (
                    <button key={s.id} className="btn btn-primary" onClick={() => handleStart(s.id)}>
                        {s.label}
                    </button>
                ))}
            </div>
        </>
    )
}

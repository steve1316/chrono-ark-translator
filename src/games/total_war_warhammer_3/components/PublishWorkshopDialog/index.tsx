import { useEffect, useRef, useState } from "react"
import { publishPack, publishStreamUrl, RegistryError } from "../../api"

/** Props for PublishWorkshopDialog. */
interface PublishWorkshopDialogProps {
    /** Numeric Steam Workshop item id of the pack being published. */
    workshopId: string
    /** Display title of the pack, shown in the dialog header. */
    title: string
    /** Called when the user dismisses the dialog. */
    onClose: () => void
}

/** One line of streamed SteamCMD output. */
interface LogEntry {
    /** Sequence number used for React keys. */
    seq: number
    /** The raw stdout line from SteamCMD, or a synthesised status line. */
    line: string
    /** When true, the line is a status message rendered with dimmed italic styling. */
    status?: boolean
}

/** Lifecycle of the publish dialog. */
type Phase = "idle" | "publishing" | "done" | "error"

/**
 * Modal dialog for pushing a TW3 compat pack update to the Steam Workshop. Collects a changenote, calls the backend `publishPack` endpoint, then opens an `EventSource` to the publish stream and renders each SteamCMD stdout line in a terminal-styled log panel until the run completes. Reuses the styling pattern of `ConfirmModal` and `RunnerLogTerminal`.
 *
 * @param workshopId Numeric Steam Workshop item id of the pack being published.
 * @param title Display title of the pack, shown in the dialog header.
 * @param onClose Called when the user dismisses the dialog.
 * @returns The rendered modal overlay.
 */
const PublishWorkshopDialog = ({ workshopId, title, onClose }: PublishWorkshopDialogProps) => {
    const [changenote, setChangenote] = useState("")
    const [phase, setPhase] = useState<Phase>("idle")
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [exitCode, setExitCode] = useState<number | null>(null)
    const [log, setLog] = useState<LogEntry[]>([])
    const seqRef = useRef(0)
    const sourceRef = useRef<EventSource | null>(null)
    const scrollRef = useRef<HTMLPreElement | null>(null)

    const append = (line: string, status = false) => {
        seqRef.current += 1
        setLog((prev) => [...prev, { seq: seqRef.current, line, status }])
    }

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [log.length])

    useEffect(() => {
        return () => {
            sourceRef.current?.close()
            sourceRef.current = null
        }
    }, [])

    const handlePublish = async () => {
        setPhase("publishing")
        setErrorMessage(null)
        setExitCode(null)
        setLog([])
        seqRef.current = 0
        append(`Spawning SteamCMD for workshop item ${workshopId}...`, true)

        try {
            await publishPack(workshopId, changenote)
        } catch (err) {
            const reg = err as RegistryError
            if (reg.status === 400 && reg.missing && reg.missing.length > 0) {
                setErrorMessage(`Steam is not configured. Missing: ${reg.missing.join(", ")}. Open Settings -> Steam Account to fix this.`)
            } else if (reg.status === 409) {
                setErrorMessage("Another publish is already in progress. Wait for it to finish, then try again.")
            } else if (reg.status === 404) {
                setErrorMessage("The local workshop folder for this pack was not found. Check that the Steam library drive is correct in Settings.")
            } else {
                setErrorMessage(reg.detail || "Failed to start publish.")
            }
            setPhase("error")
            return
        }

        const es = new EventSource(publishStreamUrl(workshopId))
        sourceRef.current = es

        es.onmessage = (evt) => {
            try {
                const payload = JSON.parse(evt.data) as { line: string; ts: string }
                append(payload.line)
            } catch {
                /* ignore malformed lines */
            }
        }
        es.addEventListener("done", (evt) => {
            try {
                const info = JSON.parse((evt as MessageEvent).data) as { exit_code: number | null; duration_seconds: number | null }
                setExitCode(info.exit_code)
                const duration = info.duration_seconds != null ? `${info.duration_seconds.toFixed(1)}s` : "unknown time"
                append(`--- SteamCMD exited with code ${info.exit_code} in ${duration} ---`, true)
            } catch {
                /* ignore */
            }
            es.close()
            sourceRef.current = null
            setPhase("done")
        })
        es.onerror = () => {
            es.close()
            sourceRef.current = null
            append("--- Stream connection lost ---", true)
            setPhase("done")
        }
    }

    const isPublishing = phase === "publishing"
    const showLog = log.length > 0
    const success = phase === "done" && exitCode === 0

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                zIndex: 1000,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !isPublishing) onClose()
            }}
        >
            <div className="glass-card" style={{ width: "640px", maxWidth: "90vw", maxHeight: "85vh", overflow: "auto", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <h2 style={{ margin: 0 }}>Publish "{title}" to Workshop</h2>
                    <button
                        onClick={onClose}
                        disabled={isPublishing}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            fontSize: "2rem",
                            lineHeight: 1,
                            cursor: isPublishing ? "not-allowed" : "pointer",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            opacity: isPublishing ? 0.4 : 1,
                        }}
                        title={isPublishing ? "Publish in progress" : "Close"}
                    >
                        &times;
                    </button>
                </div>

                <p style={{ color: "var(--text-dim)", marginTop: 0, marginBottom: "1rem", lineHeight: 1.5 }}>
                    Pushes the local workshop folder for item <code>{workshopId}</code> to Steam as an update. Existing title, description, visibility, tags, and preview are preserved.
                </p>

                <label style={{ display: "block", marginBottom: "1rem" }}>
                    <span style={{ display: "block", marginBottom: "0.4rem", color: "var(--text-main)" }}>Changenote (shown in the Workshop changelog)</span>
                    <textarea
                        value={changenote}
                        onChange={(e) => setChangenote(e.target.value)}
                        disabled={phase !== "idle" && phase !== "error"}
                        rows={3}
                        style={{
                            width: "100%",
                            padding: "0.5rem",
                            background: "rgba(0,0,0,0.25)",
                            color: "var(--text-main)",
                            border: "1px solid var(--border-dim, rgba(255,255,255,0.15))",
                            borderRadius: 6,
                            fontFamily: "inherit",
                            fontSize: "0.9rem",
                            resize: "vertical",
                            boxSizing: "border-box",
                        }}
                        placeholder="e.g. Resync against latest game patch"
                    />
                </label>

                {errorMessage && (
                    <div
                        style={{
                            padding: "0.75rem 1rem",
                            marginBottom: "1rem",
                            background: "rgba(239,68,68,0.15)",
                            color: "#ff8a8a",
                            border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: 6,
                            lineHeight: 1.4,
                        }}
                    >
                        {errorMessage}
                    </div>
                )}

                {showLog && (
                    <pre
                        ref={scrollRef}
                        style={{
                            margin: "0 0 1rem 0",
                            padding: "0.75rem",
                            background: "rgba(0,0,0,0.3)",
                            borderRadius: 6,
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                            maxHeight: 320,
                            overflowY: "auto",
                            whiteSpace: "pre-wrap",
                            color: "var(--text-main)",
                        }}
                    >
                        {log.map((entry) =>
                            entry.status ? (
                                <div key={entry.seq} style={{ color: "var(--text-dim, #777)", fontStyle: "italic", margin: "0.25rem 0" }}>
                                    {entry.line}
                                </div>
                            ) : (
                                <div key={entry.seq}>{entry.line}</div>
                            )
                        )}
                    </pre>
                )}

                {phase === "done" && (
                    <div style={{ marginBottom: "1rem", color: success ? "#7ee787" : "#ff8a8a", fontWeight: 600 }}>
                        {success ? "Publish succeeded." : `Publish failed (exit code ${exitCode}). Review the log above and your Steam Guard / sentry status.`}
                    </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                    {phase === "done" || phase === "error" ? (
                        <button className="btn btn-primary" onClick={onClose}>
                            Close
                        </button>
                    ) : (
                        <>
                            <button className="btn btn-outline" onClick={onClose} disabled={isPublishing}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handlePublish} disabled={isPublishing}>
                                {isPublishing ? "Publishing..." : "Publish"}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PublishWorkshopDialog

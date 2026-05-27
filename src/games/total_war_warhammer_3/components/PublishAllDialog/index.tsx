import { useEffect, useMemo, useRef, useState } from "react"

import { BatchPublishHandle, BatchPublishItem, publishAllPacks, publishAllStreamUrl, RegistryError } from "../../api"

/** One pack entry as the Dashboard hands them in. */
interface PackEntry {
    /** Display name of the mod. */
    title: string
    /** Numeric Steam Workshop item id. Empty values are treated as "skipped" and never sent to the backend. */
    workshopId: string
    /** Optional script id used by the per-mod rebuild button. Unused here but accepted so the Dashboard can pass the array as-is. */
    scriptId?: string
    /** Optional explanatory note carried from the Dashboard. Unused in this dialog but accepted for the same reason. */
    sharedNote?: string
}

/** Props for PublishAllDialog. */
interface PublishAllDialogProps {
    /** Pack entries to consider for the batch. Empty-workshopId entries appear in the dialog as pre-skipped. */
    packs: PackEntry[]
    /** Called when the user dismisses the dialog. */
    onClose: () => void
}

/** Per-mod lifecycle status mirrored from the backend orchestrator. */
type ModStatus = "pending" | "publishing" | "done" | "failed" | "skipped"

/** Three-phase lifecycle: pre-batch confirmation, in-flight, all-done summary. */
type Phase = "confirming" | "running" | "done"

/** One row in the per-mod status list rendered while a batch is running. */
interface ModRow {
    workshopId: string
    title: string
    status: ModStatus
    exitCode: number | null
    error: string | null
    durationSeconds: number | null
    reason: string | null
}

/** One line of streamed SteamCMD output, scoped to the mod that emitted it. */
interface LogEntry {
    seq: number
    workshopId: string
    line: string
}

/**
 * Modal dialog that batches a single changelog across many Workshop publishes. The user enters one changelog, confirms
 * the eligible mod list, and clicks Publish All. The dialog POSTs `/packs/publish-all`, opens an SSE stream against the
 * returned `batch_id`, and surfaces per-mod status badges plus a live SteamCMD log for the currently uploading mod.
 *
 * @param packs Pack entries to consider. Empty-workshopId entries are pre-marked as skipped.
 * @param onClose Called when the user dismisses the dialog.
 * @returns The rendered modal overlay.
 */
const PublishAllDialog = ({ packs, onClose }: PublishAllDialogProps) => {
    const [changenote, setChangenote] = useState("")
    const [phase, setPhase] = useState<Phase>("confirming")
    const [rows, setRows] = useState<ModRow[]>(() =>
        packs.map((p) => ({
            workshopId: p.workshopId,
            title: p.title,
            status: p.workshopId ? "pending" : "skipped",
            exitCode: null,
            error: null,
            durationSeconds: null,
            reason: p.workshopId ? null : "no workshopId",
        }))
    )
    const [currentId, setCurrentId] = useState<string | null>(null)
    const [currentLog, setCurrentLog] = useState<LogEntry[]>([])
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const seqRef = useRef(0)
    const sourceRef = useRef<EventSource | null>(null)
    const scrollRef = useRef<HTMLPreElement | null>(null)

    const eligible = useMemo(() => rows.filter((r) => r.status !== "skipped"), [rows])
    const isRunning = phase === "running"
    const isDone = phase === "done"

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [currentLog.length])

    useEffect(() => {
        return () => {
            sourceRef.current?.close()
            sourceRef.current = null
        }
    }, [])

    const updateRow = (workshopId: string, patch: Partial<ModRow>) => {
        setRows((prev) => prev.map((r) => (r.workshopId === workshopId ? { ...r, ...patch } : r)))
    }

    const subscribeToBatch = (batchId: string) => {
        const es = new EventSource(publishAllStreamUrl(batchId))
        sourceRef.current = es

        es.addEventListener("mod_started", (evt) => {
            try {
                const payload = JSON.parse((evt as MessageEvent).data) as { workshop_id: string; title: string }
                setCurrentId(payload.workshop_id)
                setCurrentLog([])
                seqRef.current = 0
                updateRow(payload.workshop_id, { status: "publishing", error: null })
            } catch {
                /* ignore */
            }
        })

        es.addEventListener("log_line", (evt) => {
            try {
                const payload = JSON.parse((evt as MessageEvent).data) as { workshop_id: string; line: string }
                seqRef.current += 1
                setCurrentLog((prev) => [...prev, { seq: seqRef.current, workshopId: payload.workshop_id, line: payload.line }])
            } catch {
                /* ignore */
            }
        })

        es.addEventListener("mod_finished", (evt) => {
            try {
                const payload = JSON.parse((evt as MessageEvent).data) as {
                    workshop_id: string
                    exit_code: number | null
                    duration_seconds: number | null
                    status: "done" | "failed"
                    error: string | null
                }
                updateRow(payload.workshop_id, {
                    status: payload.status,
                    exitCode: payload.exit_code,
                    durationSeconds: payload.duration_seconds,
                    error: payload.error,
                })
            } catch {
                /* ignore */
            }
        })

        es.addEventListener("mod_skipped", (evt) => {
            try {
                const payload = JSON.parse((evt as MessageEvent).data) as { workshop_id: string; reason: string }
                updateRow(payload.workshop_id, { status: "skipped", reason: payload.reason })
            } catch {
                /* ignore */
            }
        })

        es.addEventListener("batch_done", () => {
            es.close()
            sourceRef.current = null
            setPhase("done")
            setCurrentId(null)
        })

        es.onerror = () => {
            es.close()
            sourceRef.current = null
            setPhase("done")
            setErrorMessage("Stream connection lost. The backend may still be publishing - refresh and reopen to reconnect.")
        }
    }

    const handlePublishAll = async () => {
        if (changenote.trim().length === 0 || eligible.length === 0) return
        setErrorMessage(null)

        const items: BatchPublishItem[] = eligible.map((r) => ({ workshop_id: r.workshopId, title: r.title }))

        let handle: BatchPublishHandle
        try {
            handle = await publishAllPacks(changenote, items)
        } catch (err) {
            const reg = err as RegistryError
            if (reg.status === 409) {
                setErrorMessage("Another publish is already in progress. Wait for it to finish, then try again.")
            } else if (reg.status === 400) {
                setErrorMessage(reg.detail || "Backend rejected the request.")
            } else {
                setErrorMessage(reg.detail || "Failed to start the batch publish.")
            }
            return
        }

        setPhase("running")
        try {
            localStorage.setItem("wh3-publish-all-active-batch", handle.batch_id)
        } catch {
            /* ignore quota / disabled storage */
        }
        subscribeToBatch(handle.batch_id)
    }

    const handleClose = () => {
        if (isRunning) return
        try {
            localStorage.removeItem("wh3-publish-all-active-batch")
        } catch {
            /* ignore */
        }
        onClose()
    }

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
                if (e.target === e.currentTarget && !isRunning) handleClose()
            }}
        >
            <div className="glass-card" style={{ width: "720px", maxWidth: "92vw", maxHeight: "88vh", overflow: "auto", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <h2 style={{ margin: 0 }}>Publish All to Workshop</h2>
                    <button
                        onClick={handleClose}
                        disabled={isRunning}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            fontSize: "2rem",
                            lineHeight: 1,
                            cursor: isRunning ? "not-allowed" : "pointer",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                            opacity: isRunning ? 0.4 : 1,
                        }}
                        title={isRunning ? "Batch publish in progress" : "Close"}
                    >
                        &times;
                    </button>
                </div>

                <label style={{ display: "block", marginBottom: "1rem" }}>
                    <span style={{ display: "block", marginBottom: "0.4rem", color: "var(--text-main)" }}>Changenote (required - applied to every mod in the batch)</span>
                    <textarea
                        value={changenote}
                        onChange={(e) => setChangenote(e.target.value)}
                        disabled={isRunning || isDone}
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

                <p style={{ marginTop: 0, marginBottom: "0.5rem", color: "var(--text-dim)" }}>
                    This will publish {eligible.length} {eligible.length === 1 ? "mod" : "mods"} to the Steam Workshop sharing this changelog:
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem 0", borderRadius: 6, border: "1px solid var(--border-dim, rgba(255,255,255,0.12))" }}>
                    {rows.map((row) => (
                        <li
                            key={row.workshopId || `skip-${row.title}`}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "0.5rem 0.85rem",
                                borderTop: "1px solid rgba(255,255,255,0.05)",
                                gap: "1rem",
                                opacity: row.status === "skipped" ? 0.55 : 1,
                            }}
                        >
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {row.title}
                                {row.workshopId && <code style={{ marginLeft: "0.5rem", color: "var(--text-dim)" }}>{row.workshopId}</code>}
                            </span>
                            <StatusBadge row={row} />
                        </li>
                    ))}
                </ul>

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

                {(isRunning || isDone) && (
                    <div style={{ marginBottom: "1rem" }}>
                        <div style={{ color: "var(--text-dim)", marginBottom: "0.4rem" }}>
                            {isRunning && currentId ? `Live SteamCMD log (${rows.find((r) => r.workshopId === currentId)?.title ?? currentId}):` : "Live SteamCMD log:"}
                        </div>
                        <pre
                            ref={scrollRef}
                            style={{
                                background: "rgba(0,0,0,0.45)",
                                color: "var(--text-main)",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                fontSize: "0.8rem",
                                padding: "0.75rem",
                                margin: 0,
                                borderRadius: 6,
                                border: "1px solid var(--border-dim, rgba(255,255,255,0.12))",
                                minHeight: "120px",
                                maxHeight: "240px",
                                overflow: "auto",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                            }}
                        >
                            {currentLog.length === 0 ? <span style={{ color: "var(--text-dim)" }}>(waiting for SteamCMD output...)</span> : currentLog.map((l) => <div key={l.seq}>{l.line}</div>)}
                        </pre>
                    </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                    {phase === "confirming" && (
                        <>
                            <button onClick={handleClose} className="btn" style={{ padding: "0.55rem 1.1rem" }}>
                                Cancel
                            </button>
                            <button onClick={handlePublishAll} disabled={changenote.trim().length === 0 || eligible.length === 0} className="btn btn-primary" style={{ padding: "0.55rem 1.1rem" }}>
                                Publish All
                            </button>
                        </>
                    )}
                    {(isRunning || isDone) && (
                        <button onClick={handleClose} disabled={isRunning} className="btn" style={{ padding: "0.55rem 1.1rem" }}>
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

/** Props for StatusBadge. */
interface StatusBadgeProps {
    /** The row whose status drives the badge color and label. */
    row: ModRow
}

const BADGE_COLORS: Record<ModStatus, { bg: string; fg: string; label: string }> = {
    pending: { bg: "rgba(148,163,184,0.22)", fg: "#cbd5e1", label: "pending" },
    publishing: { bg: "rgba(59,130,246,0.25)", fg: "#93c5fd", label: "publishing" },
    done: { bg: "rgba(34,197,94,0.22)", fg: "#86efac", label: "done" },
    failed: { bg: "rgba(239,68,68,0.22)", fg: "#fca5a5", label: "failed" },
    skipped: { bg: "rgba(148,163,184,0.18)", fg: "#94a3b8", label: "skipped" },
}

/**
 * Color-coded badge that surfaces a mod's lifecycle status along with terminal details (exit code / duration / reason)
 * once the row reaches a terminal state.
 *
 * @param row The row whose status drives the badge color and label.
 * @returns The badge element.
 */
const StatusBadge = ({ row }: StatusBadgeProps) => {
    const style = BADGE_COLORS[row.status]
    let extra = ""
    if (row.status === "done" || row.status === "failed") {
        if (row.exitCode != null) extra += ` exit ${row.exitCode}`
        if (row.durationSeconds != null) extra += ` ${row.durationSeconds.toFixed(1)}s`
    } else if (row.status === "skipped" && row.reason) {
        extra = ` (${row.reason})`
    }
    return (
        <span
            style={{
                background: style.bg,
                color: style.fg,
                padding: "0.15rem 0.55rem",
                borderRadius: 999,
                fontSize: "0.75rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
            }}
            title={row.error ?? undefined}
        >
            {style.label}
            {extra}
        </span>
    )
}

export default PublishAllDialog

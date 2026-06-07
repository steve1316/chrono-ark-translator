import { useMemo, useState } from "react"

/** One normalized provider API-response record, rendered by the shared modal. Each game maps its own audit-log shape onto this. */
export interface ApiResponseEntry {
    /** Stable identifier (React key). */
    id: string
    /** Optional call kind (e.g. "translate-batch", "scan-terms"). Falls back to a Batch label when absent. */
    kind?: string
    /** Optional ISO timestamp of the call. */
    timestamp?: string
    /** Model id that produced the response. */
    model: string
    /** Prompt (input) token count, when reported. */
    inputTokens?: number | null
    /** Completion (output) token count, when reported. */
    outputTokens?: number | null
    /** Estimated USD cost of the call, when available. */
    costUsd?: number | null
    /** Keys or inputs sent in the call, when recorded. */
    keysOrInputs?: string[]
    /** Raw response text returned by the provider. */
    rawText: string
}

/** Props for the shared `ApiResponsesModal`. */
interface ApiResponsesModalProps {
    /** Normalized entries, newest first (the caller orders them). */
    entries: ApiResponseEntry[]
    /** True while the caller is still fetching. */
    loading?: boolean
    /** Error message to show, if the fetch failed. */
    error?: string | null
    /** Called when the user closes the modal. */
    onClose: () => void
}

/**
 * Shared tabbed audit-log viewer for recorded provider API calls, used by both games. Presentational: the caller fetches + maps its records to
 * `ApiResponseEntry[]`. A sidebar lists the calls; selecting one shows its metadata + raw response. A total-cost summary spans all entries.
 * @param entries - Normalized API-response records.
 * @param loading - Whether the caller is still fetching.
 * @param error - Error message to display, if any.
 * @param onClose - Closes the modal.
 * @returns The modal element.
 */
export function ApiResponsesModal({ entries, loading, error, onClose }: ApiResponsesModalProps) {
    const [activeIdx, setActiveIdx] = useState(0)
    const active = useMemo(() => entries[activeIdx] ?? null, [entries, activeIdx])
    const totalCost = useMemo(() => entries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0), [entries])

    return (
        <div
            className="modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card modal-panel" style={{ width: "900px", display: "flex", flexDirection: "column" }}>
                <div className="modal-header">
                    <h2 style={{ margin: 0 }}>API Responses</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
                {loading && !error && <p>Loading...</p>}
                {!loading && !error && entries.length === 0 && <p style={{ color: "var(--text-dim)" }}>No API responses recorded yet.</p>}
                {entries.length > 0 && (
                    <>
                        {totalCost > 0 && (
                            <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                                Total cost across {entries.length} call{entries.length !== 1 ? "s" : ""}: <span style={{ fontWeight: 600, color: "var(--text-main)" }}>${totalCost.toFixed(4)}</span>
                            </div>
                        )}
                        <div style={{ display: "flex", gap: "1rem", flex: 1, minHeight: 0 }}>
                            <div className="api-response-sidebar">
                                {entries.map((e, i) => (
                                    <button key={e.id} type="button" className={`api-response-tab${i === activeIdx ? " active" : ""}`} data-testid="api-response-tab" onClick={() => setActiveIdx(i)}>
                                        <div className="api-response-kind">{e.kind ?? `Batch ${i + 1}`}</div>
                                        <div className="api-response-time">{e.timestamp ? new Date(e.timestamp).toLocaleString() : e.model}</div>
                                    </button>
                                ))}
                            </div>
                            <div className="api-response-detail">
                                {active && (
                                    <>
                                        <dl className="api-response-meta">
                                            {active.timestamp && (
                                                <>
                                                    <dt>Timestamp</dt>
                                                    <dd>{new Date(active.timestamp).toLocaleString()}</dd>
                                                </>
                                            )}
                                            <dt>Model</dt>
                                            <dd>{active.model}</dd>
                                            <dt>Tokens (in / out)</dt>
                                            <dd>
                                                {active.inputTokens ?? "-"} / {active.outputTokens ?? "-"}
                                            </dd>
                                            <dt>Cost (USD)</dt>
                                            <dd>{active.costUsd != null ? `$${active.costUsd.toFixed(4)}` : "-"}</dd>
                                            {active.keysOrInputs && active.keysOrInputs.length > 0 && (
                                                <>
                                                    <dt>Keys / Inputs</dt>
                                                    <dd>{active.keysOrInputs.join(", ")}</dd>
                                                </>
                                            )}
                                        </dl>
                                        <pre className="api-response-raw">{active.rawText}</pre>
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

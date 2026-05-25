import React, { useEffect, useMemo, useState } from "react"

import type { WH3ApiResponseEntry } from "../../../../shared_types"
import { listApiResponses } from "../../translationApi"

/** Props for `ApiResponsesModal`. */
interface ApiResponsesModalProps {
    /** Steam Workshop ID of the translation mod whose API responses to show. */
    workshopId: string
    /** Called when the modal is closed. */
    onClose: () => void
}

/**
 * Tabbed audit-log viewer for recent Claude API calls (cap 20, newest first).
 * The sidebar lists entries; clicking one shows its raw response and metadata.
 *
 * @param props See `ApiResponsesModalProps`.
 * @returns The rendered modal.
 */
const ApiResponsesModal: React.FC<ApiResponsesModalProps> = ({ workshopId, onClose }) => {
    const [entries, setEntries] = useState<WH3ApiResponseEntry[]>([])
    const [activeIdx, setActiveIdx] = useState(0)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState<string>("")

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const data = await listApiResponses(workshopId)
                if (!cancelled) {
                    setEntries(data)
                    setLoaded(true)
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workshopId])

    const active = useMemo(() => entries[activeIdx] ?? null, [entries, activeIdx])

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
                {!loaded && !error && <p>Loading...</p>}
                {loaded && entries.length === 0 && <p style={{ color: "var(--text-dim)" }}>No API responses recorded yet.</p>}
                {loaded && entries.length > 0 && (
                    <div style={{ display: "flex", gap: "1rem", flex: 1, minHeight: 0 }}>
                        <div className="api-response-sidebar">
                            {entries.map((e, i) => (
                                <button
                                    key={`${e.timestamp}-${i}`}
                                    type="button"
                                    className={`api-response-tab${i === activeIdx ? " active" : ""}`}
                                    data-testid="api-response-tab"
                                    onClick={() => setActiveIdx(i)}
                                >
                                    <div className="api-response-kind">{e.kind}</div>
                                    <div className="api-response-time">{new Date(e.timestamp).toLocaleString()}</div>
                                </button>
                            ))}
                        </div>
                        <div className="api-response-detail">
                            {active && (
                                <>
                                    <dl className="api-response-meta">
                                        <dt>Timestamp</dt>
                                        <dd>{new Date(active.timestamp).toLocaleString()}</dd>
                                        <dt>Model</dt>
                                        <dd>{active.model}</dd>
                                        <dt>Tokens (in / out)</dt>
                                        <dd>
                                            {active.input_tokens ?? "-"} / {active.output_tokens ?? "-"}
                                        </dd>
                                        <dt>Cost (USD)</dt>
                                        <dd>{active.cost_usd != null ? `$${active.cost_usd.toFixed(4)}` : "-"}</dd>
                                        <dt>Keys / Inputs</dt>
                                        <dd>{active.keys_or_inputs.join(", ") || "-"}</dd>
                                    </dl>
                                    <pre className="api-response-raw">{active.raw_response}</pre>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ApiResponsesModal

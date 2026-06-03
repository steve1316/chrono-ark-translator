import { useEffect, useState } from "react"
import { gameApi } from "../../../../api/games"

/** One recorded provider API response for a translation batch. */
interface ApiResponseEntry {
    /** Model id that produced the response. */
    model: string
    /** Prompt (input) token count, when the provider reports it. */
    input_tokens?: number | null
    /** Completion (output) token count, when the provider reports it. */
    output_tokens?: number | null
    /** Estimated USD cost of the batch, when available. */
    cost_usd?: number | null
    /** Raw response text returned by the provider. */
    raw_text: string
}

/** Props for ApiResponsesModal. */
interface ApiResponsesModalProps {
    /** Mod whose recorded API responses to display. */
    modId: string
    /** Called when the user closes the modal. */
    onClose: () => void
}

/**
 * Modal listing the recorded provider API responses for a mod's translation batches. Fetches on mount and lets the user page through each batch's raw
 * response, token counts, and cost. Extracted from the Chrono Ark details page so that page can compose the shared `<TranslationPage>` shell.
 * @param modId - Mod id whose responses to fetch.
 * @param onClose - Called when the user closes the modal.
 * @returns The modal element.
 */
export default function ApiResponsesModal({ modId, onClose }: ApiResponsesModalProps) {
    const [apiResponses, setApiResponses] = useState<ApiResponseEntry[]>([])
    const [activeResponseIdx, setActiveResponseIdx] = useState(0)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await gameApi("chrono_ark").get(`/mods/${modId}/api-responses`)
                if (res.ok && !cancelled) {
                    setApiResponses(await res.json())
                    setActiveResponseIdx(0)
                }
            } catch (err) {
                console.error("Failed to fetch API responses:", err)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [modId])

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card" style={{ width: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2 style={{ margin: 0 }}>API Provider Responses</h2>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "2rem", lineHeight: 1, cursor: "pointer", padding: "0.25rem 0.5rem", borderRadius: "4px" }}
                        title="Close"
                    >
                        &times;
                    </button>
                </div>
                {apiResponses.length === 0 ? (
                    <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No API responses recorded yet. Run a translation first.</p>
                ) : (
                    <>
                        {(() => {
                            const totalCost = apiResponses.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)
                            return totalCost > 0 ? (
                                <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                                    Total cost across {apiResponses.length} batch{apiResponses.length !== 1 ? "es" : ""}:{" "}
                                    <span style={{ fontWeight: 600, color: "var(--text-main)" }}>${totalCost.toFixed(4)}</span>
                                </div>
                            ) : null
                        })()}
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                            {apiResponses.map((_, idx) => (
                                <button
                                    key={idx}
                                    className={`btn ${activeResponseIdx === idx ? "btn-primary" : "btn-outline"}`}
                                    onClick={() => setActiveResponseIdx(idx)}
                                    style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                                >
                                    Batch {idx + 1}
                                </button>
                            ))}
                        </div>
                        {apiResponses[activeResponseIdx] && (
                            <>
                                <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
                                    <div>
                                        <span style={{ color: "var(--text-dim)" }}>Model: </span>
                                        <span style={{ fontWeight: 600 }}>{apiResponses[activeResponseIdx].model}</span>
                                    </div>
                                    {apiResponses[activeResponseIdx].input_tokens != null && (
                                        <div>
                                            <span style={{ color: "var(--text-dim)" }}>Input tokens: </span>
                                            <span style={{ fontWeight: 600 }}>{apiResponses[activeResponseIdx].input_tokens}</span>
                                        </div>
                                    )}
                                    {apiResponses[activeResponseIdx].output_tokens != null && (
                                        <div>
                                            <span style={{ color: "var(--text-dim)" }}>Output tokens: </span>
                                            <span style={{ fontWeight: 600 }}>{apiResponses[activeResponseIdx].output_tokens}</span>
                                        </div>
                                    )}
                                    {apiResponses[activeResponseIdx].cost_usd != null && (
                                        <div>
                                            <span style={{ color: "var(--text-dim)" }}>Cost: </span>
                                            <span style={{ fontWeight: 600 }}>${apiResponses[activeResponseIdx].cost_usd!.toFixed(4)}</span>
                                        </div>
                                    )}
                                </div>
                                <div
                                    style={{
                                        flex: 1,
                                        overflow: "auto",
                                        background: "rgba(0,0,0,0.3)",
                                        borderRadius: "8px",
                                        border: "1px solid var(--glass-border)",
                                        padding: "1rem",
                                        minHeight: "300px",
                                    }}
                                >
                                    <pre
                                        style={{
                                            margin: 0,
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                            fontSize: "0.85rem",
                                            lineHeight: "1.6",
                                            color: "var(--text-main)",
                                            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                                        }}
                                    >
                                        {apiResponses[activeResponseIdx].raw_text}
                                    </pre>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

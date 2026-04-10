import React from "react"

/**
 * Per-mod cost estimate returned by the backend's bulk estimate endpoint.
 * Contains token and cost estimates for each target language of a single mod.
 */
interface ModEstimate {
    /** The mod's unique identifier */
    mod_id: string
    /** Human-readable display name of the mod */
    mod_name: string
    /** Total number of translatable strings across all languages for this mod */
    total_strings: number
    /** Translation provider name (e.g. `"OpenAI"`, `"Anthropic"`) */
    provider: string
    /** Per-language cost estimates, keyed by language code */
    estimates: Record<
        string,
        {
            /** Estimated number of input (prompt) tokens across all batches */
            estimated_input_tokens: number
            /** Estimated number of output (completion) tokens across all batches */
            estimated_output_tokens: number
            /** Estimated total cost in USD for this language */
            estimated_cost_usd: number
            /** The LLM model name used for the estimate (e.g. `"gpt-4o"`, `"claude-sonnet-4-5"`) */
            model: string
            /** Human-readable note about the estimate (e.g. `"Prices are approximate"`) */
            note: string
        }
    >
}

/**
 * Props for the {@link EstimateTotalCostModal} component.
 */
interface EstimateTotalCostModalProps {
    /** Per-mod cost estimate results from the backend */
    results: ModEstimate[]
    /** Callback invoked when the user closes the modal */
    onClose: () => void
}

/**
 * Read-only modal displaying a cost estimate summary across all selected mods.
 *
 * Shows grand-total strings, grand-total estimated cost, provider, and model
 * at the top, followed by a scrollable per-mod breakdown with each mod's
 * string count and estimated cost.
 *
 * @param results - Array of per-mod cost estimates from the backend
 * @param onClose - Fires when the user clicks Close or the backdrop
 * @returns The rendered estimate modal
 */
const EstimateTotalCostModal: React.FC<EstimateTotalCostModalProps> = ({ results, onClose }) => {
    const grandTotalCost = results.reduce((sum, mod) => sum + Object.values(mod.estimates).reduce((s, e) => s + e.estimated_cost_usd, 0), 0)
    const grandTotalStrings = results.reduce((sum, mod) => sum + mod.total_strings, 0)

    // Derive provider and model from the first mod that has estimates.
    const firstWithEstimates = results.find((m) => Object.keys(m.estimates).length > 0)
    const provider = firstWithEstimates?.provider ?? ""
    const model = firstWithEstimates ? (Object.values(firstWithEstimates.estimates)[0]?.model ?? "") : ""

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
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                className="glass-card"
                style={{
                    width: "600px",
                    maxHeight: "85vh",
                    display: "flex",
                    flexDirection: "column",
                    padding: "2rem",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2 style={{ margin: 0 }}>Estimate Total Cost</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            fontSize: "2rem",
                            lineHeight: 1,
                            cursor: "pointer",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                        }}
                        title="Close"
                    >
                        &times;
                    </button>
                </div>

                {/* Summary stats */}
                <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Provider</span>
                        <div style={{ fontWeight: 600 }}>{provider}</div>
                    </div>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Model</span>
                        <div style={{ fontWeight: 600 }}>{model}</div>
                    </div>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Total Strings</span>
                        <div style={{ fontWeight: 600 }}>{grandTotalStrings.toLocaleString()}</div>
                    </div>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Total Estimated Cost</span>
                        <div style={{ fontWeight: 600, color: "var(--accent-primary)" }}>~${grandTotalCost.toFixed(4)}</div>
                    </div>
                </div>

                {/* Per-mod list */}
                <div
                    style={{
                        flex: 1,
                        overflow: "auto",
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "8px",
                        border: "1px solid var(--glass-border)",
                        marginBottom: "1rem",
                    }}
                >
                    {results.map((mod) => {
                        const modCost = Object.values(mod.estimates).reduce((s, e) => s + e.estimated_cost_usd, 0)
                        return (
                            <div
                                key={mod.mod_id}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "0.75rem 1rem",
                                    borderBottom: "1px solid var(--glass-border)",
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500 }}>{mod.mod_name}</div>
                                    <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{mod.total_strings.toLocaleString()} strings</div>
                                </div>
                                <div style={{ fontWeight: 600, color: "var(--accent-primary)", whiteSpace: "nowrap" }}>~${modCost.toFixed(4)}</div>
                            </div>
                        )
                    })}
                </div>

                {/* Close button */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn btn-outline" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EstimateTotalCostModal

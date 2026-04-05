import React, { useState } from "react"

/**
 * Preview data for a single target language, showing the prompts that will be
 * sent to the translation provider.
 */
interface LanguagePreview {
    /** The system-level prompt that sets up the translation context and rules */
    system_prompt: string
    /** The user-level message containing the first batch of strings to translate */
    user_message: string
    /** How many translatable strings exist for this language */
    strings_in_language: number
    /** Total number of batches this language's strings will be split into */
    batches: number
}

/**
 * Token and cost estimates for translating one target language.
 * Returned by the backend's preview/dry-run endpoint.
 */
interface CostEstimate {
    /** Estimated number of input (prompt) tokens across all batches */
    estimated_input_tokens: number
    /** Estimated number of output (completion) tokens across all batches */
    estimated_output_tokens: number
    /**
     * Estimated total cost in USD for this language. Calculated by the backend
     * as: `(input_tokens * input_price + output_tokens * output_price)` summed
     * over all batches.
     */
    estimated_cost_usd: number
    /** The LLM model name used for the estimate (e.g. `"gpt-4o"`, `"claude-4-sonnet"`) */
    model: string
    /** Human-readable note about the estimate (e.g. `"Prices are approximate"`) */
    note: string
}

/**
 * Full translation preview payload returned by the backend before the user
 * confirms the translation job. Contains per-language prompt previews and
 * optional cost estimates.
 */
export interface TranslationPreview {
    /** Total number of strings to translate across all languages */
    total_strings: number
    /** Total number of API batches across all languages */
    total_batches: number
    /** Number of strings sent per batch */
    batch_size: number
    /** Translation provider name (e.g. `"OpenAI"`, `"Anthropic"`, `"DeepL"`) */
    provider: string
    /** Per-language prompt previews, keyed by language code */
    previews: Record<string, LanguagePreview>
    /** Per-language cost estimates (absent when the provider does not support cost estimation) */
    estimates?: Record<string, CostEstimate>
}

/**
 * Props for the {@link TranslationConfirmModal} component.
 */
interface TranslationConfirmModalProps {
    /** The translation preview data to display */
    preview: TranslationPreview
    /** Callback invoked when the user confirms the translation */
    onConfirm: () => void
    /** Callback invoked when the user cancels or closes the modal */
    onCancel: () => void
}

/**
 * Confirmation modal shown before starting a translation job. It displays:
 *
 * - Summary stats: provider, string count, batch count, and estimated cost.
 * - Language tabs: when translating to multiple languages the user can switch
 *   between them to inspect the prompts that will be sent.
 * - Prompt tabs: within each language, toggle between the system prompt and the
 *   user message (first batch) to review the exact text sent to the LLM.
 *
 * The modal uses two levels of tabs:
 * 1. **Language selector** (only shown when > 1 language) -- controlled by `activeLang`
 * 2. **Prompt type selector** ("System Prompt" vs "User Message") -- controlled by `activeTab`
 *
 * @param preview - Translation preview payload from the backend
 * @param onConfirm - Fires when the user clicks "Translate N strings"
 * @param onCancel - Fires when the user clicks Cancel or the backdrop
 * @returns The rendered confirmation modal
 */
const TranslationConfirmModal: React.FC<TranslationConfirmModalProps> = ({ preview, onConfirm, onCancel }) => {
    const languages = Object.keys(preview.previews)
    const [activeLang, setActiveLang] = useState(languages[0] || "")
    const [activeTab, setActiveTab] = useState<"system" | "user">("system")
    /** Convenience reference to the preview data for the currently active language. */
    const langPreview = preview.previews[activeLang]

    /**
     * Aggregate cost across all target languages. Computed by summing each
     * language's estimated_cost_usd. Returns null when the provider does not
     * supply cost estimates (e.g. `DeepL`), in which case the cost section is
     * hidden from the UI.
     */
    const totalCost = preview.estimates
        ? Object.values(preview.estimates).reduce((sum, est) => sum + est.estimated_cost_usd, 0)
        : null

    return (
        // Backdrop overlay: clicking outside the card cancels the translation.
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
        >
            <div className="glass-card" style={{ width: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column", padding: "2rem" }}>
                {/* Modal header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2 style={{ margin: 0 }}>Confirm Translation</h2>
                    <button className="btn btn-outline" onClick={onCancel} style={{ padding: "0.25rem 0.75rem" }}>Close</button>
                </div>

                {/* Summary stats row: provider, string count, batch count, and optional cost */}
                <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Provider</span>
                        <div style={{ fontWeight: 600 }}>{preview.provider}</div>
                    </div>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Strings</span>
                        <div style={{ fontWeight: 600 }}>{preview.total_strings}</div>
                    </div>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Batches</span>
                        <div style={{ fontWeight: 600 }}>{preview.total_batches} (size {preview.batch_size})</div>
                    </div>
                    {/*
                      * Cost estimate section -- only rendered when the provider
                      * returns estimates. Shows the aggregate total, and if
                      * multiple languages are present, a per-language breakdown
                      * in parentheses (e.g. "en: ~$0.0012, fr: ~$0.0015").
                      */}
                    {totalCost !== null && (
                        <div>
                            <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Estimated Cost</span>
                            <div style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
                                ~${totalCost.toFixed(4)}
                                {/* Per-language breakdown shown only when translating to 2+ languages */}
                                {Object.keys(preview.estimates!).length > 1 && (
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-dim)", fontWeight: 400, marginLeft: "0.5rem" }}>
                                        ({Object.entries(preview.estimates!).map(([lang, est]) => `${lang}: ~$${est.estimated_cost_usd.toFixed(4)}`).join(", ")})
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/*
                  * Language selector tabs (level 1).
                  * Only rendered when translating to multiple target languages.
                  * Each button shows the language code and its string count.
                  * Switching language preserves the current prompt tab selection.
                  */}
                {languages.length > 1 && (
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                        {languages.map((lang) => (
                            <button
                                key={lang}
                                className={`btn ${activeLang === lang ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setActiveLang(lang)}
                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                            >
                                {lang} ({preview.previews[lang].strings_in_language})
                            </button>
                        ))}
                    </div>
                )}

                {/*
                  * Prompt preview section (level 2 tabs + content pane).
                  * "System Prompt" shows the instructions/rules sent as the system message.
                  * "User Message" shows the first batch of strings that will be sent.
                  * Note: only batch 1 is previewed; subsequent batches follow the same format.
                  */}
                {langPreview && (
                    <>
                        {/* Prompt type selector tabs */}
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                            <button
                                className={`btn ${activeTab === "system" ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setActiveTab("system")}
                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                            >
                                System Prompt
                            </button>
                            <button
                                className={`btn ${activeTab === "user" ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setActiveTab("user")}
                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                            >
                                User Message (Batch 1 of {langPreview.batches})
                            </button>
                        </div>

                        {/* Scrollable code-style preview of the selected prompt */}
                        <div style={{
                            flex: 1,
                            overflow: "auto",
                            background: "rgba(0,0,0,0.3)",
                            borderRadius: "8px",
                            border: "1px solid var(--glass-border)",
                            padding: "1rem",
                            marginBottom: "1rem",
                            minHeight: "300px",
                        }}>
                            <pre style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                fontSize: "0.85rem",
                                lineHeight: "1.6",
                                color: "var(--text-main)",
                                fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                            }}>
                                {activeTab === "system" ? langPreview.system_prompt : langPreview.user_message}
                            </pre>
                        </div>
                    </>
                )}

                {/* Action buttons: Cancel or Confirm translation */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                    <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary" onClick={onConfirm}>
                        Translate {preview.total_strings} strings
                    </button>
                </div>
            </div>
        </div>
    )
}

export default TranslationConfirmModal

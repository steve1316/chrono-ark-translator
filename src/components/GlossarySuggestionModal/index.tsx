import React, { useState } from "react"
import { FaCheck, FaTimes, FaCheckDouble, FaTimesCircle } from "react-icons/fa"
import type { TermSuggestion } from "../../shared_types"
import { API_BASE } from "../../config"

/**
 * Props for the {@link GlossarySuggestionModal} component.
 */
interface GlossarySuggestionModalProps {
    /** Unique identifier of the mod whose glossary suggestions are being reviewed. */
    modId: string
    /** Initial list of term suggestions to present for review. */
    suggestions: TermSuggestion[]
    /** Callback to close the modal (e.g. user clicks backdrop or Close button). */
    onClose: () => void
    /** Callback fired after any accept/dismiss action so the parent can refresh its data. */
    onUpdated: () => void
    /** When set, the modal is in batch-mode and shows batch progress. */
    batchProgress?: { current: number; total: number }
    /** Callback to continue to the next batch after reviewing suggestions. */
    onContinue?: () => void
}

/**
 * Modal dialog for reviewing AI-generated glossary term suggestions for a mod.
 *
 * Displays a list of suggested terms (each with its English translation, original
 * source text, category, and the AI's reasoning). The user can accept or dismiss
 * terms individually, or act on all terms at once via bulk buttons.
 *
 * Workflow:
 * - "Accept" sends a POST to `/api/mods/{modId}/glossary/suggestions/accept` with
 *   the selected English term(s). The backend adds them to the mod's glossary.
 * - "Dismiss" sends a POST to `/api/mods/{modId}/glossary/suggestions/dismiss`.
 *   When dismissing all, the request body is `{ all: true }` instead of a term list.
 * - After each action, the local `pending` list is pruned optimistically and the
 *   parent is notified via `onUpdated()`.
 *
 * @param modId - The mod ID used in API routes
 * @param suggestions - Suggestions to display initially
 * @param onClose - Close handler for the modal
 * @param onUpdated - Refresh callback for the parent component
 * @returns The rendered suggestion review modal
 */
const GlossarySuggestionModal: React.FC<GlossarySuggestionModalProps> = ({ modId, suggestions, onClose, onUpdated, batchProgress, onContinue }) => {
    const isBatchMode = !!batchProgress
    const [pending, setPending] = useState<TermSuggestion[]>(suggestions)
    const [processing, setProcessing] = useState(false)

    /**
     * Accept one or more suggested terms, adding them to the mod's glossary.
     *
     * Sends POST `/api/mods/{modId}/glossary/suggestions/accept`
     * Request body: `{ terms: string[] }`  (list of English term strings)
     *
     * On success the accepted terms are removed from the local pending list.
     *
     * @param terms - English term strings to accept
     */
    const handleAccept = async (terms: string[]) => {
        setProcessing(true)
        try {
            await fetch(`${API_BASE}/mods/${modId}/glossary/suggestions/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ terms }),
            })
            // Optimistically remove accepted terms from the local list.
            setPending((prev) => prev.filter((s) => !terms.includes(s.english)))
            onUpdated()
        } catch (err) {
            console.error("Failed to accept suggestions:", err)
        } finally {
            setProcessing(false)
        }
    }

    /**
     * Dismiss one or more suggested terms (or all at once).
     *
     * Sends POST `/api/mods/{modId}/glossary/suggestions/dismiss`
     *
     * - Request body when dismissing specific terms: `{ terms: string[] }`
     * - Request body when dismissing all:            `{ all: true }`
     *
     * The backend differentiates between the two shapes. When `all` is true the
     * `terms` parameter is ignored and every remaining suggestion is dismissed.
     *
     * @param terms - English term strings to dismiss (ignored when `all` is true)
     * @param all - If true, dismiss every pending suggestion at once. Defaults to false.
     */
    const handleDismiss = async (terms: string[], all: boolean = false) => {
        setProcessing(true)
        try {
            await fetch(`${API_BASE}/mods/${modId}/glossary/suggestions/dismiss`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // When dismissing all, send { all: true } so the backend clears everything.
                body: JSON.stringify(all ? { all: true } : { terms }),
            })
            if (all) {
                setPending([])
            } else {
                setPending((prev) => prev.filter((s) => !terms.includes(s.english)))
            }
            onUpdated()
        } catch (err) {
            console.error("Failed to dismiss suggestions:", err)
        } finally {
            setProcessing(false)
        }
    }

    return (
        // Backdrop overlay: clicking directly on the backdrop (not a child) closes the modal.
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card" style={{ width: "700px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                {/* Modal header with title, batch progress, and close button */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Suggested Glossary Terms</h2>
                        {isBatchMode && (
                            <div style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
                                Batch {batchProgress!.current} of {batchProgress!.total}
                            </div>
                        )}
                    </div>
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

                {pending.length === 0 ? (
                    // Empty state shown once all suggestions have been accepted or dismissed.
                    <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No pending suggestions.</p>
                ) : (
                    <>
                        {/* Bulk action buttons: accept all or dismiss all at once. */}
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                            <button
                                className="btn btn-primary"
                                disabled={processing}
                                onClick={() => handleAccept(pending.map((s) => s.english))}
                                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                            >
                                <FaCheckDouble /> Accept All ({pending.length})
                            </button>
                            <button
                                className="btn btn-outline"
                                disabled={processing}
                                onClick={() => handleDismiss([], true)}
                                style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                            >
                                <FaTimesCircle /> Dismiss All
                            </button>
                        </div>

                        {/* Individual suggestion cards. */}
                        {pending.map((suggestion) => (
                            <div
                                key={suggestion.english}
                                style={{ padding: "1rem", marginBottom: "0.75rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--glass-border)" }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    {/* Left side: term details. */}
                                    <div>
                                        {/* English translation proposed by the AI. */}
                                        <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{suggestion.english}</div>
                                        {/* Original source text and its language. */}
                                        <div style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>
                                            {suggestion.source_lang}: {suggestion.source}
                                        </div>
                                        {/* AI-generated reasoning for why this term should be in the glossary. */}
                                        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem", fontStyle: "italic" }}>{suggestion.reason}</div>
                                        {/* Category badge (e.g. "skill", "character", "item"). */}
                                        <span
                                            style={{
                                                display: "inline-block",
                                                marginTop: "0.5rem",
                                                padding: "0.15rem 0.5rem",
                                                borderRadius: "4px",
                                                fontSize: "0.75rem",
                                                textTransform: "capitalize",
                                                background: "rgba(138,180,248,0.15)",
                                                color: "var(--accent-primary)",
                                            }}
                                        >
                                            {suggestion.category}
                                        </span>
                                    </div>
                                    {/* Right side: per-term accept/dismiss buttons. */}
                                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                                        <button
                                            className="btn btn-primary"
                                            disabled={processing}
                                            onClick={() => handleAccept([suggestion.english])}
                                            style={{ padding: "0.25rem 0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                                        >
                                            <FaCheck /> Accept
                                        </button>
                                        <button
                                            className="btn btn-outline"
                                            disabled={processing}
                                            onClick={() => handleDismiss([suggestion.english])}
                                            style={{ padding: "0.25rem 0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                                        >
                                            <FaTimes /> Dismiss
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {/* Batch-mode: Continue to next batch / finish button */}
                {isBatchMode && onContinue && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--glass-border)" }}>
                        <button className="btn btn-primary" disabled={processing} onClick={onContinue} style={{ padding: "0.5rem 1.5rem", fontSize: "1rem" }}>
                            {batchProgress!.current >= batchProgress!.total ? "Finish" : pending.length === 0 ? "Continue to Next Batch" : "Skip & Continue to Next Batch"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default GlossarySuggestionModal

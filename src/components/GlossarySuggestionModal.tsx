import React, { useState } from "react"
import { FaCheck, FaTimes, FaCheckDouble, FaTimesCircle } from "react-icons/fa"
import type { TermSuggestion } from "../shared_types"

const API_BASE = "http://localhost:8000/api"

interface GlossarySuggestionModalProps {
    modId: string
    suggestions: TermSuggestion[]
    onClose: () => void
    onUpdated: () => void
}

const GlossarySuggestionModal: React.FC<GlossarySuggestionModalProps> = ({ modId, suggestions, onClose, onUpdated }) => {
    const [pending, setPending] = useState<TermSuggestion[]>(suggestions)
    const [processing, setProcessing] = useState(false)

    const handleAccept = async (terms: string[]) => {
        setProcessing(true)
        try {
            await fetch(`${API_BASE}/mods/${modId}/glossary/suggestions/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ terms }),
            })
            setPending((prev) => prev.filter((s) => !terms.includes(s.english)))
            onUpdated()
        } catch (err) {
            console.error("Failed to accept suggestions:", err)
        } finally {
            setProcessing(false)
        }
    }

    const handleDismiss = async (terms: string[], all: boolean = false) => {
        setProcessing(true)
        try {
            await fetch(`${API_BASE}/mods/${modId}/glossary/suggestions/dismiss`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="glass-card" style={{ width: "700px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 style={{ margin: 0 }}>Suggested Glossary Terms</h2>
                    <button className="btn btn-outline" onClick={onClose} style={{ padding: "0.25rem 0.75rem" }}>Close</button>
                </div>

                {pending.length === 0 ? (
                    <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No pending suggestions.</p>
                ) : (
                    <>
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

                        {pending.map((suggestion) => (
                            <div
                                key={suggestion.english}
                                style={{ padding: "1rem", marginBottom: "0.75rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--glass-border)" }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{suggestion.english}</div>
                                        <div style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>
                                            {suggestion.source_lang}: {suggestion.source}
                                        </div>
                                        <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem", fontStyle: "italic" }}>
                                            {suggestion.reason}
                                        </div>
                                        <span
                                            style={{
                                                display: "inline-block", marginTop: "0.5rem", padding: "0.15rem 0.5rem",
                                                borderRadius: "4px", fontSize: "0.75rem", textTransform: "capitalize",
                                                background: "rgba(138,180,248,0.15)", color: "var(--accent-primary)",
                                            }}
                                        >
                                            {suggestion.category}
                                        </span>
                                    </div>
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
            </div>
        </div>
    )
}

export default GlossarySuggestionModal

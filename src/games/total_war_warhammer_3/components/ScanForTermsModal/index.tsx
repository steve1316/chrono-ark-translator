import React, { useEffect, useMemo, useState } from "react"

import type { TermSuggestion } from "../../../../shared_types"
import { addGlossaryTerm, scanTerms } from "../../translationApi"

/** Props for `ScanForTermsModal`. */
interface ScanForTermsModalProps {
    /** Steam Workshop ID of the translation mod to scan. */
    workshopId: string
    /** Called when the modal is closed. */
    onClose: () => void
}

/**
 * Runs `POST /scan-terms` on mount, then lets the user Accept / Reject each suggestion.
 * Accepting a suggestion POSTs it to the per-mod glossary.
 *
 * @param props See `ScanForTermsModalProps`.
 * @returns The rendered modal.
 */
const ScanForTermsModal: React.FC<ScanForTermsModalProps> = ({ workshopId, onClose }) => {
    const [suggestions, setSuggestions] = useState<TermSuggestion[] | null>(null)
    const [error, setError] = useState<string>("")
    const [busy, setBusy] = useState<string>("")

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const data = await scanTerms(workshopId)
                if (!cancelled) setSuggestions(data)
            } catch (e) {
                if (!cancelled) setError((e as Error).message)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workshopId])

    const grouped = useMemo(() => {
        if (!suggestions) return new Map<string, TermSuggestion[]>()
        const out = new Map<string, TermSuggestion[]>()
        for (const s of suggestions) {
            const arr = out.get(s.category) ?? []
            arr.push(s)
            out.set(s.category, arr)
        }
        return out
    }, [suggestions])

    const accept = async (s: TermSuggestion) => {
        setBusy(s.english)
        try {
            await addGlossaryTerm(workshopId, { english: s.english, source: s.source, category: s.category })
            setSuggestions((prev) => (prev ?? []).filter((x) => x.english !== s.english))
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setBusy("")
        }
    }

    const reject = (s: TermSuggestion) => {
        setSuggestions((prev) => (prev ?? []).filter((x) => x.english !== s.english))
    }

    const acceptAll = async () => {
        if (!suggestions) return
        setBusy("all")
        try {
            for (const s of suggestions) {
                await addGlossaryTerm(workshopId, { english: s.english, source: s.source, category: s.category })
            }
            setSuggestions([])
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setBusy("")
        }
    }

    return (
        <div
            className="modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card modal-panel" style={{ width: "700px" }}>
                <div className="modal-header">
                    <h2 style={{ margin: 0 }}>Scan for Terms</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
                {suggestions === null && !error && <p>Scanning parent text for recurring terms...</p>}
                {suggestions && suggestions.length === 0 && <p style={{ color: "var(--text-dim)" }}>No new terms suggested.</p>}
                {suggestions && suggestions.length > 0 && (
                    <>
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                            <button type="button" className="btn btn-primary" onClick={acceptAll} disabled={busy === "all"}>
                                {busy === "all" ? "Accepting..." : "Accept all"}
                            </button>
                            <button type="button" className="btn btn-outline" onClick={() => setSuggestions([])}>
                                Reject all
                            </button>
                        </div>
                        {Array.from(grouped.entries()).map(([cat, items]) => (
                            <div key={cat} className="glossary-group">
                                <div className="glossary-group-header">{cat}</div>
                                {items.map((s) => (
                                    <div key={s.english} className="suggestion-row">
                                        <div className="suggestion-meta">
                                            <span className="suggestion-english">{s.english}</span>
                                            <span className="suggestion-source"> ({s.source})</span>
                                            <div className="suggestion-reason">{s.reason}</div>
                                        </div>
                                        <div className="suggestion-actions">
                                            <button type="button" className="btn btn-primary" onClick={() => accept(s)} disabled={busy === s.english}>
                                                {busy === s.english ? "..." : "Accept"}
                                            </button>
                                            <button type="button" className="btn btn-outline" onClick={() => reject(s)}>
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    )
}

export default ScanForTermsModal

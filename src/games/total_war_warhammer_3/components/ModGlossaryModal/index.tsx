import React, { useCallback, useEffect, useState } from "react"

import type { TermSuggestion } from "../../../../shared_types"
import { GlossaryEditor, type GlossaryEditorTerm } from "../../../../translation/GlossaryEditor"
import { addGlossaryTerm, deleteGlossaryTerm, glossaryApplyAll, glossarySuggestEdits, loadGlossary, updateGlossaryTerm } from "../../translationApi"

/** Props for `ModGlossaryModal`. */
interface ModGlossaryModalProps {
    /** Steam Workshop ID of the translation mod whose glossary this edits. */
    workshopId: string
    /** Called when the modal is closed. */
    onClose: () => void
}

/** Read the single source text from an editor term's mappings (WH3 stores one source per term). */
function sourceOf(term: GlossaryEditorTerm): string {
    return Object.values(term.sourceMappings)[0] ?? ""
}

/**
 * Per-mod glossary editor modal. A thin wrapper around the shared `GlossaryEditor` (single-source, grouped by category): it owns the glossary load,
 * Claude-powered Suggest Edits, and Apply All (word-boundary find-and-replace), wiring CRUD to the WH3 translation API.
 * @param workshopId - Steam Workshop ID whose glossary to edit.
 * @param onClose - Called when the modal is closed.
 * @returns The rendered modal.
 */
const ModGlossaryModal: React.FC<ModGlossaryModalProps> = ({ workshopId, onClose }) => {
    const [terms, setTerms] = useState<GlossaryEditorTerm[]>([])
    const [error, setError] = useState("")
    const [suggestions, setSuggestions] = useState<TermSuggestion[] | null>(null)
    const [applyAllOpen, setApplyAllOpen] = useState(false)
    const [applyAllOld, setApplyAllOld] = useState("")
    const [applyAllNew, setApplyAllNew] = useState("")
    const [applyResult, setApplyResult] = useState("")

    const refresh = useCallback(async () => {
        try {
            const dict = await loadGlossary(workshopId)
            setTerms(Object.entries(dict).map(([english, v]) => ({ english, category: v.category, sourceMappings: { source: v.source } })))
        } catch (e) {
            setError((e as Error).message)
        }
    }, [workshopId])

    useEffect(() => {
        refresh()
    }, [refresh])

    const handleAdd = async (term: GlossaryEditorTerm) => {
        try {
            await addGlossaryTerm(workshopId, { english: term.english, source: sourceOf(term), category: term.category })
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const handleUpdate = async (oldEnglish: string, term: GlossaryEditorTerm) => {
        try {
            await updateGlossaryTerm(workshopId, oldEnglish, { english: term.english, source: sourceOf(term), category: term.category })
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const handleRemove = async (english: string) => {
        if (!window.confirm(`Delete glossary entry "${english}"?`)) return
        try {
            await deleteGlossaryTerm(workshopId, english)
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const onSuggestEdits = async () => {
        setSuggestions(null)
        try {
            setSuggestions(await glossarySuggestEdits(workshopId))
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const acceptSuggestion = async (s: TermSuggestion) => {
        try {
            if (s.edit_of) await updateGlossaryTerm(workshopId, s.edit_of, { english: s.english, source: s.source, category: s.category })
            else await addGlossaryTerm(workshopId, { english: s.english, source: s.source, category: s.category })
            setSuggestions((prev) => (prev ?? []).filter((x) => x.english !== s.english))
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const runApplyAll = async () => {
        if (!applyAllOld.trim() || !applyAllNew.trim()) return
        try {
            const result = await glossaryApplyAll(workshopId, applyAllOld, applyAllNew)
            setApplyResult(`Replaced ${result.replaced} occurrences`)
            setApplyAllOld("")
            setApplyAllNew("")
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const headerActions = (
        <>
            <button type="button" className="btn btn-outline" onClick={onSuggestEdits}>
                Suggest edits
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setApplyAllOpen(!applyAllOpen)}>
                Apply all
            </button>
        </>
    )

    const footer = (
        <>
            {applyAllOpen && (
                <div className="glossary-apply-all">
                    <input type="text" placeholder="Old English" value={applyAllOld} onChange={(e) => setApplyAllOld(e.target.value)} />
                    <input type="text" placeholder="New English" value={applyAllNew} onChange={(e) => setApplyAllNew(e.target.value)} />
                    <button type="button" className="btn btn-primary" onClick={runApplyAll}>
                        Apply
                    </button>
                </div>
            )}
            {applyResult && <p style={{ color: "var(--text-dim)", margin: "0.5rem 0" }}>{applyResult}</p>}
            {suggestions && suggestions.length > 0 && (
                <div className="glossary-suggestions">
                    <div className="glossary-group-header">Suggestions</div>
                    {suggestions.map((s) => (
                        <div key={s.english} className="suggestion-row">
                            <div className="suggestion-meta">
                                <span className="suggestion-english">{s.english}</span>
                                <span className="suggestion-source"> ({s.source})</span>
                                <div className="suggestion-reason">{s.reason}</div>
                            </div>
                            <div className="suggestion-actions">
                                <button type="button" className="btn btn-primary" onClick={() => acceptSuggestion(s)}>
                                    Accept
                                </button>
                                <button type="button" className="btn btn-outline" onClick={() => setSuggestions((prev) => (prev ?? []).filter((x) => x.english !== s.english))}>
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    )

    return (
        <div
            className="modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card modal-panel" style={{ width: "800px" }}>
                <div className="modal-header">
                    <h2 style={{ margin: 0 }}>Mod Glossary</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
                <GlossaryEditor
                    terms={terms}
                    groupByCategory
                    emptyMessage="No glossary entries yet."
                    onAdd={handleAdd}
                    onUpdate={handleUpdate}
                    onRemove={handleRemove}
                    headerActions={headerActions}
                    footer={footer}
                />
            </div>
        </div>
    )
}

export default ModGlossaryModal

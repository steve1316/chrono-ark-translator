import React, { useCallback, useEffect, useMemo, useState } from "react"

import type { TermSuggestion } from "../../../../shared_types"
import { addGlossaryTerm, deleteGlossaryTerm, glossaryApplyAll, glossarySuggestEdits, loadGlossary, updateGlossaryTerm } from "../../translationApi"

/** Props for `ModGlossaryModal`. */
interface ModGlossaryModalProps {
    /** Steam Workshop ID of the translation mod whose glossary this edits. */
    workshopId: string
    /** Called when the modal is closed. */
    onClose: () => void
}

/** One row in the local state of glossary entries. */
interface GlossaryRow {
    /** Canonical English term. */
    english: string
    /** Source-language text mapped to this English term. */
    source: string
    /** Free-form category label used for grouping rows in the UI. */
    category: string
}

/**
 * Per-mod glossary editor. Add / Edit / Delete entries, request Claude-powered Suggest Edits, and trigger Apply All
 * (word-boundary find-and-replace across translations).
 *
 * @param props See `ModGlossaryModalProps`.
 * @returns The rendered modal.
 */
const ModGlossaryModal: React.FC<ModGlossaryModalProps> = ({ workshopId, onClose }) => {
    const [entries, setEntries] = useState<GlossaryRow[]>([])
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState("")
    const [newRow, setNewRow] = useState<GlossaryRow>({ english: "", source: "", category: "" })
    const [editing, setEditing] = useState<string | null>(null)
    const [editRow, setEditRow] = useState<GlossaryRow>({ english: "", source: "", category: "" })
    const [suggestions, setSuggestions] = useState<TermSuggestion[] | null>(null)
    const [applyAllOpen, setApplyAllOpen] = useState(false)
    const [applyAllOld, setApplyAllOld] = useState("")
    const [applyAllNew, setApplyAllNew] = useState("")
    const [applyResult, setApplyResult] = useState<string>("")

    const refresh = useCallback(async () => {
        try {
            const dict = await loadGlossary(workshopId)
            const rows = Object.entries(dict).map(([english, v]) => ({ english, source: v.source, category: v.category }))
            setEntries(rows)
            setLoaded(true)
        } catch (e) {
            setError((e as Error).message)
        }
    }, [workshopId])

    useEffect(() => {
        refresh()
    }, [refresh])

    const grouped = useMemo(() => {
        const out = new Map<string, GlossaryRow[]>()
        for (const row of entries) {
            const arr = out.get(row.category) ?? []
            arr.push(row)
            out.set(row.category, arr)
        }
        return out
    }, [entries])

    const onAdd = async () => {
        if (!newRow.english.trim()) return
        try {
            await addGlossaryTerm(workshopId, newRow)
            setNewRow({ english: "", source: "", category: "" })
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const startEdit = (row: GlossaryRow) => {
        setEditing(row.english)
        setEditRow({ ...row })
    }

    const saveEdit = async () => {
        if (!editing) return
        try {
            await updateGlossaryTerm(workshopId, editing, editRow)
            setEditing(null)
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const onDelete = async (english: string) => {
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
            const data = await glossarySuggestEdits(workshopId)
            setSuggestions(data)
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const acceptSuggestion = async (s: TermSuggestion) => {
        try {
            if (s.edit_of) {
                await updateGlossaryTerm(workshopId, s.edit_of, { english: s.english, source: s.source, category: s.category })
            } else {
                await addGlossaryTerm(workshopId, { english: s.english, source: s.source, category: s.category })
            }
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

                <div className="glossary-add-row">
                    <input type="text" placeholder="English term" value={newRow.english} onChange={(e) => setNewRow({ ...newRow, english: e.target.value })} />
                    <input type="text" placeholder="Source" value={newRow.source} onChange={(e) => setNewRow({ ...newRow, source: e.target.value })} />
                    <input type="text" placeholder="Category" value={newRow.category} onChange={(e) => setNewRow({ ...newRow, category: e.target.value })} />
                    <button type="button" className="btn btn-primary" onClick={onAdd}>
                        Add term
                    </button>
                </div>

                {loaded && entries.length === 0 && <p style={{ color: "var(--text-dim)" }}>No glossary entries yet.</p>}
                {Array.from(grouped.entries()).map(([cat, items]) => (
                    <div key={cat} className="glossary-group">
                        <div className="glossary-group-header">{cat}</div>
                        {items.map((row) => (
                            <div key={row.english} className="glossary-row">
                                {editing === row.english ? (
                                    <>
                                        <input type="text" value={editRow.english} onChange={(e) => setEditRow({ ...editRow, english: e.target.value })} />
                                        <input type="text" value={editRow.source} onChange={(e) => setEditRow({ ...editRow, source: e.target.value })} />
                                        <input type="text" value={editRow.category} onChange={(e) => setEditRow({ ...editRow, category: e.target.value })} />
                                        <button type="button" className="btn btn-primary" onClick={saveEdit}>
                                            Save
                                        </button>
                                        <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span className="glossary-english">{row.english}</span>
                                        <span className="glossary-source">{row.source}</span>
                                        <button type="button" className="btn btn-outline" onClick={() => startEdit(row)}>
                                            Edit
                                        </button>
                                        <button type="button" className="btn btn-outline" onClick={() => onDelete(row.english)}>
                                            Delete
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                ))}

                <div className="glossary-toolbar">
                    <button type="button" className="btn btn-outline" onClick={onSuggestEdits}>
                        Suggest edits
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setApplyAllOpen(!applyAllOpen)}>
                        Apply all
                    </button>
                </div>

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
            </div>
        </div>
    )
}

export default ModGlossaryModal

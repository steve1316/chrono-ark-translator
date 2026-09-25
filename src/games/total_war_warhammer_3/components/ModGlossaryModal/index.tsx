import React, { useCallback, useEffect, useState } from "react"

import { GlossaryEditor, type GlossaryEditorTerm } from "../../../../translation/GlossaryEditor"
import { addGlossaryTerm, deleteGlossaryTerm, glossaryApplyAll, glossarySuggestEdits, loadGlossary, updateGlossaryTerm } from "../../translationApi"
import Modal from "../../../../ui/Modal"
import { useConfirm } from "../../../../ui/useConfirm"

/** Props for `ModGlossaryModal`. */
interface ModGlossaryModalProps {
    /** Steam Workshop ID of the translation mod whose glossary this edits. */
    workshopId: string
    /** Called when the modal is closed. */
    onClose: () => void
    /** Called with how many edit suggestions were saved, so the page refreshes its Suggestions count. */
    onSuggestionsChanged: (added: number) => void
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
 * @param onSuggestionsChanged - Called with how many edit suggestions were saved.
 * @returns The rendered modal.
 */
const ModGlossaryModal: React.FC<ModGlossaryModalProps> = ({ workshopId, onClose, onSuggestionsChanged }) => {
    const [terms, setTerms] = useState<GlossaryEditorTerm[]>([])
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [suggesting, setSuggesting] = useState(false)
    const [applyAllOpen, setApplyAllOpen] = useState(false)
    const [applyAllOld, setApplyAllOld] = useState("")
    const [applyAllNew, setApplyAllNew] = useState("")
    const [applyResult, setApplyResult] = useState("")
    const { confirm, confirmDialog } = useConfirm()

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
        const ok = await confirm({ title: "Remove glossary term", message: `Remove the glossary entry "${english}"?`, confirmLabel: "Remove", variant: "danger" })
        if (!ok) return
        try {
            await deleteGlossaryTerm(workshopId, english)
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const onSuggestEdits = async () => {
        setSuggesting(true)
        setNotice("")
        try {
            const result = await glossarySuggestEdits(workshopId)
            onSuggestionsChanged(result.new)
            setNotice(result.new > 0 ? `Added ${result.new} edit suggestion(s). Review them from the Suggestions button.` : "No edits to suggest.")
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setSuggesting(false)
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
            <button type="button" className="btn btn-outline btn-xs" onClick={onSuggestEdits} disabled={suggesting}>
                {suggesting ? "Suggesting..." : "Suggest Edits"}
            </button>
            <button type="button" className="btn btn-outline btn-xs tone-accent" onClick={() => setApplyAllOpen(!applyAllOpen)}>
                Apply All
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
        </>
    )

    return (
        <Modal title="Mod Glossary" size="xl" fill headerActions={headerActions} onClose={onClose}>
            {error && <p className="dialog-error">{error}</p>}
            {notice && <p className="help-text dialog-notice">{notice}</p>}
            <GlossaryEditor terms={terms} groupByCategory fillHeight emptyMessage="No glossary entries yet." onAdd={handleAdd} onUpdate={handleUpdate} onRemove={handleRemove} footer={footer} />
            {confirmDialog}
        </Modal>
    )
}

export default ModGlossaryModal

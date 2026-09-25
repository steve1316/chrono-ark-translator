import { useState } from "react"
import { gameApi } from "../../../../api/games"
import type { GlossaryTerm, LocString } from "../../../../shared_types"
import { GlossaryEditor, type GlossaryEditorTerm } from "../../../../translation/GlossaryEditor"
import GlossaryReplacePreviewModal, { type ReplacePreview } from "../GlossaryReplacePreviewModal"

const CATEGORY_OPTIONS = ["custom", "characters", "skills", "buffs/debuffs", "items", "mechanics"]
const LANGUAGES = ["Chinese", "Korean", "Japanese"]

/** Props for ChronoArkGlossaryPanel. */
interface ChronoArkGlossaryPanelProps {
    /** The mod's glossary terms (owned by the parent, shared with the toolbar count and suggestion flow). */
    glossary: Record<string, GlossaryTerm>
    /** Mod id for glossary CRUD calls. */
    modId: string
    /** All strings, used to compute affected rows when applying a term. */
    strings: LocString[]
    /** Called after the panel changes the glossary so the parent re-fetches it. */
    onChanged: () => void
    /** Called after a successful replace-apply with a result message (parent banners + refreshes). */
    onApplied: (message: string) => void
    /** Called to request deleting all terms (parent opens the shared confirm dialog). */
    onRequestDeleteAll: () => void
    /** Called after the panel triggers new edit suggestions so the parent re-fetches them. */
    onSuggestionsChanged: () => void
}

/**
 * Inline panel for managing a mod's glossary terms. A thin wrapper around the shared `GlossaryEditor`: it maps CA's per-language glossary to/from the
 * editor's shape, wires CA's REST CRUD, and keeps CA's power features (per-term Apply + Apply-All via the replace-preview modal, Suggest Edits, Delete All).
 * @param glossary - The mod's glossary terms.
 * @param modId - Mod id for CRUD calls.
 * @param strings - All strings, for computing affected rows.
 * @param onChanged - Re-fetch the glossary after a change.
 * @param onApplied - Banner + refresh after a replace-apply.
 * @param onRequestDeleteAll - Open the shared confirm dialog for delete-all.
 * @param onSuggestionsChanged - Re-fetch suggestions after suggest-edits.
 * @returns The panel element plus its replace-preview modal.
 */
export default function ChronoArkGlossaryPanel({ glossary, modId, strings, onChanged, onApplied, onRequestDeleteAll, onSuggestionsChanged }: ChronoArkGlossaryPanelProps) {
    const [renamedTerm, setRenamedTerm] = useState<{ oldName: string; newName: string } | null>(null)
    const [replacePreview, setReplacePreview] = useState<ReplacePreview | null>(null)

    const terms: GlossaryEditorTerm[] = Object.entries(glossary).map(([key, info]) => ({
        english: info.english || key,
        category: info.category || "custom",
        sourceMappings: info.source_mappings || {},
    }))

    const handleAdd = async (term: GlossaryEditorTerm) => {
        await gameApi("chrono_ark").post(`/mods/${modId}/glossary`, { english: term.english, source_mappings: term.sourceMappings, category: term.category })
        onChanged()
    }

    const handleUpdate = async (oldEnglish: string, term: GlossaryEditorTerm) => {
        // CA edits by delete-then-add. Track renames so a follow-up Apply can find the old English text in translations.
        await gameApi("chrono_ark").post(`/mods/${modId}/glossary/delete`, { terms: [oldEnglish] })
        await gameApi("chrono_ark").post(`/mods/${modId}/glossary`, { english: term.english, source_mappings: term.sourceMappings, category: term.category })
        if (term.english !== oldEnglish) setRenamedTerm({ oldName: oldEnglish, newName: term.english })
        onChanged()
    }

    const handleRemove = async (english: string) => {
        await gameApi("chrono_ark").post(`/mods/${modId}/glossary/delete`, { terms: [english] })
        onChanged()
    }

    const applyTerm = (term: GlossaryEditorTerm) => {
        const english = term.english
        const oldEnglish = renamedTerm && renamedTerm.newName === english ? renamedTerm.oldName : ""
        const sourceText = Object.values(term.sourceMappings)[0] || ""
        if (!sourceText) return
        const sourceMatches = strings.filter((s) => s.source.includes(sourceText))
        const affected = oldEnglish
            ? sourceMatches
                  .filter((s) => s.english.includes(oldEnglish))
                  .map((s) => ({ key: s.key, old_text: s.english, new_text: s.english.replace(new RegExp(oldEnglish.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), english) }))
            : sourceMatches.filter((s) => !s.english).map((s) => ({ key: s.key, old_text: s.english, new_text: english }))
        setReplacePreview({ oldTerm: oldEnglish, newTerm: english, sourceText, needsInput: !oldEnglish, affected })
    }

    const applyAll = () => {
        const affected: { key: string; old_text: string; new_text: string }[] = []
        for (const [english, info] of Object.entries(glossary)) {
            const sourceText = Object.values(info.source_mappings || {})[0] || ""
            if (!sourceText) continue
            for (const s of strings) {
                if (affected.some((a) => a.key === s.key)) continue
                if (s.source !== sourceText) continue
                if (s.english === english) continue
                affected.push({ key: s.key, old_text: s.english, new_text: english })
            }
        }
        if (affected.length === 0) onApplied("No strings need updating from glossary terms.")
        else setReplacePreview({ oldTerm: "", newTerm: "glossary terms", sourceText: "", needsInput: false, affected })
    }

    const suggestEdits = async () => {
        try {
            const res = await gameApi("chrono_ark").post(`/mods/${modId}/glossary/suggest-edits`)
            if (res.ok) {
                const data = await res.json()
                if (data.new > 0) {
                    onSuggestionsChanged()
                    onApplied(`Found ${data.new} edit suggestion(s).`)
                } else {
                    onApplied("No edits to suggest.")
                }
            }
        } catch (err) {
            console.error("Failed to suggest edits:", err)
        }
    }

    const headerActions =
        terms.length > 0 ? (
            <>
                <button className="btn btn-outline btn-xs" onClick={suggestEdits}>
                    Suggest Edits
                </button>
                <button className="btn btn-outline btn-xs tone-accent" onClick={applyAll}>
                    Apply All
                </button>
                <button className="btn btn-outline btn-xs tone-danger" onClick={onRequestDeleteAll}>
                    Delete All
                </button>
            </>
        ) : undefined

    return (
        <>
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                <GlossaryEditor
                    title="Mod Glossary Terms"
                    terms={terms}
                    perLanguage
                    languages={LANGUAGES}
                    categoryOptions={CATEGORY_OPTIONS}
                    emptyMessage="No mod-specific glossary terms yet. Add terms above or accept AI suggestions."
                    onAdd={handleAdd}
                    onUpdate={handleUpdate}
                    onRemove={handleRemove}
                    headerActions={headerActions}
                    renderRowActions={(term) => (
                        <button className="btn btn-outline btn-xs tone-accent" onClick={() => applyTerm(term)}>
                            Apply
                        </button>
                    )}
                />
            </div>
            {replacePreview && (
                <GlossaryReplacePreviewModal
                    initialPreview={replacePreview}
                    strings={strings}
                    modId={modId}
                    onClose={() => {
                        setReplacePreview(null)
                        setRenamedTerm(null)
                    }}
                    onApplied={onApplied}
                />
            )}
        </>
    )
}

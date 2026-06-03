import { useState } from "react"
import { gameApi } from "../../../../api/games"
import type { GlossaryTerm, LocString } from "../../../../shared_types"
import GlossaryReplacePreviewModal, { type ReplacePreview } from "../GlossaryReplacePreviewModal"

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
 * Inline panel for managing a mod's glossary terms (add / edit / remove / apply / apply-all / suggest-edits). The glossary itself is owned by the parent
 * (shared with the toolbar count and suggestion flow) and passed in; this panel owns only its form, rename-tracking, and replace-preview state, and renders
 * the replace-preview modal. Extracted from the Chrono Ark details page so that page can compose the shared `<TranslationPage>` shell.
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
    const [newTermEnglish, setNewTermEnglish] = useState("")
    const [newTermSource, setNewTermSource] = useState("")
    const [newTermLang, setNewTermLang] = useState("Chinese")
    const [newTermCategory, setNewTermCategory] = useState("custom")
    const [editingTerm, setEditingTerm] = useState<string | null>(null)
    const [editTermEnglish, setEditTermEnglish] = useState("")
    const [editTermSource, setEditTermSource] = useState("")
    const [editTermLang, setEditTermLang] = useState("Chinese")
    const [editTermCategory, setEditTermCategory] = useState("custom")
    const [renamedTerm, setRenamedTerm] = useState<{ oldName: string; newName: string } | null>(null)
    const [replacePreview, setReplacePreview] = useState<ReplacePreview | null>(null)

    return (
        <>
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 style={{ margin: 0 }}>Mod Glossary Terms</h3>
                    {Object.keys(glossary).length > 0 && (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                className="btn btn-outline"
                                style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem" }}
                                onClick={async () => {
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
                                }}
                            >
                                Suggest Edits
                            </button>
                            <button
                                className="btn btn-outline"
                                style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem", color: "var(--accent-primary)", borderColor: "rgba(138,180,248,0.3)" }}
                                onClick={() => {
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
                                    if (affected.length === 0) {
                                        onApplied("No strings need updating from glossary terms.")
                                    } else {
                                        setReplacePreview({ oldTerm: "", newTerm: "glossary terms", sourceText: "", needsInput: false, affected })
                                    }
                                }}
                            >
                                Apply All
                            </button>
                            <button
                                className="btn btn-outline"
                                style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                onClick={() => {
                                    onRequestDeleteAll()
                                }}
                            >
                                Delete All
                            </button>
                        </div>
                    )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    <input
                        type="text"
                        placeholder="English term"
                        value={newTermEnglish}
                        onChange={(e) => setNewTermEnglish(e.target.value)}
                        style={{
                            padding: "0.5rem",
                            borderRadius: "6px",
                            background: "rgba(0,0,0,0.2)",
                            border: "1px solid var(--glass-border)",
                            color: "var(--text-main)",
                            flex: 1,
                            minWidth: "120px",
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Source text"
                        value={newTermSource}
                        onChange={(e) => setNewTermSource(e.target.value)}
                        style={{
                            padding: "0.5rem",
                            borderRadius: "6px",
                            background: "rgba(0,0,0,0.2)",
                            border: "1px solid var(--glass-border)",
                            color: "var(--text-main)",
                            flex: 1,
                            minWidth: "120px",
                        }}
                    />
                    <select
                        value={newTermLang}
                        onChange={(e) => setNewTermLang(e.target.value)}
                        style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}
                    >
                        <option value="Chinese">Chinese</option>
                        <option value="Korean">Korean</option>
                        <option value="Japanese">Japanese</option>
                    </select>
                    <select
                        value={newTermCategory}
                        onChange={(e) => setNewTermCategory(e.target.value)}
                        style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}
                    >
                        <option value="custom">Custom</option>
                        <option value="characters">Characters</option>
                        <option value="skills">Skills</option>
                        <option value="buffs/debuffs">Buffs/Debuffs</option>
                        <option value="items">Items</option>
                        <option value="mechanics">Mechanics</option>
                    </select>
                    <button
                        className="btn btn-primary"
                        disabled={!newTermEnglish.trim()}
                        onClick={async () => {
                            await gameApi("chrono_ark").post(`/mods/${modId}/glossary`, {
                                english: newTermEnglish,
                                source_mappings: { [newTermLang]: newTermSource },
                                category: newTermCategory,
                            })
                            setNewTermEnglish("")
                            setNewTermSource("")
                            onChanged()
                        }}
                    >
                        Add
                    </button>
                </div>
                {Object.keys(glossary).length === 0 ? (
                    <p style={{ color: "var(--text-dim)", textAlign: "center" }}>No mod-specific glossary terms yet. Add terms above or accept AI suggestions.</p>
                ) : (
                    <div style={{ maxHeight: "300px", overflow: "auto", paddingRight: "0.75rem" }}>
                        {Object.entries(glossary)
                            .sort(([aKey, aInfo], [bKey, bInfo]) => (aInfo.english || aKey).localeCompare(bInfo.english || bKey))
                            .map(([termKey, info]) => {
                                const english = info.english || termKey
                                return (
                                    <div key={termKey} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--glass-border)" }}>
                                        {editingTerm === termKey ? (
                                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                                                <input
                                                    type="text"
                                                    value={editTermEnglish}
                                                    onChange={(e) => setEditTermEnglish(e.target.value)}
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--accent-primary)",
                                                        color: "var(--text-main)",
                                                        flex: 1,
                                                        minWidth: "100px",
                                                    }}
                                                />
                                                <input
                                                    type="text"
                                                    value={editTermSource}
                                                    onChange={(e) => setEditTermSource(e.target.value)}
                                                    placeholder="Source text"
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--accent-primary)",
                                                        color: "var(--text-main)",
                                                        flex: 1,
                                                        minWidth: "100px",
                                                    }}
                                                />
                                                <select
                                                    value={editTermLang}
                                                    onChange={(e) => setEditTermLang(e.target.value)}
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--glass-border)",
                                                        color: "var(--text-main)",
                                                    }}
                                                >
                                                    <option value="Chinese">Chinese</option>
                                                    <option value="Korean">Korean</option>
                                                    <option value="Japanese">Japanese</option>
                                                </select>
                                                <select
                                                    value={editTermCategory}
                                                    onChange={(e) => setEditTermCategory(e.target.value)}
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--glass-border)",
                                                        color: "var(--text-main)",
                                                    }}
                                                >
                                                    <option value="custom">Custom</option>
                                                    <option value="characters">Characters</option>
                                                    <option value="skills">Skills</option>
                                                    <option value="buffs/debuffs">Buffs/Debuffs</option>
                                                    <option value="items">Items</option>
                                                    <option value="mechanics">Mechanics</option>
                                                </select>
                                                <button
                                                    className="btn btn-primary"
                                                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                                                    onClick={async () => {
                                                        // Delete old term when editing
                                                        await gameApi("chrono_ark").post(`/mods/${modId}/glossary/delete`, { terms: [termKey] })
                                                        await gameApi("chrono_ark").post(`/mods/${modId}/glossary`, {
                                                            english: editTermEnglish,
                                                            source_mappings: { [editTermLang]: editTermSource },
                                                            category: editTermCategory,
                                                        })
                                                        if (editTermEnglish !== english) {
                                                            setRenamedTerm({ oldName: english, newName: editTermEnglish })
                                                        }
                                                        setEditingTerm(null)
                                                        onChanged()
                                                    }}
                                                >
                                                    Save
                                                </button>
                                                <button className="btn btn-outline" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }} onClick={() => setEditingTerm(null)}>
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div>
                                                    <span style={{ fontWeight: 500 }}>{english}</span>
                                                    <span style={{ color: "var(--text-dim)", marginLeft: "0.75rem", fontSize: "0.85rem" }}>
                                                        {Object.entries(info.source_mappings || {})
                                                            .map(([lang, text]) => `${lang}: ${text}`)
                                                            .join(", ")}
                                                    </span>
                                                    <span
                                                        style={{
                                                            marginLeft: "0.75rem",
                                                            fontSize: "0.75rem",
                                                            padding: "0.1rem 0.4rem",
                                                            borderRadius: "4px",
                                                            background: "rgba(138,180,248,0.15)",
                                                            color: "var(--accent-primary)",
                                                            textTransform: "capitalize",
                                                        }}
                                                    >
                                                        {info.category}
                                                    </span>
                                                </div>
                                                <div style={{ display: "flex", gap: "0.35rem" }}>
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                                                        onClick={() => {
                                                            setRenamedTerm(null)
                                                            setEditingTerm(termKey)
                                                            setEditTermEnglish(english)
                                                            const firstLang = Object.keys(info.source_mappings || {})[0] || "Chinese"
                                                            setEditTermSource((info.source_mappings || {})[firstLang] || "")
                                                            setEditTermLang(firstLang)
                                                            setEditTermCategory(info.category || "custom")
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem", color: "var(--accent-primary)", borderColor: "rgba(138,180,248,0.3)" }}
                                                        onClick={() => {
                                                            const oldEnglish = renamedTerm && renamedTerm.newName === english ? renamedTerm.oldName : ""
                                                            const sourceText = Object.values(info.source_mappings || {})[0] || ""
                                                            if (!sourceText) return
                                                            const sourceMatches = strings.filter((s) => s.source.includes(sourceText))
                                                            const affected = oldEnglish
                                                                ? sourceMatches
                                                                      .filter((s) => s.english.includes(oldEnglish))
                                                                      .map((s) => ({
                                                                          key: s.key,
                                                                          old_text: s.english,
                                                                          new_text: s.english.replace(new RegExp(oldEnglish.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), english),
                                                                      }))
                                                                : sourceMatches.filter((s) => !s.english).map((s) => ({ key: s.key, old_text: s.english, new_text: english }))
                                                            setReplacePreview({ oldTerm: oldEnglish, newTerm: english, sourceText, needsInput: !oldEnglish, affected })
                                                        }}
                                                    >
                                                        Apply
                                                    </button>
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                                        onClick={async () => {
                                                            await gameApi("chrono_ark").post(`/mods/${modId}/glossary/delete`, { terms: [termKey] })
                                                            onChanged()
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                    </div>
                )}
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

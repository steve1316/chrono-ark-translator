import { useState } from "react"
import { gameApi } from "../../../../api/games"
import type { LocString } from "../../../../shared_types"

/** A single row affected by a glossary replacement. */
interface AffectedRow {
    /** Localization key. */
    key: string
    /** Current English text. */
    old_text: string
    /** English text after the replacement. */
    new_text: string
}

/** The preview payload describing a pending glossary replacement. */
export interface ReplacePreview {
    /** Old English term being replaced (empty when filling in for the first time). */
    oldTerm: string
    /** New English term to apply. */
    newTerm: string
    /** Source-language text whose rows are targeted. */
    sourceText: string
    /** When true, the user must type the old English term before rows can be computed. */
    needsInput: boolean
    /** Rows that would change. */
    affected: AffectedRow[]
}

/** Props for GlossaryReplacePreviewModal. */
interface GlossaryReplacePreviewModalProps {
    /** Initial preview to seed the modal's local state. */
    initialPreview: ReplacePreview
    /** All strings, used to recompute affected rows when the user types an old term. */
    strings: LocString[]
    /** Mod id whose strings get the replacement written. */
    modId: string
    /** Called when the modal closes (cancel / backdrop / after apply). */
    onClose: () => void
    /** Called after a successful apply with a result message so the parent can banner + refresh. */
    onApplied: (message: string) => void
}

/**
 * Modal that previews and applies a glossary-term replacement across a mod's translations, highlighting the before/after diff per row. Holds the preview in
 * local state (the user can refine the old term and dismiss individual rows). Extracted from the Chrono Ark details page so that page can compose the shell.
 * @param initialPreview - Initial preview payload.
 * @param strings - All strings, for recomputing affected rows.
 * @param modId - Mod id whose strings get written.
 * @param onClose - Close handler.
 * @param onApplied - Called with a result message after a successful apply.
 * @returns The modal element.
 */
export default function GlossaryReplacePreviewModal({ initialPreview, strings, modId, onClose, onApplied }: GlossaryReplacePreviewModalProps) {
    const [preview, setPreview] = useState<ReplacePreview>(initialPreview)

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose()
                }
            }}
        >
            <div className="glass-card" style={{ width: "800px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2 style={{ margin: 0 }}>Apply glossary term: "{preview.newTerm}"</h2>
                    <button
                        onClick={() => {
                            onClose()
                        }}
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
                <p style={{ color: "var(--text-dim)", marginBottom: "1rem", fontSize: "0.85rem" }}>Rows where source contains "{preview.sourceText}"</p>
                {preview.needsInput && (
                    <div style={{ marginBottom: "1rem" }}>
                        <input
                            type="text"
                            placeholder="Old English text to find and replace"
                            value={preview.oldTerm}
                            onChange={(e) => {
                                const oldTerm = e.target.value
                                const sourceMatches = strings.filter((s) => s.source.includes(preview.sourceText))
                                const affected = oldTerm
                                    ? sourceMatches
                                          .filter((s) => s.english.includes(oldTerm))
                                          .map((s) => {
                                              const escaped = oldTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                                              return { key: s.key, old_text: s.english, new_text: s.english.replace(new RegExp(escaped, "g"), preview.newTerm) }
                                          })
                                    : sourceMatches.filter((s) => !s.english).map((s) => ({ key: s.key, old_text: s.english, new_text: preview.newTerm }))
                                setPreview({ ...preview, oldTerm, affected })
                            }}
                            style={{
                                padding: "0.5rem",
                                borderRadius: "6px",
                                background: "rgba(0,0,0,0.2)",
                                border: "1px solid var(--glass-border)",
                                color: "var(--text-main)",
                                width: "100%",
                            }}
                        />
                    </div>
                )}
                {preview.affected.length === 0 ? (
                    <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>
                        {preview.oldTerm
                            ? `No rows found with source "${preview.sourceText}" and English containing "${preview.oldTerm}".`
                            : `No rows found with source "${preview.sourceText}" and empty English.`}
                    </p>
                ) : (
                    <>
                        <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>
                            {preview.affected.length} row(s) found
                            {preview.oldTerm ? ` — replacing "${preview.oldTerm}" with "${preview.newTerm}"` : ""}:
                        </p>
                        <div style={{ maxHeight: "50vh", overflow: "auto", marginBottom: "1rem" }}>
                            {preview.affected.map((item) => (
                                <div key={item.key} style={{ padding: "0.75rem", marginBottom: "0.5rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--glass-border)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{item.key}</div>
                                        <button
                                            onClick={() => setPreview((prev) => ({ ...prev, affected: prev.affected.filter((a) => a.key !== item.key) }))}
                                            style={{
                                                background: "none",
                                                border: "none",
                                                color: "var(--text-dim)",
                                                cursor: "pointer",
                                                fontSize: "1.1rem",
                                                padding: "0 0.25rem",
                                                lineHeight: 1,
                                            }}
                                            title="Dismiss this row"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                    {item.old_text !== item.new_text ? (
                                        <>
                                            <div style={{ marginBottom: "0.25rem" }}>
                                                {preview.oldTerm ? (
                                                    item.old_text.split(new RegExp(`(${preview.oldTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g")).map((part, i) =>
                                                        part === preview.oldTerm ? (
                                                            <span key={i} style={{ color: "#ff6b6b", textDecoration: "line-through" }}>
                                                                {part}
                                                            </span>
                                                        ) : (
                                                            <span key={i} style={{ color: "var(--text-main)" }}>
                                                                {part}
                                                            </span>
                                                        )
                                                    )
                                                ) : (
                                                    <span style={{ color: "#ff6b6b", textDecoration: "line-through" }}>{item.old_text || <em style={{ color: "var(--text-dim)" }}>empty</em>}</span>
                                                )}
                                            </div>
                                            <div>
                                                {preview.oldTerm ? (
                                                    item.new_text.split(new RegExp(`(${preview.newTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g")).map((part, i) =>
                                                        part === preview.newTerm ? (
                                                            <span key={i} style={{ color: "#34d399" }}>
                                                                {part}
                                                            </span>
                                                        ) : (
                                                            <span key={i} style={{ color: "var(--text-main)" }}>
                                                                {part}
                                                            </span>
                                                        )
                                                    )
                                                ) : (
                                                    <span style={{ color: "#34d399" }}>{item.new_text}</span>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <span style={{ color: "var(--text-main)" }}>{item.old_text}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {preview.affected.some((item) => item.old_text !== item.new_text) && (
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                        onClose()
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        try {
                                            for (const item of preview.affected) {
                                                await gameApi("chrono_ark").post(`/mods/${modId}/strings`, { key: item.key, english: item.new_text })
                                            }
                                            onApplied(`Applied "${preview.newTerm}" to ${preview.affected.length} translation(s).`)
                                            onClose()
                                        } catch (err) {
                                            console.error("Failed to apply replacement:", err)
                                        }
                                    }}
                                >
                                    Apply {preview.affected.length} Replacement(s)
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

import { useState } from "react"

/** Props for `ModifiedAttributesSection`. */
interface Props {
    /** Current attribute list. */
    value: string[]
    /** Suggestions for the autocomplete (top-level `SUPPORTED_EFFECTS` keys). */
    suggestions: string[]
    /** Called with the next list on add/remove. */
    onChange: (next: string[]) => void
}

/**
 * Section 2 of the SupportedModForm. Renders the current attributes as
 * removable chips and a text input that adds a new attribute when Enter is
 * pressed. Suggestions appear in a `<datalist>` for autocomplete.
 *
 * @param value Current attribute list.
 * @param suggestions Autocomplete suggestions.
 * @param onChange Called with the next list.
 * @returns The rendered section.
 */
const ModifiedAttributesSection = ({ value, suggestions, onChange }: Props) => {
    const [draft, setDraft] = useState("")
    const commit = () => {
        const trimmed = draft.trim()
        if (!trimmed || value.includes(trimmed)) {
            setDraft("")
            return
        }
        onChange([...value, trimmed])
        setDraft("")
    }
    return (
        <fieldset className="glass-card" style={{ padding: "1rem", border: "1px solid var(--glass-border)", borderRadius: 8, marginTop: "1rem" }}>
            <legend style={{ padding: "0 0.5rem" }}>Modified Attributes</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                {value.map((attr) => (
                    <span key={attr} className="id-badge" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        {attr}
                        <button type="button" aria-label={`Remove ${attr}`} onClick={() => onChange(value.filter((v) => v !== attr))} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
                            x
                        </button>
                    </span>
                ))}
            </div>
            <input
                className="btn-outline"
                type="text"
                list="modified-attribute-suggestions"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault()
                        commit()
                    }
                }}
                onBlur={commit}
                placeholder="Add attribute (Enter to commit)"
                style={{ width: "100%", padding: "0.5rem" }}
            />
            <datalist id="modified-attribute-suggestions">
                {suggestions.map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>
        </fieldset>
    )
}

export default ModifiedAttributesSection

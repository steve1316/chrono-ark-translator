/** One pattern -> faction mapping row. */
export interface PatternOverrideRow {
    /** Pattern key (e.g. `"*"`). */
    pattern: string
    /** Faction code (e.g. `"vmp"`). */
    faction: string
}

/** Props for `PatternOverridesSection`. */
interface Props {
    /** Current rows. */
    value: PatternOverrideRow[]
    /** Called with the next rows on edit/add/remove. */
    onChange: (next: PatternOverrideRow[]) => void
}

/**
 * Section 3 of the SupportedModForm. Repeating row editor for the `pattern_overrides` dict.
 * The submitted payload serializes to `{ "pattern": "faction", ... }` (an empty list -> field omitted).
 *
 * @param value Current rows.
 * @param onChange Called with the next rows.
 * @returns The rendered section.
 */
const PatternOverridesSection = ({ value, onChange }: Props) => {
    const update = (idx: number, patch: Partial<PatternOverrideRow>) => onChange(value.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
    return (
        <fieldset className="glass-card" style={{ padding: "1rem", border: "1px solid var(--glass-border)", borderRadius: 8, marginTop: "1rem" }}>
            <legend style={{ padding: "0 0.5rem" }}>Pattern Overrides</legend>
            {value.map((row, idx) => (
                <div key={idx} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <input
                        className="btn-outline"
                        type="text"
                        value={row.pattern}
                        onChange={(e) => update(idx, { pattern: e.target.value })}
                        placeholder="pattern"
                        style={{ flex: 1, padding: "0.5rem" }}
                    />
                    <input
                        className="btn-outline"
                        type="text"
                        value={row.faction}
                        onChange={(e) => update(idx, { faction: e.target.value })}
                        placeholder="faction"
                        style={{ flex: 1, padding: "0.5rem" }}
                    />
                    <button type="button" className="btn btn-outline" onClick={() => onChange(value.filter((_, i) => i !== idx))}>
                        Remove
                    </button>
                </div>
            ))}
            <button type="button" className="btn btn-outline" onClick={() => onChange([...value, { pattern: "", faction: "" }])}>
                + Add row
            </button>
        </fieldset>
    )
}

export default PatternOverridesSection

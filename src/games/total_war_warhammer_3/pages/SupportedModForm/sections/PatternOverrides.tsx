import Panel from "../../../../../ui/Panel"

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
        <Panel as="fieldset" title="Pattern Overrides">
            <div className="form-stack">
                {value.map((row, idx) => (
                    <div key={idx} className="form-row">
                        <input className="input" type="text" aria-label={`Pattern ${idx + 1}`} value={row.pattern} onChange={(e) => update(idx, { pattern: e.target.value })} placeholder="pattern" />
                        <input className="input" type="text" aria-label={`Faction ${idx + 1}`} value={row.faction} onChange={(e) => update(idx, { faction: e.target.value })} placeholder="faction" />
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange(value.filter((_, i) => i !== idx))}>
                            Remove
                        </button>
                    </div>
                ))}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...value, { pattern: "", faction: "" }])}>
                    + Add row
                </button>
            </div>
        </Panel>
    )
}

export default PatternOverridesSection

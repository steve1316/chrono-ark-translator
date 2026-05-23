/** One character entry inside `allowed_lords` or `allowed_heroes`. */
export interface CharacterRow {
    /** TW3 `land_unit` id. */
    land_unit: string
    /** TW3 `agent_subtype` id. */
    agent_subtype: string
    /** Optional comma-separated skill ids. */
    skill_overrides: string
}

/** A single faction section with its allowed_lords and allowed_heroes lists. */
export interface FactionEntry {
    /** Faction code (`vmp`, `tomb_kings`, ...). */
    faction: string
    /** Allowed lords. */
    allowed_lords: CharacterRow[]
    /** Allowed heroes. */
    allowed_heroes: CharacterRow[]
}

/** Props for `CharacterOverridesSection`. */
interface Props {
    /** Current faction entries. */
    value: FactionEntry[]
    /** Called with the next entries on edit/add/remove. */
    onChange: (next: FactionEntry[]) => void
}

/**
 * Section 4 of the SupportedModForm. Nested editor: faction sections, each
 * with two sub-lists (allowed_lords, allowed_heroes), each containing rows
 * of `land_unit` / `agent_subtype` / `skill_overrides`.
 *
 * @param value Current faction entries.
 * @param onChange Called with the next entries.
 * @returns The rendered section.
 */
const CharacterOverridesSection = ({ value, onChange }: Props) => {
    const updateFaction = (idx: number, patch: Partial<FactionEntry>) => onChange(value.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
    const updateRow = (fIdx: number, key: "allowed_lords" | "allowed_heroes", rIdx: number, patch: Partial<CharacterRow>) =>
        updateFaction(fIdx, {
            [key]: value[fIdx][key].map((row, i) => (i === rIdx ? { ...row, ...patch } : row)),
        } as Partial<FactionEntry>)
    const addRow = (fIdx: number, key: "allowed_lords" | "allowed_heroes") =>
        updateFaction(fIdx, { [key]: [...value[fIdx][key], { land_unit: "", agent_subtype: "", skill_overrides: "" }] } as Partial<FactionEntry>)
    const removeRow = (fIdx: number, key: "allowed_lords" | "allowed_heroes", rIdx: number) => updateFaction(fIdx, { [key]: value[fIdx][key].filter((_, i) => i !== rIdx) } as Partial<FactionEntry>)

    const renderRows = (fIdx: number, key: "allowed_lords" | "allowed_heroes", label: string) => (
        <div style={{ marginBottom: "0.75rem" }}>
            <h4 style={{ margin: "0.5rem 0" }}>{label}</h4>
            {value[fIdx][key].map((row, rIdx) => (
                <div key={rIdx} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    <input
                        className="btn-outline"
                        type="text"
                        placeholder="land_unit"
                        value={row.land_unit}
                        onChange={(e) => updateRow(fIdx, key, rIdx, { land_unit: e.target.value })}
                        style={{ flex: 2, padding: "0.5rem" }}
                    />
                    <input
                        className="btn-outline"
                        type="text"
                        placeholder="agent_subtype"
                        value={row.agent_subtype}
                        onChange={(e) => updateRow(fIdx, key, rIdx, { agent_subtype: e.target.value })}
                        style={{ flex: 2, padding: "0.5rem" }}
                    />
                    <input
                        className="btn-outline"
                        type="text"
                        placeholder="skill_overrides (comma-separated)"
                        value={row.skill_overrides}
                        onChange={(e) => updateRow(fIdx, key, rIdx, { skill_overrides: e.target.value })}
                        style={{ flex: 3, padding: "0.5rem" }}
                    />
                    <button type="button" className="btn btn-outline" onClick={() => removeRow(fIdx, key, rIdx)}>
                        Remove
                    </button>
                </div>
            ))}
            <button type="button" className="btn btn-outline" onClick={() => addRow(fIdx, key)}>
                + Add {label.slice(0, -1).toLowerCase()}
            </button>
        </div>
    )

    return (
        <fieldset className="glass-card" style={{ padding: "1rem", border: "1px solid var(--glass-border)", borderRadius: 8, marginTop: "1rem" }}>
            <legend style={{ padding: "0 0.5rem" }}>Character Overrides</legend>
            {value.map((faction, fIdx) => (
                <div key={fIdx} style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                        <label style={{ flex: 1 }}>
                            <span style={{ marginRight: "0.5rem" }}>Faction</span>
                            <input
                                className="btn-outline"
                                type="text"
                                value={faction.faction}
                                onChange={(e) => updateFaction(fIdx, { faction: e.target.value })}
                                style={{ padding: "0.5rem", width: "60%" }}
                            />
                        </label>
                        <button type="button" className="btn btn-outline" onClick={() => onChange(value.filter((_, i) => i !== fIdx))}>
                            Remove faction
                        </button>
                    </div>
                    {renderRows(fIdx, "allowed_lords", "Allowed Lords")}
                    {renderRows(fIdx, "allowed_heroes", "Allowed Heroes")}
                </div>
            ))}
            <button type="button" className="btn btn-outline" onClick={() => onChange([...value, { faction: "", allowed_lords: [], allowed_heroes: [] }])} style={{ marginTop: "0.5rem" }}>
                + Add faction
            </button>
        </fieldset>
    )
}

export default CharacterOverridesSection

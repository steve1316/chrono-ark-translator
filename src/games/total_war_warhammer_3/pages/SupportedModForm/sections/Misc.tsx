/** Props for `MiscSection`. */
interface Props {
    /** Current `ignore_generation` value. */
    ignoreGeneration: boolean
    /** Called with the next value. */
    onChange: (next: boolean) => void
}

/**
 * Section 5 of the SupportedModForm. Currently just the `ignore_generation` checkbox. Reserved as
 * the home for any future single-field flags.
 *
 * @param ignoreGeneration Current value of the flag.
 * @param onChange Called with the next value.
 * @returns The rendered section.
 */
const MiscSection = ({ ignoreGeneration, onChange }: Props) => (
    <fieldset className="glass-card" style={{ padding: "1rem", border: "1px solid var(--glass-border)", borderRadius: 8, marginTop: "1rem" }}>
        <legend style={{ padding: "0 0.5rem" }}>Misc</legend>
        <label>
            <input type="checkbox" checked={ignoreGeneration} onChange={(e) => onChange(e.target.checked)} /> ignore_generation
        </label>
    </fieldset>
)

export default MiscSection

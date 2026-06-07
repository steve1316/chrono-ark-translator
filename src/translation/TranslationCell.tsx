import EditableCell from "../components/EditableCell"

/** Props for `TranslationCell`. */
interface TranslationCellProps {
    /** Current translation text (the editable value). */
    value: string
    /** Previously-synced/on-disk text; shown struck-through above the editor when it differs from `value`. */
    previous?: string | null
    /** Whether the row is synced (tints the strikethrough green to match Chrono Ark). */
    synced: boolean
    /** When set, the row cannot be translated; the reason is shown instead of an editor. */
    untranslatableReason?: string
    /** Placeholder for the editor when empty. */
    placeholder?: string
    /** Persist a new value. */
    onSave: (value: string) => void
}

/**
 * Shared English/translation table cell for both games: an optional struck-through previous translation above an inline editor, or an untranslatable hint.
 * @param value - Current translation text.
 * @param previous - Previously-synced text (struck through when it differs).
 * @param synced - Whether the row is synced (greens the strikethrough).
 * @param untranslatableReason - When set, shown instead of the editor.
 * @param placeholder - Editor placeholder when empty.
 * @param onSave - Persist a new value.
 * @returns The cell element.
 */
export function TranslationCell({ value, previous, synced, untranslatableReason, placeholder, onSave }: TranslationCellProps) {
    if (untranslatableReason) {
        return (
            <span className="untranslatable-hint" title={untranslatableReason}>
                {untranslatableReason}
            </span>
        )
    }
    return (
        <>
            {previous && previous !== value && (
                <div className="prev-translation" style={synced ? { color: "rgba(52, 211, 153, 0.6)" } : undefined}>
                    {previous}
                </div>
            )}
            <EditableCell value={value} onSave={onSave} placeholder={placeholder ?? ""} />
        </>
    )
}

import { FaSearch } from "react-icons/fa"

/** Props for SearchInput. */
interface SearchInputProps {
    /** Current search text. */
    value: string
    /** Called with the new text on every keystroke, and with "" when cleared. */
    onChange: (value: string) => void
    /** Placeholder shown while empty. */
    placeholder: string
    /** Fixed width (e.g. matched to a card column). When omitted the field grows to fill its row. */
    width?: number | string
}

/**
 * Search field with a leading icon and a Clear search button, shared by the translation, dashboard and glossary pages.
 *
 * @param value Current search text.
 * @param onChange Text change handler.
 * @param placeholder Placeholder text.
 * @param width Optional fixed width.
 * @returns The search field.
 */
export default function SearchInput({ value, onChange, placeholder, width }: SearchInputProps) {
    return (
        <div className="search-input" style={width !== undefined ? { width, flex: "none" } : undefined}>
            <FaSearch className="search-input-icon" aria-hidden="true" />
            <input type="text" className="input search-input-field" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
            {value && (
                <button type="button" className="search-input-clear" onClick={() => onChange("")} title="Clear search" aria-label="Clear search">
                    &times;
                </button>
            )}
        </div>
    )
}

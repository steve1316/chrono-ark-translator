/** Props for HighlightText. */
interface HighlightTextProps {
    /** Text to render. */
    text: string
    /** Search query to highlight. Matching is case-insensitive and ignores surrounding whitespace. Empty means no highlighting. */
    query: string
}

/**
 * Escape a string so it matches literally inside a `RegExp`.
 *
 * @param s The raw string.
 * @returns The escaped string.
 */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Render text with every case-insensitive match of the search query wrapped in a `<mark>`.
 *
 * @param text Text to render.
 * @param query Search query to highlight.
 * @returns The text with matches highlighted.
 */
export default function HighlightText({ text, query }: HighlightTextProps) {
    const needle = query.trim()
    if (!needle || !text) return <>{text}</>
    // A capturing split keeps the matches at the odd indexes.
    const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "gi"))
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <mark key={i} className="search-highlight">
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    )
}

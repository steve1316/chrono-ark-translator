import { useEffect, useRef } from "react"
import { clearLog, useRunnerLog } from "../../hooks/useRunnerLog"

/** Props for `RunnerLogTerminal`. */
interface RunnerLogTerminalProps {
    /** When true, the terminal stretches to fill its flex parent vertically instead of using a fixed max-height. */
    fill?: boolean
}

/**
 * Scrollable terminal that renders the shared `useRunnerLog` buffer. Always rendered on the Runner page; shows a placeholder when empty. Auto-scrolls to the latest entry on each new line.
 *
 * @param fill When true, stretches to fill its flex parent and lets the inner `<pre>` grow with the viewport instead of capping at 400px.
 * @returns A `glass-card`-styled block containing a header row with the Clear button and a `<pre>` of log entries.
 */
export default function RunnerLogTerminal({ fill = false }: RunnerLogTerminalProps) {
    const lines = useRunnerLog()
    const scrollRef = useRef<HTMLPreElement | null>(null)

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [lines.length])

    const containerStyle: React.CSSProperties = fill ? { padding: "1rem", marginTop: "1rem", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } : { padding: "1rem", marginTop: "1rem" }

    const preStyle: React.CSSProperties = {
        margin: 0,
        padding: "0.75rem",
        background: "rgba(0,0,0,0.3)",
        borderRadius: 6,
        fontFamily: "monospace",
        fontSize: "0.85rem",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        ...(fill ? { flex: 1, minHeight: 0 } : { maxHeight: 400 }),
    }

    return (
        <div className="glass-card" style={containerStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 style={{ margin: 0 }}>Output</h3>
                <button className="btn btn-outline" onClick={clearLog} disabled={lines.length === 0}>
                    Clear
                </button>
            </div>
            <pre ref={scrollRef} style={preStyle}>
                {lines.length === 0 ? (
                    <div style={{ color: "var(--text-dim, #777)", fontStyle: "italic" }}>No output yet.</div>
                ) : (
                    lines.map((entry, i) =>
                        entry.kind === "separator" ? (
                            <div key={i} data-testid="log-separator" style={{ color: "var(--text-dim, #777)", fontStyle: "italic", margin: "0.25rem 0" }}>
                                {entry.text}
                            </div>
                        ) : (
                            <div key={i}>{entry.line}</div>
                        )
                    )
                )}
            </pre>
        </div>
    )
}

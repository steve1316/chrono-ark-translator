import { useEffect, useRef } from "react"
import { clearLog, useRunnerLog } from "../../hooks/useRunnerLog"

/**
 * Scrollable terminal that renders the shared `useRunnerLog` buffer. Always rendered on the Runner page; shows a placeholder when empty. Auto-scrolls to the latest entry on each new line.
 *
 * @returns A `glass-card`-styled block containing a header row with the Clear button and a `<pre>` of log entries.
 */
export default function RunnerLogTerminal() {
    const lines = useRunnerLog()
    const scrollRef = useRef<HTMLPreElement | null>(null)

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [lines.length])

    return (
        <div className="glass-card" style={{ padding: "1rem", marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <h3 style={{ margin: 0 }}>Output</h3>
                <button className="btn btn-outline" onClick={clearLog} disabled={lines.length === 0}>
                    Clear
                </button>
            </div>
            <pre
                ref={scrollRef}
                style={{
                    margin: 0,
                    padding: "0.75rem",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: 6,
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    maxHeight: 400,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                }}
            >
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
                        ),
                    )
                )}
            </pre>
        </div>
    )
}

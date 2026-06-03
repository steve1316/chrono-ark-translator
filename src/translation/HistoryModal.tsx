import { useState } from "react"
import type { ReactNode } from "react"

/** One normalized history/snapshot entry rendered by the shared modal. Each game maps its own backup/snapshot shape onto this. */
export interface HistoryModalEntry {
    /** Stable identifier used as the React key and passed back to restore/delete handlers. */
    id: string
    /** Primary line: the backup reason (Chrono Ark) or the snapshot label (WH3). */
    title: string
    /** "auto" for snapshots taken automatically before destructive ops, "manual" for user-requested saves. Drives the kind pill color. */
    kind: "auto" | "manual"
    /** ISO timestamp of when the entry was created. */
    createdAt: string
    /** Optional secondary metadata line (e.g. Chrono Ark's translated/total + glossary counts). Omitted when a game has nothing extra to show. */
    subtitle?: ReactNode
}

/** Props for the shared `HistoryModal`. */
interface HistoryModalProps {
    /** Header text. Defaults to "History Backups"; WH3's Reset action passes "Reset to snapshot". */
    title?: string
    /** Normalized entries to list, newest first (the parent is responsible for ordering). */
    entries: HistoryModalEntry[]
    /** Create a manual snapshot with the given label. Resolves when persisted; the modal clears its input and the parent re-fetches. */
    onSave: (label: string) => Promise<void>
    /** Called when the user clicks Restore on an entry. The parent decides how to confirm (shared ConfirmModal or window.confirm). */
    onRestore: (entry: HistoryModalEntry) => void
    /** Called when the user clicks Delete on an entry. The parent decides how to confirm. */
    onDelete: (entry: HistoryModalEntry) => void
    /** Called when the user closes the modal. */
    onClose: () => void
    /** Message shown when there are no entries. */
    emptyMessage?: string
}

/**
 * Shared history/snapshot modal used by both games. Presentational only: it owns the save-label input and saving state, and defers data fetching plus
 * restore/delete confirmation to the parent via callbacks. Each game wraps this with its own API and entry mapping so the two pages share one look.
 * @param title - Header text.
 * @param entries - Normalized entries to render.
 * @param onSave - Persists a manual snapshot with the typed label.
 * @param onRestore - Invoked with the entry to restore.
 * @param onDelete - Invoked with the entry to delete.
 * @param onClose - Closes the modal.
 * @param emptyMessage - Shown when there are no entries.
 * @returns The modal element.
 */
export default function HistoryModal({ title = "History Backups", entries, onSave, onRestore, onDelete, onClose, emptyMessage }: HistoryModalProps) {
    const [label, setLabel] = useState("")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            await onSave(label)
            setLabel("")
        } catch (err) {
            setError((err as Error).message || "Failed to save snapshot.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card" style={{ width: "700px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 style={{ margin: 0 }}>{title}</h2>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "2rem", lineHeight: 1, cursor: "pointer", padding: "0.25rem 0.5rem", borderRadius: "4px" }}
                        title="Close"
                    >
                        &times;
                    </button>
                </div>
                {error && <p style={{ color: "#ff4444", marginTop: 0, marginBottom: "1rem" }}>{error}</p>}
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                    <input
                        type="text"
                        placeholder="Snapshot label..."
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !saving) handleSave()
                        }}
                        style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid var(--glass-border)", background: "rgba(0,0,0,0.2)", color: "var(--text-main)" }}
                    />
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: "0.5rem 1rem", whiteSpace: "nowrap" }}>
                        {saving ? "Saving..." : "Save snapshot"}
                    </button>
                </div>
                {entries.length === 0 ? (
                    <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>{emptyMessage ?? "No snapshots yet."}</p>
                ) : (
                    <div>
                        {entries.map((entry) => (
                            <div
                                key={entry.id}
                                data-testid="snapshot-row"
                                style={{
                                    padding: "1rem",
                                    marginBottom: "0.75rem",
                                    background: "rgba(0,0,0,0.2)",
                                    borderRadius: "8px",
                                    border: "1px solid var(--glass-border)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <span className={`snapshot-kind ${entry.kind}`}>{entry.kind}</span>
                                        {entry.title}
                                    </div>
                                    <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{new Date(entry.createdAt).toLocaleString()}</div>
                                    {entry.subtitle != null && <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.15rem" }}>{entry.subtitle}</div>}
                                </div>
                                <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                                    <button className="btn btn-primary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }} onClick={() => onRestore(entry)}>
                                        Restore
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                        onClick={() => onDelete(entry)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

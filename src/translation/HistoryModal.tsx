import { useState } from "react"
import type { ReactNode } from "react"
import Modal from "../ui/Modal"

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
    /** Error from the parent's data layer, shown above the list. */
    error?: string | null
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
 * @param error - Parent data-layer error shown above the list, alongside any save error.
 * @returns The modal element.
 */
export default function HistoryModal({ title = "History Backups", entries, onSave, onRestore, onDelete, onClose, emptyMessage, error }: HistoryModalProps) {
    const [label, setLabel] = useState("")
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const handleSave = async () => {
        setSaving(true)
        setSaveError(null)
        try {
            await onSave(label)
            setLabel("")
        } catch (err) {
            setSaveError((err as Error).message || "Failed to save snapshot.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal title={title} size="md" onClose={onClose}>
            {(error || saveError) && <p style={{ color: "var(--tone-danger)", marginTop: 0, marginBottom: "1rem" }}>{error || saveError}</p>}
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
                                <button className="btn btn-primary btn-sm" onClick={() => onRestore(entry)}>
                                    Restore
                                </button>
                                <button className="btn btn-outline btn-sm tone-danger" onClick={() => onDelete(entry)}>
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    )
}

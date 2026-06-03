import { useEffect, useState } from "react"
import { gameApi } from "../../../../api/games"

/** One backup history entry for a mod. */
export interface HistoryEntry {
    /** Backup identifier. */
    id: string
    /** Why the backup was created (e.g. "Before translation run"). */
    reason: string
    /** ISO timestamp of when the backup was taken. */
    created_at: string
    /** Files captured in the backup. */
    files: string[]
    /** Translated string count at backup time, when recorded. */
    translated_count?: number
    /** Total translatable string count at backup time, when recorded. */
    total_count?: number
    /** Glossary term count at backup time, when recorded. */
    glossary_count?: number
}

/** Props for BackupHistoryModal. */
interface BackupHistoryModalProps {
    /** Mod whose backup history to display. */
    modId: string
    /** Called when the user closes the modal. */
    onClose: () => void
    /** Called when the user requests restoring a backup (the parent opens the confirm dialog). */
    onRestore: (entry: HistoryEntry) => void
    /** Called when the user requests deleting a backup (the parent opens the confirm dialog). */
    onDelete: (entry: HistoryEntry) => void
    /** Bump this to force a re-fetch of the backup list (e.g. after the parent confirms a delete). */
    refreshKey?: number
}

/**
 * Modal listing a mod's automatic backups with restore/delete actions. Fetches the history on mount; restore/delete defer to the parent's shared confirm
 * dialog via callbacks. Extracted from the Chrono Ark details page so that page can compose the shared `<TranslationPage>` shell.
 * @param modId - Mod id whose backups to fetch.
 * @param onClose - Called when the user closes the modal.
 * @param onRestore - Called with the entry the user wants to restore.
 * @param onDelete - Called with the entry the user wants to delete.
 * @returns The modal element.
 */
export default function BackupHistoryModal({ modId, onClose, onRestore, onDelete, refreshKey }: BackupHistoryModalProps) {
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await gameApi("chrono_ark").get(`/mods/${modId}/history`)
                if (res.ok && !cancelled) setHistoryEntries(await res.json())
            } catch (err) {
                console.error("Failed to fetch history:", err)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [modId, refreshKey])

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card" style={{ width: "700px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 style={{ margin: 0 }}>History Backups</h2>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "2rem", lineHeight: 1, cursor: "pointer", padding: "0.25rem 0.5rem", borderRadius: "4px" }}
                        title="Close"
                    >
                        &times;
                    </button>
                </div>
                {historyEntries.length === 0 ? (
                    <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No backups available yet. Backups are created automatically before destructive operations.</p>
                ) : (
                    <div>
                        {historyEntries.map((entry) => (
                            <div
                                key={entry.id}
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
                                    <div style={{ fontWeight: 500 }}>{entry.reason}</div>
                                    <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{new Date(entry.created_at).toLocaleString()}</div>
                                    <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                                        {(entry.total_count ?? 0) > 0 && (
                                            <span>
                                                {entry.translated_count} / {entry.total_count} strings translated
                                            </span>
                                        )}
                                        {(entry.total_count ?? 0) > 0 && (entry.glossary_count ?? 0) > 0 && <span> &middot; </span>}
                                        {(entry.glossary_count ?? 0) > 0 && (
                                            <span>
                                                {entry.glossary_count} glossary term{entry.glossary_count !== 1 ? "s" : ""}
                                            </span>
                                        )}
                                    </div>
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

import React, { useCallback, useEffect, useState } from "react"

import type { WH3SnapshotMeta } from "../../../../shared_types"
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from "../../translationApi"

/** Props for `HistoryModal`. */
interface HistoryModalProps {
    /** Steam Workshop ID of the translation mod whose snapshots to show. */
    workshopId: string
    /** Called when the modal is closed. */
    onClose: () => void
    /** When `true`, render the header as "Reset to snapshot" instead of "History". */
    defaultRestoreMode: boolean
    /** Called after a successful Restore so the parent page can re-fetch its drift. */
    onRestored: () => void
}

/**
 * Snapshot history viewer + manager. Lists snapshots newest first. Save / Restore / Delete.
 * Used by both the History toolbar button and the Reset action (`defaultRestoreMode=true`).
 *
 * @param props See `HistoryModalProps`.
 * @returns The rendered modal.
 */
const HistoryModal: React.FC<HistoryModalProps> = ({ workshopId, onClose, defaultRestoreMode, onRestored }) => {
    const [snaps, setSnaps] = useState<WH3SnapshotMeta[]>([])
    const [label, setLabel] = useState("")
    const [busy, setBusy] = useState<string>("")
    const [error, setError] = useState<string>("")

    const refresh = useCallback(async () => {
        try {
            const list = await listSnapshots(workshopId)
            setSnaps(list)
        } catch (e) {
            setError((e as Error).message)
        }
    }, [workshopId])

    useEffect(() => {
        refresh()
    }, [refresh])

    const onSave = useCallback(async () => {
        setBusy("save")
        setError("")
        try {
            await createSnapshot(workshopId, label || "manual save")
            setLabel("")
            await refresh()
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setBusy("")
        }
    }, [workshopId, label, refresh])

    const onRestoreOne = useCallback(
        async (ulid: string) => {
            const confirmed = window.confirm("Restore from this snapshot? Your current state will be auto-snapshotted first.")
            if (!confirmed) return
            setBusy(`restore-${ulid}`)
            setError("")
            try {
                await restoreSnapshot(workshopId, ulid)
                onRestored()
                await refresh()
            } catch (e) {
                setError((e as Error).message)
            } finally {
                setBusy("")
            }
        },
        [workshopId, refresh, onRestored]
    )

    const onDeleteOne = useCallback(
        async (ulid: string) => {
            const confirmed = window.confirm("Delete this snapshot? This cannot be undone.")
            if (!confirmed) return
            setBusy(`del-${ulid}`)
            setError("")
            try {
                await deleteSnapshot(workshopId, ulid)
                await refresh()
            } catch (e) {
                setError((e as Error).message)
            } finally {
                setBusy("")
            }
        },
        [workshopId, refresh]
    )

    return (
        <div
            className="modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card modal-panel" style={{ width: "700px" }}>
                <div className="modal-header">
                    <h2 style={{ margin: 0 }}>{defaultRestoreMode ? "Reset to snapshot" : "History"}</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                    <input
                        type="text"
                        placeholder="Snapshot label..."
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--surface)" }}
                    />
                    <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy === "save"}>
                        {busy === "save" ? "Saving..." : "Save snapshot"}
                    </button>
                </div>
                <div className="snapshot-list">
                    {snaps.length === 0 && <p style={{ color: "var(--text-dim)" }}>No snapshots yet.</p>}
                    {snaps.map((s) => (
                        <div key={s.ulid} className="snapshot-row" data-testid="snapshot-row">
                            <div className="snapshot-meta">
                                <div className="snapshot-label">{s.label}</div>
                                <div className="snapshot-sub">
                                    <span className={`snapshot-kind ${s.kind}`}>{s.kind}</span>
                                    <span> {new Date(s.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="snapshot-actions">
                                <button type="button" className="btn btn-outline" onClick={() => onRestoreOne(s.ulid)} disabled={busy === `restore-${s.ulid}`}>
                                    {busy === `restore-${s.ulid}` ? "Restoring..." : "Restore"}
                                </button>
                                <button type="button" className="btn btn-outline" onClick={() => onDeleteOne(s.ulid)} disabled={busy === `del-${s.ulid}`}>
                                    {busy === `del-${s.ulid}` ? "Deleting..." : "Delete"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default HistoryModal

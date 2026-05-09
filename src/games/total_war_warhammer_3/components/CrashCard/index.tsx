import { useState } from "react"
import { revealCrashFolder, type CrashSnapshot } from "../../api"

/** Props for `CrashCard`. */
interface Props {
    /** The snapshot manifest to render. */
    snap: CrashSnapshot
    /** Called when the user saves notes. Parent re-fetches via the listing endpoint. */
    onUpdate: (id: string, notes: string) => Promise<void> | void
    /** Called when the user confirms deletion. Parent removes from the list. */
    onDelete: (id: string) => Promise<void> | void
}

/**
 * Render a single crash snapshot with its file summary, an editable notes textarea,
 * and `Open folder` and `Delete` buttons. Delete uses a two-click confirmation.
 *
 * @param snap Snapshot manifest from the backend.
 * @param onUpdate Called with `(id, notes)` when the user saves.
 * @param onDelete Called with `(id)` when the user confirms deletion.
 * @returns A `glass-card` element.
 */
export default function CrashCard({ snap, onUpdate, onDelete }: Props) {
    const [notes, setNotes] = useState(snap.notes)
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            await onUpdate(snap.id, notes)
        } finally {
            setSaving(false)
        }
    }

    const handleReveal = async () => {
        try {
            await revealCrashFolder(snap.id)
        } catch (err) {
            console.error("Failed to reveal folder", err)
        }
    }

    const fmtBytes = (b: number) =>
        b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

    return (
        <div className="glass-card" style={{ padding: "1.25rem", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 style={{ marginTop: 0 }}>{snap.id}</h3>
                <span style={{ color: "var(--text-dim)", fontSize: "0.85em" }}>
                    {snap.trigger} | {new Date(snap.captured_at).toLocaleString()}
                </span>
            </div>
            <p style={{ color: "var(--text-dim)" }}>
                crash_report:{" "}
                {snap.files.crash_report.present
                    ? `${snap.files.crash_report.file_count} files / ${fmtBytes(snap.files.crash_report.total_bytes)}`
                    : "missing"}
                {" - "}
                logs:{" "}
                {snap.files.logs.present
                    ? `${snap.files.logs.file_count} files / ${fmtBytes(snap.files.logs.total_bytes)}`
                    : "missing"}
                {" - "}
                preferences.script.txt:{" "}
                {snap.files["preferences.script.txt"].present ? fmtBytes(snap.files["preferences.script.txt"].total_bytes) : "missing"}
            </p>
            <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (e.g. siege battle turn 12, Skaven AI player...)"
                rows={3}
                style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 6,
                    background: "rgba(0,0,0,0.2)",
                    color: "var(--text-main)",
                    marginBottom: "0.5rem",
                }}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || notes === snap.notes}>
                    {saving ? "Saving..." : "Save notes"}
                </button>
                <button className="btn btn-outline" onClick={handleReveal}>
                    Open folder
                </button>
                <button
                    className="btn btn-outline"
                    onClick={() => (confirmDelete ? onDelete(snap.id) : setConfirmDelete(true))}
                    style={confirmDelete ? { borderColor: "var(--warning)", color: "var(--warning)" } : undefined}
                >
                    {confirmDelete ? "Confirm delete" : "Delete"}
                </button>
            </div>
        </div>
    )
}

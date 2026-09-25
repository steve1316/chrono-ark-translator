import React, { useCallback, useEffect, useState } from "react"

import type { WH3SnapshotMeta } from "../../../../shared_types"
import SharedHistoryModal from "../../../../translation/HistoryModal"
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from "../../translationApi"
import { useConfirm } from "../../../../ui/useConfirm"

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
 * WH3 snapshot-history modal. A thin wrapper over the shared `HistoryModal`: it owns the snapshot API (list/create/restore/delete) and maps each snapshot
 * onto the shared entry shape, while restore/delete confirm through `useConfirm` and API errors show inside the dialog. Used by both the History toolbar
 * button and the Reset action.
 * @param workshopId - Steam Workshop ID whose snapshots to manage.
 * @param onClose - Called when the modal is closed.
 * @param defaultRestoreMode - When `true`, the header reads "Reset to snapshot".
 * @param onRestored - Called after a successful restore so the parent can re-fetch.
 * @returns The modal element.
 */
const HistoryModal: React.FC<HistoryModalProps> = ({ workshopId, onClose, defaultRestoreMode, onRestored }) => {
    const [snaps, setSnaps] = useState<WH3SnapshotMeta[]>([])
    const [error, setError] = useState<string | null>(null)
    const { confirm, confirmDialog } = useConfirm()

    const refresh = useCallback(async () => {
        setError(null)
        try {
            setSnaps(await listSnapshots(workshopId))
        } catch (e) {
            setError((e as Error).message)
        }
    }, [workshopId])

    useEffect(() => {
        refresh()
    }, [refresh])

    const onSave = useCallback(
        async (label: string) => {
            await createSnapshot(workshopId, label || "manual save")
            await refresh()
        },
        [workshopId, refresh]
    )

    const onRestore = useCallback(
        async (entry: { id: string }) => {
            const ok = await confirm({
                title: "Restore snapshot",
                message: "Restore from this snapshot? Your current state will be auto-snapshotted first.",
                confirmLabel: "Restore",
                variant: "warning",
            })
            if (!ok) return
            try {
                await restoreSnapshot(workshopId, entry.id)
                onRestored()
                await refresh()
            } catch (e) {
                setError((e as Error).message)
            }
        },
        [workshopId, refresh, onRestored, confirm]
    )

    const onDelete = useCallback(
        async (entry: { id: string }) => {
            const ok = await confirm({ title: "Delete snapshot", message: "Delete this snapshot? This cannot be undone.", confirmLabel: "Delete snapshot", variant: "danger" })
            if (!ok) return
            try {
                await deleteSnapshot(workshopId, entry.id)
                await refresh()
            } catch (e) {
                setError((e as Error).message)
            }
        },
        [workshopId, refresh, confirm]
    )

    return (
        <>
            <SharedHistoryModal
                title={defaultRestoreMode ? "Reset to snapshot" : "History"}
                entries={snaps.map((s) => ({ id: s.ulid, title: s.label, kind: s.kind, createdAt: s.created_at }))}
                onSave={onSave}
                onRestore={onRestore}
                onDelete={onDelete}
                onClose={onClose}
                emptyMessage="No snapshots yet."
                error={error}
            />
            {confirmDialog}
        </>
    )
}

export default HistoryModal

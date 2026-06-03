import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { gameApi } from "../../../../api/games"
import SharedHistoryModal from "../../../../translation/HistoryModal"

/** One backup history entry for a mod. */
export interface HistoryEntry {
    /** Backup identifier. */
    id: string
    /** Why the backup was created (e.g. "Before translation run"). */
    reason: string
    /** "auto" for backups taken automatically before destructive ops, "manual" for user-requested save snapshots. */
    kind?: "auto" | "manual"
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
 * Builds the Chrono Ark counts subtitle (translated/total strings + glossary terms), or `undefined` when the entry recorded no counts.
 * @param entry - The backup entry whose counts to render.
 * @returns The subtitle node, or `undefined` to omit the line.
 */
function renderCounts(entry: HistoryEntry): ReactNode {
    const hasCounts = (entry.total_count ?? 0) > 0
    const hasGlossary = (entry.glossary_count ?? 0) > 0
    if (!hasCounts && !hasGlossary) return undefined
    return (
        <>
            {hasCounts && (
                <span>
                    {entry.translated_count} / {entry.total_count} strings translated
                </span>
            )}
            {hasCounts && hasGlossary && <span> &middot; </span>}
            {hasGlossary && (
                <span>
                    {entry.glossary_count} glossary term{entry.glossary_count !== 1 ? "s" : ""}
                </span>
            )}
        </>
    )
}

/**
 * Chrono Ark backup-history modal. A thin wrapper over the shared `HistoryModal`: it owns the REST fetch/save against the CA history API and maps each
 * backup onto the shared entry shape, while restore/delete defer to the parent's shared confirm dialog via callbacks.
 * @param modId - Mod id whose backups to fetch.
 * @param onClose - Called when the user closes the modal.
 * @param onRestore - Called with the entry the user wants to restore.
 * @param onDelete - Called with the entry the user wants to delete.
 * @param refreshKey - Bump to force a re-fetch.
 * @returns The modal element.
 */
export default function BackupHistoryModal({ modId, onClose, onRestore, onDelete, refreshKey }: BackupHistoryModalProps) {
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])

    const fetchHistory = useCallback(async () => {
        try {
            const res = await gameApi("chrono_ark").get(`/mods/${modId}/history`)
            if (res.ok) setHistoryEntries(await res.json())
        } catch (err) {
            console.error("Failed to fetch history:", err)
        }
    }, [modId])

    useEffect(() => {
        fetchHistory()
    }, [fetchHistory, refreshKey])

    const onSave = useCallback(
        async (label: string) => {
            await gameApi("chrono_ark").post(`/mods/${modId}/history`, { label })
            await fetchHistory()
        },
        [modId, fetchHistory]
    )

    const byId = new Map(historyEntries.map((e) => [e.id, e]))

    return (
        <SharedHistoryModal
            entries={historyEntries.map((e) => ({ id: e.id, title: e.reason, kind: e.kind ?? "auto", createdAt: e.created_at, subtitle: renderCounts(e) }))}
            onSave={onSave}
            onRestore={(entry) => {
                const orig = byId.get(entry.id)
                if (orig) onRestore(orig)
            }}
            onDelete={(entry) => {
                const orig = byId.get(entry.id)
                if (orig) onDelete(orig)
            }}
            onClose={onClose}
            emptyMessage="No backups available yet. Backups are created automatically before destructive operations."
        />
    )
}

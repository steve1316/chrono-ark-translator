import { useEffect, useState } from "react"
import { FaSteam, FaFolderOpen } from "react-icons/fa"
import WorkshopCard from "../../../../components/WorkshopCard"
import { API_BASE } from "../../../../config"
import PublishWorkshopDialog from "../PublishWorkshopDialog"
import ScriptRunButton from "../ScriptRunButton"

/**
 * Format a unix timestamp as a relative "Updated ... ago" string.
 *
 * Sub-hour deltas collapse to `"<1h ago"`, deltas under a day stay in whole hours, and anything 24h+ switches to days with a single decimal
 * (trailing `.0` is dropped so whole-day values read cleanly).
 *
 * @param lastModifiedUnix Unix timestamp (seconds) of the last modification.
 * @param nowMs Current epoch time in milliseconds; defaulted to `Date.now()` so tests can inject a fixed clock.
 * @returns A human-readable label such as `"Updated 3h ago"`, `"Updated 1.2 days ago"`, or `"Updated <1h ago"` when the delta is sub-hour.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function formatUpdatedAgo(lastModifiedUnix: number, nowMs: number = Date.now()): string {
    const deltaSeconds = Math.max(0, nowMs / 1000 - lastModifiedUnix)
    const hours = Math.floor(deltaSeconds / 3600)
    if (hours < 1) return "Updated <1h ago"
    if (hours < 24) return `Updated ${hours}h ago`
    const days = parseFloat((deltaSeconds / 86400).toFixed(1))
    return `Updated ${days} days ago`
}

/** A single compat pack card shown on the TW3 Dashboard. */
export interface PackEntry {
    /** Display name of the compat pack. */
    title: string
    /** Steam Workshop item ID. */
    workshopId: string
    /** Backend script id that rebuilds this pack. Omit for mods that have no rebuild pipeline. */
    scriptId?: string
    /** Optional note shown when multiple packs share a script. */
    sharedNote?: string
}

/** Props for PackCardComponent. */
interface PackCardProps {
    /** A single entry from the TW3 `PACKS` array. */
    pack: PackEntry
}

/**
 * TW3-specific dashboard card. Wraps `WorkshopCard` with the pack title +
 * workshopId badge, then fills the body slot with an optional sharedNote, a
 * Rebuild `ScriptRunButton`, and a Steam workshop link.
 *
 * @param pack The pack metadata to render.
 * @returns The rendered TW3 pack card.
 */
const PackCardComponent = ({ pack }: PackCardProps) => {
    const [publishOpen, setPublishOpen] = useState(false)
    const [lastModifiedUnix, setLastModifiedUnix] = useState<number | null>(null)
    const previewImageUrl = `${API_BASE}/games/total_war_warhammer_3/packs/${pack.workshopId}/preview`
    const workshopUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${pack.workshopId}`

    useEffect(() => {
        let cancelled = false
        fetch(`${API_BASE}/games/total_war_warhammer_3/packs/${pack.workshopId}/last_modified`)
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => {
                if (cancelled || body == null) return
                const ts = body.last_modified_unix
                if (typeof ts === "number") setLastModifiedUnix(ts)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [pack.workshopId])

    const subtitle = lastModifiedUnix !== null ? formatUpdatedAgo(lastModifiedUnix) : undefined

    return (
        <>
            <WorkshopCard previewImageUrl={previewImageUrl} previewAlt={pack.title} title={pack.title} idBadge={pack.workshopId} subtitle={subtitle}>
                {pack.sharedNote && <p style={{ fontSize: "0.85em", color: "var(--text-dim)", margin: "0.5rem 0" }}>{pack.sharedNote}</p>}
                <div className="mod-actions" style={{ flexWrap: "nowrap", gap: "0.5rem" }}>
                    {pack.scriptId ? (
                        <ScriptRunButton scriptId={pack.scriptId} label="Rebuild" style={{ height: "42px", padding: "0 0.9rem", fontSize: "0.875rem" }} />
                    ) : (
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled
                            title="No rebuild script associated with this mod"
                            style={{ height: "42px", padding: "0 0.9rem", fontSize: "0.875rem" }}
                        >
                            Rebuild
                        </button>
                    )}
                    <button
                        className="btn btn-outline"
                        onClick={() => setPublishOpen(true)}
                        title="Push the local pack to the Steam Workshop"
                        style={{ height: "42px", padding: "0 0.9rem", fontSize: "0.875rem" }}
                    >
                        Publish
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                            fetch(`${API_BASE}/games/total_war_warhammer_3/packs/${pack.workshopId}/open`, { method: "POST" }).catch(() => {})
                        }}
                        aria-label="Open local pack folder"
                        title="Open local pack folder"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "42px",
                            height: "42px",
                            padding: "0",
                        }}
                    >
                        <FaFolderOpen size={18} />
                    </button>
                    <a
                        href={workshopUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline"
                        aria-label="Open Steam workshop page"
                        title="Open Steam workshop page"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "42px",
                            height: "42px",
                            textDecoration: "none",
                            color: "var(--text-main)",
                            padding: "0",
                        }}
                    >
                        <FaSteam size={20} />
                    </a>
                </div>
            </WorkshopCard>
            {publishOpen && <PublishWorkshopDialog workshopId={pack.workshopId} title={pack.title} onClose={() => setPublishOpen(false)} />}
        </>
    )
}

export default PackCardComponent

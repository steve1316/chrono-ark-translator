import { FaSteam } from "react-icons/fa"
import WorkshopCard from "../../../../components/WorkshopCard"
import { API_BASE } from "../../../../config"
import ScriptRunButton from "../ScriptRunButton"

/** A single compat pack card shown on the TW3 Dashboard. */
export interface PackEntry {
    /** Display name of the compat pack. */
    title: string
    /** Steam Workshop item ID. */
    workshopId: string
    /** Backend script id that rebuilds this pack. */
    scriptId: string
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
    const previewImageUrl = `${API_BASE}/api/games/total_war_warhammer_3/packs/${pack.workshopId}/preview`
    const workshopUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${pack.workshopId}`
    return (
        <WorkshopCard previewImageUrl={previewImageUrl} previewAlt={pack.title} title={pack.title} idBadge={pack.workshopId}>
            {pack.sharedNote && <p style={{ fontSize: "0.85em", color: "var(--text-dim)", margin: "0.5rem 0" }}>{pack.sharedNote}</p>}
            <div className="mod-actions">
                <ScriptRunButton scriptId={pack.scriptId} label="Rebuild" />
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
    )
}

export default PackCardComponent

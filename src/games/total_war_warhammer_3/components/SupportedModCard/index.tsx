import WorkshopCard from "../../../../components/WorkshopCard"
import { API_BASE } from "../../../../config"
import type { SupportedMod, ValidationIssue } from "../../api"
import ValidationBadge from "../ValidationBadge"

/** Props for `SupportedModCard`. */
interface Props {
    /** The mod registry entry to render. */
    mod: SupportedMod
    /** Validation issues affecting this mod (empty array when clean). */
    issues: ValidationIssue[]
}

/**
 * Card representation of one TW3 supported-mod entry. Wraps `WorkshopCard`
 * with the mod's name, package name, derived workshop-id badge, and a body
 * slot containing the validation badge (when issues exist), the modified
 * attributes list (when non-empty), and the dim monospace `.pack` path.
 *
 * @param mod The mod registry entry to render.
 * @param issues Validation issues affecting this mod; an empty array hides the badge.
 * @returns The rendered card.
 */
const SupportedModCard = ({ mod, issues }: Props) => {
    const previewImageUrl = mod.workshop_id ? `${API_BASE}/games/total_war_warhammer_3/packs/${mod.workshop_id}/preview` : null
    return (
        <WorkshopCard previewImageUrl={previewImageUrl} previewAlt={mod.name} title={mod.name} idBadge={mod.workshop_id ?? undefined} subtitle={mod.package_name}>
            {issues.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <ValidationBadge issues={issues} />
                    <span style={{ fontSize: "0.85em", color: "var(--warning)" }}>
                        {issues.length} validation issue{issues.length === 1 ? "" : "s"}
                    </span>
                </div>
            )}
            {mod.modified_attributes && mod.modified_attributes.length > 0 && (
                <p style={{ margin: 0, fontSize: "0.9em" }}>
                    <strong>Modified attributes:</strong> {mod.modified_attributes.join(", ")}
                </p>
            )}
            {mod.workshop_id && (
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={async () => {
                        try {
                            await fetch(`${API_BASE}/games/total_war_warhammer_3/packs/${mod.workshop_id}/open`, { method: "POST" })
                        } catch (err) {
                            console.error("Failed to open workshop folder:", err)
                        }
                    }}
                    style={{ alignSelf: "flex-start", fontSize: "0.85em" }}
                >
                    Open Workshop Folder
                </button>
            )}
        </WorkshopCard>
    )
}

export default SupportedModCard

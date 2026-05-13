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
    /** Optional callback invoked with the mod's `package_name` when the Edit button is clicked. The button is omitted when this prop is not provided. */
    onEdit?: (packageName: string) => void
}

/**
 * Card representation of one TW3 supported-mod entry. Wraps `WorkshopCard`
 * with the mod's name, package name, derived workshop-id badge, and a body
 * slot containing the expandable validation-issues block (when issues exist), the modified
 * attributes list (when non-empty), an optional Edit button (when `onEdit` is provided), and an
 * "Open Workshop Folder" button (when `workshop_id` is set).
 *
 * @param mod The mod registry entry to render.
 * @param issues Validation issues affecting this mod; an empty array hides the badge.
 * @param onEdit Optional callback invoked with the mod's `package_name` when the Edit button is clicked.
 * @returns The rendered card.
 */
const SupportedModCard = ({ mod, issues, onEdit }: Props) => {
    const previewImageUrl = mod.workshop_id ? `${API_BASE}/games/total_war_warhammer_3/packs/${mod.workshop_id}/preview` : null
    return (
        <WorkshopCard previewImageUrl={previewImageUrl} previewAlt={mod.name} title={mod.name} idBadge={mod.workshop_id ?? undefined} subtitle={mod.package_name}>
            {issues.length > 0 && (
                <details>
                    <summary style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <ValidationBadge issues={issues} />
                        <span style={{ fontSize: "0.85em", color: "var(--warning)" }}>
                            {issues.length} validation issue{issues.length === 1 ? "" : "s"}
                        </span>
                    </summary>
                    <ul style={{ margin: "0.5rem 0 0 1.25rem", padding: 0, fontSize: "0.8em", color: "var(--text-dim)", wordBreak: "break-word" }}>
                        {issues.map((issue, i) => (
                            <li key={i}>{issue.message}</li>
                        ))}
                    </ul>
                </details>
            )}
            {mod.modified_attributes && mod.modified_attributes.length > 0 && (
                <p style={{ margin: 0, fontSize: "0.9em" }}>
                    <strong>Modified attributes:</strong> {mod.modified_attributes.join(", ")}
                </p>
            )}
            {(onEdit || mod.workshop_id) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "auto" }}>
                    {onEdit && (
                        <button type="button" className="btn btn-outline" onClick={() => onEdit(mod.package_name)} style={{ fontSize: "0.85em" }}>
                            Edit
                        </button>
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
                            style={{ fontSize: "0.85em" }}
                        >
                            Open Workshop Folder
                        </button>
                    )}
                </div>
            )}
        </WorkshopCard>
    )
}

export default SupportedModCard

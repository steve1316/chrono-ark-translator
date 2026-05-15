import { API_BASE } from "../../../../../config"

/** State held by the Basics section. */
export interface BasicsState {
    /** Display name. */
    name: string
    /** Stable identifier (.pack filename). */
    package_name: string
    /** Numeric Steam Workshop item id. */
    workshop_id: string
    /** When true, the user is supplying `path` directly (advanced). */
    custom_path: boolean
    /** Raw path; only meaningful when `custom_path` is true. */
    path: string
}

/** Default empty state for a fresh form. */
export const emptyBasicsState: BasicsState = {
    name: "",
    package_name: "",
    workshop_id: "",
    custom_path: false,
    path: "",
}

/** Props for `BasicsSection`. */
interface Props {
    /** Current state. */
    value: BasicsState
    /** Called with the next state on any field change. */
    onChange: (next: BasicsState) => void
    /** When true, the `package_name` input is read-only (used in edit mode). */
    lockPackageName: boolean
}

/**
 * Section 1 of the SupportedModForm. Owns Name, Package name, Workshop ID, the
 * Custom-path advanced toggle, and the live preview image.
 *
 * @param value Current Basics state.
 * @param onChange Called with the next state.
 * @param lockPackageName Disables the `package_name` input when editing.
 * @returns The rendered section.
 */
const BasicsSection = ({ value, onChange, lockPackageName }: Props) => {
    const previewUrl = value.workshop_id ? `${API_BASE}/games/total_war_warhammer_3/packs/${value.workshop_id}/preview` : null
    return (
        <fieldset className="glass-card" style={{ padding: "1rem", border: "1px solid var(--glass-border)", borderRadius: 8 }}>
            <legend style={{ padding: "0 0.5rem" }}>Basics</legend>
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
                <span style={{ display: "block", marginBottom: "0.25rem" }}>Name</span>
                <input className="btn-outline" type="text" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} style={{ width: "100%", padding: "0.5rem" }} />
            </label>
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
                <span style={{ display: "block", marginBottom: "0.25rem" }}>Package name</span>
                <input className="btn-outline" type="text" value={value.package_name} disabled={lockPackageName} onChange={(e) => onChange({ ...value, package_name: e.target.value })} style={{ width: "100%", padding: "0.5rem" }} />
            </label>
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
                <span style={{ display: "block", marginBottom: "0.25rem" }}>Workshop ID</span>
                <input className="btn-outline" type="text" value={value.workshop_id} onChange={(e) => onChange({ ...value, workshop_id: e.target.value })} style={{ width: "100%", padding: "0.5rem" }} />
            </label>
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
                <input type="checkbox" checked={value.custom_path} onChange={(e) => onChange({ ...value, custom_path: e.target.checked })} /> Custom path (advanced)
            </label>
            {value.custom_path && (
                <label style={{ display: "block", marginBottom: "0.75rem" }}>
                    <span style={{ display: "block", marginBottom: "0.25rem" }}>Custom path</span>
                    <input className="btn-outline" type="text" value={value.path} onChange={(e) => onChange({ ...value, path: e.target.value })} style={{ width: "100%", padding: "0.5rem", fontFamily: "monospace" }} />
                </label>
            )}
            {previewUrl && (
                <div style={{ marginTop: "0.5rem" }}>
                    <img src={previewUrl} alt={value.name || "Preview"} loading="lazy" style={{ maxWidth: 240, borderRadius: 6 }} />
                </div>
            )}
        </fieldset>
    )
}

export default BasicsSection

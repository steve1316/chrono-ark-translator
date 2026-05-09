import { Link } from "react-router-dom"
import ScriptRunButton from "../../components/ScriptRunButton"

/** A single compat pack card shown on the Dashboard. */
interface PackCard {
    /** Display name of the compat pack. */
    title: string
    /** Steam Workshop item ID. */
    workshopId: string
    /** Backend script id that rebuilds this pack. */
    scriptId: string
    /** Optional note shown when multiple packs share a script. */
    sharedNote?: string
}

const PACKS: PackCard[] = [
    { title: "Nanu's Dynamic RoR Compat", workshopId: "3513364573", scriptId: "update_dynamic_rors" },
    { title: "Nanu's Dynamic RoR Leftover Vanilla", workshopId: "3532864014", scriptId: "update_dynamic_rors_vanilla" },
    { title: "2x Unit Size Compat", workshopId: "3621939685", scriptId: "update_double_unit_size" },
    { title: "50% Melee Attack Speed Compat", workshopId: "3311361199", scriptId: "update_modified_attribute_mods", sharedNote: "Rebuilds with the other modified-attribute packs." },
    { title: "120 Firing Arc Compat", workshopId: "3311361345", scriptId: "update_modified_attribute_mods", sharedNote: "Rebuilds with the other modified-attribute packs." },
    { title: "Double Projectile Velocity Compat", workshopId: "3311361464", scriptId: "update_modified_attribute_mods", sharedNote: "Rebuilds with the other modified-attribute packs." },
]

/**
 * TW3 Dashboard: 6 pack cards + a Rebuild All button + 2 navigation cards for the
 * read-only registries. Last-run timestamps are session-only.
 *
 * @returns A page that renders pack cards, each with a `ScriptRunButton`, plus
 *     links to Supported Mods and Effects.
 */
export default function DashboardPage() {
    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Warhammer III Workshop</h1>
                    <p>Manage and rebuild your compat packs.</p>
                </div>
                <ScriptRunButton scriptId="update" label="Rebuild All" />
            </div>
            <div className="mod-grid">
                {PACKS.map((pack) => (
                    <div key={pack.title} className="glass-card" style={{ padding: "1.25rem" }}>
                        <h3 style={{ marginTop: 0 }}>{pack.title}</h3>
                        <p style={{ color: "var(--text-dim)" }}>Workshop ID: {pack.workshopId}</p>
                        {pack.sharedNote && <p style={{ fontSize: "0.85em", color: "var(--text-dim)" }}>{pack.sharedNote}</p>}
                        <ScriptRunButton scriptId={pack.scriptId} label="Rebuild" />
                    </div>
                ))}
                <Link to="/supported-mods" className="glass-card" style={{ padding: "1.25rem", textDecoration: "none", color: "var(--text-main)" }}>
                    <h3 style={{ marginTop: 0 }}>Supported Mods</h3>
                    <p style={{ color: "var(--text-dim)" }}>Browse the mod registry.</p>
                </Link>
                <Link to="/effects" className="glass-card" style={{ padding: "1.25rem", textDecoration: "none", color: "var(--text-main)" }}>
                    <h3 style={{ marginTop: 0 }}>Effects</h3>
                    <p style={{ color: "var(--text-dim)" }}>Browse the effects catalog.</p>
                </Link>
            </div>
        </>
    )
}

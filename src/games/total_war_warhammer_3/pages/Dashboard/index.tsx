import { useEffect, useState } from "react"

import PackCard, { type PackEntry } from "../../components/PackCard"
import PublishAllDialog from "../../components/PublishAllDialog"
import ScriptRunButton from "../../components/ScriptRunButton"
import TranslationModCard from "../../components/TranslationModCard"
import type { WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"
import { listTranslationMods, rescanMod } from "../../translationApi"

const PACKS: PackEntry[] = [
    { title: "Nanu's Dynamic RoR Compat", workshopId: "3513364573", scriptId: "update_dynamic_rors" },
    { title: "Nanu's Dynamic RoR Leftover Vanilla", workshopId: "3532864014", scriptId: "update_dynamic_rors_vanilla" },
    { title: "2x Unit Size Compat", workshopId: "3621939685", scriptId: "update_double_unit_size" },
    { title: "50% Melee Attack Speed Compat", workshopId: "3311361199", scriptId: "update_modified_attribute_mods", sharedNote: "Rebuilds with the other modified-attribute packs." },
    { title: "120 Firing Arc Compat", workshopId: "3311361345", scriptId: "update_modified_attribute_mods", sharedNote: "Rebuilds with the other modified-attribute packs." },
    { title: "Double Projectile Velocity Compat", workshopId: "3311361464", scriptId: "update_modified_attribute_mods", sharedNote: "Rebuilds with the other modified-attribute packs." },
    { title: "Land Encounters And Points Of Interest + MCT Support + IEE", workshopId: "3397481450", scriptId: "process_main_units_tables" },
    { title: "Kadons Scrolls of Binding", workshopId: "3398096688" },
    { title: "[GLF] Battle Mage", workshopId: "3387635246", scriptId: "glf_inner_join" },
    { title: "Tabletop Caps - Yet Another Compatibility Megapack", workshopId: "3310629727" },
]

/**
 * TW3 Dashboard: pack cards + translation mod cards + a Rebuild All button.
 * Last-run timestamps are session-only.
 *
 * @returns A page that renders pack cards, translation mod cards, and a
 *     `ScriptRunButton`.
 */
export default function DashboardPage() {
    const [translationMods, setTranslationMods] = useState<WH3TranslationModSummary[]>([])
    const [progressByMod, setProgressByMod] = useState<Record<string, WH3RescanSummary | null>>({})
    const [translationLoadError, setTranslationLoadError] = useState<string | null>(null)
    const [publishAllOpen, setPublishAllOpen] = useState(false)

    useEffect(() => {
        let cancelled = false
        listTranslationMods()
            .then((mods) => {
                if (cancelled) return
                setTranslationMods(mods)
                setProgressByMod(Object.fromEntries(mods.map((m) => [m.workshop_id, null])))
                mods.forEach((mod, i) => {
                    setTimeout(async () => {
                        try {
                            const summary = await rescanMod(mod.workshop_id)
                            if (!cancelled) setProgressByMod((prev) => ({ ...prev, [mod.workshop_id]: summary }))
                        } catch {
                            /* leave at null; card shows "Not yet scanned" */
                        }
                    }, i * 200)
                })
            })
            .catch((e) => {
                if (!cancelled) setTranslationLoadError((e as Error).message)
            })
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Warhammer III Workshop</h1>
                    <p>Manage and rebuild your compat packs.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <ScriptRunButton scriptId="update" label="Rebuild All" />
                    <button className="btn btn-primary" style={{ padding: "0.55rem 1.1rem" }} onClick={() => setPublishAllOpen(true)}>
                        Publish All
                    </button>
                </div>
            </div>
            <div className="glass-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <h3 style={{ marginTop: 0 }}>About the Compat Packs</h3>
                <p style={{ margin: 0, color: "var(--text-dim)" }}>
                    Each card below is one compat pack you maintain on the Steam Workshop. The <strong>Rebuild</strong>
                    button regenerates that pack by running the matching helper script against your local mod files. Use <strong>Rebuild All</strong> to run every pipeline in sequence.
                </p>
            </div>

            <section>
                <h2 style={{ marginBottom: "1rem" }}>Pack Mods</h2>
                <div className="mod-grid">
                    {PACKS.map((pack) => (
                        <PackCard key={pack.workshopId} pack={pack} />
                    ))}
                </div>
            </section>

            <section className="translation-mods-section">
                <h2>Translation Mods</h2>
                {translationLoadError ? (
                    <p style={{ color: "var(--danger)" }}>Failed to load translation mods: {translationLoadError}</p>
                ) : translationMods.length === 0 ? (
                    <p style={{ color: "var(--text-dim)" }}>Loading translation mods...</p>
                ) : (
                    <div className="mod-grid">
                        {translationMods.map((mod) => (
                            <TranslationModCard key={mod.workshop_id} mod={mod} progress={progressByMod[mod.workshop_id] ?? null} />
                        ))}
                    </div>
                )}
            </section>

            {publishAllOpen && <PublishAllDialog packs={PACKS} onClose={() => setPublishAllOpen(false)} />}
        </>
    )
}

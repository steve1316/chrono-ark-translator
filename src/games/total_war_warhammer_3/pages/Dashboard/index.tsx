import { useEffect, useMemo, useRef, useState } from "react"

import DashboardHeader from "../../../../dashboard/DashboardHeader"
import DashboardSection from "../../../../dashboard/DashboardSection"
import { useCardWidth } from "../../../../dashboard/useCardWidth"
import type { WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"
import Panel from "../../../../ui/Panel"
import { matchesSearch } from "../../../../utils/modFilters"
import PackCard, { type PackEntry } from "../../components/PackCard"
import PublishAllDialog from "../../components/PublishAllDialog"
import ScriptRunButton from "../../components/ScriptRunButton"
import TranslationModCard from "../../components/TranslationModCard"
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
 * TW3 Dashboard: a searchable header with Rebuild All and Publish All, an intro panel, then the pack cards and the translation mod cards.
 * Last-run timestamps are session-only.
 *
 * @returns The WH3 dashboard page.
 */
export default function DashboardPage() {
    // `null` until the list request settles, so the section can show a skeleton instead of an empty grid.
    const [translationMods, setTranslationMods] = useState<WH3TranslationModSummary[] | null>(null)
    const [progressByMod, setProgressByMod] = useState<Record<string, WH3RescanSummary | null>>({})
    const [translationLoadError, setTranslationLoadError] = useState<string | null>(null)
    const [publishAllOpen, setPublishAllOpen] = useState(false)
    const [search, setSearch] = useState("")
    const gridWrapperRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        let cancelled = false
        listTranslationMods()
            .then((mods) => {
                if (cancelled) return
                // Read the ids before storing the list, so a malformed response fails here instead of while rendering.
                const initialProgress = Object.fromEntries(mods.map((m) => [m.workshop_id, null]))
                setTranslationMods(mods)
                setProgressByMod(initialProgress)
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

    const query = search.trim()
    const visiblePacks = useMemo(() => PACKS.filter((pack) => matchesSearch(search, pack.title, pack.workshopId)), [search])
    const visibleMods = useMemo(() => (translationMods ?? []).filter((mod) => matchesSearch(search, mod.display_name, mod.workshop_id)), [translationMods, search])
    const cardWidth = useCardWidth(gridWrapperRef, visiblePacks.length + visibleMods.length)

    return (
        <>
            <DashboardHeader
                title="Warhammer III Workshop"
                tagline="Manage and rebuild your compat packs."
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by name or workshop ID..."
                searchWidth={cardWidth}
                actions={
                    <>
                        <ScriptRunButton scriptId="update" label="Rebuild All" />
                        <button type="button" className="btn btn-primary" onClick={() => setPublishAllOpen(true)}>
                            Publish All
                        </button>
                    </>
                }
            />

            <Panel
                title="About the Compat Packs"
                help={
                    <>
                        Each card below is one compat pack you maintain on the Steam Workshop. The <strong>Rebuild</strong> button regenerates that pack by running the matching helper script against
                        your local mod files. Use <strong>Rebuild All</strong> to run every pipeline in sequence.
                    </>
                }
            />

            <div ref={gridWrapperRef}>
                <DashboardSection title="Pack Mods" loading={false} empty={visiblePacks.length === 0} emptyMessage={`No packs match "${query}".`}>
                    <div className="mod-grid">
                        {visiblePacks.map((pack) => (
                            <PackCard key={pack.workshopId} pack={pack} searchQuery={query} />
                        ))}
                    </div>
                </DashboardSection>

                <DashboardSection
                    title="Translation Mods"
                    loading={translationMods === null}
                    skeletonCount={3}
                    skeletonLabel="Loading translation mods"
                    error={translationLoadError ? `Failed to load translation mods: ${translationLoadError}` : null}
                    empty={visibleMods.length === 0}
                    emptyMessage={query ? `No translation mods match "${query}".` : "No translation mods found."}
                >
                    <div className="mod-grid">
                        {visibleMods.map((mod) => (
                            <TranslationModCard
                                key={mod.workshop_id}
                                mod={mod}
                                searchQuery={query}
                                progress={progressByMod[mod.workshop_id] ?? null}
                                onRescan={async (workshopId) => {
                                    try {
                                        const summary = await rescanMod(workshopId)
                                        setProgressByMod((prev) => ({ ...prev, [workshopId]: summary }))
                                    } catch {
                                        /* swallow - card stays on stale progress */
                                    }
                                }}
                            />
                        ))}
                    </div>
                </DashboardSection>
            </div>

            {publishAllOpen && <PublishAllDialog packs={PACKS} onClose={() => setPublishAllOpen(false)} />}
        </>
    )
}

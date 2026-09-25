import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import GlossarySuggestionModal from "../../../../components/GlossarySuggestionModal"
import TranslationConfirmModal from "../../../../components/TranslationConfirmModal"
import { API_BASE } from "../../../../config"
import { useIterativeTranslation } from "../../../../hooks/useIterativeTranslation"
import { useGameSlug } from "../../../useGameSlug"
import { StatusBadge } from "../../../../translation/StatusBadge"
import { TranslationPage } from "../../../../translation/TranslationPage"
import { usePendingSuggestions } from "../../../../translation/usePendingSuggestions"
import { TranslationToolbar } from "../../../../translation/TranslationToolbar"
import { SyncButton } from "../../../../translation/SyncButton"
import { BatchReviewBanner } from "../../../../translation/BatchReviewBanner"
import SplitButton from "../../../../ui/SplitButton"
import { LanguageControls } from "../../../../translation/LanguageControls"
import { OpenFolderButton, PendingSyncPill, SteamLink } from "../../../../translation/TitleAdornments"
import { TranslationCell } from "../../../../translation/TranslationCell"
import { canonicalRowStyle } from "../../../../translation/rowStyle"
import type { ColumnDef } from "../../../../translation/types"
import type { RowStatus } from "../../../../utils/stringFilters"
import type { TermSuggestion, WH3DriftRow, WH3ModContext, WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"
import ApiResponsesModal from "../../components/ApiResponsesModal"
import HistoryModal from "../../components/HistoryModal"
import ModContextModal from "../../components/ModContextModal"
import ModGlossaryModal from "../../components/ModGlossaryModal"
import {
    clearTranslations,
    fetchModContext,
    fetchStrings,
    listTranslationMods,
    loadGlossary,
    loadNameSuggestions,
    openModFolder,
    openSourceFile,
    previewTranslation,
    rescanMod,
    saveModContext,
    saveString,
    syncChanges,
    type WH3TranslationPreview,
} from "../../translationApi"
import { useConfirm } from "../../../../ui/useConfirm"

// Canonical status filter pills, identical to Chrono Ark. WH3 never emits "untouched"/"untranslatable", but the pill set matches for 1-to-1 parity.
const STATUS_FILTERS: Array<{ value: RowStatus | "all"; label: string }> = [
    { value: "all", label: "All" },
    { value: "missing", label: "Missing" },
    { value: "untouched", label: "Untouched" },
    { value: "pending", label: "Pending" },
    { value: "synced", label: "Synced" },
]

type ModalKey = "glossary" | "responses" | "context" | "history" | "reset" | null

type SortField = "status" | "provider" | "source_filename" | "key" | "parent_text" | "translation_text"

/**
 * Confirm text for WH3's Sync button.
 *
 * @param resync True for a re-sync with nothing new pending.
 * @returns The dialog body.
 */
const wh3SyncMessage = (resync: boolean) =>
    `${resync ? "Nothing has changed since the last sync. Re-syncing writes every translation again.\n\n" : ""}This will overwrite the mod's .loc.tsv files with your translations and rebuild the translation pack. Continue?`

const COLUMN_WIDTH_KEY = "wh3-translation-column-widths"

const DEFAULT_COLUMN_WIDTHS: Record<SortField, number> = {
    status: 120,
    provider: 90,
    source_filename: 200,
    key: 220,
    parent_text: 280,
    translation_text: 300,
}

/**
 * Per-mod WH3 translation review page. Renders the shared `<TranslationPage>` shell so it mirrors Chrono Ark 1-to-1: canonical status chips, the same
 * status-filter pills, header identity (preview / steam link / open-folder / pending-sync badge) and language controls, the toolbar groups, and the modals.
 * @returns The rendered page.
 */
const TranslationDetailsPage: React.FC = () => {
    const { workshopId = "" } = useParams<{ workshopId: string }>()
    const navigate = useNavigate()
    const slug = useGameSlug()

    const [mod, setMod] = useState<WH3TranslationModSummary | null>(null)
    const [progress, setProgress] = useState<WH3RescanSummary | null>(null)
    const [strings, setStrings] = useState<WH3DriftRow[]>([])
    const [filter, setFilter] = useState<RowStatus | "all">("all")
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [openModal, setOpenModal] = useState<ModalKey>(null)
    const { suggestions, refresh: refreshSuggestions, scan, scanning } = usePendingSuggestions("total_war_warhammer_3", workshopId, setBanner)
    const [showSuggestions, setShowSuggestions] = useState(false)

    // Keep the Mod Glossary count current after suggestions are accepted.
    const refreshGlossaryCount = useCallback(() => {
        loadGlossary(workshopId)
            .then((d) => setGlossaryCount(Object.keys(d).length))
            .catch(() => {})
    }, [workshopId])
    const { confirm, confirmDialog } = useConfirm()
    const [showReviewModal, setShowReviewModal] = useState(false)
    // Translate-Names-first: pendingScope drives the confirm-modal title; namesRunRef marks the active run as a names run (read in the batch effect,
    // not a dependency, so resetting it does not re-fire the effect); nameReviewSuggestions opens the post-names glossary review.
    const [pendingScope, setPendingScope] = useState<"all" | "names">("all")
    const namesRunRef = useRef(false)
    const [nameReviewSuggestions, setNameReviewSuggestions] = useState<TermSuggestion[] | null>(null)
    const [modContext, setModContext] = useState<WH3ModContext>({
        source_game: "",
        character_name: "",
        background: "",
        source_language_override: null,
        target_language_override: null,
    })
    const [glossaryCount, setGlossaryCount] = useState<number>(0)
    const [activeProvider, setActiveProvider] = useState<string>("claude")
    const [preview, setPreview] = useState<WH3TranslationPreview | null>(null)
    const [pendingProvider, setPendingProvider] = useState<string>("")
    const [sortConfig, setSortConfig] = useState<{ key: SortField; direction: "asc" | "desc" | null }>({ key: "key", direction: null })
    const [columnWidths, setColumnWidths] = useState<Record<SortField, number>>(() => {
        try {
            const raw = window.localStorage.getItem(COLUMN_WIDTH_KEY)
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<Record<SortField, number>>
                return { ...DEFAULT_COLUMN_WIDTHS, ...parsed }
            }
        } catch {
            /* fall through */
        }
        return DEFAULT_COLUMN_WIDTHS
    })

    // Persist column widths whenever they change (the shared table reports drags via onResizeColumn).
    useEffect(() => {
        try {
            window.localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(columnWidths))
        } catch {
            /* ignore quota errors */
        }
    }, [columnWidths])

    const onResizeColumn = useCallback((field: string, width: number) => {
        setColumnWidths((prev) => ({ ...prev, [field]: width }))
    }, [])

    const loadStrings = useCallback(async () => {
        if (!workshopId) return
        const rows = await fetchStrings(workshopId)
        setStrings(rows)
    }, [workshopId])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [allMods, summary, ctx] = await Promise.all([listTranslationMods(), rescanMod(workshopId), fetchModContext(workshopId)])
                if (cancelled) return
                setMod(allMods.find((m) => m.workshop_id === workshopId) ?? null)
                setProgress(summary)
                setModContext(ctx)
                await loadStrings()
            } catch (e) {
                setBanner({ type: "error", message: `Failed to load: ${(e as Error).message}` })
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workshopId, loadStrings])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const dict = await loadGlossary(workshopId)
                if (!cancelled) setGlossaryCount(Object.keys(dict).length)
            } catch {
                /* leave at 0 */
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workshopId, openModal])

    const onRowSave = useCallback(
        async (key: string, text: string) => {
            try {
                await saveString(workshopId, key, text)
                setStrings((prev) =>
                    prev.map((r) =>
                        r.key === key
                            ? { ...r, translation_text: text, provider: "manual", status: r.status === "untranslated" || r.status === "stale" ? "translated" : r.status, canonical_status: "pending" }
                            : r
                    )
                )
                setBanner({ type: "success", message: `Saved ${key}` })
            } catch (e) {
                setBanner({ type: "error", message: `Save failed: ${(e as Error).message}` })
            }
        },
        [workshopId]
    )

    // Optimistically reflect each completed batch's translations in the table while the run continues.
    const onBatchTranslated = useCallback((translations: Record<string, string>) => {
        setStrings((prev) =>
            prev.map((r) => (translations[r.key] !== undefined ? { ...r, translation_text: translations[r.key], provider: "claude", status: "translated", canonical_status: "pending" } : r))
        )
    }, [])

    const { state: batchState, startTranslation, continueAfterReview, cancel: cancelTranslation } = useIterativeTranslation("total_war_warhammer_3", workshopId, onBatchTranslated)
    const isTranslating = batchState.phase === "translating"

    // Clicking Translate previews the run (prompts + cost + batch plan) and opens the confirm modal. Confirming starts the iterative batch loop.
    const handleTranslateClick = useCallback(
        async (provider?: string) => {
            const p = provider || activeProvider
            setPendingProvider(p)
            setPendingScope("all")
            try {
                const pv = await previewTranslation(workshopId, p)
                if (pv.total_strings === 0) {
                    setBanner({ type: "success", message: pv.message || "All strings are already translated." })
                    return
                }
                setPreview(pv)
            } catch (e) {
                setBanner({ type: "error", message: `Preview failed: ${(e as Error).message}` })
            }
        },
        [workshopId, activeProvider]
    )

    // Translate only the name strings (unit/skill/building/location/...) first. They are then reviewed into the glossary so the bulk run reuses them.
    const handleTranslateNamesClick = useCallback(
        async (provider?: string) => {
            const p = provider || activeProvider
            setPendingProvider(p)
            setPendingScope("names")
            try {
                const pv = await previewTranslation(workshopId, p, "names")
                if (pv.total_strings === 0) {
                    setBanner({ type: "success", message: pv.message || "All names are already translated." })
                    return
                }
                setPreview(pv)
            } catch (e) {
                setBanner({ type: "error", message: `Names preview failed: ${(e as Error).message}` })
            }
        },
        [workshopId, activeProvider]
    )

    const onConfirmTranslate = useCallback(() => {
        if (!preview) return
        const plan = preview.batch_plan ?? []
        namesRunRef.current = pendingScope === "names"
        setPreview(null)
        startTranslation(pendingProvider || activeProvider, plan)
    }, [preview, pendingProvider, pendingScope, activeProvider, startTranslation])

    // When the iterative run finishes (or errors), refresh counts + rows and surface a result banner.
    useEffect(() => {
        // A names run does not pause for per-batch provider suggestions; the translated names are reviewed once at the end via name-suggestions.
        if (batchState.phase === "reviewing" && namesRunRef.current) {
            continueAfterReview()
            return
        }
        if (batchState.phase === "complete") {
            const total = batchState.totalTranslated
            const wasNamesRun = namesRunRef.current
            namesRunRef.current = false
            ;(async () => {
                try {
                    const summary = await rescanMod(workshopId)
                    setProgress(summary)
                    await loadStrings()
                } catch {
                    /* ignore refresh errors */
                }
                if (wasNamesRun) {
                    try {
                        const sugg = await loadNameSuggestions(workshopId)
                        if (sugg.length > 0) {
                            setNameReviewSuggestions(sugg)
                            setBanner({ type: "success", message: `Translated ${total} names - review them to add to the glossary.` })
                            return
                        }
                    } catch {
                        /* fall through to the plain banner */
                    }
                    setBanner({ type: "success", message: `Translated ${total} names.` })
                } else {
                    setBanner({ type: "success", message: `Translated ${total} strings` })
                }
            })()
        } else if (batchState.phase === "error") {
            namesRunRef.current = false
            setBanner({ type: "error", message: batchState.message })
        }
    }, [batchState, workshopId, loadStrings, continueAfterReview])

    const onSyncChanges = useCallback(async () => {
        try {
            const result = await syncChanges(workshopId)
            const fileCount = Object.keys(result.per_file).length
            const keyCount = Object.values(result.per_file).reduce((a, b) => a + b, 0)
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            await loadStrings()
            const orphanNote = result.removed_orphans > 0 ? `, removed ${result.removed_orphans} orphan${result.removed_orphans !== 1 ? "s" : ""}` : ""
            const packNote = result.pack_built ? ", rebuilt pack" : result.pack_error ? ` (pack rebuild failed: ${result.pack_error})` : ""
            setBanner({ type: "success", message: `Synced ${keyCount} keys across ${fileCount} files${orphanNote}${packNote}` })
        } catch (e) {
            setBanner({ type: "error", message: `Sync failed: ${(e as Error).message}` })
        }
    }, [workshopId, loadStrings])

    const onClearEnglish = useCallback(async () => {
        const ok = await confirm({ title: "Clear English", message: "Clear all translation text? An auto-snapshot is taken before clearing.", confirmLabel: "Clear", variant: "danger" })
        if (!ok) return
        try {
            const result = await clearTranslations(workshopId)
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            await loadStrings()
            setBanner({ type: "success", message: `Cleared ${result.cleared} translations` })
        } catch (e) {
            setBanner({ type: "error", message: `Clear failed: ${(e as Error).message}` })
        }
    }, [workshopId, loadStrings, confirm])

    const onRestored = useCallback(async () => {
        const summary = await rescanMod(workshopId)
        setProgress(summary)
        await loadStrings()
        setBanner({ type: "success", message: "Restored from snapshot" })
    }, [workshopId, loadStrings])

    const saveSourceLanguage = useCallback(
        async (value: string) => {
            const next: WH3ModContext = { ...modContext, source_language_override: value === "" ? null : value }
            setModContext(next)
            try {
                await saveModContext(workshopId, next)
            } catch (e) {
                setBanner({ type: "error", message: `Language save failed: ${(e as Error).message}` })
            }
        },
        [workshopId, modContext]
    )

    const saveTargetLanguage = useCallback(
        async (value: string) => {
            const next: WH3ModContext = { ...modContext, target_language_override: value === "" ? null : value }
            setModContext(next)
            try {
                await saveModContext(workshopId, next)
            } catch (e) {
                setBanner({ type: "error", message: `Language save failed: ${(e as Error).message}` })
            }
        },
        [workshopId, modContext]
    )

    const onOpenFolder = useCallback(async () => {
        try {
            await openModFolder(workshopId)
        } catch (e) {
            setBanner({ type: "error", message: `Open folder failed: ${(e as Error).message}` })
        }
    }, [workshopId])

    const handleSort = useCallback((field: string) => {
        const f = field as SortField
        setSortConfig((prev) => {
            if (prev.key !== f) return { key: f, direction: "asc" }
            if (prev.direction === "asc") return { key: f, direction: "desc" }
            if (prev.direction === "desc") return { key: f, direction: null }
            return { key: f, direction: "asc" }
        })
    }, [])

    const filteredRows = useMemo(() => {
        let rows = strings
        if (filter !== "all") rows = rows.filter((r) => (r.canonical_status ?? "missing") === filter)
        const needle = search.trim().toLowerCase()
        if (needle) rows = rows.filter((r) => r.key.toLowerCase().includes(needle) || (r.parent_text ?? "").toLowerCase().includes(needle) || (r.translation_text ?? "").toLowerCase().includes(needle))
        return rows
    }, [strings, filter, search])

    const sortedRows = useMemo(() => {
        if (sortConfig.direction === null) return filteredRows
        const dir = sortConfig.direction === "asc" ? 1 : -1
        const key = sortConfig.key
        const val = (r: WH3DriftRow) => (key === "status" ? (r.canonical_status ?? "") : String(r[key] ?? ""))
        return [...filteredRows].sort((a, b) => val(a).localeCompare(val(b)) * dir)
    }, [filteredRows, sortConfig])

    const translateCount = useMemo(() => progress?.counts.untranslated ?? 0, [progress])
    const total = useMemo(() => (progress ? progress.counts.translated + progress.counts.untranslated + progress.counts.stale : 0), [progress])
    const done = useMemo(() => (progress ? progress.counts.translated + progress.counts.stale : 0), [progress])

    const sourceLang = modContext.source_language_override ?? mod?.source_language ?? "Chinese"
    const targetLang = sourceLang === "English" ? (modContext.target_language_override ?? mod?.target_language ?? "Chinese") : "English"

    const columns: ColumnDef<WH3DriftRow>[] = [
        { field: "status", label: "Status", width: 120, sortable: true, render: (r) => <StatusBadge status={r.canonical_status ?? "missing"} /> },
        { field: "provider", label: "Mode", width: 90, sortable: true, cellClassName: "wh3-mode-cell", render: (r) => r.provider ?? "" },
        {
            field: "source_filename",
            label: "Source",
            width: 200,
            sortable: true,
            cellClassName: "key-cell",
            render: (r) => (
                <a
                    href="#"
                    title={r.source_filename}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openSourceFile(workshopId, r.source_filename).catch(() => {})
                    }}
                >
                    {r.source_filename}
                </a>
            ),
        },
        { field: "key", label: "Key", width: 220, sortable: true, cellClassName: "key-cell", render: (r) => r.key },
        {
            field: "parent_text",
            label: `Original (${sourceLang})`,
            width: 280,
            sortable: true,
            cellClassName: "source-cell",
            render: (r) => r.parent_text ?? <em style={{ color: "var(--text-dim)" }}>orphan</em>,
        },
        {
            field: "translation_text",
            label: targetLang,
            width: 300,
            sortable: true,
            cellClassName: "english-cell",
            render: (r) => (
                <TranslationCell
                    value={r.translation_text ?? ""}
                    previous={r.previous_text}
                    synced={r.canonical_status === "synced"}
                    placeholder="(untranslated)"
                    onSave={(text) => onRowSave(r.key, text)}
                />
            ),
        },
    ]

    if (loading) return <p>Loading...</p>

    const titleBadges = (
        <>
            <SteamLink href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`} />
            <OpenFolderButton onClick={onOpenFolder} />
            {progress?.has_unsynced_changes && <PendingSyncPill />}
        </>
    )

    const languageControls = (
        <LanguageControls
            source={modContext.source_language_override ?? mod?.source_language ?? "Chinese"}
            target={modContext.target_language_override ?? mod?.target_language ?? "Chinese"}
            onSourceChange={saveSourceLanguage}
            onTargetChange={saveTargetLanguage}
        />
    )

    const syncState = progress?.has_unsynced_changes ? "sync" : (progress?.canonical_counts.synced ?? 0) > 0 ? "resync" : "disabled"

    const toolbar = (
        <TranslationToolbar
            glossary={{ count: glossaryCount, onClick: () => setOpenModal("glossary") }}
            suggestions={{ count: suggestions.length, onClick: () => setShowSuggestions(true) }}
            scan={{ scanning, onClick: scan }}
            apiResponses={{ onClick: () => setOpenModal("responses") }}
            context={{ label: "Mod Context", hasContext: !!progress?.has_mod_context, onClick: () => setOpenModal("context") }}
            history={{ onClick: () => setOpenModal("history") }}
            reset={{ onClick: () => setOpenModal("reset") }}
            clearEnglish={{ onClick: onClearEnglish }}
            extraActions={
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleTranslateNamesClick()}
                    disabled={isTranslating || translateCount === 0}
                    title="Translate unit/skill/building/location names first, then review them into the glossary"
                >
                    Translate Names
                </button>
            }
            translate={
                <SplitButton
                    label={`Translate (${activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)})`}
                    onClick={() => handleTranslateClick()}
                    disabled={isTranslating || translateCount === 0}
                    menuDisabled={isTranslating}
                    menuLabel="Translate provider menu"
                    items={["claude"].map((p) => ({ label: p.charAt(0).toUpperCase() + p.slice(1), onSelect: () => setActiveProvider(p) }))}
                />
            }
            sync={<SyncButton state={syncState} confirmMessage={wh3SyncMessage} onSync={onSyncChanges} />}
        />
    )

    const modals = (
        <>
            {showSuggestions && (
                <GlossarySuggestionModal
                    gameId="total_war_warhammer_3"
                    modId={workshopId}
                    suggestions={suggestions}
                    onClose={() => setShowSuggestions(false)}
                    onUpdated={() => {
                        refreshSuggestions()
                        refreshGlossaryCount()
                    }}
                />
            )}
            {openModal === "glossary" && <ModGlossaryModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "responses" && <ApiResponsesModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "context" && <ModContextModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {(openModal === "history" || openModal === "reset") && (
                <HistoryModal workshopId={workshopId} onClose={() => setOpenModal(null)} defaultRestoreMode={openModal === "reset"} onRestored={onRestored} />
            )}
            {preview && <TranslationConfirmModal preview={preview} title={pendingScope === "names" ? "Translate Names" : undefined} onConfirm={onConfirmTranslate} onCancel={() => setPreview(null)} />}

            {/* Post-names review: the translated name strings, surfaced as glossary suggestions to accept/dismiss into the mod glossary. */}
            {nameReviewSuggestions && (
                <GlossarySuggestionModal
                    gameId="total_war_warhammer_3"
                    modId={workshopId}
                    suggestions={nameReviewSuggestions}
                    onClose={() => setNameReviewSuggestions(null)}
                    onUpdated={() => {
                        refreshSuggestions()
                        refreshGlossaryCount()
                    }}
                />
            )}

            {/* Shown when the iterative loop pauses for glossary suggestion review between batches. Closing pauses; the paused banner lets the user resume. */}
            {batchState.phase === "reviewing" && showReviewModal && !namesRunRef.current && (
                <GlossarySuggestionModal
                    gameId="total_war_warhammer_3"
                    modId={workshopId}
                    suggestions={batchState.suggestions}
                    onClose={() => setShowReviewModal(false)}
                    onUpdated={() => {
                        refreshSuggestions()
                        refreshGlossaryCount()
                    }}
                    batchProgress={{ current: batchState.batchIndex + 1, total: batchState.totalBatches }}
                    onContinue={() => {
                        setShowReviewModal(false)
                        continueAfterReview()
                    }}
                />
            )}
            {confirmDialog}
        </>
    )

    return (
        <TranslationPage<WH3DriftRow>
            title={mod?.display_name ?? workshopId}
            progressLabel={`${done} / ${total} total strings translated`}
            onBack={() => navigate(`/${slug}/dashboard`)}
            previewImage={mod?.preview_image_url ? `${API_BASE}${mod.preview_image_url}` : null}
            titleBadges={titleBadges}
            languageControls={languageControls}
            toolbar={toolbar}
            statusFilters={STATUS_FILTERS}
            activeFilter={filter}
            onFilterChange={(v) => setFilter(v as RowStatus | "all")}
            search={search}
            onSearchChange={setSearch}
            columns={columns}
            rows={sortedRows}
            getRowKey={(r) => `${r.source_filename}::${r.key}`}
            getRowClassName={(r) => (r.provider === "claude" ? "wh3-translation-row-claude" : undefined)}
            getRowStyle={(r) => canonicalRowStyle(r.canonical_status ?? "missing", { override: r.canonical_status === "pending" })}
            sortField={sortConfig.direction ? sortConfig.key : null}
            sortDirection={sortConfig.direction}
            onSort={handleSort}
            columnWidths={columnWidths}
            onResizeColumn={onResizeColumn}
            translating={batchState.phase === "translating" ? { batchIndex: batchState.batchIndex, totalBatches: batchState.totalBatches, streaming: batchState.streamingProgress } : null}
            onCancelTranslate={cancelTranslation}
            extraBanners={
                batchState.phase === "reviewing" &&
                !showReviewModal &&
                !namesRunRef.current && (
                    <BatchReviewBanner
                        batchIndex={batchState.batchIndex}
                        totalBatches={batchState.totalBatches}
                        onReview={() => setShowReviewModal(true)}
                        onContinue={continueAfterReview}
                        onCancel={() => {
                            cancelTranslation()
                            setBanner({ type: "success", message: `Translation cancelled. ${batchState.batchIndex} of ${batchState.totalBatches} batches completed.` })
                        }}
                    />
                )
            }
            banner={banner}
            onDismissBanner={() => setBanner(null)}
            modals={modals}
        />
    )
}

export default TranslationDetailsPage

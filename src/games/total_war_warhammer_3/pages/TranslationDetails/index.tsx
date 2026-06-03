import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { FaExclamationCircle, FaFolderOpen, FaSteam } from "react-icons/fa"

import EditableCell from "../../../../components/EditableCell"
import { API_BASE } from "../../../../config"
import { StatusBadge } from "../../../../translation/StatusBadge"
import { TranslationPage } from "../../../../translation/TranslationPage"
import type { ColumnDef } from "../../../../translation/types"
import type { RowStatus } from "../../../../utils/stringFilters"
import type { WH3DriftRow, WH3ModContext, WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"
import ApiResponsesModal from "../../components/ApiResponsesModal"
import HistoryModal from "../../components/HistoryModal"
import ModContextModal from "../../components/ModContextModal"
import ModGlossaryModal from "../../components/ModGlossaryModal"
import ScanForTermsModal from "../../components/ScanForTermsModal"
import {
    clearTranslations,
    fetchModContext,
    fetchStrings,
    listTranslationMods,
    loadGlossary,
    openModFolder,
    rescanMod,
    saveModContext,
    saveString,
    syncChanges,
    translateBatch,
} from "../../translationApi"

// Canonical status filter pills, identical to Chrono Ark. WH3 never emits "untouched"/"untranslatable", but the pill set matches for 1-to-1 parity.
const STATUS_FILTERS: Array<{ value: RowStatus | "all"; label: string }> = [
    { value: "all", label: "All" },
    { value: "missing", label: "Missing" },
    { value: "untouched", label: "Untouched" },
    { value: "pending", label: "Pending" },
    { value: "synced", label: "Synced" },
]
const BATCH_LIMIT = 50

type ModalKey = "glossary" | "scan" | "responses" | "context" | "history" | "reset" | null

type SortField = "status" | "provider" | "source_filename" | "key" | "parent_text" | "translation_text"

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

    const [mod, setMod] = useState<WH3TranslationModSummary | null>(null)
    const [progress, setProgress] = useState<WH3RescanSummary | null>(null)
    const [strings, setStrings] = useState<WH3DriftRow[]>([])
    const [filter, setFilter] = useState<RowStatus | "all">("all")
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [translating, setTranslating] = useState(false)
    const [openModal, setOpenModal] = useState<ModalKey>(null)
    const [modContext, setModContext] = useState<WH3ModContext>({
        source_game: "",
        character_name: "",
        background: "",
        source_language_override: null,
        target_language_override: null,
    })
    const [glossaryCount, setGlossaryCount] = useState<number>(0)
    const [activeProvider, setActiveProvider] = useState<string>("claude")
    const [showTranslateDropdown, setShowTranslateDropdown] = useState<boolean>(false)
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
    const cancelRequestedRef = useRef<boolean>(false)
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

    const runTranslateBatch = useCallback(async () => {
        setTranslating(true)
        cancelRequestedRef.current = false
        try {
            const targetRows = await fetchStrings(workshopId, "untranslated")
            const candidates = targetRows.map((r) => r.key)
            if (candidates.length === 0) {
                setBanner({ type: "success", message: "No untranslated rows to translate." })
                return
            }
            if (candidates.length > BATCH_LIMIT) {
                const ok = window.confirm(`${candidates.length} rows match. Translating in batches of ${BATCH_LIMIT} may take a while and cost API credits. Continue?`)
                if (!ok) return
            }
            const totalBatches = Math.ceil(candidates.length / BATCH_LIMIT)
            for (let i = 0; i < candidates.length; i += BATCH_LIMIT) {
                if (cancelRequestedRef.current) {
                    setBanner({ type: "error", message: `Translation cancelled after ${i} of ${candidates.length} rows` })
                    return
                }
                setBatchProgress({ current: Math.floor(i / BATCH_LIMIT) + 1, total: totalBatches })
                await translateBatch(workshopId, candidates.slice(i, i + BATCH_LIMIT))
            }
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            await loadStrings()
            setBanner({ type: "success", message: `Translated ${candidates.length} rows` })
        } catch (e) {
            setBanner({ type: "error", message: `Translate failed: ${(e as Error).message}` })
        } finally {
            setTranslating(false)
            setBatchProgress(null)
            cancelRequestedRef.current = false
        }
    }, [workshopId, loadStrings])

    const onSyncChanges = useCallback(async () => {
        try {
            const result = await syncChanges(workshopId)
            const fileCount = Object.keys(result.per_file).length
            const keyCount = Object.values(result.per_file).reduce((a, b) => a + b, 0)
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            setBanner({ type: "success", message: `Synced ${keyCount} keys across ${fileCount} files` })
        } catch (e) {
            setBanner({ type: "error", message: `Sync failed: ${(e as Error).message}` })
        }
    }, [workshopId])

    const onClearEnglish = useCallback(async () => {
        if (!window.confirm("Clear all translation text? An auto-snapshot is taken before clearing.")) return
        try {
            const result = await clearTranslations(workshopId)
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            await loadStrings()
            setBanner({ type: "success", message: `Cleared ${result.cleared} translations` })
        } catch (e) {
            setBanner({ type: "error", message: `Clear failed: ${(e as Error).message}` })
        }
    }, [workshopId, loadStrings])

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
            render: (r) => <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{r.source_filename}</span>,
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
            render: (r) => <EditableCell value={r.translation_text ?? ""} onSave={(text) => onRowSave(r.key, text)} placeholder="(untranslated)" />,
        },
    ]

    if (loading) return <p>Loading...</p>

    const titleBadges = (
        <>
            <a
                href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open on Steam Workshop"
                style={{ color: "var(--text-dim)", fontSize: "1.3rem", display: "flex" }}
            >
                <FaSteam />
            </a>
            <button
                type="button"
                onClick={onOpenFolder}
                title="Open local folder"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "1.3rem", display: "flex", padding: 0 }}
            >
                <FaFolderOpen />
            </button>
            {progress?.has_unsynced_changes && (
                <span className="wh3-pending-sync-badge">
                    <FaExclamationCircle size={12} />
                    Changes pending sync
                </span>
            )}
        </>
    )

    const languageControls = (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <label htmlFor="source-lang-select" style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
                Source Language:
            </label>
            <select
                id="source-lang-select"
                value={modContext.source_language_override ?? mod?.source_language ?? "Chinese"}
                onChange={(e) => saveSourceLanguage(e.target.value)}
                style={{ padding: "0.3rem 0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)", fontSize: "0.85rem" }}
            >
                <option value="Chinese">Chinese</option>
                <option value="Korean">Korean</option>
                <option value="Japanese">Japanese</option>
                <option value="Chinese-TW [zh-tw]">Chinese-TW</option>
                <option value="English">English</option>
            </select>
            {(modContext.source_language_override ?? mod?.source_language) === "English" && (
                <>
                    <span style={{ margin: "0 0.3rem", color: "var(--text-dim)" }}>&rarr;</span>
                    <select
                        aria-label="Target Language"
                        value={modContext.target_language_override ?? mod?.target_language ?? "Chinese"}
                        onChange={(e) => saveTargetLanguage(e.target.value)}
                        style={{
                            padding: "0.3rem 0.5rem",
                            borderRadius: "6px",
                            background: "rgba(0,0,0,0.2)",
                            border: "1px solid var(--glass-border)",
                            color: "var(--text-main)",
                            fontSize: "0.85rem",
                        }}
                    >
                        <option value="Chinese">Chinese</option>
                        <option value="Korean">Korean</option>
                        <option value="Japanese">Japanese</option>
                        <option value="Chinese-TW [zh-tw]">Chinese-TW</option>
                    </select>
                </>
            )}
        </div>
    )

    const toolbar = (
        <>
            <div className="mod-actions-group">
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("glossary")}>
                    Mod Glossary ({glossaryCount})
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("scan")}>
                    Scan for Terms
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("responses")}>
                    API Responses
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("context")} style={{ position: "relative" }}>
                    Mod Context
                    {progress?.has_mod_context && <span className="wh3-mod-context-dot" />}
                </button>
            </div>

            <div className="mod-actions-group">
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("history")}>
                    History
                </button>
                <button type="button" className="btn btn-outline" style={{ color: "#ff4444", borderColor: "rgba(255, 68, 68, 0.3)" }} onClick={() => setOpenModal("reset")}>
                    Reset
                </button>
                <button type="button" className="btn btn-outline" style={{ color: "#ffaa44", borderColor: "rgba(255, 170, 68, 0.3)" }} onClick={onClearEnglish}>
                    Clear English
                </button>
            </div>

            <div className="mod-actions-group">
                <div style={{ position: "relative", display: "inline-flex" }}>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={runTranslateBatch}
                        disabled={translating || translateCount === 0}
                        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                    >
                        Translate ({activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)})
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        aria-label="Translate provider menu"
                        onClick={() => setShowTranslateDropdown((v) => !v)}
                        disabled={translating}
                        style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "1px solid rgba(255,255,255,0.2)", padding: "0.5rem 0.4rem" }}
                    >
                        &#9662;
                    </button>
                    {showTranslateDropdown && (
                        <div
                            role="menu"
                            style={{
                                position: "absolute",
                                top: "100%",
                                right: 0,
                                marginTop: "0.25rem",
                                background: "var(--bg-color)",
                                border: "1px solid var(--glass-border)",
                                borderRadius: "6px",
                                padding: "0.25rem",
                                zIndex: 20,
                                minWidth: "120px",
                            }}
                        >
                            {["claude"].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    role="menuitem"
                                    className="btn btn-outline"
                                    onClick={() => {
                                        setActiveProvider(p)
                                        setShowTranslateDropdown(false)
                                    }}
                                    style={{ width: "100%", justifyContent: "flex-start" }}
                                >
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button type="button" className="btn btn-primary" onClick={onSyncChanges}>
                    {progress?.has_unsynced_changes ? "Re-sync Changes" : "Sync Changes"}
                </button>
            </div>
        </>
    )

    const modals = (
        <>
            {openModal === "glossary" && <ModGlossaryModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "scan" && <ScanForTermsModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "responses" && <ApiResponsesModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "context" && <ModContextModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {(openModal === "history" || openModal === "reset") && (
                <HistoryModal workshopId={workshopId} onClose={() => setOpenModal(null)} defaultRestoreMode={openModal === "reset"} onRestored={onRestored} />
            )}
        </>
    )

    return (
        <TranslationPage<WH3DriftRow>
            title={mod?.display_name ?? workshopId}
            progressLabel={`${done} / ${total} total strings translated`}
            onBack={() => navigate("/dashboard")}
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
            sortField={sortConfig.direction ? sortConfig.key : null}
            sortDirection={sortConfig.direction}
            onSort={handleSort}
            columnWidths={columnWidths}
            onResizeColumn={onResizeColumn}
            translating={batchProgress ? { batchIndex: batchProgress.current - 1, totalBatches: batchProgress.total } : null}
            onCancelTranslate={() => {
                cancelRequestedRef.current = true
            }}
            banner={banner}
            onDismissBanner={() => setBanner(null)}
            modals={modals}
        />
    )
}

export default TranslationDetailsPage

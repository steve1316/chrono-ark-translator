import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { FaArrowLeft, FaExclamationCircle, FaFolderOpen, FaSteam } from "react-icons/fa"

import EditableCell from "../../../../components/EditableCell"
import { API_BASE } from "../../../../config"
import type { WH3DriftRow, WH3DriftStatus, WH3ModContext, WH3RescanSummary, WH3TranslationModSummary } from "../../../../shared_types"
import ApiResponsesModal from "../../components/ApiResponsesModal"
import HistoryModal from "../../components/HistoryModal"
import ModContextModal from "../../components/ModContextModal"
import ModGlossaryModal from "../../components/ModGlossaryModal"
import ScanForTermsModal from "../../components/ScanForTermsModal"
import { clearTranslations, fetchModContext, fetchStrings, listTranslationMods, openModFolder, rescanMod, saveModContext, saveString, syncChanges, translateBatch } from "../../translationApi"

const STATUS_FILTERS: Array<WH3DriftStatus | "all"> = ["all", "untranslated", "stale", "translated", "orphan"]
const BATCH_LIMIT = 50

type ModalKey = "glossary" | "scan" | "responses" | "context" | "history" | "reset" | null

/**
 * Per-mod translation review page with full Chrono Ark UI parity.
 * Toolbar opens 5 modals; action row covers Reset / Clear English / Translate (N) / Sync Changes.
 * Search + filter pills + table with Status / Mode / Source / Key / Original / English columns.
 *
 * @returns The rendered page.
 */
const TranslationDetailsPage: React.FC = () => {
    const { workshopId = "" } = useParams<{ workshopId: string }>()

    const [mod, setMod] = useState<WH3TranslationModSummary | null>(null)
    const [progress, setProgress] = useState<WH3RescanSummary | null>(null)
    const [strings, setStrings] = useState<WH3DriftRow[]>([])
    const [filter, setFilter] = useState<WH3DriftStatus | "all">("all")
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [statusText, setStatusText] = useState("")
    const [translating, setTranslating] = useState(false)
    const [openModal, setOpenModal] = useState<ModalKey>(null)
    const navigate = useNavigate()
    const [modContext, setModContext] = useState<WH3ModContext>({
        source_game: "",
        character_name: "",
        background: "",
        source_language_override: null,
        target_language_override: null,
    })

    const skipInitialFilterEffect = useRef(true)

    const loadStrings = useCallback(
        async (status: WH3DriftStatus | "all") => {
            if (!workshopId) return
            const rows = await fetchStrings(workshopId, status === "all" ? undefined : status)
            setStrings(rows)
        },
        [workshopId]
    )

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [allMods, summary, ctx] = await Promise.all([listTranslationMods(), rescanMod(workshopId), fetchModContext(workshopId)])
                if (cancelled) return
                setMod(allMods.find((m) => m.workshop_id === workshopId) ?? null)
                setProgress(summary)
                setModContext(ctx)
                await loadStrings("all")
            } catch (e) {
                setStatusText(`Failed to load: ${(e as Error).message}`)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workshopId, loadStrings])

    useEffect(() => {
        if (skipInitialFilterEffect.current) {
            skipInitialFilterEffect.current = false
            return
        }
        loadStrings(filter)
    }, [filter, loadStrings])

    const onRowSave = useCallback(
        async (key: string, text: string) => {
            try {
                await saveString(workshopId, key, text)
                setStrings((prev) =>
                    prev.map((r) => (r.key === key ? { ...r, translation_text: text, provider: "manual", status: r.status === "untranslated" || r.status === "stale" ? "translated" : r.status } : r))
                )
                setStatusText(`Saved ${key}`)
            } catch (e) {
                setStatusText(`Save failed: ${(e as Error).message}`)
            }
        },
        [workshopId]
    )

    const runTranslateBatch = useCallback(async () => {
        setTranslating(true)
        setStatusText("Loading candidates...")
        try {
            const targetStatus: WH3DriftStatus = filter === "stale" ? "stale" : "untranslated"
            const targetRows = await fetchStrings(workshopId, targetStatus)
            const candidates = targetRows.map((r) => r.key)
            if (candidates.length === 0) {
                setStatusText("No rows match the target status")
                return
            }
            if (candidates.length > BATCH_LIMIT) {
                const ok = window.confirm(`${candidates.length} rows match. Translating in batches of ${BATCH_LIMIT} may take a while and cost API credits. Continue?`)
                if (!ok) {
                    setStatusText("")
                    return
                }
            }
            setStatusText(`Translating ${candidates.length} rows...`)
            for (let i = 0; i < candidates.length; i += BATCH_LIMIT) {
                const batch = candidates.slice(i, i + BATCH_LIMIT)
                await translateBatch(workshopId, batch)
            }
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            await loadStrings(filter)
            setStatusText(`Translated ${candidates.length} rows`)
        } catch (e) {
            setStatusText(`Translate failed: ${(e as Error).message}`)
        } finally {
            setTranslating(false)
        }
    }, [workshopId, filter, loadStrings])

    const onSyncChanges = useCallback(async () => {
        setStatusText("Syncing to .loc.tsv files...")
        try {
            const result = await syncChanges(workshopId)
            const fileCount = Object.keys(result.per_file).length
            const keyCount = Object.values(result.per_file).reduce((a, b) => a + b, 0)
            setStatusText(`Synced ${keyCount} keys across ${fileCount} files`)
        } catch (e) {
            setStatusText(`Sync failed: ${(e as Error).message}`)
        }
    }, [workshopId])

    const onClearEnglish = useCallback(async () => {
        if (!window.confirm("Clear all translation text? An auto-snapshot is taken before clearing.")) return
        try {
            const result = await clearTranslations(workshopId)
            setStatusText(`Cleared ${result.cleared} translations`)
            const summary = await rescanMod(workshopId)
            setProgress(summary)
            await loadStrings(filter)
        } catch (e) {
            setStatusText(`Clear failed: ${(e as Error).message}`)
        }
    }, [workshopId, filter, loadStrings])

    const onRestored = useCallback(async () => {
        const summary = await rescanMod(workshopId)
        setProgress(summary)
        await loadStrings(filter)
        setStatusText("Restored from snapshot")
    }, [workshopId, filter, loadStrings])

    const saveSourceLanguage = useCallback(
        async (value: string) => {
            const next: WH3ModContext = { ...modContext, source_language_override: value === "" ? null : value }
            setModContext(next)
            try {
                await saveModContext(workshopId, next)
            } catch (e) {
                setStatusText(`Language save failed: ${(e as Error).message}`)
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
                setStatusText(`Language save failed: ${(e as Error).message}`)
            }
        },
        [workshopId, modContext]
    )

    const onOpenFolder = useCallback(async () => {
        try {
            await openModFolder(workshopId)
        } catch (e) {
            setStatusText(`Open folder failed: ${(e as Error).message}`)
        }
    }, [workshopId])

    const filteredRows = useMemo(() => {
        if (!search.trim()) return strings
        const needle = search.trim().toLowerCase()
        return strings.filter((r) => r.key.toLowerCase().includes(needle) || (r.parent_text ?? "").toLowerCase().includes(needle) || (r.translation_text ?? "").toLowerCase().includes(needle))
    }, [strings, search])

    const translateCount = useMemo(() => {
        const target: WH3DriftStatus = filter === "stale" ? "stale" : "untranslated"
        return progress?.counts[target] ?? 0
    }, [progress, filter])

    const total = useMemo(() => (progress ? progress.counts.translated + progress.counts.untranslated + progress.counts.stale : 0), [progress])
    const done = useMemo(() => (progress ? progress.counts.translated + progress.counts.stale : 0), [progress])

    if (loading) return <p>Loading...</p>

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <button className="btn btn-outline" onClick={() => navigate("/dashboard")} style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <FaArrowLeft /> Back to Dashboard
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                        {mod?.preview_image_url && (
                            <img
                                src={`${API_BASE}${mod.preview_image_url}`}
                                alt={mod.display_name}
                                style={{
                                    width: "80px",
                                    height: "80px",
                                    borderRadius: "12px",
                                    objectFit: "cover",
                                    border: "1px solid var(--glass-border)",
                                    flexShrink: 0,
                                }}
                            />
                        )}
                        <div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
                                <h1>{mod?.display_name ?? workshopId}</h1>
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
                                    style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "var(--text-dim)",
                                        fontSize: "1.3rem",
                                        display: "flex",
                                        padding: 0,
                                    }}
                                >
                                    <FaFolderOpen />
                                </button>
                                {progress?.has_unsynced_changes && (
                                    <span className="wh3-pending-sync-badge">
                                        <FaExclamationCircle size={12} />
                                        Changes pending sync
                                    </span>
                                )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                                <label htmlFor="source-lang-select" style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
                                    Source Language:
                                </label>
                                <select
                                    id="source-lang-select"
                                    value={modContext.source_language_override ?? mod?.source_language ?? "Chinese"}
                                    onChange={(e) => saveSourceLanguage(e.target.value)}
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
                            <p style={{ marginTop: "0.25rem" }}>
                                {done} / {total} total strings translated
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="wh3-toolbar">
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("glossary")}>
                    Mod Glossary
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("scan")}>
                    Scan for Terms
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("responses")}>
                    API Responses
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("context")}>
                    Mod Context
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("history")}>
                    History
                </button>
            </div>

            <div className="wh3-action-row">
                <button type="button" className="btn btn-outline" onClick={() => setOpenModal("reset")}>
                    Reset
                </button>
                <button type="button" className="btn btn-warning" onClick={onClearEnglish}>
                    Clear English
                </button>
                <button type="button" className="btn btn-primary" onClick={runTranslateBatch} disabled={translating || translateCount === 0}>
                    Translate ({translateCount})
                </button>
                <button type="button" className="btn btn-primary" onClick={onSyncChanges}>
                    Sync Changes
                </button>
            </div>

            <input type="text" className="wh3-search" placeholder="search keys or text..." value={search} onChange={(e) => setSearch(e.target.value)} />

            <div className="translation-toolbar">
                <div className="translation-filter-pills">
                    {STATUS_FILTERS.map((s) => (
                        <button key={s} type="button" className={`translation-filter-pill${filter === s ? " active" : ""}`} onClick={() => setFilter(s)}>
                            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {statusText && <p style={{ color: "var(--text-dim)", margin: "0.5rem 0" }}>{statusText}</p>}

            <div className="glass-card" style={{ padding: 0, overflow: "auto" }}>
                <table className="translation-table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Mode</th>
                            <th>Source</th>
                            <th>Key</th>
                            <th>Original</th>
                            <th>English</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row) => (
                            <tr key={`${row.source_filename}::${row.key}`}>
                                <td>
                                    <span className={`translation-status-pill ${row.status}`}>{row.status}</span>
                                </td>
                                <td className="wh3-mode-cell">{row.provider ?? ""}</td>
                                <td style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{row.source_filename}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{row.key}</td>
                                <td>{row.parent_text ?? <em style={{ color: "var(--text-dim)" }}>orphan</em>}</td>
                                <td>
                                    <EditableCell value={row.translation_text ?? ""} onSave={(text) => onRowSave(row.key, text)} placeholder="(untranslated)" />
                                </td>
                            </tr>
                        ))}
                        {filteredRows.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-dim)", padding: "2rem" }}>
                                    No rows match the current filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {openModal === "glossary" && <ModGlossaryModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "scan" && <ScanForTermsModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "responses" && <ApiResponsesModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {openModal === "context" && <ModContextModal workshopId={workshopId} onClose={() => setOpenModal(null)} />}
            {(openModal === "history" || openModal === "reset") && (
                <HistoryModal workshopId={workshopId} onClose={() => setOpenModal(null)} defaultRestoreMode={openModal === "reset"} onRestored={onRestored} />
            )}
        </>
    )
}

export default TranslationDetailsPage

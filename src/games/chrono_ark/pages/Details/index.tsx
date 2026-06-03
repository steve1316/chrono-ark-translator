import React, { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { FaSteam, FaFileExport, FaBook, FaFolderOpen, FaExclamationCircle } from "react-icons/fa"
import type { GlossaryTerm, LocString, TermSuggestion } from "../../../../shared_types"
import { getRowStatus, getRowStyle, filterStrings, sortStrings } from "../../../../utils/stringFilters"
import type { SortField, SortDirection } from "../../../../utils/stringFilters"
import { gameApi } from "../../../../api/games"
import { API_BASE } from "../../../../config"
import GlossarySuggestionModal from "../../../../components/GlossarySuggestionModal"
import TranslationConfirmModal from "../../../../components/TranslationConfirmModal"
import ApiResponsesModal from "../../components/ApiResponsesModal"
import BackupHistoryModal from "../../components/BackupHistoryModal"
import ChronoArkGlossaryPanel from "../../components/ChronoArkGlossaryPanel"
import ConfirmModal from "../../../../components/ConfirmModal"
import { TranslationPage } from "../../../../translation/TranslationPage"
import { StatusBadge } from "../../../../translation/StatusBadge"
import type { ColumnDef } from "../../../../translation/types"
import EditableCell from "../../../../components/EditableCell"
import { useIterativeTranslation } from "../../../../hooks/useIterativeTranslation"
import type { BatchDescriptor } from "../../../../hooks/useIterativeTranslation"

interface CharacterContextPanelProps {
    modId: string
    onHasContextChange: (has: boolean) => void
}

function CharacterContextPanel({ modId, onHasContextChange }: CharacterContextPanelProps) {
    const [ctx, setCtx] = useState({ source_game: "", character_name: "", background: "" })
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        const fetchCtx = async () => {
            try {
                const res = await gameApi("chrono_ark").get(`/mods/${modId}/character-context`)
                if (res.ok) {
                    const data = await res.json()
                    setCtx(data)
                    onHasContextChange(!!(data.source_game || data.character_name || data.background))
                }
            } catch {}
        }
        fetchCtx()
    }, [modId, onHasContextChange])

    const handleSave = async () => {
        try {
            const res = await gameApi("chrono_ark").post(`/mods/${modId}/character-context`, ctx)
            if (res.ok) {
                onHasContextChange(!!(ctx.source_game || ctx.character_name || ctx.background))
                setSaved(true)
                setTimeout(() => setSaved(false), 2000)
            }
        } catch (err) {
            console.error("Failed to save character context:", err)
        }
    }

    return (
        <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Character Context</h3>
            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 0, marginBottom: "1rem" }}>
                This context is included in the translation prompt to help the AI understand the character's lore.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Source Game</label>
                    <input
                        type="text"
                        placeholder="e.g. Library of Ruina"
                        value={ctx.source_game}
                        onChange={(e) => setCtx((prev) => ({ ...prev, source_game: e.target.value }))}
                        style={{
                            width: "100%",
                            padding: "0.5rem",
                            borderRadius: "6px",
                            background: "rgba(0,0,0,0.2)",
                            border: "1px solid var(--glass-border)",
                            color: "var(--text-main)",
                            boxSizing: "border-box",
                        }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Character Name
                    </label>
                    <input
                        type="text"
                        placeholder="e.g. Roland"
                        value={ctx.character_name}
                        onChange={(e) => setCtx((prev) => ({ ...prev, character_name: e.target.value }))}
                        style={{
                            width: "100%",
                            padding: "0.5rem",
                            borderRadius: "6px",
                            background: "rgba(0,0,0,0.2)",
                            border: "1px solid var(--glass-border)",
                            color: "var(--text-main)",
                            boxSizing: "border-box",
                        }}
                    />
                </div>
            </div>
            <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Background</label>
                <textarea
                    placeholder="Describe the character's personality, role in their source game, and any lore that would help with translation..."
                    value={ctx.background}
                    onChange={(e) => setCtx((prev) => ({ ...prev, background: e.target.value }))}
                    rows={4}
                    style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "6px",
                        background: "rgba(0,0,0,0.2)",
                        border: "1px solid var(--glass-border)",
                        color: "var(--text-main)",
                        resize: "vertical",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                    }}
                />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem", alignItems: "center", gap: "0.75rem" }}>
                {saved && <span style={{ color: "#34d399", fontSize: "0.85rem" }}>Saved!</span>}
                <button className="btn btn-primary" onClick={handleSave} style={{ background: "rgba(129,230,217,0.15)", color: "#81e6d9", borderColor: "rgba(129,230,217,0.3)" }}>
                    Save Context
                </button>
            </div>
        </div>
    )
}

/**
 * Detail view for a specific mod, showing all translatable strings.
 *
 * Reads the active mod id from the URL via React Router's `useParams` and
 * uses `useNavigate` to return to the dashboard.
 *
 * @returns The rendered mod detail view.
 */
const ModDetail: React.FC = () => {
    const { modId } = useParams<{ modId: string }>()
    const navigate = useNavigate()
    const onBack = useCallback(() => navigate("/dashboard"), [navigate])
    const [strings, setStrings] = useState<LocString[]>([])
    const [modName, setModName] = useState<string>("")
    const [modAuthor, setModAuthor] = useState<string>("")
    const [modPreviewImage, setModPreviewImage] = useState<string | null>(null)
    const [modUrl, setModUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const [filter, setFilter] = useState<"all" | "missing" | "untouched" | "pending" | "synced">("all")
    const [search, setSearch] = useState("")

    const [sortConfig, setSortConfig] = useState<{ key: SortField; direction: SortDirection }>({
        key: "key",
        direction: "asc",
    })

    const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({
        is_translated: 120,
        translated_by: 100,
        key: 200,
        source_file: 100,
        source: 400,
        english: 500,
    })

    const [hasExportChanges, setHasExportChanges] = useState(false)
    const [hasPreviousSync, setHasPreviousSync] = useState(false)

    const [suggestions, setSuggestions] = useState<TermSuggestion[]>([])
    const [showSuggestionModal, setShowSuggestionModal] = useState(false)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [modGlossary, setModGlossary] = useState<Record<string, GlossaryTerm>>({})

    const [translationPreview, setTranslationPreview] = useState<any>(null)
    const [pendingRetranslate, setPendingRetranslate] = useState(false)
    const [pendingProvider, setPendingProvider] = useState<string>("")
    const [activeProvider, setActiveProvider] = useState<string>("")
    const [showGlossaryPanel, setShowGlossaryPanel] = useState(false)
    const [translateBanner, setTranslateBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)

    const [showTranslateDropdown, setShowTranslateDropdown] = useState(false)
    const [showCharacterContext, setShowCharacterContext] = useState(false)
    const [hasCharacterContext, setHasCharacterContext] = useState(false)
    const handleHasContextChange = useCallback((has: boolean) => setHasCharacterContext(has), [])

    // Preflight: check whether character context exists so the dot indicator shows on mount.
    useEffect(() => {
        if (!modId) return
        gameApi("chrono_ark")
            .get(`/mods/${modId}/character-context`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) setHasCharacterContext(!!(data.source_game || data.character_name || data.background))
            })
            .catch(() => {})
    }, [modId])

    const [sourceLangOverride, setSourceLangOverride] = useState<string | null>(null)
    const [targetLangOverride, setTargetLangOverride] = useState<string | null>(null)

    const [exporting, setExporting] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [showApiResponses, setShowApiResponses] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
    const [confirmModal, setConfirmModal] = useState<{
        type: "export" | "resync" | "reset" | "clear-translations" | "delete-all-glossary" | "restore-backup" | "delete-backup"
        message: string | React.ReactNode
        entryId?: string
        entryDate?: string
    } | null>(null)

    /** Callback fired by the iterative translation hook after each batch completes. */
    const handleBatchTranslated = useCallback((translations: Record<string, string>) => {
        setStrings((prev) =>
            prev.map((s) => {
                if (s.key in translations) {
                    return { ...s, english: translations[s.key], is_translated: true }
                }
                return s
            })
        )
        fetchExportStatus()
    }, [])

    const { state: batchState, startTranslation, continueAfterReview, cancel: cancelTranslation } = useIterativeTranslation("chrono_ark", modId ?? "", handleBatchTranslated)

    // React to batch translation phase changes.
    useEffect(() => {
        if (batchState.phase === "reviewing") {
            // Auto-open the review modal when a batch finishes with suggestions.
            setShowReviewModal(true)
        } else if (batchState.phase === "complete") {
            setShowReviewModal(false)
            setTranslateBanner({ type: "success", message: `Translated ${batchState.totalTranslated} strings.` })
            fetchSuggestions()
            fetchExportStatus()
            fetchModDetail(true)
        } else if (batchState.phase === "error") {
            setShowReviewModal(false)
            const partial = batchState.completedBatches > 0 ? ` ${batchState.completedBatches} batch(es) completed before the error.` : ""
            setTranslateBanner({ type: "error", message: `${batchState.message}${partial}` })
            fetchSuggestions()
            fetchModDetail(true)
        }
    }, [batchState.phase]) // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Initiates the translation workflow by fetching a preview from the backend.
     *
     * The workflow is two-step:
     *   1. This function calls POST `/api/translate/preview` to get batch counts,
     *      prompt previews, and cost estimates without actually translating.
     *   2. If there are strings to translate, the preview data is stored in state
     *      which triggers the TranslationConfirmModal to open.
     *   3. The user reviews and confirms, which starts the iterative batch
     *      translation loop via the `useIterativeTranslation` hook.
     *
     * If all strings are already translated, a success banner is shown instead.
     *
     * @param provider - The AI provider identifier (e.g. "claude").
     */
    const handleTranslateClick = async (provider: string, retranslate = false) => {
        if (!modId) return
        setTranslateBanner(null)
        try {
            // POST /api/games/chrono_ark/translate/preview — returns { total_strings, total_batches, batch_size, provider, previews, estimates }
            const res = await gameApi("chrono_ark").post("/translate/preview", { mod_id: modId, provider, retranslate })
            const data = await res.json()
            if (!res.ok) {
                setTranslateBanner({ type: "error", message: data.detail || "Failed to fetch translation preview." })
                return
            }
            if (data.total_strings === 0) {
                setTranslateBanner({ type: "success", message: "All strings are already translated." })
                return
            }
            // Store the provider and preview so the confirmation modal can render.
            setPendingProvider(provider)
            setPendingRetranslate(retranslate)
            setTranslationPreview(data)
        } catch (err) {
            console.error("Failed to fetch translation preview:", err)
            setTranslateBanner({ type: "error", message: "Failed to reach the server for translation preview." })
        }
    }

    /**
     * Ref tracking the active column resize operation. Stores which column field
     * is being resized, the pointer's starting X position, and the column's width
     * at the start of the drag. Null when no resize is in progress.
     */

    /**
     * Fetches whether there are pending translation changes that can be exported
     * (synced) to the mod's CSV files.
     * GET `/api/mods/:modId/export-status` -> `{ has_changes: boolean }`.
     */
    const fetchExportStatus = async () => {
        if (!modId) return
        try {
            const res = await gameApi("chrono_ark").get(`/mods/${modId}/export-status`)
            if (res.ok) {
                const data = await res.json()
                setHasExportChanges(data.has_changes)
                setHasPreviousSync(data.has_previous_sync ?? false)
            }
        } catch {}
    }

    /**
     * Fetches AI-generated glossary term suggestions for this mod.
     * GET `/api/mods/:modId/glossary/suggestions` -> `TermSuggestion[]`.
     * Suggestions are shown as a badge on the "Suggestions" button.
     */
    const fetchSuggestions = async () => {
        if (!modId) return
        try {
            const res = await gameApi("chrono_ark").get(`/mods/${modId}/glossary/suggestions`)
            if (res.ok) {
                const data = await res.json()
                setSuggestions(data)
            }
        } catch {}
    }

    /**
     * Fetches the mod-specific glossary terms.
     * GET `/api/mods/:modId/glossary` -> `{ terms: Record<string, { category, source_mappings }> }`.
     * Called when the glossary panel is opened.
     */
    const fetchModGlossary = async () => {
        if (!modId) return
        try {
            const res = await gameApi("chrono_ark").get(`/mods/${modId}/glossary`)
            if (res.ok) {
                const data = await res.json()
                setModGlossary(data.terms || {})
            }
        } catch {}
    }

    /**
     * Fetches the full mod detail including all localization strings, mod metadata,
     * GET `/api/mods/:modId` -> `{ strings, name, author, preview_image, url }`.
     */
    const fetchModDetail = async (silent = false) => {
        if (!modId) return
        if (!silent) setLoading(true)
        try {
            const res = await gameApi("chrono_ark").get(`/mods/${modId}`)
            const data = await res.json()
            setStrings(data.strings)
            setModName(data.name ?? "")
            setModAuthor(data.author ?? "")
            setModPreviewImage(data.preview_image ?? null)
            setModUrl(data.url ?? null)
            setSourceLangOverride(data.source_language_override ?? null)
            setTargetLangOverride(data.target_language_override ?? null)
        } catch (err) {
            console.error("Failed to fetch mod detail:", err)
        } finally {
            setLoading(false)
        }
    }

    const saveSourceLanguage = async (lang: string | null) => {
        setSourceLangOverride(lang)
        // When switching away from English source, clear target override
        if (lang !== "English" && targetLangOverride) {
            setTargetLangOverride(null)
            gameApi("chrono_ark")
                .post(`/mods/${modId}/target-language`, { target_language: null })
                .catch(() => {})
        }
        try {
            await gameApi("chrono_ark").post(`/mods/${modId}/source-language`, { source_language: lang })
            fetchModDetail(true)
        } catch (err) {
            console.error("Failed to save source language:", err)
        }
    }

    const saveTargetLanguage = async (lang: string | null) => {
        setTargetLangOverride(lang)
        try {
            await gameApi("chrono_ark").post(`/mods/${modId}/target-language`, { target_language: lang })
            fetchModDetail(true)
        } catch (err) {
            console.error("Failed to save target language:", err)
        }
    }

    // On mount (or when modId changes), fetch all required data in parallel.
    useEffect(() => {
        fetchModDetail()
        fetchExportStatus()
        fetchSuggestions()
        fetchModGlossary()
        fetch(`${API_BASE}/settings`)
            .then((r) => r.json())
            .then((data) => setActiveProvider(data.provider))
            .catch(() => {})
    }, [modId])

    /**
     * Handles sorting when a column header is clicked.
     * @param field - The field to sort by.
     */
    const handleSort = (field: SortField) => {
        let direction: SortDirection = "asc"
        if (sortConfig.key === field && sortConfig.direction === "asc") {
            direction = "desc"
        } else if (sortConfig.key === field && sortConfig.direction === "desc") {
            direction = null
        }
        setSortConfig({ key: field, direction })
    }

    /**
     * Saves a manual translation for a specific string key.
     * POST `/api/mods/:modId/strings` -> `{ key, english }`.
     *
     * On success, updates the local `strings` state optimistically so the table
     * reflects the change immediately. A string is marked as translated if it has
     * a non-empty English value OR its source text is blank (nothing to translate).
     *
     * Also re-fetches export status since the new edit may enable the Sync button.
     *
     * @param key - The localization key to update.
     * @param newValue - The new English translation text.
     */
    const handleSaveString = async (key: string, newValue: string) => {
        if (!modId) return
        try {
            const res = await gameApi("chrono_ark").post(`/mods/${modId}/strings`, { key, english: newValue })
            if (res.ok) {
                // Optimistic update: mark translated if English is non-empty or source is blank.
                setStrings((prev) =>
                    prev.map((s) =>
                        s.key === key
                            ? { ...s, english: newValue, is_translated: !!newValue || !s.source.trim(), is_synced: s.synced_english !== "" && newValue === s.synced_english, translated_by: "manual" }
                            : s
                    )
                )
                fetchExportStatus()
            }
        } catch (err) {
            console.error("Failed to save manual translation:", err)
        }
    }

    // Uses pointer events with setPointerCapture for reliable cross-browser drag
    // behavior. The resizer div is a narrow handle rendered at the right edge of
    // each <th>. Minimum column width is clamped to 80px.

    /**
     * This memoized computation derives the visible rows from the full strings
     * array. It applies three stages in order:
     *   1. Filter by translation status (all / translated / untranslated)
     *   2. Filter by free-text search across key, source, and english fields
     *   3. Sort by the currently active column + direction
     *
     * Note: A string with blank source text is treated as "done" (nothing to
     * translate), matching the same logic used in `handleSaveString`.
     */
    const processedStrings = React.useMemo(() => {
        return sortStrings(filterStrings(strings, filter, search), sortConfig)
    }, [strings, filter, search, sortConfig])

    /**
     * Writes saved translations back to the mod's original CSV files on disk.
     * POST `/api/mods/:modId/export` -> `{ applied, files_written }`.
     *
     * On success, reports how many translations were applied and which files were
     * written.
     */
    const handleExportConfirm = (resync: boolean) => {
        if (!modId) return
        const resyncNote = resync ? "This will restore the original files and re-apply all translations from scratch.\n\n" : ""
        setConfirmModal({
            type: resync ? "resync" : "export",
            message: `${resyncNote}This will overwrite the mod's localization files (CSVs and/or gdata JSONs) with your translations. Continue?`,
        })
    }

    const handleExport = async (resync = false) => {
        if (!modId) return
        setExporting(true)
        try {
            const path = resync ? `/mods/${modId}/export?resync=true` : `/mods/${modId}/export`
            const res = await gameApi("chrono_ark").post(path)
            if (res.ok) {
                const data = await res.json()
                const parts: string[] = []
                if (data.files_written?.length) {
                    parts.push(`${data.files_written.length} CSV file(s): ${data.files_written.join(", ")}`)
                }
                if (data.gdata_files_written?.length) {
                    parts.push(`${data.gdata_files_written.length} gdata JSON file(s): ${data.gdata_files_written.join(", ")}`)
                }
                if (data.keyed_overrides_written > 0) {
                    parts.push(`${data.keyed_overrides_written} keyed override(s)`)
                }
                if (data.text_overrides_written > 0) {
                    parts.push(`${data.text_overrides_written} DLL text override(s)`)
                }
                const hasInjector = data.keyed_overrides_written > 0 || data.text_overrides_written > 0
                const target = hasInjector ? " to ModTranslationInjector" : ""
                setTranslateBanner({ type: "success", message: `Synced ${data.applied} translation(s): ${parts.join(", ")}${target}` })
                fetchExportStatus()
                fetchModDetail()
            } else {
                const error = await res.json()
                setTranslateBanner({ type: "error", message: `Export failed: ${error.detail || "Unknown error"}` })
            }
        } catch (err) {
            console.error("Failed to export translations:", err)
            setTranslateBanner({ type: "error", message: "Failed to export translations. Check console for details." })
        } finally {
            setExporting(false)
        }
    }

    /**
     * Resets the mod by clearing all translation data and restoring the
     * original CSV files (if they were backed up before the first export).
     * POST `/api/mods/:modId/reset`.
     */
    const handleResetConfirm = () => {
        setConfirmModal({
            type: "reset",
            message: (
                <>
                    Are you sure you want to reset this mod? This will:
                    <ul style={{ margin: "0.75rem 0", paddingLeft: "1.25rem" }}>
                        <li>Delete all translation progress and extracted strings</li>
                        <li>Restore the original CSV and gdata JSON files (if previously synced)</li>
                    </ul>
                    Character context and glossary will be preserved.
                    <br />A backup will be created first.
                </>
            ),
        })
    }

    const handleReset = async () => {
        if (!modId) return
        try {
            const res = await gameApi("chrono_ark").post(`/mods/${modId}/reset`)
            if (res.ok) {
                const data = await res.json()
                const csvMsg = data.csv_restored ? " Original CSV files restored." : ""
                const gdataMsg = data.gdata_restored ? " Original gdata JSON files restored." : ""
                const overridesMsg = data.overrides_cleared ? " Translation overrides removed." : ""
                fetchModDetail()
                fetchExportStatus()
                fetchSuggestions()
                fetchModGlossary()
                setTranslateBanner({ type: "success", message: `Reset complete.${csvMsg}${gdataMsg}${overridesMsg}` })
            } else {
                const error = await res.json()
                setTranslateBanner({ type: "error", message: `Failed to reset: ${error.detail || "Unknown error"}` })
            }
        } catch (err) {
            console.error("Failed to reset:", err)
            setTranslateBanner({ type: "error", message: "Failed to reset. Check console for details." })
        }
    }

    /**
     * Clears only the English translations for all strings in this mod, resetting
     * them to empty. This allows all rows to be re-sent to the AI provider.
     * POST `/api/mods/:modId/clear-translations`.
     *
     * Unlike `handleClearCache`, this preserves the extracted source strings and
     * mod metadata — only the English column is wiped.
     */
    const handleClearTranslationsConfirm = () => {
        setConfirmModal({
            type: "clear-translations",
            message: "Are you sure you want to clear all English translations? This will allow all rows to be sent to the AI provider.",
        })
    }

    const handleClearTranslations = async () => {
        if (!modId) return
        try {
            const res = await gameApi("chrono_ark").post(`/mods/${modId}/clear-translations`)
            if (res.ok) {
                setStrings((prev) => prev.map((s) => ({ ...s, english: "", is_translated: false, is_synced: false })))
                fetchExportStatus()
            } else {
                const error = await res.json()
                setTranslateBanner({ type: "error", message: `Failed to clear translations: ${error.detail || "Unknown error"}` })
            }
        } catch (err) {
            console.error("Failed to clear translations:", err)
            setTranslateBanner({ type: "error", message: "Failed to clear translations. Check console for details." })
        }
    }

    /**
     * Opens the mod's local folder in the system file explorer.
     * POST `/api/mods/:modId/open`.
     *
     * This is a convenience action so users can inspect or manually edit
     * the mod's CSV files on disk.
     */
    const handleOpenFolder = async () => {
        if (!modId) return
        try {
            const res = await gameApi("chrono_ark").post(`/mods/${modId}/open`)
            if (!res.ok) {
                const error = await res.json()
                setTranslateBanner({ type: "error", message: `Failed to open folder: ${error.detail || "Unknown error"}` })
            }
        } catch (err) {
            console.error("Failed to open folder:", err)
        }
    }

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                <h2 style={{ color: "var(--text-dim)", animation: "pulse 2s infinite" }}>Loading mod details...</h2>
            </div>
        )
    }

    if (!modId) return <div>Mod ID not found.</div>

    const columns: ColumnDef<LocString>[] = [
        { field: "is_translated", label: "Status", width: columnWidths.is_translated ?? 120, sortable: true, render: (s) => <StatusBadge status={getRowStatus(s)} reason={s.untranslatable_reason} /> },
        { field: "translated_by", label: "Mode", width: 100, sortable: true, cellClassName: "key-cell", render: (s) => <span title={s.translated_by}>{s.translated_by || "—"}</span> },
        {
            field: "source_file",
            label: "Source",
            width: 100,
            sortable: true,
            cellClassName: "key-cell",
            render: (s) => (
                <a
                    href="#"
                    title={s.source_file}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        gameApi("chrono_ark").post(`/mods/${modId}/open-source-file/${encodeURIComponent(s.source_file)}`)
                    }}
                >
                    {s.source_file}
                </a>
            ),
        },
        { field: "key", label: "Key", width: 200, sortable: true, cellClassName: "key-cell", render: (s) => <span title={s.key}>{s.key}</span> },
        { field: "source", label: `Original (${sourceLangOverride || "Chinese"})`, width: 400, sortable: true, cellClassName: "source-cell", render: (s) => s.source },
        {
            field: "english",
            label: targetLangOverride || "English",
            width: 500,
            sortable: true,
            cellClassName: "english-cell",
            render: (s) =>
                getRowStatus(s) === "untranslatable" ? (
                    <span className="untranslatable-hint" title={s.untranslatable_reason}>
                        {s.untranslatable_reason}
                    </span>
                ) : (
                    <>
                        {s.original_english && s.original_english !== s.english && (
                            <div className="prev-translation" style={s.is_synced ? { color: "rgba(52, 211, 153, 0.6)" } : undefined}>
                                {s.original_english}
                            </div>
                        )}
                        <EditableCell value={s.english} onSave={(val) => handleSaveString(s.key, val)} placeholder={!s.source ? "" : s.is_translated ? "" : "Pending translation..."} />
                    </>
                ),
        },
    ]

    return (
        <TranslationPage<LocString>
            onBack={onBack}
            previewImage={modPreviewImage ? `${API_BASE}${modPreviewImage}` : null}
            title={modName || modId}
            titleBadges={
                <>
                    {" "}
                    {modUrl && (
                        <a
                            href={modUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open on Steam Workshop"
                            style={{ color: "var(--text-dim)", fontSize: "1.3rem", transition: "color 0.2s", display: "flex" }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "#66c0f4")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
                        >
                            <FaSteam />
                        </a>
                    )}
                    <button
                        onClick={handleOpenFolder}
                        title="Open local folder"
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-dim)",
                            fontSize: "1.3rem",
                            transition: "color 0.2s",
                            display: "flex",
                            padding: 0,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
                    >
                        <FaFolderOpen />
                    </button>
                    {hasExportChanges && (
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                fontSize: "0.8rem",
                                padding: "0.3rem 0.7rem",
                                background: "rgba(251, 191, 36, 0.12)",
                                border: "1px solid rgba(251, 191, 36, 0.3)",
                                borderRadius: "8px",
                                color: "#fbbf24",
                                fontWeight: 600,
                            }}
                        >
                            <FaExclamationCircle size={12} />
                            Changes pending sync
                        </span>
                    )}
                </>
            }
            subtitle={modAuthor ? `by ${modAuthor}` : undefined}
            languageControls={
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                    <label style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Source Language:</label>
                    <select
                        value={sourceLangOverride || "Chinese"}
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
                    {sourceLangOverride === "English" && (
                        <>
                            <span style={{ margin: "0 0.3rem", color: "var(--text-dim)" }}>→</span>
                            <select
                                value={targetLangOverride || "Chinese"}
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
            }
            progressLabel={`${strings.filter((s) => s.source.trim() && !s.untranslatable_reason && s.is_translated).length} / ${strings.filter((s) => s.source.trim() && !s.untranslatable_reason).length} total strings translated`}
            toolbar={
                <>
                    {/* Glossary, suggestions, and character context toggles. */}
                    <div className="mod-actions-group">
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                setShowGlossaryPanel(!showGlossaryPanel)
                                if (!showGlossaryPanel) fetchModGlossary()
                            }}
                            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                        >
                            <FaBook /> Mod Glossary ({Object.keys(modGlossary).length})
                        </button>
                        {suggestions.length > 0 && (
                            <button
                                className="btn btn-outline"
                                onClick={() => setShowSuggestionModal(true)}
                                style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-secondary)", borderColor: "rgba(187,154,247,0.3)", position: "relative" }}
                            >
                                <FaBook /> Suggestions
                                <span
                                    style={{
                                        position: "absolute",
                                        top: "-6px",
                                        right: "-6px",
                                        background: "var(--accent-secondary)",
                                        color: "#fff",
                                        borderRadius: "50%",
                                        width: "20px",
                                        height: "20px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "0.7rem",
                                        fontWeight: 700,
                                    }}
                                >
                                    {suggestions.length}
                                </span>
                            </button>
                        )}
                        <button
                            className="btn btn-outline"
                            disabled={scanning}
                            onClick={async () => {
                                setScanning(true)
                                try {
                                    const res = await gameApi("chrono_ark").post(`/mods/${modId}/glossary/suggestions/scan`)
                                    if (res.ok) {
                                        const data = await res.json()
                                        if (data.new > 0) {
                                            fetchSuggestions()
                                            setTranslateBanner({ type: "success", message: `Found ${data.new} new glossary term suggestion(s).` })
                                        } else {
                                            setTranslateBanner({ type: "success", message: "No new glossary terms found." })
                                        }
                                    }
                                } catch (err) {
                                    console.error("Failed to scan for terms:", err)
                                } finally {
                                    setScanning(false)
                                }
                            }}
                            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                        >
                            <FaBook /> {scanning ? "Scanning..." : "Scan for Terms"}
                        </button>
                        <button className="btn btn-outline" onClick={() => setShowApiResponses(true)} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            API Responses
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => setShowCharacterContext(!showCharacterContext)}
                            style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#81e6d9", borderColor: "rgba(129,230,217,0.3)", position: "relative" }}
                        >
                            Character Context
                            {hasCharacterContext && (
                                <span
                                    style={{
                                        position: "absolute",
                                        top: "-4px",
                                        right: "-4px",
                                        width: "8px",
                                        height: "8px",
                                        borderRadius: "50%",
                                        background: "#81e6d9",
                                    }}
                                />
                            )}
                        </button>
                    </div>

                    {/* Destructive actions and history. */}
                    <div className="mod-actions-group">
                        <button className="btn btn-outline" onClick={() => setShowHistory(true)} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            History
                        </button>
                        <button className="btn btn-outline" style={{ color: "#ff4444", borderColor: "rgba(255, 68, 68, 0.3)" }} onClick={handleResetConfirm}>
                            Reset
                        </button>
                        <button className="btn btn-outline" style={{ color: "#ffaa44", borderColor: "rgba(255, 170, 68, 0.3)" }} onClick={handleClearTranslationsConfirm}>
                            Clear English
                        </button>
                    </div>

                    {/* Translation trigger and CSV sync. */}
                    <div className="mod-actions-group">
                        <div style={{ position: "relative", display: "inline-flex" }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleTranslateClick("")}
                                disabled={batchState.phase === "translating" || batchState.phase === "reviewing"}
                                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                            >
                                Translate{activeProvider ? ` (${activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)})` : ""}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowTranslateDropdown((v) => !v)}
                                disabled={batchState.phase === "translating" || batchState.phase === "reviewing"}
                                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: "1px solid rgba(255,255,255,0.2)", padding: "0.5rem 0.4rem" }}
                            >
                                &#9662;
                            </button>
                            {showTranslateDropdown && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "100%",
                                        left: 0,
                                        marginTop: "4px",
                                        background: "var(--glass-bg)",
                                        border: "1px solid var(--glass-border)",
                                        borderRadius: "8px",
                                        padding: "0.25rem 0",
                                        zIndex: 20,
                                        minWidth: "100%",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: "100%", textAlign: "left", borderRadius: "6px", padding: "0.5rem 1rem" }}
                                        onClick={() => {
                                            setShowTranslateDropdown(false)
                                            handleTranslateClick("", true)
                                        }}
                                    >
                                        Re-Translate All
                                    </button>
                                </div>
                            )}
                        </div>
                        {hasExportChanges ? (
                            <button className="btn btn-primary" onClick={() => handleExportConfirm(false)} disabled={exporting} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <FaFileExport />
                                {exporting ? "Syncing..." : "Sync Changes"}
                            </button>
                        ) : hasPreviousSync ? (
                            <button className="btn btn-primary" onClick={() => handleExportConfirm(true)} disabled={exporting} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <FaFileExport />
                                {exporting ? "Syncing..." : "Re-sync Changes"}
                            </button>
                        ) : (
                            <button className="btn btn-primary" disabled style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <FaFileExport />
                                Sync Changes
                            </button>
                        )}
                    </div>
                </>
            }
            statusFilters={[
                { value: "all", label: "All" },
                { value: "missing", label: "Missing" },
                { value: "untouched", label: "Untouched" },
                { value: "pending", label: "Pending" },
                { value: "synced", label: "Synced" },
            ]}
            activeFilter={filter}
            onFilterChange={(v) => setFilter(v as typeof filter)}
            search={search}
            onSearchChange={setSearch}
            columns={columns}
            rows={processedStrings}
            getRowKey={(s) => s.key}
            getRowStyle={getRowStyle}
            sortField={sortConfig.direction ? sortConfig.key : null}
            sortDirection={sortConfig.direction}
            onSort={(f) => handleSort(f as SortField)}
            columnWidths={columnWidths}
            onResizeColumn={(field, width) => setColumnWidths((prev) => ({ ...prev, [field]: width }))}
            translating={batchState.phase === "translating" ? { batchIndex: batchState.batchIndex, totalBatches: batchState.totalBatches, streaming: batchState.streamingProgress } : null}
            onCancelTranslate={() => {
                cancelTranslation()
                setTranslateBanner({ type: "success", message: "Translation cancelled." })
            }}
            extraBanners={
                batchState.phase === "reviewing" &&
                !showReviewModal && (
                    <div
                        className="glass-card"
                        style={{
                            padding: "1.25rem 1.5rem",
                            marginBottom: "1rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "1rem",
                            background: "rgba(250,204,21,0.08)",
                            border: "1px solid rgba(250,204,21,0.25)",
                        }}
                    >
                        <span style={{ color: "var(--text-main)" }}>
                            Batch {batchState.batchIndex + 1} of {batchState.totalBatches} complete.
                        </span>
                        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                            <button className="btn btn-primary" onClick={() => setShowReviewModal(true)} style={{ padding: "0.25rem 0.75rem" }}>
                                Review Suggestions
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    continueAfterReview()
                                }}
                                style={{ padding: "0.25rem 0.75rem" }}
                            >
                                Continue
                            </button>
                            <button
                                className="btn btn-outline"
                                onClick={() => {
                                    cancelTranslation()
                                    setTranslateBanner({ type: "success", message: `Translation cancelled. ${batchState.batchIndex} of ${batchState.totalBatches} batches completed.` })
                                }}
                                style={{ padding: "0.25rem 0.75rem" }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            }
            banner={translateBanner}
            onDismissBanner={() => setTranslateBanner(null)}
            panels={
                <>
                    {showGlossaryPanel && (
                        <ChronoArkGlossaryPanel
                            glossary={modGlossary}
                            modId={modId!}
                            strings={strings}
                            onChanged={fetchModGlossary}
                            onApplied={(message) => {
                                setTranslateBanner({ type: "success", message })
                                fetchModDetail(true)
                                fetchExportStatus()
                            }}
                            onRequestDeleteAll={() => setConfirmModal({ type: "delete-all-glossary", message: `Delete all ${Object.keys(modGlossary).length} glossary term(s)?` })}
                            onSuggestionsChanged={fetchSuggestions}
                        />
                    )}

                    {/* --- Character Context Panel ---
                Allows the user to provide metadata about the mod's character
                (source game, character name, background lore). This context
                is injected into the AI translation prompt so the provider can
                produce more accurate, lore-consistent translations. */}
                    {showCharacterContext && modId && <CharacterContextPanel modId={modId} onHasContextChange={handleHasContextChange} />}
                </>
            }
            modals={
                <>
                    {showSuggestionModal && (
                        <GlossarySuggestionModal
                            gameId="chrono_ark"
                            modId={modId!}
                            suggestions={suggestions}
                            onClose={() => setShowSuggestionModal(false)}
                            onUpdated={() => {
                                fetchSuggestions()
                                fetchModGlossary()
                            }}
                        />
                    )}

                    {/* --- History Backup Modal --- */}
                    {showHistory && modId && (
                        <BackupHistoryModal
                            modId={modId}
                            refreshKey={historyRefreshKey}
                            onClose={() => setShowHistory(false)}
                            onRestore={(entry) =>
                                setConfirmModal({
                                    type: "restore-backup",
                                    message: `Restore to backup from ${new Date(entry.created_at).toLocaleString()}? A backup of the current state will be created first.`,
                                    entryId: entry.id,
                                    entryDate: new Date(entry.created_at).toLocaleString(),
                                })
                            }
                            onDelete={(entry) => setConfirmModal({ type: "delete-backup", message: "Delete this backup?", entryId: entry.id })}
                        />
                    )}

                    {/* --- API Response Viewer Modal --- */}
                    {showApiResponses && modId && <ApiResponsesModal modId={modId} onClose={() => setShowApiResponses(false)} />}

                    {/* --- Translation Confirmation Modal ---
                Shown after handleTranslateClick fetches a preview. Displays
                prompt previews, batch counts, and cost estimates. On confirm,
                starts the iterative batch translation loop via the hook. */}
                    {translationPreview && (
                        <TranslationConfirmModal
                            preview={translationPreview}
                            title={pendingRetranslate ? "Confirm Re-Translation" : undefined}
                            onConfirm={() => {
                                const plan: BatchDescriptor[] = translationPreview.batch_plan || []
                                setTranslationPreview(null)
                                setTranslateBanner(null)
                                startTranslation(pendingProvider || activeProvider, plan)
                            }}
                            onCancel={() => setTranslationPreview(null)}
                        />
                    )}

                    {/* --- Batch Translation Review Modal ---
                Shown automatically when the iterative hook pauses for glossary
                suggestion review between batches. Closing the modal pauses the
                process; the user can resume via the paused banner below. */}
                    {batchState.phase === "reviewing" && showReviewModal && (
                        <GlossarySuggestionModal
                            gameId="chrono_ark"
                            modId={modId!}
                            suggestions={batchState.suggestions}
                            onClose={() => setShowReviewModal(false)}
                            onUpdated={() => {
                                fetchSuggestions()
                                fetchModGlossary()
                            }}
                            batchProgress={{ current: batchState.batchIndex + 1, total: batchState.totalBatches }}
                            onContinue={() => {
                                setShowReviewModal(false)
                                continueAfterReview()
                            }}
                        />
                    )}

                    {/* --- Confirm Modal ---
                Single reusable confirmation modal that handles all destructive
                action confirmations. The `confirmModal` state determines which
                action to dispatch on confirm. */}
                    {confirmModal && (
                        <ConfirmModal
                            title={
                                {
                                    export: "Sync Changes",
                                    resync: "Re-sync Changes",
                                    reset: "Reset Mod",
                                    "clear-translations": "Clear Translations",
                                    "delete-all-glossary": "Delete All Glossary Terms",
                                    "restore-backup": "Restore Backup",
                                    "delete-backup": "Delete Backup",
                                }[confirmModal.type]
                            }
                            message={confirmModal.message}
                            variant={
                                {
                                    export: "warning" as const,
                                    resync: "warning" as const,
                                    reset: "danger" as const,
                                    "clear-translations": "danger" as const,
                                    "delete-all-glossary": "danger" as const,
                                    "restore-backup": "warning" as const,
                                    "delete-backup": "danger" as const,
                                }[confirmModal.type]
                            }
                            confirmLabel={
                                {
                                    export: "Sync",
                                    resync: "Re-sync",
                                    reset: "Reset",
                                    "clear-translations": "Clear",
                                    "delete-all-glossary": "Delete All",
                                    "restore-backup": "Restore",
                                    "delete-backup": "Delete",
                                }[confirmModal.type]
                            }
                            onCancel={() => setConfirmModal(null)}
                            onConfirm={async () => {
                                const type = confirmModal.type
                                const entryId = confirmModal.entryId
                                setConfirmModal(null)
                                switch (type) {
                                    case "export":
                                        handleExport(false)
                                        break
                                    case "resync":
                                        handleExport(true)
                                        break
                                    case "reset":
                                        handleReset()
                                        break
                                    case "clear-translations":
                                        handleClearTranslations()
                                        break
                                    case "delete-all-glossary":
                                        await gameApi("chrono_ark").post(`/mods/${modId}/glossary/delete`, { all: true })
                                        fetchModGlossary()
                                        break
                                    case "restore-backup":
                                        try {
                                            const res = await gameApi("chrono_ark").post(`/mods/${modId}/history/${entryId}/restore`)
                                            if (res.ok) {
                                                setShowHistory(false)
                                                setTranslateBanner({ type: "success", message: "Restored from backup successfully." })
                                                fetchModDetail()
                                                fetchExportStatus()
                                                fetchSuggestions()
                                                fetchModGlossary()
                                            }
                                        } catch (err) {
                                            console.error("Failed to restore backup:", err)
                                        }
                                        break
                                    case "delete-backup":
                                        try {
                                            await fetch(gameApi("chrono_ark").url(`/mods/${modId}/history/${entryId}`), { method: "DELETE" })
                                            setHistoryRefreshKey((k) => k + 1)
                                        } catch (err) {
                                            console.error("Failed to delete backup:", err)
                                        }
                                        break
                                }
                            }}
                        />
                    )}
                </>
            }
        />
    )
}

export default ModDetail

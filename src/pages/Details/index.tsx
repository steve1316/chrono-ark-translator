import React, { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "react-router-dom"
import { FaSteam, FaArrowLeft, FaSort, FaSortUp, FaSortDown, FaFileExport, FaBook, FaFolderOpen, FaExclamationCircle } from "react-icons/fa"
import type { LocString, TermSuggestion } from "../../shared_types"
import { API_BASE } from "../../config"
import GlossarySuggestionModal from "../../components/GlossarySuggestionModal"
import TranslationConfirmModal from "../../components/TranslationConfirmModal"
import ConfirmModal from "../../components/ConfirmModal"
import EditableCell from "../../components/EditableCell"
import { useIterativeTranslation } from "../../hooks/useIterativeTranslation"
import type { BatchDescriptor } from "../../hooks/useIterativeTranslation"

/**
 * Props for the ModDetail component.
 */
interface ModDetailProps {
    /** Callback to navigate back to the dashboard/mod list. */
    onBack: () => void
}

/** Columns that support click-to-sort in the strings table. */
type SortField = "is_translated" | "key" | "source_file" | "source" | "english"

/**
 * Sort direction for a column: ascending, descending, or null (unsorted).
 * Clicking a column header cycles through asc -> desc -> null.
 */
type SortDirection = "asc" | "desc" | null

/**
 * Detail view for a specific mod, showing all translatable strings.
 * @param onBack - Callback to return to the dashboard.
 * @returns The rendered mod detail view.
 */
const ModDetail: React.FC<ModDetailProps> = ({ onBack }) => {
    const { modId } = useParams<{ modId: string }>()
    const [strings, setStrings] = useState<LocString[]>([])
    const [modName, setModName] = useState<string>("")
    const [modAuthor, setModAuthor] = useState<string>("")
    const [modPreviewImage, setModPreviewImage] = useState<string | null>(null)
    const [modUrl, setModUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const [filter, setFilter] = useState<"all" | "missing" | "pending" | "synced">("all")
    const [search, setSearch] = useState("")

    const [sortConfig, setSortConfig] = useState<{ key: SortField; direction: SortDirection }>({
        key: "key",
        direction: "asc",
    })

    const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({
        status: 80,
        key: 300,
        source_file: 150,
        source: 500,
        english: 500,
    })

    const [hasExportChanges, setHasExportChanges] = useState(false)
    const [hasPreviousSync, setHasPreviousSync] = useState(false)
    const [duplicateFiles, setDuplicateFiles] = useState<string[]>([])
    const [showDuplicateDetails, setShowDuplicateDetails] = useState(false)

    const [suggestions, setSuggestions] = useState<TermSuggestion[]>([])
    const [showSuggestionModal, setShowSuggestionModal] = useState(false)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [modGlossary, setModGlossary] = useState<Record<string, { category: string; source_mappings: Record<string, string> }>>({})

    const [translationPreview, setTranslationPreview] = useState<any>(null)
    const [pendingProvider, setPendingProvider] = useState<string>("")
    const [activeProvider, setActiveProvider] = useState<string>("")
    const [showGlossaryPanel, setShowGlossaryPanel] = useState(false)
    const [newTermEnglish, setNewTermEnglish] = useState("")
    const [newTermSource, setNewTermSource] = useState("")
    const [newTermLang, setNewTermLang] = useState("Chinese")
    const [newTermCategory, setNewTermCategory] = useState("custom")
    const [editingTerm, setEditingTerm] = useState<string | null>(null)
    const [editTermEnglish, setEditTermEnglish] = useState("")
    const [editTermSource, setEditTermSource] = useState("")
    const [editTermLang, setEditTermLang] = useState("Chinese")
    const [editTermCategory, setEditTermCategory] = useState("custom")
    const [renamedTerm, setRenamedTerm] = useState<{ oldName: string; newName: string } | null>(null)
    const [translateBanner, setTranslateBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)

    const [characterContext, setCharacterContext] = useState<{
        source_game: string
        character_name: string
        background: string
    }>({ source_game: "", character_name: "", background: "" })
    const [showCharacterContext, setShowCharacterContext] = useState(false)
    const [characterContextSaved, setCharacterContextSaved] = useState(false)

    const [exporting, setExporting] = useState(false)
    const [showApiResponses, setShowApiResponses] = useState(false)
    const [replacePreview, setReplacePreview] = useState<{
        oldTerm: string
        newTerm: string
        sourceText: string
        needsInput: boolean
        affected: { key: string; old_text: string; new_text: string }[]
    } | null>(null)
    const [apiResponses, setApiResponses] = useState<any[]>([])
    const [activeResponseIdx, setActiveResponseIdx] = useState(0)
    const [showHistory, setShowHistory] = useState(false)
    const [historyEntries, setHistoryEntries] = useState<{ id: string; reason: string; created_at: string; files: string[] }[]>([])
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

    const { state: batchState, startTranslation, continueAfterReview, cancel: cancelTranslation } = useIterativeTranslation(modId ?? "", handleBatchTranslated)

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
        } else if (batchState.phase === "error") {
            setShowReviewModal(false)
            const partial = batchState.completedBatches > 0 ? ` ${batchState.completedBatches} batch(es) completed before the error.` : ""
            setTranslateBanner({ type: "error", message: `${batchState.message}${partial}` })
            fetchSuggestions()
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
    const handleTranslateClick = async (provider: string) => {
        if (!modId) return
        setTranslateBanner(null)
        try {
            // POST /api/translate/preview — returns { total_strings, total_batches, batch_size, provider, previews, estimates }
            const res = await fetch(`${API_BASE}/translate/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mod_id: modId, provider }),
            })
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
    const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null)

    /**
     * Fetches whether there are pending translation changes that can be exported
     * (synced) to the mod's CSV files.
     * GET `/api/mods/:modId/export-status` -> `{ has_changes: boolean }`.
     */
    const fetchExportStatus = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/export-status`)
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
            const res = await fetch(`${API_BASE}/mods/${modId}/glossary/suggestions`)
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
            const res = await fetch(`${API_BASE}/mods/${modId}/glossary`)
            if (res.ok) {
                const data = await res.json()
                setModGlossary(data.terms || {})
            }
        } catch {}
    }

    /**
     * Fetches character context metadata for this mod.
     * GET `/api/mods/:modId/character-context` -> `{ source_game, character_name, background }`.
     * This context is passed to AI providers to improve translation quality.
     */
    const fetchCharacterContext = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/character-context`)
            if (res.ok) {
                const data = await res.json()
                setCharacterContext(data)
            }
        } catch {}
    }

    /**
     * Fetches the full mod detail including all localization strings, mod metadata,
     * and duplicate file information.
     * GET `/api/mods/:modId` -> `{ strings, name, author, preview_image, url, duplicate_files }`.
     */
    const fetchModDetail = async (silent = false) => {
        if (!modId) return
        if (!silent) setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}`)
            const data = await res.json()
            setStrings(data.strings)
            setModName(data.name ?? "")
            setModAuthor(data.author ?? "")
            setModPreviewImage(data.preview_image ?? null)
            setModUrl(data.url ?? null)
            setDuplicateFiles(data.duplicate_files ?? [])
        } catch (err) {
            console.error("Failed to fetch mod detail:", err)
        } finally {
            setLoading(false)
        }
    }

    // On mount (or when modId changes), fetch all required data in parallel.
    useEffect(() => {
        fetchModDetail()
        fetchExportStatus()
        fetchSuggestions()
        fetchModGlossary()
        fetchCharacterContext()
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
            const res = await fetch(`${API_BASE}/mods/${modId}/strings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, english: newValue }),
            })
            if (res.ok) {
                // Optimistic update: mark translated if English is non-empty or source is blank.
                setStrings((prev) =>
                    prev.map((s) =>
                        s.key === key ? { ...s, english: newValue, is_translated: !!newValue || !s.source.trim(), is_synced: s.synced_english !== "" && newValue === s.synced_english } : s
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
     * Starts the column resizing process by capturing the pointer and recording
     * the initial drag position and column width.
     *
     * @param e - Pointer event from the resizer handle element.
     * @param field - The column field key being resized (e.g. `"status"`, `"key"`).
     */
    const onResizeStart = (e: React.PointerEvent, field: string) => {
        resizingRef.current = {
            field,
            startX: e.pageX,
            startWidth: columnWidths[field],
        }
        // Capture the pointer so move/up events continue even if the cursor leaves the element.
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }

    /**
     * Updates the column width in real-time as the pointer moves during a resize.
     * Width is clamped to a minimum of 80px.
     *
     * @param e - Pointer move event.
     */
    const onResizeMove = (e: React.PointerEvent) => {
        if (!resizingRef.current) return
        const deltaX = e.pageX - resizingRef.current.startX
        const newWidth = Math.max(80, resizingRef.current.startWidth + deltaX)
        setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.field]: newWidth }))
    }

    /**
     * Ends the column resize operation by clearing the tracking ref.
     *
     * @param _ - Pointer up event.
     */
    const onResizeEnd = (_: React.PointerEvent) => {
        resizingRef.current = null
    }

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
        let result = strings.filter((s) => {
            // A string is "done" if explicitly translated OR its source is blank.
            const isDone = s.is_translated || !s.source.trim()
            const isPending = isDone && !s.is_synced
            const matchesFilter = filter === "all" || (filter === "missing" && !isDone) || (filter === "pending" && isPending) || (filter === "synced" && s.is_synced)

            // Case-insensitive search across all text columns.
            const matchesSearch =
                s.key.toLowerCase().includes(search.toLowerCase()) ||
                s.source_file.toLowerCase().includes(search.toLowerCase()) ||
                s.source.toLowerCase().includes(search.toLowerCase()) ||
                s.english.toLowerCase().includes(search.toLowerCase())

            return matchesFilter && matchesSearch
        })

        // Apply sorting only when a direction is active (null means unsorted).
        if (sortConfig.direction) {
            result.sort((a, b) => {
                const aValue = a[sortConfig.key]
                const bValue = b[sortConfig.key]

                if (aValue === bValue) return 0

                const comparison = aValue < bValue ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        }

        return result
    }, [strings, filter, search, sortConfig])

    /**
     * Retrieves the appropriate sort icon for a field.
     * @param field - The field to check.
     * @returns React icon component.
     */
    const getSortIcon = (field: SortField) => {
        if (sortConfig.key !== field || !sortConfig.direction) return <FaSort className="sort-icon" />
        return sortConfig.direction === "asc" ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
    }

    /**
     * Writes saved translations back to the mod's original CSV files on disk.
     * POST `/api/mods/:modId/export` -> `{ applied, files_written, files_removed }`.
     *
     * Shows a confirmation dialog first (including duplicate file warnings if any).
     * On success, reports how many translations were applied and which files were
     * written. If duplicate files existed, they are consolidated (merged then deleted)
     * as part of the export.
     */
    const handleExportConfirm = (resync: boolean) => {
        if (!modId) return
        const dupeWarning =
            duplicateFiles.length > 0
                ? `\n\nThis will also consolidate ${duplicateFiles.length} duplicate file(s):\n${duplicateFiles.join("\n")}\n\nDuplicate files will be deleted after merging.`
                : ""
        const resyncNote = resync ? "This will restore the original files and re-apply all translations from scratch.\n\n" : ""
        setConfirmModal({
            type: resync ? "resync" : "export",
            message: `${resyncNote}This will overwrite the mod's localization files (CSVs and/or gdata JSONs) with your translations.${dupeWarning} Continue?`,
        })
    }

    const handleExport = async (resync = false) => {
        if (!modId) return
        setExporting(true)
        try {
            const url = resync ? `${API_BASE}/mods/${modId}/export?resync=true` : `${API_BASE}/mods/${modId}/export`
            const res = await fetch(url, { method: "POST" })
            if (res.ok) {
                const data = await res.json()
                const removedMsg = data.files_removed?.length ? `\nConsolidated ${data.files_removed.length} duplicate file(s).` : ""
                const parts: string[] = []
                if (data.files_written?.length) {
                    parts.push(`${data.files_written.length} CSV file(s): ${data.files_written.join(", ")}`)
                }
                if (data.gdata_files_written?.length) {
                    parts.push(`${data.gdata_files_written.length} gdata JSON file(s): ${data.gdata_files_written.join(", ")}`)
                }
                setTranslateBanner({ type: "success", message: `Synced ${data.applied} translations to ${parts.join("\n")}${removedMsg}` })
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
            const res = await fetch(`${API_BASE}/mods/${modId}/reset`, {
                method: "POST",
            })
            if (res.ok) {
                const data = await res.json()
                const csvMsg = data.csv_restored ? " Original CSV files restored." : ""
                const gdataMsg = data.gdata_restored ? " Original gdata JSON files restored." : ""
                fetchModDetail()
                fetchExportStatus()
                fetchSuggestions()
                fetchModGlossary()
                setTranslateBanner({ type: "success", message: `Reset complete.${csvMsg}${gdataMsg}` })
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
            const res = await fetch(`${API_BASE}/mods/${modId}/clear-translations`, {
                method: "POST",
            })
            if (res.ok) {
                setStrings((prev) => prev.map((s) => ({ ...s, english: "", is_translated: !s.source.trim() })))
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
            const res = await fetch(`${API_BASE}/mods/${modId}/open`, { method: "POST" })
            if (!res.ok) {
                const error = await res.json()
                setTranslateBanner({ type: "error", message: `Failed to open folder: ${error.detail || "Unknown error"}` })
            }
        } catch (err) {
            console.error("Failed to open folder:", err)
        }
    }

    /**
     * Persists the character context metadata to the backend.
     * POST `/api/mods/:modId/character-context` -> `{ source_game, character_name, background }`.
     *
     * On success, shows a transient "Saved!" indicator that auto-clears after 2 seconds.
     */
    const handleSaveCharacterContext = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/character-context`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(characterContext),
            })
            if (res.ok) {
                setCharacterContextSaved(true)
                setTimeout(() => setCharacterContextSaved(false), 2000)
            }
        } catch (err) {
            console.error("Failed to save character context:", err)
        }
    }

    const fetchHistory = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/history`)
            if (res.ok) {
                const data = await res.json()
                setHistoryEntries(data)
                setShowHistory(true)
            }
        } catch (err) {
            console.error("Failed to fetch history:", err)
        }
    }

    const fetchApiResponses = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/api-responses`)
            if (res.ok) {
                const data = await res.json()
                setApiResponses(data)
                setActiveResponseIdx(0)
                setShowApiResponses(true)
            }
        } catch (err) {
            console.error("Failed to fetch API responses:", err)
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

    return (
        <div className="mod-detail">
            {/* --- Header: Mod info, navigation, and action buttons --- */}
            <div className="dashboard-header">
                <div className="title-group">
                    <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <FaArrowLeft /> Back to Dashboard
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                        {modPreviewImage && (
                            <img
                                src={`${API_BASE}${modPreviewImage}`}
                                alt={modName}
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
                                <h1>{modName || modId}</h1>
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
                            </div>
                            {modAuthor && <p style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>by {modAuthor}</p>}
                            <p>
                                {strings.filter((s) => s.is_translated || !s.source.trim()).length} / {strings.length} total strings translated
                            </p>
                        </div>
                    </div>
                </div>

                {/* --- Action Buttons: glossary, suggestions, character context, clear, translate, sync --- */}
                <div className="mod-actions">
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
                        <button className="btn btn-outline" onClick={fetchApiResponses} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            API Responses
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                setShowCharacterContext(!showCharacterContext)
                                if (!showCharacterContext) fetchCharacterContext()
                            }}
                            style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#81e6d9", borderColor: "rgba(129,230,217,0.3)", position: "relative" }}
                        >
                            Character Context
                            {(characterContext.source_game || characterContext.character_name || characterContext.background) && (
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
                        <button className="btn btn-outline" onClick={fetchHistory} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
                        <button className="btn btn-primary" onClick={() => handleTranslateClick("")} disabled={batchState.phase === "translating" || batchState.phase === "reviewing"}>
                            Translate{activeProvider ? ` (${activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)})` : ""}
                        </button>
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
                </div>
            </div>

            {/* --- Translation In-Progress Spinner --- */}
            {batchState.phase === "translating" && (
                <div
                    className="glass-card"
                    style={{
                        padding: "1.25rem 1.5rem",
                        marginBottom: "1rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        background: "rgba(125,211,252,0.08)",
                        border: "1px solid rgba(125,211,252,0.25)",
                    }}
                >
                    <div
                        style={{
                            width: "20px",
                            height: "20px",
                            border: "3px solid rgba(125,211,252,0.3)",
                            borderTop: "3px solid var(--accent-primary)",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                        }}
                    />
                    <span style={{ color: "var(--text-main)" }}>
                        Translating batch {batchState.batchIndex + 1} of {batchState.totalBatches}...{" "}
                        {batchState.streamingProgress
                            ? `${batchState.streamingProgress.tokensGenerated} tokens (${batchState.streamingProgress.tokensPerSec} tok/s, ${batchState.streamingProgress.elapsedSec}s elapsed)`
                            : "waiting for provider response"}
                    </span>
                    <button
                        className="btn btn-outline"
                        onClick={() => {
                            cancelTranslation()
                            setTranslateBanner({ type: "success", message: `Translation cancelled. ${batchState.batchIndex} of ${batchState.totalBatches} batches completed.` })
                        }}
                        style={{ marginLeft: "auto", padding: "0.25rem 0.75rem" }}
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* --- Batch Paused Banner ---
                Shown when the user closes the review modal to inspect the table.
                They can resume the review or cancel remaining batches. */}
            {batchState.phase === "reviewing" && !showReviewModal && (
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
            )}

            {/* --- Translation Result Banner (success/error) — dismissible --- */}
            {translateBanner && (
                <div
                    className="glass-card"
                    style={{
                        padding: "1rem 1.5rem",
                        marginBottom: "1rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: translateBanner.type === "error" ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)",
                        border: `1px solid ${translateBanner.type === "error" ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.3)"}`,
                    }}
                >
                    <span
                        style={{
                            color: translateBanner.type === "error" ? "#f87171" : "#34d399",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {translateBanner.message}
                    </span>
                    <button
                        onClick={() => setTranslateBanner(null)}
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "1.2rem", padding: "0 0.25rem" }}
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* --- Search & Filter Bar --- */}
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                        <input
                            type="text"
                            placeholder="Search keys or text..."
                            className="btn-outline"
                            style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", background: "rgba(0,0,0,0.2)" }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className={`btn ${filter === "all" ? "btn-primary" : "btn-outline"}`} onClick={() => setFilter("all")}>
                            All
                        </button>
                        <button className={`btn ${filter === "missing" ? "btn-primary" : "btn-outline"}`} onClick={() => setFilter("missing")}>
                            Missing
                        </button>
                        <button className={`btn ${filter === "pending" ? "btn-primary" : "btn-outline"}`} onClick={() => setFilter("pending")}>
                            Pending
                        </button>
                        <button className={`btn ${filter === "synced" ? "btn-primary" : "btn-outline"}`} onClick={() => setFilter("synced")}>
                            Synced
                        </button>
                    </div>
                </div>
            </div>

            {/* --- Glossary Panel ---
                Inline panel for managing mod-specific glossary terms.
                Users can add new terms (English + source text + language + category)
                and remove existing ones. These terms are sent to the AI provider
                during translation to enforce consistent terminology. */}
            {showGlossaryPanel && (
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h3 style={{ margin: 0 }}>Mod Glossary Terms</h3>
                        {Object.keys(modGlossary).length > 0 && (
                            <button
                                className="btn btn-outline"
                                style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                onClick={() => {
                                    setConfirmModal({
                                        type: "delete-all-glossary",
                                        message: `Delete all ${Object.keys(modGlossary).length} glossary term(s)?`,
                                    })
                                }}
                            >
                                Delete All
                            </button>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                        <input
                            type="text"
                            placeholder="English term"
                            value={newTermEnglish}
                            onChange={(e) => setNewTermEnglish(e.target.value)}
                            style={{
                                padding: "0.5rem",
                                borderRadius: "6px",
                                background: "rgba(0,0,0,0.2)",
                                border: "1px solid var(--glass-border)",
                                color: "var(--text-main)",
                                flex: 1,
                                minWidth: "120px",
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Source text"
                            value={newTermSource}
                            onChange={(e) => setNewTermSource(e.target.value)}
                            style={{
                                padding: "0.5rem",
                                borderRadius: "6px",
                                background: "rgba(0,0,0,0.2)",
                                border: "1px solid var(--glass-border)",
                                color: "var(--text-main)",
                                flex: 1,
                                minWidth: "120px",
                            }}
                        />
                        <select
                            value={newTermLang}
                            onChange={(e) => setNewTermLang(e.target.value)}
                            style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}
                        >
                            <option value="Chinese">Chinese</option>
                            <option value="Korean">Korean</option>
                            <option value="Japanese">Japanese</option>
                        </select>
                        <select
                            value={newTermCategory}
                            onChange={(e) => setNewTermCategory(e.target.value)}
                            style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}
                        >
                            <option value="custom">Custom</option>
                            <option value="characters">Characters</option>
                            <option value="skills">Skills</option>
                            <option value="buffs">Buffs</option>
                            <option value="items">Items</option>
                            <option value="mechanics">Mechanics</option>
                        </select>
                        <button
                            className="btn btn-primary"
                            disabled={!newTermEnglish.trim()}
                            onClick={async () => {
                                await fetch(`${API_BASE}/mods/${modId}/glossary`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ english: newTermEnglish, source_mappings: { [newTermLang]: newTermSource }, category: newTermCategory }),
                                })
                                setNewTermEnglish("")
                                setNewTermSource("")
                                fetchModGlossary()
                            }}
                        >
                            Add
                        </button>
                    </div>
                    {Object.keys(modGlossary).length === 0 ? (
                        <p style={{ color: "var(--text-dim)", textAlign: "center" }}>No mod-specific glossary terms yet. Add terms above or accept AI suggestions.</p>
                    ) : (
                        <div style={{ maxHeight: "300px", overflow: "auto", paddingRight: "0.75rem" }}>
                            {Object.entries(modGlossary)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([english, info]) => (
                                    <div key={english} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--glass-border)" }}>
                                        {editingTerm === english ? (
                                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                                                <input
                                                    type="text"
                                                    value={editTermEnglish}
                                                    onChange={(e) => setEditTermEnglish(e.target.value)}
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--accent-primary)",
                                                        color: "var(--text-main)",
                                                        flex: 1,
                                                        minWidth: "100px",
                                                    }}
                                                />
                                                <input
                                                    type="text"
                                                    value={editTermSource}
                                                    onChange={(e) => setEditTermSource(e.target.value)}
                                                    placeholder="Source text"
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--accent-primary)",
                                                        color: "var(--text-main)",
                                                        flex: 1,
                                                        minWidth: "100px",
                                                    }}
                                                />
                                                <select
                                                    value={editTermLang}
                                                    onChange={(e) => setEditTermLang(e.target.value)}
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--glass-border)",
                                                        color: "var(--text-main)",
                                                    }}
                                                >
                                                    <option value="Chinese">Chinese</option>
                                                    <option value="Korean">Korean</option>
                                                    <option value="Japanese">Japanese</option>
                                                </select>
                                                <select
                                                    value={editTermCategory}
                                                    onChange={(e) => setEditTermCategory(e.target.value)}
                                                    style={{
                                                        padding: "0.4rem",
                                                        borderRadius: "6px",
                                                        background: "rgba(0,0,0,0.2)",
                                                        border: "1px solid var(--glass-border)",
                                                        color: "var(--text-main)",
                                                    }}
                                                >
                                                    <option value="custom">Custom</option>
                                                    <option value="characters">Characters</option>
                                                    <option value="skills">Skills</option>
                                                    <option value="buffs">Buffs</option>
                                                    <option value="items">Items</option>
                                                    <option value="mechanics">Mechanics</option>
                                                </select>
                                                <button
                                                    className="btn btn-primary"
                                                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                                                    onClick={async () => {
                                                        // Delete old term if english name changed
                                                        if (editTermEnglish !== english) {
                                                            await fetch(`${API_BASE}/mods/${modId}/glossary/${encodeURIComponent(english)}`, { method: "DELETE" })
                                                        }
                                                        await fetch(`${API_BASE}/mods/${modId}/glossary`, {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ english: editTermEnglish, source_mappings: { [editTermLang]: editTermSource }, category: editTermCategory }),
                                                        })
                                                        if (editTermEnglish !== english) {
                                                            setRenamedTerm({ oldName: english, newName: editTermEnglish })
                                                        }
                                                        setEditingTerm(null)
                                                        fetchModGlossary()
                                                    }}
                                                >
                                                    Save
                                                </button>
                                                <button className="btn btn-outline" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }} onClick={() => setEditingTerm(null)}>
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div>
                                                    <span style={{ fontWeight: 500 }}>{english}</span>
                                                    <span style={{ color: "var(--text-dim)", marginLeft: "0.75rem", fontSize: "0.85rem" }}>
                                                        {Object.entries(info.source_mappings || {})
                                                            .map(([lang, text]) => `${lang}: ${text}`)
                                                            .join(", ")}
                                                    </span>
                                                    <span
                                                        style={{
                                                            marginLeft: "0.75rem",
                                                            fontSize: "0.75rem",
                                                            padding: "0.1rem 0.4rem",
                                                            borderRadius: "4px",
                                                            background: "rgba(138,180,248,0.15)",
                                                            color: "var(--accent-primary)",
                                                            textTransform: "capitalize",
                                                        }}
                                                    >
                                                        {info.category}
                                                    </span>
                                                </div>
                                                <div style={{ display: "flex", gap: "0.35rem" }}>
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                                                        onClick={() => {
                                                            setRenamedTerm(null)
                                                            setEditingTerm(english)
                                                            setEditTermEnglish(english)
                                                            const firstLang = Object.keys(info.source_mappings || {})[0] || "Chinese"
                                                            setEditTermSource((info.source_mappings || {})[firstLang] || "")
                                                            setEditTermLang(firstLang)
                                                            setEditTermCategory(info.category || "custom")
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem", color: "var(--accent-primary)", borderColor: "rgba(138,180,248,0.3)" }}
                                                        onClick={() => {
                                                            const oldEnglish = renamedTerm && renamedTerm.newName === english ? renamedTerm.oldName : ""
                                                            const sourceText = Object.values(info.source_mappings || {})[0] || ""
                                                            if (!sourceText) return
                                                            const sourceMatches = strings.filter((s) => s.source.includes(sourceText))
                                                            const affected = oldEnglish
                                                                ? sourceMatches
                                                                      .filter((s) => s.english.includes(oldEnglish))
                                                                      .map((s) => ({
                                                                          key: s.key,
                                                                          old_text: s.english,
                                                                          new_text: s.english.replace(new RegExp(oldEnglish.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), english),
                                                                      }))
                                                                : sourceMatches.filter((s) => !s.english).map((s) => ({ key: s.key, old_text: s.english, new_text: english }))
                                                            setReplacePreview({ oldTerm: oldEnglish, newTerm: english, sourceText, needsInput: !oldEnglish, affected })
                                                        }}
                                                    >
                                                        Apply
                                                    </button>
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                                        onClick={async () => {
                                                            await fetch(`${API_BASE}/mods/${modId}/glossary/${encodeURIComponent(english)}`, { method: "DELETE" })
                                                            fetchModGlossary()
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* --- Character Context Panel ---
                Allows the user to provide metadata about the mod's character
                (source game, character name, background lore). This context
                is injected into the AI translation prompt so the provider can
                produce more accurate, lore-consistent translations. */}
            {showCharacterContext && (
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                    <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Character Context</h3>
                    <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 0, marginBottom: "1rem" }}>
                        This context is included in the translation prompt to help the AI understand the character's lore.
                    </p>
                    <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem" }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                Source Game
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Library of Ruina"
                                value={characterContext.source_game}
                                onChange={(e) => setCharacterContext((prev) => ({ ...prev, source_game: e.target.value }))}
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
                                value={characterContext.character_name}
                                onChange={(e) => setCharacterContext((prev) => ({ ...prev, character_name: e.target.value }))}
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
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Background
                        </label>
                        <textarea
                            placeholder="Describe the character's personality, role in their source game, and any lore that would help with translation..."
                            value={characterContext.background}
                            onChange={(e) => setCharacterContext((prev) => ({ ...prev, background: e.target.value }))}
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
                        {characterContextSaved && <span style={{ color: "#34d399", fontSize: "0.85rem" }}>Saved!</span>}
                        <button
                            className="btn btn-primary"
                            onClick={handleSaveCharacterContext}
                            style={{ background: "rgba(129,230,217,0.15)", color: "#81e6d9", borderColor: "rgba(129,230,217,0.3)" }}
                        >
                            Save Context
                        </button>
                    </div>
                </div>
            )}

            {/* --- Duplicate Files Warning ---
                Shown when the backend detects multiple localization CSV files with
                the same language in the mod directory. Clicking "Sync Changes"
                will consolidate these duplicates by merging their contents and
                deleting the extra files. The details are collapsible. */}
            {duplicateFiles.length > 0 && (
                <div className="glass-card" style={{ padding: "1rem 1.5rem", marginBottom: "1rem", borderLeft: "3px solid var(--accent-secondary)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowDuplicateDetails(!showDuplicateDetails)}>
                        <span style={{ color: "var(--accent-secondary)" }}>
                            Found {duplicateFiles.length} duplicate localization file{duplicateFiles.length > 1 ? "s" : ""}. These will be consolidated when you sync.
                        </span>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{showDuplicateDetails ? "Hide" : "Show details"}</span>
                    </div>
                    {showDuplicateDetails && (
                        <ul style={{ margin: "0.75rem 0 0 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
                            {duplicateFiles.map((f) => (
                                <li key={f}>{f}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* --- Strings Table ---
                The main data table showing all localization strings. Features:
                - Sticky header row with sortable columns (click header to cycle sort)
                - Drag-to-resize column handles on each header
                - Status column shows SYNCED/PENDING/MISSING badge
                - Source column shows the original language text
                - English column is inline-editable via the EditableCell component
                - Rows with overridden translations (english !== original_english)
                  are highlighted with a yellow background and show the previous
                  translation above the editable cell */}
            <div className="glass-card string-table-container" style={{ height: "calc(100vh - 400px)", minHeight: "500px", overflow: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead style={{ background: "var(--bg-color)", position: "sticky", top: 0, zIndex: 10 }}>
                        <tr>
                            <th className="sortable-th" onClick={() => handleSort("is_translated")} style={{ width: columnWidths.status }}>
                                Status {getSortIcon("is_translated")}
                                <div className="resizer" onPointerDown={(e) => onResizeStart(e, "status")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort("source_file")} style={{ width: columnWidths.source_file }}>
                                Source {getSortIcon("source_file")}
                                <div className="resizer" onPointerDown={(e) => onResizeStart(e, "source_file")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort("key")} style={{ width: columnWidths.key }}>
                                Key {getSortIcon("key")}
                                <div className="resizer" onPointerDown={(e) => onResizeStart(e, "key")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort("source")} style={{ width: columnWidths.source }}>
                                Original ({strings[0]?.source_lang || "Source"}) {getSortIcon("source")}
                                <div className="resizer" onPointerDown={(e) => onResizeStart(e, "source")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort("english")} style={{ width: columnWidths.english }}>
                                English {getSortIcon("english")}
                                <div className="resizer" onPointerDown={(e) => onResizeStart(e, "english")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedStrings.map((s) => {
                            const hasOverride = !s.is_synced && s.english !== s.original_english
                            const isDone = s.is_translated || !s.source.trim()
                            // Row background: green for synced, yellow for unsynced overrides
                            const rowStyle = s.is_synced ? { backgroundColor: "rgba(52, 211, 153, 0.1)" } : hasOverride ? { backgroundColor: "rgba(255, 220, 40, 0.15)" } : undefined
                            return (
                                <tr key={s.key} style={rowStyle}>
                                    <td>
                                        <span className={`status-badge ${s.is_synced ? "status-synced" : isDone ? "status-translated" : "status-missing"}`}>
                                            {s.is_synced ? "SYNCED" : isDone ? "PENDING" : "MISSING"}
                                        </span>
                                    </td>
                                    <td className="key-cell" title={s.source_file} style={{ maxWidth: columnWidths.source_file }}>
                                        {s.source_file}
                                    </td>
                                    <td className="key-cell" title={s.key} style={{ maxWidth: columnWidths.key }}>
                                        {s.key}
                                    </td>
                                    <td className="source-cell" style={{ maxWidth: columnWidths.source }}>
                                        {s.source}
                                    </td>
                                    <td className="english-cell" style={{ maxWidth: columnWidths.english, position: "relative" }}>
                                        {/* Show previous translation above the editable field when overridden or synced. */}
                                        {s.original_english && s.original_english !== s.english && (
                                            <div className="prev-translation" style={s.is_synced ? { color: "rgba(52, 211, 153, 0.6)" } : undefined}>
                                                {s.original_english}
                                            </div>
                                        )}
                                        <EditableCell value={s.english} onSave={(val) => handleSaveString(s.key, val)} placeholder={!s.source ? "" : s.is_translated ? "" : "Pending translation..."} />
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* --- Glossary Suggestion Modal ---
                Modal for reviewing AI-generated glossary term suggestions.
                The user can accept or reject each suggestion. Accepted terms
                are added to the mod glossary. */}
            {showSuggestionModal && (
                <GlossarySuggestionModal
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
            {showHistory && (
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowHistory(false)
                    }}
                >
                    <div className="glass-card" style={{ width: "700px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                            <h2 style={{ margin: 0 }}>History Backups</h2>
                            <button
                                onClick={() => setShowHistory(false)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--text-dim)",
                                    fontSize: "2rem",
                                    lineHeight: 1,
                                    cursor: "pointer",
                                    padding: "0.25rem 0.5rem",
                                    borderRadius: "4px",
                                }}
                                title="Close"
                            >
                                &times;
                            </button>
                        </div>
                        {historyEntries.length === 0 ? (
                            <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No backups available yet. Backups are created automatically before destructive operations.</p>
                        ) : (
                            <div>
                                {historyEntries.map((entry) => (
                                    <div
                                        key={entry.id}
                                        style={{
                                            padding: "1rem",
                                            marginBottom: "0.75rem",
                                            background: "rgba(0,0,0,0.2)",
                                            borderRadius: "8px",
                                            border: "1px solid var(--glass-border)",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{entry.reason}</div>
                                            <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{new Date(entry.created_at).toLocaleString()}</div>
                                            <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.15rem" }}>Files: {entry.files.join(", ")}</div>
                                        </div>
                                        <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                                            <button
                                                className="btn btn-primary"
                                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                                                onClick={() => {
                                                    setConfirmModal({
                                                        type: "restore-backup",
                                                        message: `Restore to backup from ${new Date(entry.created_at).toLocaleString()}? A backup of the current state will be created first.`,
                                                        entryId: entry.id,
                                                        entryDate: new Date(entry.created_at).toLocaleString(),
                                                    })
                                                }}
                                            >
                                                Restore
                                            </button>
                                            <button
                                                className="btn btn-outline"
                                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                                onClick={() => {
                                                    setConfirmModal({
                                                        type: "delete-backup",
                                                        message: "Delete this backup?",
                                                        entryId: entry.id,
                                                    })
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- Glossary Replace Preview Modal --- */}
            {replacePreview && (
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setReplacePreview(null)
                            setRenamedTerm(null)
                        }
                    }}
                >
                    <div className="glass-card" style={{ width: "800px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <h2 style={{ margin: 0 }}>Apply glossary term: "{replacePreview.newTerm}"</h2>
                            <button
                                onClick={() => {
                                    setReplacePreview(null)
                                    setRenamedTerm(null)
                                }}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--text-dim)",
                                    fontSize: "2rem",
                                    lineHeight: 1,
                                    cursor: "pointer",
                                    padding: "0.25rem 0.5rem",
                                    borderRadius: "4px",
                                }}
                                title="Close"
                            >
                                &times;
                            </button>
                        </div>
                        <p style={{ color: "var(--text-dim)", marginBottom: "1rem", fontSize: "0.85rem" }}>Rows where source contains "{replacePreview.sourceText}"</p>
                        {replacePreview.needsInput && (
                            <div style={{ marginBottom: "1rem" }}>
                                <input
                                    type="text"
                                    placeholder="Old English text to find and replace"
                                    value={replacePreview.oldTerm}
                                    onChange={(e) => {
                                        const oldTerm = e.target.value
                                        const sourceMatches = strings.filter((s) => s.source.includes(replacePreview.sourceText))
                                        const affected = oldTerm
                                            ? sourceMatches
                                                  .filter((s) => s.english.includes(oldTerm))
                                                  .map((s) => {
                                                      const escaped = oldTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                                                      return { key: s.key, old_text: s.english, new_text: s.english.replace(new RegExp(escaped, "g"), replacePreview.newTerm) }
                                                  })
                                            : sourceMatches.filter((s) => !s.english).map((s) => ({ key: s.key, old_text: s.english, new_text: replacePreview.newTerm }))
                                        setReplacePreview({ ...replacePreview, oldTerm, affected })
                                    }}
                                    style={{
                                        padding: "0.5rem",
                                        borderRadius: "6px",
                                        background: "rgba(0,0,0,0.2)",
                                        border: "1px solid var(--glass-border)",
                                        color: "var(--text-main)",
                                        width: "100%",
                                    }}
                                />
                            </div>
                        )}
                        {replacePreview.affected.length === 0 ? (
                            <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>
                                {replacePreview.oldTerm
                                    ? `No rows found with source "${replacePreview.sourceText}" and English containing "${replacePreview.oldTerm}".`
                                    : `No rows found with source "${replacePreview.sourceText}" and empty English.`}
                            </p>
                        ) : (
                            <>
                                <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>
                                    {replacePreview.affected.length} row(s) found
                                    {replacePreview.oldTerm ? ` — replacing "${replacePreview.oldTerm}" with "${replacePreview.newTerm}"` : ""}:
                                </p>
                                <div style={{ maxHeight: "50vh", overflow: "auto", marginBottom: "1rem" }}>
                                    {replacePreview.affected.map((item) => (
                                        <div
                                            key={item.key}
                                            style={{ padding: "0.75rem", marginBottom: "0.5rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--glass-border)" }}
                                        >
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>{item.key}</div>
                                            {item.old_text !== item.new_text ? (
                                                <>
                                                    <div style={{ marginBottom: "0.25rem" }}>
                                                        {replacePreview.oldTerm ? (
                                                            item.old_text.split(new RegExp(`(${replacePreview.oldTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g")).map((part, i) =>
                                                                part === replacePreview.oldTerm ? (
                                                                    <span key={i} style={{ color: "#ff6b6b", textDecoration: "line-through" }}>
                                                                        {part}
                                                                    </span>
                                                                ) : (
                                                                    <span key={i} style={{ color: "var(--text-main)" }}>
                                                                        {part}
                                                                    </span>
                                                                )
                                                            )
                                                        ) : (
                                                            <span style={{ color: "#ff6b6b", textDecoration: "line-through" }}>
                                                                {item.old_text || <em style={{ color: "var(--text-dim)" }}>empty</em>}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        {replacePreview.oldTerm ? (
                                                            item.new_text.split(new RegExp(`(${replacePreview.newTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g")).map((part, i) =>
                                                                part === replacePreview.newTerm ? (
                                                                    <span key={i} style={{ color: "#34d399" }}>
                                                                        {part}
                                                                    </span>
                                                                ) : (
                                                                    <span key={i} style={{ color: "var(--text-main)" }}>
                                                                        {part}
                                                                    </span>
                                                                )
                                                            )
                                                        ) : (
                                                            <span style={{ color: "#34d399" }}>{item.new_text}</span>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div>
                                                    <span style={{ color: "var(--text-main)" }}>{item.old_text}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {replacePreview.affected.some((item) => item.old_text !== item.new_text) && (
                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                                        <button
                                            className="btn btn-outline"
                                            onClick={() => {
                                                setReplacePreview(null)
                                                setRenamedTerm(null)
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={async () => {
                                                try {
                                                    for (const item of replacePreview.affected) {
                                                        await fetch(`${API_BASE}/mods/${modId}/strings`, {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ key: item.key, english: item.new_text }),
                                                        })
                                                    }
                                                    setReplacePreview(null)
                                                    setRenamedTerm(null)
                                                    setTranslateBanner({ type: "success", message: `Applied "${replacePreview.newTerm}" to ${replacePreview.affected.length} translation(s).` })
                                                    fetchModDetail(true)
                                                    fetchExportStatus()
                                                } catch (err) {
                                                    console.error("Failed to apply replacement:", err)
                                                }
                                            }}
                                        >
                                            Apply {replacePreview.affected.length} Replacement(s)
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* --- API Response Viewer Modal --- */}
            {showApiResponses && (
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowApiResponses(false)
                    }}
                >
                    <div className="glass-card" style={{ width: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column", padding: "2rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <h2 style={{ margin: 0 }}>API Provider Responses</h2>
                            <button
                                onClick={() => setShowApiResponses(false)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--text-dim)",
                                    fontSize: "2rem",
                                    lineHeight: 1,
                                    cursor: "pointer",
                                    padding: "0.25rem 0.5rem",
                                    borderRadius: "4px",
                                }}
                                title="Close"
                            >
                                &times;
                            </button>
                        </div>
                        {apiResponses.length === 0 ? (
                            <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No API responses recorded yet. Run a translation first.</p>
                        ) : (
                            <>
                                {(() => {
                                    const totalCost = apiResponses.reduce((sum: number, r: any) => sum + (r.cost_usd ?? 0), 0)
                                    return totalCost > 0 ? (
                                        <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                                            Total cost across {apiResponses.length} batch{apiResponses.length !== 1 ? "es" : ""}:{" "}
                                            <span style={{ fontWeight: 600, color: "var(--text-main)" }}>${totalCost.toFixed(4)}</span>
                                        </div>
                                    ) : null
                                })()}
                                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                                    {apiResponses.map((_: any, idx: number) => (
                                        <button
                                            key={idx}
                                            className={`btn ${activeResponseIdx === idx ? "btn-primary" : "btn-outline"}`}
                                            onClick={() => setActiveResponseIdx(idx)}
                                            style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                                        >
                                            Batch {idx + 1}
                                        </button>
                                    ))}
                                </div>
                                {apiResponses[activeResponseIdx] && (
                                    <>
                                        <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
                                            <div>
                                                <span style={{ color: "var(--text-dim)" }}>Model: </span>
                                                <span style={{ fontWeight: 600 }}>{apiResponses[activeResponseIdx].model}</span>
                                            </div>
                                            {apiResponses[activeResponseIdx].input_tokens != null && (
                                                <div>
                                                    <span style={{ color: "var(--text-dim)" }}>Input tokens: </span>
                                                    <span style={{ fontWeight: 600 }}>{apiResponses[activeResponseIdx].input_tokens}</span>
                                                </div>
                                            )}
                                            {apiResponses[activeResponseIdx].output_tokens != null && (
                                                <div>
                                                    <span style={{ color: "var(--text-dim)" }}>Output tokens: </span>
                                                    <span style={{ fontWeight: 600 }}>{apiResponses[activeResponseIdx].output_tokens}</span>
                                                </div>
                                            )}
                                            {apiResponses[activeResponseIdx].cost_usd != null && (
                                                <div>
                                                    <span style={{ color: "var(--text-dim)" }}>Cost: </span>
                                                    <span style={{ fontWeight: 600 }}>${apiResponses[activeResponseIdx].cost_usd.toFixed(4)}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                flex: 1,
                                                overflow: "auto",
                                                background: "rgba(0,0,0,0.3)",
                                                borderRadius: "8px",
                                                border: "1px solid var(--glass-border)",
                                                padding: "1rem",
                                                minHeight: "300px",
                                            }}
                                        >
                                            <pre
                                                style={{
                                                    margin: 0,
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                    fontSize: "0.85rem",
                                                    lineHeight: "1.6",
                                                    color: "var(--text-main)",
                                                    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                                                }}
                                            >
                                                {apiResponses[activeResponseIdx].raw_text}
                                            </pre>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* --- Translation Confirmation Modal ---
                Shown after handleTranslateClick fetches a preview. Displays
                prompt previews, batch counts, and cost estimates. On confirm,
                starts the iterative batch translation loop via the hook. */}
            {translationPreview && (
                <TranslationConfirmModal
                    preview={translationPreview}
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
                                for (const term of Object.keys(modGlossary)) {
                                    await fetch(`${API_BASE}/mods/${modId}/glossary/${encodeURIComponent(term)}`, { method: "DELETE" })
                                }
                                fetchModGlossary()
                                break
                            case "restore-backup":
                                try {
                                    const res = await fetch(`${API_BASE}/mods/${modId}/history/${entryId}/restore`, { method: "POST" })
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
                                    await fetch(`${API_BASE}/mods/${modId}/history/${entryId}`, { method: "DELETE" })
                                    setHistoryEntries((prev) => prev.filter((e) => e.id !== entryId))
                                } catch (err) {
                                    console.error("Failed to delete backup:", err)
                                }
                                break
                        }
                    }}
                />
            )}
        </div>
    )
}

export default ModDetail

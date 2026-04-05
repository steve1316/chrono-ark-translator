import React, { useState, useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
import { FaSteam, FaArrowLeft, FaSort, FaSortUp, FaSortDown, FaFileExport, FaBook, FaFolderOpen } from "react-icons/fa"
import type { LocString, TermSuggestion } from "../../shared_types"
import { API_BASE } from "../../config"
import GlossarySuggestionModal from "../../components/GlossarySuggestionModal"
import TranslationConfirmModal from "../../components/TranslationConfirmModal"
import EditableCell from "../../components/EditableCell"

/**
 * Props for the ModDetail component.
 */
interface ModDetailProps {
    /** Callback to navigate back to the dashboard/mod list. */
    onBack: () => void
    /**
     * Callback to execute the actual translation request against the AI provider.
     * Called only after the user confirms the translation preview modal.
     *
     * @param provider - The AI provider identifier (e.g. "claude").
     * @param modId - The mod identifier to translate.
     * @returns A result object with success status, a user-facing message, and
     *          optionally a map of key-to-translated-English-string pairs.
     */
    onTranslate: (provider: string, modId: string) => Promise<{ success: boolean; message: string; translations?: Record<string, string> }>
}

/** Columns that support click-to-sort in the strings table. */
type SortField = "is_translated" | "key" | "source" | "english"

/**
 * Sort direction for a column: ascending, descending, or null (unsorted).
 * Clicking a column header cycles through asc -> desc -> null.
 */
type SortDirection = "asc" | "desc" | null

/**
 * Detail view for a specific mod, showing all translatable strings.
 * @param onBack - Callback to return to the dashboard.
 * @param onTranslate - Callback to trigger translation process.
 * @returns The rendered mod detail view.
 */
const ModDetail: React.FC<ModDetailProps> = ({ onBack, onTranslate }) => {
    const { modId } = useParams<{ modId: string }>()
    const [strings, setStrings] = useState<LocString[]>([])
    const [modName, setModName] = useState<string>("")
    const [modAuthor, setModAuthor] = useState<string>("")
    const [modPreviewImage, setModPreviewImage] = useState<string | null>(null)
    const [modUrl, setModUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const [filter, setFilter] = useState<"all" | "translated" | "untranslated">("all")
    const [search, setSearch] = useState("")

    const [sortConfig, setSortConfig] = useState<{ key: SortField; direction: SortDirection }>({
        key: "key",
        direction: "asc",
    })

    const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({
        status: 80,
        key: 300,
        source: 500,
        english: 500,
    })

    const [hasExportChanges, setHasExportChanges] = useState(false)
    const [duplicateFiles, setDuplicateFiles] = useState<string[]>([])
    const [showDuplicateDetails, setShowDuplicateDetails] = useState(false)

    const [suggestions, setSuggestions] = useState<TermSuggestion[]>([])
    const [showSuggestionModal, setShowSuggestionModal] = useState(false)
    const [modGlossary, setModGlossary] = useState<Record<string, { category: string; source_mappings: Record<string, string> }>>({})

    const [translationPreview, setTranslationPreview] = useState<any>(null)
    const [pendingProvider, setPendingProvider] = useState<string>("")
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
    const [translating, setTranslating] = useState(false)
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
    const [replacePreview, setReplacePreview] = useState<{ oldTerm: string; newTerm: string; affected: { key: string; old_text: string; new_text: string }[] } | null>(null)
    const [apiResponses, setApiResponses] = useState<any[]>([])
    const [activeResponseIdx, setActiveResponseIdx] = useState(0)
    const [showHistory, setShowHistory] = useState(false)
    const [historyEntries, setHistoryEntries] = useState<{ id: string; reason: string; created_at: string; files: string[] }[]>([])

    /**
     * Initiates the translation workflow by fetching a preview from the backend.
     *
     * The workflow is two-step:
     *   1. This function calls POST `/api/translate/preview` to get batch counts,
     *      prompt previews, and cost estimates without actually translating.
     *   2. If there are strings to translate, the preview data is stored in state
     *      which triggers the TranslationConfirmModal to open.
     *   3. The user reviews and confirms, which calls `onTranslate` (see the modal
     *      `onConfirm` handler further down in the JSX).
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
    const fetchModDetail = async () => {
        if (!modId) return
        setLoading(true)
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
                setStrings((prev) => prev.map((s) => (s.key === key ? { ...s, english: newValue, is_translated: !!newValue || !s.source.trim() } : s)))
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
            const matchesFilter = filter === "all" || (filter === "translated" && isDone) || (filter === "untranslated" && !isDone)

            // Case-insensitive search across all three text columns.
            const matchesSearch = s.key.toLowerCase().includes(search.toLowerCase()) || s.source.toLowerCase().includes(search.toLowerCase()) || s.english.toLowerCase().includes(search.toLowerCase())

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
    const handleExport = async () => {
        if (!modId) return
        // Build a warning message that includes duplicate files if present.
        const dupeWarning =
            duplicateFiles.length > 0
                ? `\n\nThis will also consolidate ${duplicateFiles.length} duplicate file(s):\n${duplicateFiles.join("\n")}\n\nDuplicate files will be deleted after merging.`
                : ""
        if (!window.confirm(`This will overwrite the mod's CSV files with your translations.${dupeWarning} Continue?`)) {
            return
        }

        setExporting(true)
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/export`, { method: "POST" })
            if (res.ok) {
                const data = await res.json()
                const removedMsg = data.files_removed?.length ? `\nConsolidated ${data.files_removed.length} duplicate file(s).` : ""
                alert(`Synced ${data.applied} translations to ${data.files_written.length} file(s): ${data.files_written.join(", ")}${removedMsg}`)
                fetchExportStatus()
                fetchModDetail()
            } else {
                const error = await res.json()
                alert(`Export failed: ${error.detail || "Unknown error"}`)
            }
        } catch (err) {
            console.error("Failed to export translations:", err)
            alert("Failed to export translations. Check console for details.")
        } finally {
            setExporting(false)
        }
    }

    /**
     * Clears the mod's entire translation cache, including all extracted strings
     * and translation progress. This is irreversible.
     * POST `/api/mods/:modId/clear`.
     *
     * On success, navigates back to the dashboard since there is nothing left
     * to display for this mod.
     */
    const handleClearCache = async () => {
        if (!modId) return
        if (!window.confirm("Are you sure you want to clear the cache and translations for this mod? This will delete all progress and extracted strings.")) {
            return
        }

        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/clear`, {
                method: "POST",
            })
            if (res.ok) {
                // Re-fetch mod data to reflect the cleared state.
                fetchModDetail()
                fetchExportStatus()
                fetchSuggestions()
                fetchModGlossary()
                setTranslateBanner({ type: "success", message: "Cache cleared successfully." })
            } else {
                const error = await res.json()
                alert(`Failed to clear cache: ${error.detail || "Unknown error"}`)
            }
        } catch (err) {
            console.error("Failed to clear cache:", err)
            alert("Failed to clear cache. Check console for details.")
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
    const handleClearTranslations = async () => {
        if (!modId) return
        if (!window.confirm("Are you sure you want to clear all English translations? This will allow all rows to be sent to the AI provider.")) {
            return
        }

        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/clear-translations`, {
                method: "POST",
            })
            if (res.ok) {
                setStrings((prev) => prev.map((s) => ({ ...s, english: "", is_translated: !s.source.trim() })))
                fetchExportStatus()
            } else {
                const error = await res.json()
                alert(`Failed to clear translations: ${error.detail || "Unknown error"}`)
            }
        } catch (err) {
            console.error("Failed to clear translations:", err)
            alert("Failed to clear translations. Check console for details.")
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
                alert(`Failed to open folder: ${error.detail || "Unknown error"}`)
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
                            </div>
                            {modAuthor && <p style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>by {modAuthor}</p>}
                            <p>{processedStrings.length} total strings found</p>
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
                        <button
                            className="btn btn-outline"
                            onClick={fetchApiResponses}
                            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                        >
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
                        <button className="btn btn-outline" style={{ color: "#ff4444", borderColor: "rgba(255, 68, 68, 0.3)" }} onClick={handleClearCache}>
                            Clear Cache
                        </button>
                        <button className="btn btn-outline" style={{ color: "#ffaa44", borderColor: "rgba(255, 170, 68, 0.3)" }} onClick={handleClearTranslations}>
                            Clear English
                        </button>
                    </div>

                    {/* Translation trigger and CSV sync. */}
                    <div className="mod-actions-group">
                        <button className="btn btn-primary" onClick={() => handleTranslateClick("claude")} disabled={translating}>
                            Translate (Claude)
                        </button>
                        <button className="btn btn-primary" onClick={handleExport} disabled={exporting || !hasExportChanges} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <FaFileExport />
                            {exporting ? "Syncing..." : "Sync Changes"}
                        </button>
                    </div>
                </div>
            </div>

            {/* --- Translation In-Progress Spinner --- */}
            {translating && (
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
                    <span style={{ color: "var(--text-main)" }}>Translating... waiting for provider response</span>
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
                            {" "}
                            All{" "}
                        </button>
                        <button className={`btn ${filter === "untranslated" ? "btn-primary" : "btn-outline"}`} onClick={() => setFilter("untranslated")}>
                            {" "}
                            Missing{" "}
                        </button>
                        <button className={`btn ${filter === "translated" ? "btn-primary" : "btn-outline"}`} onClick={() => setFilter("translated")}>
                            {" "}
                            Done{" "}
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
                    <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Mod Glossary Terms</h3>
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
                        <div style={{ maxHeight: "300px", overflow: "auto" }}>
                            {Object.entries(modGlossary)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([english, info]) => (
                                    <div
                                        key={english}
                                        style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--glass-border)" }}
                                    >
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
                                                    style={{ padding: "0.4rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}
                                                >
                                                    <option value="Chinese">Chinese</option>
                                                    <option value="Korean">Korean</option>
                                                    <option value="Japanese">Japanese</option>
                                                </select>
                                                <select
                                                    value={editTermCategory}
                                                    onChange={(e) => setEditTermCategory(e.target.value)}
                                                    style={{ padding: "0.4rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}
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
                                                        setEditingTerm(null)
                                                        fetchModGlossary()
                                                    }}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    className="btn btn-outline"
                                                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                                                    onClick={() => setEditingTerm(null)}
                                                >
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
                                                        onClick={async () => {
                                                            // Prompt for the new term to replace with
                                                            const newTerm = window.prompt(`Replace "${english}" with:`, english)
                                                            if (!newTerm || newTerm === english) return
                                                            try {
                                                                const res = await fetch(`${API_BASE}/mods/${modId}/glossary/replace-preview`, {
                                                                    method: "POST",
                                                                    headers: { "Content-Type": "application/json" },
                                                                    body: JSON.stringify({ old_english: english, new_english: newTerm }),
                                                                })
                                                                if (res.ok) {
                                                                    const data = await res.json()
                                                                    setReplacePreview({ oldTerm: english, newTerm, affected: data.affected })
                                                                }
                                                            } catch (err) {
                                                                console.error("Failed to preview replacement:", err)
                                                            }
                                                        }}
                                                    >
                                                        Replace
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
                - Status column shows OK/MISSING badge
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
                            <th className="sortable-th" onClick={() => handleSort("key")} style={{ width: columnWidths.key }}>
                                Key {getSortIcon("key")}
                                <div className="resizer" onPointerDown={(e) => onResizeStart(e, "key")} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort("source")} style={{ width: columnWidths.source }}>
                                Source ({strings[0]?.source_lang || "Source"}) {getSortIcon("source")}
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
                            // hasOverride: true when the current English differs from what was originally in the CSV (user or AI changed it).
                            const hasOverride = s.english !== s.original_english
                            const isDone = s.is_translated || !s.source.trim()
                            // Row background: green for synced, yellow for unsynced overrides
                            const rowStyle = s.is_synced && !hasOverride
                                ? { backgroundColor: "rgba(52, 211, 153, 0.1)" }
                                : hasOverride
                                ? { backgroundColor: "rgba(255, 220, 40, 0.15)" }
                                : undefined
                            return (
                                <tr key={s.key} style={rowStyle}>
                                    <td>
                                        <span className={`status-badge ${s.is_synced && !hasOverride ? "status-synced" : isDone ? "status-translated" : "status-missing"}`}>
                                            {s.is_synced && !hasOverride ? "SYNCED" : isDone ? "OK" : "MISSING"}
                                        </span>
                                    </td>
                                    <td className="key-cell" title={s.key} style={{ maxWidth: columnWidths.key }}>
                                        {s.key}
                                    </td>
                                    <td className="source-cell" style={{ maxWidth: columnWidths.source }}>
                                        {s.source}
                                    </td>
                                    <td className="english-cell" style={{ maxWidth: columnWidths.english, position: "relative" }}>
                                        {/* Show previous translation above the editable field when overridden or synced. */}
                                        {hasOverride && <div className="prev-translation">{s.original_english || "(no previous translation)"}</div>}
                                        {s.is_synced && !hasOverride && s.original_english && s.original_english !== s.english && (
                                            <div className="prev-translation" style={{ color: "rgba(52, 211, 153, 0.6)" }}>{s.original_english || "(no original)"}</div>
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
                            <button className="btn btn-outline" onClick={() => setShowHistory(false)} style={{ padding: "0.25rem 0.75rem" }}>
                                Close
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
                                            <div style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                                                {new Date(entry.created_at).toLocaleString()}
                                            </div>
                                            <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                                                Files: {entry.files.join(", ")}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                                            <button
                                                className="btn btn-primary"
                                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                                                onClick={async () => {
                                                    if (!window.confirm(`Restore to backup from ${new Date(entry.created_at).toLocaleString()}? A backup of the current state will be created first.`)) return
                                                    try {
                                                        const res = await fetch(`${API_BASE}/mods/${modId}/history/${entry.id}/restore`, { method: "POST" })
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
                                                }}
                                            >
                                                Restore
                                            </button>
                                            <button
                                                className="btn btn-outline"
                                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                                onClick={async () => {
                                                    if (!window.confirm("Delete this backup?")) return
                                                    try {
                                                        await fetch(`${API_BASE}/mods/${modId}/history/${entry.id}`, { method: "DELETE" })
                                                        setHistoryEntries((prev) => prev.filter((e) => e.id !== entry.id))
                                                    } catch (err) {
                                                        console.error("Failed to delete backup:", err)
                                                    }
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
                        if (e.target === e.currentTarget) setReplacePreview(null)
                    }}
                >
                    <div className="glass-card" style={{ width: "800px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <h2 style={{ margin: 0 }}>
                                Replace "{replacePreview.oldTerm}" with "{replacePreview.newTerm}"
                            </h2>
                            <button className="btn btn-outline" onClick={() => setReplacePreview(null)} style={{ padding: "0.25rem 0.75rem" }}>
                                Close
                            </button>
                        </div>
                        {replacePreview.affected.length === 0 ? (
                            <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No translations contain "{replacePreview.oldTerm}". Nothing to replace.</p>
                        ) : (
                            <>
                                <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>
                                    {replacePreview.affected.length} translation(s) will be updated:
                                </p>
                                <div style={{ maxHeight: "50vh", overflow: "auto", marginBottom: "1rem" }}>
                                    {replacePreview.affected.map((item) => (
                                        <div
                                            key={item.key}
                                            style={{ padding: "0.75rem", marginBottom: "0.5rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--glass-border)" }}
                                        >
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>{item.key}</div>
                                            <div style={{ marginBottom: "0.25rem" }}>
                                                <span style={{ color: "#ff6b6b", textDecoration: "line-through" }}>{item.old_text}</span>
                                            </div>
                                            <div>
                                                <span style={{ color: "#34d399" }}>{item.new_text}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                                    <button className="btn btn-outline" onClick={() => setReplacePreview(null)}>
                                        Cancel
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            try {
                                                const res = await fetch(`${API_BASE}/mods/${modId}/glossary/replace-apply`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ old_english: replacePreview.oldTerm, new_english: replacePreview.newTerm }),
                                                })
                                                if (res.ok) {
                                                    const data = await res.json()
                                                    setReplacePreview(null)
                                                    setTranslateBanner({ type: "success", message: `Replaced "${replacePreview.oldTerm}" in ${data.replaced} translation(s).` })
                                                    fetchModDetail()
                                                    fetchExportStatus()
                                                }
                                            } catch (err) {
                                                console.error("Failed to apply replacement:", err)
                                            }
                                        }}
                                    >
                                        Apply {replacePreview.affected.length} Replacement(s)
                                    </button>
                                </div>
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
                            <button className="btn btn-outline" onClick={() => setShowApiResponses(false)} style={{ padding: "0.25rem 0.75rem" }}>
                                Close
                            </button>
                        </div>
                        {apiResponses.length === 0 ? (
                            <p style={{ color: "var(--text-dim)", textAlign: "center", padding: "2rem" }}>No API responses recorded yet. Run a translation first.</p>
                        ) : (
                            <>
                                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                                    {apiResponses.map((r: any, idx: number) => (
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
                prompt previews, batch counts, and cost estimates. On confirm:
                1. Close the modal and show the translating spinner
                2. Call onTranslate (parent-provided) to execute the actual API call
                3. On success with inline translations: merge them into local state
                4. On success without inline translations: full re-fetch
                5. Refresh export status and suggestions after any success */}
            {translationPreview && (
                <TranslationConfirmModal
                    preview={translationPreview}
                    onConfirm={async () => {
                        setTranslationPreview(null)
                        setTranslateBanner(null)
                        setTranslating(true)
                        const result = await onTranslate(pendingProvider, modId!)
                        setTranslating(false)
                        setTranslateBanner({ type: result.success ? "success" : "error", message: result.message })
                        if (result.success && result.translations) {
                            // Merge translations into local state to avoid a full re-fetch.
                            setStrings((prev) =>
                                prev.map((s) => {
                                    if (s.key in result.translations!) {
                                        return { ...s, english: result.translations![s.key], is_translated: true }
                                    }
                                    return s
                                })
                            )
                            fetchExportStatus()
                            fetchSuggestions()
                        } else if (result.success) {
                            // Fallback: if no inline translations were returned, re-fetch everything.
                            fetchModDetail()
                        }
                    }}
                    onCancel={() => setTranslationPreview(null)}
                />
            )}
        </div>
    )
}

export default ModDetail

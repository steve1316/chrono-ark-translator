import React, { useState, useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
import { FaSteam, FaArrowLeft, FaSort, FaSortUp, FaSortDown, FaFileExport, FaBook, FaFolderOpen } from "react-icons/fa"
import type { LocString, TermSuggestion } from "../shared_types"
import GlossarySuggestionModal from "./GlossarySuggestionModal"
import TranslationConfirmModal from "./TranslationConfirmModal"

interface ModDetailProps {
    onBack: () => void
    onTranslate: (provider: string, modId: string) => Promise<{ success: boolean; message: string; translations?: Record<string, string> }>
}

const API_BASE = "http://localhost:8000/api"

type SortField = "is_translated" | "key" | "source" | "english"
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

    // Sorting state.
    const [sortConfig, setSortConfig] = useState<{ key: SortField; direction: SortDirection }>({
        key: "key",
        direction: "asc",
    })

    // Column widths state.
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
    const [translating, setTranslating] = useState(false)
    const [translateBanner, setTranslateBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)
    const [characterContext, setCharacterContext] = useState<{
        source_game: string
        character_name: string
        background: string
    }>({ source_game: "", character_name: "", background: "" })
    const [showCharacterContext, setShowCharacterContext] = useState(false)
    const [characterContextSaved, setCharacterContextSaved] = useState(false)

    const handleTranslateClick = async (provider: string) => {
        if (!modId) return
        setTranslateBanner(null)
        try {
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
            setPendingProvider(provider)
            setTranslationPreview(data)
        } catch (err) {
            console.error("Failed to fetch translation preview:", err)
            setTranslateBanner({ type: "error", message: "Failed to reach the server for translation preview." })
        }
    }

    const resizingRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null)

    const fetchExportStatus = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/export-status`)
            if (res.ok) {
                const data = await res.json()
                setHasExportChanges(data.has_changes)
            }
        } catch {
            // Ignore — button stays disabled by default.
        }
    }

    const fetchSuggestions = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/glossary/suggestions`)
            if (res.ok) {
                const data = await res.json()
                setSuggestions(data)
            }
        } catch {
            // Ignore.
        }
    }

    const fetchModGlossary = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/glossary`)
            if (res.ok) {
                const data = await res.json()
                setModGlossary(data.terms || {})
            }
        } catch {
            // Ignore.
        }
    }

    const fetchCharacterContext = async () => {
        if (!modId) return
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/character-context`)
            if (res.ok) {
                const data = await res.json()
                setCharacterContext(data)
            }
        } catch {
            // Ignore.
        }
    }

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

    useEffect(() => {
        fetchModDetail()
        fetchExportStatus()
        fetchSuggestions()
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
     * @param key - The localization key.
     * @param newValue - The new English translation.
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
                setStrings((prev) => prev.map((s) => (s.key === key ? { ...s, english: newValue, is_translated: !!newValue || !s.source.trim() } : s)))
                fetchExportStatus()
            }
        } catch (err) {
            console.error("Failed to save manual translation:", err)
        }
    }

    /**
     * Starts the column resizing process.
     * @param e - Pointer event from the resizer.
     * @param field - The field being resized.
     */
    const onResizeStart = (e: React.PointerEvent, field: string) => {
        resizingRef.current = {
            field,
            startX: e.pageX,
            startWidth: columnWidths[field],
        }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }

    /**
     * Updates the column width during resizing.
     * @param e - Pointer event from the movement.
     */
    const onResizeMove = (e: React.PointerEvent) => {
        if (!resizingRef.current) return
        const deltaX = e.pageX - resizingRef.current.startX
        const newWidth = Math.max(80, resizingRef.current.startWidth + deltaX)
        setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.field]: newWidth }))
    }

    /**
     * Ends the resizing process.
     * @param _ - Pointer event.
     */
    const onResizeEnd = (_: React.PointerEvent) => {
        resizingRef.current = null
    }

    // Filter and sort strings.
    const processedStrings = React.useMemo(() => {
        let result = strings.filter((s) => {
            const isDone = s.is_translated || !s.source.trim()
            const matchesFilter = filter === "all" || (filter === "translated" && isDone) || (filter === "untranslated" && !isDone)

            const matchesSearch = s.key.toLowerCase().includes(search.toLowerCase()) || s.source.toLowerCase().includes(search.toLowerCase()) || s.english.toLowerCase().includes(search.toLowerCase())

            return matchesFilter && matchesSearch
        })

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
    
    const [exporting, setExporting] = useState(false)

    /**
     * Writes saved translations back to the mod's original CSV files.
     */
    const handleExport = async () => {
        if (!modId) return
        const dupeWarning = duplicateFiles.length > 0
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
                const removedMsg = data.files_removed?.length
                    ? `\nConsolidated ${data.files_removed.length} duplicate file(s).`
                    : ""
                alert(`Synced ${data.applied} translations to ${data.files_written.length} file(s): ${data.files_written.join(", ")}${removedMsg}`)
                fetchExportStatus()
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
     * Clears the mod's translation cache and local state.
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
                // Redirect back to dashboard.
                onBack()
            } else {
                const error = await res.json()
                alert(`Failed to clear cache: ${error.detail || "Unknown error"}`)
            }
        } catch (err) {
            console.error("Failed to clear cache:", err)
            alert("Failed to clear cache. Check console for details.")
        }
    }

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
            <div className="dashboard-header">
                <div className="title-group">
                    <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <FaArrowLeft /> Back to Dashboard
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                        {modPreviewImage && (
                            <img
                                src={`http://localhost:8000${modPreviewImage}`}
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
                                        onMouseEnter={e => (e.currentTarget.style.color = "#66c0f4")}
                                        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
                                    >
                                        <FaSteam />
                                    </a>
                                )}
                                <button
                                    onClick={handleOpenFolder}
                                    title="Open local folder"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: "1.3rem", transition: "color 0.2s", display: "flex", padding: 0 }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "var(--accent-primary)")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
                                >
                                    <FaFolderOpen />
                                </button>
                            </div>
                            {modAuthor && <p style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>by {modAuthor}</p>}
                            <p>{processedStrings.length} total strings found</p>
                        </div>
                    </div>
                </div>

                <div className="mod-actions">
                    <div className="mod-actions-group">
                        <button
                            className="btn btn-outline"
                            onClick={() => { setShowGlossaryPanel(!showGlossaryPanel); if (!showGlossaryPanel) fetchModGlossary() }}
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
                                <span style={{
                                    position: "absolute", top: "-6px", right: "-6px",
                                    background: "var(--accent-secondary)", color: "#fff",
                                    borderRadius: "50%", width: "20px", height: "20px",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "0.7rem", fontWeight: 700,
                                }}>
                                    {suggestions.length}
                                </span>
                            </button>
                        )}
                        <button
                            className="btn btn-outline"
                            onClick={() => { setShowCharacterContext(!showCharacterContext); if (!showCharacterContext) fetchCharacterContext() }}
                            style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#81e6d9", borderColor: "rgba(129,230,217,0.3)", position: "relative" }}
                        >
                            Character Context
                            {(characterContext.source_game || characterContext.character_name || characterContext.background) && (
                                <span style={{
                                    position: "absolute", top: "-4px", right: "-4px",
                                    width: "8px", height: "8px", borderRadius: "50%",
                                    background: "#81e6d9",
                                }} />
                            )}
                        </button>
                    </div>

                    <div className="mod-actions-group">
                        <button className="btn btn-outline" style={{ color: "#ff4444", borderColor: "rgba(255, 68, 68, 0.3)" }} onClick={handleClearCache}>
                            Clear Cache
                        </button>
                        <button className="btn btn-outline" style={{ color: "#ffaa44", borderColor: "rgba(255, 170, 68, 0.3)" }} onClick={handleClearTranslations}>
                            Clear English
                        </button>
                    </div>

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

            {translating && (
                <div className="glass-card" style={{
                    padding: "1.25rem 1.5rem",
                    marginBottom: "1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    background: "rgba(125,211,252,0.08)",
                    border: "1px solid rgba(125,211,252,0.25)",
                }}>
                    <div style={{
                        width: "20px", height: "20px",
                        border: "3px solid rgba(125,211,252,0.3)",
                        borderTop: "3px solid var(--accent-primary)",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                    }} />
                    <span style={{ color: "var(--text-main)" }}>Translating... waiting for provider response</span>
                </div>
            )}

            {translateBanner && (
                <div className="glass-card" style={{
                    padding: "1rem 1.5rem",
                    marginBottom: "1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: translateBanner.type === "error" ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)",
                    border: `1px solid ${translateBanner.type === "error" ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.3)"}`,
                }}>
                    <span style={{
                        color: translateBanner.type === "error" ? "#f87171" : "#34d399",
                        whiteSpace: "pre-wrap",
                    }}>
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

            {showGlossaryPanel && (
                <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
                    <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Mod Glossary Terms</h3>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                        <input type="text" placeholder="English term" value={newTermEnglish} onChange={(e) => setNewTermEnglish(e.target.value)}
                            style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)", flex: 1, minWidth: "120px" }} />
                        <input type="text" placeholder="Source text" value={newTermSource} onChange={(e) => setNewTermSource(e.target.value)}
                            style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)", flex: 1, minWidth: "120px" }} />
                        <select value={newTermLang} onChange={(e) => setNewTermLang(e.target.value)}
                            style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}>
                            <option value="Chinese">Chinese</option>
                            <option value="Korean">Korean</option>
                            <option value="Japanese">Japanese</option>
                        </select>
                        <select value={newTermCategory} onChange={(e) => setNewTermCategory(e.target.value)}
                            style={{ padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)" }}>
                            <option value="custom">Custom</option>
                            <option value="characters">Characters</option>
                            <option value="skills">Skills</option>
                            <option value="buffs">Buffs</option>
                            <option value="items">Items</option>
                            <option value="mechanics">Mechanics</option>
                        </select>
                        <button className="btn btn-primary" disabled={!newTermEnglish.trim()} onClick={async () => {
                            await fetch(`${API_BASE}/mods/${modId}/glossary`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ english: newTermEnglish, source_mappings: { [newTermLang]: newTermSource }, category: newTermCategory }),
                            })
                            setNewTermEnglish(""); setNewTermSource("")
                            fetchModGlossary()
                        }}>Add</button>
                    </div>
                    {Object.keys(modGlossary).length === 0 ? (
                        <p style={{ color: "var(--text-dim)", textAlign: "center" }}>No mod-specific glossary terms yet. Add terms above or accept AI suggestions.</p>
                    ) : (
                        <div style={{ maxHeight: "300px", overflow: "auto" }}>
                            {Object.entries(modGlossary).sort(([a], [b]) => a.localeCompare(b)).map(([english, info]) => (
                                <div key={english} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--glass-border)" }}>
                                    <div>
                                        <span style={{ fontWeight: 500 }}>{english}</span>
                                        <span style={{ color: "var(--text-dim)", marginLeft: "0.75rem", fontSize: "0.85rem" }}>
                                            {Object.entries(info.source_mappings || {}).map(([lang, text]) => `${lang}: ${text}`).join(", ")}
                                        </span>
                                        <span style={{ marginLeft: "0.75rem", fontSize: "0.75rem", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "rgba(138,180,248,0.15)", color: "var(--accent-primary)", textTransform: "capitalize" }}>
                                            {info.category}
                                        </span>
                                    </div>
                                    <button className="btn btn-outline" style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem", color: "#ff4444", borderColor: "rgba(255,68,68,0.3)" }}
                                        onClick={async () => {
                                            await fetch(`${API_BASE}/mods/${modId}/glossary/${encodeURIComponent(english)}`, { method: "DELETE" })
                                            fetchModGlossary()
                                        }}>Remove</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {showCharacterContext && (
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
                                value={characterContext.source_game}
                                onChange={(e) => setCharacterContext(prev => ({ ...prev, source_game: e.target.value }))}
                                style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)", boxSizing: "border-box" }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Character Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Roland"
                                value={characterContext.character_name}
                                onChange={(e) => setCharacterContext(prev => ({ ...prev, character_name: e.target.value }))}
                                style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)", boxSizing: "border-box" }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Background</label>
                        <textarea
                            placeholder="Describe the character's personality, role in their source game, and any lore that would help with translation..."
                            value={characterContext.background}
                            onChange={(e) => setCharacterContext(prev => ({ ...prev, background: e.target.value }))}
                            rows={4}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--glass-border)", color: "var(--text-main)", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem", alignItems: "center", gap: "0.75rem" }}>
                        {characterContextSaved && <span style={{ color: "#34d399", fontSize: "0.85rem" }}>Saved!</span>}
                        <button className="btn btn-primary" onClick={handleSaveCharacterContext}
                            style={{ background: "rgba(129,230,217,0.15)", color: "#81e6d9", borderColor: "rgba(129,230,217,0.3)" }}>
                            Save Context
                        </button>
                    </div>
                </div>
            )}

            {duplicateFiles.length > 0 && (
                <div className="glass-card" style={{ padding: "1rem 1.5rem", marginBottom: "1rem", borderLeft: "3px solid var(--accent-secondary)" }}>
                    <div
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                        onClick={() => setShowDuplicateDetails(!showDuplicateDetails)}
                    >
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
                            const hasOverride = s.english !== s.original_english
                            const isDone = s.is_translated || !s.source.trim()
                            return (
                                <tr key={s.key} style={hasOverride ? { backgroundColor: "rgba(255, 220, 40, 0.15)" } : undefined}>
                                    <td>
                                        <span className={`status-badge ${isDone ? "status-translated" : "status-missing"}`}>{isDone ? "OK" : "MISSING"}</span>
                                    </td>
                                    <td className="key-cell" title={s.key} style={{ maxWidth: columnWidths.key }}>
                                        {s.key}
                                    </td>
                                    <td className="source-cell" style={{ maxWidth: columnWidths.source }}>
                                        {s.source}
                                    </td>
                                    <td className="english-cell" style={{ maxWidth: columnWidths.english, position: "relative" }}>
                                        {hasOverride && (
                                            <div className="prev-translation">{s.original_english || "(no previous translation)"}</div>
                                        )}
                                        <EditableCell value={s.english} onSave={(val) => handleSaveString(s.key, val)} placeholder={!s.source ? "" : s.is_translated ? "" : "Pending translation..."} />
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {showSuggestionModal && (
                <GlossarySuggestionModal
                    modId={modId!}
                    suggestions={suggestions}
                    onClose={() => setShowSuggestionModal(false)}
                    onUpdated={() => { fetchSuggestions() }}
                />
            )}

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
                            setStrings(prev => prev.map(s => {
                                if (s.key in result.translations!) {
                                    return { ...s, english: result.translations![s.key], is_translated: true }
                                }
                                return s
                            }))
                            fetchExportStatus()
                            fetchSuggestions()
                        } else if (result.success) {
                            fetchModDetail()
                        }
                    }}
                    onCancel={() => setTranslationPreview(null)}
                />
            )}
        </div>
    )
}

interface EditableCellProps {
    value: string
    onSave: (val: string) => void
    placeholder?: string
}

/**
 * Component for an editable table cell.
 * @param value - The current value of the cell.
 * @param onSave - Callback when the value is saved.
 * @param placeholder - Placeholder text when empty.
 * @returns The rendered editable cell.
 */
const EditableCell: React.FC<EditableCellProps> = ({ value, onSave, placeholder }) => {
    const [isEditing, setIsEditing] = useState(false)
    const [tempValue, setTempValue] = useState(value)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isEditing])

    /**
     * Handles focus loss on the input field.
     */
    const handleBlur = () => {
        setIsEditing(false)
        if (tempValue !== value) {
            onSave(tempValue)
        }
    }

    /**
     * Handles key down events within the editing input.
     * @param e - Keyboard event.
     */
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleBlur()
        } else if (e.key === "Escape") {
            setTempValue(value)
            setIsEditing(false)
        }
    }

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="edit-input"
                style={{
                    width: "100%",
                    padding: "4px 8px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--accent-primary)",
                    color: "var(--text-main)",
                    borderRadius: "4px",
                    outline: "none",
                }}
            />
        )
    }

    return (
        <div
            onClick={() => {
                setIsEditing(true)
                setTempValue(value)
            }}
            className="clickable-cell"
            style={{ minHeight: "1.2em", cursor: "text" }}
        >
            {value ? <span>{value}</span> : <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>{placeholder}</span>}
        </div>
    )
}

export default ModDetail

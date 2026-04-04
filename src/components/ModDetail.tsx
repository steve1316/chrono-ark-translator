import React, { useState, useEffect, useRef, useMemo, forwardRef } from "react"
import { useParams } from "react-router-dom"
import { TableVirtuoso } from "react-virtuoso"
import { FaSteam, FaArrowLeft, FaSort, FaSortUp, FaSortDown, FaFileExport } from "react-icons/fa"
import type { LocString } from "../shared_types"

interface ModDetailProps {
    onBack: () => void
    onTranslate: (provider: string, dryRun: boolean, modId: string) => void
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

    useEffect(() => {
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
            } catch (err) {
                console.error("Failed to fetch mod detail:", err)
            } finally {
                setLoading(false)
            }
        }

        fetchModDetail()
        fetchExportStatus()
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
                // Update local state.
                setStrings((prev) => prev.map((s) => (s.key === key ? { ...s, english: newValue, is_translated: !!newValue } : s)))
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
            const matchesFilter = filter === "all" || (filter === "translated" && s.is_translated) || (filter === "untranslated" && !s.is_translated)

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
    
    // Table components for Virtuoso.
    const virtuosoComponents = useMemo(
        () => ({
            Scroller: forwardRef<HTMLDivElement, any>((props, ref) => <div {...props} ref={ref} style={{ ...props.style, width: "100%" }} />),
            Table: (props: any) => <table {...props} style={{ ...props.style, borderCollapse: "collapse" }} />,
            TableHead: forwardRef<HTMLTableSectionElement, any>((props, ref) => <thead {...props} ref={ref} style={{ background: "var(--bg-color)", position: "sticky", top: 0, zIndex: 10 }} />),
            TableRow: (props: any) => <tr {...props} />,
            TableBody: forwardRef<HTMLTableSectionElement, any>((props, ref) => <tbody {...props} ref={ref} />),
        }),
        []
    )

    const [exporting, setExporting] = useState(false)

    /**
     * Writes saved translations back to the mod's original CSV files.
     */
    const handleExport = async () => {
        if (!modId) return
        if (!window.confirm("This will overwrite the mod's CSV files with your translations. Continue?")) {
            return
        }

        setExporting(true)
        try {
            const res = await fetch(`${API_BASE}/mods/${modId}/export`, { method: "POST" })
            if (res.ok) {
                const data = await res.json()
                alert(`Synced ${data.applied} translations to ${data.files_written.length} file(s): ${data.files_written.join(", ")}`)
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
                            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                <h1>{modName || modId}</h1>
                                {modUrl && (
                                    <a
                                        href={modUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-outline"
                                        title="Open mod page"
                                        style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none", padding: "0.5rem 1rem", borderRadius: "12px" }}
                                    >
                                        <FaSteam />
                                        <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>Steam Workshop</span>
                                    </a>
                                )}
                            </div>
                            {modAuthor && <p style={{ color: "var(--text-dim)", marginTop: "0.25rem" }}>by {modAuthor}</p>}
                            <p>{processedStrings.length} total strings found</p>
                        </div>
                    </div>
                </div>

                <div className="mod-actions">
                    <button className="btn btn-outline" style={{ color: "#ff4444", borderColor: "rgba(255, 68, 68, 0.3)" }} onClick={handleClearCache}>
                        Clear Cache
                    </button>
                    <button className="btn btn-outline" onClick={() => onTranslate("claude", true, modId)}>
                        Dry Run
                    </button>
                    <button className="btn btn-primary" onClick={() => onTranslate("claude", false, modId)}>
                        Translate (Claude)
                    </button>
                    <button className="btn btn-primary" onClick={handleExport} disabled={exporting || !hasExportChanges} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <FaFileExport />
                        {exporting ? "Syncing..." : "Sync Changes"}
                    </button>
                </div>
            </div>

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

            <div className="glass-card string-table-container">
                <TableVirtuoso
                    style={{ height: "calc(100vh - 400px)", minHeight: "500px" }}
                    data={processedStrings}
                    components={virtuosoComponents}
                    overscan={5000}
                    fixedHeaderContent={() => (
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
                )}
                itemContent={(_index, s) => (
                    <>
                        <td>
                            <span className={`status-badge ${s.is_translated ? "status-translated" : "status-missing"}`}>{s.is_translated ? "OK" : "MISSING"}</span>
                        </td>
                        <td className="key-cell" title={s.key} style={{ maxWidth: columnWidths.key }}>
                            {s.key}
                        </td>
                        <td className="source-cell" style={{ maxWidth: columnWidths.source }}>
                            {s.source}
                        </td>
                        <td className="english-cell" style={{ maxWidth: columnWidths.english, position: "relative" }}>
                            <EditableCell value={s.english} onSave={(val) => handleSaveString(s.key, val)} placeholder={s.is_translated ? "" : "Pending translation..."} />
                        </td>
                    </>
                )}
            />
            </div>
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

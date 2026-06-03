import { useRef } from "react"
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa"
import type { ColumnDef } from "./types"

/** Props for StringsTable. */
interface StringsTableProps<Row> {
    /** Rows to display (already filtered/sorted by the caller). */
    rows: Row[]
    /** Column definitions driving the header and cells. */
    columns: ColumnDef<Row>[]
    /** Return a stable React key for a row. */
    getRowKey: (row: Row) => string
    /** The field currently sorted by, or null. */
    sortField: string | null
    /** The active sort direction, or null for unsorted. */
    sortDirection: "asc" | "desc" | null
    /** Called with a column field when a sortable header is clicked. */
    onSort: (field: string) => void
    /** Per-field width overrides. When a field is present here its value wins over the column's default `width`. */
    columnWidths?: Record<string, number>
    /** Called with a field id and new pixel width while the user drags a column resizer. When omitted, columns are not resizable. */
    onResizeColumn?: (field: string, width: number) => void
    /** Optional per-row CSS class (e.g. to tint AI-translated rows). */
    getRowClassName?: (row: Row) => string | undefined
    /** Optional per-row inline style (e.g. status-based row background). */
    getRowStyle?: (row: Row) => CSSProperties | undefined
    /** Message shown when there are no rows. */
    emptyMessage?: string
}

/**
 * Generic sortable strings table shared by every game's translation page. The caller owns filtering/sorting and supplies column definitions, so each
 * game controls its own columns and cell rendering. Columns are resizable when `onResizeColumn` is supplied (the caller persists the widths).
 * @param rows - Rows to display.
 * @param columns - Column definitions.
 * @param getRowKey - Stable row key accessor.
 * @param sortField - Currently sorted field, or null.
 * @param sortDirection - Active sort direction, or null.
 * @param onSort - Header-click handler.
 * @param columnWidths - Per-field width overrides.
 * @param onResizeColumn - Resize handler; when omitted, columns are not resizable.
 * @param getRowClassName - Optional per-row class accessor.
 * @param getRowStyle - Optional per-row inline-style accessor.
 * @param emptyMessage - Message shown when there are no rows.
 * @returns The table element.
 */
export function StringsTable<Row>({
    rows,
    columns,
    getRowKey,
    sortField,
    sortDirection,
    onSort,
    columnWidths,
    onResizeColumn,
    getRowClassName,
    getRowStyle,
    emptyMessage = "No rows match the current filter.",
}: StringsTableProps<Row>) {
    const resizeRef = useRef<{ field: string; startX: number; startWidth: number } | null>(null)

    const sortIcon = (field: string) => {
        if (sortField !== field || !sortDirection) return <FaSort className="sort-icon" />
        return sortDirection === "asc" ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
    }

    const widthOf = (col: ColumnDef<Row>) => columnWidths?.[col.field] ?? col.width

    const onResizeStart = (e: ReactPointerEvent, col: ColumnDef<Row>) => {
        e.stopPropagation()
        e.preventDefault()
        resizeRef.current = { field: col.field, startX: e.clientX, startWidth: widthOf(col) }
        e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    const onResizeMove = (e: ReactPointerEvent) => {
        if (!resizeRef.current) return
        const { field, startX, startWidth } = resizeRef.current
        onResizeColumn?.(field, Math.max(80, startWidth + (e.clientX - startX)))
    }
    const onResizeEnd = () => {
        resizeRef.current = null
    }

    return (
        <div className="glass-card string-table-container">
            <table>
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.field} className="sortable-th" style={{ width: widthOf(col), position: "relative" }} onClick={col.sortable ? () => onSort(col.field) : undefined}>
                                {col.label}
                                {col.sortable && sortIcon(col.field)}
                                {onResizeColumn && <div className="resizer" onPointerDown={(e) => onResizeStart(e, col)} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} />}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} style={{ textAlign: "center", color: "var(--text-dim)", padding: "2rem" }}>
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        rows.map((row) => (
                            <tr key={getRowKey(row)} className={getRowClassName?.(row)} style={getRowStyle?.(row)}>
                                {columns.map((col) => (
                                    <td key={col.field}>{col.render(row)}</td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}

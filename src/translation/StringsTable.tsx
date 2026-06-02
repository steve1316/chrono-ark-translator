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
    /** Message shown when there are no rows. */
    emptyMessage?: string
}

/**
 * Generic sortable strings table shared by every game's translation page.
 * The caller owns filtering/sorting and supplies column definitions, so each
 * game controls its own columns and cell rendering.
 * @param rows - Rows to display.
 * @param columns - Column definitions.
 * @param getRowKey - Stable row key accessor.
 * @param sortField - Currently sorted field, or null.
 * @param sortDirection - Active sort direction, or null.
 * @param onSort - Header-click handler.
 * @param emptyMessage - Message shown when there are no rows.
 * @returns The table element.
 */
export function StringsTable<Row>({ rows, columns, getRowKey, sortField, sortDirection, onSort, emptyMessage = "No rows match the current filter." }: StringsTableProps<Row>) {
    const sortIcon = (field: string) => {
        if (sortField !== field || !sortDirection) return <FaSort className="sort-icon" />
        return sortDirection === "asc" ? <FaSortUp className="sort-icon active" /> : <FaSortDown className="sort-icon active" />
    }
    return (
        <div className="glass-card string-table-container">
            <table>
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.field} className="sortable-th" style={{ width: col.width }} onClick={col.sortable ? () => onSort(col.field) : undefined}>
                                {col.label}
                                {col.sortable && sortIcon(col.field)}
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
                            <tr key={getRowKey(row)}>
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

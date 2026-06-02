import type { ReactNode } from "react"

/** Definition of one column in the shared strings table. */
export interface ColumnDef<Row> {
    /** Stable field id, used as the React key and the sort key. */
    field: string
    /** Header label. May be dynamic (e.g. "Original (Chinese)"). */
    label: string
    /** Default column width in pixels. */
    width: number
    /** Whether clicking the header sorts by this column. Defaults to false. */
    sortable?: boolean
    /** Render the cell contents for a given row. */
    render: (row: Row) => ReactNode
}

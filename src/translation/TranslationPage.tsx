import type { ReactNode } from "react"
import { StringsTable } from "./StringsTable"
import { FeedbackBanner } from "./FeedbackBanner"
import { TranslatingBanner } from "./TranslatingBanner"
import type { ColumnDef } from "./types"

/** One status filter pill. */
interface StatusFilter {
    /** Filter value (e.g. "all", "missing"). */
    value: string
    /** Pill label. */
    label: string
}

/** In-progress translation state for the banner. */
interface TranslatingState {
    /** Zero-based current batch index. */
    batchIndex: number
    /** Total batches in the run. */
    totalBatches: number
    /** Optional live streaming stats. */
    streaming?: { tokensGenerated: number; tokensPerSec: number; elapsedSec: number }
}

/** Props for the shared TranslationPage shell. */
interface TranslationPageProps<Row> {
    /** Mod title shown in the header. */
    title: string
    /** Progress text, e.g. "3 / 10 total strings translated". */
    progressLabel: string
    /** Status filter pills (including the "all" pill). */
    statusFilters: StatusFilter[]
    /** Currently active filter value. */
    activeFilter: string
    /** Called with the filter value when a pill is clicked. */
    onFilterChange: (value: string) => void
    /** Current search text. */
    search: string
    /** Called with the new search text on input. */
    onSearchChange: (value: string) => void
    /** Column definitions for the strings table. */
    columns: ColumnDef<Row>[]
    /** Rows to display (already filtered/sorted by the caller). */
    rows: Row[]
    /** Stable row key accessor. */
    getRowKey: (row: Row) => string
    /** Currently sorted field, or null. */
    sortField: string | null
    /** Active sort direction, or null. */
    sortDirection: "asc" | "desc" | null
    /** Header-click sort handler. */
    onSort: (field: string) => void
    /** Optional dismissible feedback banner. */
    banner?: { type: "success" | "error"; message: string } | null
    /** Dismiss handler for the feedback banner. */
    onDismissBanner?: () => void
    /** Optional in-progress translation state. */
    translating?: TranslatingState | null
    /** Cancel handler for an in-progress translation. */
    onCancelTranslate?: () => void
    /** Game-specific action toolbar rendered in the header. */
    toolbar?: ReactNode
    /** Empty-state message for the table. */
    emptyMessage?: string
}

/**
 * Shared translation page shell. Composes the header, action-toolbar slot,
 * feedback/in-progress banners, search + status-filter bar, and the strings
 * table. Presentational: the caller (each game's page) owns data + state and
 * supplies columns, rows, and handlers.
 * @returns The composed translation page.
 */
export function TranslationPage<Row>(props: TranslationPageProps<Row>) {
    const {
        title,
        progressLabel,
        statusFilters,
        activeFilter,
        onFilterChange,
        search,
        onSearchChange,
        columns,
        rows,
        getRowKey,
        sortField,
        sortDirection,
        onSort,
        banner,
        onDismissBanner,
        translating,
        onCancelTranslate,
        toolbar,
        emptyMessage,
    } = props
    return (
        <div className="mod-detail">
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>{title}</h1>
                    <p style={{ marginTop: "0.25rem" }}>{progressLabel}</p>
                </div>
                {toolbar && <div className="mod-actions">{toolbar}</div>}
            </div>

            {translating && <TranslatingBanner batchIndex={translating.batchIndex} totalBatches={translating.totalBatches} streaming={translating.streaming} onCancel={() => onCancelTranslate?.()} />}

            {banner && <FeedbackBanner type={banner.type} message={banner.message} onDismiss={() => onDismissBanner?.()} />}

            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                        <input
                            className="btn-outline"
                            placeholder="Search keys or text..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            style={{ width: "100%", padding: "0.75rem", paddingRight: "2.5rem", borderRadius: "8px", background: "rgba(0, 0, 0, 0.2)", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        {statusFilters.map((f) => (
                            <button key={f.value} className={activeFilter === f.value ? "btn btn-primary" : "btn btn-outline"} onClick={() => onFilterChange(f.value)}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <StringsTable rows={rows} columns={columns} getRowKey={getRowKey} sortField={sortField} sortDirection={sortDirection} onSort={onSort} emptyMessage={emptyMessage} />
        </div>
    )
}

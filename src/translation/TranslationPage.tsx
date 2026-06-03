import type { CSSProperties, ReactNode } from "react"
import { FaArrowLeft } from "react-icons/fa"
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
    /** Optional per-field overrides for column widths (resizable columns). When omitted, each column's default `width` is used. */
    columnWidths?: Record<string, number>
    /** Called with a field id and new pixel width while the user drags a column resizer. When omitted, columns are not resizable. */
    onResizeColumn?: (field: string, width: number) => void
    /** Optional per-row CSS class (e.g. to tint AI-translated rows). */
    getRowClassName?: (row: Row) => string | undefined
    /** Optional per-row inline style (e.g. status-based row background). */
    getRowStyle?: (row: Row) => CSSProperties | undefined
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
    /** Back-navigation handler. When provided, a "Back to Dashboard" button renders above the header. */
    onBack?: () => void
    /** Mod preview image URL. When provided, an 80x80 thumbnail renders left of the title. */
    previewImage?: string | null
    /** Inline elements rendered next to the title (e.g. steam link, open-folder button, pending-sync badge). */
    titleBadges?: ReactNode
    /** Secondary line under the title (e.g. "by author"). */
    subtitle?: ReactNode
    /** Source/target language controls rendered in the header identity block. */
    languageControls?: ReactNode
    /** Extra banners rendered below the built-in banners (e.g. a batch-paused / review banner). */
    extraBanners?: ReactNode
    /** Game-specific modals/panels rendered at the end of the page. */
    modals?: ReactNode
}

/**
 * Shared translation page shell. Composes the back button, header identity block (preview image, title + badges, subtitle, language controls, progress),
 * action-toolbar slot, feedback/in-progress banners, search + status-filter bar, the strings table, and a game-specific modals slot. Presentational: the
 * caller (each game's container) owns data + state and supplies columns, rows, slots, and handlers.
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
        columnWidths,
        onResizeColumn,
        getRowClassName,
        getRowStyle,
        banner,
        onDismissBanner,
        translating,
        onCancelTranslate,
        toolbar,
        emptyMessage,
        onBack,
        previewImage,
        titleBadges,
        subtitle,
        languageControls,
        extraBanners,
        modals,
    } = props
    return (
        <div className="mod-detail">
            {onBack && (
                <button className="btn btn-outline" onClick={() => onBack()} style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <FaArrowLeft /> Back to Dashboard
                </button>
            )}

            <div className="dashboard-header">
                <div className="title-group" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                    {previewImage && (
                        <img
                            src={previewImage}
                            alt={title}
                            style={{ width: "80px", height: "80px", borderRadius: "12px", objectFit: "cover", border: "1px solid var(--glass-border)", flexShrink: 0 }}
                        />
                    )}
                    <div>
                        <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                            {title}
                            {titleBadges}
                        </h1>
                        {subtitle && <p style={{ marginTop: "0.25rem", color: "var(--text-dim)" }}>{subtitle}</p>}
                        {languageControls}
                        <p style={{ marginTop: "0.25rem" }}>{progressLabel}</p>
                    </div>
                </div>
                {toolbar && <div className="mod-actions">{toolbar}</div>}
            </div>

            {translating && <TranslatingBanner batchIndex={translating.batchIndex} totalBatches={translating.totalBatches} streaming={translating.streaming} onCancel={() => onCancelTranslate?.()} />}

            {extraBanners}

            {banner && <FeedbackBanner type={banner.type} message={banner.message} onDismiss={() => onDismissBanner?.()} />}

            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                        <input
                            type="text"
                            className="btn-outline"
                            placeholder="Search keys or text..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            style={{ width: "100%", padding: "0.75rem", paddingRight: "2.5rem", borderRadius: "8px", background: "rgba(0, 0, 0, 0.2)", boxSizing: "border-box" }}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => onSearchChange("")}
                                title="Clear search"
                                style={{
                                    position: "absolute",
                                    right: "0.5rem",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    color: "var(--text-dim)",
                                    cursor: "pointer",
                                    fontSize: "1.1rem",
                                    padding: "0.25rem",
                                    lineHeight: 1,
                                }}
                            >
                                &times;
                            </button>
                        )}
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

            <StringsTable
                rows={rows}
                columns={columns}
                getRowKey={getRowKey}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={onSort}
                columnWidths={columnWidths}
                onResizeColumn={onResizeColumn}
                getRowClassName={getRowClassName}
                getRowStyle={getRowStyle}
                emptyMessage={emptyMessage}
            />

            {modals}
        </div>
    )
}

import type { RowStatus } from "../utils/stringFilters"
import { statusToChip } from "./statusChip"

/** Props for StatusBadge. */
interface StatusBadgeProps {
    /** The canonical row status to render. */
    status: RowStatus
    /** Untranslatable reason, shown as a tooltip only when status is "untranslatable". */
    reason?: string | null
}

/**
 * Render a status badge for a strings-table row, shared by every game.
 * @param status - The canonical row status.
 * @param reason - Optional untranslatable reason, surfaced as a tooltip for the "untranslatable" status.
 * @returns The status badge span.
 */
export function StatusBadge({ status, reason }: StatusBadgeProps) {
    const { label, className } = statusToChip(status)
    const title = status === "untranslatable" && reason ? reason : undefined
    return (
        <span className={`status-badge ${className}`} title={title}>
            {label}
        </span>
    )
}

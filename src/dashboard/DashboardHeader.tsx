import type { ReactNode } from "react"

import PageHeader from "../ui/PageHeader"
import SearchInput from "../ui/SearchInput"

/** Props for DashboardHeader. */
interface DashboardHeaderProps {
    /** Page title, e.g. "Workshop Dashboard". */
    title: string
    /** Dim line under the title describing the page. */
    tagline: string
    /** Current search text. */
    search: string
    /** Called with the new search text on every keystroke, and with "" when cleared. */
    onSearchChange: (value: string) => void
    /** Placeholder for the search field. */
    searchPlaceholder: string
    /** Width of one card column in pixels, from `useCardWidth`. Falls back to 320px before a card has rendered. */
    searchWidth?: number
    /** Buttons shown after the search field, such as Refresh. */
    actions?: ReactNode
}

/**
 * Shared dashboard header: the page title and tagline, then one row with a search field as wide as a card column and the page's actions.
 *
 * @param title Page title.
 * @param tagline Line under the title.
 * @param search Current search text.
 * @param onSearchChange Search change handler.
 * @param searchPlaceholder Search placeholder.
 * @param searchWidth Card column width for the search field.
 * @param actions Buttons after the search field.
 * @returns The dashboard header.
 */
export default function DashboardHeader({ title, tagline, search, onSearchChange, searchPlaceholder, searchWidth, actions }: DashboardHeaderProps) {
    return (
        <PageHeader
            title={title}
            meta={<p className="dashboard-tagline">{tagline}</p>}
            actionsClassName="dashboard-toolbar"
            actions={
                <>
                    <SearchInput value={search} onChange={onSearchChange} placeholder={searchPlaceholder} width={searchWidth ?? 320} />
                    {actions}
                </>
            }
        />
    )
}

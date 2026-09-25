import type { ReactNode } from "react"
import { FaBook } from "react-icons/fa"

/** A toolbar button's click handler. */
interface ToolbarAction {
    /** Called when the button is clicked. */
    onClick: () => void
}

/** A toolbar button that shows a count. */
interface CountedAction extends ToolbarAction {
    /** Number shown on the button. */
    count: number
}

/** The Scan for Terms button. */
interface ScanAction extends ToolbarAction {
    /** True while a scan runs. The button reads "Scanning..." and is disabled. */
    scanning: boolean
}

/** The context toggle (Character Context or Mod Context). */
interface ContextAction extends ToolbarAction {
    /** Button label. */
    label: string
    /** Shows a teal dot while any context field is filled in. */
    hasContext: boolean
}

/** Props for TranslationToolbar. Every action is optional, and an omitted action hides its button. */
interface TranslationToolbarProps {
    /** Opens the mod glossary. */
    glossary?: CountedAction
    /** Opens the pending suggestions review. Hidden while the count is zero. */
    suggestions?: CountedAction
    /** Scans the mod for glossary terms. */
    scan?: ScanAction
    /** Opens the API responses log. */
    apiResponses?: ToolbarAction
    /** Toggles the inline context panel. */
    context?: ContextAction
    /** Opens the history (snapshots or backups) dialog. */
    history?: ToolbarAction
    /** Starts a reset. */
    reset?: ToolbarAction
    /** Clears every English translation. */
    clearEnglish?: ToolbarAction
    /** Game-specific buttons placed before Translate, such as WH3's Translate Names. */
    extraActions?: ReactNode
    /** The Translate split button. */
    translate?: ReactNode
    /** The Sync button. */
    sync?: ReactNode
}

/**
 * The translation page's action row. It holds no state: it lays the actions out in a fixed order and three groups (glossary tools, history and
 * destructive actions, translate and sync), so both games' toolbars look and read the same.
 *
 * @param props See `TranslationToolbarProps`.
 * @returns The three toolbar groups.
 */
export function TranslationToolbar({ glossary, suggestions, scan, apiResponses, context, history, reset, clearEnglish, extraActions, translate, sync }: TranslationToolbarProps) {
    return (
        <>
            <div className="mod-actions-group">
                {glossary && (
                    <button type="button" className="btn btn-outline" onClick={glossary.onClick}>
                        <FaBook /> Mod Glossary ({glossary.count})
                    </button>
                )}
                {suggestions && suggestions.count > 0 && (
                    <button type="button" className="btn btn-outline btn-suggestions" onClick={suggestions.onClick}>
                        <FaBook /> Suggestions
                        <span className="btn-badge">{suggestions.count}</span>
                    </button>
                )}
                {scan && (
                    <button type="button" className="btn btn-outline" onClick={scan.onClick} disabled={scan.scanning}>
                        <FaBook /> {scan.scanning ? "Scanning..." : "Scan for Terms"}
                    </button>
                )}
                {apiResponses && (
                    <button type="button" className="btn btn-outline" onClick={apiResponses.onClick}>
                        API Responses
                    </button>
                )}
                {context && (
                    <button type="button" className="btn btn-outline tone-teal" onClick={context.onClick}>
                        {context.label}
                        {context.hasContext && <span className="btn-dot" aria-hidden="true" />}
                    </button>
                )}
            </div>

            <div className="mod-actions-group">
                {history && (
                    <button type="button" className="btn btn-outline" onClick={history.onClick}>
                        History
                    </button>
                )}
                {reset && (
                    <button type="button" className="btn btn-outline tone-danger" onClick={reset.onClick}>
                        Reset
                    </button>
                )}
                {clearEnglish && (
                    <button type="button" className="btn btn-outline tone-warning" onClick={clearEnglish.onClick}>
                        Clear English
                    </button>
                )}
            </div>

            <div className="mod-actions-group">
                {extraActions}
                {translate}
                {sync}
            </div>
        </>
    )
}

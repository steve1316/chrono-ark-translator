import type { ReactNode } from "react"

/** Props for Panel. */
interface PanelProps {
    /** Heading rendered as an h3. */
    title?: ReactNode
    /** Dim help line under the heading. */
    help?: ReactNode
    /** Extra class for page-specific layout, e.g. `context-panel`. */
    className?: string
    /** Panel body. */
    children?: ReactNode
}

/**
 * Static glass card used for inline page sections such as the context editor and the WH3 dashboard intro. It never lifts on hover.
 *
 * @param title Heading.
 * @param help Help line under the heading.
 * @param className Extra class.
 * @param children Panel body.
 * @returns The panel.
 */
export default function Panel({ title, help, className, children }: PanelProps) {
    return (
        <section className={`glass-card static panel${className ? ` ${className}` : ""}`}>
            {title && <h3 className="panel-title">{title}</h3>}
            {help && <p className="help-text panel-help">{help}</p>}
            {children}
        </section>
    )
}

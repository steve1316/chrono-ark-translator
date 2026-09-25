import type { ReactNode } from "react"

/** Props for Field. */
interface FieldProps {
    /** Visible label text, rendered in Chrono Ark's small uppercase label style. */
    label: ReactNode
    /** Id of the control inside `children`, so the label is programmatically linked to it. */
    htmlFor: string
    /** The form control (an `.input`, `.textarea` or `.select`). */
    children: ReactNode
    /** Extra classes for the wrapper, e.g. a flex sizing class. */
    className?: string
}

/**
 * A labeled form control using Chrono Ark's field style: a small uppercase dim label above a dark input.
 *
 * @param label Visible label text.
 * @param htmlFor Id of the control the label describes.
 * @param children The form control.
 * @param className Extra wrapper classes.
 * @returns The labeled field.
 */
export default function Field({ label, htmlFor, children, className }: FieldProps) {
    return (
        <div className={`field${className ? ` ${className}` : ""}`}>
            <label className="field-label" htmlFor={htmlFor}>
                {label}
            </label>
            {children}
        </div>
    )
}

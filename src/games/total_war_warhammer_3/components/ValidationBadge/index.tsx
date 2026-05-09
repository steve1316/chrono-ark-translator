import { FaExclamationTriangle } from "react-icons/fa"
import type { ValidationIssue } from "../../api"

/** Props for `ValidationBadge`. */
interface Props {
    /** Issues affecting one mod. When empty, the component renders nothing. */
    issues: ValidationIssue[]
}

/**
 * Inline warning badge surfaced on rows with unresolved validation issues.
 * Renders nothing when the issues array is empty.
 *
 * @param issues The issues affecting this row.
 * @returns An amber `FaExclamationTriangle` with hover tooltip listing each
 *     issue's `message`, or `null` when there are no issues.
 */
export default function ValidationBadge({ issues }: Props) {
    if (issues.length === 0) return null
    const label = `${issues.length} validation issue${issues.length === 1 ? "" : "s"}`
    const tooltip = issues.map((i) => i.message).join("\n")
    return (
        <span aria-label={label} title={tooltip} style={{ color: "var(--warning)", display: "inline-flex" }}>
            <FaExclamationTriangle />
        </span>
    )
}

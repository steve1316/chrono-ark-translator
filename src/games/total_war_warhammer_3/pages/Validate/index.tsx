import { useState } from "react"
import { useValidation } from "../../hooks/useValidation"
import RegistryErrorBanner from "../../components/RegistryErrorBanner"
import type { ValidationIssue } from "../../api"

/**
 * TW3 Validate page: surfaces broken cross-references in `SUPPORTED_MODS` /
 * `SUPPORTED_EFFECTS`. Subscribes to the shared `useValidation` poll, renders issues grouped by kind, and supports manual refresh.
 *
 * @returns A page rendering grouped validation issues, or a `RegistryErrorBanner` when the backend reports a configuration error.
 */
export default function ValidatePage() {
    const { issues, error, refresh } = useValidation()
    const [refreshing, setRefreshing] = useState(false)

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            await refresh()
        } finally {
            setRefreshing(false)
        }
    }

    if (error) {
        return (
            <>
                <div className="dashboard-header">
                    <div className="title-group">
                        <h1>Validate</h1>
                    </div>
                </div>
                <RegistryErrorBanner detail={error.detail} missing={error.missing} />
            </>
        )
    }

    const effectIssues = issues?.filter((i) => i.kind === "missing_effect_category") ?? []
    const pathIssues = issues?.filter((i) => i.kind === "missing_mod_path") ?? []

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Validate</h1>
                    <p>Cross-reference check for `SUPPORTED_MODS` and `SUPPORTED_EFFECTS` entries.</p>
                    {issues !== null && (
                        <span style={{ fontSize: "0.85rem", color: issues.length === 0 ? "var(--text-dim)" : "var(--warning)" }}>
                            {issues.length === 0 ? "No issues" : `${issues.length} issue${issues.length === 1 ? "" : "s"}`}
                        </span>
                    )}
                </div>
                <button className="btn btn-outline" onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {issues === null && !error && (
                <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-dim)", fontStyle: "italic", opacity: 0.7 }}>
                    Loading validation report...
                </div>
            )}

            {issues !== null && issues.length === 0 && (
                <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-dim)" }}>
                    All references resolve.
                </div>
            )}

            {effectIssues.length > 0 && (
                <details open>
                    <summary style={{ cursor: "pointer", padding: "0.5rem 0", fontWeight: 600 }}>Missing effect categories ({effectIssues.length})</summary>
                    {effectIssues.map((issue) => (
                        <IssueCard key={`${issue.mod_package_name}:${issue.target}`} issue={issue} />
                    ))}
                </details>
            )}

            {pathIssues.length > 0 && (
                <details open>
                    <summary style={{ cursor: "pointer", padding: "0.5rem 0", fontWeight: 600 }}>Missing mod paths ({pathIssues.length})</summary>
                    {pathIssues.map((issue) => (
                        <IssueCard key={`${issue.mod_package_name}:${issue.target}`} issue={issue} />
                    ))}
                </details>
            )}
        </>
    )
}

/** Props for IssueCard. */
interface IssueCardProps {
    /** The validation issue to display. */
    issue: ValidationIssue
}

/** Single issue card showing mod_name, target, and message. */
function IssueCard({ issue }: IssueCardProps) {
    return (
        <div className="glass-card" style={{ padding: "1rem", marginTop: "0.5rem" }}>
            <div style={{ fontWeight: 600 }}>{issue.mod_name}</div>
            <code style={{ display: "block", margin: "0.25rem 0", color: "var(--text-dim)", fontSize: "0.85rem" }}>{issue.target}</code>
            <div style={{ color: "var(--text-dim)" }}>{issue.message}</div>
        </div>
    )
}

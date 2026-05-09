import { useValidation } from "../../hooks/useValidation"
import RegistryErrorBanner from "../../components/RegistryErrorBanner"
import type { ValidationIssue } from "../../api"

/**
 * TW3 Validate page: surfaces broken cross-references in `SUPPORTED_MODS` /
 * `SUPPORTED_EFFECTS`. Subscribes to the shared `useValidation` poll, renders
 * issues grouped by kind, and supports manual refresh.
 *
 * @returns A page rendering grouped validation issues, or a `RegistryErrorBanner`
 *     when the backend reports a configuration error.
 */
export default function ValidatePage() {
    const { issues, loading, error, refresh } = useValidation()

    const issueCount = issues?.length ?? 0
    const countLabel = issueCount === 0 ? "No issues" : `${issueCount} ${issueCount === 1 ? "issue" : "issues"}`

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
                    <span style={{ fontSize: "0.85rem", color: issueCount === 0 ? "var(--text-dim)" : "var(--warning)" }}>{countLabel}</span>
                </div>
                <button className="btn btn-outline" onClick={refresh}>
                    Refresh
                </button>
            </div>

            {loading && (
                <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-dim)" }}>
                    Loading...
                </div>
            )}

            {!loading && issues !== null && issues.length === 0 && (
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

/**
 * Renders a single validation issue as a glass-card.
 *
 * @param issue The validation issue to display.
 * @returns A card with the mod name, target, and message.
 */
function IssueCard({ issue }: IssueCardProps) {
    return (
        <div className="glass-card" style={{ padding: "1rem", marginTop: "0.5rem" }}>
            <div style={{ fontWeight: 600 }}>{issue.mod_name}</div>
            <code style={{ display: "block", margin: "0.25rem 0", color: "var(--text-dim)", fontSize: "0.85rem" }}>{issue.target}</code>
            <div style={{ color: "var(--text-dim)" }}>{issue.message}</div>
        </div>
    )
}

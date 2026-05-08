import { Link } from "react-router-dom"

/** Props for `RegistryErrorBanner`. */
interface Props {
    /** Detail message from the API response. */
    detail: string
    /** Optional list of missing settings to surface inline. */
    missing?: string[] | null
}

/**
 * Banner shown on TW3 registry pages when the helper_scripts directory is
 * missing, misconfigured, or contains a syntax error. Links the user to the
 * Settings page for configuration.
 *
 * @param detail Error detail from the API response.
 * @param missing Optional list of missing settings.
 * @returns A glass-card banner with a configure-in-Settings link.
 */
export default function RegistryErrorBanner({ detail, missing }: Props) {
    return (
        <div className="glass-card" style={{ padding: "1rem", borderLeft: "4px solid var(--warning)" }}>
            <h3 style={{ marginTop: 0 }}>Helper scripts not configured</h3>
            <p>{detail}</p>
            {missing && missing.length > 0 && (
                <ul>
                    {missing.map((m) => (
                        <li key={m}>{m}</li>
                    ))}
                </ul>
            )}
            <Link to="/settings">Configure in Settings</Link>
        </div>
    )
}

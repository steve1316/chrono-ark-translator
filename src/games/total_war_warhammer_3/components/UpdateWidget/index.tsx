import { useState } from "react"
import { useUpdates } from "../../hooks/useUpdates"
import RegistryErrorBanner from "../RegistryErrorBanner"

/** Format a delta in seconds as a short human string ("2h ago", "3d ago"). */
function humanizeDelta(seconds: number): string {
    if (seconds < 60) return "just now"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return `${Math.floor(seconds / 604800)} weeks ago`
}

/**
 * Dashboard widget showing the count of mods updated since last sync, a per-mod list,
 * and a Mark-all-as-synced button. Subscribes to the shared `useUpdates` poll.
 *
 * @returns A glass-card widget for the TW3 Dashboard, or a `RegistryErrorBanner`
 *     when the backend reports a configuration error.
 */
export default function UpdateWidget() {
    const { report, error, sync } = useUpdates()
    const [syncing, setSyncing] = useState(false)

    const handleSync = async () => {
        setSyncing(true)
        try {
            await sync()
        } finally {
            setSyncing(false)
        }
    }

    if (error) return <RegistryErrorBanner detail={error.detail} missing={error.missing} />
    if (report === null) {
        return (
            <div className="glass-card" style={{ padding: "1rem", fontStyle: "italic", opacity: 0.7 }}>
                Loading mod updates...
            </div>
        )
    }

    const count = report.stale.length
    const countLabel = count === 0 ? "All mods up to date" : `${count} mod${count === 1 ? "" : "s"} updated since last sync`

    return (
        <div className="glass-card" style={{ padding: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                    <h3 style={{ margin: 0 }}>Mod Updates</h3>
                    <p style={{ margin: "0.25rem 0 0 0", color: "var(--text-dim)" }}>{countLabel}</p>
                </div>
                <button className="btn btn-outline" onClick={handleSync} disabled={syncing}>
                    {syncing ? "Syncing..." : "Mark all as synced"}
                </button>
            </div>
            {!report.baseline_exists && (
                <p style={{ marginTop: "0.75rem", fontStyle: "italic", color: "var(--text-dim)" }}>
                    First-run baseline saved from current mtimes. Mod updates will appear here from the next change forward.
                </p>
            )}
            {count > 0 && (
                <details open style={{ marginTop: "0.75rem" }}>
                    <summary style={{ cursor: "pointer" }}>Updated mods ({count})</summary>
                    <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem" }}>
                        {report.stale.map((s) => (
                            <li key={s.package_name} style={{ margin: "0.25rem 0" }}>
                                <strong>{s.mod_name}</strong> - {humanizeDelta(s.delta_seconds)}
                                <div style={{ fontFamily: "monospace", fontSize: "0.85em", color: "var(--text-dim)" }}>{s.path}</div>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}

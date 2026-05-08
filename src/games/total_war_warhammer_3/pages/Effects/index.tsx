import { useEffect, useState } from "react"
import { fetchEffects, RegistryError } from "../../api"
import RegistryErrorBanner from "../../components/RegistryErrorBanner"

/**
 * Read-only nested view over `SUPPORTED_EFFECTS` from
 * helper_scripts/dynamic_rors_effects.py. Each top-level category renders
 * as a collapsible section listing its effect bundles as a JSON pre-block.
 *
 * @returns A page that renders the effects catalog, or a `RegistryErrorBanner`
 *     when the backend reports a configuration error.
 */
export default function EffectsPage() {
    const [effects, setEffects] = useState<Record<string, unknown> | null>(null)
    const [error, setError] = useState<RegistryError | null>(null)

    useEffect(() => {
        let cancelled = false
        fetchEffects()
            .then((data) => {
                if (!cancelled) setEffects(data)
            })
            .catch((err: unknown) => {
                if (!cancelled && err instanceof RegistryError) setError(err)
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (error) {
        return (
            <div className="page-content">
                <h1>Effects</h1>
                <RegistryErrorBanner detail={error.detail} missing={error.missing} />
            </div>
        )
    }

    return (
        <div className="page-content">
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Effects</h1>
                    <p>Read-only view of `SUPPORTED_EFFECTS`.</p>
                </div>
            </div>
            {effects &&
                Object.entries(effects).map(([category, value]) => (
                    <details key={category} className="glass-card" style={{ padding: "1rem", marginBottom: "0.75rem" }} open>
                        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{category}</summary>
                        <pre style={{ overflowX: "auto", fontFamily: "monospace" }}>{JSON.stringify(value, null, 2)}</pre>
                    </details>
                ))}
        </div>
    )
}

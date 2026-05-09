import { useEffect, useMemo, useState } from "react"
import { fetchSupportedMods, RegistryError } from "../../api"
import type { SupportedMod, ValidationIssue } from "../../api"
import RegistryErrorBanner from "../../components/RegistryErrorBanner"
import ValidationBadge from "../../components/ValidationBadge"
import { useValidation } from "../../hooks/useValidation"

/**
 * Read-only table over `SUPPORTED_MODS` from the configured helper_scripts directory.
 * Search filters across `name` and `package_name`.
 *
 * @returns A page that renders a searchable table of TW3 supported mods, or a
 *     `RegistryErrorBanner` when the backend reports a configuration error.
 */
export default function SupportedModsPage() {
    const [mods, setMods] = useState<SupportedMod[] | null>(null)
    const [error, setError] = useState<RegistryError | null>(null)
    const [search, setSearch] = useState("")
    const { issues: validationIssues } = useValidation()

    useEffect(() => {
        let cancelled = false
        fetchSupportedMods()
            .then((data) => {
                if (!cancelled) setMods(data)
            })
            .catch((err: unknown) => {
                if (!cancelled && err instanceof RegistryError) setError(err)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const issuesByMod = useMemo(() => {
        const map = new Map<string, ValidationIssue[]>()
        for (const issue of validationIssues ?? []) {
            const list = map.get(issue.mod_package_name) ?? []
            list.push(issue)
            map.set(issue.mod_package_name, list)
        }
        return map
    }, [validationIssues])

    const filtered = useMemo(() => {
        if (!mods) return []
        const q = search.trim().toLowerCase()
        if (!q) return mods
        return mods.filter((m) => m.name.toLowerCase().includes(q) || m.package_name.toLowerCase().includes(q))
    }, [mods, search])

    if (error) {
        return (
            <>
                <h1>Supported Mods</h1>
                <RegistryErrorBanner detail={error.detail} missing={error.missing} />
            </>
        )
    }

    return (
        <>
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Supported Mods</h1>
                    <p>Read-only view of `SUPPORTED_MODS` from helper_scripts/supported_mods.py.</p>
                </div>
                <input
                    type="text"
                    className="btn-outline"
                    placeholder="Search by name or package_name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: 320, padding: "0.5rem 0.75rem", borderRadius: 8 }}
                />
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th style={{ width: "2.5rem", textAlign: "center" }}>Status</th>
                        <th>Name</th>
                        <th>Package</th>
                        <th>Modified Attributes</th>
                        <th>Path</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map((m) => (
                        <tr key={m.package_name}>
                            <td style={{ width: "2.5rem", textAlign: "center" }}>
                                <ValidationBadge issues={issuesByMod.get(m.package_name) ?? []} />
                            </td>
                            <td>{m.name}</td>
                            <td>{m.package_name}</td>
                            <td>{(m.modified_attributes ?? []).join(", ")}</td>
                            <td style={{ fontFamily: "monospace", color: "var(--text-dim)" }}>{m.path}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    )
}

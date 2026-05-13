import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { fetchSupportedMods, RegistryError } from "../../api"
import type { SupportedMod, ValidationIssue } from "../../api"
import RegistryErrorBanner from "../../components/RegistryErrorBanner"
import SupportedModCard from "../../components/SupportedModCard"
import { useValidation } from "../../hooks/useValidation"

/**
 * Card grid over `SUPPORTED_MODS` from the configured helper_scripts directory. Supports add, edit,
 * and delete via the `+ Add Mod` button and the per-card Edit button. Search filters across `name`
 * and `package_name`.
 *
 * @returns A page that renders a searchable card grid of TW3 supported mods, or a
 *     `RegistryErrorBanner` when the backend reports a configuration error.
 */
export default function SupportedModsPage() {
    const navigate = useNavigate()
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
        const visible = mods.filter((m) => m.package_name !== "vanilla")
        const q = search.trim().toLowerCase()
        if (!q) return visible
        return visible.filter((m) => m.name.toLowerCase().includes(q) || m.package_name.toLowerCase().includes(q))
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
                    <p>Manage `SUPPORTED_MODS` entries in helper_scripts/supported_mods.py.</p>
                </div>
                <input
                    type="text"
                    className="btn-outline"
                    placeholder="Search by name or package_name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: 320, padding: "0.5rem 0.75rem", borderRadius: 8 }}
                />
                <button type="button" className="btn btn-primary" onClick={() => navigate("/supported-mods/new")} style={{ marginLeft: "0.5rem" }}>
                    + Add Mod
                </button>
            </div>
            <div className="mod-grid">
                {filtered.map((m) => (
                    <SupportedModCard key={m.package_name} mod={m} issues={issuesByMod.get(m.package_name) ?? []} onEdit={(pn) => navigate(`/supported-mods/edit/${encodeURIComponent(pn)}`)} />
                ))}
            </div>
        </>
    )
}

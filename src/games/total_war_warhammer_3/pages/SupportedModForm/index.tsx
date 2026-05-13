import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { createSupportedMod, fetchSupportedMods, updateSupportedMod } from "../../api"
import BasicsSection, { emptyBasicsState, type BasicsState } from "./sections/Basics"

/**
 * Add / edit page for a single `SUPPORTED_MODS` entry. Detects mode from
 * the route (`/supported-mods/new` vs `/supported-mods/edit/:packageName`),
 * fetches the existing entry when editing, and posts/puts on Save.
 *
 * @returns The rendered form page.
 */
const SupportedModFormPage = () => {
    const { packageName } = useParams()
    const navigate = useNavigate()
    const isEdit = Boolean(packageName)

    const [basics, setBasics] = useState<BasicsState>(emptyBasicsState)
    const [submitting, setSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        if (!isEdit || !packageName) return
        fetchSupportedMods()
            .then((mods) => {
                const target = mods.find((m) => m.package_name === packageName)
                if (!target) {
                    setErrorMessage(`Mod not found: ${packageName}`)
                    return
                }
                setBasics({
                    name: target.name,
                    package_name: target.package_name,
                    workshop_id: target.workshop_id ?? "",
                    custom_path: !target.workshop_id && Boolean(target.path),
                    path: target.path ?? "",
                })
            })
            .catch((err: unknown) => setErrorMessage(err instanceof Error ? err.message : "Failed to load mod"))
    }, [isEdit, packageName])

    const serializeEntry = () => ({
        name: basics.name,
        package_name: basics.package_name,
        workshop_id: basics.custom_path ? undefined : basics.workshop_id,
        custom_path: basics.custom_path,
        path: basics.custom_path ? basics.path : undefined,
        modified_attributes: [],
    })

    const handleSave = async () => {
        if (!basics.name.trim()) {
            setErrorMessage("Name is required")
            return
        }
        if (!basics.package_name.trim()) {
            setErrorMessage("Package name is required")
            return
        }
        setSubmitting(true)
        setErrorMessage(null)
        try {
            if (isEdit && packageName) {
                await updateSupportedMod(packageName, serializeEntry())
            } else {
                await createSupportedMod(serializeEntry())
            }
            navigate("/supported-mods")
        } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : "Save failed")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
            <div className="dashboard-header">
                <h1>{isEdit ? `Edit Mod: ${packageName}` : "Add Mod"}</h1>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className="btn btn-primary" onClick={handleSave} disabled={submitting}>
                        {submitting ? "Saving..." : "Save"}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => navigate("/supported-mods")} disabled={submitting}>
                        Cancel
                    </button>
                </div>
            </div>
            {errorMessage && <p style={{ color: "var(--warning)" }}>{errorMessage}</p>}
            <BasicsSection value={basics} onChange={setBasics} lockPackageName={isEdit} />
        </div>
    )
}

export default SupportedModFormPage

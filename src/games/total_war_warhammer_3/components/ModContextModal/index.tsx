import React, { useCallback, useEffect, useState } from "react"

import type { WH3ModContext } from "../../../../shared_types"
import { fetchModContext, saveModContext } from "../../translationApi"

/** Props for `ModContextModal`. */
interface ModContextModalProps {
    /** Steam Workshop ID of the translation mod whose context this edits. */
    workshopId: string
    /** Called when the modal is closed (Save success, Cancel, Esc, or backdrop click). */
    onClose: () => void
}

/**
 * Modal wrapper around the per-mod context editor (source game, character name, background).
 * Loads the current context on open. Saving PUTs the new value and calls `onClose`.
 *
 * @param props See `ModContextModalProps`.
 * @returns The rendered modal.
 */
const ModContextModal: React.FC<ModContextModalProps> = ({ workshopId, onClose }) => {
    const [ctx, setCtx] = useState<WH3ModContext>({ source_game: "", character_name: "", background: "", source_language_override: null, target_language_override: null })
    const [loaded, setLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string>("")

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const data = await fetchModContext(workshopId)
                if (!cancelled) {
                    setCtx(data)
                    setLoaded(true)
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workshopId])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [onClose])

    const onSave = useCallback(async () => {
        setSaving(true)
        setError("")
        try {
            await saveModContext(workshopId, ctx)
            onClose()
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setSaving(false)
        }
    }, [workshopId, ctx, onClose])

    return (
        <div
            className="modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="glass-card modal-panel" style={{ width: "600px" }}>
                <div className="modal-header">
                    <h2 style={{ margin: 0 }}>Mod context</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                {!loaded && !error && <p>Loading...</p>}
                {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
                {loaded && (
                    <>
                        <label htmlFor="ctx-source-game">Source game</label>
                        <textarea id="ctx-source-game" rows={1} value={ctx.source_game} onChange={(e) => setCtx({ ...ctx, source_game: e.target.value })} />
                        <label htmlFor="ctx-character-name">Character name</label>
                        <textarea id="ctx-character-name" rows={1} value={ctx.character_name} onChange={(e) => setCtx({ ...ctx, character_name: e.target.value })} />
                        <label htmlFor="ctx-background">Background / lore</label>
                        <textarea id="ctx-background" rows={6} value={ctx.background} onChange={(e) => setCtx({ ...ctx, background: e.target.value })} />
                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline" onClick={onClose}>
                                Cancel
                            </button>
                            <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ModContextModal

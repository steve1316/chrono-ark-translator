import { useEffect, useId, useRef, useState } from "react"
import type { ChangeEvent } from "react"

import Field from "../ui/Field"
import Panel from "../ui/Panel"

/** The three free-text context fields sent with every translation prompt. */
export interface ContextFields {
    /** Game or franchise the mod's content comes from. */
    source_game: string
    /** Character or subject name. */
    character_name: string
    /** Lore and personality notes for the translator. */
    background: string
}

/** Props for ContextPanel. */
interface ContextPanelProps {
    /** Panel heading, e.g. "Character Context" or "Mod Context". */
    title: string
    /** Help line under the heading. */
    description?: string
    /** Saved context. The panel edits a draft and resets it whenever one of the three saved fields changes. */
    value: ContextFields
    /** Persists the edited fields. The panel shows "Saved!" when it resolves, and the error message when it rejects. */
    onSave: (next: ContextFields) => Promise<void>
    /** Per-field placeholder overrides. Fields left out keep Chrono Ark's examples. */
    placeholders?: Partial<ContextFields>
}

const DEFAULT_PLACEHOLDERS: ContextFields = {
    source_game: "e.g. Library of Ruina",
    character_name: "e.g. Roland",
    background: "Describe the character's personality, role in their source game, and any lore that would help with translation...",
}

/**
 * Pick the three context fields out of a possibly larger object (WH3's mod context also carries language overrides).
 *
 * @param value The saved context.
 * @returns Just the three context fields.
 */
function fieldsOf(value: ContextFields): ContextFields {
    return { source_game: value.source_game, character_name: value.character_name, background: value.background }
}

/**
 * Inline context editor shown under the translation toolbar. The page owns the saved value, and the panel owns only the unsaved draft.
 *
 * @param title Panel heading.
 * @param description Help line.
 * @param value Saved context.
 * @param onSave Persists the draft.
 * @param placeholders Per-field placeholder overrides.
 * @returns The panel.
 */
export function ContextPanel({
    title,
    description = "This context is included in the translation prompt to help the AI understand the character's lore.",
    value,
    onSave,
    placeholders,
}: ContextPanelProps) {
    const id = useId()
    const hints = { ...DEFAULT_PLACEHOLDERS, ...placeholders }
    const savedKey = JSON.stringify(fieldsOf(value))
    const [draft, setDraft] = useState<ContextFields>(() => fieldsOf(value))
    const [draftKey, setDraftKey] = useState(savedKey)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const savedTimer = useRef<number | undefined>(undefined)

    // Reset the draft when the saved fields change, but not when the parent merely hands in a new object with the same fields.
    if (savedKey !== draftKey) {
        setDraftKey(savedKey)
        setDraft(fieldsOf(value))
    }

    useEffect(() => () => window.clearTimeout(savedTimer.current), [])

    /**
     * Build a change handler for one field.
     *
     * @param field The field to update.
     * @returns The input change handler.
     */
    const update = (field: keyof ContextFields) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))

    const handleSave = async () => {
        setError(null)
        try {
            await onSave(draft)
            setSaved(true)
            window.clearTimeout(savedTimer.current)
            savedTimer.current = window.setTimeout(() => setSaved(false), 2000)
        } catch (err) {
            setError((err as Error).message || "Failed to save context.")
        }
    }

    return (
        <Panel title={title} help={description} className="context-panel">
            <div className="context-panel-row">
                <Field label="Source Game" htmlFor={`${id}-source-game`} className="context-panel-field">
                    <input id={`${id}-source-game`} type="text" className="input" placeholder={hints.source_game} value={draft.source_game} onChange={update("source_game")} />
                </Field>
                <Field label="Character Name" htmlFor={`${id}-character-name`} className="context-panel-field">
                    <input id={`${id}-character-name`} type="text" className="input" placeholder={hints.character_name} value={draft.character_name} onChange={update("character_name")} />
                </Field>
            </div>
            <Field label="Background" htmlFor={`${id}-background`}>
                <textarea id={`${id}-background`} className="textarea" rows={4} placeholder={hints.background} value={draft.background} onChange={update("background")} />
            </Field>
            <div className="context-panel-footer">
                {error && <span className="context-panel-error">{error}</span>}
                {saved && <span className="context-panel-saved">Saved!</span>}
                <button type="button" className="btn btn-primary btn-soft-teal" onClick={handleSave}>
                    Save Context
                </button>
            </div>
        </Panel>
    )
}

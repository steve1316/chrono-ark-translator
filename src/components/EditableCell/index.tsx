import React, { useState, useEffect, useRef } from "react"

/**
 * Props for the EditableCell component.
 */
interface EditableCellProps {
    /** The current persisted value displayed in the cell. */
    value: string
    /** Callback invoked when the user commits a change (blur or Enter). */
    onSave: (val: string) => void
    /** Placeholder text shown in dim italic when the value is empty. */
    placeholder?: string
}

/**
 * An inline-editable table cell that toggles between display and edit modes.
 *
 * Display mode: shows the value (or placeholder) as plain text. Clicking
 * anywhere in the cell enters edit mode.
 *
 * Edit mode: renders an <input> that auto-focuses. The edit is committed on
 * blur or Enter, and cancelled (reverted) on Escape. The `onSave` callback
 * is only called if the value actually changed, avoiding unnecessary API calls.
 *
 * @param value - The current persisted value displayed in the cell.
 * @param onSave - Callback invoked when the user commits a change.
 * @param placeholder - Placeholder text when the value is empty.
 * @returns The rendered editable cell JSX.
 */
const EditableCell: React.FC<EditableCellProps> = ({ value, onSave, placeholder }) => {
    const [isEditing, setIsEditing] = useState(false)
    const [tempValue, setTempValue] = useState(value)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isEditing])

    /**
     * Handles focus loss on the input field.
     */
    const handleBlur = () => {
        setIsEditing(false)
        if (tempValue !== value) {
            onSave(tempValue)
        }
    }

    /**
     * Handles key down events within the editing input.
     * @param e - Keyboard event.
     */
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleBlur()
        } else if (e.key === "Escape") {
            setTempValue(value)
            setIsEditing(false)
        }
    }

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="edit-input"
                style={{
                    width: "100%",
                    padding: "4px 8px",
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid var(--accent-primary)",
                    color: "var(--text-main)",
                    borderRadius: "4px",
                    outline: "none",
                }}
            />
        )
    }

    return (
        <div
            onClick={() => {
                setIsEditing(true)
                setTempValue(value)
            }}
            className="clickable-cell"
            style={{ minHeight: "1.2em", cursor: "text" }}
        >
            {value ? <span>{value}</span> : <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>{placeholder}</span>}
        </div>
    )
}

export default EditableCell

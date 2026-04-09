import React from "react"

/**
 * Props for the ConfirmModal component.
 */
interface ConfirmModalProps {
    /** Modal heading text. */
    title: string
    /** Body content — plain text or JSX (e.g. bullet lists). */
    message: string | React.ReactNode
    /** Text for the confirm button. Defaults to "Confirm". */
    confirmLabel?: string
    /** Text for the cancel button. Defaults to "Cancel". */
    cancelLabel?: string
    /** Controls confirm button color: red for danger, amber for warning, accent gradient for default. */
    variant?: "danger" | "warning" | "default"
    /** Called when the user clicks confirm. */
    onConfirm: () => void
    /** Called when the user clicks cancel or the backdrop. */
    onCancel: () => void
}

const variantStyles: Record<string, React.CSSProperties> = {
    danger: { background: "rgba(239,68,68,0.25)", color: "#ff6b6b", borderColor: "rgba(239,68,68,0.4)" },
    warning: { background: "rgba(251,191,36,0.2)", color: "#fbbf24", borderColor: "rgba(251,191,36,0.4)" },
}

/**
 * Reusable confirmation modal with glassmorphism styling.
 *
 * Replaces native `window.confirm()` dialogs. Supports danger/warning
 * variants for destructive actions.
 *
 * @param props - See `ConfirmModalProps`.
 * @returns The rendered confirmation modal overlay.
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "default", onConfirm, onCancel }) => {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                zIndex: 1000,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onCancel()
            }}
        >
            <div className="glass-card" style={{ width: "500px", maxHeight: "80vh", overflow: "auto", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <h2 style={{ margin: 0 }}>{title}</h2>
                    <button
                        onClick={onCancel}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            fontSize: "2rem",
                            lineHeight: 1,
                            cursor: "pointer",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "4px",
                        }}
                        title="Close"
                    >
                        &times;
                    </button>
                </div>
                <div style={{ color: "var(--text-main)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: "1.5rem" }}>{message}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                    <button className="btn btn-outline" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button className="btn btn-primary" onClick={onConfirm} style={variant !== "default" ? variantStyles[variant] : undefined}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmModal

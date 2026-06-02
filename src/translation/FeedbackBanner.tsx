/** Props for FeedbackBanner. */
interface FeedbackBannerProps {
    /** Whether this is a success or error notification. */
    type: "success" | "error"
    /** The message to display. Rendered with whitespace preserved. */
    message: string
    /** Called when the user clicks the close button. */
    onDismiss: () => void
}

/**
 * Dismissible colored banner for translation feedback, shared by every game.
 * Green for success, red for error, matching Chrono Ark's result banner.
 * @param type - Success or error styling.
 * @param message - The message text (whitespace preserved).
 * @param onDismiss - Close handler.
 * @returns The banner element.
 */
export function FeedbackBanner({ type, message, onDismiss }: FeedbackBannerProps) {
    const color = type === "success" ? "#34d399" : "#f87171"
    const background = type === "success" ? "rgba(52, 211, 153, 0.1)" : "rgba(248, 113, 113, 0.1)"
    return (
        <div
            className="glass-card"
            style={{
                background,
                color,
                padding: "1rem 1.25rem",
                marginBottom: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                whiteSpace: "pre-wrap",
            }}
        >
            <span>{message}</span>
            <button onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color, fontSize: "1.5rem", lineHeight: 1, cursor: "pointer", padding: 0 }}>
                &times;
            </button>
        </div>
    )
}

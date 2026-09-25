import Banner from "../ui/Banner"

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
 * Dismissible result banner for translation feedback, shared by every game. A thin wrapper over the shared `Banner` with a success or error tone.
 * @param type - Success or error styling.
 * @param message - The message text (whitespace preserved).
 * @param onDismiss - Close handler.
 * @returns The banner element.
 */
export function FeedbackBanner({ type, message, onDismiss }: FeedbackBannerProps) {
    return (
        <Banner tone={type} onDismiss={onDismiss}>
            {message}
        </Banner>
    )
}

/** Real-time progress from a streaming provider. */
interface StreamingProgress {
    /** Tokens generated so far. */
    tokensGenerated: number
    /** Generation rate in tokens per second. */
    tokensPerSec: number
    /** Seconds elapsed for the current batch. */
    elapsedSec: number
}

/** Props for TranslatingBanner. */
interface TranslatingBannerProps {
    /** Zero-based index of the batch currently translating. */
    batchIndex: number
    /** Total number of batches in the run. */
    totalBatches: number
    /** Live streaming stats, when the provider streams; otherwise omitted. */
    streaming?: StreamingProgress
    /** Called when the user clicks Cancel. */
    onCancel: () => void
}

/**
 * In-progress translation banner, shared by every game. Shows the current batch,
 * streaming throughput when available, and a Cancel button.
 * @param batchIndex - Zero-based current batch index.
 * @param totalBatches - Total batches in the run.
 * @param streaming - Optional live streaming stats.
 * @param onCancel - Cancel handler.
 * @returns The banner element.
 */
export function TranslatingBanner({ batchIndex, totalBatches, streaming, onCancel }: TranslatingBannerProps) {
    const detail = streaming ? `${streaming.tokensGenerated} tokens (${streaming.tokensPerSec} tok/s, ${streaming.elapsedSec}s elapsed)` : "waiting for provider response"
    return (
        <div
            className="glass-card"
            style={{
                background: "rgba(125, 211, 252, 0.08)",
                border: "1px solid rgba(125, 211, 252, 0.25)",
                padding: "1rem 1.25rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
            }}
        >
            <span
                style={{
                    width: "1.25rem",
                    height: "1.25rem",
                    borderRadius: "50%",
                    border: "2px solid rgba(125, 211, 252, 0.3)",
                    borderTopColor: "var(--accent-primary)",
                    animation: "spin 1s linear infinite",
                    flexShrink: 0,
                }}
            />
            <span style={{ flex: 1 }}>
                Translating batch {batchIndex + 1} of {totalBatches}... {detail}
            </span>
            <button className="btn btn-outline" onClick={onCancel}>
                Cancel
            </button>
        </div>
    )
}

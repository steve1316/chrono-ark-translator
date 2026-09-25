/** Props for BatchReviewBanner. */
interface BatchReviewBannerProps {
    /** Zero-based index of the batch that just finished. */
    batchIndex: number
    /** Total batches in the run. */
    totalBatches: number
    /** Opens the suggestion review dialog. */
    onReview: () => void
    /** Resumes the run without reviewing. */
    onContinue: () => void
    /** Stops the run. */
    onCancel: () => void
}

/**
 * Banner shown while a translation run is paused for glossary review and the review dialog is closed.
 *
 * @param batchIndex The finished batch.
 * @param totalBatches Batches in the run.
 * @param onReview Opens the review dialog.
 * @param onContinue Resumes the run.
 * @param onCancel Stops the run.
 * @returns The banner.
 */
export function BatchReviewBanner({ batchIndex, totalBatches, onReview, onContinue, onCancel }: BatchReviewBannerProps) {
    return (
        <div className="glass-card static batch-review-banner">
            <span>
                Batch {batchIndex + 1} of {totalBatches} complete.
            </span>
            <div className="batch-review-banner-actions">
                <button type="button" className="btn btn-primary" onClick={onReview}>
                    Review Suggestions
                </button>
                <button type="button" className="btn btn-primary" onClick={onContinue}>
                    Continue
                </button>
                <button type="button" className="btn btn-outline" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    )
}

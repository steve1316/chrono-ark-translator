import type { ReactNode } from "react"
import { FaArrowLeft } from "react-icons/fa"

/** Props for PageHeader. */
interface PageHeaderProps {
    /** Page title, rendered as the page's h1 in the game accent gradient. Long titles wrap within themselves. */
    title: ReactNode
    /** When given, a back button above the header calls it. */
    onBack?: () => void
    /** Label for the back button. Defaults to "Back to Dashboard". */
    backLabel?: string
    /** Leading 80x80 image URL, such as a mod preview. Nothing renders when null or undefined. */
    image?: string | null
    /** Alt text for the leading image. */
    imageAlt?: string
    /** Icons and pills kept on one line beside the title (e.g. Steam link, open folder, pending sync). */
    adornments?: ReactNode
    /** Dim line under the title, such as "by author". */
    subtitle?: ReactNode
    /** Extra lines under the subtitle, such as language controls and a progress count. */
    meta?: ReactNode
    /** Action row rendered under the identity block. */
    actions?: ReactNode
}

/**
 * Shared page header: an optional back button, then a leading image, a title that shrinks and wraps instead of pushing its adornments onto a new line,
 * a no-wrap adornment group, subtitle and meta lines, and an action row.
 *
 * @param title Page title.
 * @param onBack Back button handler.
 * @param backLabel Back button label.
 * @param image Leading image URL.
 * @param imageAlt Alt text for the image.
 * @param adornments Icons and pills beside the title.
 * @param subtitle Dim line under the title.
 * @param meta Extra lines under the subtitle.
 * @param actions Action row.
 * @returns The header.
 */
export default function PageHeader({ title, onBack, backLabel = "Back to Dashboard", image, imageAlt = "", adornments, subtitle, meta, actions }: PageHeaderProps) {
    return (
        <>
            {onBack && (
                <button type="button" className="btn btn-outline page-back" onClick={onBack}>
                    <FaArrowLeft /> {backLabel}
                </button>
            )}
            <div className="dashboard-header">
                <div className="title-group page-header-identity">
                    {image && <img className="page-header-image" src={image} alt={imageAlt} />}
                    <div className="page-header-text">
                        <div className="page-header-title-row">
                            <h1 className="page-header-title">{title}</h1>
                            {adornments && <div className="page-header-adornments">{adornments}</div>}
                        </div>
                        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
                        {meta}
                    </div>
                </div>
                {actions && <div className="mod-actions">{actions}</div>}
            </div>
        </>
    )
}

import React, { useState, type HTMLAttributes, type ReactNode } from "react"

/** Props for WorkshopCard. */
interface WorkshopCardProps extends HTMLAttributes<HTMLDivElement> {
    /** Absolute URL to the preview image. When omitted, null, or the image fires `onError`, a placeholder renders instead. */
    previewImageUrl?: string | null
    /** Alt text for the preview image. Defaults to a generic label so screen readers always have something to read. */
    previewAlt?: string
    /** Card title rendered as an h3 in the header row. */
    title: ReactNode
    /** Optional monospace badge rendered to the right of the title (workshop id, mod id, etc.). */
    idBadge?: string
    /** Optional dim line beneath the title (author, shared-note, etc.). */
    subtitle?: ReactNode
    /** Per-consumer body and action content rendered below the header. */
    children?: ReactNode
}

/**
 * Shared visual shell for workshop-style cards. Owns the glass-card frame, the preview-image slot (with on-error placeholder
 * fallback), and the header row (title + optional id badge + optional subtitle). Per-game body and action content goes into
 * `children`.
 *
 * @param previewImageUrl URL to the preview image. When falsy or the image fails to load, a placeholder renders.
 * @param previewAlt Alt text for the preview image. Defaults to "Preview image".
 * @param title Card title rendered as an h3.
 * @param idBadge Optional badge text rendered to the right of the title.
 * @param subtitle Optional dim subtitle node beneath the title.
 * @param children Per-consumer body and action content.
 * @param className Extra CSS classes forwarded to the root element.
 * @param rest Forwarded HTML attributes for the root element (`data-mod-id`, etc.).
 * @returns The rendered card.
 */
const WorkshopCard: React.FC<WorkshopCardProps> = ({ previewImageUrl, previewAlt = "Preview image", title, idBadge, subtitle, children, className, ...rest }) => {
    const [imageFailed, setImageFailed] = useState(false)
    const showImage = previewImageUrl && !imageFailed

    return (
        <div className={`glass-card mod-card animate-fade-in${className ? ` ${className}` : ""}`} {...rest}>
            <div className="mod-preview">
                {showImage ? (
                    <img src={previewImageUrl} alt={previewAlt} loading="lazy" onError={() => setImageFailed(true)} />
                ) : (
                    <div
                        data-testid="workshop-card-placeholder"
                        style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(255,255,255,0.04)",
                            color: "var(--text-dim, #777)",
                            fontSize: "0.8rem",
                        }}
                    >
                        No preview
                    </div>
                )}
            </div>
            <div className="mod-card-content">
                <div className="mod-header">
                    <div className="mod-info">
                        <h3>{title}</h3>
                        {subtitle && <span className="author">{subtitle}</span>}
                    </div>
                    {idBadge && <span className="id-badge">{idBadge}</span>}
                </div>
                {children}
            </div>
        </div>
    )
}

export default WorkshopCard

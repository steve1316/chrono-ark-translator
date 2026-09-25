import React from "react"

/** Props for ModGridSkeleton. */
interface ModGridSkeletonProps {
    /** Number of placeholder cards to render. Defaults to 6. */
    count?: number
    /** Accessible label announced while loading. Defaults to "Loading mods". */
    label?: string
}

/**
 * Placeholder grid shown while a dashboard's mod list is loading. Each card mirrors the `ModCard` layout (preview, title, progress,
 * stats, action) with shimmering blocks so the page keeps its shape until the real cards arrive.
 *
 * @param count Number of placeholder cards to render.
 * @param label Accessible label announced while loading.
 * @returns A busy `mod-grid` of skeleton cards.
 */
const ModGridSkeleton: React.FC<ModGridSkeletonProps> = ({ count = 6, label = "Loading mods" }) => {
    return (
        <div className="mod-grid" role="status" aria-busy="true" aria-label={label}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="glass-card mod-card mod-card-skeleton" aria-hidden="true">
                    <div className="mod-preview skeleton-block" />
                    <div className="mod-card-content">
                        <div>
                            <div className="skeleton-block" style={{ height: "1.1rem", width: "70%" }} />
                            <div className="skeleton-block" style={{ height: "0.8rem", width: "40%", marginTop: "0.5rem" }} />
                        </div>
                        <div className="skeleton-block" style={{ height: "0.5rem", width: "100%" }} />
                        <div style={{ display: "flex", gap: "1rem" }}>
                            <div className="skeleton-block" style={{ height: "2.5rem", flex: 1 }} />
                            <div className="skeleton-block" style={{ height: "2.5rem", flex: 1 }} />
                        </div>
                        <div className="skeleton-block" style={{ height: "2.25rem", width: "100%", marginTop: "auto" }} />
                    </div>
                </div>
            ))}
        </div>
    )
}

export default ModGridSkeleton

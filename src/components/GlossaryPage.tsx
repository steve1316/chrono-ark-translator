import React, { useState, useEffect, useMemo } from "react"
import { FaSearch } from "react-icons/fa"
import { API_BASE } from "../config"
import type { Glossary } from "../shared_types"


/**
 * Displays the base-game terminology glossary in a searchable, filterable table.
 *
 * This is a top-level page component that fetches the full glossary on mount
 * (GET /api/glossary) and lets users narrow it down via a text search and
 * per-category toggle buttons. The glossary contains English terms, their
 * category (e.g. "skill", "character"), and source-language mappings.
 *
 * @returns The rendered glossary page with search bar, category filters, and terms table
 */
const GlossaryPage: React.FC = () => {
    const [glossary, setGlossary] = useState<Glossary>({ terms: {} })
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [categoryFilter, setCategoryFilter] = useState<string>("all")

    // Fetch the full glossary once on mount. The endpoint returns a Glossary object: { terms: Record<string, GlossaryTerm> }.
    useEffect(() => {
        const fetchGlossary = async () => {
            try {
                const res = await fetch(`${API_BASE}/glossary`)
                const data = await res.json()
                setGlossary(data)
            } catch (err) {
                console.error("Failed to fetch glossary:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchGlossary()
    }, [])

    /**
     * Unique, alphabetically sorted list of categories present in the glossary.
     * Used to render the category filter buttons. Recomputed only when the
     * glossary data changes.
     */
    const categories = useMemo(() => {
        const cats = new Set<string>()
        for (const term of Object.values(glossary.terms)) {
            cats.add(term.category)
        }
        return Array.from(cats).sort()
    }, [glossary])

    /**
     * Filtered and sorted glossary entries, recomputed whenever the glossary,
     * search text, or category filter changes.
     *
     * Filtering logic:
     * 1. Text search (case-insensitive) matches against the English key AND
     *    against every value in source_mappings, so users can search by the
     *    original-language text too (e.g. a Korean term name).
     * 2. Category filter is an exact match when not "all".
     *
     * Results are sorted alphabetically by the English term.
     */
    const filteredTerms = useMemo(() => {
        return Object.entries(glossary.terms)
            .filter(([english, info]) => {
                // Match against the English key or any source mapping value.
                const matchesSearch =
                    english.toLowerCase().includes(search.toLowerCase()) ||
                    Object.values(info.source_mappings).some((v) => v.toLowerCase().includes(search.toLowerCase()))
                const matchesCategory = categoryFilter === "all" || info.category === categoryFilter
                return matchesSearch && matchesCategory
            })
            .sort(([a], [b]) => a.localeCompare(b))
    }, [glossary, search, categoryFilter])

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
                <h2 style={{ color: "var(--text-dim)", animation: "pulse 2s infinite" }}>Loading glossary...</h2>
            </div>
        )
    }

    return (
        <div className="glossary-view animate-fade-in">
            {/* Page header showing total term and category counts. */}
            <div className="dashboard-header">
                <div className="title-group">
                    <h1>Terminology Glossary</h1>
                    <p>
                        {Object.keys(glossary.terms).length} base game terms across {categories.length} categories
                    </p>
                </div>
            </div>

            {/* Search bar and category filter toggles */}
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                    {/* Text search input with a magnifying-glass icon overlay. */}
                    <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                        <FaSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                        <input
                            type="text"
                            placeholder="Search terms..."
                            className="btn-outline"
                            style={{ width: "100%", padding: "0.75rem 0.75rem 0.75rem 2.5rem", borderRadius: "8px", background: "rgba(0,0,0,0.2)" }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    {/* Category toggle buttons -- "All" plus one per unique category. */}
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button className={`btn ${categoryFilter === "all" ? "btn-primary" : "btn-outline"}`} onClick={() => setCategoryFilter("all")}>
                            All
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                className={`btn ${categoryFilter === cat ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setCategoryFilter(cat)}
                                style={{ textTransform: "capitalize" }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Terms table showing English term, category, and source-language mappings. */}
            <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-color)" }}>
                            <th style={{ padding: "0.75rem 1rem", textAlign: "left", borderBottom: "1px solid var(--glass-border)", width: "200px" }}>English Term</th>
                            <th style={{ padding: "0.75rem 1rem", textAlign: "left", borderBottom: "1px solid var(--glass-border)", width: "120px" }}>Category</th>
                            <th style={{ padding: "0.75rem 1rem", textAlign: "left", borderBottom: "1px solid var(--glass-border)" }}>Source Mappings</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTerms.map(([english, info]) => (
                            <tr key={english} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                                <td style={{ padding: "0.5rem 1rem", fontWeight: 500 }}>{english}</td>
                                <td style={{ padding: "0.5rem 1rem", textTransform: "capitalize", color: "var(--text-dim)" }}>{info.category}</td>
                                <td style={{ padding: "0.5rem 1rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
                                    {/* Render each source-language mapping as "lang: text" pairs inline. */}
                                    {Object.entries(info.source_mappings).map(([lang, text]) => (
                                        <span key={lang} style={{ marginRight: "1rem" }}>
                                            <strong>{lang}:</strong> {text}
                                        </span>
                                    ))}
                                </td>
                            </tr>
                        ))}
                        {/* Empty-state row when filters yield no results. */}
                        {filteredTerms.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ padding: "2rem", textAlign: "center", color: "var(--text-dim)" }}>
                                    No matching terms found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default GlossaryPage

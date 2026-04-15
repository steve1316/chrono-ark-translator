import type { GlossaryTerm } from "../shared_types"

/**
 * Extract unique, alphabetically sorted categories from glossary terms.
 * @param terms - Map of English term to GlossaryTerm.
 * @returns Sorted array of unique category strings.
 */
export function extractCategories(terms: Record<string, GlossaryTerm>): string[] {
    const cats = new Set<string>()
    for (const term of Object.values(terms)) {
        cats.add(term.category)
    }
    return Array.from(cats).sort()
}

/**
 * Filter and sort glossary terms by search text and category.
 * Search matches against the English text, the glossary key field,
 * and all source mapping values (case-insensitive).
 * @param terms - Map of unique term key to GlossaryTerm.
 * @param search - Free-text search query.
 * @param categoryFilter - Category to filter by, or "all" for no filter.
 * @returns Sorted array of [termKey, GlossaryTerm] tuples.
 */
export function filterGlossaryTerms(
    terms: Record<string, GlossaryTerm>,
    search: string,
    categoryFilter: string,
): [string, GlossaryTerm][] {
    const q = search.toLowerCase()
    return Object.entries(terms)
        .filter(([termKey, info]) => {
            const english = info.english || termKey
            const matchesSearch =
                !q ||
                english.toLowerCase().includes(q) ||
                info.key.toLowerCase().includes(q) ||
                Object.values(info.source_mappings).some((v) => v.toLowerCase().includes(q))
            const matchesCategory = categoryFilter === "all" || info.category === categoryFilter
            return matchesSearch && matchesCategory
        })
        .sort(([aKey, aInfo], [bKey, bInfo]) => (aInfo.english || aKey).localeCompare(bInfo.english || bKey))
}

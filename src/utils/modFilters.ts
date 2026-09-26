import type { ModStatus } from "../shared_types"

/**
 * Case-insensitive check that any of the given fields contains the search text.
 * Blank or whitespace-only search text matches everything.
 * @param search - Free-text search query.
 * @param fields - Values to search, such as a name and a workshop id. Null and undefined are skipped.
 * @returns True when the item should stay visible.
 */
export function matchesSearch(search: string, ...fields: (string | null | undefined)[]): boolean {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return fields.some((field) => (field ?? "").toLowerCase().includes(query))
}

/**
 * Filter mods by a case-insensitive search across name and author.
 * Returns all mods when the search string is empty or whitespace.
 * @param mods - Array of mod status objects.
 * @param search - Free-text search query.
 * @returns Filtered array of matching mods.
 */
export function filterMods(mods: ModStatus[], search: string): ModStatus[] {
    return mods.filter((mod) => matchesSearch(search, mod.name, mod.author))
}

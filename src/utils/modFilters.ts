import type { ModStatus } from "../shared_types"

/**
 * Filter mods by a case-insensitive search across name and author.
 * Returns all mods when the search string is empty or whitespace.
 * @param mods - Array of mod status objects.
 * @param search - Free-text search query.
 * @returns Filtered array of matching mods.
 */
export function filterMods(mods: ModStatus[], search: string): ModStatus[] {
    const query = search.trim().toLowerCase()
    if (!query) return mods
    return mods.filter(
        (mod) => mod.name.toLowerCase().includes(query) || (mod.author ?? "").toLowerCase().includes(query),
    )
}

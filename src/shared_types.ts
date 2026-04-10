/**
 * Shared TypeScript types mirroring the backend API response shapes.
 *
 * These types are consumed across the React frontend to ensure type-safe
 * communication with the FastAPI backend. Keep them in sync with the
 * Pydantic models defined in `backend/web_server.py`.
 */

/**
 * Summary status for a single mod, used in the dashboard listing.
 */
export type ModStatus = {
    /** Unique identifier for the mod (derived from its folder name). */
    id: string
    /** Human-readable mod name. */
    name: string
    /** Mod author name. */
    author: string
    /** Whether the mod contains CSV localization files. */
    has_csv: boolean
    /** Whether the mod contains a DLL with embedded strings. */
    has_dll: boolean
    /** Total number of localizable strings in the mod. */
    total: number
    /** Number of strings that have an English translation. */
    translated: number
    /** Number of strings still missing an English translation. */
    untranslated: number
    /** Translation progress as a 0-100 percentage. */
    percentage: number
    /** ISO timestamp of when translation data was last modified. */
    last_updated: string
    /** Optional URL to the mod's Steam Workshop or external page. */
    url?: string
    /** Optional URL/path to the mod's preview image; null if none exists. */
    preview_image?: string | null
    /** Whether the mod has pending translation changes that need to be synced to CSV files. */
    has_changes: boolean
}

/**
 * A single localizable string extracted from a mod's data files.
 *
 * Each LocString represents one translatable entry (e.g., a skill name,
 * character dialogue, item description) along with its source-language
 * text and current English translation state.
 */
export type LocString = {
    /** Unique key identifying this string within the mod (e.g., "Skill/FireBolt_Name"). */
    key: string
    /** Category/type of the string (e.g., "Character", "Skill", "Buff"). */
    type: string
    /** Descriptor column from the CSV, providing context about where the string appears. */
    desc: string
    /** Original source-language text (e.g., Korean or Chinese). */
    source: string
    /** Detected source language code (e.g., "Korean", "Chinese"), or null if undetectable. */
    source_lang: string | null
    /** Current English translation text; empty string if not yet translated. */
    english: string
    /** Whether this string has been translated to English. */
    is_translated: boolean
    /** The original English text from the mod files before any user edits, used for diffing. */
    original_english: string
    /** Whether this string has been synced (exported) to the mod's CSV files. */
    is_synced: boolean
    /** The English value at the time of sync; used to restore synced status if the user re-enters it. */
    synced_english: string
    /** The source file (CSV/JSON/DLL) this string was extracted from. */
    source_file: string
    /** Which translation provider produced this translation (e.g., "claude", "ollama", "manual"), or empty if unknown. */
    translated_by: string
}

/**
 * Aggregated translation statistics across all mods, shown on the Statistics page.
 */
export type Stats = {
    /** Number of entries stored in the translation memory database. */
    tm_entries: number
    /** Cumulative number of translation memory matches applied. */
    tm_hits: number
    /** Total number of mods detected in the game's mod directory. */
    total_mods: number
    /** Overall translation progress across all mods (0-100 percentage). */
    global_progress: number
    /** Total number of localizable strings across all mods. */
    total_strings: number
}

/**
 * A single term in the glossary, mapping a canonical English term to its
 * source-language equivalents. Used to ensure consistent translations of
 * recurring game terminology (character names, skill names, mechanics, etc.).
 */
export type GlossaryTerm = {
    /** Semantic category (e.g., "characters", "skills", "mechanics", "custom"). */
    category: string
    /** Localization key that originally defined this term, or empty string for manual entries. */
    key: string
    /** CSV filename this term was extracted from, or empty string for manual/seed entries. */
    source_file?: string
    /** Maps source language name to its native text (e.g., { "Korean": "화염구" }). */
    source_mappings: Record<string, string>
    /** ISO timestamp of when this term was first created. */
    created_at?: string
    /** ISO timestamp of when this term was last modified. */
    updated_at?: string
}

/**
 * The complete glossary for a mod (or the global glossary), keyed by
 * the canonical English term.
 */
export type Glossary = {
    /** Map from English term to its glossary entry. */
    terms: Record<string, GlossaryTerm>
}

/**
 * An AI-generated suggestion for a new glossary term, returned by the
 * backend's term-suggestion endpoint.
 */
export type TermSuggestion = {
    /** Suggested canonical English term. */
    english: string
    /** Original source-language text for this term. */
    source: string
    /** Language of the source text (e.g., "Korean"). */
    source_lang: string
    /** Suggested category for the term (e.g., "characters", "skills"). */
    category: string
    /** Human-readable explanation of why this term was suggested. */
    reason: string
}

/**
 * Full detail payload for a single mod, returned when the user opens a
 * mod for editing. Includes all extractable strings and metadata.
 */
export type ModDetail = {
    /** Unique identifier for the mod. */
    id: string
    /** Human-readable mod name. */
    name: string
    /** Mod author name. */
    author: string
    /** URL to the mod's external page, or null if unavailable. */
    url: string | null
    /** URL/path to the mod's preview image, or null if unavailable. */
    preview_image: string | null
    /** All localizable strings extracted from the mod. */
    strings: LocString[]
    /** List of CSV filenames that appear more than once in the mod's directory tree. */
    duplicate_files: string[]
}

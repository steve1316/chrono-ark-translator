export type ModStatus = {
    id: string
    name: string
    author: string
    has_csv: boolean
    has_dll: boolean
    total: number
    translated: number
    untranslated: number
    percentage: number
    last_updated: string
    url?: string
    preview_image?: string | null
}

export type LocString = {
    key: string
    type: string
    desc: string
    source: string
    source_lang: string | null
    english: string
    is_translated: boolean
    original_english: string
}

export type Stats = {
    tm_entries: number
    tm_hits: number
    total_mods: number
    global_progress: number
    total_strings: number
}

export type GlossaryTerm = {
    category: string
    key: string
    source_mappings: Record<string, string>
}

export type Glossary = {
    terms: Record<string, GlossaryTerm>
}

export type TermSuggestion = {
    english: string
    source: string
    source_lang: string
    category: string
    reason: string
}

export type ModDetail = {
    id: string
    name: string
    author: string
    url: string | null
    preview_image: string | null
    strings: LocString[]
    duplicate_files: string[]
}

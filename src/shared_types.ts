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
}

export type Stats = {
    tm_entries: number
    tm_hits: number
    total_mods: number
    global_progress: number
    total_strings: number
}

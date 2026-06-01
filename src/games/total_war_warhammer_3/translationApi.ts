import type {
    TermSuggestion,
    WH3ApiResponseEntry,
    WH3DriftRow,
    WH3DriftStatus,
    WH3GlossaryEntry,
    WH3ModContext,
    WH3RescanSummary,
    WH3SnapshotMeta,
    WH3SyncResult,
    WH3TranslationModSummary,
} from "../../shared_types"
import { gameApi } from "../../api/games"
import { RegistryError } from "./api"

const api = gameApi("total_war_warhammer_3")

/**
 * List all WH3 translation mods registered in `WH3_TRANSLATION_MODS`.
 *
 * @returns Array of summary rows, one per translation mod.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function listTranslationMods(): Promise<WH3TranslationModSummary[]> {
    const res = await api.get("/translation/mods")
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Re-extract parent strings, re-read local translations, recompute drift.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Per-status counts and the scan timestamp.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function rescanMod(workshopId: string): Promise<WH3RescanSummary> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/rescan`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Fetch drift rows for a mod, optionally filtered by status.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param status Optional drift status to filter by. Omitting returns all rows.
 * @returns Drift rows sorted by `(filename, key)`.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function fetchStrings(workshopId: string, status?: WH3DriftStatus): Promise<WH3DriftRow[]> {
    const path = `/translation/mods/${encodeURIComponent(workshopId)}/strings${status ? `?status=${status}` : ""}`
    const res = await api.get(path)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Save a translation edit for one row. Writes into `translations.json`; does NOT
 * write back to the `.loc.tsv` file (known limitation from Plan 1).
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param key Localization key being edited.
 * @param text New translation text.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function saveString(workshopId: string, key: string, text: string): Promise<void> {
    const res = await api.put(`/translation/mods/${encodeURIComponent(workshopId)}/strings/${encodeURIComponent(key)}`, { text })
    if (!res.ok) throw await registryError(res)
}

/**
 * Fetch the per-mod context used to enrich LLM translation prompts.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Mod context (`source_game`, `character_name`, `background`).
 * @throws `RegistryError` On any non-2xx response.
 */
export async function fetchModContext(workshopId: string): Promise<WH3ModContext> {
    const res = await api.get(`/translation/mods/${encodeURIComponent(workshopId)}/mod-context`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Save the per-mod context.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param ctx Mod context to persist.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function saveModContext(workshopId: string, ctx: WH3ModContext): Promise<void> {
    const res = await api.put(`/translation/mods/${encodeURIComponent(workshopId)}/mod-context`, ctx)
    if (!res.ok) throw await registryError(res)
}

/**
 * Hand the given keys to Claude for batch translation. Source text is looked up from the most
 * recent parent extraction. Results are persisted into `translations.json` server-side.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param keys Localization keys to translate.
 * @returns Count of translated rows and any suggested glossary terms.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function translateBatch(workshopId: string, keys: string[]): Promise<{ translated: number; suggested_terms: TermSuggestion[] }> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/translate`, { keys })
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Apply translations.json into the user's `.loc.tsv` files via surgical patch.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Per-file change counts (`{absolute_path: keys_written}`).
 * @throws `RegistryError` On any non-2xx response.
 */
export async function syncChanges(workshopId: string): Promise<WH3SyncResult> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/sync`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Wipe every `text` field on translations.json for this mod.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Count of rows that had their text wiped.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function clearTranslations(workshopId: string): Promise<{ cleared: number }> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/clear-translations`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Fetch snapshot metadata for a mod (newest first).
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Snapshot metadata, sorted newest first.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function listSnapshots(workshopId: string): Promise<WH3SnapshotMeta[]> {
    const res = await api.get(`/translation/mods/${encodeURIComponent(workshopId)}/snapshots`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Create a manual snapshot of the mod's current state.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param label Human-readable label for the snapshot.
 * @returns Metadata of the new snapshot.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function createSnapshot(workshopId: string, label: string): Promise<WH3SnapshotMeta> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/snapshots`, { label })
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Restore a mod's state from a snapshot. Backend auto-creates a pre-restore snapshot first.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param ulid Snapshot identifier to restore.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function restoreSnapshot(workshopId: string, ulid: string): Promise<void> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/snapshots/${encodeURIComponent(ulid)}/restore`)
    if (!res.ok) throw await registryError(res)
}

/**
 * Delete one snapshot from a mod's history.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param ulid Snapshot identifier to delete.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function deleteSnapshot(workshopId: string, ulid: string): Promise<void> {
    const res = await api.delete(`/translation/mods/${encodeURIComponent(workshopId)}/snapshots/${encodeURIComponent(ulid)}`)
    if (!res.ok) throw await registryError(res)
}

/**
 * Fetch the per-mod glossary.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Map from English term to `{source, category}`.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function loadGlossary(workshopId: string): Promise<Record<string, { source: string; category: string }>> {
    const res = await api.get(`/translation/mods/${encodeURIComponent(workshopId)}/glossary`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Add or replace one glossary entry.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param entry Glossary entry to persist.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function addGlossaryTerm(workshopId: string, entry: WH3GlossaryEntry): Promise<void> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/glossary`, entry)
    if (!res.ok) throw await registryError(res)
}

/**
 * Update one glossary entry (handles rename).
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param oldEnglish The current English key.
 * @param entry New entry (may have a different `english` value to trigger rename).
 * @throws `RegistryError` On any non-2xx response.
 */
export async function updateGlossaryTerm(workshopId: string, oldEnglish: string, entry: WH3GlossaryEntry): Promise<void> {
    const res = await api.put(`/translation/mods/${encodeURIComponent(workshopId)}/glossary/${encodeURIComponent(oldEnglish)}`, entry)
    if (!res.ok) throw await registryError(res)
}

/**
 * Delete one glossary entry by English term.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param english English term to delete.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function deleteGlossaryTerm(workshopId: string, english: string): Promise<void> {
    const res = await api.delete(`/translation/mods/${encodeURIComponent(workshopId)}/glossary/${encodeURIComponent(english)}`)
    if (!res.ok) throw await registryError(res)
}

/**
 * Word-boundary find-and-replace `oldEnglish` -> `newEnglish` across all translations for the mod.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @param oldEnglish Term currently used in translations.json.
 * @param newEnglish Term to substitute in.
 * @returns Count of replacements performed.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function glossaryApplyAll(workshopId: string, oldEnglish: string, newEnglish: string): Promise<{ replaced: number }> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/glossary/apply-all`, { old_english: oldEnglish, new_english: newEnglish })
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Ask Claude to suggest refinements to the current glossary. Logs to api_responses.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Suggested glossary edits.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function glossarySuggestEdits(workshopId: string): Promise<TermSuggestion[]> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/glossary/suggest-edits`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Scan all parent source text in the mod for recurring proper nouns. Logs to api_responses.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Suggested glossary terms.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function scanTerms(workshopId: string): Promise<TermSuggestion[]> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/scan-terms`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Fetch the audit log of recent Claude API calls (newest first, cap 20).
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @returns Recent audit entries.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function listApiResponses(workshopId: string): Promise<WH3ApiResponseEntry[]> {
    const res = await api.get(`/translation/mods/${encodeURIComponent(workshopId)}/api-responses`)
    if (!res.ok) throw await registryError(res)
    return res.json()
}

/**
 * Open the mod's local source directory in the OS file explorer.
 *
 * @param workshopId Steam Workshop ID of the translation mod.
 * @throws `RegistryError` On any non-2xx response.
 */
export async function openModFolder(workshopId: string): Promise<void> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/open-folder`)
    if (!res.ok) throw await registryError(res)
}

async function registryError(res: Response): Promise<RegistryError> {
    let detail = res.statusText
    try {
        const body = await res.json()
        if (typeof body.detail === "string") detail = body.detail
    } catch {
        /* ignore */
    }
    return new RegistryError(res.status, detail, null)
}

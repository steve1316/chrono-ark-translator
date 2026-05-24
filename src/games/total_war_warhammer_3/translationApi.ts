import type { WH3DriftRow, WH3DriftStatus, WH3ModContext, WH3RescanSummary, WH3TranslationModSummary } from "../../shared_types"
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
export async function translateBatch(workshopId: string, keys: string[]): Promise<{ translated: number; suggested_terms: unknown[] }> {
    const res = await api.post(`/translation/mods/${encodeURIComponent(workshopId)}/translate`, { keys })
    if (!res.ok) throw await registryError(res)
    return res.json()
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

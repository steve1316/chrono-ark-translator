import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchModContext, fetchStrings, listTranslationMods, rescanMod, saveModContext, saveString, translateBatch } from "../../../games/total_war_warhammer_3/translationApi"
import { RegistryError } from "../../../games/total_war_warhammer_3/api"

const PREFIX = "/api/games/total_war_warhammer_3/translation"

function mockFetchOk(body: unknown) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
}

function mockFetchError(status: number, detail = "boom") {
    return vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ detail }), { status, headers: { "content-type": "application/json" } })))
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("translationApi", () => {
    it("listTranslationMods GETs /mods", async () => {
        const spy = mockFetchOk([{ workshop_id: "1", display_name: "x", parent_workshop_ids: [], local_source_dir: "", source_language: "Chinese", target_language: "English" }])
        const result = await listTranslationMods()
        expect(spy).toHaveBeenCalledWith(expect.stringContaining(`${PREFIX}/mods`), undefined)
        expect(result).toHaveLength(1)
        expect(result[0].workshop_id).toBe("1")
    })

    it("rescanMod POSTs /mods/{id}/rescan", async () => {
        const spy = mockFetchOk({ mod_id: "abc", counts: { translated: 1, untranslated: 2, stale: 0, orphan: 0 }, scanned_at: "2026-05-24T00:00:00Z" })
        const result = await rescanMod("abc")
        expect(spy).toHaveBeenCalledWith(expect.stringContaining(`${PREFIX}/mods/abc/rescan`), expect.objectContaining({ method: "POST" }))
        expect(result.counts.translated).toBe(1)
    })

    it("fetchStrings GETs /mods/{id}/strings without status filter", async () => {
        const spy = mockFetchOk([])
        await fetchStrings("abc")
        expect(spy).toHaveBeenCalledWith(expect.stringMatching(/\/mods\/abc\/strings$/), undefined)
    })

    it("fetchStrings appends status as a query param", async () => {
        const spy = mockFetchOk([])
        await fetchStrings("abc", "untranslated")
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("status=untranslated"), undefined)
    })

    it("saveString PUTs /mods/{id}/strings/{key} with text body", async () => {
        const spy = mockFetchOk({ status: "ok" })
        await saveString("abc", "my.key", "Hello")
        const [url, init] = spy.mock.calls[0] as [string, RequestInit]
        expect(url).toContain(`${PREFIX}/mods/abc/strings/my.key`)
        expect(init.method).toBe("PUT")
        expect(init.body).toBe(JSON.stringify({ text: "Hello" }))
    })

    it("saveString URL-encodes the key", async () => {
        const spy = mockFetchOk({ status: "ok" })
        await saveString("abc", "weird/key with spaces", "x")
        const [url] = spy.mock.calls[0] as [string, RequestInit]
        expect(url).toContain("weird%2Fkey%20with%20spaces")
    })

    it("fetchModContext GETs /mods/{id}/mod-context", async () => {
        const spy = mockFetchOk({ source_game: "WH3", character_name: "x", background: "y" })
        const ctx = await fetchModContext("abc")
        expect(spy).toHaveBeenCalledWith(expect.stringContaining(`${PREFIX}/mods/abc/mod-context`), undefined)
        expect(ctx.character_name).toBe("x")
    })

    it("saveModContext PUTs /mods/{id}/mod-context with the ctx body", async () => {
        const spy = mockFetchOk({ status: "ok" })
        await saveModContext("abc", { source_game: "WH3", character_name: "y", background: "z" })
        const [, init] = spy.mock.calls[0] as [string, RequestInit]
        expect(init.method).toBe("PUT")
        expect(JSON.parse(init.body as string)).toEqual({ source_game: "WH3", character_name: "y", background: "z" })
    })

    it("translateBatch POSTs /mods/{id}/translate with keys array", async () => {
        const spy = mockFetchOk({ translated: 2, suggested_terms: [] })
        const result = await translateBatch("abc", ["k1", "k2"])
        const [url, init] = spy.mock.calls[0] as [string, RequestInit]
        expect(url).toContain(`${PREFIX}/mods/abc/translate`)
        expect(init.method).toBe("POST")
        expect(JSON.parse(init.body as string)).toEqual({ keys: ["k1", "k2"] })
        expect(result.translated).toBe(2)
    })

    it("throws RegistryError when the backend returns a 4xx with a detail string", async () => {
        mockFetchError(404, "not registered")
        await expect(listTranslationMods()).rejects.toBeInstanceOf(RegistryError)
        await expect(listTranslationMods()).rejects.toMatchObject({ status: 404, detail: "not registered" })
    })
})

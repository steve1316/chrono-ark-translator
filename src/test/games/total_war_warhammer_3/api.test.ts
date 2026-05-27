import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchSupportedMods, getCurrentRun, publishAllPacks, publishAllStreamUrl, runStreamUrl, startRun } from "../../../games/total_war_warhammer_3/api"

afterEach(() => {
    vi.restoreAllMocks()
})

describe("tw3 api wrappers", () => {
    it("fetchSupportedMods hits /api/games/total_war_warhammer_3/supported-mods", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ mods: [] }), { status: 200 }))
        await fetchSupportedMods()
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/games/total_war_warhammer_3/supported-mods"), undefined)
    })

    it("startRun POSTs /run/{script_id}", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
        await startRun("update_dynamic_rors")
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toContain("/api/games/total_war_warhammer_3/run/update_dynamic_rors")
        expect((init as RequestInit).method).toBe("POST")
    })

    it("getCurrentRun hits /api/games/total_war_warhammer_3/run", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        await getCurrentRun()
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/games/total_war_warhammer_3/run"), undefined)
    })

    it("runStreamUrl returns the SSE endpoint", () => {
        expect(runStreamUrl()).toContain("/api/games/total_war_warhammer_3/run/stream")
    })

    it("publishAllPacks POSTs /packs/publish-all with changenote and items", async () => {
        const responseBody = { batch_id: "abc", started_at: "2026-05-27T00:00:00Z", queued: 2, skipped: [] }
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }))
        const items = [
            { workshop_id: "111", title: "Mod A" },
            { workshop_id: "222", title: "Mod B" },
        ]
        const result = await publishAllPacks("shared changelog", items)
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toContain("/api/games/total_war_warhammer_3/packs/publish-all")
        expect(init?.method).toBe("POST")
        const body = JSON.parse(String(init?.body))
        expect(body.changenote).toBe("shared changelog")
        expect(body.items).toEqual(items)
        expect(result.batch_id).toBe("abc")
        expect(result.queued).toBe(2)
    })

    it("publishAllPacks throws RegistryError when the backend returns a non-2xx response", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "boom" }), { status: 409 }))
        await expect(publishAllPacks("notes", [{ workshop_id: "111", title: "X" }])).rejects.toThrow()
    })

    it("publishAllStreamUrl returns the per-batch SSE endpoint", () => {
        const url = publishAllStreamUrl("batch-123")
        expect(url).toContain("/api/games/total_war_warhammer_3/packs/publish-all/stream/batch-123")
    })
})

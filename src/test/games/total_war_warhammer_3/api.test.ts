import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchSupportedMods, getCurrentRun, runStreamUrl, startRun } from "../../../games/total_war_warhammer_3/api"

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

})

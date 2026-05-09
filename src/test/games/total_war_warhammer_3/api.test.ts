import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchSupportedMods, fetchEffects, getCurrentRun, runStreamUrl, startRun } from "../../../games/total_war_warhammer_3/api"

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

    it("fetchEffects hits /api/games/total_war_warhammer_3/effects", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ effects: {} }), { status: 200 }))
        await fetchEffects()
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/games/total_war_warhammer_3/effects"), undefined)
    })

    it("getCurrentRun hits /api/games/total_war_warhammer_3/run", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        await getCurrentRun()
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/games/total_war_warhammer_3/run"), undefined)
    })

    it("runStreamUrl returns the SSE endpoint", () => {
        expect(runStreamUrl()).toContain("/api/games/total_war_warhammer_3/run/stream")
    })

    it("fetchCrashes hits /crashes", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ snapshots: [] }), { status: 200 }))
        const { fetchCrashes } = await import("../../../games/total_war_warhammer_3/api")
        await fetchCrashes()
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/games/total_war_warhammer_3/crashes"), undefined)
    })

    it("captureCrash POSTs /crashes/capture", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "x", captured_at: "", trigger: "manual", source: "", files: {}, notes: "" }), { status: 200 }))
        const { captureCrash } = await import("../../../games/total_war_warhammer_3/api")
        await captureCrash()
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toContain("/crashes/capture")
        expect((init as RequestInit).method).toBe("POST")
    })

    it("updateCrashNotes PUTs /crashes/{id}/notes", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ notes: "x" }), { status: 200 }))
        const { updateCrashNotes } = await import("../../../games/total_war_warhammer_3/api")
        await updateCrashNotes("snap", "x")
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toContain("/crashes/snap/notes")
        expect((init as RequestInit).method).toBe("PUT")
    })
})

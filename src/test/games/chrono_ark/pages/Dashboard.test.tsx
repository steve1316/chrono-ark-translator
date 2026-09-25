import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "../../../../games/chrono_ark/pages/Dashboard"

const MOD = {
    id: "3315737452",
    name: "Zerooz Cathy",
    author: "Someone",
    total: 10,
    translated: 5,
    untranslated: 5,
    user_translated: 5,
    untouched: 0,
    percentage: 50,
    has_dll: false,
    has_changes: false,
    preview_image: null,
    url: "https://steamcommunity.com/sharedfiles/filedetails/?id=3315737452",
}

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

beforeEach(() => {
    // jsdom has no ResizeObserver. The dashboard only uses it to size the search bar.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            disconnect() {}
        }
    )
})

afterEach(() => {
    // Unmount before unstubbing. Hooks run in reverse order, so RTL's own cleanup would otherwise run after the stub is gone.
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
})

describe("Chrono Ark Dashboard page", () => {
    it("shows skeleton cards while the mod list is loading", () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}))
        render(wrap(<DashboardPage />))
        expect(screen.getByRole("status", { name: /loading mods/i })).toBeInTheDocument()
    })

    it("replaces the skeleton with mod cards once the list arrives", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([MOD]), { status: 200 }))
        render(wrap(<DashboardPage />))
        expect(await screen.findByText("Zerooz Cathy")).toBeInTheDocument()
        expect(screen.queryByRole("status", { name: /loading mods/i })).not.toBeInTheDocument()
    })

    it("keeps the last viewed mod id until the real list has loaded so scroll-restore can find the card", async () => {
        sessionStorage.setItem("lastViewedMod", MOD.id)
        let resolve: (r: Response) => void = () => {}
        vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((r) => (resolve = r)))
        render(wrap(<DashboardPage />))
        expect(sessionStorage.getItem("lastViewedMod")).toBe(MOD.id)
        resolve(new Response(JSON.stringify([MOD]), { status: 200 }))
        await screen.findByText("Zerooz Cathy")
        await waitFor(() => expect(sessionStorage.getItem("lastViewedMod")).toBeNull())
    })
})

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import SupportedModsPage from "../../../../games/total_war_warhammer_3/pages/SupportedMods"

afterEach(() => {
    vi.restoreAllMocks()
})

function withRouter(ui: React.ReactNode) {
    return <MemoryRouter>{ui}</MemoryRouter>
}

describe("SupportedMods page", () => {
    it("renders fetched mods in a table", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ mods: [{ name: "Mod A", package_name: "mod_a", path: "/a", modified_attributes: ["melee"] }] }), { status: 200 }))
        render(withRouter(<SupportedModsPage />))
        await waitFor(() => expect(screen.getByText("Mod A")).toBeInTheDocument())
        expect(screen.getByText("mod_a")).toBeInTheDocument()
    })

    it("filters by search query", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    mods: [
                        { name: "Apple Mod", package_name: "apple", path: "/a", modified_attributes: [] },
                        { name: "Banana Mod", package_name: "banana", path: "/b", modified_attributes: [] },
                    ],
                }),
                { status: 200 }
            )
        )
        render(withRouter(<SupportedModsPage />))
        await waitFor(() => expect(screen.getByText("Apple Mod")).toBeInTheDocument())
        const search = screen.getByPlaceholderText(/search/i)
        await userEvent.type(search, "banana")
        expect(screen.queryByText("Apple Mod")).not.toBeInTheDocument()
        expect(screen.getByText("Banana Mod")).toBeInTheDocument()
    })

    it("shows RegistryErrorBanner on 503", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "helper_scripts_path not configured" }), { status: 503 }))
        render(withRouter(<SupportedModsPage />))
        await waitFor(() => expect(screen.getByText(/Helper scripts not configured/i)).toBeInTheDocument())
    })
})

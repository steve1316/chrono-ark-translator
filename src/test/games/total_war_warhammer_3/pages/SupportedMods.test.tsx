import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import SupportedModsPage from "../../../../games/total_war_warhammer_3/pages/SupportedMods"
import type { ValidationIssue } from "../../../../games/total_war_warhammer_3/api"

vi.mock("../../../../games/total_war_warhammer_3/hooks/useValidation", () => ({
    useValidation: vi.fn(),
}))

import { useValidation } from "../../../../games/total_war_warhammer_3/hooks/useValidation"

afterEach(() => {
    vi.restoreAllMocks()
    vi.resetAllMocks()
})

function defaultHook(overrides: Partial<{ issues: ValidationIssue[] | null; loading: boolean; error: unknown }> = {}) {
    vi.mocked(useValidation).mockReturnValue({
        issues: overrides.issues ?? [],
        loading: overrides.loading ?? false,
        error: (overrides.error ?? null) as never,
        refresh: vi.fn(),
    })
}

function withRouter(ui: React.ReactNode) {
    return <MemoryRouter>{ui}</MemoryRouter>
}

describe("SupportedMods page", () => {
    it("renders fetched mods as a card grid", async () => {
        defaultHook()
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ mods: [{ name: "Mod A", package_name: "mod_a", path: "/a", modified_attributes: ["melee"] }] }), { status: 200 }))
        render(withRouter(<SupportedModsPage />))
        await waitFor(() => expect(screen.getByText("Mod A")).toBeInTheDocument())
        expect(screen.getByText("mod_a")).toBeInTheDocument()
    })

    it("filters by search query", async () => {
        defaultHook()
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
        defaultHook()
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "helper_scripts_path not configured" }), { status: 503 }))
        render(withRouter(<SupportedModsPage />))
        await waitFor(() => expect(screen.getByText(/Helper scripts not configured/i)).toBeInTheDocument())
    })

    it("renders a ValidationBadge in the Status cell when useValidation reports issues for that mod", async () => {
        defaultHook({
            issues: [
                {
                    kind: "missing_mod_path",
                    severity: "error",
                    mod_package_name: "mod_a",
                    mod_name: "Mod A",
                    target: "/fake/a.pack",
                    message: "path '/fake/a.pack' does not exist on disk",
                },
            ],
        })
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ mods: [{ name: "Mod A", package_name: "mod_a", path: "/fake/a.pack", modified_attributes: [] }] }), { status: 200 })
        )
        render(withRouter(<SupportedModsPage />))
        await waitFor(() => expect(screen.getByText("Mod A")).toBeInTheDocument())
        expect(screen.getByLabelText(/1 validation issue/)).toBeInTheDocument()
    })

    it("renders no badge when there are no issues for a given mod", async () => {
        defaultHook({ issues: [] })
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ mods: [{ name: "Clean Mod", package_name: "clean", path: "/c", modified_attributes: [] }] }), { status: 200 }))
        render(withRouter(<SupportedModsPage />))
        await waitFor(() => expect(screen.getByText("Clean Mod")).toBeInTheDocument())
        expect(screen.queryByLabelText(/validation issue/)).not.toBeInTheDocument()
    })
})

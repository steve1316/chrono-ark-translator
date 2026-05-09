import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../../games/total_war_warhammer_3/api", async () => {
    const actual = await vi.importActual<typeof import("../../../../games/total_war_warhammer_3/api")>("../../../../games/total_war_warhammer_3/api")
    return {
        ...actual,
        fetchValidation: vi.fn(),
    }
})

import ValidatePage from "../../../../games/total_war_warhammer_3/pages/Validate"
import { fetchValidation, RegistryError } from "../../../../games/total_war_warhammer_3/api"
import { _resetUseValidationForTests } from "../../../../games/total_war_warhammer_3/hooks/useValidation"

afterEach(() => {
    _resetUseValidationForTests()
    vi.restoreAllMocks()
})

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

describe("ValidatePage", () => {
    it("renders empty state when no issues", async () => {
        vi.mocked(fetchValidation).mockResolvedValue([])
        render(wrap(<ValidatePage />))
        await waitFor(() => expect(screen.getByText(/all references resolve/i)).toBeInTheDocument())
    })

    it("renders grouped sections for each issue kind", async () => {
        vi.mocked(fetchValidation).mockResolvedValue([
            {
                kind: "missing_effect_category",
                severity: "error",
                mod_package_name: "mod_a.pack",
                mod_name: "Mod A",
                target: "melee_general",
                message: "Effect category 'melee_general' not found in SUPPORTED_EFFECTS.",
            },
            {
                kind: "missing_mod_path",
                severity: "error",
                mod_package_name: "mod_b.pack",
                mod_name: "Mod B",
                target: "/fake/mod_b.pack",
                message: "Mod path '/fake/mod_b.pack' does not exist on disk.",
            },
        ])
        render(wrap(<ValidatePage />))
        await waitFor(() => expect(screen.getByText(/missing effect categories/i)).toBeInTheDocument())
        expect(screen.getByText(/missing mod paths/i)).toBeInTheDocument()
    })

    it("renders RegistryErrorBanner on 503", async () => {
        vi.mocked(fetchValidation).mockRejectedValue(new RegistryError(503, "helper_scripts_path not configured", null))
        render(wrap(<ValidatePage />))
        await waitFor(() => expect(screen.getByText(/helper scripts not configured/i)).toBeInTheDocument())
    })

    it("manual Refresh triggers an out-of-band fetch", async () => {
        const issue = {
            kind: "missing_mod_path" as const,
            severity: "error" as const,
            mod_package_name: "mod_c.pack",
            mod_name: "Mod C",
            target: "/fake/mod_c.pack",
            message: "Mod path '/fake/mod_c.pack' does not exist on disk.",
        }
        vi.mocked(fetchValidation).mockResolvedValueOnce([]).mockResolvedValue([issue])
        render(wrap(<ValidatePage />))
        await waitFor(() => expect(screen.getByText(/all references resolve/i)).toBeInTheDocument())
        const user = userEvent.setup()
        await user.click(screen.getByRole("button", { name: /refresh/i }))
        await waitFor(() => expect(vi.mocked(fetchValidation).mock.calls.length).toBeGreaterThan(1))
        await waitFor(() => expect(screen.getByText("Mod C")).toBeInTheDocument())
    })
})

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import UpdateWidget from "../../../../games/total_war_warhammer_3/components/UpdateWidget"
import { RegistryError, type UpdateReport } from "../../../../games/total_war_warhammer_3/api"

vi.mock("../../../../games/total_war_warhammer_3/hooks/useUpdates", () => ({
    useUpdates: vi.fn(),
    _resetUseUpdatesForTests: vi.fn(),
}))

import { useUpdates } from "../../../../games/total_war_warhammer_3/hooks/useUpdates"

afterEach(() => {
    vi.restoreAllMocks()
    vi.resetAllMocks()
})

function defaultHook(
    overrides: Partial<{
        report: UpdateReport | null
        loading: boolean
        error: RegistryError | null
        sync: () => Promise<void>
    }> = {}
) {
    vi.mocked(useUpdates).mockReturnValue({
        report: overrides.report ?? null,
        loading: overrides.loading ?? false,
        error: (overrides.error ?? null) as never,
        refresh: vi.fn(),
        sync: overrides.sync ?? vi.fn(),
    })
}

function withRouter(ui: React.ReactNode) {
    return <MemoryRouter>{ui}</MemoryRouter>
}

describe("UpdateWidget", () => {
    it("renders empty state when no stale mods", () => {
        defaultHook({
            report: { stale: [], baseline_exists: true, baseline_path: "/x", total_known: 200 },
        })
        render(withRouter(<UpdateWidget />))
        expect(screen.getByText("All mods up to date")).toBeInTheDocument()
    })

    it("renders first-run banner when baseline_exists is false", () => {
        defaultHook({
            report: { stale: [], baseline_exists: false, baseline_path: "/x", total_known: 200 },
        })
        render(withRouter(<UpdateWidget />))
        expect(screen.getByText(/First-run baseline saved/i)).toBeInTheDocument()
    })

    it("renders stale list with humanized delta", () => {
        defaultHook({
            report: {
                stale: [{ package_name: "my_mod", mod_name: "My Mod", path: "/mods/my_mod.pack", current_mtime: 1000, baseline_mtime: 800, delta_seconds: 7200 }],
                baseline_exists: true,
                baseline_path: "/x",
                total_known: 200,
            },
        })
        render(withRouter(<UpdateWidget />))
        expect(screen.getByText("My Mod")).toBeInTheDocument()
        expect(screen.getByText(/2h ago/)).toBeInTheDocument()
    })

    it("renders 'just now' for negative delta (clock skew or immediate update)", () => {
        defaultHook({
            report: {
                stale: [{ package_name: "my_mod", mod_name: "My Mod", path: "/mods/my_mod.pack", current_mtime: 1000, baseline_mtime: 1001, delta_seconds: -1 }],
                baseline_exists: true,
                baseline_path: "/x",
                total_known: 200,
            },
        })
        render(withRouter(<UpdateWidget />))
        expect(screen.getByText(/just now/i)).toBeInTheDocument()
    })

    it("Mark all as synced button calls sync and shows Syncing... while pending", async () => {
        const sync = vi.fn().mockImplementation(() => new Promise<void>(() => {}))
        defaultHook({ report: { stale: [], baseline_exists: true, baseline_path: "/x", total_known: 200 }, sync })
        render(withRouter(<UpdateWidget />))
        const btn = screen.getByRole("button", { name: "Mark all as synced" })
        await userEvent.click(btn)
        expect(sync).toHaveBeenCalledOnce()
        expect(screen.getByRole("button", { name: "Syncing..." })).toBeDisabled()
    })

    it("renders RegistryErrorBanner on 503 error", () => {
        defaultHook({ error: new RegistryError(503, "helper_scripts_path not configured", null) })
        render(withRouter(<UpdateWidget />))
        expect(screen.getByText(/Helper scripts not configured/i)).toBeInTheDocument()
    })
})

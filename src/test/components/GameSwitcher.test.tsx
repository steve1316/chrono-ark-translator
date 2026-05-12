import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import GameSwitcher from "../../components/GameSwitcher"

const GAMES = [
    { game_id: "chrono_ark", display_name: "Chrono Ark", icon: "", capabilities: [] },
    { game_id: "total_war_warhammer_3", display_name: "Warhammer III", icon: "", capabilities: [] },
]

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = String(input)
        if (url.endsWith("/games")) {
            return Promise.resolve(new Response(JSON.stringify(GAMES), { status: 200 }))
        }
        if (url.endsWith("/settings")) {
            return Promise.resolve(new Response("", { status: 200 }))
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
})

afterEach(() => vi.restoreAllMocks())

describe("GameSwitcher", () => {
    it("renders the active game's display_name on the trigger button", async () => {
        render(wrap(<GameSwitcher activeGameId="chrono_ark" onChange={vi.fn()} />))
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        expect(trigger).toBeInTheDocument()
    })

    it("opens the menu when the trigger is clicked", async () => {
        render(wrap(<GameSwitcher activeGameId="chrono_ark" onChange={vi.fn()} />))
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        await userEvent.setup().click(trigger)
        expect(screen.getByRole("listbox")).toBeInTheDocument()
        expect(screen.getAllByRole("option")).toHaveLength(2)
        expect(screen.getByRole("option", { name: /Warhammer III/i })).toBeInTheDocument()
    })

    it("closes the menu when the trigger is clicked again", async () => {
        render(wrap(<GameSwitcher activeGameId="chrono_ark" onChange={vi.fn()} />))
        const user = userEvent.setup()
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        await user.click(trigger)
        expect(screen.getByRole("listbox")).toBeInTheDocument()
        await user.click(trigger)
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })

    it("closes the menu and triggers the settings POST when an option is clicked", async () => {
        const onChange = vi.fn()
        render(wrap(<GameSwitcher activeGameId="chrono_ark" onChange={onChange} />))
        const user = userEvent.setup()
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        await user.click(trigger)
        const wh3 = screen.getByRole("option", { name: /Warhammer III/i })
        await user.click(wh3)
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
        const calls = vi.mocked(globalThis.fetch).mock.calls
        const settingsCall = calls.find(([url]) => String(url).endsWith("/settings"))
        expect(settingsCall).toBeDefined()
        expect((settingsCall![1] as RequestInit).method).toBe("POST")
        expect((settingsCall![1] as RequestInit).body).toContain("total_war_warhammer_3")
        expect(onChange).toHaveBeenCalledWith("total_war_warhammer_3")
    })

    it("does not POST when the active option is clicked", async () => {
        const onChange = vi.fn()
        render(wrap(<GameSwitcher activeGameId="chrono_ark" onChange={onChange} />))
        const user = userEvent.setup()
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        await user.click(trigger)
        const activeOption = screen.getByRole("option", { name: /Chrono Ark/i })
        await user.click(activeOption)
        expect(onChange).not.toHaveBeenCalled()
        const calls = vi.mocked(globalThis.fetch).mock.calls
        const settingsCall = calls.find(([url]) => String(url).endsWith("/settings"))
        expect(settingsCall).toBeUndefined()
    })

    it("closes the menu on mousedown outside the wrapper", async () => {
        const Wrapper = () => (
            <>
                <div data-testid="outside">Outside</div>
                <GameSwitcher activeGameId="chrono_ark" onChange={vi.fn()} />
            </>
        )
        render(wrap(<Wrapper />))
        const user = userEvent.setup()
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        await user.click(trigger)
        expect(screen.getByRole("listbox")).toBeInTheDocument()
        const outside = screen.getByTestId("outside")
        await user.click(outside)
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })

    it("closes the menu when Escape is pressed", async () => {
        render(wrap(<GameSwitcher activeGameId="chrono_ark" onChange={vi.fn()} />))
        const user = userEvent.setup()
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        await user.click(trigger)
        expect(screen.getByRole("listbox")).toBeInTheDocument()
        await user.keyboard("{Escape}")
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })

    it("marks the active option with aria-selected=true", async () => {
        render(wrap(<GameSwitcher activeGameId="chrono_ark" onChange={vi.fn()} />))
        const user = userEvent.setup()
        const trigger = await screen.findByRole("button", { name: /Chrono Ark/i })
        await user.click(trigger)
        const activeOption = screen.getByRole("option", { name: /Chrono Ark/i })
        const inactiveOption = screen.getByRole("option", { name: /Warhammer III/i })
        expect(activeOption).toHaveAttribute("aria-selected", "true")
        expect(inactiveOption).toHaveAttribute("aria-selected", "false")
    })
})

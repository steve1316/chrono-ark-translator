import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import GlossarySuggestionModal from "../../components/GlossarySuggestionModal"
import type { TermSuggestion } from "../../shared_types"

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
})

const SUGGESTIONS: TermSuggestion[] = [{ english: "Roland", source: "롤랑", source_lang: "Korean", category: "characters", reason: "recurring name" }]

describe("GlossarySuggestionModal", () => {
    it("routes accept calls through the provided gameId", async () => {
        render(<GlossarySuggestionModal gameId="total_war_warhammer_3" modId="m1" suggestions={SUGGESTIONS} onClose={vi.fn()} onUpdated={vi.fn()} />)
        fireEvent.click(screen.getByRole("button", { name: /Accept All/ }))
        await waitFor(() => expect(mockFetch).toHaveBeenCalled())
        const acceptCall = mockFetch.mock.calls.find((call) => typeof call[0] === "string" && call[0].includes("/glossary/suggestions/accept"))
        expect(acceptCall).toBeTruthy()
        expect(String(acceptCall![0])).toContain("/games/total_war_warhammer_3/mods/m1/glossary/suggestions/accept")
    })
})

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ModContextModal from "../../../../games/total_war_warhammer_3/components/ModContextModal"
import type { WH3ModContext } from "../../../../shared_types"

const CTX: WH3ModContext = { source_game: "WH3", character_name: "Zerooz", background: "blue fire", source_language_override: null, target_language_override: null }

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(CTX), { status: 200 }))
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("ModContextModal", () => {
    it("renders the three field labels", async () => {
        render(<ModContextModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => expect(screen.getByLabelText(/Source game/i)).toBeInTheDocument())
        expect(screen.getByLabelText(/Character name/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Background/i)).toBeInTheDocument()
    })

    it("populates inputs from the fetched context", async () => {
        render(<ModContextModal workshopId="123" onClose={vi.fn()} />)
        await waitFor(() => expect(screen.getByLabelText(/Source game/i)).toHaveValue("WH3"))
        expect(screen.getByLabelText(/Character name/i)).toHaveValue("Zerooz")
        expect(screen.getByLabelText(/Background/i)).toHaveValue("blue fire")
    })

    it("calls onClose when the backdrop is clicked", async () => {
        const onClose = vi.fn()
        const { container } = render(<ModContextModal workshopId="123" onClose={onClose} />)
        await waitFor(() => screen.getByLabelText(/Source game/i))
        const backdrop = container.firstElementChild as HTMLElement
        fireEvent.click(backdrop)
        expect(onClose).toHaveBeenCalled()
    })

    it("PUTs the context on Save and closes", async () => {
        const onClose = vi.fn()
        const fetchSpy = vi.spyOn(globalThis, "fetch")
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(CTX), { status: 200 })) // GET
        fetchSpy.mockResolvedValueOnce(new Response("null", { status: 200 })) // PUT
        render(<ModContextModal workshopId="123" onClose={onClose} />)
        await waitFor(() => screen.getByLabelText(/Source game/i))
        fireEvent.change(screen.getByLabelText(/Source game/i), { target: { value: "WH3 Reforged" } })
        fireEvent.click(screen.getByRole("button", { name: /Save/i }))
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        const putCall = fetchSpy.mock.calls[1]
        expect((putCall[1] as RequestInit).method).toBe("PUT")
        expect(JSON.parse((putCall[1] as RequestInit).body as string).source_game).toBe("WH3 Reforged")
    })
})

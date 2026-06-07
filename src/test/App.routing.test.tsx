import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import App from "../App"

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}

afterEach(() => vi.restoreAllMocks())

describe("App game-prefixed routing", () => {
    it("derives the active game from the URL slug, not the persisted setting", async () => {
        // Persisted game is chrono_ark, but the URL is the warhammer_3 slug. The sidebar must follow the URL.
        // Every non-settings endpoint returns [] so each game's dashboard renders an empty grid instead of crashing.
        vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
            const url = String(input)
            if (url.endsWith("/settings")) return Promise.resolve(jsonResponse({ active_game: "chrono_ark" }))
            return Promise.resolve(jsonResponse([]))
        })
        render(
            <MemoryRouter initialEntries={["/warhammer_3/dashboard"]}>
                <App />
            </MemoryRouter>
        )
        // The WH3 sidebar header proves the slug (not the persisted chrono_ark) drove the active game.
        await waitFor(() => expect(screen.getByTestId("sidebar-game-title")).toHaveTextContent("Warhammer III"))
    })
})

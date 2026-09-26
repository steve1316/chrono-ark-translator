import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import SettingsPage from "../../pages/Settings"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const SETTINGS = {
    provider: "claude",
    batch_size: 50,
    anthropic_api_key_set: "sk-...abcd",
    openai_api_key_set: "",
    deepl_api_key_set: "",
    ignored_mods: ["2945863327"],
    tw3_helper_path: "C:/helper",
    steam_username: "someone",
    claude_model: "claude-sonnet-5",
}

/**
 * Answers every request the Settings page makes. `/settings` comes from `settings()`, `overrides` win for their URL suffix, and the rest get
 * small fixed bodies.
 *
 * @param settings Produces the `/settings` response for each call.
 * @param overrides Responses keyed by URL suffix, checked first.
 * @returns The fetch spy.
 */
function mockSettingsFetch(settings: () => Promise<Response> = () => Promise.resolve(json(SETTINGS)), overrides: Record<string, () => Promise<Response>> = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = String(input)
        for (const [suffix, respond] of Object.entries(overrides)) if (url.endsWith(suffix)) return respond()
        if (url.endsWith("/settings")) return settings()
        if (url.endsWith("/models/claude")) return Promise.resolve(json({ models: [{ id: "claude-sonnet-5", label: "Sonnet 5", input_per_mtok: 3, output_per_mtok: 15 }] }))
        if (url.endsWith("/models/openai")) return Promise.resolve(json({ models: [] }))
        if (url.endsWith("/ollama/status")) return Promise.resolve(json({ status: "not_installed", models: [], managed: false }))
        if (url.endsWith("/llamacpp/models")) return Promise.resolve(json({ models: [] }))
        if (url.endsWith("/llamacpp/status")) return Promise.resolve(json({ status: "unknown", installed: false }))
        return Promise.resolve(json({}))
    })
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("SettingsPage", () => {
    it("shows a loading state, then every Claude-provider panel as a static settings panel", async () => {
        mockSettingsFetch()
        render(<SettingsPage />)
        expect(screen.getByText("Loading settings...")).toBeInTheDocument()
        for (const name of ["System Prompt Preview", "Translation Provider", "Model", "API Keys", "Batch Size", "Ignored Mods", "Total War: Warhammer III", "Steam Account"]) {
            const heading = await screen.findByRole("heading", { name })
            expect(heading.closest(".panel.settings-panel")).not.toBeNull()
        }
    })

    it("shows an error with Retry instead of default values when settings fail to load, and Retry loads them", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        let calls = 0
        mockSettingsFetch(() => Promise.resolve(++calls === 1 ? json({ detail: "boom" }, 500) : json(SETTINGS)))
        render(<SettingsPage />)
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load settings")
        expect(screen.queryByRole("button", { name: "Save Settings" })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Retry" }))
        expect(await screen.findByRole("heading", { name: "Translation Provider" })).toBeInTheDocument()
    })
})

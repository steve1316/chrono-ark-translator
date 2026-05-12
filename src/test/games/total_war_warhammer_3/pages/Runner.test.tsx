import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RunnerPage from "../../../../games/total_war_warhammer_3/pages/Runner"
import { _resetUseRunnerLogForTests } from "../../../../games/total_war_warhammer_3/hooks/useRunnerLog"

class FakeEventSource {
    static instances: FakeEventSource[] = []
    url: string
    onmessage: ((evt: MessageEvent) => void) | null = null
    onerror: ((evt: Event) => void) | null = null
    listeners: Record<string, ((evt: MessageEvent) => void)[]> = {}
    closed = false

    constructor(url: string) {
        this.url = url
        FakeEventSource.instances.push(this)
    }

    addEventListener(name: string, handler: (evt: MessageEvent) => void) {
        ;(this.listeners[name] ??= []).push(handler)
    }

    emit(data: string) {
        this.onmessage?.(new MessageEvent("message", { data }))
    }

    emitDone(data: string) {
        for (const h of this.listeners["done"] ?? []) {
            h(new MessageEvent("done", { data }))
        }
    }

    close() {
        this.closed = true
    }
}

beforeEach(() => {
    FakeEventSource.instances = []
    ;(globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource
    _resetUseRunnerLogForTests()
})

afterEach(() => vi.restoreAllMocks())

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

describe("Runner page", () => {
    it("renders 6 script cards in idle state", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(screen.getAllByRole("button", { name: /^run$/i })).toHaveLength(6))
    })

    it("renders descriptions on each card", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(screen.getAllByText(/Regenerate the Dynamic RoR pack/i).length).toBeGreaterThan(0))
    })

    it("starts a run, disables sibling cards, and shows Cancel on the active card", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: "x", script_id: "update", started_at: new Date().toISOString() }), { status: 200 }))
            .mockResolvedValue(new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 0 }), { status: 200 }))
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(screen.getAllByRole("button", { name: /^run$/i })).toHaveLength(6))
        const runButtons = screen.getAllByRole("button", { name: /^run$/i })
        await userEvent.setup().click(runButtons[runButtons.length - 1])
        await waitFor(() => expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument())
        const remainingRunButtons = screen.getAllByRole("button", { name: /^run$/i })
        expect(remainingRunButtons).toHaveLength(5)
        for (const btn of remainingRunButtons) expect(btn).toBeDisabled()
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/run/update"), expect.objectContaining({ method: "POST" }))
    })

    it("appends SSE data lines into the terminal", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 0 }), { status: 200 }),
        )
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
        FakeEventSource.instances[0].emit(JSON.stringify({ line: "hello world", ts: "2026-05-12T00:00:00Z" }))
        await waitFor(() => expect(screen.getByText("hello world")).toBeInTheDocument())
    })

    it("preserves terminal output after a run ends", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 0 }), { status: 200 }),
        )
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
        FakeEventSource.instances[0].emit(JSON.stringify({ line: "prior run line", ts: "2026-05-12T00:00:00Z" }))
        FakeEventSource.instances[0].emitDone(JSON.stringify({ exit_code: 0, duration_seconds: 3 }))
        await waitFor(() => expect(screen.getByText("prior run line")).toBeInTheDocument())
        expect(screen.getByText(/exited with code 0 in 3s/i)).toBeInTheDocument()
    })

    it("calls DELETE /run on cancel", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 0 }), { status: 200 }))
        render(wrap(<RunnerPage />))
        await waitFor(() => screen.getByRole("button", { name: /cancel/i }))
        await userEvent.setup().click(screen.getByRole("button", { name: /cancel/i }))
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/run"), expect.objectContaining({ method: "DELETE" })))
    })

    it("re-attaches the SSE stream when mounted while a run is already in progress", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 5 }), { status: 200 }),
        )
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
    })
})

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RunnerPage from "../../../../games/total_war_warhammer_3/pages/Runner"

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
})

afterEach(() => vi.restoreAllMocks())

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>

describe("Runner page", () => {
    it("renders 6 buttons in idle state", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(6))
    })

    it("starts a run and switches to log view on click", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            // initial GET /run -> idle
            .mockResolvedValueOnce(new Response(JSON.stringify({ status: "idle" }), { status: 200 }))
            // POST /run/<id> -> 200 with run handle
            .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: "x", script_id: "update", started_at: new Date().toISOString() }), { status: 200 }))
            // subsequent GET /run polls
            .mockResolvedValue(new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 0 }), { status: 200 }))
        render(wrap(<RunnerPage />))
        await waitFor(() => screen.getAllByRole("button"))
        await userEvent.click(screen.getByRole("button", { name: /^update$/i }))
        await waitFor(() => expect(screen.getByText(/cancel/i)).toBeInTheDocument())
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/run/update"), expect.objectContaining({ method: "POST" }))
    })

    it("renders SSE log lines", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 0 }), { status: 200 })
        )
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
        FakeEventSource.instances[0].emit(JSON.stringify({ line: "hello world", ts: "2026-05-08T16:00:00Z" }))
        await waitFor(() => expect(screen.getByText(/hello world/)).toBeInTheDocument())
    })

    it("calls DELETE /run on cancel", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 0 }), { status: 200 }))
        render(wrap(<RunnerPage />))
        await waitFor(() => screen.getByText(/cancel/i))
        await userEvent.click(screen.getByText(/cancel/i))
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/run"), expect.objectContaining({ method: "DELETE" })))
    })

    it("re-attaches the SSE stream when mounted while a run is already in progress", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ status: "running", run_id: "x", script_id: "update", started_at: new Date().toISOString(), lines_emitted: 5 }), { status: 200 })
        )
        render(wrap(<RunnerPage />))
        await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
    })
})

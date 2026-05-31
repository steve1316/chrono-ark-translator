import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PublishAllDialog from "../../../../games/total_war_warhammer_3/components/PublishAllDialog"

/**
 * Controllable EventSource stand-in. Captures the most recent instance so tests can fire named events into the dialog
 * exactly as the backend SSE stream would.
 */
class MockEventSource {
    static instances: MockEventSource[] = []
    url: string
    listeners: Record<string, ((evt: MessageEvent) => void)[]> = {}
    onmessage: ((evt: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    readyState = 1

    constructor(url: string) {
        this.url = url
        MockEventSource.instances.push(this)
    }

    addEventListener(type: string, fn: (evt: MessageEvent) => void) {
        ;(this.listeners[type] ||= []).push(fn)
    }

    removeEventListener(type: string, fn: (evt: MessageEvent) => void) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn)
    }

    fire(type: string, data: unknown) {
        const evt = { data: JSON.stringify(data) } as MessageEvent
        if (type === "message" && this.onmessage) this.onmessage(evt)
        for (const fn of this.listeners[type] ?? []) fn(evt)
    }

    close() {
        this.readyState = 2
    }
}

const ORIGINAL_EVENT_SOURCE = (globalThis as unknown as { EventSource: typeof EventSource }).EventSource

beforeEach(() => {
    MockEventSource.instances.length = 0
    ;(globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
            JSON.stringify({
                batch_id: "batch-1",
                started_at: "2026-05-27T00:00:00Z",
                queued: 2,
                skipped: [],
            }),
            { status: 200 }
        )
    )
})

afterEach(() => {
    ;(globalThis as unknown as { EventSource: typeof EventSource }).EventSource = ORIGINAL_EVENT_SOURCE
    vi.restoreAllMocks()
})

const ELIGIBLE_PACKS = [
    { title: "Mod Alpha", workshopId: "111" },
    { title: "Mod Beta", workshopId: "222" },
]

const PACKS_WITH_SKIPPED = [
    { title: "Mod Alpha", workshopId: "111" },
    { title: "Mod Beta", workshopId: "" },
]

describe("PublishAllDialog", () => {
    it("disables the Publish All button when the changenote is empty", () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        const btn = screen.getByRole("button", { name: /publish all/i })
        expect(btn).toBeDisabled()
    })

    it("enables Publish All once the changenote has non-whitespace content", () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        const textarea = screen.getByRole("textbox")
        fireEvent.change(textarea, { target: { value: "shipping notes" } })
        expect(screen.getByRole("button", { name: /publish all/i })).not.toBeDisabled()
    })

    it("lists eligible mods and tags pre-skipped entries with no workshopId", () => {
        render(<PublishAllDialog packs={PACKS_WITH_SKIPPED} onClose={() => {}} />)
        expect(screen.getByText(/Mod Alpha/)).toBeInTheDocument()
        expect(screen.getByText(/Mod Beta/)).toBeInTheDocument()
        // The empty-workshopId entry should carry a skipped badge.
        expect(screen.getByText(/skipped/i)).toBeInTheDocument()
        // Header should reflect the eligible count (1 out of 2).
        expect(screen.getByText(/1 mod/i)).toBeInTheDocument()
    })

    it("POSTs to /packs/publish-all and opens an EventSource on the returned batch_id", async () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "release v2" } })
        fireEvent.click(screen.getByRole("button", { name: /publish all/i }))

        await waitFor(() => {
            const [url, init] = (globalThis.fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
            expect(String(url)).toContain("/packs/publish-all")
            expect(init.method).toBe("POST")
            const body = JSON.parse(String(init.body))
            expect(body.changenote).toBe("release v2")
            expect(body.items).toEqual(ELIGIBLE_PACKS.map((p) => ({ workshop_id: p.workshopId, title: p.title })))
        })

        await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
        expect(MockEventSource.instances[0].url).toContain("/packs/publish-all/stream/batch-1")
    })

    it("flips a row from pending to publishing to done as mod_started and mod_finished events arrive", async () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "notes" } })
        fireEvent.click(screen.getByRole("button", { name: /publish all/i }))
        await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
        const es = MockEventSource.instances[0]

        act(() => {
            es.fire("batch_started", { batch_id: "batch-1", total: 2, items: [] })
            es.fire("mod_started", { workshop_id: "111", title: "Mod Alpha", index: 1, total: 2, started_at: "t" })
        })
        expect(screen.getByText(/publishing/i)).toBeInTheDocument()

        act(() => {
            es.fire("log_line", { workshop_id: "111", line: "uploading...", ts: "t" })
        })
        expect(screen.getByText(/uploading.../)).toBeInTheDocument()

        act(() => {
            es.fire("mod_finished", { workshop_id: "111", exit_code: 0, duration_seconds: 1.2, status: "done", error: null })
        })
        // Row should now show a "done" badge for Mod Alpha (look for "done" text near Mod Alpha row).
        const doneBadges = screen.getAllByText(/done/i)
        expect(doneBadges.length).toBeGreaterThan(0)
    })

    it("marks a row failed when mod_finished reports a non-zero exit and still updates the next mod_started", async () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "notes" } })
        fireEvent.click(screen.getByRole("button", { name: /publish all/i }))
        await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
        const es = MockEventSource.instances[0]

        act(() => {
            es.fire("batch_started", { batch_id: "batch-1", total: 2, items: [] })
            es.fire("mod_started", { workshop_id: "111", title: "Mod Alpha", index: 1, total: 2, started_at: "t" })
            es.fire("mod_finished", {
                workshop_id: "111",
                exit_code: 1,
                duration_seconds: 0.5,
                status: "failed",
                error: "SteamCMD exit code 1",
            })
        })
        expect(screen.getByText(/failed/i)).toBeInTheDocument()

        act(() => {
            es.fire("mod_started", { workshop_id: "222", title: "Mod Beta", index: 2, total: 2, started_at: "t" })
        })
        // Beta row should now indicate publishing.
        expect(screen.getByText(/publishing/i)).toBeInTheDocument()
    })

    it("renders a checked checkbox for every eligible mod and no checkbox for pre-skipped rows", () => {
        render(<PublishAllDialog packs={PACKS_WITH_SKIPPED} onClose={() => {}} />)
        const checkboxes = screen.getAllByRole("checkbox")
        // One eligible mod (Alpha) -> one checkbox; the empty-workshopId Beta row has no checkbox.
        expect(checkboxes).toHaveLength(1)
        expect(checkboxes[0]).toBeChecked()
    })

    it("excludes deselected mods from the POST body and the count text", async () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        const checkboxes = screen.getAllByRole("checkbox")
        expect(checkboxes).toHaveLength(2)
        fireEvent.click(checkboxes[1])
        // After unchecking Beta the count drops to 1.
        expect(screen.getByText(/1 mod/i)).toBeInTheDocument()

        fireEvent.change(screen.getByRole("textbox"), { target: { value: "notes" } })
        fireEvent.click(screen.getByRole("button", { name: /publish all/i }))
        await waitFor(() => {
            const [, init] = (globalThis.fetch as ReturnType<typeof vi.spyOn>).mock.calls[0] as [string, RequestInit]
            const body = JSON.parse(String(init.body))
            expect(body.items).toEqual([{ workshop_id: "111", title: "Mod Alpha" }])
        })
    })

    it("disables Publish All when every eligible row is deselected", () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "notes" } })
        const checkboxes = screen.getAllByRole("checkbox")
        fireEvent.click(checkboxes[0])
        fireEvent.click(checkboxes[1])
        expect(screen.getByRole("button", { name: /publish all/i })).toBeDisabled()
    })

    it("marks deselected eligible rows as skipped once the batch starts", async () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        const checkboxes = screen.getAllByRole("checkbox")
        fireEvent.click(checkboxes[1])
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "notes" } })
        fireEvent.click(screen.getByRole("button", { name: /publish all/i }))
        await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
        // Beta should now show a skipped badge with the "not selected" reason.
        expect(screen.getByText(/not selected/i)).toBeInTheDocument()
    })

    it("enables Close once batch_done arrives", async () => {
        render(<PublishAllDialog packs={ELIGIBLE_PACKS} onClose={() => {}} />)
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "notes" } })
        fireEvent.click(screen.getByRole("button", { name: /publish all/i }))
        await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
        const es = MockEventSource.instances[0]

        // While running, the Close button is disabled.
        const closeBtn = screen.getByRole("button", { name: /close/i })
        expect(closeBtn).toBeDisabled()

        act(() => {
            es.fire("batch_started", { batch_id: "batch-1", total: 2, items: [] })
            es.fire("batch_done", { batch_id: "batch-1", succeeded: 2, failed: 0, duration_seconds: 3.0 })
        })

        expect(screen.getByRole("button", { name: /close/i })).not.toBeDisabled()
    })
})

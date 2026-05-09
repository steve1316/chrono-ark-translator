import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import CrashCard from "../../../../games/total_war_warhammer_3/components/CrashCard"
import type { CrashSnapshot } from "../../../../games/total_war_warhammer_3/api"

afterEach(() => vi.restoreAllMocks())

function makeSnap(overrides: Partial<CrashSnapshot> = {}): CrashSnapshot {
    return {
        id: "2026-05-09-203045",
        captured_at: "2026-05-09T20:30:45+00:00",
        trigger: "watcher",
        source: "C:\\Users\\x\\AppData\\Roaming\\The Creative Assembly\\Warhammer3",
        files: {
            crash_report: { present: true, file_count: 12, total_bytes: 4_404_019 },
            logs: { present: true, file_count: 8, total_bytes: 1_153_433 },
            "preferences.script.txt": { present: true, total_bytes: 2048 },
        },
        notes: "",
        ...overrides,
    }
}

describe("CrashCard", () => {
    it("renders id, file summary, and notes textarea", () => {
        render(<CrashCard snap={makeSnap()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
        expect(screen.getByText("2026-05-09-203045")).toBeInTheDocument()
        expect(screen.getByText(/crash_report.*12 files/)).toBeInTheDocument()
        expect(screen.getByRole("textbox")).toBeInTheDocument()
    })

    it("calls onDelete when Delete is clicked twice (confirm step)", async () => {
        const onDelete = vi.fn()
        render(<CrashCard snap={makeSnap()} onUpdate={vi.fn()} onDelete={onDelete} />)
        const user = userEvent.setup()
        await user.click(screen.getByRole("button", { name: /^delete$/i }))
        await user.click(screen.getByRole("button", { name: /confirm delete/i }))
        expect(onDelete).toHaveBeenCalledWith("2026-05-09-203045")
    })
})

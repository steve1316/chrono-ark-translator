import { render, screen, fireEvent } from "@testing-library/react"
import { FeedbackBanner } from "../../translation/FeedbackBanner"

describe("FeedbackBanner", () => {
    it("renders the message", () => {
        render(<FeedbackBanner type="success" message="Translated 5 strings." onDismiss={vi.fn()} />)
        expect(screen.getByText("Translated 5 strings.")).toBeInTheDocument()
    })

    it("calls onDismiss when the close button is clicked", () => {
        const onDismiss = vi.fn()
        render(<FeedbackBanner type="error" message="Translation failed" onDismiss={onDismiss} />)
        fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it("uses the success color for success and the error color for error", () => {
        const { rerender } = render(<FeedbackBanner type="success" message="ok" onDismiss={vi.fn()} />)
        expect(screen.getByText("ok").parentElement).toHaveStyle({ color: "rgb(52, 211, 153)" })
        rerender(<FeedbackBanner type="error" message="bad" onDismiss={vi.fn()} />)
        expect(screen.getByText("bad").parentElement).toHaveStyle({ color: "rgb(248, 113, 113)" })
    })
})

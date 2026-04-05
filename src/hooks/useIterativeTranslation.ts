import { useState, useRef, useCallback } from "react"
import { API_BASE } from "../config"
import type { TermSuggestion } from "../shared_types"

/** Descriptor for a single batch, provided by the preview endpoint's `batch_plan`. */
export type BatchDescriptor = {
    source_lang: string
    keys: string[]
    size: number
}

/** Possible phases of the iterative batch translation state machine. */
export type BatchPhase = "idle" | "translating" | "reviewing" | "complete" | "error"

/** Full state exposed by the hook. */
export type BatchState =
    | { phase: "idle" }
    | { phase: "translating"; batchIndex: number; totalBatches: number }
    | { phase: "reviewing"; batchIndex: number; totalBatches: number; suggestions: TermSuggestion[] }
    | { phase: "complete"; totalTranslated: number }
    | { phase: "error"; message: string; completedBatches: number }

/**
 * Hook that manages iterative per-batch translation with glossary review
 * between batches.
 *
 * The frontend drives the loop:
 * 1. Call `startTranslation` with a provider and the batch plan from preview.
 * 2. The hook translates one batch at a time via `POST /api/translate/batch`.
 * 3. After each batch, if suggestions exist and it's not the last batch,
 *    the state transitions to "reviewing" so the user can accept/dismiss terms.
 * 4. Call `continueAfterReview` to proceed to the next batch.
 * 5. Repeat until all batches are done or the user cancels.
 *
 * @param modId - The mod being translated.
 * @param onBatchTranslated - Callback fired after each batch with the new translations.
 */
export function useIterativeTranslation(
    modId: string,
    onBatchTranslated: (translations: Record<string, string>) => void,
) {
    const [state, setState] = useState<BatchState>({ phase: "idle" })
    const [batchTranslations, setBatchTranslations] = useState<Record<string, string>>({})

    const planRef = useRef<BatchDescriptor[]>([])
    const providerRef = useRef<string>("")
    const cancelledRef = useRef(false)
    const totalTranslatedRef = useRef(0)

    const translateBatch = useCallback(
        async (batchIndex: number) => {
            if (cancelledRef.current) return

            const plan = planRef.current
            const batch = plan[batchIndex]
            const totalBatches = plan.length

            setState({ phase: "translating", batchIndex, totalBatches })

            try {
                const res = await fetch(`${API_BASE}/translate/batch`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mod_id: modId,
                        provider: providerRef.current,
                        keys: batch.keys,
                        source_lang: batch.source_lang,
                        is_first_batch: batchIndex === 0,
                    }),
                })

                if (cancelledRef.current) return

                const data = await res.json()
                if (!res.ok) {
                    setState({
                        phase: "error",
                        message: data.detail || "Translation failed",
                        completedBatches: batchIndex,
                    })
                    return
                }

                const newTranslations: Record<string, string> = data.translations || {}
                totalTranslatedRef.current += Object.keys(newTranslations).length

                setBatchTranslations((prev) => ({ ...prev, ...newTranslations }))
                onBatchTranslated(newTranslations)

                const suggestions: TermSuggestion[] = data.suggestions || []
                const isLastBatch = batchIndex >= totalBatches - 1

                if (isLastBatch) {
                    if (suggestions.length > 0) {
                        // Last batch with suggestions: let user review before completing.
                        setState({ phase: "reviewing", batchIndex, totalBatches, suggestions })
                    } else {
                        setState({ phase: "complete", totalTranslated: totalTranslatedRef.current })
                    }
                } else if (suggestions.length > 0) {
                    // Mid-batch with suggestions: pause for review.
                    setState({ phase: "reviewing", batchIndex, totalBatches, suggestions })
                } else {
                    // No suggestions: auto-advance to next batch.
                    translateBatch(batchIndex + 1)
                }
            } catch (err) {
                if (cancelledRef.current) return
                setState({
                    phase: "error",
                    message: err instanceof Error ? err.message : "Translation failed. Could not reach the server.",
                    completedBatches: batchIndex,
                })
            }
        },
        [modId, onBatchTranslated],
    )

    const startTranslation = useCallback(
        (provider: string, batchPlan: BatchDescriptor[]) => {
            planRef.current = batchPlan
            providerRef.current = provider
            cancelledRef.current = false
            totalTranslatedRef.current = 0
            setBatchTranslations({})
            translateBatch(0)
        },
        [translateBatch],
    )

    const continueAfterReview = useCallback(() => {
        const plan = planRef.current
        if (state.phase !== "reviewing") return

        const nextIndex = state.batchIndex + 1
        if (nextIndex >= plan.length) {
            setState({ phase: "complete", totalTranslated: totalTranslatedRef.current })
        } else {
            translateBatch(nextIndex)
        }
    }, [state, translateBatch])

    const cancel = useCallback(() => {
        cancelledRef.current = true
        setState({ phase: "idle" })
    }, [])

    return {
        state,
        startTranslation,
        continueAfterReview,
        cancel,
        batchTranslations,
    }
}

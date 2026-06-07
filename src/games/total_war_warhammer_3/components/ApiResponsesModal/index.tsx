import React, { useEffect, useState } from "react"

import { listApiResponses } from "../../translationApi"
import { ApiResponsesModal as SharedApiResponsesModal, type ApiResponseEntry } from "../../../../translation/ApiResponsesModal"

/** Props for `ApiResponsesModal`. */
interface ApiResponsesModalProps {
    /** Steam Workshop ID of the translation mod whose API responses to show. */
    workshopId: string
    /** Called when the modal is closed. */
    onClose: () => void
}

/**
 * WH3 provider audit-log modal. A thin wrapper: it fetches WH3's api-responses and maps them onto the shared `ApiResponsesModal`.
 * @param workshopId - Steam Workshop ID whose responses to fetch.
 * @param onClose - Called when the modal is closed.
 * @returns The modal element.
 */
const ApiResponsesModal: React.FC<ApiResponsesModalProps> = ({ workshopId, onClose }) => {
    const [entries, setEntries] = useState<ApiResponseEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const data = await listApiResponses(workshopId)
                if (!cancelled) {
                    setEntries(
                        data.map((e, i) => ({
                            id: `${e.timestamp}-${i}`,
                            kind: e.kind,
                            timestamp: e.timestamp,
                            model: e.model,
                            inputTokens: e.input_tokens,
                            outputTokens: e.output_tokens,
                            costUsd: e.cost_usd,
                            keysOrInputs: e.keys_or_inputs,
                            rawText: e.raw_response,
                        }))
                    )
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workshopId])

    return <SharedApiResponsesModal entries={entries} loading={loading} error={error} onClose={onClose} />
}

export default ApiResponsesModal

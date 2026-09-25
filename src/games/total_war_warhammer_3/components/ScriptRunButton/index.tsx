import { useNavigate } from "react-router-dom"
import { useGameSlug } from "../../../useGameSlug"
import { startRun } from "../../api"
import { kickPoll, useCurrentRun } from "../../hooks/useCurrentRun"

/** Props for `ScriptRunButton`. */
interface Props {
    /** Script id from the backend `SCRIPT_REGISTRY`. */
    scriptId: string
    /** Display label. */
    label: string
    /** Optional inline style overrides applied to the rendered button. */
    style?: React.CSSProperties
    /** Extra classes appended to the button (e.g. `btn-compact`). */
    className?: string
}

/**
 * Button that posts to `/run/{scriptId}` and navigates to the Runner page.
 * Disabled while another run is in flight.
 *
 * @param scriptId Backend script id to run.
 * @param label Button label shown when idle.
 * @param style Optional inline style overrides for the button element.
 * @param className Extra classes appended after `btn btn-primary`.
 * @returns A `button` element wired up to start a TW3 script run.
 */
export default function ScriptRunButton({ scriptId, label, style, className }: Props) {
    const run = useCurrentRun()
    const navigate = useNavigate()
    const slug = useGameSlug()
    const disabled = run.status === "running"

    const handleClick = async () => {
        try {
            await startRun(scriptId)
            navigate(`/${slug}/runner`)
        } catch (err) {
            console.error("Failed to start run", err)
        } finally {
            kickPoll()
        }
    }

    return (
        <button className={`btn btn-primary${className ? ` ${className}` : ""}`} disabled={disabled} onClick={handleClick} style={style}>
            {disabled ? "Run in progress..." : label}
        </button>
    )
}

import { useNavigate } from "react-router-dom"
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
}

/**
 * Button that posts to `/run/{scriptId}` and navigates to the Runner page.
 * Disabled while another run is in flight.
 *
 * @param scriptId Backend script id to run.
 * @param label Button label shown when idle.
 * @param style Optional inline style overrides for the button element.
 * @returns A `button` element wired up to start a TW3 script run.
 */
export default function ScriptRunButton({ scriptId, label, style }: Props) {
    const run = useCurrentRun()
    const navigate = useNavigate()
    const disabled = run.status === "running"

    const handleClick = async () => {
        try {
            await startRun(scriptId)
            navigate("/runner")
        } catch (err) {
            console.error("Failed to start run", err)
        } finally {
            kickPoll()
        }
    }

    return (
        <button className="btn btn-primary" disabled={disabled} onClick={handleClick} style={style}>
            {disabled ? "Run in progress..." : label}
        </button>
    )
}

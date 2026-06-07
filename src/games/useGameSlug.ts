import { useParams } from "react-router-dom"

/**
 * Return the active game's URL slug from the `:gameSlug` route segment. Pages and components rendered under `/:gameSlug/*` use this to build
 * game-prefixed navigation targets (e.g. `/${slug}/translation/${id}`). Returns "" only when rendered outside a game subtree.
 * @returns The current game slug, or "" when none.
 */
export function useGameSlug(): string {
    return useParams<{ gameSlug: string }>().gameSlug ?? ""
}

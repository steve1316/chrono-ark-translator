import type { ReactElement } from "react"

export interface GameNavEntry {
    to: string
    label: string
    icon: ReactElement
}

export interface GameManifest {
    id: string
    /** URL slug for game-prefixed routes (e.g. `warhammer_3` for id `total_war_warhammer_3`). */
    slug: string
    displayName: string
    icon: string
    nav: GameNavEntry[]
    routes: () => ReactElement
}

const _registry = new Map<string, GameManifest>()

export function registerGame(manifest: GameManifest): void {
    _registry.set(manifest.id, manifest)
}

export function getGame(id: string): GameManifest | undefined {
    return _registry.get(id)
}

export function listGames(): GameManifest[] {
    return [..._registry.values()]
}

export function getGameBySlug(slug: string): GameManifest | undefined {
    return [..._registry.values()].find((g) => g.slug === slug)
}

export function idForSlug(slug: string): string | undefined {
    return getGameBySlug(slug)?.id
}

export function slugForId(id: string): string | undefined {
    return _registry.get(id)?.slug
}

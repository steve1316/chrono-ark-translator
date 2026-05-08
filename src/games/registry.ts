import type { ReactElement } from "react"

export interface GameNavEntry {
    to: string
    label: string
    icon: ReactElement
}

export interface GameManifest {
    id: string
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

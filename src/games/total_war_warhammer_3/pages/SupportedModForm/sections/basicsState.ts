/** State held by the Basics section. */
export interface BasicsState {
    /** Display name. */
    name: string
    /** Stable identifier (.pack filename). */
    package_name: string
    /** Numeric Steam Workshop item id. */
    workshop_id: string
    /** When true, the user is supplying `path` directly (advanced). */
    custom_path: boolean
    /** Raw path; only meaningful when `custom_path` is true. */
    path: string
}

/** Default empty state for a fresh form. */
export const emptyBasicsState: BasicsState = {
    name: "",
    package_name: "",
    workshop_id: "",
    custom_path: false,
    path: "",
}

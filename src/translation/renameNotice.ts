/**
 * Describe how many translations a glossary rename updated, in the same words as the suggestion review.
 * @param english - The new English.
 * @param replaced - How many translations changed.
 * @returns The notice text.
 */
export function renameNotice(english: string, replaced: number): string {
    return `${english}: updated ${replaced} translation${replaced === 1 ? "" : "s"}.`
}

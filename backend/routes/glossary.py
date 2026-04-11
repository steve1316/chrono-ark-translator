"""Glossary endpoints for the REST API."""

from fastapi import APIRouter

from backend.data.glossary_manager import (
    add_glossary_term,
    load_glossary,
    load_mod_glossary,
    merge_glossaries,
    save_glossary,
    save_mod_glossary,
)
from backend.data.history_manager import create_backup
from backend.data.suggestion_manager import (
    load_suggestions,
    remove_suggestions,
    save_suggestions,
)
from backend.data.translation_store import load_translations, replace_in_translations
from backend.routes.models import (
    GlossaryReplacePreview,
    GlossaryTerm,
    ModGlossaryTerm,
    SuggestionAction,
)

router = APIRouter(prefix="/api")


@router.get("/glossary")
async def get_glossary():
    """Get all terminology glossary entries.

    Returns:
        The full global glossary dict as stored on disk, containing a
        `terms` mapping of English terms to their source-language
        mappings.
    """
    glossary = load_glossary()
    return glossary


@router.post("/glossary")
async def update_glossary(term: GlossaryTerm):
    """Add or update a glossary term.

    Args:
        term: The glossary term to add, containing the source text and its
            English translation.

    Returns:
        A dict with `{"status": "success"}`.
    """
    glossary = load_glossary()
    add_glossary_term(glossary, term.english, {"custom": term.source})
    save_glossary(glossary)
    return {"status": "success"}


@router.get("/mods/{mod_id}/glossary")
async def get_mod_glossary(mod_id: str):
    """Get a mod's glossary terms.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        The mod-specific glossary dict containing a `terms` mapping.
    """
    return load_mod_glossary(mod_id)


@router.post("/mods/{mod_id}/glossary")
async def update_mod_glossary(mod_id: str, term: ModGlossaryTerm):
    """Add or update a term in a mod's glossary.

    Args:
        mod_id: The workshop identifier of the mod.
        term: The glossary term containing the English text, per-language
            source mappings, and category.

    Returns:
        A dict with `{"status": "success"}`.
    """
    glossary = load_mod_glossary(mod_id)
    add_glossary_term(glossary, term.english, term.source_mappings, term.category)
    save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


@router.delete("/mods/{mod_id}/glossary/{term}")
async def delete_mod_glossary_term(mod_id: str, term: str):
    """Remove a term from a mod's glossary.

    If the term does not exist, the operation is a no-op.

    Args:
        mod_id: The workshop identifier of the mod.
        term: The English term string to delete.

    Returns:
        A dict with `{"status": "success"}`.
    """
    glossary = load_mod_glossary(mod_id)
    if term in glossary.get("terms", {}):
        del glossary["terms"][term]
        save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


@router.post("/mods/{mod_id}/glossary/replace-preview")
async def glossary_replace_preview(mod_id: str, req: GlossaryReplacePreview):
    """Preview which translations would be affected by a glossary term replacement.

    Args:
        mod_id: The workshop identifier of the mod.
        req: The old and new English terms.

    Returns:
        A dict with `affected` (list of dicts with key, old_text, new_text).
    """
    translations = load_translations(mod_id)
    if not translations:
        return {"affected": []}

    affected = []
    for key, english in translations.items():
        if req.old_english in english:
            new_text = english.replace(req.old_english, req.new_english)
            if new_text != english:
                affected.append({"key": key, "old_text": english, "new_text": new_text})

    return {"affected": affected}


@router.post("/mods/{mod_id}/glossary/replace-apply")
async def glossary_replace_apply(mod_id: str, req: GlossaryReplacePreview):
    """Apply a glossary term replacement across all translations.

    Args:
        mod_id: The workshop identifier of the mod.
        req: The old and new English terms.

    Returns:
        A dict with `status` and the count of `replaced` translations.
    """
    # Back up before applying replacements.
    create_backup(mod_id, f"Before replacing '{req.old_english}' with '{req.new_english}'")

    replaced = replace_in_translations(mod_id, req.old_english, req.new_english)

    return {"status": "success", "replaced": replaced}


@router.get("/mods/{mod_id}/glossary/merged")
async def get_merged_glossary(mod_id: str):
    """Get the merged base + mod glossary.

    Combines the global glossary with the mod-specific glossary, with
    mod-level terms taking precedence on conflicts.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        The merged glossary dict ready for use in translation prompts.
    """
    base = load_glossary()
    mod = load_mod_glossary(mod_id)
    return merge_glossaries(base, mod)


@router.get("/mods/{mod_id}/glossary/suggestions")
async def get_suggestions(mod_id: str):
    """Get pending glossary term suggestions.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A list of suggestion dicts, each containing `english`,
        `source`, `source_lang`, and `category` fields.
    """
    return load_suggestions(mod_id)


@router.post("/mods/{mod_id}/glossary/suggestions/accept")
async def accept_suggestions(mod_id: str, action: SuggestionAction):
    """Accept suggestions into the mod glossary.

    Moves the specified (or all) pending suggestions into the mod's
    glossary and removes them from the suggestions list.

    Args:
        mod_id: The workshop identifier of the mod.
        action: Specifies which suggestions to accept, either by listing
            specific terms or setting `all` to `True`.

    Returns:
        A dict with `status` and the count of `accepted` terms.
    """
    suggestions = load_suggestions(mod_id)
    glossary = load_mod_glossary(mod_id)

    terms_to_accept = {s["english"] for s in suggestions} if action.all else set(action.terms)

    for suggestion in suggestions:
        if suggestion.get("english") in terms_to_accept:
            add_glossary_term(
                glossary,
                suggestion["english"],
                {suggestion.get("source_lang", "unknown"): suggestion.get("source", "")},
                suggestion.get("category", "custom"),
            )

    save_mod_glossary(mod_id, glossary)
    remove_suggestions(mod_id, list(terms_to_accept))
    return {"status": "success", "accepted": len(terms_to_accept)}


@router.post("/mods/{mod_id}/glossary/suggestions/dismiss")
async def dismiss_suggestions(mod_id: str, action: SuggestionAction):
    """Dismiss (remove) suggestions without adding to glossary.

    Args:
        mod_id: The workshop identifier of the mod.
        action: Specifies which suggestions to dismiss, either by listing
            specific terms or setting `all` to `True`.

    Returns:
        A dict with `{"status": "success"}`.
    """
    if action.all:
        save_suggestions(mod_id, [])
    else:
        remove_suggestions(mod_id, action.terms)
    return {"status": "success"}

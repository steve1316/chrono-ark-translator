"""Glossary endpoints for the REST API."""

from fastapi import APIRouter

from backend.data.glossary_manager import (
    add_glossary_term,
    extract_name_key_suggestions,
    load_glossary,
    load_mod_glossary,
    merge_glossaries,
    save_glossary,
    save_mod_glossary,
    suggest_glossary_edits,
)
from backend.data.history_manager import create_backup
from backend.data.mod_settings import load_source_language_override
from backend.data.suggestion_manager import (
    add_suggestions,
    load_suggestions,
    remove_suggestions,
    save_suggestions,
)
from backend.data.translation_store import load_translations, replace_in_translations
from backend.routes.helpers import _adapter, _find_mod_path, _merge_gdata_originals, resolve_source_language
from backend.routes.models import (
    GlossaryReplacePreview,
    GlossaryTerm,
    ModGlossaryTerm,
    SuggestionAction,
)

router = APIRouter()


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
    create_backup(mod_id, f"Before adding glossary term '{term.english}'")
    glossary = load_mod_glossary(mod_id)
    add_glossary_term(glossary, term.english, term.source_mappings, term.category)
    save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


@router.delete("/mods/{mod_id}/glossary/{term:path}")
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
        create_backup(mod_id, f"Before removing glossary term '{term}'")
        del glossary["terms"][term]
        save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


@router.post("/mods/{mod_id}/glossary/delete")
async def delete_mod_glossary_terms(mod_id: str, action: SuggestionAction):
    """Remove specific terms or all terms from a mod's glossary.

    Args:
        mod_id: The workshop identifier of the mod.
        action: Specifies which terms to delete, either by listing
            specific terms or setting `all` to True.

    Returns:
        A dict with `status` and the count of `deleted` terms.
    """
    glossary = load_mod_glossary(mod_id)
    terms = glossary.get("terms", {})
    if action.all:
        count = len(terms)
        if count > 0:
            create_backup(mod_id, "Before deleting all glossary terms")
        glossary["terms"] = {}
    else:
        count = 0
        for term in action.terms:
            if term in terms:
                if count == 0:
                    create_backup(mod_id, "Before removing glossary term(s)")
                del terms[term]
                count += 1
    save_mod_glossary(mod_id, glossary)
    return {"status": "success", "deleted": count}


@router.delete("/mods/{mod_id}/glossary")
async def delete_all_mod_glossary_terms(mod_id: str):
    """Remove all terms from a mod's glossary.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `status` and the count of `deleted` terms.
    """
    glossary = load_mod_glossary(mod_id)
    count = len(glossary.get("terms", {}))
    if count > 0:
        create_backup(mod_id, "Before deleting all glossary terms")
    glossary["terms"] = {}
    save_mod_glossary(mod_id, glossary)
    return {"status": "success", "deleted": count}


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

    if terms_to_accept:
        create_backup(mod_id, "Before accepting glossary suggestions")

    for suggestion in suggestions:
        if suggestion.get("english") in terms_to_accept:
            # If this is an edit suggestion, remove the old term first.
            edit_of = suggestion.get("edit_of")
            if edit_of and edit_of in glossary.get("terms", {}):
                del glossary["terms"][edit_of]

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


@router.post("/mods/{mod_id}/glossary/suggestions/scan")
async def scan_for_suggestions(mod_id: str):
    """Scan translated strings for glossary-worthy terms using name-key detection.

    Runs the same `extract_name_key_suggestions` logic that normally fires
    after AI translation, but against all already-translated strings. This
    lets the user discover terms without triggering a translation run.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `status` and the count of `new` suggestions found.
    """
    mod_path = _find_mod_path(mod_id)
    strings, _ = _adapter.extract_strings(mod_path)
    _merge_gdata_originals(mod_id, strings)

    saved = load_translations(mod_id)
    for key, english in saved.items():
        if key in strings:
            strings[key].translations["English"] = english

    lang_override = load_source_language_override(mod_id)
    mod_glossary = load_mod_glossary(mod_id)
    existing_suggestions = load_suggestions(mod_id)

    # Build a translations dict and group translated keys by source language.
    translations: dict[str, str] = {}
    by_lang: dict[str, list[str]] = {}
    for key, loc_str in strings.items():
        english = loc_str.translations.get("English", "").strip()
        if not english:
            continue
        source_lang = resolve_source_language(loc_str, lang_override)
        if not source_lang:
            continue
        translations[key] = english
        by_lang.setdefault(source_lang, []).append(key)

    new_suggestions: list[dict] = []
    combined_existing = existing_suggestions + new_suggestions
    for lang, keys in by_lang.items():
        found = extract_name_key_suggestions(
            translated_keys=keys,
            strings=strings,
            translations=translations,
            source_lang=lang,
            existing_suggestions=combined_existing,
            mod_glossary=mod_glossary,
            term_categories=_adapter.get_glossary_categories(),
        )
        new_suggestions.extend(found)
        combined_existing.extend(found)

    if new_suggestions:
        add_suggestions(mod_id, new_suggestions)

    return {"status": "success", "new": len(new_suggestions)}


@router.post("/mods/{mod_id}/glossary/suggest-edits")
async def suggest_edits(mod_id: str):
    """Suggest edits to existing glossary terms, such as title-casing names.

    Scans the mod's glossary for terms in name-related categories that
    aren't properly title-cased and adds them as edit suggestions.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `status` and the count of `new` edit suggestions.
    """
    mod_glossary = load_mod_glossary(mod_id)
    existing_suggestions = load_suggestions(mod_id)

    edits = suggest_glossary_edits(mod_glossary, existing_suggestions)

    if edits:
        add_suggestions(mod_id, edits)

    return {"status": "success", "new": len(edits)}

from backend.data.glossary_manager import (
    build_glossary_from_base_game,
    load_glossary,
    save_glossary,
    add_glossary_term,
    get_glossary_prompt,
    get_combined_glossary_prompt,
    load_mod_glossary,
    save_mod_glossary,
    merge_glossaries,
)


def test_build_glossary_extracts_name_keys(sample_base_strings, glossary_categories):
    glossary = build_glossary_from_base_game(
        sample_base_strings,
        glossary_categories,
        ["Korean", "Chinese"],
    )
    terms = glossary["terms"]
    assert "Armor Increased" in terms
    assert "Fire Bolt" in terms
    assert "Lucy" in terms
    assert "Heal" in terms
    # Description keys should NOT be extracted.
    assert "Defense is increased." not in terms
    # Source file should be stored from the LocString.
    assert terms["Armor Increased"]["source_file"] == "LangDataDB.csv"
    assert terms["Lucy"]["source_file"] == "LangDataDB.csv"
    # SkillExtended/ keys should be categorized as skills.
    assert terms["Heal"]["category"] == "skills"
    # _PassiveName suffix overrides Character/ prefix to passives.
    assert terms["Lucy's Blessing"]["category"] == "passives"


def test_build_glossary_extracts_keyword_entries(sample_base_strings, glossary_categories):
    glossary = build_glossary_from_base_game(
        sample_base_strings,
        glossary_categories,
        ["Korean", "Chinese"],
        keyword_prefixes=["SkillKeyword/", "Battle/Keyword/"],
    )
    terms = glossary["terms"]
    assert "Swiftness" in terms
    assert terms["Swiftness"]["category"] == "mechanics"


def test_build_glossary_includes_seed_terms(sample_base_strings, glossary_categories):
    glossary = build_glossary_from_base_game(
        sample_base_strings,
        glossary_categories,
        ["Korean", "Chinese"],
    )
    terms = glossary["terms"]
    # Seed terms should be present with empty source_file.
    for term in ["Debuff", "Damage", "Accuracy"]:
        assert term in terms
        assert terms[term]["category"] == "mechanics"
        assert terms[term]["source_file"] == ""


def test_build_glossary_sets_timestamps(sample_base_strings, glossary_categories):
    glossary = build_glossary_from_base_game(
        sample_base_strings,
        glossary_categories,
        ["Korean", "Chinese"],
    )
    for term, info in glossary["terms"].items():
        assert "created_at" in info, f"Missing created_at on {term}"
        assert "updated_at" in info, f"Missing updated_at on {term}"
        assert info["created_at"] is not None
        assert info["updated_at"] is not None


def test_save_and_load_glossary(tmp_storage):
    glossary = {"terms": {"Test": {"category": "custom", "key": "", "source_mappings": {}}}}
    path = tmp_storage / "glossary.json"
    save_glossary(glossary, path)
    loaded = load_glossary(path)
    assert loaded["terms"]["Test"]["category"] == "custom"


def test_add_glossary_term():
    glossary = {"terms": {}}
    add_glossary_term(glossary, "Fire Bolt", {"Korean": "화염구"}, category="skills")
    assert "Fire Bolt" in glossary["terms"]
    assert glossary["terms"]["Fire Bolt"]["source_mappings"]["Korean"] == "화염구"
    assert glossary["terms"]["Fire Bolt"]["created_at"] is not None
    assert glossary["terms"]["Fire Bolt"]["updated_at"] is not None


def test_add_glossary_term_preserves_created_at():
    glossary = {"terms": {}}
    add_glossary_term(glossary, "Fire Bolt", {"Korean": "화염구"}, category="skills")
    original_created = glossary["terms"]["Fire Bolt"]["created_at"]
    add_glossary_term(glossary, "Fire Bolt", {"Korean": "화염구", "Chinese": "火球术"}, category="skills")
    assert glossary["terms"]["Fire Bolt"]["created_at"] == original_created


def test_glossary_prompt_format():
    glossary = {
        "terms": {
            "Fire Bolt": {"category": "skills", "key": "", "source_mappings": {"Korean": "화염구"}},
            "Armor": {"category": "mechanics", "key": "", "source_mappings": {}},
        }
    }
    prompt = get_glossary_prompt(glossary, allowed_categories=["skills", "mechanics"])
    assert "**Fire Bolt**" in prompt
    assert "**Armor**" in prompt
    assert "Korean: 화염구" in prompt


def test_load_mod_glossary_empty(tmp_storage):
    result = load_mod_glossary("12345", tmp_storage)
    assert result == {"terms": {}}


def test_save_and_load_mod_glossary(tmp_storage):
    glossary = {"terms": {"Dark Mage": {"category": "characters", "key": "", "source_mappings": {"Chinese": "黑魔法师"}}}}
    save_mod_glossary("12345", glossary, tmp_storage)
    loaded = load_mod_glossary("12345", tmp_storage)
    assert "Dark Mage" in loaded["terms"]


def test_merge_glossaries_mod_overrides_base():
    base = {"terms": {"Fire": {"category": "mechanics", "key": "", "source_mappings": {}}}}
    mod = {"terms": {"Fire": {"category": "skills", "key": "Skill/Fire_Name", "source_mappings": {"Korean": "불"}}}}
    merged = merge_glossaries(base, mod)
    assert merged["terms"]["Fire"]["category"] == "skills"
    assert merged["terms"]["Fire"]["source_mappings"]["Korean"] == "불"


def test_merge_glossaries_combines_both():
    base = {"terms": {"Armor": {"category": "mechanics", "key": "", "source_mappings": {}}}}
    mod = {"terms": {"Dark Mage": {"category": "characters", "key": "", "source_mappings": {}}}}
    merged = merge_glossaries(base, mod)
    assert "Armor" in merged["terms"]
    assert "Dark Mage" in merged["terms"]


def test_delete_mod_glossary_term(tmp_storage):
    glossary = {
        "terms": {
            "A": {"category": "c", "key": "", "source_mappings": {}},
            "B": {"category": "c", "key": "", "source_mappings": {}},
        }
    }
    save_mod_glossary("12345", glossary, tmp_storage)
    loaded = load_mod_glossary("12345", tmp_storage)
    del loaded["terms"]["A"]
    save_mod_glossary("12345", loaded, tmp_storage)
    reloaded = load_mod_glossary("12345", tmp_storage)
    assert "A" not in reloaded["terms"]
    assert "B" in reloaded["terms"]


def test_combined_glossary_prompt_includes_mod_terms_from_all_categories():
    """Mod glossary terms should appear regardless of GLOSSARY_CATEGORIES config."""
    base = {
        "terms": {
            "Lucy": {"category": "characters", "key": "", "source_mappings": {"Korean": "루시"}},
        }
    }
    mod = {
        "terms": {
            "Dark Slash": {"category": "custom", "key": "", "source_mappings": {"Korean": "다크 슬래시"}},
            "Heal Potion": {"category": "items", "key": "", "source_mappings": {"Korean": "힐 포션"}},
        }
    }
    prompt = get_combined_glossary_prompt(base, mod, source_lang="Korean")
    # Base "characters" term should appear (it's in the default allowed categories).
    assert "**Lucy**" in prompt
    # Mod terms in non-default categories should also appear.
    assert "**Dark Slash**" in prompt
    assert "**Heal Potion**" in prompt


def test_combined_glossary_prompt_base_terms_still_filtered():
    """Base glossary terms outside GLOSSARY_CATEGORIES should be filtered out."""
    base = {
        "terms": {
            "Lucy": {"category": "characters", "key": "", "source_mappings": {"Korean": "루시"}},
            "Fire Bolt": {"category": "skills", "key": "", "source_mappings": {"Korean": "화염구"}},
        }
    }
    mod = {"terms": {}}
    prompt = get_combined_glossary_prompt(base, mod, source_lang="Korean")
    # "characters" is in default GLOSSARY_CATEGORIES → included.
    assert "**Lucy**" in prompt
    # "skills" is NOT in default GLOSSARY_CATEGORIES → filtered out.
    assert "**Fire Bolt**" not in prompt


def test_combined_glossary_prompt_mod_overrides_base():
    """When a mod term overrides a base term, only the mod version appears."""
    base = {
        "terms": {
            "Fire": {"category": "buffs/debuffs", "key": "", "source_mappings": {"Korean": "불 (base)"}},
        }
    }
    mod = {
        "terms": {
            "Fire": {"category": "custom", "key": "", "source_mappings": {"Korean": "불 (mod)"}},
        }
    }
    prompt = get_combined_glossary_prompt(base, mod, source_lang="Korean")
    assert "불 (mod)" in prompt
    assert "불 (base)" not in prompt


def test_combined_glossary_prompt_empty_mod():
    """With no mod terms, only filtered base terms appear."""
    base = {
        "terms": {
            "Shield Up": {"category": "buffs/debuffs", "key": "", "source_mappings": {"Korean": "방패"}},
        }
    }
    mod = {"terms": {}}
    prompt = get_combined_glossary_prompt(base, mod, source_lang="Korean")
    assert "**Shield Up**" in prompt

from pathlib import Path

from games.chrono_ark.csv_extractor import (
    find_all_csv_files,
    classify_csv_file,
    extract_mod_strings,
)


CSV_HEADER = "Key,Type,Desc,Korean,English,Japanese,Chinese,Chinese-TW [zh-tw]\n"


def _write_csv(path: Path, rows: list[str]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(CSV_HEADER)
        for row in rows:
            f.write(row + "\n")


def test_find_all_csv_files_localization_dir(tmp_path):
    _write_csv(tmp_path / "Localization" / "LangDataDB.csv", ["Buff/B_1_Name,Text,,테스트,Test,,测试,測試"])
    files = find_all_csv_files(tmp_path)
    assert len(files) == 1
    assert files[0].name == "LangDataDB.csv"


def test_find_all_csv_files_detects_duplicates(tmp_path):
    _write_csv(tmp_path / "Localization" / "LangDataDB.csv", ["Buff/B_1_Name,Text,,테스트,Test,,测试,測試"])
    _write_csv(tmp_path / "Localization" / "LangDataDB - 副本.csv", ["Buff/B_1_Name,Text,,테스트,Test2,,测试,測試"])
    files = find_all_csv_files(tmp_path)
    assert len(files) == 2


def test_classify_canonical():
    loc_dir = Path("Localization")
    assert classify_csv_file(loc_dir / "LangDataDB.csv", loc_dir) == ("LangDataDB.csv", True)


def test_classify_variant_copy_suffix():
    loc_dir = Path("Localization")
    assert classify_csv_file(loc_dir / "LangDataDB - 副本.csv", loc_dir) == ("LangDataDB.csv", False)


def test_classify_variant_numbered():
    loc_dir = Path("Localization")
    assert classify_csv_file(loc_dir / "LangDataDB (1).csv", loc_dir) == ("LangDataDB.csv", False)


def test_classify_variant_fullwidth_parens():
    loc_dir = Path("Localization")
    canonical, is_canon = classify_csv_file(loc_dir / "LangDataDB\uff081\uff09.csv", loc_dir)
    assert canonical == "LangDataDB.csv"
    assert is_canon is False


def test_classify_variant_versioned():
    canonical, is_canon = classify_csv_file(Path("LangDataDB_v0.6.13.csv"), Path("."))
    assert canonical == "LangDataDB.csv"
    assert is_canon is False


def test_classify_backup_dir():
    canonical, is_canon = classify_csv_file(Path("langbackup/LangDataDB.csv"), Path("."))
    assert canonical == "LangDataDB.csv"
    assert is_canon is False


def test_classify_chinese_backup_dir():
    canonical, is_canon = classify_csv_file(Path("备份/LangDataDB.csv"), Path("."))
    assert canonical == "LangDataDB.csv"
    assert is_canon is False


def test_extract_mod_strings_deduplicates(tmp_path):
    _write_csv(tmp_path / "Localization" / "LangDataDB.csv", [
        "Buff/B_1_Name,Text,,테스트,Canonical,,测试,測試",
        "Buff/B_2_Name,Text,,테스트2,Test2,,测试2,測試2",
    ])
    _write_csv(tmp_path / "Localization" / "LangDataDB - 副本.csv", [
        "Buff/B_1_Name,Text,,테스트,FromCopy,,测试,測試",
        "Buff/B_3_Name,Text,,테스트3,Test3,,测试3,測試3",
    ])
    strings, variants = extract_mod_strings(tmp_path)
    # Canonical wins on key collision.
    assert strings["Buff/B_1_Name"].translations["English"] == "Canonical"
    # Unique keys from variant are included.
    assert "Buff/B_3_Name" in strings
    # Variants are reported.
    assert len(variants) == 1
    assert "副本" in variants[0]

#!/usr/bin/env python3
"""
learn_dictionary.py — CSV 修正から辞書パターンを学習して dictionary.json に追記する。

処理フロー:
  1. /tmp/script_baseline.json（prepare.ts 生成）と
     public/script.json（import-csv 適用後）を比較
  2. テキストが変わった箇所を抽出
  3. master.json の対応セグメントから Whisper 生テキストを取得
  4. 差分を辞書パターンに変換
  5. dictionary.json に追記（重複・衝突を回避）
"""

import difflib
import json
from pathlib import Path


def extract_changes(baseline_text: str, corrected_text: str) -> list[tuple[str, str]]:
    """difflib で文字単位の差分を抽出し (old, new) ペアのリストを返す。"""
    if baseline_text == corrected_text:
        return []

    matcher = difflib.SequenceMatcher(None, baseline_text, corrected_text, autojunk=False)
    changes: list[tuple[str, str]] = []

    old_buf, new_buf = [], []
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op in ("replace", "delete", "insert"):
            old_part = baseline_text[i1:i2]
            new_part = corrected_text[j1:j2]
            old_buf.append(old_part)
            new_buf.append(new_part)
        else:
            # 'equal' → 手前のバッファをフラッシュ
            if old_buf or new_buf:
                old_str = "".join(old_buf)
                new_str = "".join(new_buf)
                if old_str and old_str != new_str:
                    changes.append((old_str, new_str))
                old_buf.clear()
                new_buf.clear()

    if old_buf or new_buf:
        old_str = "".join(old_buf)
        new_str = "".join(new_buf)
        if old_str and old_str != new_str:
            changes.append((old_str, new_str))

    return changes


def build_telop_map(script: dict) -> dict[float, str]:
    """absStartSec → text のマップを作る。"""
    result: dict[float, str] = {}
    for seg in script["segments"]:
        for entry in script["subtitles"].get(seg["id"], []):
            key = entry.get("absStartSec")
            if key is not None:
                result[round(key, 3)] = entry.get("text", "")
    return result


def find_master_text(master_segs: list[dict], abs_start: float) -> str:
    """absStartSec に最も近い master.json セグメントのテキストを返す。"""
    if not master_segs:
        return ""
    closest = min(master_segs, key=lambda s: abs(s["start"] - abs_start))
    if abs(closest["start"] - abs_start) > 3.0:  # 3秒以上離れていたらスキップ
        return ""
    return closest["text"]


def is_safe_for_dict(old_str: str, new_str: str, master_text: str) -> bool:
    """辞書に追加して安全かどうか判定する。"""
    if not old_str or not new_str:
        return False
    if old_str == new_str:
        return False
    # master.json に old_str が存在すること（辞書で置換できる）
    if old_str not in master_text:
        return False
    # 短すぎるパターンは誤爆のリスクがある（2文字以上）
    if len(old_str) < 2:
        return False
    # 数字・記号のみは除外
    if old_str.strip("0123456789!！?？。、 ") == "":
        return False
    return True


def main() -> None:
    baseline_path = Path("/tmp/script_baseline.json")
    current_path  = Path("public/script.json")
    master_path   = Path("master.json")
    dict_path     = Path("dictionary.json")

    for p in [baseline_path, current_path, master_path, dict_path]:
        if not p.exists():
            print(f"❌ ファイルが見つかりません: {p}")
            raise SystemExit(1)

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    current  = json.loads(current_path.read_text(encoding="utf-8"))
    master   = json.loads(master_path.read_text(encoding="utf-8"))
    dictionary: dict[str, str] = json.loads(dict_path.read_text(encoding="utf-8"))

    baseline_map = build_telop_map(baseline)
    current_map  = build_telop_map(current)
    master_segs  = master.get("segments", [])

    # 変更されたテロップを特定
    changed: list[tuple[float, str, str]] = []
    for key, baseline_text in baseline_map.items():
        corrected_text = current_map.get(key)
        if corrected_text and baseline_text != corrected_text:
            changed.append((key, baseline_text, corrected_text))

    print(f"変更されたテロップ: {len(changed)} 件")

    # 差分から辞書パターンを抽出
    new_entries: dict[str, str] = {}
    skipped = 0

    for abs_start, baseline_text, corrected_text in changed:
        master_text = find_master_text(master_segs, abs_start)
        pairs = extract_changes(baseline_text, corrected_text)

        for old_str, new_str in pairs:
            if old_str in dictionary:
                continue  # 既存エントリ
            if old_str in new_entries:
                continue  # 今回既に追加済み
            if is_safe_for_dict(old_str, new_str, master_text):
                new_entries[old_str] = new_str
            else:
                skipped += 1

    # dictionary.json に追記
    if new_entries:
        dictionary.update(new_entries)
        dict_path.write_text(
            json.dumps(dictionary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(f"辞書に追加: {len(new_entries)} 件 / スキップ: {skipped} 件")
    for old, new in new_entries.items():
        print(f"  「{old}」→「{new}」")

    if not new_entries:
        print("  ※ 安全に辞書化できるパターンが見つかりませんでした")


if __name__ == "__main__":
    main()

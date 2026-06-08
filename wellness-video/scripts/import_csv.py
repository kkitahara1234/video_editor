#!/usr/bin/env python3
"""
import_csv.py — 修正済み subtitles.csv を script.json に反映して上書き保存する。

照合キー: id 列（export_csv.py が付与した連番）
更新対象: text フィールドのみ（start / end は変更しない）

使い方:
  python3 scripts/import_csv.py [--script public/script.json] [--csv subtitles.csv]
"""

import argparse
import csv
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--script", default="public/script.json", help="script.json パス")
    parser.add_argument("--csv",    default="subtitles.csv",      help="修正済み CSV パス")
    args = parser.parse_args()

    script_path = Path(args.script)
    csv_path    = Path(args.csv)

    if not script_path.exists():
        print(f"❌ {script_path} が見つかりません")
        raise SystemExit(1)
    if not csv_path.exists():
        print(f"❌ {csv_path} が見つかりません")
        raise SystemExit(1)

    # CSV を id → text の辞書に変換
    corrections: dict[int, str] = {}
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            corrections[int(row["id"])] = row["text"]

    data = json.loads(script_path.read_text(encoding="utf-8"))

    idx = 0
    changed = 0
    for seg in data["segments"]:
        for entry in data["subtitles"].get(seg["id"], []):
            if idx in corrections:
                new_text = corrections[idx]
                if entry.get("text") != new_text:
                    entry["text"] = new_text
                    changed += 1
            idx += 1

    script_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"✅ {changed} 件を更新しました → {script_path}")
    print(f"   CSV 行数: {len(corrections)} / テロップ総数: {idx}")


if __name__ == "__main__":
    main()

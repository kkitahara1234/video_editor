#!/usr/bin/env python3
"""
fix_text.py — dictionary.json に基づいて master.json のテキストを一括補正する。

使い方:
  python3 scripts/fix_text.py [--input master.json] [--dict dictionary.json]

デフォルト動作:
  - dictionary.json を読み込む
  - master.json を読み込み、全セグメントのテキストに辞書補正を適用
  - master.json を上書き保存する（元データは git で管理すること）
"""

import json
import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply dictionary corrections to master.json")
    parser.add_argument("--input",  default="master.json",    help="Whisper 出力 JSON (default: master.json)")
    parser.add_argument("--dict",   default="dictionary.json", help="補正辞書 JSON (default: dictionary.json)")
    args = parser.parse_args()

    dict_path   = Path(args.dict)
    master_path = Path(args.input)

    if not dict_path.exists():
        print(f"❌ 辞書ファイルが見つかりません: {dict_path}")
        raise SystemExit(1)
    if not master_path.exists():
        print(f"❌ Whisper ファイルが見つかりません: {master_path}")
        raise SystemExit(1)

    corrections: dict[str, str] = json.loads(dict_path.read_text(encoding="utf-8"))
    data: dict = json.loads(master_path.read_text(encoding="utf-8"))

    changed = 0
    for seg in data.get("segments", []):
        original: str = seg.get("text", "")
        text = original
        for wrong, correct in corrections.items():
            text = text.replace(wrong, correct)
        if text != original:
            seg["text"] = text
            changed += 1

    master_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"✅ {changed} 件を補正しました → {master_path}")
    print(f"   辞書エントリ数: {len(corrections)}")


if __name__ == "__main__":
    main()

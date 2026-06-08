#!/usr/bin/env python3
"""
export_csv.py — script.json のテロップを subtitles.csv に書き出す。

出力形式: id, start, end, text
  id    … 連番（import_csv での照合キー）
  start … 絶対開始秒 (absStartSec)
  end   … 絶対終了秒 (absEndSec)
  text  … テロップテキスト

使い方:
  python3 scripts/export_csv.py [--script public/script.json] [--out subtitles.csv]
"""

import argparse
import csv
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--script", default="public/script.json", help="script.json パス")
    parser.add_argument("--out",    default="subtitles.csv",      help="出力 CSV パス")
    args = parser.parse_args()

    data = json.loads(Path(args.script).read_text(encoding="utf-8"))

    rows = []
    for seg in data["segments"]:
        for entry in data["subtitles"].get(seg["id"], []):
            rows.append({
                "id":    len(rows),
                "start": entry.get("absStartSec", ""),
                "end":   entry.get("absEndSec",   ""),
                "text":  entry.get("text", ""),
            })

    out_path = Path(args.out)
    with out_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "start", "end", "text"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ {len(rows)} 件を書き出しました → {out_path}")


if __name__ == "__main__":
    main()

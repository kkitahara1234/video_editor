#!/usr/bin/env python3
"""
apply_proposals_v9.py — 確定修正10件の即適用

使い方:
  python scripts/apply_proposals_v9.py --dry-run
  python scripts/apply_proposals_v9.py
"""

import json
import sys
import os
import time

SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")
MAX_LEN = 25

# ============================================================
# FIXES: (cam_id, idx, old_text, new_text)
# ============================================================
FIXES = [
    ("cam-0017", 2, "なんとか直そう 元に戻してあげよう", "なんとか治そう 元に戻してあげよう"),
    ("cam-0031", 2, "ほとんどですね人類はガンとか血管系の", "ほとんどですね人類はがんとか血管系の"),
    ("cam-0040", 0, "目指していたのはヘルスですねヘルスも", "目指していたのは ヘルスですね ヘルスも"),
    ("cam-0046", 2, "いうのに僕なって実際に現場でいろんな", "いうのに僕はなって実際に現場でいろんな"),
    ("cam-0047", 2, "迎える時のを見てですね 本当にこう", "迎える時を見てですね 本当にこう"),
    ("cam-0053", 0, "なんて言うんでしょうねお肉はじゃ", "なんて言うんでしょうねお肉はじゃあ"),
    ("cam-0068", 2, "最大化しましょう というのが今世の", "最大化しましょう というのが"),
    ("cam-0068", 3, "中でねすごい言われるように", "今世の中でねすごい言われるように"),
    ("cam-0069", 1, "ロンジェビティとかって", "Longevityとかって"),
    ("cam-0073", 1, "というだけではなくてかついい人生を", "というだけではなくて かついい人生を"),
]


def main():
    dry_run = "--dry-run" in sys.argv

    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    subtitles = data.get("subtitles", {})
    applied = 0
    skipped = 0
    warnings = []

    print("=" * 60)
    print(f"確定修正 {len(FIXES)}件 {'[DRY-RUN]' if dry_run else ''}")
    print("=" * 60)

    for cam_id, idx, old_text, new_text in FIXES:
        label = f"{cam_id}[{idx}]"

        if cam_id not in subtitles:
            warnings.append(f"  SKIP {label}: cam_id 不在")
            skipped += 1
            continue

        arr = subtitles[cam_id]
        if idx >= len(arr):
            warnings.append(f"  SKIP {label}: idx 範囲外 (len={len(arr)})")
            skipped += 1
            continue

        current = arr[idx]["text"]
        if current != old_text:
            warnings.append(
                f"  SKIP {label}: テキスト不一致\n"
                f"    期待: {old_text!r}\n"
                f"    実際: {current!r}"
            )
            skipped += 1
            continue

        if len(new_text) > MAX_LEN:
            warnings.append(f"  SKIP {label}: new_text {len(new_text)}字 (>{MAX_LEN}字)")
            skipped += 1
            continue

        print(f"  {label}: ({len(old_text)}字 -> {len(new_text)}字)")
        print(f"    - {old_text!r}")
        print(f"    + {new_text!r}")

        if not dry_run:
            arr[idx]["text"] = new_text

        applied += 1

    mode = "[DRY-RUN] " if dry_run else ""
    print(f"\n{mode}適用: {applied}件, スキップ: {skipped}件")

    if warnings:
        print(f"\n⚠ 警告:")
        for w in warnings:
            print(w)

    if not dry_run and applied > 0:
        # バックアップ (変更前のファイルをコピー)
        bak = f"{SCRIPT_JSON}.bak.{int(time.time())}"
        import shutil
        shutil.copy2(SCRIPT_JSON, bak)
        print(f"\nバックアップ: {bak}")

        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"✓ {SCRIPT_JSON} を更新しました")

    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

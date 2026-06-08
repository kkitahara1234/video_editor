#!/usr/bin/env python3
"""
resync_timing_v3_manual.py — Phase 2: 手動指定3件のタイミング再同期

使い方:
  python scripts/resync_timing_v3_manual.py --dry-run
  python scripts/resync_timing_v3_manual.py
"""

import json
import sys
import os
import time

SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")

# ============================================================
# 手動指定: (cam_id, a_idx, b_idx, new_boundary)
# ============================================================
MANUAL_FIXES = [
    ("cam-0010", 3, 4, 69.580),   # 「に」の end
    ("cam-0324", 0, 1, 1947.280), # 「います」の end
    ("cam-0353", 1, 2, 2122.860), # 「が」の end
]


def main():
    dry_run = "--dry-run" in sys.argv

    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not dry_run:
        bak = f"{SCRIPT_JSON}.bak.{int(time.time())}"
        with open(bak, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"バックアップ: {bak}\n")

    subtitles = data["subtitles"]

    print("=" * 60)
    print("Phase 2: 手動タイミング再同期 3件")
    print("=" * 60)

    for cam_id, a_idx, b_idx, new_boundary in MANUAL_FIXES:
        a = subtitles[cam_id][a_idx]
        b = subtitles[cam_id][b_idx]

        old_boundary = a['absEndSec']
        delta = new_boundary - old_boundary

        old_a_dur = a['durationSec']
        old_b_dur = b['durationSec']
        new_a_dur = new_boundary - a['absStartSec']
        new_b_dur = b['absEndSec'] - new_boundary

        sign = '+' if delta >= 0 else ''
        print(f"  {cam_id}[{a_idx}]+[{b_idx}]:")
        print(f"    境界: {old_boundary:.3f} -> {new_boundary:.3f} ({sign}{delta:.3f}s)")
        print(f"    [{a_idx}].absEndSec:   {old_boundary:.3f} -> {new_boundary:.3f}")
        print(f"    [{b_idx}].absStartSec: {old_boundary:.3f} -> {new_boundary:.3f}")
        print(f"    [{a_idx}].durationSec: {old_a_dur:.3f} -> {new_a_dur:.3f}")
        print(f"    [{b_idx}].durationSec: {old_b_dur:.3f} -> {new_b_dur:.3f}")
        print(f"    [{a_idx}].text: {a['text']!r}")
        print(f"    [{b_idx}].text: {b['text']!r}")

        if not dry_run:
            a['absEndSec'] = new_boundary
            a['durationSec'] = new_a_dur
            a['endSec'] = a.get('endSec', 0) + (new_boundary - old_boundary)

            b['absStartSec'] = new_boundary
            b['durationSec'] = new_b_dur
            b['startSec'] = b.get('startSec', 0) + (new_boundary - old_boundary)

    mode = "[DRY-RUN] " if dry_run else ""
    print()
    print(f"{mode}適用: {len(MANUAL_FIXES)}件")

    if not dry_run:
        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\n✓ {SCRIPT_JSON} を更新しました")


if __name__ == "__main__":
    sys.exit(main())

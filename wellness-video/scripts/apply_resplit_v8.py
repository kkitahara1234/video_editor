#!/usr/bin/env python3
"""
apply_resplit_v8.py — Phase A: 連体修飾語+名詞分断の RESPLIT 5件

使い方:
  python scripts/apply_resplit_v8.py --dry-run
  python scripts/apply_resplit_v8.py
"""

import json
import sys
import os
import re
import time

SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")
MASTER_JSON = os.path.join(os.path.dirname(__file__), "..", "master.json")

MAX_LEN = 25

# ============================================================
# RESPLIT 5件: (cam_id, a_idx, b_idx, new_a, new_b)
# ============================================================
RESPLIT_ENTRIES = [
    ("cam-0015", 2, 3, "できなくなってしまったり", "好きな国にですね旅に"),
    ("cam-0056", 1, 2, "実現していくのか", "素敵な人と素敵な場所に行くのかみたいなことが"),
    ("cam-0210", 1, 2, "起こってからですね", "ベストなソリューションを探すっていうことを"),
    ("cam-0343", 2, 3, "小論文も", "やらなきゃいけないみたいな大学もあるわけです"),
    ("cam-0474", 1, 2, "アプリだったりとかですね", "いろんなアプリがありますとそのそれぞれの"),
]


def normalize(text):
    return re.sub(r'[、。,.\s　]', '', text)


def find_boundary(all_words, a_start, b_end, new_a_text):
    range_words = [w for w in all_words
                   if w['start'] >= a_start - 1.0 and w['end'] <= b_end + 0.5]
    norm_target = normalize(new_a_text)
    if not norm_target:
        return None, None

    cum = ""
    for w in range_words:
        cum += normalize(w['word'])
        if cum.endswith(norm_target) and len(cum) >= len(norm_target):
            return w['end'], w['word']
        if len(cum) > len(norm_target) * 2 + 20:
            break

    cum = ""
    for w in range_words:
        wn = normalize(w['word'])
        for ci, ch in enumerate(wn):
            cum += ch
            if cum.endswith(norm_target) and len(cum) >= len(norm_target):
                frac = (ci + 1) / len(wn)
                t = w['start'] + (w['end'] - w['start']) * frac
                return t, w['word']
        if len(cum) > len(norm_target) * 2 + 20:
            break

    return None, None


def main():
    dry_run = "--dry-run" in sys.argv

    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    with open(MASTER_JSON, "r", encoding="utf-8") as f:
        master = json.load(f)

    if not dry_run:
        bak = f"{SCRIPT_JSON}.bak.{int(time.time())}"
        with open(bak, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"バックアップ: {bak}\n")

    subtitles = data["subtitles"]
    all_words = []
    for seg in master['segments']:
        for w in seg['words']:
            all_words.append(w)

    applied = 0
    skipped = 0

    print("=" * 60)
    print("Phase A: RESPLIT 5件")
    print("=" * 60)

    for cam_id, a_idx, b_idx, new_a, new_b in RESPLIT_ENTRIES:
        label = f"{cam_id}[{a_idx}]+[{b_idx}]"
        arr = subtitles[cam_id]
        a, b = arr[a_idx], arr[b_idx]

        # 25字チェック
        if len(new_a) > MAX_LEN or len(new_b) > MAX_LEN:
            print(f"  SKIP {label}: 25字超過 new_a={len(new_a)} new_b={len(new_b)}")
            skipped += 1
            continue

        # 境界取得
        a_start = a['absStartSec']
        b_end = b['absEndSec']
        old_boundary = a['absEndSec']

        split_time, last_word = find_boundary(all_words, a_start, b_end, new_a)
        if split_time is None:
            print(f"  SKIP {label}: 境界時刻特定不可")
            skipped += 1
            continue

        new_boundary = split_time
        delta = new_boundary - old_boundary
        new_a_dur = new_boundary - a_start
        new_b_dur = b_end - new_boundary

        sign = '+' if delta >= 0 else ''
        print(f"  {label}:")
        print(f"    [{a_idx}] text: {a['text']!r} -> {new_a!r}")
        print(f"    [{b_idx}] text: {b['text']!r} -> {new_b!r}")
        print(f"    境界: {old_boundary:.3f} -> {new_boundary:.3f} ({sign}{delta:.3f}s) 語「{last_word}」")
        print(f"    [{a_idx}] dur: {a['durationSec']:.3f} -> {new_a_dur:.3f}")
        print(f"    [{b_idx}] dur: {b['durationSec']:.3f} -> {new_b_dur:.3f}")

        if not dry_run:
            a['text'] = new_a
            a['absEndSec'] = new_boundary
            a['durationSec'] = new_a_dur
            a['endSec'] = a.get('endSec', 0) + (new_boundary - old_boundary)

            b['text'] = new_b
            b['absStartSec'] = new_boundary
            b['durationSec'] = new_b_dur
            b['startSec'] = b.get('startSec', 0) + (new_boundary - old_boundary)

        applied += 1

    mode = "[DRY-RUN] " if dry_run else ""
    print(f"\n{mode}適用: {applied}件, スキップ: {skipped}件")

    if not dry_run and applied > 0:
        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\n✓ {SCRIPT_JSON} を更新しました")

    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

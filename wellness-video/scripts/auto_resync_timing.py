#!/usr/bin/env python3
"""
auto_resync_timing.py — テキスト修正後の音声タイミング自動再同期

使い方:
  python scripts/auto_resync_timing.py --dry-run                  # diff のみ表示
  python scripts/auto_resync_timing.py --apply                    # 実際に書き込み
  python scripts/auto_resync_timing.py --dry-run --threshold 0.1  # 閾値変更
  python scripts/auto_resync_timing.py --dry-run --backup-path public/script.json.bak.XXXX
"""

import json
import sys
import os
import re
import glob
import time
import shutil

SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")
MASTER_JSON = os.path.join(os.path.dirname(__file__), "..", "master.json")
BAK_PATTERN = os.path.join(os.path.dirname(__file__), "..", "public", "script.json.bak.*")


def parse_args():
    args = {
        "dry_run": "--dry-run" in sys.argv,
        "apply": "--apply" in sys.argv,
        "threshold": 0.05,
        "backup_path": None,
    }
    for i, a in enumerate(sys.argv):
        if a == "--threshold" and i + 1 < len(sys.argv):
            args["threshold"] = float(sys.argv[i + 1])
        if a == "--backup-path" and i + 1 < len(sys.argv):
            args["backup_path"] = sys.argv[i + 1]
    if not args["dry_run"] and not args["apply"]:
        print("使い方: --dry-run (表示のみ) または --apply (書き込み)")
        sys.exit(1)
    return args


def find_latest_backup(pattern):
    """最新の .bak.* ファイルを返す (mtime ベース)"""
    files = glob.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getmtime)


def normalize(text):
    return re.sub(r'[、。,.\s　]', '', text)


def find_boundary(all_words, a_start, b_end, new_a_text):
    """
    new_a_text の末尾に対応する master.json word の end 時刻を探す。
    suffix 一致 + 文字単位線形補間。
    Returns: (split_time, last_word) or (None, None)
    """
    range_words = [w for w in all_words
                   if w['start'] >= a_start - 1.0 and w['end'] <= b_end + 0.5]

    norm_target = normalize(new_a_text)
    if not norm_target:
        return None, None

    # Pass 1: word 境界での suffix 一致
    cum = ""
    for w in range_words:
        cum += normalize(w['word'])
        if cum.endswith(norm_target) and len(cum) >= len(norm_target):
            return w['end'], w['word']
        if len(cum) > len(norm_target) * 2 + 20:
            break

    # Pass 2: 文字単位での suffix 一致
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


def find_corresponding_idx(bak_arr, cur_sub, tolerance=0.5):
    """
    cur_sub の absStartSec に最も近い bak_arr 内のインデックスを返す。
    配列長が異なる場合の対応用。
    """
    target = cur_sub.get('absStartSec', -1)
    best_idx = None
    best_delta = float('inf')
    for i, b in enumerate(bak_arr):
        delta = abs(b.get('absStartSec', -999) - target)
        if delta < best_delta:
            best_delta = delta
            best_idx = i
    if best_delta <= tolerance:
        return best_idx
    return None


def main():
    args = parse_args()
    threshold = args["threshold"]

    # ── ファイル読み込み ──
    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    with open(MASTER_JSON, "r", encoding="utf-8") as f:
        master = json.load(f)

    # バックアップ検出
    if args["backup_path"]:
        bak_path = args["backup_path"]
    else:
        bak_path = find_latest_backup(BAK_PATTERN)
    if not bak_path or not os.path.exists(bak_path):
        print(f"❌ バックアップが見つかりません: {bak_path or BAK_PATTERN}")
        return 1

    with open(bak_path, "r", encoding="utf-8") as f:
        bak_data = json.load(f)

    print(f"比較元: {os.path.basename(bak_path)}")
    print(f"閾値:   {threshold}s")
    print()

    cur_subs = data.get("subtitles", {})
    bak_subs = bak_data.get("subtitles", {})

    all_words = []
    for seg in master['segments']:
        for w in seg['words']:
            all_words.append(w)

    # ── Step 2: Diff 検出 ──
    changed = {}  # {cam_id: set of changed indices}

    for cam_id in cur_subs:
        cur_arr = cur_subs[cam_id]
        bak_arr = bak_subs.get(cam_id, [])
        changed_set = set()

        if len(cur_arr) == len(bak_arr):
            for i in range(len(cur_arr)):
                if cur_arr[i]['text'] != bak_arr[i]['text']:
                    changed_set.add(i)
        else:
            # 配列長が異なる: absStartSec 近接マッチング
            for i, cur_sub in enumerate(cur_arr):
                bak_idx = find_corresponding_idx(bak_arr, cur_sub)
                if bak_idx is None:
                    changed_set.add(i)
                elif cur_sub['text'] != bak_arr[bak_idx]['text']:
                    changed_set.add(i)

        if changed_set:
            changed[cam_id] = changed_set

    if not changed:
        print("変更されたテロップなし（バックアップと同一）")
        return 0

    total_changed = sum(len(v) for v in changed.values())
    print(f"テキスト変更検出: {total_changed}件 ({len(changed)} cam)")

    # ── Step 3: 影響ペアの特定 ──
    pairs = []  # [(cam_id, a_idx, b_idx)]
    seen = set()

    for cam_id, indices in changed.items():
        arr = cur_subs[cam_id]
        for i in sorted(indices):
            # (i, i+1) ペア
            if i + 1 < len(arr):
                key = (cam_id, i, i + 1)
                if key not in seen:
                    pairs.append(key)
                    seen.add(key)
            # (i-1, i) ペア
            if i - 1 >= 0:
                key = (cam_id, i - 1, i)
                if key not in seen:
                    pairs.append(key)
                    seen.add(key)

    # ── Step 4: 各ペアの境界再計算 ──
    updates = []
    skipped_threshold = 0
    skipped_match = []

    for cam_id, a_idx, b_idx in pairs:
        arr = cur_subs[cam_id]
        a_sub = arr[a_idx]
        b_sub = arr[b_idx]

        a_start = a_sub['absStartSec']
        b_end = b_sub['absEndSec']
        old_boundary = a_sub['absEndSec']
        new_a_text = a_sub['text']

        split_time, last_word = find_boundary(all_words, a_start, b_end, new_a_text)

        if split_time is None:
            skipped_match.append({
                'cam_id': cam_id, 'a_idx': a_idx, 'b_idx': b_idx,
                'a_text': new_a_text, 'b_text': b_sub['text'],
            })
            continue

        delta = split_time - old_boundary

        if abs(delta) < threshold:
            skipped_threshold += 1
            continue

        new_boundary = split_time
        updates.append({
            'cam_id': cam_id, 'a_idx': a_idx, 'b_idx': b_idx,
            'old_boundary': old_boundary,
            'new_boundary': new_boundary,
            'delta': delta,
            'last_word': last_word,
            'a_text': new_a_text,
            'b_text': b_sub['text'],
            'old_a_dur': a_sub['durationSec'],
            'old_b_dur': b_sub['durationSec'],
            'new_a_dur': new_boundary - a_start,
            'new_b_dur': b_end - new_boundary,
        })

    # ── Step 5: レポート出力 ──
    mode = "[DRY-RUN]" if args["dry_run"] else "[APPLY]"
    print()
    print("=" * 60)
    print(f"{mode} タイミング再同期レポート")
    print("=" * 60)
    print(f"  候補ペア:       {len(pairs)}件")
    print(f"  自動更新:       {len(updates)}件")
    print(f"  閾値内スキップ: {skipped_threshold}件 (<{threshold}s)")
    print(f"  マッチ不可:     {len(skipped_match)}件")

    if updates:
        print()
        print("--- 自動更新 ---")
        for u in updates:
            sign = '+' if u['delta'] >= 0 else ''
            print(f"  {u['cam_id']}[{u['a_idx']}]+[{u['b_idx']}]:")
            print(f"    境界: {u['old_boundary']:.3f} -> {u['new_boundary']:.3f} ({sign}{u['delta']:.3f}s) 語「{u['last_word']}」")
            print(f"    [{u['a_idx']}] dur: {u['old_a_dur']:.3f} -> {u['new_a_dur']:.3f}  text: {u['a_text']!r}")
            print(f"    [{u['b_idx']}] dur: {u['old_b_dur']:.3f} -> {u['new_b_dur']:.3f}  text: {u['b_text']!r}")

    if skipped_match:
        print()
        print("--- マッチ不可 (手動対応必要) ---")
        for s in skipped_match:
            print(f"  {s['cam_id']}[{s['a_idx']}]+[{s['b_idx']}]:")
            print(f"    [{s['a_idx']}] {s['a_text']!r}")
            print(f"    [{s['b_idx']}] {s['b_text']!r}")

    # ── 本番適用 ──
    if args["apply"] and updates:
        bak_new = f"{SCRIPT_JSON}.bak.{int(time.time())}"
        shutil.copy2(SCRIPT_JSON, bak_new)
        print(f"\nバックアップ: {bak_new}")

        for u in updates:
            arr = cur_subs[u['cam_id']]
            a_sub = arr[u['a_idx']]
            b_sub = arr[u['b_idx']]
            old_boundary = a_sub['absEndSec']
            new_boundary = u['new_boundary']

            a_sub['absEndSec'] = new_boundary
            a_sub['endSec'] = a_sub.get('endSec', 0) + (new_boundary - old_boundary)

            b_sub['absStartSec'] = new_boundary
            b_sub['startSec'] = b_sub.get('startSec', 0) + (new_boundary - old_boundary)

        # durationSec を absEndSec - absStartSec から再計算
        # (同一テロップが複数ペアで更新された場合のずれを防止)
        touched = set()
        for u in updates:
            touched.add((u['cam_id'], u['a_idx']))
            touched.add((u['cam_id'], u['b_idx']))
        for cam_id, idx in touched:
            s = cur_subs[cam_id][idx]
            s['durationSec'] = s['absEndSec'] - s['absStartSec']

        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")

        print(f"✓ {len(updates)}件の境界時刻を更新しました")

    return 0


if __name__ == "__main__":
    sys.exit(main())

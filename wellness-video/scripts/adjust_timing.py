#!/usr/bin/env python3
"""
adjust_timing.py — word-level タイムスタンプで各テロップの終了時刻を発音に同期する。

処理フロー:
  1. master.json（word timestamps 付き）と public/script.json を読む
  2. 各テロップの absStartSec が属する master セグメントを「包含検索」で特定
     （旧 master.json と新 master.json でセグメント数が異なるため distance 検索ではなく包含を使う）
  3. 同一 master セグメントに紐づく telop グループ単位で処理:
     - グループ先頭の absStartSec → その segment の最初の word start
     - グループ末尾の absEndSec   → その segment の最後の word end
     - 2行以上の分割は元の時間比率を維持しながらスケーリング
  4. 隣接テロップ間の重複を除去（前テロップの end を次 start でキャップ）
  5. script.json を上書き保存 — text は絶対に変更しない
"""

import json
from pathlib import Path

MASTER_PATH = Path("master.json")
SCRIPT_PATH = Path("public/script.json")


# ──────────────────────────────────────────────────────────────
#  マッチング
# ──────────────────────────────────────────────────────────────

def find_containing_seg(segs: list[dict], t: float) -> dict | None:
    """
    時刻 t を含む master セグメントを返す。
    包含 → 最近傍（5秒以内）の順でフォールバック。
    """
    # 1st: seg.start <= t < seg.end（厳密包含）
    for seg in segs:
        if seg["start"] <= t < seg["end"]:
            return seg
    # 2nd: 0.5秒の猶予あり包含
    for seg in segs:
        if seg["start"] - 0.5 <= t <= seg["end"] + 0.5:
            return seg
    # 3rd: 最近傍（5秒以内）
    best = min(segs, key=lambda s: abs(s["start"] - t))
    if abs(best["start"] - t) <= 5.0:
        return best
    return None


def word_span(words: list[dict]) -> tuple[float, float] | None:
    """words リストから発音の開始・終了時刻を返す（なければ None）。"""
    starts = [w["start"] for w in words if "start" in w]
    ends   = [w["end"]   for w in words if "end"   in w]
    if not starts or not ends:
        return None
    return min(starts), max(ends)


# ──────────────────────────────────────────────────────────────
#  グループへの word span 適用
# ──────────────────────────────────────────────────────────────

def apply_word_span_to_group(group: list[dict], w_start: float, w_end: float) -> int:
    """
    同一 master セグメントに紐づく telop グループに word span を適用する。
    - 1件: absStartSec=w_start, absEndSec=w_end に直接セット
    - 複数件: 元の時間比率を [w_start, w_end] にスケーリング
    戻り値: 更新件数
    """
    group.sort(key=lambda e: e["absStartSec"])
    updated = 0

    if len(group) == 1:
        e = group[0]
        changed = (abs(e["absStartSec"] - w_start) > 0.02
                   or abs(e["absEndSec"]   - w_end)   > 0.02)
        if changed:
            e["absStartSec"] = round(w_start, 3)
            e["absEndSec"]   = round(w_end,   3)
            updated = 1
        return updated

    # 複数件: 元のスパンを新スパンにスケーリング
    orig_start = group[0]["absStartSec"]
    orig_end   = group[-1]["absEndSec"]
    orig_total = orig_end - orig_start
    new_total  = w_end - w_start

    if orig_total <= 0 or new_total <= 0:
        return 0

    ratio = new_total / orig_total
    for e in group:
        rel_s = (e["absStartSec"] - orig_start) * ratio
        rel_e = (e["absEndSec"]   - orig_start) * ratio
        new_s = round(w_start + rel_s, 3)
        new_e = round(w_start + rel_e, 3)
        if abs(e["absStartSec"] - new_s) > 0.02 or abs(e["absEndSec"] - new_e) > 0.02:
            e["absStartSec"] = new_s
            e["absEndSec"]   = new_e
            updated += 1

    return updated


# ──────────────────────────────────────────────────────────────
#  main
# ──────────────────────────────────────────────────────────────

def main() -> None:
    for p in [MASTER_PATH, SCRIPT_PATH]:
        if not p.exists():
            print(f"❌ ファイルが見つかりません: {p}")
            raise SystemExit(1)

    master = json.loads(MASTER_PATH.read_text(encoding="utf-8"))
    script = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))

    master_segs = master.get("segments", [])
    has_words = any(seg.get("words") for seg in master_segs)
    if not has_words:
        print("❌ master.json に word-level タイムスタンプがありません。")
        print("   先に「npm run transcribe public/front.mp4」を実行してください。")
        raise SystemExit(1)

    print(f"master.json: {len(master_segs)} セグメント（全 word 付き）")

    # ── 全テロップを absStartSec 順に収集 ──────────────────────
    all_telops: list[dict] = []
    for seg in script["segments"]:
        for entry in script["subtitles"].get(seg["id"], []):
            if entry.get("absStartSec") is not None:
                all_telops.append(entry)
    all_telops.sort(key=lambda e: e["absStartSec"])
    print(f"script.json: {len(all_telops)} テロップ")

    # ── master セグメントごとにグループ化 ─────────────────────
    from collections import defaultdict

    groups: dict[int, list[dict]] = defaultdict(list)
    key_to_seg: dict[int, dict]   = {}

    for entry in all_telops:
        ms = find_containing_seg(master_segs, entry["absStartSec"])
        if ms is None:
            continue
        k = id(ms)
        groups[k].append(entry)
        key_to_seg[k] = ms

    total_updated = 0
    no_words_skip = 0

    for k, group in groups.items():
        ms    = key_to_seg[k]
        words = ms.get("words", [])
        if not words:
            no_words_skip += len(group)
            continue
        span = word_span(words)
        if span is None:
            no_words_skip += len(group)
            continue
        total_updated += apply_word_span_to_group(group, span[0], span[1])

    # ── 隣接テロップの重複を除去 ──────────────────────────────
    all_telops.sort(key=lambda e: e["absStartSec"])
    overlap_fixed = 0
    for i in range(len(all_telops) - 1):
        cur = all_telops[i]
        nxt = all_telops[i + 1]
        if cur["absEndSec"] > nxt["absStartSec"] + 0.001:
            cur["absEndSec"] = round(nxt["absStartSec"], 3)
            overlap_fixed += 1

    # ── 保存 ──────────────────────────────────────────────────
    SCRIPT_PATH.write_text(
        json.dumps(script, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\n✅ タイミング修正完了: {SCRIPT_PATH}")
    print(f"   精密化したテロップ: {total_updated} 件")
    print(f"   重複キャップ修正  : {overlap_fixed} 件")
    print(f"   word データなし   : {no_words_skip} 件（スキップ）")


if __name__ == "__main__":
    main()

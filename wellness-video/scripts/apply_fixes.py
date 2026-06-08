#!/usr/bin/env python3
"""
apply_fixes.py — script.json の字幕テキストを一括修正するスクリプト

使い方:
  python scripts/apply_fixes.py --dry-run   # diff のみ表示（書き込みなし）
  python scripts/apply_fixes.py             # 実際に書き込み
"""

import json
import sys
import os

# ============================================================
# FIXES 配列  (cam_id, index, old_text, new_text)
# ここを編集すれば追加・変更が容易
# ============================================================
FIXES = [
    ("cam-0010", 2, "ことになりました ところが", "ことになりました"),
    ("cam-0010", 3, "ですね実際に病院現場を", "ところがですね実際に病院現場を"),
    ("cam-0029", 1, "ま病院ねかかりつけ医もいるし なんか", "まあ病院ねかかりつけ医もいるし なんか"),
    ("cam-0031", 0, "じゃあね方がすごい多いんですけれども", "っていう方がすごい多いんですけれども"),
    ("cam-0080", 0, "Netflix って", "Netflixっていう"),
    ("cam-0080", 1, "いうですのでですね Don't Di", "番組でですね Don't Die"),
    ("cam-0080", 2, "e っていう番組が", "っていう番組が"),
    ("cam-0100", 3, "資格であるというふうに言いますよね", "視覚であるというふうに言いますよね"),
    ("cam-0101", 1, "自分の脳ですね支配されてしまいが", "自分の脳ですね 支配されてしまいがちなんですね"),
    ("cam-0101", 2, "ちなんですね 結果的にまああの", "結果的にまああの"),
    ("cam-0104", 2, "素晴らしい何兆円と一算を築いた", "素晴らしい何兆円という資産を築いた"),
    ("cam-0108", 1, "見える資産に頭をですね支配さ", "見える資産に頭を支配されたり"),
    ("cam-0108", 2, "れつったりあるいは自分の時間を", "あるいは自分の時間を"),
    ("cam-0186", 1, "年を取ってそろ", "年を取ってそろそろ"),
    ("cam-0186", 2, "そろやばいかもってなってからですね", "やばいかもってなってからですね"),
    ("cam-0228", 0, "そのためにはですねやっぱ治療との", "そのためにはですねやっぱ治療の"),
    ("cam-0264", 0, "患者数を増やすことですかですね収益を", "患者数を増やすことでしかですね収益を"),
    ("cam-0282", 0, "っていうお医者さんに進む人が非常に", "というお医者さんに進む人が非常に"),
    ("cam-0289", 3, "周りはレポの上ですがですね", "我々ウェルネスではですね"),
    ("cam-0336", 0, "っていうそんなことを", "というそんなことを"),
    ("cam-0344", 2, "判定の音で方って変わりますよね", "判定の出方って変わりますよね"),
    ("cam-0367", 1, "大切ですし まああれはればですねある", "大切ですし まあ我々はですねある"),
    ("cam-0375", 2, "やっています これを正義的に", "やっています これを定期的に"),
    ("cam-0381", 2, "オーダーメイドで設計してですね を", "オーダーメイドで設計してですね"),
    ("cam-0395", 3, "お医者さんと365日常に", "お医者さんと365日24時間"),
    ("cam-0442", 0, "要約のサポートだったりということも", "予約のサポートだったりということも"),
    ("cam-0442", 2, "スタンストレスなく", "ストレスなく"),
    ("cam-0442", 3, "シームレスにですね 営業に", "シームレスにですね 医療に"),
    ("cam-0540", 3, "あたりをですねもう it AI を", "あたりをですねもう IT・AI を"),
    ("cam-0568", 0, "としてもらえたらいいかなというふうに", "参考にしてもらえたらいいかなというふうに"),
    ("cam-0574", 0, "ダイビーズゼロっていうね本とかも", "「Die With Zero」っていうね本とかも"),
    ("cam-0593", 0, "っていうのもたくさんあります まあ1", "というのもたくさんあります"),
]

MAX_LEN = 25  # 超過時はスキップ

SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")


def main():
    dry_run = "--dry-run" in sys.argv

    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    subtitles = data.get("subtitles", {})

    applied = 0
    skipped = 0
    warnings = []

    for cam_id, idx, old_text, new_text in FIXES:
        label = f"{cam_id}[{idx}]"

        # --- 存在チェック ---
        if cam_id not in subtitles:
            warnings.append(f"  SKIP {label}: cam_id が subtitles に不在")
            skipped += 1
            continue

        arr = subtitles[cam_id]
        if idx >= len(arr):
            warnings.append(f"  SKIP {label}: index {idx} が範囲外 (len={len(arr)})")
            skipped += 1
            continue

        current = arr[idx]["text"]

        # --- 完全一致チェック ---
        if current != old_text:
            warnings.append(
                f"  SKIP {label}: テキスト不一致\n"
                f"         期待: {old_text!r}\n"
                f"         実際: {current!r}"
            )
            skipped += 1
            continue

        # --- 25字超過チェック ---
        if len(new_text) > MAX_LEN:
            warnings.append(
                f"  SKIP {label}: new_text が {len(new_text)}字 (>{MAX_LEN}字)\n"
                f"         new : {new_text!r}"
            )
            skipped += 1
            continue

        # --- diff 表示 ---
        print(f"  {label}:")
        print(f"    - {old_text!r}")
        print(f"    + {new_text!r}")

        if not dry_run:
            arr[idx]["text"] = new_text

        applied += 1

    # --- サマリー ---
    print(f"\n{'[DRY-RUN] ' if dry_run else ''}適用: {applied}件, スキップ: {skipped}件")

    if warnings:
        print("\n⚠ 警告:")
        for w in warnings:
            print(w)

    # --- 書き込み ---
    if not dry_run and applied > 0:
        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\n✓ {SCRIPT_JSON} を更新しました")

    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

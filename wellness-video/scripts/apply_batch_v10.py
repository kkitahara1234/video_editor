#!/usr/bin/env python3
"""
apply_batch_v10.py — 緊急4件 + cps8件 + ですね21件 + 副詞3件 + combine2件 = 65件
"""
import json, sys, os, re

SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")
MAX_LEN = 25

# (cam_id, idx, new_text, action)
FIXES = [
    ("cam-0034", 1, "ことが非常に多いです なぜですね", "replace"),
    ("cam-0034", 2, "まあこう元気に動けているうちに", "replace"),
    ("cam-0049", 2, "すごく強く痛感しました やっぱり最後の時にですね", "replace"),
    ("cam-0049", 3, "いい人生だったなっていう", "replace"),
    ("cam-0080", 2, "っていう番組があったり", "replace"),
    ("cam-0080", 3, "しますけれども", "replace"),
    ("cam-0108", 2, "あるいは自分の時間をですね", "replace"),
    ("cam-0109", 0, "そういうものにばかり", "replace"),
    ("cam-0122", 0, "今お掃除とかですねそういうのですね", "replace"),
    ("cam-0122", 1, " こう外注して月に", "replace"),
    ("cam-0140", 0, "まあ我々はですね戦略的予防医療ですね", "replace"),
    ("cam-0140", 1, " ストラテジックプリベンション", "replace"),
    ("cam-0150", 4, "むしろ逆効果でですね病気のリスクを高めてしまう", "replace"),
    ("cam-0150", 5, "みたいなことが", "replace"),
    ("cam-0261", 3, "話してこういうこともアドバイスして", "replace"),
    ("cam-0261", 4, "あげたい", "replace"),
    ("cam-0299", 2, "あくまで風邪をひいた時にかかっている", "replace"),
    ("cam-0299", 3, "先生がいるとか", "replace"),
    ("cam-0351", 2, "ないのか っていうことですね", "replace"),
    ("cam-0351", 3, "しっかり分析してこそ検査には意味があるので", "replace"),
    ("cam-0353", 2, "すごく大事ですしやっぱりこう データをですね", "replace"),
    ("cam-0353", 3, "プロと一緒に紐解いていって今の", "replace"),
    ("cam-0370", 1, "というお話をしていきます まずですね", "replace"),
    ("cam-0370", 2, "我々が提供している価値は大きく", "replace"),
    ("cam-0379", 2, "一致しているみたいなのだとですね", "replace"),
    ("cam-0379", 3, "重大な病気が見逃され", "replace"),
    ("cam-0383", 1, "ための課題みたいな", "replace"),
    ("cam-0392", 1, "いっぱいあるし明日も会食だし ", "replace"),
    ("cam-0392", 2, "もう行く時間作れないってなってですね結果的に", "replace"),
    ("cam-0404", 0, "出てこないですし AI もですね", "replace"),
    ("cam-0404", 1, "こういう一時情報というのは", "replace"),
    ("cam-0426", 3, "思っています こういうですね", "replace"),
    ("cam-0426", 4, "戦略的予防医療", "replace"),
    ("cam-0438", 3, "直接コミュニケーションができるように", "replace"),
    ("cam-0438", 4, "なってますので", "replace"),
    ("cam-0455", 2, "いい人間ドック受けるだけでもですね", "replace"),
    ("cam-0455", 3, "20万円30万円とかしますし", "replace"),
    ("cam-0459", 4, "素晴らしいLongevity健康寿命を", "replace"),
    ("cam-0465", 3, "というふうに思っていますですね", "replace"),
    ("cam-0466", 0, "このサービスの基礎となるのがこの", "replace"),
    ("cam-0487", 0, "これを我々のアプリケーション内ではですね", "replace"),
    ("cam-0487", 1, "全てのデータを統合して常に", "replace"),
    ("cam-0491", 1, "ありませんから 実際にそのデータをですね", "replace"),
    ("cam-0491", 2, "一緒に判断してくれるこの", "replace"),
    ("cam-0499", 1, "取ったデータだけではなくてですね", "replace"),
    ("cam-0499", 2, " 自分がいつどういう症状を", "replace"),
    ("cam-0511", 0, "世の中にあるサプリメントもですね", "replace"),
    ("cam-0511", 1, "非常にクオリティがあのね", "replace"),
    ("cam-0516", 3, "こともですね", "replace"),
    ("cam-0516", 4, "しっかり分析できるようになっています", "replace"),
    ("cam-0521", 3, "取ったことによって自分の体がどう変化したか", "replace"),
    ("cam-0521", 4, "っていうのを", "replace"),
    ("cam-0523", 1, "搭載していたりします あくまでですね", "replace"),
    ("cam-0523", 2, "このアプリっていうのは材料の", "replace"),
    ("cam-0534", 0, "そのデータのトレンド分析してですね", "replace"),
    ("cam-0534", 1, "実際に栄養学的に検査医学的に", "replace"),
    ("cam-0540", 3, "あたりをですねもう IT・AI をですね", "replace"),
    ("cam-0540", 4, "駆使してスムーズにしていく", "replace"),
    ("cam-0540", 4, "", "combine_prev_delete"),  # [4]に[5]を吸収、[5]削除
    ("cam-0553", 2, "特徴かなと思います あとはですね", "replace"),
    ("cam-0553", 3, "今までの会員制医療クラブって", "replace"),
    ("cam-0564", 1, "という目的なのであればですね", "replace"),
    ("cam-0564", 2, " いわゆる従来の高級人間ドック", "replace"),
    ("cam-0568", 4, "", "combine_prev_delete"),  # [4]に[5]を吸収、[5]削除
    ("cam-0592", 3, "立ててしっかりと健康を", "replace"),
]

def main():
    dry_run = "--dry-run" in sys.argv

    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    subs = data["subtitles"]

    applied = 0
    skipped = 0
    warnings = []

    # まず replace を全て適用、次に combine 系を降順で適用
    replaces = [(c, i, t, a) for c, i, t, a in FIXES if a == "replace"]
    combines = sorted(
        [(c, i, t, a) for c, i, t, a in FIXES if a in ("combine_next", "combine_prev_delete")],
        key=lambda x: (x[0], -x[1])
    )

    print("=" * 60)
    print(f"修正 {len(FIXES)}件 {'[DRY-RUN]' if dry_run else ''}")
    print("=" * 60)

    # Replace
    for cam_id, idx, new_text, action in replaces:
        label = f"{cam_id}[{idx}]"
        if cam_id not in subs:
            warnings.append(f"  SKIP {label}: cam_id 不在")
            skipped += 1
            continue
        arr = subs[cam_id]
        if idx >= len(arr):
            warnings.append(f"  SKIP {label}: idx 範囲外 (len={len(arr)})")
            skipped += 1
            continue
        if len(new_text) > MAX_LEN:
            warnings.append(f"  SKIP {label}: {len(new_text)}字超過 {new_text!r}")
            skipped += 1
            continue

        old = arr[idx]["text"]
        print(f"  {label}: REPLACE ({len(old)}字->{len(new_text)}字)")
        print(f"    - {old!r}")
        print(f"    + {new_text!r}")

        if not dry_run:
            arr[idx]["text"] = new_text
        applied += 1

    # Combine (combine_next / combine_prev_delete)
    for cam_id, idx, new_text, action in combines:
        if cam_id not in subs:
            warnings.append(f"  SKIP {cam_id}[{idx}]: cam_id 不在")
            skipped += 1
            continue
        arr = subs[cam_id]

        if action == "combine_prev_delete":
            # [idx] に [idx+1] を吸収し、[idx+1] を削除
            if idx + 1 >= len(arr):
                warnings.append(f"  SKIP {cam_id}[{idx}]: 次テロップ不在")
                skipped += 1
                continue
            combined = arr[idx]["text"] + arr[idx + 1]["text"]
            label = f"{cam_id}[{idx}]+[{idx+1}]"
        else:
            # combine_next: [idx] + [idx+1]
            if idx + 1 >= len(arr):
                warnings.append(f"  SKIP {cam_id}[{idx}]+[{idx+1}]: 次テロップ不在")
                skipped += 1
                continue
            combined = new_text if new_text else arr[idx]["text"] + arr[idx + 1]["text"]
            label = f"{cam_id}[{idx}]+[{idx+1}]"

        if len(combined) > MAX_LEN:
            warnings.append(f"  SKIP {label}: 結合後 {len(combined)}字超過 {combined!r}")
            skipped += 1
            continue

        old_a = arr[idx]["text"]
        old_b = arr[idx + 1]["text"]
        print(f"  {label}: COMBINE ({action})")
        print(f"    - [{idx}] {old_a!r} + [{idx+1}] {old_b!r}")
        print(f"    + {combined!r} ({len(combined)}字)")

        if not dry_run:
            arr[idx]["text"] = combined
            arr[idx]["absEndSec"] = arr[idx + 1]["absEndSec"]
            arr[idx]["durationSec"] = arr[idx]["absEndSec"] - arr[idx]["absStartSec"]
            if "endSec" in arr[idx + 1]:
                arr[idx]["endSec"] = arr[idx + 1]["endSec"]
            arr.pop(idx + 1)
        applied += 1

    mode = "[DRY-RUN] " if dry_run else ""
    print(f"\n{mode}適用: {applied}件, スキップ: {skipped}件")

    if warnings:
        print(f"\n⚠ 警告:")
        for w in warnings:
            print(w)

    if not dry_run and applied > 0:
        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\n✓ {SCRIPT_JSON} を更新しました")

    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

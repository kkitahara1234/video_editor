#!/usr/bin/env python3
"""
resync_timing_v3.py — RESPLIT 41件の音声タイミング再同期

Phase 1: master.json でテキストマッチ可能な件を自動再計算
Phase 2 用: マッチ不可の件を一覧表示

使い方:
  python scripts/resync_timing_v3.py --dry-run   # diff のみ表示
  python scripts/resync_timing_v3.py             # 実際に書き込み
"""

import json
import sys
import os
import re
import time

SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")
MASTER_JSON = os.path.join(os.path.dirname(__file__), "..", "master.json")

# ============================================================
# RESPLIT 41件: (cam_id, a_idx, b_idx, new_a, new_b)
# new_a の末尾に対応する master word の end 時刻が新境界
# ============================================================
RESPLIT_ENTRIES = [
    ("cam-0006", 1, 2, "その時に環境の変化で", "喘息という病気になったんですけれども"),
    ("cam-0010", 3, 4, "ところがですね実際に", "病院現場をですね大学5年生ぐらいから実習で"),
    ("cam-0013", 2, 3, "タイミングが悪くてですね", "命を落としてしまう人だったりとか"),
    ("cam-0049", 1, 2, "持っていけないなっていうのを", "すごく強く痛感しました やっぱり最後の"),
    ("cam-0056", 2, 3, "場所に行くのかみたいなことが", "すごく大事だと思ってますので"),
    ("cam-0096", 2, 3, "まあこうある意味", "経営をしていたり投資をしていたりすると"),
    ("cam-0099", 1, 2, "人っていうのが", "すごく多いです やっぱりこう目に見える"),
    ("cam-0165", 1, 2, "把握するっていうことが", "すごく難しいんですよね 戦略っていうのは"),
    ("cam-0181", 1, 2, "ことにはあんまり意味がなくてですね", "過去から自分の体がどう"),
    ("cam-0184", 1, 2, "健康データっていうのを貯めて", "将来のためにですね活用していくっていう"),
    ("cam-0198", 0, 1, "そう考えた時にやっぱ病気になってからですね", "いい医者を探すって"),
    ("cam-0205", 1, 2, "ふうにてんやわんやする方が", "すごく多いんです けれども当たり前の"),
    ("cam-0211", 2, 3, "リスクを事前にしてそもそも病気にならないように", "することの方が圧倒的に価値が"),
    ("cam-0212", 2, 3, "圧倒的にですね皆様の良い人生を送るために", "お力になれるんじゃないかなという"),
    ("cam-0228", 0, 1, "そのためにはですねやっぱ", "治療のスペシャリストとしてやる"),
    ("cam-0234", 3, 4, "入れられてこなかったのかみたいな", "話をさせていただきますとこれはですね"),
    ("cam-0265", 1, 2, "来月来てねっていう話になってしまいがちです", "ということで"),
    ("cam-0274", 1, 2, "こなかった予防医療という領域をですね", "まあ今のテクノロジーも"),
    ("cam-0286", 1, 2, "考えられる先生っていうのが重要になります", "僕自身ももともと"),
    ("cam-0309", 1, 2, "我々パーソナルドクターの仕事になっていますので", "ただかかりつけ医が"),
    ("cam-0324", 0, 1, "今までの人間ドックの意義になっています", "我々はですねこの"),
    ("cam-0333", 0, 1, "まあそもそも今は異常値はなかったけれども", "これは同世代と"),
    ("cam-0350", 0, 1, "あくまで自分が受けるべき", "検査をしっかり受けられたのか でその範囲に"),
    ("cam-0353", 1, 2, "一喜一憂しないということが", "すごく大事ですしやっぱりこう データを"),
    ("cam-0358", 2, 3, "人もですね", "永遠に勉強でできるようにならないですよね"),
    ("cam-0393", 1, 2, "起きています こういうのを防ぐためにですね", "365日ですねもう友達と"),
    ("cam-0408", 2, 3, "発覚した際にはですね", "最適な後悔のない治療を受けられるような"),
    ("cam-0413", 1, 2, "いうのがですね非常に大きな", "付加価値になってきています ただ病気がない"),
    ("cam-0415", 1, 2, "ならないと思っています", "まあ健康になるためにそもそも"),
    ("cam-0431", 3, 4, "なっていくのかということを", "戦略会議をしてしっかりアドバイスをしていく"),
    ("cam-0445", 2, 3, "そこでですね", "新しい体験をしていただいたり新しい仲間を"),
    ("cam-0451", 1, 2, "価値提供に対しての", "価格設定をしていますので 月額5万円というこの"),
    ("cam-0475", 2, 3, "作っている というのが基本になるんですが", "我々が作っているこの"),
    ("cam-0483", 2, 3, "すごく大事ですし", "自分の体が全体としてどうなっているかということを"),
    ("cam-0485", 0, 1, "考えるということが", "ものすごく大事なんですが基本的な世の中の"),
    ("cam-0498", 2, 3, "相談のデータというのも", "すべて記録として残るようになっています"),
    ("cam-0513", 1, 2, "このアプリケーション内でですね", "ショップ機能っていうのが"),
    ("cam-0545", 2, 3, "というところが特徴になっています", "あとはですね今までの"),
    ("cam-0569", 0, 1, "提供しているのかみたいな", "話をしてきました まあ本当にですねあの"),
    ("cam-0571", 1, 2, "仕事もですね人生も遊びも全て", "健康がなくなってしまってはすべて"),
    ("cam-0592", 0, 1, "もうどうしようもない難病になってしまうこととか", "残念ながら"),
]


def normalize(text):
    """句読点・スペース・全角スペースを除去"""
    return re.sub(r'[、。,.\s　]', '', text)


def find_split_time(all_words, a_start, b_end, new_a_text):
    """
    master.json の words から、new_a_text の末尾に対応する word の end 時刻を探す。

    方式:
      1. [a_start - 1.0, b_end + 0.5] の範囲の words を取得（前後余裕を持つ）
      2. words を順に歩き、正規化テキストを累積
      3. 累積末尾が new_a の正規化テキストに一致したら (endswith)、その word の end を返す
      4. 複数文字 word の途中で一致する場合は、文字位置で線形補間

    Returns: (split_time, last_word, master_cum_text) or (None, None, cum_text)
    """
    # 前方に余裕を持たせて検索（テロップ境界が word 途中にある場合に対応）
    range_words = [w for w in all_words
                   if w['start'] >= a_start - 1.0 and w['end'] <= b_end + 0.5]

    norm_target = normalize(new_a_text)
    if not norm_target:
        return None, None, ""

    # Pass 1: word 境界での suffix 一致
    cum = ""
    for w in range_words:
        cum += normalize(w['word'])
        if cum.endswith(norm_target) and len(cum) >= len(norm_target):
            return w['end'], w['word'], cum
        if len(cum) > len(norm_target) * 2 + 20:
            break

    # Pass 2: 文字単位での suffix 一致（multi-char word の途中分割）
    cum = ""
    for w in range_words:
        word_norm = normalize(w['word'])
        for ci, ch in enumerate(word_norm):
            cum += ch
            if cum.endswith(norm_target) and len(cum) >= len(norm_target):
                # word 内の位置で線形補間
                frac = (ci + 1) / len(word_norm)
                t = w['start'] + (w['end'] - w['start']) * frac
                return t, w['word'], cum
        if len(cum) > len(norm_target) * 2 + 20:
            break

    return None, None, cum


def get_master_text_for_range(all_words, start, end):
    """指定時間範囲内の master words を連結して返す"""
    words = [w for w in all_words
             if w['start'] >= start - 0.1 and w['end'] <= end + 0.1]
    return ''.join(w['word'] for w in words)


def main():
    dry_run = "--dry-run" in sys.argv

    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    with open(MASTER_JSON, "r", encoding="utf-8") as f:
        master = json.load(f)

    # バックアップ (本番時のみ)
    if not dry_run:
        bak = f"{SCRIPT_JSON}.bak.{int(time.time())}"
        with open(bak, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"バックアップ: {bak}\n")

    subtitles = data.get("subtitles", {})

    # Build flat word list
    all_words = []
    for seg in master['segments']:
        for w in seg['words']:
            all_words.append(w)

    applied = 0
    skipped = 0
    failures = []

    print("=" * 70)
    print("RESPLIT タイミング再同期")
    print("=" * 70)

    for cam_id, a_idx, b_idx, new_a, new_b in RESPLIT_ENTRIES:
        label = f"{cam_id}[{a_idx}]+[{b_idx}]"

        if cam_id not in subtitles:
            print(f"  SKIP {label}: cam_id 不在")
            skipped += 1
            continue

        arr = subtitles[cam_id]
        if a_idx >= len(arr) or b_idx >= len(arr):
            print(f"  SKIP {label}: index 範囲外")
            skipped += 1
            continue

        a_sub = arr[a_idx]
        b_sub = arr[b_idx]

        # テキスト確認
        if a_sub['text'] != new_a:
            print(f"  SKIP {label}: [a] テキスト不一致")
            print(f"    期待: {new_a!r}")
            print(f"    実際: {a_sub['text']!r}")
            skipped += 1
            continue
        if b_sub['text'] != new_b:
            print(f"  SKIP {label}: [b] テキスト不一致")
            print(f"    期待: {new_b!r}")
            print(f"    実際: {b_sub['text']!r}")
            skipped += 1
            continue

        a_start = a_sub['absStartSec']
        b_end = b_sub['absEndSec']
        old_boundary = a_sub['absEndSec']

        # master.json から新境界を取得
        split_time, last_word, cum_text = find_split_time(
            all_words, a_start, b_end, new_a)

        if split_time is None:
            master_a_text = get_master_text_for_range(all_words, a_start, old_boundary)
            master_b_text = get_master_text_for_range(all_words, old_boundary, b_end)
            failures.append({
                'cam_id': cam_id, 'a_idx': a_idx, 'b_idx': b_idx,
                'script_a': new_a, 'script_b': new_b,
                'master_a': master_a_text, 'master_b': master_b_text,
                'range': f"{a_start:.3f}-{b_end:.3f}",
            })
            print(f"  SKIP {label}: master.json テキストマッチ不可")
            skipped += 1
            continue

        # 新しい timing 計算
        new_boundary = split_time
        old_a_dur = a_sub['durationSec']
        old_b_dur = b_sub['durationSec']
        new_a_dur = new_boundary - a_start
        new_b_dur = b_end - new_boundary

        delta = new_boundary - old_boundary

        # diff 表示
        sign = '+' if delta >= 0 else ''
        print(f"  {label}:")
        print(f"    境界: {old_boundary:.3f} -> {new_boundary:.3f} ({sign}{delta:.3f}s)")
        print(f"    [{a_idx}].absEndSec:   {old_boundary:.3f} -> {new_boundary:.3f}")
        print(f"    [{b_idx}].absStartSec: {old_boundary:.3f} -> {new_boundary:.3f}")
        print(f"    [{a_idx}].durationSec: {old_a_dur:.3f} -> {new_a_dur:.3f}")
        print(f"    [{b_idx}].durationSec: {old_b_dur:.3f} -> {new_b_dur:.3f}")
        print(f"    境界語「{last_word}」のend時刻に同期")

        if not dry_run:
            a_sub['absEndSec'] = new_boundary
            a_sub['durationSec'] = new_a_dur
            a_sub['endSec'] = a_sub.get('endSec', 0) + (new_boundary - old_boundary)

            b_sub['absStartSec'] = new_boundary
            b_sub['durationSec'] = new_b_dur
            b_sub['startSec'] = b_sub.get('startSec', 0) + (new_boundary - old_boundary)

        applied += 1

    # サマリー
    mode = "[DRY-RUN] " if dry_run else ""
    print()
    print("=" * 70)
    print(f"{mode}適用: {applied}件, スキップ: {skipped}件 / 全{applied + skipped}件")
    print("=" * 70)

    # Phase 2 用: マッチ不可一覧
    if failures:
        print()
        print("=" * 70)
        print(f"Phase 2 用: テキストマッチ不可 {len(failures)}件")
        print("=" * 70)
        for f in failures:
            print(f"  {f['cam_id']}[{f['a_idx']}]+[{f['b_idx']}]  range: {f['range']}")
            print(f"    script [a]: {f['script_a']!r}")
            print(f"    script [b]: {f['script_b']!r}")
            print(f"    master [a]: {f['master_a']!r}")
            print(f"    master [b]: {f['master_b']!r}")
            print()

    # 書き込み
    if not dry_run and applied > 0:
        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\n✓ {SCRIPT_JSON} を更新しました")

    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

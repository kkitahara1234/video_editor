#!/usr/bin/env python3
"""
apply_fixes_v2.py — script.json の字幕テキスト一括修正 (第2弾: 75件)

3種類の修正型に対応:
  TYPE_A: COMBINE (結合+削除)
  TYPE_B: RESPLIT (2テロップ同時テキスト修正)
  TYPE_C: SINGLE  (単体テキスト置換)

使い方:
  python scripts/apply_fixes_v2.py --dry-run   # diff のみ表示（書き込みなし）
  python scripts/apply_fixes_v2.py             # 実際に書き込み
"""

import json
import sys
import os

MAX_LEN = 25
SCRIPT_JSON = os.path.join(os.path.dirname(__file__), "..", "public", "script.json")

# ============================================================
# TYPE_A: COMBINE型 (cam_id, a_idx, b_idx, old_a, old_b, new_a)
# [a] のテキストを new_a に置換し、[a] の absEndSec を [b] に拡張、[b] を削除
# ============================================================
COMBINE_FIXES = [
    ("cam-0022", 4, 5, "というまあアメリカにですね留学に", "行って", "というまあアメリカにですね留学に行って"),
    ("cam-0055", 4, 5, "バランスをとって健康な生活を送りつつ", "自分が", "バランスをとって健康な生活を送りつつ自分が"),
    ("cam-0060", 2, 3, "基本的にはやっぱり病気に", "ならないとか病気を早く", "基本的にはやっぱり病気にならないとか病気を早く"),
    ("cam-0078", 1, 2, "生きるっていうことなんですけれども", "皆さん", "生きるっていうことなんですけれども 皆さん"),
    ("cam-0134", 3, 4, "自分の健康を取り戻すことにすべての", "脳が", "自分の健康を取り戻すことにすべての脳が"),
    ("cam-0170", 2, 3, "自分の健康なですねいい人生を送る", "ための柱になる", "自分の健康なですねいい人生を送るための柱になる"),
    ("cam-0211", 3, 4, "ならないようにすることの方が圧倒的に", "価値が", "ならないようにすることの方が圧倒的に価値が"),
    ("cam-0246", 2, 3, "人に対して 血圧を下げる指導を", "させていただくとか", "人に対して 血圧を下げる指導をさせていただくとか"),
    ("cam-0252", 3, 4, "例えばですけど先生ここがちょっと", "痛くて", "例えばですけど先生ここがちょっと痛くて"),
    ("cam-0253", 3, 4, "対してですね診断をして検査をして話を", "聞いて", "対してですね診断をして検査をして話を聞いて"),
    ("cam-0254", 2, 3, "いう ことは保険診療で", "できるわけなんですけれども", "いう ことは保険診療でできるわけなんですけれども"),
    ("cam-0276", 0, 1, "我々の存在意義に", "なっています 我々ですねこの", "我々の存在意義になっています 我々ですねこの"),
    ("cam-0294", 2, 3, "話さないようなですねこの病気に", "させない早く見つける", "話さないようなですねこの病気にさせない早く見つける"),
    ("cam-0295", 2, 3, "チームを作っている というのが特徴に", "なっています", "チームを作っている というのが特徴になっています"),
    ("cam-0311", 0, 1, "ですけれどもそもそも病気に", "ならないための戦略って", "ですけれどもそもそも病気にならないための戦略って"),
    ("cam-0319", 1, 2, "生まれた発生の根元に", "なっています なのであくまで", "生まれた発生の根元になっています なのであくまで"),
    ("cam-0373", 1, 2, "その課題やリスク分 あの防ぐ", "ためにですね", "その課題やリスク分 あの防ぐためにですね"),
    ("cam-0397", 3, 4, "ちょっとした壁打ちを365に常に", "できますよと", "ちょっとした壁打ちを365日24時間できますよと"),
    ("cam-0411", 1, 2, "提供している2つ目の価値に", "なっています", "提供している2つ目の価値になっています"),
    ("cam-0439", 4, 5, "いいですねとかこれはちょっと診断を", "受けて", "いいですねとかこれはちょっと診断を受けて"),
    ("cam-0448", 2, 3, "受けてもらってどんどんどんどん単価を", "上げて", "受けてもらってどんどんどんどん単価を上げて"),
    ("cam-0461", 3, 4, "リーズナブルな投資に", "なるんじゃないかなというふうに", "リーズナブルな投資になるんじゃないかなというふうに"),
    ("cam-0466", 0, 1, "ですねこのサービスの基礎と", "なるですねのがこの", "ですねこのサービスの基礎となるですねのがこの"),
    ("cam-0468", 4, 5, "言ってパーソナルヘルスケアレコードっていう", "もの", "言ってパーソナルヘルスケアレコードっていうもの"),
    ("cam-0492", 2, 3, "というのが特徴に", "なっています あとはですね我々この", "というのが特徴になっています あとはですね我々この"),
    ("cam-0496", 8, 9, "なっていましてそしてその相談をした", "ログ", "なっていましてそしてその相談をしたログ"),
    ("cam-0526", 2, 3, "というのを作っている という形に", "なっています", "というのを作っている という形になっています"),
    ("cam-0572", 3, 4, "ものばかり追いかけてしまうんですが", "最近", "ものばかり追いかけてしまうんですが 最近"),
]

# ============================================================
# TYPE_B: RESPLIT型 (cam_id, a_idx, b_idx, old_a, old_b, new_a, new_b)
# [a] と [b] のテキストのみ同時修正。タイミングは変更しない
# ============================================================
RESPLIT_FIXES = [
    ("cam-0006", 1, 2, "その時に環境の変化で喘息という病気に", "なったんですけれども", "その時に環境の変化で", "喘息という病気になったんですけれども"),
    ("cam-0010", 3, 4, "ところがですね実際に病院現場を", "ですね大学5年生ぐらいから実習で", "ところがですね実際に", "病院現場をですね大学5年生ぐらいから実習で"),
    ("cam-0013", 2, 3, "タイミングが悪くてですね命を落と", "してしまう人だったりとか", "タイミングが悪くてですね", "命を落としてしまう人だったりとか"),
    ("cam-0049", 1, 2, "持っていけないなっていうのをすごく", "強く痛感しました やっぱり最後の", "持っていけないなっていうのを", "すごく強く痛感しました やっぱり最後の"),
    ("cam-0056", 2, 3, "場所に行くのかみたいなことがすごく", "大事だと思ってますので", "場所に行くのかみたいなことが", "すごく大事だと思ってますので"),
    ("cam-0096", 2, 3, "まあこうある意味経営を", "していたり投資をしていたりすると", "まあこうある意味", "経営をしていたり投資をしていたりすると"),
    ("cam-0099", 1, 2, "人っていうのがすごく", "多いです やっぱりこう目に見える", "人っていうのが", "すごく多いです やっぱりこう目に見える"),
    ("cam-0165", 1, 2, "把握するっていうことがすごく", "難しいんですよね 戦略っていうのは", "把握するっていうことが", "すごく難しいんですよね 戦略っていうのは"),
    ("cam-0181", 1, 2, "ことにはあんまり意味が", "なくてですね 過去から自分の体がどう", "ことにはあんまり意味がなくてですね", "過去から自分の体がどう"),
    ("cam-0184", 1, 2, "健康データっていうのを貯めて将来の", "ためにですね活用していくっていう", "健康データっていうのを貯めて", "将来のためにですね活用していくっていう"),
    ("cam-0198", 0, 1, "そう考えた時にやっぱ病気に", "なってからですね いい医者を探すって", "そう考えた時にやっぱ病気になってからですね", "いい医者を探すって"),
    ("cam-0205", 1, 2, "ふうにてんやわんやする方がすごく", "多いんです けれども当たり前の", "ふうにてんやわんやする方が", "すごく多いんです けれども当たり前の"),
    ("cam-0211", 2, 3, "リスクを事前にしてそもそも病気に", "ならないようにすることの方が圧倒的に", "リスクを事前にしてそもそも病気にならないように", "することの方が圧倒的に"),
    ("cam-0212", 2, 3, "圧倒的にですね皆様の良い人生を送る", "ためにお力になれるんじゃないかなという", "圧倒的にですね皆様の良い人生を送るために", "お力になれるんじゃないかなという"),
    ("cam-0228", 0, 1, "そのためにはですねやっぱ治療の", "ですねスペシャリストとしてやる", "そのためにはですねやっぱ", "治療のスペシャリストとしてやる"),
    ("cam-0234", 3, 4, "入れられてこなかったのかみたいな話を", "させていただきますとこれはですね", "入れられてこなかったのかみたいな", "話をさせていただきますとこれはですね"),
    ("cam-0265", 1, 2, "来月来てねっていう話に", "なってしまいがちです ということで", "来月来てねっていう話になってしまいがちです", "ということで"),
    ("cam-0274", 1, 2, "こなかった予防医療という領域を", "ですね まあ今のテクノロジーも", "こなかった予防医療という領域をですね", "まあ今のテクノロジーも"),
    ("cam-0286", 1, 2, "考えられる先生っていうのが重要に", "なります 僕自身ももともと", "考えられる先生っていうのが重要になります", "僕自身ももともと"),
    ("cam-0309", 1, 2, "我々パーソナルドクターの仕事に", "なっていますので ただかかりつけ医が", "我々パーソナルドクターの仕事になっていますので", "ただかかりつけ医が"),
    ("cam-0324", 0, 1, "今までの人間ドックの意義に", "なっています 我々はですねこの", "今までの人間ドックの意義になっています", "我々はですねこの"),
    ("cam-0333", 0, 1, "まあそもそも今は異常値は", "なかったけれども これは同世代と", "まあそもそも今は異常値はなかったけれども", "これは同世代と"),
    ("cam-0350", 0, 1, "あくまで自分が受けるべき検査を", "しっかり受けられたのか でその範囲に", "あくまで自分が受けるべき", "検査をしっかり受けられたのか でその範囲に"),
    ("cam-0353", 1, 2, "一喜一憂しないということがすごく", "大事ですしやっぱりこう データを", "一喜一憂しないということが", "すごく大事ですしやっぱりこう データを"),
    ("cam-0358", 2, 3, "人もですね 永遠に勉強で", "できるようにならないですよね", "人もですね", "永遠に勉強でできるようにならないですよね"),
    ("cam-0393", 1, 2, "起きています こういうのを防ぐ", "ためにですね365日ですねもう友達と", "起きています こういうのを防ぐためにですね", "365日ですねもう友達と"),
    ("cam-0408", 2, 3, "発覚した際にはですね 最適な後悔の", "ない治療を受けられるような", "発覚した際にはですね", "最適な後悔のない治療を受けられるような"),
    ("cam-0413", 1, 2, "いうのがですね非常に大きな付加価値に", "なってきています ただ病気がない", "いうのがですね非常に大きな", "付加価値になってきています ただ病気がない"),
    ("cam-0415", 1, 2, "ならないと思っています まあ健康に", "なるためにそもそも", "ならないと思っています", "まあ健康になるためにそもそも"),
    ("cam-0431", 3, 4, "なっていくのかということを戦略会議を", "してしっかりアドバイスをしていく", "なっていくのかということを", "戦略会議をしてしっかりアドバイスをしていく"),
    ("cam-0445", 2, 3, "そこでですね 新しい体験を", "していただいたり新しい仲間を", "そこでですね", "新しい体験をしていただいたり新しい仲間を"),
    ("cam-0451", 1, 2, "価値提供に対しての価格設定を", "していますので 月額5万円というこの", "価値提供に対しての", "価格設定をしていますので 月額5万円というこの"),
    ("cam-0475", 2, 3, "作っている というのが基本に", "なるんですが我々が作っているこの", "作っている というのが基本になるんですが", "我々が作っているこの"),
    ("cam-0483", 2, 3, "すごく大事ですし 自分の体が全体と", "してどうなっているかということを", "すごく大事ですし", "自分の体が全体としてどうなっているかということを"),
    ("cam-0485", 0, 1, "考えるということがものすごく", "大事なんですが基本的な世の中の", "考えるということが", "ものすごく大事なんですが基本的な世の中の"),
    ("cam-0498", 2, 3, "相談のデータというのもすべて記録と", "して残るようになっています", "相談のデータというのも", "すべて記録として残るようになっています"),
    ("cam-0513", 1, 2, "このアプリケーション内で", "ですねショップ機能っていうのが", "このアプリケーション内でですね", "ショップ機能っていうのが"),
    ("cam-0545", 2, 3, "というところが特徴に", "なっています あとはですね今までの", "というところが特徴になっています", "あとはですね今までの"),
    ("cam-0569", 0, 1, "提供しているのかみたいな話を", "してきました まあ本当にですねあの", "提供しているのかみたいな", "話をしてきました まあ本当にですねあの"),
    ("cam-0571", 1, 2, "仕事もですね人生も遊びも全て健康が", "なくなってしまってはすべて", "仕事もですね人生も遊びも全て", "健康がなくなってしまってはすべて"),
    ("cam-0592", 0, 1, "もうどうしようもない難病に", "なってしまうこととか残念ながら", "もうどうしようもない難病になってしまうこととか", "残念ながら"),
]

# ============================================================
# TYPE_C: SINGLE型 (cam_id, idx, old_text, new_text)
# 単体テキスト置換
# ============================================================
SINGLE_FIXES = [
    ("cam-0145", 1, "によってみんなそれで元気に", "によってみんなそれで"),
    ("cam-0145", 2, "なるんですよみたいなですね 歌い", "元気になるんですよみたいなですね"),
    ("cam-0145", 3, "文句のものがいっぱい", "歌い文句のものがいっぱい"),
]


def check_cam(subtitles, cam_id, idx, label, warnings):
    """cam_id と idx の存在チェック。OK なら True"""
    if cam_id not in subtitles:
        warnings.append(f"  SKIP {label}: cam_id が subtitles に不在")
        return False
    if idx >= len(subtitles[cam_id]):
        warnings.append(f"  SKIP {label}: index {idx} が範囲外 (len={len(subtitles[cam_id])})")
        return False
    return True


def check_text(actual, expected, label, which, warnings):
    """テキスト一致チェック。OK なら True"""
    if actual != expected:
        warnings.append(
            f"  SKIP {label}: {which} テキスト不一致\n"
            f"         期待: {expected!r}\n"
            f"         実際: {actual!r}"
        )
        return False
    return True


def check_length(text, label, which, warnings):
    """25字以内チェック。OK なら True"""
    if len(text) > MAX_LEN:
        warnings.append(
            f"  SKIP {label}: {which} が {len(text)}字 (>{MAX_LEN}字)\n"
            f"         text: {text!r}"
        )
        return False
    return True


def process_combine(subtitles, dry_run):
    """TYPE_A: COMBINE 処理"""
    applied = 0
    skipped = 0
    warnings = []

    # b_idx の大きい順にソート（同一 cam_id 内で削除時にインデックスがずれないように）
    sorted_fixes = sorted(COMBINE_FIXES, key=lambda x: (x[0], -x[2]))

    for cam_id, a_idx, b_idx, old_a, old_b, new_a in sorted_fixes:
        label = f"COMBINE {cam_id}[{a_idx}]+[{b_idx}]"

        # 存在チェック
        if not check_cam(subtitles, cam_id, a_idx, label, warnings):
            skipped += 1
            continue
        if not check_cam(subtitles, cam_id, b_idx, label, warnings):
            skipped += 1
            continue

        arr = subtitles[cam_id]
        cur_a = arr[a_idx]["text"]
        cur_b = arr[b_idx]["text"]

        # テキスト一致チェック
        if not check_text(cur_a, old_a, label, "[a]", warnings):
            skipped += 1
            continue
        if not check_text(cur_b, old_b, label, "[b]", warnings):
            skipped += 1
            continue

        # 25字チェック
        if not check_length(new_a, label, "new_a", warnings):
            skipped += 1
            continue

        # diff 表示
        print(f"  {label}:")
        print(f"    [a] - {cur_a!r}")
        print(f"    [b] - {cur_b!r}")
        print(f"    [a] + {new_a!r}")
        print(f"    [b]   (削除)")
        b_end = arr[b_idx].get("absEndSec")
        if b_end is not None:
            old_end = arr[a_idx].get("absEndSec")
            old_dur = arr[a_idx].get("durationSec")
            new_dur = b_end - arr[a_idx].get("absStartSec", 0)
            print(f"    timing: absEndSec {old_end} -> {b_end}, durationSec {old_dur} -> {new_dur}")

        if not dry_run:
            # テキスト置換
            arr[a_idx]["text"] = new_a
            # タイミング拡張
            b_abs_end = arr[b_idx].get("absEndSec")
            if b_abs_end is not None:
                arr[a_idx]["absEndSec"] = b_abs_end
                a_start = arr[a_idx].get("absStartSec", 0)
                arr[a_idx]["durationSec"] = b_abs_end - a_start
            b_end_sec = arr[b_idx].get("endSec")
            if b_end_sec is not None:
                arr[a_idx]["endSec"] = b_end_sec
            # フレーム関連があればコピー
            for fk in ("absEndFrame", "endFrame"):
                if fk in arr[b_idx]:
                    arr[a_idx][fk] = arr[b_idx][fk]
            # [b] 削除
            arr.pop(b_idx)

        applied += 1

    return applied, skipped, warnings


def process_resplit(subtitles, dry_run):
    """TYPE_B: RESPLIT 処理"""
    applied = 0
    skipped = 0
    warnings = []

    for cam_id, a_idx, b_idx, old_a, old_b, new_a, new_b in RESPLIT_FIXES:
        label = f"RESPLIT {cam_id}[{a_idx}]+[{b_idx}]"

        if not check_cam(subtitles, cam_id, a_idx, label, warnings):
            skipped += 1
            continue
        if not check_cam(subtitles, cam_id, b_idx, label, warnings):
            skipped += 1
            continue

        arr = subtitles[cam_id]
        cur_a = arr[a_idx]["text"]
        cur_b = arr[b_idx]["text"]

        if not check_text(cur_a, old_a, label, "[a]", warnings):
            skipped += 1
            continue
        if not check_text(cur_b, old_b, label, "[b]", warnings):
            skipped += 1
            continue

        if not check_length(new_a, label, "new_a", warnings):
            skipped += 1
            continue
        if not check_length(new_b, label, "new_b", warnings):
            skipped += 1
            continue

        print(f"  {label}:")
        print(f"    [a] - {cur_a!r}")
        print(f"    [a] + {new_a!r}")
        print(f"    [b] - {cur_b!r}")
        print(f"    [b] + {new_b!r}")

        if not dry_run:
            arr[a_idx]["text"] = new_a
            arr[b_idx]["text"] = new_b

        applied += 1

    return applied, skipped, warnings


def process_single(subtitles, dry_run):
    """TYPE_C: SINGLE 処理"""
    applied = 0
    skipped = 0
    warnings = []

    for cam_id, idx, old_text, new_text in SINGLE_FIXES:
        label = f"SINGLE {cam_id}[{idx}]"

        if not check_cam(subtitles, cam_id, idx, label, warnings):
            skipped += 1
            continue

        arr = subtitles[cam_id]
        cur = arr[idx]["text"]

        if not check_text(cur, old_text, label, "", warnings):
            skipped += 1
            continue

        if not check_length(new_text, label, "new", warnings):
            skipped += 1
            continue

        print(f"  {label}:")
        print(f"    - {cur!r}")
        print(f"    + {new_text!r}")

        if not dry_run:
            arr[idx]["text"] = new_text

        applied += 1

    return applied, skipped, warnings


def main():
    dry_run = "--dry-run" in sys.argv

    with open(SCRIPT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    subtitles = data.get("subtitles", {})

    total_applied = 0
    total_skipped = 0
    all_warnings = []

    # --- TYPE_A: COMBINE ---
    print("=" * 50)
    print("TYPE_A: COMBINE (結合+削除) 28件")
    print("=" * 50)
    a, s, w = process_combine(subtitles, dry_run)
    total_applied += a
    total_skipped += s
    all_warnings.extend(w)
    print(f"  => 適用: {a}件, スキップ: {s}件\n")

    # --- TYPE_B: RESPLIT ---
    print("=" * 50)
    print("TYPE_B: RESPLIT (2テロップ同時修正) 44件")
    print("=" * 50)
    # Note: v1 の修正で cam-0228[0] と cam-0010[2,3] は既に変更済みの可能性あり
    # old_text 一致チェックで検出される
    a, s, w = process_resplit(subtitles, dry_run)
    total_applied += a
    total_skipped += s
    all_warnings.extend(w)
    print(f"  => 適用: {a}件, スキップ: {s}件\n")

    # --- TYPE_C: SINGLE ---
    print("=" * 50)
    print("TYPE_C: SINGLE (単体テキスト置換) 3件")
    print("=" * 50)
    a, s, w = process_single(subtitles, dry_run)
    total_applied += a
    total_skipped += s
    all_warnings.extend(w)
    print(f"  => 適用: {a}件, スキップ: {s}件\n")

    # --- サマリー ---
    mode = "[DRY-RUN] " if dry_run else ""
    print("=" * 50)
    print(f"{mode}合計: 適用 {total_applied}件, スキップ {total_skipped}件 / 全{total_applied + total_skipped}件")
    print("=" * 50)

    if all_warnings:
        print("\n⚠ 警告:")
        for w in all_warnings:
            print(w)

    # --- 書き込み ---
    if not dry_run and total_applied > 0:
        with open(SCRIPT_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\n✓ {SCRIPT_JSON} を更新しました")

    return 0 if total_skipped == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

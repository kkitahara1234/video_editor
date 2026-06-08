#!/usr/bin/env python3
"""
rebuild_telops.py — master.json の word-level データから telop を自然な塊で再構成する。

方針:
  - Whisper セグメント = 自然な発話区切り → 基本的に 1 セグメント = 1 テロップ
  - テキストが長い場合のみ、Whisper が挿入したスペース（≒ 発話の間）を優先分割点とする
  - それでも長い場合は助詞の直後 → 中央フォールバック
  - 各テロップの absStartSec/absEndSec は word-level タイムスタンプで精密設定
  - text は prepare.ts 相当の補正 + dictionary.json を適用（CSV 手動補正は再適用が必要）
"""

import json
import re
from pathlib import Path

MASTER_PATH = Path("master.json")
SCRIPT_PATH = Path("public/script.json")
DICT_PATH   = Path("dictionary.json")

MAX_CHARS = 28   # これを超えたら分割候補を探す
MIN_SPLIT = 7    # 分割後の最短パーツ文字数（これ未満にはしない）

# この内部スペースを分割点に使ってはいけない固有フレーズ（長い順）
# 内部スペースを一時的に PLACEHOLDER に置換して分割ロジックから隠す
PLACEHOLDER = "\ufffe"
PROTECTED_PHRASES = [
    "Dr.中田 The Well-being",  # 複合は単体より先
    "The Well-being",
    "CROSS FM",
    "AiHUB株式会社 CMO",       # 社名+役職は一塊
    "Pinyokio株式会社 CEO",
    "Mr.Children",
    "WHITE SCORPION",
    "Rain Tree",
]


# ──────────────────────────────────────────────────────────────
#  テキスト補正（prepare.ts cleanAndSplit 相当を Python で再現）
# ──────────────────────────────────────────────────────────────

def apply_corrections(text: str, dictionary: dict) -> str:
    text = text.strip().replace("/", "")

    # 放送局名
    text = re.sub(r"クロス\s?FM", "CROSS FM", text)

    # Well-being（二重変換防止 → 英語バリアント → ザ付き → カタカナバリアント正規化）
    text = re.sub(r"[Tt]he\s+[Tt]he\s+[Ww]ell[\s\-]?[Bb]eing", "The Well-being", text)
    text = re.sub(r"[Tt]he\s+[Ww]ell\s*[Bb]eing", "The Well-being", text)   # The Wellbeing / The Well Being
    text = re.sub(r"ザ[・\s]*(?:ウェルビーイング|ウェルビーング|ウェルビング|ウェルヴィング)",
                  "The Well-being", text, flags=re.IGNORECASE)
    text = re.sub(r"ザ[・\s]+[Tt]he\s+[Ww]ell[\s\-]?[Bb]eing", "The Well-being", text)
    text = re.sub(r"ウェルビーング|ウェルビング|ウェルヴィング", "ウェルビーイング", text, flags=re.IGNORECASE)

    # 人名（Dr. 系を先に処理してから残りを修正）
    text = re.sub(r"(?:Dr\.|ドクター|どくたー)\s*(?:中田|なかた)", "Dr.中田", text)
    text = re.sub(r"中多", "中田", text)
    text = re.sub(r"なかた", "中田", text)
    text = re.sub(r"中田\s*(?:こう太郎|光太郎|康太郎|孝太郎|幸太郎|好太郎|広太郎|皇太郎|弘太郎)", "中田航太郎", text)
    # ラベル除去後に残る名前バリアント（例: 「中田 弘太郎でした」→ 除去後「弘太郎でした」）
    text = text.replace("弘太郎", "航太郎")
    text = re.sub(r"橋本(?:まき|マキ|真樹|真紀|真記|万喜|牧)", "橋本真希", text)

    # くりえみ のバリアント
    text = re.sub(r"栗[江恵]美|くりえ美|クリえみ|クリエみ", "くりえみ", text)

    # 準レギュラー
    text = re.sub(r"じゅんレギュラー|純レギュラー|準れぎゅらー|準レぎゅらー|準れギュラー", "準レギュラー", text)

    # 社名（ビニョキオ → ピニョキオ → 辞書でさらに変換）
    text = re.sub(r"ビニョキオ", "ピニョキオ", text)

    # 慣用句・誤変換
    text = re.sub(r"痴漢アイドル", "地下アイドル", text)
    text = re.sub(r"トレンドドセンターど真ん中", "トレンドのど真ん中", text)
    text = re.sub(r"重稼働", "重労働", text)
    text = re.sub(r"人事を尽くして天命を持つ", "人事を尽くして天命を待つ", text)
    text = re.sub(r"浮遊そうめ", "富裕層", text)
    text = re.sub(r"握手紙", "握手会", text)
    text = re.sub(r"前得点回", "前特典会", text)
    text = re.sub(r"後得点回", "後特典会", text)
    text = re.sub(r"ウルルくん", "ヒルルク", text)
    text = re.sub(r"肝付く", "気づく", text)

    # 句読点除去（表示用）
    text = re.sub(r"[、。！？]", "", text)

    # 辞書補正
    for old, new in dictionary.items():
        text = text.replace(old, new)

    return text.strip()


# ──────────────────────────────────────────────────────────────
#  分割ロジック
# ──────────────────────────────────────────────────────────────

def _protect(text: str) -> str:
    """保護フレーズ内のスペースを PLACEHOLDER に置換する（長いフレーズ優先）。"""
    for phrase in PROTECTED_PHRASES:
        if " " in phrase:
            text = text.replace(phrase, phrase.replace(" ", PLACEHOLDER))
    return text

def _restore(text: str) -> str:
    return text.replace(PLACEHOLDER, " ")


def find_split_pos(text: str) -> int:
    """
    テキストを自然な位置で 2 分割する位置を返す（-1 = 分割不要）。

    事前に保護フレーズ内のスペースを隠してから処理する。

    優先順位:
    1. Whisper スペース（= 発話の間隔）: 有効範囲内で末尾から探す
    2. 助詞の直後（中央に近い位置を優先）: から・ので・は・が・で・を・に・と（いう以外）・の・も
    3. 中央フォールバック
    """
    protected = _protect(text)
    n  = len(protected)   # PLACEHOLDER は 1 文字なのでズレなし
    if n <= MAX_CHARS:
        return -1

    lo = max(MIN_SPLIT, int(n * 0.30))
    hi = int(n * 0.75)

    # ① スペース（= 実際のスペースのみ、保護フレーズ内は除外済み）
    for i in range(hi, lo - 1, -1):
        if protected[i] == " ":
            return i

    # ② 助詞の直後（中央に最も近い位置を採用）
    pat = re.compile(r"(?:から|ので|でも|について|というか|は|が|で|を|に|と(?!いう)|の|も)")
    mid  = n // 2
    best = -1
    best_dist = float("inf")
    for m in pat.finditer(protected):
        pos  = m.end()
        dist = abs(pos - mid)
        if lo <= pos <= hi and dist < best_dist:
            best_dist = dist
            best = pos
    if best != -1:
        return best

    # ③ 中央
    return mid


def split_text(text: str) -> list[str]:
    """テキストを自然な塊に分割して返す（再帰）。"""
    pos = find_split_pos(text)
    if pos == -1:
        return [text]

    protected = _protect(text)

    # スペースの場合はスペース自体を除去
    if protected[pos] == " ":
        c1 = _restore(protected[:pos]).rstrip()
        c2 = _restore(protected[pos + 1:]).lstrip()
    else:
        c1 = _restore(protected[:pos]).rstrip()
        c2 = _restore(protected[pos:]).lstrip()

    if not c1 or not c2:
        return [text]

    # 行頭禁則チェック（ーや句読点が行頭に来ないように）
    if re.match(r"^[ー、。〉）\]｝」!！？?\-]", c2):
        return [c1 + c2]

    return split_text(c1) + split_text(c2)


# ──────────────────────────────────────────────────────────────
#  word timing 割り当て
# ──────────────────────────────────────────────────────────────

def assign_word_timing(
    chunks: list[str],
    words: list[dict],
) -> list[tuple[str, float, float]]:
    """
    各チャンクに (text, absStart, absEnd) を割り当てる。

    チャンク境界は「文字数比に比例した時刻」に最も近い word 境界を採用する。
    """
    sorted_words = sorted(words, key=lambda w: w["start"])
    if not sorted_words:
        return [(c, 0.0, 0.0) for c in chunks]

    total_start = sorted_words[0]["start"]
    total_end   = sorted_words[-1]["end"]
    total_dur   = total_end - total_start
    total_chars = sum(len(c) for c in chunks)

    if len(chunks) == 1 or total_chars == 0:
        return [(chunks[0], total_start, total_end)]

    result: list[tuple[str, float, float]] = []
    cursor_time = total_start
    consumed_chars = 0

    for idx, chunk in enumerate(chunks):
        is_last = idx == len(chunks) - 1
        consumed_chars += len(chunk)

        if is_last:
            end_time = total_end
        else:
            # 文字数比例で境界時刻を推定
            boundary_time = total_start + (consumed_chars / total_chars) * total_dur

            # boundary_time 前後で最も近い word 境界を探す
            best_word_end = cursor_time
            for w in sorted_words:
                if w["start"] >= cursor_time - 0.01 and w["end"] <= boundary_time + 0.5:
                    best_word_end = w["end"]

            end_time = best_word_end if best_word_end > cursor_time else boundary_time

        result.append((chunk, round(cursor_time, 3), round(end_time, 3)))

        # 次チャンクの開始は現チャンク終了直後の word の start
        if not is_last:
            next_word_start = end_time
            for w in sorted_words:
                if w["start"] >= end_time - 0.05:
                    next_word_start = w["start"]
                    break
            cursor_time = next_word_start

    return result


# ──────────────────────────────────────────────────────────────
#  話者ラベル除去（Whisper ハルシネーション対策）
# ──────────────────────────────────────────────────────────────

# この収録に存在しない話者ラベル（Whisper のハルシネーション）
# ゼロ秒検出を抜けたケースのフォールバックとして使用する
KNOWN_FAKE_LABELS = sorted(
    ["ヤンヤン", "大平", "樋口", "中田", "栗美"],
    key=len, reverse=True,  # 長いものから先にマッチ
)


def strip_speaker_label(
    raw_text: str,
    words: list[dict],
    seg_start: float,
) -> tuple[str, list[dict]]:
    """
    Whisper が挿入した話者ラベルを除去する。

    検出 1（汎用）: セグメント先頭のゼロ秒ワード群 + スペース
    検出 2（既知）: KNOWN_FAKE_LABELS に一致するプレフィックス + スペース
    """
    if not words or not raw_text:
        return raw_text, words

    # ── 検出 1: ゼロ秒ワード + スペース ─────────────────────
    zero_pfx: list[dict] = []
    for w in words:
        is_zero  = abs(w["end"] - w["start"]) < 0.005
        at_start = abs(w["start"] - seg_start) < 0.01
        if is_zero and at_start:
            zero_pfx.append(w)
        else:
            break

    if zero_pfx:
        for i in range(len(zero_pfx), 0, -1):
            label = "".join(w["word"] for w in zero_pfx[:i])
            if raw_text.startswith(label + " "):
                stripped = raw_text[len(label) + 1:].strip()
                if stripped:
                    return stripped, words[i:]

    # ── 検出 2: 既知ラベル（フォールバック）─────────────────
    for label in KNOWN_FAKE_LABELS:
        if raw_text.startswith(label + " "):
            stripped = raw_text[len(label) + 1:].strip()
            if stripped:
                # words は全て保持（timing は近似）
                return stripped, words

    return raw_text, words


# ──────────────────────────────────────────────────────────────
#  カメラセグメント検索
# ──────────────────────────────────────────────────────────────

def find_cam_seg(cam_segs: list[dict], abs_start: float) -> dict | None:
    """absStartSec が属するカメラセグメントを返す。"""
    for seg in cam_segs:
        if seg["startSec"] <= abs_start < seg["endSec"]:
            return seg
    return cam_segs[-1] if cam_segs else None


# ──────────────────────────────────────────────────────────────
#  main
# ──────────────────────────────────────────────────────────────

def main() -> None:
    for p in [MASTER_PATH, SCRIPT_PATH, DICT_PATH]:
        if not p.exists():
            print(f"❌ {p} が見つかりません")
            raise SystemExit(1)

    master     = json.loads(MASTER_PATH.read_text("utf-8"))
    script     = json.loads(SCRIPT_PATH.read_text("utf-8"))
    dictionary = json.loads(DICT_PATH.read_text("utf-8"))

    master_segs = sorted(master["segments"], key=lambda s: s["start"])
    cam_segs    = script["segments"]  # カメラセグメント構造は維持

    print(f"master: {len(master_segs)} セグメント / camera: {len(cam_segs)} セグメント")

    # subtitles を空にして再構成
    new_subtitles: dict = {seg["id"]: [] for seg in cam_segs}

    total_telops  = 0
    skipped       = 0
    labels_stripped = 0

    for ms in master_segs:
        # ゼロ秒セグメント（完全ハルシネーション）はスキップ
        if abs(ms.get("end", 0) - ms.get("start", 0)) < 0.005:
            skipped += 1
            continue

        words = ms.get("words", [])
        if not words:
            skipped += 1
            continue

        raw_text = ms.get("text", "").strip()
        if not raw_text:
            skipped += 1
            continue

        # 話者ラベル除去
        raw_text, words = strip_speaker_label(raw_text, words, ms["start"])
        if not raw_text:
            skipped += 1
            labels_stripped += 1
            continue
        if len(words) < len(ms.get("words", [])):
            labels_stripped += 1

        corrected = apply_corrections(raw_text, dictionary)
        if not corrected:
            skipped += 1
            continue

        chunks = split_text(corrected)
        timed  = assign_word_timing(chunks, words)

        for i, (text, abs_start, abs_end) in enumerate(timed):
            if not text or abs_end <= abs_start:
                continue

            cam = find_cam_seg(cam_segs, abs_start)
            if cam is None:
                continue

            entry: dict = {
                "text":        text,
                "startSec":    round(abs_start - cam["startSec"], 3),
                "durationSec": round(abs_end - abs_start, 3),
                "endSec":      round(abs_end - cam["startSec"], 3),
                "absStartSec": round(abs_start, 3),
                "absEndSec":   round(abs_end, 3),
            }
            if i > 0:
                entry["noDelay"] = True

            new_subtitles[cam["id"]].append(entry)
            total_telops += 1

    # ── 重複解消（念のため）────────────────────────────────────
    all_entries: list[dict] = []
    for entries in new_subtitles.values():
        all_entries.extend(entries)
    all_entries.sort(key=lambda e: e["absStartSec"])

    overlap_fixed = 0
    for i in range(len(all_entries) - 1):
        cur, nxt = all_entries[i], all_entries[i + 1]
        if cur["absEndSec"] > nxt["absStartSec"] + 0.001:
            cur["absEndSec"]   = round(nxt["absStartSec"], 3)
            cur["durationSec"] = round(cur["absEndSec"] - cur["absStartSec"], 3)
            overlap_fixed += 1

    script["subtitles"] = new_subtitles

    SCRIPT_PATH.write_text(
        json.dumps(script, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\n✅ テロップ再構成完了")
    print(f"   新テロップ数:     {total_telops} 件")
    print(f"   話者ラベル除去:   {labels_stripped} 件")
    print(f"   重複修正:         {overlap_fixed} 件")
    print(f"   スキップ:         {skipped} 件")


if __name__ == "__main__":
    main()

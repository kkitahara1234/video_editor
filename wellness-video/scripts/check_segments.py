#!/usr/bin/env python3
"""
check_segments.py — script.json のテロップセグメントを検証し、
                    Whisper の機械的分割による不自然な文末を検出する。

読み取り専用。データを書き換えない。

使い方:
  python3 scripts/check_segments.py
  python3 scripts/check_segments.py --script-path=public/script.json
  python3 scripts/check_segments.py --threshold=high
  python3 scripts/check_segments.py --report-only

終了コード:
  0: 重要度高が0件（重要度中のみ or 検出なし）
  1: 重要度高が1件以上
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


# ── 完結パターン（これにマッチしたら検出対象外）──────────────────
# 高・中パターンより先にチェックして誤検出を防ぐ
COMPLETE_PATTERNS = [
    re.compile(r'(?:ですね|ますね|でした|ました|ですよ|ますよ|ですが|ますが)$'),
    re.compile(r'[。？！]$'),
]

# ── 重要度: 高（末尾が以下で終わる → Whisper の機械的分割で不自然に途切れた可能性大）
# ※ prepare.ts が意図的に分割する位置（助詞・接続助詞・連用中止）は除外
HIGH_PATTERNS = [
    # 連体詞
    (re.compile(r'(?:この|その|あの|どの)$'), '連体詞'),
    # 助動詞活用途中（長いものを先にマッチ）
    (re.compile(r'(?:だっ|でし|まし)$'), '助動詞活用途中'),
    # 並列途中
    (re.compile(r'(?:だったり|たり)$'), '並列途中「たり」'),
    (re.compile(r'(?:ながら|つつ)$'), '並列途中'),
    # 助動詞「だ」（単独）
    (re.compile(r'だ$'), '助動詞「だ」'),
]

# ── 重要度: 中（文脈次第で完結の可能性あり）──────────────────
MEDIUM_PATTERNS = [
    (re.compile(r'(?:ある|いる|する)$'), '連用形の可能性'),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="script.json のテロップセグメントを検証し、不自然な文末を検出する"
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="ファイル出力のみ、標準出力なし",
    )
    parser.add_argument(
        "--threshold",
        choices=["high", "medium", "all"],
        default="medium",
        help="出力する重要度を指定（デフォルト: medium 以上）",
    )
    parser.add_argument(
        "--script-path",
        default=None,
        help="script.json のパスを明示指定（デフォルト: public/script.json）",
    )
    return parser.parse_args()


def detect_project_name(script_path: Path) -> str:
    """パスからプロジェクト名を推定する。"""
    for part in script_path.parts:
        if part.startswith("wellness-video"):
            return part
    return "unknown"


def load_entries(script_path: Path) -> list[dict]:
    """script.json を読み込み、全テロップエントリをフラット化して返す。
    各エントリに seg_id と seg_index を付与する。
    """
    with script_path.open(encoding="utf-8") as f:
        data = json.load(f)

    entries = []
    for seg_id, telops in data.get("subtitles", {}).items():
        for idx, entry in enumerate(telops):
            entries.append({
                "seg_id": seg_id,
                "seg_index": idx,
                "text": entry.get("text", ""),
                "char_count": len(entry.get("text", "")),
                "absStartSec": entry.get("absStartSec"),
                "absEndSec": entry.get("absEndSec"),
            })

    # absStartSec でソート（時系列順）
    entries.sort(key=lambda e: e.get("absStartSec") or 0)
    return entries


def check_entry(entry: dict, next_entry: dict | None) -> tuple[str, str] | None:
    """1エントリを検査する。

    Returns:
        (severity, pattern_name) or None（問題なしの場合）
    """
    text = entry["text"]
    if not text:
        return None

    # 完結パターンに該当 → 問題なし
    for pat in COMPLETE_PATTERNS:
        if pat.search(text):
            return None

    # 重要度: 高
    for pat, name in HIGH_PATTERNS:
        if pat.search(text):
            return ("high", name)

    # 重要度: 中
    for pat, name in MEDIUM_PATTERNS:
        if pat.search(text):
            return ("medium", name)

    return None


def generate_report(
    results: list[dict],
    project_name: str,
    total_count: int,
    report_path: Path,
) -> None:
    """markdown レポートを生成してファイルに保存する。"""
    high = [r for r in results if r["severity"] == "high"]
    medium = [r for r in results if r["severity"] == "medium"]
    ok_count = total_count - len(high) - len(medium)

    now = datetime.now(timezone.utc).isoformat()

    lines = [
        "# Whisperセグメント検証レポート",
        "",
        f"生成日時: {now}",
        f"プロジェクト: {project_name}",
        f"総セグメント数: {total_count}",
        f"要検証件数: {len(results)}",
        "",
    ]

    # 重要度: 高
    lines.append("## 重要度: 高（繋がる可能性大）")
    lines.append("")
    if high:
        lines.append("| # | セグメントID | 文字数 | テキスト | 末尾パターン | 次セグID | 次セグテキスト | 推定 |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for i, r in enumerate(high, 1):
            next_text = r.get("next_text", "")
            next_id = r.get("next_id", "")
            if len(next_text) > 20:
                next_text = next_text[:20] + "..."
            lines.append(
                f"| {i} | {r['seg_id']} #{r['seg_index']} | {r['char_count']} | {r['text']} | {r['pattern']} | {next_id} | {next_text} | 繋がる |"
            )
    else:
        lines.append("なし")
    lines.append("")

    # 重要度: 中
    lines.append("## 重要度: 中（要文脈確認）")
    lines.append("")
    if medium:
        lines.append("| # | セグメントID | 文字数 | テキスト | 末尾パターン | 推定 |")
        lines.append("|---|---|---|---|---|---|")
        for i, r in enumerate(medium, 1):
            lines.append(
                f"| {i} | {r['seg_id']} #{r['seg_index']} | {r['char_count']} | {r['text']} | {r['pattern']} | 要文脈確認 |"
            )
    else:
        lines.append("なし")
    lines.append("")

    # 統計サマリー
    lines.append("## 統計サマリー")
    lines.append("")
    high_pct = f"{len(high) / total_count * 100:.1f}" if total_count else "0"
    med_pct = f"{len(medium) / total_count * 100:.1f}" if total_count else "0"
    ok_pct = f"{ok_count / total_count * 100:.1f}" if total_count else "0"
    lines.append(f"- 重要度高: {len(high)}件 ({high_pct}%)")
    lines.append(f"- 重要度中: {len(medium)}件 ({med_pct}%)")
    lines.append(f"- 検証不要: {ok_count}件 ({ok_pct}%)")
    lines.append("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")


def print_summary(
    results: list[dict],
    project_name: str,
    total_count: int,
    threshold: str,
    report_path: Path,
) -> None:
    """標準出力にサマリーを表示する。"""
    high = [r for r in results if r["severity"] == "high"]
    medium = [r for r in results if r["severity"] == "medium"]

    print(f"=== Whisperセグメント検証結果 ===")
    print(f"プロジェクト: {project_name}")
    print(f"総セグメント数: {total_count}")
    print(f"要検証: {len(results)}件")
    print()

    # 重要度: 高
    if threshold in ("high", "medium", "all"):
        print(f"【重要度: 高】({len(high)}件)")
        if high:
            for r in high:
                print(f'  [{r["seg_id"]} #{r["seg_index"]}] ({r["char_count"]}文字) "{r["text"]}"')
                next_text = r.get("next_text", "")
                next_id = r.get("next_id", "")
                if next_text:
                    display = next_text[:20] + "..." if len(next_text) > 20 else next_text
                    print(f'    → 次: [{next_id}] "{display}"')
                print(f"    → 末尾パターン: {r['pattern']}")
        else:
            print("  なし")
        print()

    # 重要度: 中
    if threshold in ("medium", "all"):
        print(f"【重要度: 中】({len(medium)}件)")
        if medium:
            for r in medium:
                print(f'  [{r["seg_id"]} #{r["seg_index"]}] ({r["char_count"]}文字) "{r["text"]}"')
                print(f"    → 末尾パターン: {r['pattern']}")
        else:
            print("  なし")
        print()

    print(f"詳細レポート: {report_path}")


def main() -> None:
    args = parse_args()

    # script.json のパスを決定
    if args.script_path:
        script_path = Path(args.script_path).resolve()
    else:
        script_path = Path("public/script.json").resolve()

    if not script_path.exists():
        print(f"❌ ファイルが見つかりません: {script_path}", file=sys.stderr)
        sys.exit(1)

    project_name = detect_project_name(script_path)
    entries = load_entries(script_path)
    total_count = len(entries)

    # 全エントリを検査
    results = []
    for i, entry in enumerate(entries):
        next_entry = entries[i + 1] if i + 1 < len(entries) else None
        result = check_entry(entry, next_entry)
        if result is None:
            continue
        severity, pattern = result
        item = {
            "severity": severity,
            "pattern": pattern,
            "seg_id": entry["seg_id"],
            "seg_index": entry["seg_index"],
            "text": entry["text"],
            "char_count": entry["char_count"],
        }
        if next_entry:
            item["next_id"] = f'{next_entry["seg_id"]} #{next_entry["seg_index"]}'
            item["next_text"] = next_entry["text"]
        results.append(item)

    # レポートファイル出力
    report_path = Path("work/segment_check_report.md")
    generate_report(results, project_name, total_count, report_path)

    # 標準出力
    if not args.report_only:
        print_summary(results, project_name, total_count, args.threshold, report_path)

    # 終了コード
    high_count = sum(1 for r in results if r["severity"] == "high")
    sys.exit(1 if high_count > 0 else 0)


if __name__ == "__main__":
    main()

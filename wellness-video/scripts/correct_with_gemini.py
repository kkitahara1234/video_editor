#!/usr/bin/env python3
"""
correct_with_gemini.py — Whisper の文字起こし (master.json) を
                         Gemini 2.0 Flash で文脈ベースに校正する。

使い方:
  python3 scripts/correct_with_gemini.py [--input master.json] [--dry-run]

引数:
  --input    入力 JSON パス (default: master.json)
  --output   出力 JSON パス (default: 入力と同じ = 上書き)
  --dry-run  校正案を表示するだけで master.json を変更しない

必要条件:
  - .env に GEMINI_API_KEY が設定されていること
  - pip3 install google-generativeai
"""

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path


def load_env(env_path: Path = Path(".env")) -> None:
    """シンプルな .env ローダー。"""
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip())


SYSTEM_PROMPT = """\
あなたは医療・健康・経営に関する動画の文字起こし校正の専門家です。

以下は Dr.中田の YouTube 動画の文字起こしテキストです。
OpenAI Whisper による音声認識の結果であり、誤変換が含まれている可能性があります。

以下のような誤変換パターンを検出し、修正してください:
- 同音異義語の誤り（例: 童貞→同定、全息→喘息）
- 存在しない単語（例: 一気一復→一喜一憂）
- 文脈に合わない語（例: 同僚病→糖尿病、エッサン→資産、害虫→外注）
- 略語・崩れ表記（例: 人間ドク→人間ドック、コンシル→コンシェルジュ）
- 固有名詞の誤認識（例: いかしか大学→医科歯科大学、下界→外科医）

ただし以下は守ってください:
- 話者の言い回しや口語表現は尊重する（「ですね」「なんですけど」等はそのまま）
- 句読点の追加・削除はしない
- 自信がない箇所は修正しない
- 元のテキストに問題がなければ修正リストに含めない

出力フォーマット:
修正が必要な箇所のみ、以下の JSON 配列で返してください。
修正不要なら空配列 [] を返してください。

[
  {"index": 0, "original": "元のテキスト", "corrected": "修正後のテキスト"},
  ...
]

JSON 以外のテキストは出力しないでください。"""


def build_user_prompt(segments: list[dict]) -> str:
    """全セグメントを連番付きで結合してユーザープロンプトを作る。"""
    lines = []
    for i, seg in enumerate(segments):
        lines.append(f"[{i}] {seg['text']}")
    return "\n".join(lines)


def call_gemini(api_key: str, system_prompt: str, user_prompt: str) -> str:
    """Gemini 2.0 Flash API を呼び出す。"""
    try:
        import google.generativeai as genai
    except ImportError:
        print("❌ google-generativeai パッケージが必要です。")
        print("   pip3 install google-generativeai")
        raise SystemExit(1)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=system_prompt,
    )

    response = model.generate_content(user_prompt)
    return response.text


def parse_corrections(response_text: str) -> list[dict]:
    """Gemini の応答から JSON 配列を抽出してパースする。"""
    # コードブロック内の JSON を抽出
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", response_text, re.DOTALL)
    if match:
        json_str = match.group(1).strip()
    else:
        # コードブロックなし → 全体を JSON として試行
        json_str = response_text.strip()

    try:
        corrections = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"❌ Gemini の応答を JSON としてパースできません: {e}")
        print(f"   応答（先頭500文字）: {response_text[:500]}")
        raise SystemExit(1)

    if not isinstance(corrections, list):
        print(f"❌ Gemini の応答が配列ではありません: {type(corrections)}")
        raise SystemExit(1)

    return corrections


def apply_corrections(segments: list[dict], corrections: list[dict], dry_run: bool) -> int:
    """校正結果を segments に適用する。変更件数を返す。"""
    applied = 0
    for corr in corrections:
        idx = corr.get("index")
        original = corr.get("original", "")
        corrected = corr.get("corrected", "")

        if idx is None or not corrected:
            continue
        if idx < 0 or idx >= len(segments):
            print(f"  ⚠️ インデックス範囲外: {idx}")
            continue

        seg_text = segments[idx]["text"]

        # 指紋チェック: original が seg_text と一致するか
        if original and original != seg_text:
            # 部分一致で置換を試みる
            if original in seg_text:
                new_text = seg_text.replace(original, corrected, 1)
            else:
                print(f"  ⚠️ テキスト不一致（スキップ）: [{idx}]")
                print(f"     期待: \"{original}\"")
                print(f"     実際: \"{seg_text}\"")
                continue
        else:
            new_text = corrected

        if new_text == seg_text:
            continue

        marker = "（dry-run）" if dry_run else ""
        print(f"  [{idx}] \"{seg_text}\" → \"{new_text}\" {marker}")

        if not dry_run:
            segments[idx]["text"] = new_text
        applied += 1

    return applied


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Whisper 文字起こしを Gemini 2.0 Flash で校正する"
    )
    parser.add_argument("--input",   default="master.json", help="入力 JSON パス (default: master.json)")
    parser.add_argument("--output",  default=None,          help="出力 JSON パス (default: 入力と同じ)")
    parser.add_argument("--dry-run", action="store_true",   help="校正案を表示するだけで変更しない")
    args = parser.parse_args()

    load_env()

    input_path  = Path(args.input).resolve()
    output_path = Path(args.output).resolve() if args.output else input_path

    if not input_path.exists():
        print(f"❌ 入力ファイルが見つかりません: {input_path}")
        raise SystemExit(1)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY が設定されていません。.env を確認してください。")
        raise SystemExit(1)

    # 入力読み込み
    data = json.loads(input_path.read_text(encoding="utf-8"))
    segments = data.get("segments", [])
    print(f"📄 入力: {input_path.name} ({len(segments)} セグメント)")

    if not args.dry_run:
        # バックアップ
        backup_path = input_path.with_suffix(".json.before_gemini")
        shutil.copy2(input_path, backup_path)
        print(f"💾 バックアップ: {backup_path.name}")

    # プロンプト構築
    user_prompt = build_user_prompt(segments)
    print(f"📝 プロンプト: {len(user_prompt)} 文字 ({len(segments)} セグメント)")

    # Gemini API 呼び出し
    print("🤖 Gemini 2.0 Flash に送信中...")
    response_text = call_gemini(api_key, SYSTEM_PROMPT, user_prompt)
    print(f"📥 応答受信: {len(response_text)} 文字")

    # 校正結果パース
    corrections = parse_corrections(response_text)
    print(f"🔍 修正候補: {len(corrections)} 件")

    if not corrections:
        print("✅ 修正不要（Gemini が変更なしと判断）")
        return

    # 適用
    print()
    print("=== 校正内容 ===")
    applied = apply_corrections(segments, corrections, args.dry_run)

    if args.dry_run:
        print(f"\n📋 dry-run 完了: {applied} 件の修正候補（master.json は変更なし）")
        return

    # 保存
    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\n✅ 校正完了: {applied} 件を修正 → {output_path.name}")


if __name__ == "__main__":
    main()

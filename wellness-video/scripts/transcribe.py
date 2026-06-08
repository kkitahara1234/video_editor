#!/usr/bin/env python3
"""
transcribe.py — MP4 から音声を抽出し OpenAI Whisper API で文字起こしして
                master.json 形式で保存する。

使い方:
  python3 scripts/transcribe.py <入力MP4> [--out master.json] [--lang ja]

引数:
  <入力MP4>         文字起こしするMP4ファイルのパス（必須）
  --out             出力JSONパス (default: master.json)
  --lang            言語コード (default: ja)

必要条件:
  - .env に OPENAI_API_KEY が設定されていること
  - ffmpeg がインストールされていること (brew install ffmpeg)
  - pip3 install openai python-dotenv

注意:
  Whisper API のファイルサイズ上限は 25MB。
  音声は 48kbps mono MP3 に変換するため、約40分の動画まで対応。
  それ以上の場合は --chunk オプション（将来実装）が必要。
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def load_env(env_path: Path = Path(".env")) -> None:
    """シンプルな .env ローダー（python-dotenv 不要）。"""
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip())


def extract_audio(video_path: Path, audio_path: Path) -> None:
    """ffmpeg で MP4 から 48kbps mono MP3 を抽出する。"""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",                  # 映像除去
        "-ac", "1",             # モノラル
        "-ar", "16000",         # 16kHz（Whisper 最適サンプリングレート）
        "-b:a", "48k",          # 48kbps（25MB 上限対策）
        str(audio_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("❌ ffmpeg エラー:")
        print(result.stderr[-2000:])
        raise SystemExit(1)


def load_whisper_prompt(script_dir: Path) -> str:
    """scripts/whisper_terms.txt から用語リストを読み込んでプロンプトを返す。"""
    terms_path = script_dir / "whisper_terms.txt"
    if terms_path.exists():
        return terms_path.read_text(encoding="utf-8").strip()
    return ""


def transcribe(audio_path: Path, language: str) -> dict:
    """OpenAI Whisper API で文字起こし（verbose_json 形式）。"""
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY が設定されていません。.env を確認してください。")
        raise SystemExit(1)

    client = OpenAI(api_key=api_key)

    size_mb = audio_path.stat().st_size / 1024 / 1024
    print(f"   音声ファイルサイズ: {size_mb:.1f} MB")
    if size_mb > 25:
        print("⚠️  25MB を超えています。文字起こしに失敗する可能性があります。")

    # 用語リストをプロンプトとして読み込み
    prompt = load_whisper_prompt(Path(__file__).parent)
    if prompt:
        print(f"   プロンプト: {len(prompt)}文字の用語リスト")

    print("   Whisper API に送信中...")
    with audio_path.open("rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language=language,
            response_format="verbose_json",
            timestamp_granularities=["segment", "word"],
            **({"prompt": prompt} if prompt else {}),
        )

    # word-level データはトップレベルの response.words に格納される
    # 各セグメントの時間範囲で対応する単語を割り当てる
    all_words = response.words or []

    segments = []
    for seg in response.segments:
        seg_words = [
            {"word": w.word, "start": w.start, "end": w.end}
            for w in all_words
            if w.start >= seg.start - 0.01 and w.end <= seg.end + 0.5
        ]
        segments.append({
            "start": seg.start,
            "end":   seg.end,
            "text":  seg.text,
            "words": seg_words,
        })

    return {"segments": segments}


# 音声ファイルの拡張子セット
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".wma"}


def main() -> None:
    parser = argparse.ArgumentParser(description="音声/動画 → Whisper API → master.json")
    parser.add_argument("input",         help="入力ファイルパス（MP4/MOV等の動画、またはWAV/MP3等の音声）")
    parser.add_argument("--out",  default="master.json", help="出力 JSON パス (default: master.json)")
    parser.add_argument("--lang", default="ja",          help="言語コード (default: ja)")
    args = parser.parse_args()

    load_env()

    input_path = Path(args.input).resolve()
    out_path   = Path(args.out)

    if not input_path.exists():
        print(f"❌ 入力ファイルが見つかりません: {input_path}")
        raise SystemExit(1)

    is_audio = input_path.suffix.lower() in AUDIO_EXTENSIONS

    if is_audio:
        print(f"🎵 入力（音声）: {input_path.name}")
    else:
        print(f"📹 入力（動画）: {input_path.name}")
    print(f"📄 出力: {out_path}")

    if is_audio:
        size_mb = input_path.stat().st_size / 1024 / 1024
        if size_mb > 25:
            # 音声ファイルが25MB超: ffmpeg で 48kbps mono MP3 に圧縮してから送信
            print(f"🎵 音声ファイル ({size_mb:.1f}MB) が25MB超 → 圧縮して送信")
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                audio_path = Path(tmp.name)
            try:
                extract_audio(input_path, audio_path)
                result = transcribe(audio_path, args.lang)
            finally:
                audio_path.unlink(missing_ok=True)
        else:
            print("🎵 音声ファイルを直接使用")
            result = transcribe(input_path, args.lang)
    else:
        # 動画ファイル: ffmpeg で音声抽出してから Whisper API に渡す
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            audio_path = Path(tmp.name)
        try:
            print("🎵 動画から音声を抽出中...")
            extract_audio(input_path, audio_path)
            result = transcribe(audio_path, args.lang)
        finally:
            audio_path.unlink(missing_ok=True)

    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    seg_count  = len(result["segments"])
    total_secs = result["segments"][-1]["end"] if result["segments"] else 0
    print(f"\n✅ 文字起こし完了: {out_path}")
    print(f"   セグメント数: {seg_count} / 総尺: {total_secs:.1f}秒")


if __name__ == "__main__":
    main()

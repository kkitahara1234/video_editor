# 対談ショート PLAYBOOK

対談2カメ動画からショートを作る汎用手順。
ゲストが変わっても同じ手順を踏む。

## 前提

- 2カメ (host.mp4 / guest.mp4)、ピンマイク2本ミックス音声が両カメに同録
- 尺は20〜30分程度（ラジオ収録 or 対談収録）
- 出力: 1080x1920 縦型ショート (60〜180秒)
- テロップ分割は wellness-shared の dictionary / split-rules / proper-nouns を流用

## パイプライン全体図

```
source/host.mp4, guest.mp4         ← 生素材（手動カット済み）
       |
       | ffmpeg -vn (host.mp4から音声抽出)
       v
public/audio16k.wav (16kHz mono)   ← whisperX 入力用
public/master.wav   (44.1kHz 2ch)  ← ショート音声用
       |
       | whisperX (large-v3, diarize, 2 speakers)
       v
data/work/whisperx_full/*.json     ← whisperX 生出力 (word時刻 + 話者)
       |
       | whisperx_to_xlsx.py (話者マッピング適用)
       v
public/master.json                 ← 中間: segments + words + speaker(host/guest)
       |
       | whisperx_to_xlsx.py (18字分割 + xlsx書き出し)
       v
script_check.xlsx                  ← subtitlesシート, 666行, 話者=cam_id列
       |
       | (ここで手動レビュー + J列修正 可能)
       |
       | pnpm step1 (GPTスコアリング)
       v
data/work/scoring.json
       |
       | pnpm step2 (autoSplit12chars + emphasis)
       v
data/work/candidates.json
       |
       | pnpm ingest (candidates → script-short-*.json)
       v
data/scripts/script-short-*.json
       |
       | ffmpeg (区間切り出し: front再エンコード + wav copy)
       v
public/short-XXX-host.mp4, short-XXX-guest.mp4, short-XXX-master.wav
       |
       | npx remotion render (caffeinate + TMPDIR外付け + concurrency=1)
       v
data/output/short-XXX.mp4          ← 最終成果物
```

## 手順詳細

### 1. 素材準備

```bash
mkdir -p source public data/{work,scripts,output}
# 手動: host.mp4, guest.mp4 を source/ に配置
# 注意: カット位置を揃える（2カメの尺が一致すること）
```

### 2. 音声抽出

```bash
# whisperX 入力用 (16kHz mono)
ffmpeg -y -i source/host.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le public/audio16k.wav

# ショート用フル音声 (元の2ch 44.1kHz)
ffmpeg -y -i source/host.mp4 -vn -c:a pcm_s16le public/master.wav
```

### 3. whisperX (文字起こし + 話者分離)

```bash
source .venv-whisperx/bin/activate
export HF_TOKEN=$(cat .hf_token)

whisperx public/audio16k.wav \
  --model large-v3 \
  --language ja \
  --diarize \
  --min_speakers 2 --max_speakers 2 \
  --hf_token "$HF_TOKEN" \
  --output_dir data/work/whisperx_full \
  --output_format json \
  --compute_type int8
```

#### 話者マッピングルール

- **冒頭の話者 = host**（発話量では判定しない。司会は短く振る/ゲストは長く語るため）
- master.json 変換時に SPEAKER_XX → host/guest をマッピング

### 4. master.json 変換 + xlsx 生成

```bash
# master.json 変換 (whisperX出力 → host/guest マッピング)
# ※ whisperx_to_xlsx.py 内で master.json 読み込み → xlsx 書き出し を一括実行
python3 scripts/whisperx_to_xlsx.py --master public/master.json --xlsx script_check.xlsx
```

### 5. step1 → step2 → ingest → render

ここから先は既存テンプレ (wellness-shorts-template) の手順と同じ。
project.json の xlsxPath を script_check.xlsx に向ける。

## HuggingFace モデル アクセス同意が必要なもの (3つ)

1. `pyannote/speaker-diarization-3.1`
2. `pyannote/segmentation-3.0`
3. `pyannote/speaker-diarization-community-1`

## 確定した演出仕様

- テロップに話者名は出さない（発言のみ。ショートは画面が狭いため）
- カメラ切替: 話者(host/guest)に応じて host.mp4/guest.mp4 を左右切替
  - 相槌（短い「うん」「はい」等）では切り替えない（チカチカ防止）
  - 切替えない閾値は実データで調整（まず1.5秒未満は無視で試す）
- 縦型クロップ: 各カメラで話者が中央に来る位置（offsetは素材を見て決める）
- ショート本数: 3〜5本（28分尺、既存ルール準拠）
- ショート長: 45〜180秒

## whisperX の word 時刻特性

- alignment 後の word 間ギャップは **完全に 0** (隙間なし)
- ギャップベース分割は効かない → 文字数ベース分割のみ
- word 単位は1文字（日本語）。multi-char word はまれ

## .gitignore 必須

```
.hf_token
.venv-whisperx/
```

## トークンの扱い

- `.hf_token` ファイルに保存（コマンドライン引数に直書きしない）
- `export HF_TOKEN=$(cat .hf_token)` で環境変数に読む
- `--hf_token "$HF_TOKEN"` は ps aux でトークンが見える問題あり。将来的に環境変数のみで渡す方式に改善

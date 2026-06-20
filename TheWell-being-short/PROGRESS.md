# TheWell-being-short 進捗 (2026-06-18)

## プロジェクト概要

- 番組: Wellness presents Dr.中田 The Well-being (CROSS FM)
- ゲスト: 森川久美子 (株式会社メローネ代表取締役)
- 素材: 対談2カメ (host/guest), 28分, 1920x1080, HEVC, 30fps
- 目標: 60〜180秒の縦型ショート複数本

## 完了済み

### 素材準備
- [x] フォルダ構成作成 (source/ public/ data/ scripts/)
- [x] host.mp4, guest.mp4 を source/ に配置 (手動カット済み, 1679s, 尺差58ms)
- [x] 音声抽出: audio16k.wav (51MB, 16kHz mono), master.wav (282MB, 44.1kHz 2ch)

### whisperX
- [x] Python venv 作成 (.venv-whisperx/, Python 3.12, 12GB)
- [x] whisperX インストール (large-v3 + pyannote-audio + torch)
- [x] NLTK punkt_tab ダウンロード (SSL workaround 適用済み)
- [x] HuggingFace トークン (.hf_token, 3モデル同意済み)
- [x] 2分テスト実行 → 動作確認OK
- [x] 28分フル実行 → 成功 (72セグメント, word時刻9863個, 話者分離OK)
- [x] 話者確定: SPEAKER_01=host(中田), SPEAKER_00=guest(森川くみこ)

### master.json + xlsx
- [x] whisperX出力 → master.json 変換 (話者マッピング host/guest)
- [x] whisperx_to_xlsx.py 作成・動作確認 (18字分割, word実時刻, 話者列)
- [x] script_check.xlsx 生成 (666行, host:269/guest:397, 平均14字)
- [x] .gitignore (.hf_token, .venv-whisperx/)

## 未着手

### ショートテンプレ構成
- [ ] project.json 作成 (xlsxPath, cropOffsets 等)
- [ ] wellness-shorts-template からの構成複製 (package.json, tsconfig, remotion.config 等)
- [ ] node_modules (pnpm install)
- [ ] src/ (ShortClip, Root.tsx 等 — 対談用にカメラ切替ロジック要検討)

### パイプライン実行
- [ ] step1: GPTスコアリング (scoring.json)
- [ ] step2: autoSplit12chars + emphasis (candidates.json)
- [ ] 手動レビュー (xlsx J列修正 or candidates 確認)
- [ ] ingest: script-short-*.json 生成
- [ ] ffmpeg 区間切り出し (host/guest 両方の front 再エンコード)
- [ ] render

### 対談固有の課題
- [ ] カメラ切替ロジック: 話者(host/guest)に応じて host.mp4/guest.mp4 を切替
  - 既存テンプレは front/left/right の3カメ自動ローテーション
  - 対談は「話者=カメラ」なので切替ロジックが異なる
  - xlsx の cam_id/angle 列に host/guest が入ってるので、これを使う
- [ ] dictionary 追加: メローネ/メロン→メローネ, 森川久美子 等 (ゲスト固有語)
- [ ] HEVC→H.264 再エンコード (source/*.mp4 は HEVC 10bit の可能性)

## ファイル構成 (2026-06-18 時点)

```
TheWell-being-short/
  .gitignore              ← .hf_token, .venv-whisperx/
  .hf_token               ← HuggingFace トークン
  .venv-whisperx/          ← Python venv (12GB, whisperX + torch)
  script_check.xlsx        ← 666行, 話者つき, step1入力用
  PROGRESS.md              ← このファイル
  docs/
    対談ショート_PLAYBOOK.md ← 汎用手順書
  scripts/
    whisperx_to_xlsx.py    ← master.json → xlsx 変換 (完成版)
  source/
    host.mp4               ← 生素材 (1.9GB, HEVC, 1920x1080, 30fps)
    guest.mp4              ← 生素材 (1.9GB, HEVC, 1920x1080, 30fps)
  public/
    audio16k.wav           ← whisperX入力 (51MB, 16kHz mono)
    audio16k_test2min.wav  ← テスト用2分 (3.7MB, 削除可)
    master.json            ← whisperX→変換済み (72seg, host/guest)
    master.wav             ← ショート音声用 (282MB, 44.1kHz 2ch)
  data/
    work/
      whisperx_full/
        audio16k.json      ← whisperX 生出力 (1.7MB)
      whisperx_test/
        audio16k_test2min.json ← テスト出力 (削除可)
    scripts/                ← 空 (ingest後に生成)
    output/                 ← 空 (render後に生成)
```

## 再開時の次の一手

1. **project.json 作成** — thelongevity_1 のを参考に、xlsxPath と cropOffsets を設定
2. **テンプレ複製** — package.json, tsconfig, remotion.config, src/ を wellness-shorts-template から
3. **カメラ切替ロジック検討** — 対談用に ShortClip の CameraFront を host/guest 切替に改修
4. **pnpm install → step1 実行**

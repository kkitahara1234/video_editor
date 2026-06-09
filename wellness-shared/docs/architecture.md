# Wellness 動画制作プロジェクト 全体構造

最終更新: 2026-06-08

## 目的

Wellness 動画制作プロジェクトは、3カメラ収録の元動画から「長尺動画」と「ショート動画」の2形態を制作するシステム。共通リソース（辞書・分割ルール・docs）を wellness-shared/ に集約し、長尺/ショートで再利用する設計。

## ストレージレイアウト

全データは外付け SSD /Volumes/編集用/ に配置。内蔵 SSD は ENOSPC 障害履歴があるため使用禁止。

主要ディレクトリ:

- /Volumes/編集用/script_check.xlsx — Whisper 文字起こし + 人間目視済の正典
- /Volumes/編集用/wellness-shared/ — 長尺・ショート共用リソース
  - dictionary.json (196件), proper-nouns.json (25件)
  - split-rules.json (50+ ルール), display-corrections.ts
  - docs/ — architecture.md, PLAYBOOK.md, rules.md, telop-display-rules.md, split-rules.md, known-patterns.md, changelog.md
- /Volumes/編集用/wellness-shorts-template/ — ショート共用テンプレート（コード）
  - src/theme.ts, src/types.ts, src/Root.tsx (ShortClip 1 Composition)
  - src/ShortClip.tsx (案B front 黒帯テロップ)
  - src/components/ — CameraFront.tsx, CameraSwitch.tsx, Telop.tsx, VerticalCrop.tsx
  - scripts/ — analyze-step1.ts, analyze-step2-v2.ts, ingest.ts, diagnose-issues.ts, export-to-excel.ts, import-from-excel.ts, generate-review.ts, adjust-scoring.ts, adjust-scoring-gpt.ts, lib/
- /Volumes/編集用/wellness-video/ — 長尺プロジェクト
  - public/ — front.mp4, left.mp4, right.mp4, master.wav, logomark.svg
  - src/ — 長尺 Remotion コンポーネント
  - shorts/ — ショート作業ディレクトリ
    - project.json — talkType, cameraMode 設定
    - public, src, scripts — symlink でテンプレート参照
    - data/work/ — candidates.json, emphasis-cache.json
    - data/scripts/ — script-short-XXX.json (動画ごと N本)
    - data/clips/ — FFmpeg 切り出しクリップ
    - data/output/ — 書き出し mp4 (short-XXX.mp4)
- /Volumes/編集用/tmp_remotion/ — Remotion レンダリング一時
- /Volumes/編集用/tmp_remotion_studio/ — Studio 一時

## 制作フロー（ショート）

1. FFmpeg で元動画切り出し → public/short-XXX-{left,right,front}.mp4
2. analyze-step1.ts (GPT 盛り上がり検出) → 盛り上がり候補
3. analyze-step2-v2.ts (kuromoji 12字分割 + emphasis) → data/work/candidates.json
4. diagnose-issues.ts (50+ パターン違和感検出) → 修正方針
5. (任意) export-to-excel → 北原さん手動修正 → import-from-excel → candidates.json 更新
6. ingest.ts → data/scripts/script-short-XXX.json
7. Remotion Studio でプレビュー: npx remotion studio src/index.ts
8. Remotion render → mp4 書き出し → data/output/short-XXX.mp4

## 設計概念

### talkType（動画タイプ）

動画ごとに project.json で指定:
- 'monologue' (一人語り): カメラ切替なし、cameraMode で固定
- 'dialogue' (対談): 話者連動切替（将来）/ 時間ベース交互（暫定）

### cameraMode（monologue 時のカメラ）

- 'left' / 'right' / 'front'

### テロップデザイン (確定)

Telop.tsx: 半透明黒帯 + 白文字、fontSize 56、bandHeight 110。
詳細は wellness-shorts-template/src/theme.ts 参照。

### Composition 構成

ShortClip: 案B + front（確定済み）。将来 dialogue 対応時に Composition 追加予定。

## 重要な技術的制約

- ストレージ: 全データ外付け SSD /Volumes/編集用/ のみ。内蔵 SSD 使用禁止（ENOSPC 障害履歴あり）
- TMPDIR: /Volumes/編集用/tmp_remotion/ 必須
- 動画ロード: <Video> 使用必須。<OffthreadVideo> は 4GB 級ファイルで失敗
- 事前切り出し: 4GB 級元動画は Remotion で直接扱えない。FFmpeg で切り出して 100-200MB 級に縮小
- Claude Code 永続許可: 絶対禁止。毎回 1 押す（事故防止）

## 新動画制作で必要な情報チェックリスト

新動画着手時、以下を北原さんに確認:

1. 元動画パス (どの mp4 ファイルか)
2. 動画タイプ (monologue / dialogue)
3. カメラ設定
   - monologue: front / left / right どれか
   - dialogue: 話者検出ロジックの方針
4. 制作方針
   - 長尺動画のみ / ショート切り抜きのみ / 両方
5. ショート切り抜きの場合: 本数の指示（例: 「30分尺で何本」「動画から何本切る」）
6. テロップデザイン (現在は案B確定、将来変更時に確認)

## メンテナンスルール

このドキュメントはプロジェクト構造の変更時に更新する:
- ディレクトリ追加・削除
- Composition 増減
- 設計概念追加（新 talkType、新カメラモード等）
- 重要技術制約の発見

セッション終了時、変更があれば更新を確認すること。

### Git コミットルール

リポジトリ: https://github.com/kkitahara1234/video_editor

#### コミットすべきタイミング

- **1プロジェクト終了時**: 長尺1本完成 or ショート全件完成等の節目
  - 例: "Project: wellness-video 長尺動画完成"
  - 例: "Project: wellness-video ショート全件完成"
- **テンプレート改善時**: split-rules / theme.ts / scripts 等の改善完了
  - 例: "Improve: split-rules に新ルール追加"
- **重要な区切り**: デザイン変更、設計変更、新機能追加等
  - 例: "Refactor: theme/types 統合、Composition 1本化"

#### コミットしないでよい場面

- 1ショートずつの作業途中
- 動作確認前
- 小さな typo 修正のみ

#### コミット手順

```bash
cd /Volumes/編集用/
git status      # 何が変わったか確認
git add -A      # 全部保存対象に
git commit -m "メッセージ"
git push        # GitHub にアップロード
```

#### 機密管理

- .env / xlsx / mp4 / wav は .gitignore で除外済み
- 機密情報は絶対に commit しない
- 万一 commit してしまったら戦略Claude に相談（履歴削除が必要）

# PROJECT_NOTES - wellness-video ショート

最終更新: 2026-06-08

このファイルはこの動画プロジェクト固有の設定・実績を記録する。
汎用ルールは wellness-shared/docs/ を参照。
全体構造は wellness-shared/docs/architecture.md を参照。
既知の罠は wellness-shared/docs/known-traps.md を参照。

## プロジェクト概要

| 項目 | 値 |
|---|---|
| プロジェクト名 | wellness-video ショート |
| 元素材 | /Volumes/編集用/wellness-video/public/ |
| 主題 | 中田氏 60分動画の縦型ショート切り抜き |
| 元動画長 | 約60分 (3627.8秒) |
| 元動画解像度 | 1920x1080 横長 |
| 元動画FPS | 30 |
| 出力解像度 | 1080x1920 縦型 |
| 出力FPS | 30 |
| 出力先 | /Volumes/編集用/wellness-video/shorts/data/output/ |
| ショート本数 | 12本（perMinutes 20 + minPer 3 + maxPer 5 → 12候補確定済）|
| talkType | monologue（一人語り）|
| cameraMode | front（正面固定、確定）|

## 素材ファイル

| ファイル | パス |
|---|---|
| 正面カメラ | /Volumes/編集用/wellness-video/public/front.mp4 (約4.3GB) |
| 左カメラ | /Volumes/編集用/wellness-video/public/left.mp4 (約4.2GB) |
| 右カメラ | /Volumes/編集用/wellness-video/public/right.mp4 (約4.2GB) |
| 音声マスター | /Volumes/編集用/wellness-video/public/master.wav (609MB) |
| 文字起こし | /Volumes/編集用/script_check.xlsx |
| 長尺完成品（参照用）| /Volumes/編集用/wellness-video/out/video.mp4 |

## このプロジェクトの project.json 設定

主要値（変更時はこの表も更新）:

| 項目 | 値 | 備考 |
|---|---|---|
| talkType | monologue | 一人語り、カメラ切替なし |
| cameraMode | front | 正面固定（確定）|
| duration.min | 60 | ショート最低長（秒）|
| duration.max | 180 | ショート最大長（秒）|
| cameraSwitch.minInterval | 7 | 対談モード時のみ使用 |
| cameraSwitch.firstSwitchWithinSec | 3.0 | 対談モード時のみ |
| cropOffsets.front | { x: 250, y: 0 } | 横長動画の正面クロップ起点 |
| cropOffsets.left | { x: 320, y: 0 } | |
| cropOffsets.right | { x: 520, y: 0 } | |
| gpt.maxTokensPerCall | 8000 | |
| gpt.temperature | 0.3 | |
| scoreThreshold | 7.0 | 盛り上がり検出スコア |

## テロップデザイン (確定)

案B 採用: 黒帯テロップ（fontSize 56px、半透明黒帯 110px 高、白文字）。
詳細は wellness-shorts-template/src/theme.ts 参照。

## Composition 構成 (ShortClip 1本)

ShortClip: 案B + front（確定済み）。案A 関連と left/right 用ファイルは .OLD としてリネーム済み（2026-06-15 削除予定）。

## 制作実績

| ショートID | 区間 | 状態 | 備考 |
|---|---|---|---|
| short-001 | 2315.2s - 2403.8s (88.6s) | 書き出し済 | 案B front 確定 |
| short-002 ~ short-012 | - | 未着手 | 12ショート展開待ち |

## このプロジェクト固有の特殊用語（再頻出）

長尺と共通辞書: /Volumes/編集用/wellness-shared/dictionary.json + proper-nouns.json

主要な固有名詞（テロップ分割で12字超過を許容）:
- パーソナルドクター、Wellness App、戦略的予防医療
- パーソナルヘルスケアレコード、PHR、Longevity
- 予防医療1.0/2.0/3.0、コミュニケーション

詳細は proper-nouns.json 参照。

## 機械診断 (diagnose-issues.ts)

50+ パターンで違和感検出可能。
現在の状態:
- 違和感 36件残（構造的限界 29件 + 各1件×7件）
- 詳細は wellness-shared/docs/known-patterns.md 参照

## FFmpeg 事前切り出し

4GB 級元動画は Remotion で直接扱えないため、各ショートを事前切り出し:
- public/short-XXX-{left,right,front}.mp4 (100-200MB 級)
- public/short-XXX-master.wav (15MB 級)

切り出しコマンド例:
```bash
ffmpeg -ss <startSec> -i /Volumes/編集用/wellness-video/public/front.mp4 -t <duration> -c copy public/short-XXX-front.mp4 -y
ffmpeg -ss <startSec> -i /Volumes/編集用/wellness-video/public/left.mp4 -t <duration> -c copy public/short-XXX-left.mp4 -y
ffmpeg -ss <startSec> -i /Volumes/編集用/wellness-video/public/right.mp4 -t <duration> -c copy public/short-XXX-right.mp4 -y
ffmpeg -ss <startSec> -i /Volumes/編集用/wellness-video/public/master.wav -t <duration> -c copy public/short-XXX-master.wav -y
```

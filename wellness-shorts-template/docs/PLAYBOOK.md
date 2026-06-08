# ショート動画プロジェクト PLAYBOOK

> 長尺動画から縦型ショート切り抜きを自動生成するワークフロー。
> 全体構造は wellness-shared/docs/architecture.md 参照。
> テロップルールは wellness-shared/docs/telop-display-rules.md 参照。
> プロジェクト固有設定は各プロジェクトの PROJECT_NOTES.md 参照。

---

## このワークフローの目的

長尺動画（60分前後）の script_check.xlsx（Whisper 文字起こし + 人間目視済）から、**1〜3分の縦型ショート**を生成する。

- 入力: script_check.xlsx + 元動画 (front/left/right.mp4)
- 中間: candidates.json → script-short-XXX.json
- 出力: 縦型ショート動画 short-XXX.mp4 (1080x1920)

---

## 体制（3者協業）

| 役割 | 担当 | やること |
|---|---|---|
| 戦略Claude | チャットUI | 戦略・判断・プロンプト作成・修正案レビュー |
| ユーザー（北原かえで） | ターミナル | 違和感センサー・最終判断・コマンド承認 |
| Claude Code | CLI | 実装・検証・スクリプト実行 |

**重要**: ユーザーは `ask_user_input_v0` UIを使わず、テキスト返答で進める。

---

## ファイル構成

全体構造は wellness-shared/docs/architecture.md の「ストレージレイアウト」を参照。

主要パス:
- テンプレート: `/Volumes/編集用/wellness-shorts-template/` (src/, scripts/, docs/)
- プロジェクト作業: `/Volumes/編集用/<project>/shorts/` (project.json, data/, symlink で template 参照)
- 共有リソース: `/Volumes/編集用/wellness-shared/` (dictionary.json, split-rules.json, proper-nouns.json, docs/)

---

## プロジェクト設定 (project.json)

各プロジェクトの `shorts/project.json` で設定。テンプレート側には config を持たない。

主要フィールド:
- `projectName`: プロジェクト識別名
- `talkType`: `'monologue'` (一人語り) / `'dialogue'` (対談)
- `cameraMode`: monologue 時のカメラ (`'front'` / `'left'` / `'right'`)
- `sourceDir`: 元動画のパス
- `workDir`: 作業ディレクトリ
- `scoreThreshold`: GPT スコア閾値 (例: 7.0)
- `cameraSwitch`: `{ minInterval, maxInterval, boundaryGapSec, firstSwitchWithinSec }`
- `gpt`: `{ model, maxTokensPerCall: 8000, temperature }`

実例: `/Volumes/編集用/wellness-video/shorts/project.json`

---

## 標準ワークフロー

### Phase 1: 設計・準備

1. 長尺プロジェクトが完成していることを確認
2. `shorts/project.json` を作成（既存プロジェクトからコピー編集）
3. symlink でテンプレート参照を設定 (src/, scripts/ 等)

素材確認:
```bash
# 元動画の存在確認
ls -lh /Volumes/編集用/<project>/public/{front,left,right}.mp4

# 文字起こしの存在確認
ls -lh /Volumes/編集用/script_check.xlsx

# 動画長の確認
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1 /Volumes/編集用/<project>/public/front.mp4
```

### Phase 2: 盛り上がり検出 (analyze-step1.ts)

```bash
pnpm run step1
```

処理内容:
1. script_check.xlsx を読み込み
2. GPT (gpt-4o-mini) で区間ごとの盛り上がりスコアを算出
3. スコア上位候補を抽出
4. `data/work/scoring.json` に保存

### Phase 3: テロップ生成 + emphasis (analyze-step2-v2.ts)

```bash
pnpm run step2
```

処理内容:
1. scoring.json の候補に対し、xlsx からテロップ抽出
2. kuromoji で 12字以内に分割 (split-rules.json + proper-nouns.json 適用)
3. dictionary.json で Whisper 誤認識を修正
4. GPT で emphasis (強調語) 抽出 (emphasis-cache.json でキャッシュ)
5. `data/work/candidates.json` に保存

### Phase 4: 品質診断 (diagnose-issues.ts)

```bash
pnpm run diagnose
```

50+ パターンで違和感を自動検出:
- 行頭禁則、句読点残存、数値分断、固有名詞分断
- 動詞活用分断、cps 超過、emphasis 数異常 等

### Phase 4.5: 戦略Claude レビュー (任意)

diagnose 結果を戦略Claude に渡す。

確認項目:
- 違和感の構造的原因か個別ケースか
- split-rules.json で解消可能か
- proper-nouns.json に追加すべき固有名詞があるか
- 構造的に解消できないなら Phase 5 で個別修正

対処方針:
- 構造的に解消すべき → split-rules.json 更新 → 再 step2
- 個別対処 → Phase 5 で Excel 手動修正

### Phase 5: 手動修正サイクル (任意)

```bash
pnpm run export    # candidates.json → Excel
# 北原さんが Excel で手動修正
pnpm run import    # Excel → candidates.json 更新
pnpm run diagnose  # 再診断
```

### Phase 6: script.json 生成 (ingest.ts)

```bash
pnpm run ingest
```

処理内容:
1. candidates.json から各候補を取り出す
2. 絶対時刻を相対秒に変換
3. cameraSwitches を計算 (talkType に応じて固定/交互)
4. `data/scripts/script-short-XXX.json` に保存

出力スキーマ (script-short-XXX.json):
- `shortId`: 文字列
- `title`: 文字列
- `startSec` / `endSec`: 数値（絶対秒）
- `telops`: 配列 `[{ text, startSec, endSec, emphasis: [{ start, end, label? }] }]`
- `cameraSwitches`: 配列 `[{ atSec, camera: 'left' | 'right' | 'front' }]`

### Phase 6.5: script.json レビュー

ingest 出力を確認。

期待値:
- テロップ 12字以内
- cameraSwitches が project.json の talkType と整合
- emphasis 数 ≤ 7
- 相対秒が動画長内に収まる

人間チェック:
- テロップの文脈で違和感ないか
- カメラ切替のタイミング
- 強調語の妥当性

違和感あれば Phase 5 (手動修正) に戻る。

### Phase 7: プレビュー + レンダリング

レンダリング前準備:
```bash
# 1. Studio が起動中なら停止
pkill -f "remotion studio" 2>/dev/null

# 2. キャッシュクリア
rm -rf node_modules/.cache/ .cache/

# 3. TMPDIR 確認
echo $TMPDIR  # /Volumes/編集用/tmp_remotion であること

# 4. 外付け SSD 容量確認
df -h /Volumes/編集用

# 5. ノートPC は AC 電源接続（バッテリーだとレンダリング遅延）
```

```bash
# Studio プレビュー
pnpm run studio

# レンダリング（1本ずつ）
TMPDIR=/Volumes/編集用/tmp_remotion \
pnpm run render -- --props='{"shortId":"short-001"}'
```

4 Composition で比較可能:
- ShortClip (案A + left), ShortClipV2 (案B + left)
- ShortClipFront (案A + front), ShortClipFrontV2 (案B + front)

**重要設定**:
- `concurrency=1` 厳守（メモリ保護）
- `TMPDIR=/Volumes/編集用/tmp_remotion` 必須
- 必ず **1本テスト → OK なら全本** の順序

時間目安:
- 1本（60-180秒のショート）: 約15-30分
- 12本一括: 約3-6時間（concurrency=1 のため並列不可）

### Phase 8: 後処理・確認

```bash
# 出力確認
ls -lh data/output/

# 各ショートの長さ・サイズ確認
for f in data/output/*.mp4; do
  echo "=== $f ==="
  ffprobe -v error -show_entries format=duration,size,bit_rate \
    -of default=noprint_wrappers=1 "$f"
done
```

人間チェック観点:
- テロップが下部に配置されているか
- 12字制限内か
- 強調語が視覚的に区別できるか
- カメラ切替のテンポ
- 縦型クロップで被写体が見切れていないか
- 音声とテロップが同期しているか

目視確認:
```bash
open /Volumes/編集用/<project>/shorts/data/output/short-001.mp4
```

フィードバックループ — 違和感の原因に応じて該当 Phase に戻る:
- テロップの内容 → Phase 5 (手動修正) → Phase 6 (ingest)
- テロップの分割 → Phase 3 (step2) → Phase 4 (diagnose)
- カメラ切替 → project.json の cameraSwitch を調整 → Phase 6
- 縦クロップ → theme.ts の camera 設定を調整 → Phase 7 再レンダリング

---

## トラブルシューティング

### Q1: カメラが切り替わらない
**原因**: Remotion Studio の古いビルドキャッシュ
```bash
pkill -f "remotion studio"
rm -rf node_modules/.cache/ .cache/
# 再起動 + ブラウザ Cmd+Shift+R
```

### Q2: 強調語が多すぎる/少なすぎる
**原因**: GPT プロンプトの調整不足
**対処**: analyze-step2-v2.ts の emphasis 抽出で EMPHASIS_MAX=7 で制限済み。limitEmphasisByImportance で重要度順に絞り込み。

### Q3: テロップが12字超過する
**原因**: kuromoji 分割で全候補が isInvalidSplitPos にブロックされた場合のフォールバック
**対処**: diagnose で検出 → split-rules.json のルール調整 or 手動修正

### Q4: カメラ切替が早すぎる/遅すぎる
**原因**: project.json の cameraSwitch.minInterval/maxInterval が合っていない
**対処**: minInterval を調整（落ち着いた語り口: 7秒以上）

### Q5: 縦クロップで被写体が見切れる
**原因**: theme.ts の camera 設定が話者位置と合っていない
**対処**: theme.ts の camera.leftRight / camera.front を調整

### Q6: GPT API のコスト
**対処**:
- gpt-4o-mini 固定（安価）
- emphasis-cache.json でキャッシュ（再実行コスト 0）
- maxTokensPerCall: 8000（JSON 切断防止）

### Q7: 4GB 級動画の読み込み失敗
**原因**: Remotion の OffthreadVideo が 4GB でタイムアウト
**対処**: FFmpeg で事前切り出し（100-200MB 級に縮小）、`<Video>` コンポーネント使用

### Q8: render 進捗が止まったように見える
**対処**: `ps aux | grep remotion` で CPU% 確認。CPU 使用中なら正常。ログ無出力でも kill しない。

---

## 過去のミス記録（再発防止）

| # | 内容 | 対策 |
|---|---|---|
| M5 | concurrency=2 提案 | 必ず =1 |
| M6 | 古いキャッシュで意図しない動作 | .cache/ クリア必須 |
| M8 | テロップ12字超過 | kuromoji 分割 + diagnose で事前検出 |
| S1 | 強調語多すぎ | EMPHASIS_MAX=7 + limitEmphasisByImportance |
| S2 | クロップで顔見切れ | theme.ts の camera 設定を project 単位で調整 |
| S3 | 1本目テストせず全本レンダリング | 必ず1本テスト → OK なら全本 |
| S4 | GPT maxTokens 2000 で JSON 切断 | 8000 に変更済み |
| S5 | --only で candidates.json 上書き | --only 使用禁止、常に全件実行 |
| S6 | みたい merge 無限ループ | MAX_MERGE_OPS=50 安全弁 |
| S7 | 仮説ベースで修正してバグ追加 | データ確認 → 戦略Claude 確定 → 修正の順 |
| M9 | PLAYBOOK 改訂時に有用情報を捨てる | 旧版 .bak 残し、章ごとに削除/維持判断、戦略Claude が網羅確認 |

---

## クイックスタート（新プロジェクト追加時）

```
1. 長尺プロジェクト完成確認 (front/left/right.mp4, script_check.xlsx)
2. このPLAYBOOK.md を読む
3. wellness-shared/docs/architecture.md を読む
4. shorts/project.json を既存から コピー編集
5. shorts/PROJECT_NOTES.md を新規作成
6. Phase 2: step1 (盛り上がり検出)
7. Phase 3: step2 (テロップ生成 + emphasis)
8. Phase 4: diagnose (品質診断)
9. Phase 5: export → 手動修正 → import (任意)
10. Phase 6: ingest (script.json 生成)
11. Phase 7: Studio プレビュー → 1本テストレンダリング → 全本
12. Phase 8: 後処理・確認
```

---

## 長尺との関係

- ショートは長尺の **下流ツール**
- 長尺の front/left/right.mp4 と script_check.xlsx を **読むだけ**（書き込まない）
- 長尺の汎用ルールは `wellness-shared/docs/rules.md` 参照
- 長尺の表記辞書は `wellness-shared/dictionary.json` 共有
- 長尺用 PLAYBOOK は `wellness-shared/docs/PLAYBOOK.md` (別ファイル)

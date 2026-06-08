# PROJECT_NOTES - wellness-video

> このプロジェクト固有の設定・決定事項。次回プロジェクトには持ち越さない。
> 汎用ルールは `rules.md`、汎用ワークフローは `PLAYBOOK.md` を参照。

---

## プロジェクト概要

| 項目 | 値 |
|---|---|
| プロジェクト名 | wellness-video |
| 主題 | ウェルネス代表医師（中田氏）60分動画 |
| 動画長 | 3627.8秒（60.5分） |
| 解像度 | 1920x1080 |
| FPS | 30 |
| コーデック | H.264 / AAC |
| ビットレート | 6.26Mbps |
| 最終ファイルサイズ | 2.64GB |
| 出力先 | `/Volumes/編集用/wellness-video/out/video.mp4` |
| レンダリング日 | 2026-05-18 |
| レンダリング処理時間 | 約5.5時間 |
| Remotion | 4.0.457 |
| React | 19.2.3 |
| TypeScript | 5.9.3 |

---

## デザイン確定設定（src/）

### VideoMain.tsx（174行）

```typescript
// 87行: 画角選択（このプロジェクトでは "front" 固定を選択）
const angles = ["front"];
// ベース仕様では ["front", "right", "left"] の3画角切替が可能
// このプロジェクトでは black挿入の違和感を避けるため front 固定を選択

// 91行: angleフィルタ削除済み（全 segment を front.mp4 で表示）
// 元: seg.angle === angle && ...
// 現: angleフィルタなし
// 注: 画角切替を使う場合は復活させる必要あり

// 98行: 正面拡大
scale = 1.2

// 165-166行: ロゴ位置
top: 40
left: 40
```

#### 画角切替仕様（重要、ベース機能）

このプロジェクトの基盤は **front / right / left の3画角切替** が可能な設計:
- prepare.ts が各 segment に angle 情報を付与
- VideoMain.tsx の `angles` 配列で使用画角を列挙
- seg.angle === angle のフィルタで該当 segment のみ表示
- public/ 配下に front.mp4 / right.mp4 / left.mp4 を配置

**wellness-video では `["front"]` 固定を選択**したが、これは選択肢の1つ。
次回プロジェクトでは用途に応じて選べる:
- 3画角切替: `angles = ["front", "right", "left"]`（デフォルト）
- 2画角: `angles = ["front", "right"]` など
- 1画角固定: `angles = ["front"]`（wellness-video）

### TopicBadge.tsx（59行）

```typescript
background: rgba(0, 146, 249, 0.88)  // 青
padding: '12px 28px'                  // 均等パディング
// 白丸ドット: 削除済み
```

### NameTagLayer.tsx（193行）

```typescript
// 97行: アクセント色
color: '#0092F9'  // 青
```

### logomark.svg

```svg
fill: #3a3a3a  <!-- 元の色、白だと背景明るくて見えなかった -->
```

---

## 特殊用語表記辞書（このプロジェクト固有）

このプロジェクトで使われる英字/カタカナ用語の確定表記:

| 用語 | 出現回数 | 備考 |
|---|---|---|
| AI | 7 | アルファベット |
| Longevity | 4 | 大文字始まり |
| PHR | 3 | 大文字 |
| Wellness App | 2 | 大文字始まり |
| PDCA | 2 | 大文字 |
| Netflix | 1 | 大文字始まり |
| Don't Die | 1 | 書籍タイトル |
| iPhone | 1 | 小文字始まり大文字 |
| 0次予防 | - | アラビア数字（ゼロ次予防は不可） |

→ 次回プロジェクトでは別の用語が出る可能性大。**プロジェクト開始時に表記辞書を更新**すること。

---

## 個別現象の例外扱い（このプロジェクトのみ）

| cam-ID | 現象 | 理由・対応 |
|---|---|---|
| cam-0000 | 0.12秒オーバーラップ | 冒頭のクロスフェード演出、意図的 |
| cam-0205[2]+[3] | 「当たり前の」重複 | RESPLITで生じた意図的リフレイン |
| cam-0283[0]+[1] | 「治療の」重複 | 同上 |
| cam-0087[3]+[4] | 「ですね」連続 | 発話の自然なリフレイン |

→ 次回プロジェクトで類似の重複が出たら「意図的かどうか」を判定するルールは汎用化（rules.md F群参照）。

---

## ツール群（このプロジェクトで作成）

### 恒久ツール（次回プロジェクトでも使う）

| ファイル | 機能 |
|---|---|
| scripts/make_excel.py | script.json → xlsx（J列「修正案」+ K列「アクション」付き） |
| scripts/apply_xlsx_proposals.py | xlsx → script.json 反映（replace/delete/combine_next/--dry-run/--apply/--resync対応） |
| scripts/auto_resync_timing.py | master.json と script.json の境界自動同期 |

### バッチ用（今回限り、レンダリング完了後整理可）

```
apply_fixes.py
apply_fixes_v2.py
apply_batch_v10.py
apply_resplit_v8.py
etc.
```

---


## 触らないファイル

```
❌ scripts/prepare.ts （完成形、5/11 17:03から未変更）
❌ public/master.wav (609.5MB)
❌ public/master.json (19417words, 最終3622.22s)
❌ public/topics.json
❌ public/front.mp4 (4.29GB)
❌ remotion.config.ts
```

---

## 既知 TODO（Phase 5-8 完了時点）

### 1. prepare.ts(123) adjustForCharType 未使用
- 状況: TypeScript の noUnusedLocals 警告として残存
- 理由: prepare.ts は「触らないファイル」宣言（完成形、5/11 17:03 から未変更）
- 対応方針: 放置（長尺の真の負債、ロジック動作には影響なし）

### 2. shorts/src/components/Telop.tsx の _frame, _fps
- 状況: useCurrentFrame() / useVideoConfig() を `_` 接頭辞で宣言、未使用
- 理由: rules.md C-Hook4「冒頭テロップは視覚アニメーション必須」の仕様あり
- 対応方針: 将来 C-Hook4 アニメ実装時に `_` を外して使用

### 3. shorts/scripts/ingest.ts の CAMERA_SWITCH_MAX_SEC
- 状況: 10秒で強制切替の定数、現状コードで未使用
- 理由: PLAYBOOK.md / rules.md / project.json で「最大10秒で強制切替」明記
- 対応方針: 将来 generateCameraSwitches に MAX_SEC 超過判定を追加

### 4. 長尺 tsconfig で shorts/ を exclude（Phase 5-8-C 設計判断）
- 状況: wellness-video/tsconfig.json の exclude に "shorts" を追加
- 理由: 長尺と shorts/ は独立 tsconfig で動く、長尺側で型チェックする必要なし
- 影響: ショートは独自 tsconfig で型チェック、長尺側からは見えない
- 関連: shorts/ 配下の全ファイル(_frame, CAMERA_SWITCH_MAX_SEC 等)は長尺型チェックの対象外

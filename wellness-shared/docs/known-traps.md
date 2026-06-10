# 既知の罠カタログ

最終更新: 2026-06-08

## 目的

過去の制作で発生した問題と、その回避方法をまとめたメモ集。
新セッション開始時に最初に読んで、同じ罠を踏まないこと。
症状 → 原因 → 対処 の形式で記載。

## 1. ファイル・ストレージ系

### 罠1-1: 内蔵 SSD への大容量書き込み (ENOSPC 障害)
- 症状: ENOSPC エラー、Mac 再起動必要、システム停止リスク
- 原因: 内蔵 SSD 容量逼迫、過去複数回の障害履歴あり
- 対処: すべて /Volumes/編集用/ (外付け SSD) に書き込む
- 検出方法: ls -la でシンボリックリンク先確認、readlink でリンク先確認

### 罠1-2: TMPDIR が内蔵 SSD
- 症状: Remotion レンダリングで内蔵 SSD 容量逼迫
- 原因: デフォルト TMPDIR は内蔵 SSD
- 対処: TMPDIR=/Volumes/編集用/tmp_remotion で起動

### 罠1-3: symlink 先の認識ミス
- 症状: 「外付け SSD に書いてる」と思っても実は内蔵 SSD
- 原因: public/ などの symlink を誤認識
- 対処: readlink で symlink 先を確認してから書き込む

## 2. Remotion 系

### 罠2-1: OffthreadVideo で 4GB 動画失敗
- 症状: 「Tried to download file... server sent no data for 20 seconds」タイムアウト
- 原因: OffthreadVideo は HTTP ダウンロード前提、4GB ファイルでタイムアウト
- 対処: <Video> 使用（長尺で実績あり）

### 罠2-2: 4GB 動画を Remotion で直接扱えない
- 症状: 同上、または無限ハング
- 原因: Remotion がフルファイル読み込み試行
- 対処: FFmpeg で事前切り出し → public/short-XXX-{left,right,front}.mp4 (100-200MB 級)

### 罠2-3: cameraSwitches が ingest で上書き
- 症状: 「left 固定」設定が消える
- 原因: ingest.ts で cameraSwitches を再生成
- 対処: project.json で talkType: 'monologue' + cameraMode 指定 (解決済)

### 罠2-4: Studio の defaultProps がテスト用
- 症状: テストテロップしか表示されない
- 原因: Composition の defaultProps が空 or サンプル値
- 対処: Root.tsx で scriptData (script-short-001.json) を defaultProps に注入

### 罠2-5: Remotion render と Studio の使い分け
- 症状: 「Remotion で見たい」を「書き出し」と誤解、無駄な30分レンダリング
- 原因: render = mp4書き出し、Studio = ブラウザプレビュー、混同しやすい
- 対処: 「見たい/確認したい」= Studio、「書き出し/出力/mp4」= Render

### 罠2-6: レンダリング進捗の誤判定
- 症状: 「ハング」と判断したが実は正常進行
- 原因: 数分間ログ更新なくても CPU 99% でフレーム生成中の場合あり
- 対処: ps aux | grep chrome-headless で CPU 使用率確認、停止判断はデータ駆動

## 3. テロップ分割系

### 罠3-1: 「みた+い」無限ループ
- 症状: テロップ分割が永久に止まらない
- 原因: doNotSplitBetween に「みた+い」追加で merge ループ
- 対処: 「みた+い」を doNotSplitBetween から削除、MAX_MERGE_OPS=50 安全弁追加

### 罠3-2: proper-noun 分断
- 症状: 「Wellness Me」+「mbership」、「コミュニ」+「ケーション」
- 原因: kuromoji が固有名詞を文節分割
- 対処: proper-nouns.json に追加、proper-noun 終端ボーナス、12字超過は独立抽出

### 罠3-3: 数字+単位分断
- 症状: 「20万円30」+「万円とかしますし」
- 原因: 数字連続が文節境界として認識
- 対処: NUM_UNIT_PATTERN 正規表現で保護、数字連続チェック追加

### 罠3-4: 行頭禁止文字（拗音/促音/長音/小文字）
- 症状: 「ゃない」「っていう」が行頭に
- 原因: kuromoji の文節境界が文法的に正しくても表示として不適切
- 対処: LINE_START_PROHIBITED チェック追加

### 罠3-5: 3字以下テロップ大量発生
- 症状: 「しま」「もう」等の短いテロップが多発
- 原因: autoSplit12chars のフォールバック強制分割
- 対処: mergeShortTelops で前後と統合 (55%削減)

### 罠3-6: xlsx 行またぎ分断
- 症状: 「予約してたは」+「ずなんだけど」
- 原因: Whisper のセグメント境界
- 対処: 隣接テロップ統合 (merge) + DO_NOT_SPLIT_BETWEEN

### 罠3-7: 緩和リトライで強制ブロック失効
- 症状: DO_NOT_SPLIT_BETWEEN に登録しても分断される
- 原因: 緩和リトライで isInvalidSplitPos スキップ時に DO_NOT_SPLIT_BETWEEN も無視
- 対処: 緩和リトライでも DO_NOT_SPLIT_BETWEEN は維持、LINE_START_PROHIBITED のみ緩和

## 4. データ駆動・判断系（戦略Claude / 北原さん協働）

### 罠4-1: データ確認せず断定
- 症状: 「ハング」「内蔵 SSD 指してる」等を仮説で判断、後で誤りと判明
- 原因: 戦略Claude が過去サマリや一般論で判断、現状データを読まない
- 対処: 修正提案前に必ずファイル全文表示、設計意図のコメント確認

### 罠4-2: 過去サマリの値を「現状」と決めつけ
- 症状: 「fontSize 56」と覚えてたが実際は 72 だった
- 原因: 古いサマリの値を現状値と混同
- 対処: 最新コードを cat で読む、データなしで断定しない

### 罠4-3: Claude Code の自主リファクタを鵜呑み
- 症状: 「切替ラグ解消」設計の重要コメントを見落として承認しそうになる
- 原因: 戦略Claude がコード全体・設計意図を確認せず修正承認
- 対処: 書き込み前にコード全体を読む、コメントの設計意図を必ず確認

### 罠4-4: 「現状確認」フェーズと「修正」フェーズの混同
- 症状: データ確認指示したのに Claude Code がそのまま修正実行
- 原因: 戦略Claude のプロンプトが「確認のみ」と明示してない
- 対処: 「データ報告のみ、修正は戦略Claude 確定後」と明記

## 5. 運用系

### 罠5-1: 永続許可
- 症状: ワイルドカード、--only、複数コマンド連鎖が意図せず実行
- 原因: 「Yes, and don't ask again for...」押すと判断ゲートが消える
- 対処: 絶対押さない、毎回 1 押す、北原さんの判断機会を確保

### 罠5-2: 「これも何回目？」
- 症状: 同じ過ち（データなく断定、現状確認サボる等）を繰り返す
- 原因: 学習してない、忘れる
- 対処: 戦略Claude が毎セッション開始時に known-traps.md を読む

### 罠5-3: 「限界」と言う
- 症状: 「もう対処不可能」と思考停止
- 原因: 3パターン以上の選択肢検証していない
- 対処: 「限界」発言前に必ず3つ以上の選択肢検証

## 罠6: analyze-step1.ts の GPT 非決定性

### 罠6-1: 再実行で候補数・スコアが変動する
- 症状: pnpm step1 を再実行すると候補数やスコアが変動する（12→9 等）
- 原因: GPT API のレスポンスが非決定的（temperature=0.3、seed 未指定）
- 影響: 既存 scoring.json と新規生成の比較が困難、ショート本数の安定性なし
- 対処（現状）: 一度 scoring.json を生成したら使い続ける、再生成は必要時のみ
- 未解決: temperature=0 検証、seed パラメータ対応、scoring-cache.json 検討
- 優先度: 中（今すぐ問題化はしないが長期的には解決必要）

## 罠7: 全ドキュメント確認なしの API 実行

### 罠7-1: 共通辞書の整合性チェックを怠り無駄な API 呼び出し発生
- 症状: Whisper 実行後、proper-nouns に登録済の固有名詞が誤認識されてる（例: 「Dr.中田」→「ドクター中田」）
- 原因: 戦略Claude が新プロジェクト開始時に共通辞書（whisper_terms / dictionary / proper-nouns）の整合性確認を怠った
- 影響: API 課金が発生したのに、辞書未整備のため再実行必要
- 対処: API 呼び出し前に architecture.md の「新プロジェクト開始時の必須確認」セクションを実行する
- 優先度: 高（課金発生 + 時間浪費の直接原因）

## 罠8: xlsx 取り扱い事故

### 罠8-1: xlsx 上書き + prepare.ts 再実行で北原さんの修正案消失
- 症状:
  - 1回目: make_excel.py 再実行で xlsx J列上書き
  - 2回目: dictionary 追加後 prepare.ts 再実行で script.json の手動修正消失
- 原因: dictionary 追加 → prepare.ts 再実行を機械的に連鎖、prepare.ts は master.json からゼロ生成するため手動修正を上書き
- 対処:
  - make_excel.py に自動バックアップ + J列入力警告（cb7c220）
  - **apply_dictionary_to_script.py** で既存 script.json に dictionary だけ追加適用（prepare.ts 経由しない）
  - prepare.ts は master.json が変わった時 + 北原さん明示指示時のみ
  - xlsx 修正案は Google Drive 版履歴で復元可能
- 教訓: 「dictionary 追加 → prepare.ts 再実行」は**禁止パターン**。dictionary 単独適用なら手動修正を保護できる

### 罠8-2: データ未確認の決めつけ
- 症状: 復元版 xlsx の cam-ID 不一致を「別プロジェクト用」と誤判断
- 原因: topic ラベル比較等の基本確認をせず「別プロジェクトかも」と推測
- 対処: データ不一致時はまず topic ラベル比較、仮説は確認後にのみ提示
- 教訓: 焦って決めつけない。データを見てから言う

## メンテナンスルール

罠が新規発見されたら即座にこのファイルに追記すること。
症状 → 原因 → 対処 の3点セットで記述。
過去の罠を再発させない、それがこのファイルの目的。

# Changelog

## 2026-06-06
- 機械診断スクリプト 50+ パターンに拡張
- doNotSplitBetween 追加: と+言/思/考/聞、だけ+で/の/は/じゃ/を/が/に
- doNotStartWith.teRenyou 新規: てます/てました等
- isPostParticle + isNonIndependentNoun で kuromoji 候補拡張
- 緩和リトライ（全候補 isInvalidSplitPos ブロック時、LINE_START のみ緩和）
- SPACE_MIN_LEN: 5 → 2（短テロップもスペース分割対象に）
- 違和感 50 → 36（28%削減）

## 2026-06-05 (late evening)
- バランスペナルティ実装: 両端が4字未満の分割にスコア+100
- isInvalidSplitPos のバランス制約は強制ブロックから外す（無限ループ回避）
- merge ループに MAX_MERGE_OPS=50 安全弁追加
- 違和感 29 → 28

## 2026-06-05 (evening)
- 機械診断スクリプト diagnose-issues.ts 新規作成（18パターン全件検出）
- mergeShortTelops 実装: 3字以下テロップを前後と統合
- 違和感64件 → 29件（55%削減）
- doNotSplitBetween 拡充: と+か、こと+も/は/の、もの+も/は/の、行か+なく/ない、しまう+みた
- isInvalidSplitPos に数字連続チェック追加

## 2026-06-05 (afternoon)
- proper-noun 終端 LINE_START_PROHIBITED スキップ修正（isInvalidSplitPos に properNouns 引数追加）
- proper-noun 分断 9件 → 0件
- proper-nouns に7件追加: ライフスパン、ヘルススパン、オールインクルーシブ、アプリケーション、パーソナルヘルスケアレコード、ジョンソン、パーソナルドクターメンバーシップ
- doNotStartWith.iruKeizoku 拡充: なく/ない/なくて/なくなる/なくなって
- doNotStartWith.mitai 拡充: たい/たく/たくない/たかった/みたい/みたいな/みたいに
- doNotSplitBetween 追加: しまう+みた、行か+なく/ない
- doNotSplitBetween から「みた+い」削除（merge 無限ループ原因）

## 2026-06-05
- telop-display-rules.md 新規作成（正典）
- ルール4（行頭禁止）実装: 促音/拗音/長音/小文字 LINE_START_PROHIBITED
- ルール5（？！除去）実装: removePunctuation 拡張
- split-rules.json に lineStartProhibitedRegex 追加
- 「るんですけれども」分断対処
- doNotStartWith.rundesu 拡充: るんですけ/るんですけど/るんですけれども/るんですよ/るんですね/るんですか + んですけ系
- doNotSplitBetween 追加: るん+ですけ/ですけど/ですけれども, ているん+です/で

## 2026-06-04
- split-rules.json 新規作成（ルール外部化）
- split-rules.md / known-patterns.md / changelog.md 新規作成
- DO_NOT_START_WITH 拡充: 終助詞、補助動詞（いただく/いく/くる/みる/しまう/おく）、動詞活用（やらせて、得られる）
- DO_NOT_SPLIT_BETWEEN 拡充: ものに/ことに、ものになって、はず、られる活用
- COMPOUND_VERB_STARTS 正規表現追加（らせて/られ/させて/せて/れて/れる/れた/れない/いただ/ただ）
- NUM_UNIT_PATTERN 正規表現追加（数字+単位保護）
- 半角スペース強制分割ロジック追加（SPACE_MIN_LEN=5）
- 隣接テロップ統合（merge / merge+resplit）追加
- スペース除去ロジック追加（proper-noun 保護付き）
- 12字超過 proper-noun の独立抽出
- proper-noun 終端ボーナス分割候補
- kuromoji isJiritsugo に動詞活用連鎖チェック追加
- dictionary 追加: 予防医療10/20/30、Wellnessアプリ → Wellness App、戦略的予防量 → 戦略的予防医療
- proper-nouns 追加: コミュニケーション、スティーブ・ジョブズ、戦略的予防医療、予防医療1.0/2.0/3.0

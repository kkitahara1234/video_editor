# The Longevity 2 進捗記録

## ステータス: 完成（2026-06-19）

テーマ: 時間運動学（運動はいつやるかで効果が変わる）。一人語り2カメ(front/left)+1音声、本編8:45。

## 完成物
- 長尺: `out/video.mp4`（h264 1920x1080, 8:50=本編524.8s+エンディング約5s, 黒画面修正済み）
- ショート3本: `shorts/out/short-001/002/003.mp4`（縦型1080x1920, front固定）
  - 001 朝の運動のメリット（106.3-242.4s, 136s）
  - 002 筋トレは夕方がベスト（320.1-399.7s, 80s）
  - 003 夜の筋トレのリスク（400.0-463.16s, 63s, #10でB案=463.16sまで伸ばし）

## タイトル/サムネ/説明文
- サムネ文言: 運動は"いつやるか"で9割決まる
- タイトル: 【医師解説】運動の効果を最大化する"最適な時間帯"｜朝・夕・夜の使い分け
- 説明文: 第1回フォーマット準拠で作成済み（番組紹介＋今回テーマ＋目次＋ハッシュタグ）
- 各ショートのサムネ/タイトル/説明文も作成済み（チャット履歴参照）

## 主要な対処（このプロジェクトで踏んだ問題）
1. HEVC→H.264化: 元10bit素材は public/_original_10bit/ に退避、H.264化して使用
2. 黒画面バグ: script.jsonのangle=right 20件→2カメでright.mp4無し→黒画面。right→left一括変更で解消（script.json.bak.before_right_to_left）
3. テロップ修正: dictionary補正（金剛性→筋合成等）＋手修正で誤認識を除去
4. ショートクロップ左寄り: theme.tsを実体化(symlink解除)し front transform を translate(3%,-10%)→translate(-3%,-10%)に。被写体中心47%を中央化
5. ショート3本目: step2のsuggestedAutoSelection=2で落ちた→scoring.jsonに3本目追加+max=3で再実行

## 次に活かした改善（共有資産に反映済み・コミット済み）
- prepare.ts: --cameras引数追加（2カメは --cameras front,left でright黒画面回避）
- dictionary.json: 306→309件（金剛性→筋合成, クラウドさん→クライアントさん, ボーキング→ウォーキング）
- PLAYBOOK.md: Q7(黒画面トラブル), M9(ミス記録), クイックスタート注意書き
- apply_xlsx_proposals.py: --script引数追加

## 残課題（軽微・後でいつでも可）
- 説明文の目次(チャプター)秒数が推定値のまま。正確化するには topics.json/script.json のtopic境界から取得（動画があるのでいつでも可）
- whisper_terms.txt: 224token上限ギリギリで現状維持（dictionaryで事後補正できるため追加見送り）

## 再開時のメモ
- 全データは外付けSSD `/Volumes/編集用/thelongevity_2/`
- Gitコミット済み（813a712）、GitHub push済み
- 次プロジェクト thelongevity_3 では prepare.ts に `--cameras front,left` を付ける（2カメなら）

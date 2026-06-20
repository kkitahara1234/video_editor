# テロップ動画プロジェクト PLAYBOOK

> 対象: 長尺動画のワークフロー
> 長尺動画にテロップを付ける汎用ワークフロー。
> ルールは `rules.md`、プロジェクト固有設定は `PROJECT_NOTES.md` 参照。

---

## このワークフローの目的

長尺動画（60分前後）に対し、文字起こしから自動生成したテロップを**読みやすく整える**こと。

- 入力: 動画 + 音声 + 文字起こし(master.json)
- 中間: 編集可能なテロップ定義(script.json)
- 出力: テロップ付きレンダリング動画(out/video.mp4)

---

## 体制（3者協業）

| 役割 | 担当 | やること |
|---|---|---|
| 戦略Claude | チャットUI | 戦略・判断・プロンプト作成・修正案レビュー |
| ユーザー | ターミナル | 違和感センサー・最終判断・コマンド承認 |
| Claude Code | CLI | 実装・検証・スクリプト実行 |

**重要**: ユーザーは `ask_user_input_v0` UIを使わず、テキスト返答で進める。

---

## ファイル構成

```
project-root/
├── public/
│   ├── script.json          ★ 編集対象
│   ├── master.wav           ❌ 触らない
│   ├── master.json          ❌ 触らない
│   ├── topics.json          ❌ 触らない
│   ├── front.mp4            ❌ 触らない
│   └── logomark.svg
├── src/
│   ├── VideoMain.tsx        ★ デザイン編集対象
│   └── components/
├── scripts/
│   ├── prepare.ts           ❌ 触らない（完成形）
│   ├── make_excel.py        ★ 恒久ツール
│   ├── apply_xlsx_proposals.py  ★ 恒久ツール
│   └── auto_resync_timing.py    ★ 恒久ツール
├── docs/
│   ├── PLAYBOOK.md          ← この文書（汎用）
│   ├── rules.md             ← 汎用ルール
│   └── PROJECT_NOTES.md     ← プロジェクト固有
└── out/
    └── video.mp4            ← 最終成果物
```

---

## 標準ワークフロー

### Phase 1: 初期準備

```bash
# 整合性チェック
python3 -c "
import json
data = json.load(open('public/script.json'))
subs = data['subtitles']
total = sum(len(v) for v in subs.values())
print(f'総テロップ数: {total}')
print(f'cam数: {len(subs)}')
print(f'totalDurationSec: {data.get(\"totalDurationSec\")}')
"

# Excel書き出し（編集用）
python3 scripts/make_excel.py \
  --script public/script.json \
  --output /Volumes/編集用/script_check.xlsx

# 特殊用語抽出（PROJECT_NOTES.md に記録）
python3 -c "
import json, re
data = json.load(open('public/script.json'))
subs = data['subtitles']
terms = {}
for cam_id, telops in subs.items():
    for t in telops:
        if re.search(r'[a-zA-Z0-9]', t['text']):
            for word in re.findall(r'[A-Za-z][A-Za-z\\\-]*[A-Za-z]', t['text']):
                terms[word] = terms.get(word, 0) + 1
for word, count in sorted(terms.items(), key=lambda x: -x[1]):
    print(f'  {word}: {count}回')
"
```

### Phase 2: テロップレビュー（人間判断）

1. Excel または Google Sheets でテロップ全件を確認
2. J列「修正案」に新しいテキストを記入
3. K列「アクション」に `replace` / `delete` / `combine_next` を記入
4. 保存

**判断基準**: `rules.md` の A〜F ルールに準拠。

### Phase 3: 修正反映（dry-run → apply）

```bash
# dry-run（検証のみ）
python3 scripts/apply_xlsx_proposals.py \
  --xlsx /Volumes/編集用/script_check.xlsx \
  --script public/script.json \
  --dry-run

# 戦略Claudeが結果確認:
# - コンフリクト（同cam-IDに複数案）なし
# - 25字超過なし
# - 元テキスト不一致なし

# OKなら本番反映
cp public/script.json public/script.json.bak.$(date +%s)
python3 scripts/apply_xlsx_proposals.py \
  --xlsx /Volumes/編集用/script_check.xlsx \
  --script public/script.json \
  --apply --resync
```

### Phase 4: 最終整合性チェック

```bash
# subtitle_linter.py で全項目チェック（実装予定）
python3 scripts/subtitle_linter.py public/script.json
```

必須クリア（rules.md A群）:
- JSONバリデーション OK
- startSec < endSec すべて
- 25字超過 0件
- cps>=20.0 0件
- 句読点・連続スペース・先頭末尾スペース 0件
- 隣接オーバーラップ 0件（クロスフェード例外を除く）

許容（rules.md B群）:
- cps>=15: 警告のみ
- duration<0.3s: 警告のみ

### Phase 5: レンダリング前準備

```bash
# 1. Studio停止
pkill -f "remotion studio"
pkill -f "remotion/compositor"

# 2. キャッシュクリア（古いビルド残存対策）
rm -rf node_modules/.cache/
rm -rf .cache/

# 3. caffeinate起動（10時間スリープ防御）
sudo pkill caffeinate
nohup caffeinate -dimsu -t 36000 > /tmp/caffeinate.log 2>&1 &

# 4. idleassetsd停止（暴走防止）
sudo launchctl bootout system/com.apple.idleassetsd 2>/dev/null
sudo launchctl disable system/com.apple.idleassetsd 2>/dev/null

# 5. TMPDIR準備
rm -rf /Volumes/編集用/tmp_remotion
mkdir -p /Volumes/編集用/tmp_remotion

# 6. AC電源 物理確認 ← ユーザー目視必須
# 7. ディスク空き確認
df -h /Volumes/編集用
```

### Phase 6: 本番レンダリング

```bash
cd /path/to/project

TMPDIR=/Volumes/編集用/tmp_remotion \
TMP=/Volumes/編集用/tmp_remotion \
TEMP=/Volumes/編集用/tmp_remotion \
npx remotion render src/index.ts WellnessVideo out/video.mp4 \
  --timeout=300000 \
  --concurrency=1 \
  --log=verbose \
  2>&1 | tee /tmp/render.log
```

**重要設定**:
- `concurrency=1` 厳守（=2はメモリ食い切るリスク）
- `--timeout=300000`（5分/フレーム）
- 60分動画で約5〜6時間

### Phase 7: 後処理

```bash
# caffeinate停止
pkill caffeinate

# tmp_remotion クリーン
rm -rf /Volumes/編集用/tmp_remotion/*

# 出力確認
ls -lh out/video.mp4
ffprobe -v error -show_entries format=duration,size,bit_rate \
  -of default=noprint_wrappers=1 out/video.mp4

# 動画再生確認（人間目視）
open out/video.mp4
```

---

## トラブルシューティング

### Q1: 「画角切り替わる」と見えるが、コードでは固定したはず
**原因**: Remotion Studio の古いビルドキャッシュ

```bash
pkill -f "remotion studio"
rm -rf node_modules/.cache/ .cache/
# Studio再起動 + ブラウザ Cmd+Shift+R
```

### Q2: resync後にcps>=20.0が発生
**原因**: RESPLITで文字を前テロップに移動 → 本テロップのdurationが極短に

**対処**:
- 本テロップを前テロップに完全吸収して削除
- または次cam[0]に吸収（cam跨ぎパターン）
- 結合後25字超過しないか必ず事前計算

### Q3: 「元テキスト不一致」でskipされる
**原因**: xlsx記入時とscript.jsonが不一致

**対処**: Excelを最新のscript.jsonから**再生成**してから修正案を記入し直す

### Q4: combine_next がcam跨ぎで失敗
**原因**: `apply_xlsx_proposals.py` は同一cam内のみ対応

**対処**: 該当テロップを `delete` + 次cam[0]を `replace` で先頭にテキスト追加

### Q5: レンダリング中にスリープしてしまった
**原因**: caffeinate の `-t` オプション切れ、または `-i` だけで他防御が抜けてた

**対処**: 必ず `caffeinate -dimsu -t 36000` を使用

### Q6: idleassetsd が暴走する
```bash
sudo launchctl bootout system/com.apple.idleassetsd
sudo launchctl disable system/com.apple.idleassetsd
sudo launchctl unload /System/Library/LaunchDaemons/com.apple.idleassetsd.plist
```

### Q7: 動画の一部が黒画面になる（2カメプロジェクト）
**原因**: prepare.ts がデフォルトで front/left/right の3カメローテーションを割り当てるが、2カメプロジェクトには right.mp4 が無い

**対処（恒久）**: prepare.ts 実行時に `--cameras front,left` を指定
```bash
npx tsx prepare.ts --whisper master.json --topics work/topics.json --cameras front,left
```

**対処（応急）**: 既に生成済みの script.json で right が割り当てられている場合
```bash
cp public/script.json public/script.json.bak.before_right_to_left
python3 -c "
import json
with open('public/script.json') as f: s=json.load(f)
for seg in s['segments']:
    if seg.get('angle')=='right': seg['angle']='left'
with open('public/script.json','w') as f: json.dump(s,f,ensure_ascii=False,indent=2)
"
```

### Q8: master.json と script.json の境界がズレる
```bash
python3 scripts/auto_resync_timing.py \
  --script public/script.json \
  --master public/master.json \
  --threshold 0.05 \
  --apply
```

---

## 過去のミス記録（再発防止）

| # | 内容 | 対策 |
|---|---|---|
| M1 | 機械的に40件提案 → コンフリクト発生 | 既修正のcam-IDを除外する事前チェック必須 |
| M2 | 件数を勝手に推測 | dry-runで実測してから提案 |
| M3 | combine_next が cam跨ぎで失敗 | 同一cam内のみ対応、cam跨ぎは代案使用 |
| M4 | 不要なプレビュー書き出し | Studio確認するならpreviewレンダリング不要 |
| M5 | concurrency=2 提案 | 必ず =1 |
| M6 | 古いキャッシュで angle 切り替えが見えた | Studio起動前に .cache/ クリア必須 |
| M9 | 2カメなのに right が割り当てられ黒画面 | prepare.ts に `--cameras front,left` を付ける |
| M7 | RESPLIT後の境界resyncでdur=0発生 | 必ず startSec>=endSec チェック |
| M8 | 25字超過が結合後に発生 | 結合する前に必ず文字数試算 |

---

## クイックスタート（次回プロジェクト用）

```
1. このPLAYBOOK.md を読む
2. rules.md を読む
3. PROJECT_NOTES.md を新規作成（このプロジェクトの固有情報を記載）
4. master.json から script.json 生成（prepare.ts）
   ⚠️ 2カメ(front/left)は --cameras front,left 必須（下記参照）
5. Phase 1: 初期準備（特殊用語抽出 → PROJECT_NOTES.md に記録）
6. Phase 2-3: テロップレビュー → dry-run → apply
7. Phase 4: 最終整合性チェック
8. Phase 5: レンダリング前準備
9. Phase 6: 本番レンダリング
10. Phase 7: 後処理 + 納品判断
```

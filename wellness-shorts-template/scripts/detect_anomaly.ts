#!/usr/bin/env node
/**
 * detect_anomaly.ts
 *
 * script.json のテロップから「日本語としておかしい」候補を抽出。
 * ルールベース検出（API 不要、ゼロ円）。
 * 出力を戦略Claude に渡して前後文脈で正解推測 → dictionary 追加。
 *
 * 使い方:
 *   npx tsx scripts/detect_anomaly.ts <script.json> [output.json]
 */

import { readFileSync, writeFileSync } from "fs";

const SCRIPT_PATH = process.argv[2] || "public/script.json";
const OUT_PATH = process.argv[3] || "work/anomaly_candidates.json";

type Telop = { text: string; absStartSec?: number; startSec?: number; endSec?: number };
type Script = { subtitles: Record<string, Telop[]> };

interface Anomaly {
  cam_id: string;
  idx: number;
  text: string;
  startSec: number;
  reasons: string[];
  before: string[];
  after: string[];
}

const script: Script = JSON.parse(readFileSync(SCRIPT_PATH, "utf-8"));

// 全テロップ時系列リスト
const all: { cam_id: string; idx: number; text: string; startSec: number }[] = [];
for (const [cam_id, telops] of Object.entries(script.subtitles)) {
  telops.forEach((t, idx) => {
    all.push({ cam_id, idx, text: t.text, startSec: t.absStartSec ?? t.startSec ?? 0 });
  });
}
all.sort((a, b) => a.startSec - b.startSec);

// ルールベース検出
const anomalies: Anomaly[] = [];

for (let i = 0; i < all.length; i++) {
  const { cam_id, idx, text, startSec } = all[i];
  const reasons: string[] = [];

  // 1. 同じ漢字の連続反復（「子子」「等等」等）
  const kanjiRepeat = text.match(/([一-龯])\1/);
  if (kanjiRepeat) {
    reasons.push(`漢字反復: ${kanjiRepeat[0]}`);
  }

  // 2. カタカナ語の反復（「ステビリステビリ」等）
  const kataRepeat = text.match(/([ァ-ンー]{2,})\1/);
  if (kataRepeat) {
    reasons.push(`カタカナ語反復: ${kataRepeat[0]}`);
  }

  // 3. 一般的でない漢字2文字テロップ（意味不明系）
  if (/^[一-龯]{2}$/.test(text)) {
    const common2 = new Set([
      '今日', '明日', '今年', '時間', '人間', '世界', '自分', '本当', '最近', '結局',
      '結果', '今回', '前回', '次回', '健康', '病気', '医療', '予防', '治療', '運動',
      '食事', '睡眠', '疲労', '体重', '筋肉', '関節', '骨密', '血圧', '血糖', '血液',
      '心臓', '内臓', '骨格', '脂肪', '肥満', '栄養', '検査', '診断', '症状', '重要',
      '必要', '可能', '改善', '維持', '効果', '意識', '実際', '具体', '特に', '非常',
      '大切', '将来', '一般', '基本', '最大', '最小', '大事', '脳が',
    ]);
    if (!common2.has(text)) {
      reasons.push(`不自然な2字漢字: ${text}`);
    }
  }

  // 4. 不自然な書き出し
  if (/^[ぁぱばだ][どんぐ]/.test(text) && text.length <= 6) {
    reasons.push(`不自然な書き出し: ${text.slice(0, 4)}`);
  }

  // 5. 「高+一般語」の Whisper 誤認識パターン（「高筋肉」「高柔軟」等）
  const weirdTaka = text.match(/高[一-龯]{2}/);
  if (weirdTaka && !['高血圧', '高齢者', '高齢化', '高品質', '高機能', '高脂血'].includes(weirdTaka[0])) {
    reasons.push(`「高+語」誤認識疑い: ${weirdTaka[0]}`);
  }

  // 6. 「等+一般語」の Whisper 誤認識パターン（「等以上」「等量病」等）
  if (/等[一-龯]/.test(text) && !/等[々身分]/.test(text)) {
    const m = text.match(/等[一-龯]{1,3}/);
    if (m) reasons.push(`「等+語」誤認識疑い: ${m[0]}`);
  }

  // 7. 「音+一般語」の Whisper 誤認識パターン（「音機能」等）
  if (/音[一-龯]{2}/.test(text)) {
    const m = text.match(/音[一-龯]{2,3}/);
    if (m && !['音楽的', '音声認'].includes(m[0])) {
      reasons.push(`「音+語」誤認識疑い: ${m[0]}`);
    }
  }

  // 8. 半角英字が小文字のみ（大文字表記が正しい可能性）
  const lowerAlpha = text.match(/\b[a-z]{2,}\b/g);
  if (lowerAlpha) {
    for (const w of lowerAlpha) {
      if (!['max', 'min', 'the', 'and', 'for', 'not', 'but', 'with', 'this', 'that', 'from'].includes(w)) {
        reasons.push(`小文字英字: ${w}`);
      }
    }
  }

  if (reasons.length > 0) {
    const before = all.slice(Math.max(0, i - 3), i).map(t => t.text);
    const after = all.slice(i + 1, Math.min(all.length, i + 4)).map(t => t.text);

    anomalies.push({
      cam_id,
      idx,
      text,
      startSec,
      reasons,
      before,
      after,
    });
  }
}

writeFileSync(OUT_PATH, JSON.stringify(anomalies, null, 2));

console.log(`✅ 検出: ${anomalies.length}件`);
console.log(`📄 出力: ${OUT_PATH}`);
console.log(``);
console.log(`--- 全件 ---`);
for (const a of anomalies) {
  console.log(`  [${a.startSec.toFixed(1)}s] ${a.cam_id}[${a.idx}]: "${a.text}"`);
  console.log(`    理由: ${a.reasons.join(', ')}`);
  console.log(`    前: ${a.before.join(' | ')}`);
  console.log(`    後: ${a.after.join(' | ')}`);
  console.log(``);
}

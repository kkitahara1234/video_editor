#!/usr/bin/env node
/**
 * adjust-scoring.ts
 *
 * scoring.json の各候補の startSec/endSec を文末境界まで自動延長
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadXlsxTelops, XlsxTelop } from './lib/xlsx-loader.js';
import { loadConfig } from './lib/loadConfig.js';

const MAX_EXTEND_SEC = 15;
const LONG_GAP_THRESHOLD = 0.5;

const SENTENCE_ENDINGS = [
  'です', 'ます', 'ました', 'ません',
  'でしょう', 'でした', 'ましょう',
  'んです', 'んだ',
];

const NEW_SENTENCE_START = [
  'で',
  'まあ',
  'あと',
  '次に',
  'そして',
  'それで',
  'ところで',
  'でですね',
];

function isSentenceEnd(
  text: string,
  nextStartSec: number | null,
  currentEndSec: number,
  nextText: string | null
): boolean {
  const cleanText = text.replace(/[、。\s]/g, '');

  // 1. 厳密な文末助動詞
  for (const e of SENTENCE_ENDINGS) {
    if (cleanText.endsWith(e)) return true;
  }

  // 2. 次のテロップが新文頭で始まる
  if (nextText) {
    const cleanNext = nextText.replace(/[、。\s]/g, '');
    for (const s of NEW_SENTENCE_START) {
      if (cleanNext.startsWith(s)) return true;
    }
  }
  if (nextStartSec !== null && (nextStartSec - currentEndSec) >= LONG_GAP_THRESHOLD) {
    return true;
  }
  return false;
}

async function main() {
  const configPath = path.resolve('project.json');
  const config = loadConfig(configPath);
  const scoringPath = path.resolve(config.workDir, 'scoring.json');

  // バックアップ
  const ts = Math.floor(Date.now() / 1000);
  fs.copyFileSync(scoringPath, `${scoringPath}.bak.before-adjust.${ts}`);
  console.log(`Backup: scoring.json.bak.before-adjust.${ts}`);

  // 読み込み
  const scoring = JSON.parse(fs.readFileSync(scoringPath, 'utf-8'));
  const candidates = scoring.suggestedAutoSelection || scoring.allCandidatesRanked;
  const allTelops = loadXlsxTelops(config.xlsxPath);

  // 時刻順にソート
  allTelops.sort((a, b) => a.startSec - b.startSec);

  let totalStartShift = 0;
  let totalEndShift = 0;

  console.log('\n=== Adjustment ===');
  for (const c of candidates) {
    const origStart = c.startSec;
    const origEnd = c.endSec;

    // === endSec 後方延長 ===
    const maxEnd = origEnd + MAX_EXTEND_SEC;
    let newEnd = origEnd;
    for (let i = 0; i < allTelops.length; i++) {
      const t = allTelops[i];
      if (t.startSec < origEnd) continue;
      if (t.startSec > maxEnd) break;
      const nextT = allTelops[i + 1];
      const nextStart = nextT ? nextT.startSec : null;
      const nextText = nextT ? nextT.text : null;
      if (isSentenceEnd(t.text, nextStart, t.endSec, nextText)) {
        newEnd = t.endSec;
        break;
      }
    }

    // === startSec 前方延長 ===
    const minStart = origStart - MAX_EXTEND_SEC;
    let newStart = origStart;
    for (let i = allTelops.length - 1; i >= 0; i--) {
      const t = allTelops[i];
      if (t.endSec > origStart) continue;
      if (t.endSec < minStart) break;
      const nextT = allTelops[i + 1];
      const nextStart = nextT ? nextT.startSec : null;
      const nextText = nextT ? nextT.text : null;
      if (isSentenceEnd(t.text, nextStart, t.endSec, nextText)) {
        if (nextT) newStart = nextT.startSec;
        else newStart = t.endSec;
        break;
      }
    }

    const startShift = origStart - newStart;
    const endShift = newEnd - origEnd;
    totalStartShift += startShift;
    totalEndShift += endShift;

    c.startSec = newStart;
    c.endSec = newEnd;
    c.durationSec = newEnd - newStart;

    console.log(`${c.shortId}: start ${origStart.toFixed(1)}s → ${newStart.toFixed(1)}s (-${startShift.toFixed(1)}s), end ${origEnd.toFixed(1)}s → ${newEnd.toFixed(1)}s (+${endShift.toFixed(1)}s), dur ${c.durationSec.toFixed(1)}s`);
  }

  fs.writeFileSync(scoringPath, JSON.stringify(scoring, null, 2));

  console.log('\n=== Summary ===');
  console.log(`Total start shift (前方延長): ${totalStartShift.toFixed(1)}s`);
  console.log(`Total end shift (後方延長): ${totalEndShift.toFixed(1)}s`);
  console.log(`\nNext: pnpm tsx scripts/analyze-step2-v2.ts`);
}

main().catch(e => { console.error(e); process.exit(1); });

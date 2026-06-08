#!/usr/bin/env node
/**
 * adjust-scoring-gpt.ts
 *
 * 実験的: GPT で「話のまとまり」を判定して scoring.json の境界を調整
 * 通常は adjust-scoring.ts（非GPT版、文末助動詞+gap ベース）を使用。
 * GPT 版は精度が必要な場合のみ呼び出す。
 *
 * 使い方:
 *   pnpm tsx scripts/adjust-scoring-gpt.ts --only short-001 --dry-run  # 検証
 *   pnpm tsx scripts/adjust-scoring-gpt.ts --only short-001            # 1個だけ反映
 *   pnpm tsx scripts/adjust-scoring-gpt.ts                             # 全部
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadXlsxTelops, XlsxTelop } from './lib/xlsx-loader.js';
import { loadConfig } from './lib/loadConfig.js';
import { callGptJson } from './lib/gpt-client.js';

const XLSX_PATH = '/Volumes/編集用/script_check.xlsx';
const CONTEXT_RANGE_SEC = 30;
const MIN_DURATION = 60;
const MAX_DURATION = 180;

type GptResponse = {
  newStartSec: number;
  newEndSec: number;
  reasoning: string;
};

function buildPrompt(
  shortId: string,
  label: string,
  currentStart: number,
  currentEnd: number,
  context: XlsxTelop[],
): string {
  const lines = context.map(t => {
    const marker = (t.startSec <= currentStart && t.endSec > currentStart) ? ' ← 現在の startSec'
      : (t.startSec < currentEnd && t.endSec >= currentEnd) ? ' ← 現在の endSec'
      : '';
    return `[${t.startSec.toFixed(1)}s-${t.endSec.toFixed(1)}s] ${t.text}${marker}`;
  }).join('\n');

  return `あなたはショート動画編集のプロです。
以下の動画候補について、startSec と endSec を「話としてまとまるように」調整してください。

【候補情報】
- shortId: ${shortId}
- ラベル: ${label}
- 現在の startSec: ${currentStart.toFixed(1)}s
- 現在の endSec: ${currentEnd.toFixed(1)}s
- 現在の duration: ${(currentEnd - currentStart).toFixed(1)}s

【前後30秒のテロップ】
${lines}

【判断基準】
1. 冒頭が文の途中（「〜していくということを」など）なら、前に伸ばして文の最初から開始
2. 末尾が文の途中（「〜もの」「〜とか」など）なら、後ろに伸ばして文の終わりまで
3. 既に話が完結してる位置を超えて延長しない（蛇足回避）
4. 同じ内容の繰り返しが含まれないようにする
5. duration は 60秒〜180秒に収める
6. 「盛り上がりがあって話としてまとまっている」状態を目指す

【出力】
以下の JSON フォーマット:
{
  "newStartSec": <数値>,
  "newEndSec": <数値>,
  "reasoning": "<判断理由を簡潔に>"
}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const onlyShortId = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const configPath = path.resolve('project.json');
  const config = loadConfig(configPath);
  const scoringPath = path.resolve(config.workDir, 'scoring.json');

  // バックアップ
  const ts = Math.floor(Date.now() / 1000);
  if (!isDryRun) {
    fs.copyFileSync(scoringPath, `${scoringPath}.bak.before-gpt-adjust.${ts}`);
    console.log(`Backup: scoring.json.bak.before-gpt-adjust.${ts}`);
  } else {
    console.log('=== DRY-RUN: scoring.json は更新しません ===');
  }

  const scoring = JSON.parse(fs.readFileSync(scoringPath, 'utf-8'));
  const candidates = scoring.suggestedAutoSelection || scoring.allCandidatesRanked;
  const allTelops = loadXlsxTelops(XLSX_PATH);
  allTelops.sort((a, b) => a.startSec - b.startSec);

  const targets = onlyShortId ? candidates.filter((c: any) => c.shortId === onlyShortId) : candidates;
  console.log(`\nTargeting ${targets.length} candidate(s)`);

  console.log('\n=== GPT Adjustment ===');
  for (const c of targets) {
    const origStart = c.startSec;
    const origEnd = c.endSec;

    const context = allTelops.filter(t =>
      t.startSec >= origStart - CONTEXT_RANGE_SEC &&
      t.endSec <= origEnd + CONTEXT_RANGE_SEC
    );

    if (context.length === 0) {
      console.log(`${c.shortId}: no context, skip`);
      continue;
    }

    try {
      const prompt = buildPrompt(c.shortId, c.label || '', origStart, origEnd, context);
      const result = await callGptJson<GptResponse>(
        prompt,
        config.gpt.model,
        config.gpt.maxTokensPerCall,
        config.gpt.temperature,
      );

      const newStart = result.newStartSec;
      const newEnd = result.newEndSec;
      const duration = newEnd - newStart;

      console.log(`\n${c.shortId}: ${origStart.toFixed(1)}-${origEnd.toFixed(1)} → ${newStart.toFixed(1)}-${newEnd.toFixed(1)} (${duration.toFixed(1)}s)`);
      console.log(`  reasoning: ${result.reasoning}`);

      if (duration < MIN_DURATION || duration > MAX_DURATION) {
        console.log(`  ⚠️  duration out of range (${MIN_DURATION}-${MAX_DURATION}s), skip update`);
        continue;
      }

      if (!isDryRun) {
        c.startSec = newStart;
        c.endSec = newEnd;
        c.durationSec = duration;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${c.shortId}: GPT error: ${msg}`);
    }
  }

  if (!isDryRun) {
    fs.writeFileSync(scoringPath, JSON.stringify(scoring, null, 2));
    console.log(`\n✅ scoring.json updated`);
    console.log(`\nNext: pnpm tsx scripts/analyze-step2-v2.ts`);
  } else {
    console.log(`\n=== DRY-RUN COMPLETED ===`);
    console.log(`If results look good, run without --dry-run`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

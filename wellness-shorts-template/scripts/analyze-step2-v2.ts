#!/usr/bin/env node
/**
 * analyze-step2-v2.ts
 *
 * 目的:
 *   xlsx のフルテロップを正典として使い、コードで処理。
 *   GPT は emphasis 抽出のみに使用（軽量）。
 *
 * 入出力:
 *   入力: project.json, scoring.json, script_check.xlsx, dictionary.json, proper-nouns.json
 *   出力: data/work/candidates.json
 *
 * 使い方:
 *   pnpm tsx scripts/analyze-step2-v2.ts              # 全候補実行
 *   pnpm tsx scripts/analyze-step2-v2.ts --dry-run    # GPT呼ばず構造確認のみ
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './lib/loadConfig.js';
import { loadXlsxTelops, XlsxTelop } from './lib/xlsx-loader.js';
import { callGptJson } from './lib/gpt-client.js';
import { fixText } from '../../wellness-shared/display-corrections.js';
import type { DetailedCandidate, CandidatesJson, RefinedTelop, TelopEmphasis } from './lib/step2-types.js';
import { loadCache, saveCache, findEntry, addEntry } from './lib/emphasis-cache.js';
import kuromoji from 'kuromoji';

const XLSX_PATH = '/Volumes/編集用/script_check.xlsx';
const DICTIONARY_PATH = '/Volumes/編集用/wellness-shared/dictionary.json';
const PROPER_NOUNS_PATH = '/Volumes/編集用/wellness-shared/proper-nouns.json';
const SPLIT_RULES_PATH = '/Volumes/編集用/wellness-shared/split-rules.json';
const EDIT_PATTERNS_PATH = path.join(process.cwd(), 'data', 'work', 'edit-patterns.json');

// split-rules.json からルール読み込み
const splitRules = JSON.parse(fs.readFileSync(SPLIT_RULES_PATH, 'utf-8'));
const TELOP_MAX_CHARS = splitRules.constants.TELOP_MAX_CHARS;
const EMPHASIS_MAX = splitRules.constants.EMPHASIS_MAX;

// 言い淀みパターン（行頭にあるものを削除）
const FILLER_PATTERNS = [
  /^えーと[、]?/g,
  /^えーっと[、]?/g,
  /^えっと[、]?/g,
  /^あのー?[、]?/g,
  /^まあ[、]?/g,
  /^うーん[、]?/g,
  /^なんか[、]?/g,
  /^そのー?[、]?/g,
];

// === コードベース処理 ===

function loadDictionary(dictPath: string): Record<string, string> {
  if (!fs.existsSync(dictPath)) return {};
  return JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
}

type EditPattern = {
  shortId: string;
  startSec: number;
  originalText: string;
  newText: string;
};

function loadEditPatterns(p: string): EditPattern[] {
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return data.textReplacements || [];
}

function applyEditPatterns(
  shortId: string,
  telops: RefinedTelop[],
  patterns: EditPattern[]
): RefinedTelop[] {
  const relevantPatterns = patterns.filter(p => p.shortId === shortId);
  if (relevantPatterns.length === 0) return telops;

  let applied = 0;
  const result = telops.map(t => {
    const match = relevantPatterns.find(p =>
      Math.abs(p.startSec - t.startSec) < 0.05 && p.originalText === t.text
    );
    if (match) {
      applied++;
      return { ...t, text: match.newText };
    }
    return t;
  });
  console.log(`     🔧 Applied ${applied} edit patterns for ${shortId}`);
  return result;
}

function loadProperNouns(p: string): string[] {
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function findProperNounRanges(text: string, properNouns: string[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const noun of properNouns) {
    let idx = text.indexOf(noun);
    while (idx >= 0) {
      ranges.push({ start: idx, end: idx + noun.length });
      idx = text.indexOf(noun, idx + 1);
    }
  }
  return ranges;
}

function removeFillers(text: string): string {
  let result = text;
  for (const pattern of FILLER_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

function removePunctuation(text: string): string {
  return text.replace(/[、。,.，．？！?!]/g, '');
}

function applyDictionary(text: string, dictionary: Record<string, string>): string {
  let result = text;
  const sortedEntries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sortedEntries) {
    result = result.split(from).join(to);
  }
  return fixText(result);
}

// split-rules.json からルール読み込み
const DO_NOT_START_WITH: string[] = Object.values(splitRules.doNotStartWith).flat() as string[];
const DO_NOT_SPLIT_BETWEEN: Array<{ before: string; afterStartsWith: string }> = splitRules.doNotSplitBetween;

function isInvalidSplitPos(text: string, splitPos: number, properNouns?: string[]): boolean {
  // splitPos の直後の文字列を取得
  const after = text.slice(splitPos);

  // D/C群: 直後が禁止語で始まる
  for (const prefix of DO_NOT_START_WITH) {
    if (after.startsWith(prefix)) return true;
  }

  // C群: 直前+直後の組み合わせ
  for (const rule of DO_NOT_SPLIT_BETWEEN) {
    const beforeSlice = text.slice(Math.max(0, splitPos - rule.before.length), splitPos);
    if (beforeSlice === rule.before && after.startsWith(rule.afterStartsWith)) {
      return true;
    }
  }

  // 数字の途中で分割しない（数字連続: 365 → 36+5 NG）
  const beforeChar = text[splitPos - 1];
  if (beforeChar && /[0-9０-９]/.test(beforeChar) && /^[0-9０-９]/.test(after)) {
    return true;
  }

  // 数字 + 単位（万/億/円/%/年/ヶ月/日/時間/分/秒等）の分断回避
  const NUM_UNIT_PATTERN = new RegExp(splitRules.numUnitRegex);
  if (beforeChar && /[0-9０-９]/.test(beforeChar) && NUM_UNIT_PATTERN.test(after)) {
    return true;
  }
  // 「万円」「億円」の連結も保護
  if ((beforeChar === '万' || beforeChar === '億') && after.startsWith('円')) {
    return true;
  }

  // 複合動詞の分断回避（「やらせていただく」「得られる」等）
  // splitPos 以降が「らせて」「られ」「せて」で始まり、動詞活用の内部である場合
  const COMPOUND_VERB_STARTS = new RegExp(splitRules.compoundVerbStartsRegex);
  if (COMPOUND_VERB_STARTS.test(after)) {
    return true;
  }

  // 行頭禁止: 促音/拗音/長音/小文字濁音半濁音（telop-display-rules.md ルール4）
  // ただし splitPos が proper-noun 終端なら例外（単語境界優先）
  const LINE_START_PROHIBITED = /^[っッゃゅょャュョーぁぃぅぇぉァィゥェォ]/;
  if (LINE_START_PROHIBITED.test(after)) {
    let isProperNounEnd = false;
    if (properNouns) {
      for (const noun of properNouns) {
        let idx = text.indexOf(noun);
        while (idx >= 0) {
          if (idx + noun.length === splitPos) {
            isProperNounEnd = true;
            break;
          }
          idx = text.indexOf(noun, idx + 1);
        }
        if (isProperNounEnd) break;
      }
    }
    if (!isProperNounEnd) {
      return true;
    }
  }

  return false;
}

type KuromojiToken = {
  surface_form: string;
  pos: string;
  pos_detail_1: string;
};

async function buildTokenizer(): Promise<any> {
  const dicPath = path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict');
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err: any, tokenizer: any) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
}

function isJiritsugo(tok: KuromojiToken): boolean {
  if (tok.pos === '名詞' && !['非自立', '接尾'].includes(tok.pos_detail_1)) return true;
  if (tok.pos === '動詞' && tok.pos_detail_1 === '自立') return true;
  if (tok.pos === '形容詞' && tok.pos_detail_1 === '自立') return true;
  if (['副詞', '接続詞', '連体詞'].includes(tok.pos)) return true;
  if (tok.pos === 'フィラー') return true;
  return false;
}

// 助詞の直後も文節境界候補（isJiritsugo だけでは候補が生成されないケース対策）
function isPostParticle(tokens: KuromojiToken[], i: number): boolean {
  if (i === 0) return false;
  const prev = tokens[i - 1];
  return prev.pos === '助詞' || prev.pos === '助動詞';
}

function isPrevAdverbModifying(tokens: KuromojiToken[], i: number): boolean {
  if (i === 0) return false;
  const prev = tokens[i - 1];
  const curr = tokens[i];
  if (prev.pos === '副詞' && (curr.pos === '動詞' || curr.pos === '形容詞')) {
    return true;
  }
  return false;
}

function autoSplit12chars(
  telop: RefinedTelop,
  properNouns: string[],
  tokenizer: any,
  maxChars: number = TELOP_MAX_CHARS,
): RefinedTelop[] {
  if (telop.text.length <= maxChars) return [telop];

  const TRACE = process.env.TRACE_SPLIT === '1' && (telop.text.includes('しまうみたい') || telop.text.includes('行かなくなるんですね'));
  if (TRACE) console.error(`\n--- TRACE autoSplit ---\ninput: "${telop.text}" (${telop.text.length}字)`);

  // 12字超過 proper-noun を 1テロップとして独立抽出
  const properRangesAll = findProperNounRanges(telop.text, properNouns);
  for (const range of properRangesAll) {
    const properLen = range.end - range.start;
    if (properLen > maxChars) {
      const beforeText = telop.text.slice(0, range.start);
      const properText = telop.text.slice(range.start, range.end);
      const afterText = telop.text.slice(range.end);
      const totalLen = telop.text.length;
      const totalDur = telop.endSec - telop.startSec;

      const properStart = telop.startSec + totalDur * (range.start / totalLen);
      const properEnd = telop.startSec + totalDur * (range.end / totalLen);

      const result: RefinedTelop[] = [];

      if (beforeText.trim().length > 0) {
        const beforeTelop = { text: beforeText.trim(), startSec: telop.startSec, endSec: properStart, emphasis: [] as TelopEmphasis[] };
        result.push(...autoSplit12chars(beforeTelop, properNouns, tokenizer, maxChars));
      }

      result.push({ text: properText, startSec: properStart, endSec: properEnd, emphasis: [] });
      console.log(`     🔒 Kept proper-noun "${properText}" (${properLen} chars, exceeds maxChars)`);

      if (afterText.trim().length > 0) {
        const afterTelop = { text: afterText.trim(), startSec: properEnd, endSec: telop.endSec, emphasis: [] as TelopEmphasis[] };
        result.push(...autoSplit12chars(afterTelop, properNouns, tokenizer, maxChars));
      }

      return result;
    }
  }

  // 半角スペースを強制分割位置として扱う（Whisper xlsx の文区切り由来）
  const spacePositions: number[] = [];
  for (let i = 0; i < telop.text.length; i++) {
    if (telop.text[i] === ' ') spacePositions.push(i + 1);
  }

  const SPACE_MIN_LEN = splitRules.constants.SPACE_MIN_LEN;
  if (spacePositions.length > 0) {
    const center = Math.floor(telop.text.length / 2);
    let bestSpace = -1;
    let bestSpaceDist = Infinity;
    for (const sp of spacePositions) {
      const beforeLen = telop.text.slice(0, sp).trim().length;
      const afterLen = telop.text.slice(sp).trim().length;
      if (beforeLen === 0 || afterLen === 0) continue;
      // 最小長制約: 短すぎる分割はスキップ
      if (beforeLen < SPACE_MIN_LEN || afterLen < SPACE_MIN_LEN) continue;
      const dist = Math.abs(sp - center);
      if (dist < bestSpaceDist) {
        bestSpace = sp;
        bestSpaceDist = dist;
      }
    }

    if (bestSpace > 0) {
      const beforeText = telop.text.slice(0, bestSpace).trim();
      const afterText = telop.text.slice(bestSpace).trim();
      const totalLen = telop.text.length;
      const totalDur = telop.endSec - telop.startSec;
      const splitSec = telop.startSec + totalDur * (bestSpace / totalLen);

      console.log(`     ✂️  Space split: "${telop.text}" → "${beforeText}" + "${afterText}"`);

      const beforeTelop = { text: beforeText, startSec: telop.startSec, endSec: splitSec, emphasis: [] as TelopEmphasis[] };
      const afterTelop = { text: afterText, startSec: splitSec, endSec: telop.endSec, emphasis: [] as TelopEmphasis[] };

      return [
        ...autoSplit12chars(beforeTelop, properNouns, tokenizer, maxChars),
        ...autoSplit12chars(afterTelop, properNouns, tokenizer, maxChars),
      ];
    }
  }

  // 1. 形態素解析
  const tokens: KuromojiToken[] = tokenizer.tokenize(telop.text);
  if (TRACE) {
    console.error('kuromoji tokens:');
    let tp = 0;
    for (const t of tokens) { console.error(`  pos=${tp} "${t.surface_form}" ${t.pos}/${t.pos_detail_1}`); tp += t.surface_form.length; }
  }

  // 2. 文節境界の候補リスト作成
  const candidates: number[] = [];
  let pos = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) {
      const isBoundary = isJiritsugo(tokens[i]) && !isPrevAdverbModifying(tokens, i);
      const isAfterParticle = isPostParticle(tokens, i);
      // 非自立名詞（みたい/こと/もの等）の先頭も候補（isInvalidSplitPos でフィルタ）
      const isNonIndependentNoun = tokens[i].pos === '名詞' && tokens[i].pos_detail_1 === '非自立';

      if (isBoundary || isAfterParticle || isNonIndependentNoun) {
        const prev = tokens[i - 1];
        const isPrevVerbChain = prev && (
          (prev.pos === '動詞' && (prev.pos_detail_1 === '接尾' || prev.pos_detail_1 === '非自立')) ||
          prev.pos === '助動詞' ||
          (prev.pos === '助詞' && prev.pos_detail_1 === '接続助詞' && prev.surface_form === 'て')
        );
        if (!isPrevVerbChain) {
          if (!candidates.includes(pos)) candidates.push(pos);
          if (TRACE) console.error(`  candidate pos=${pos} (token="${tokens[i].surface_form}" jiritsu=${isBoundary} afterP=${isAfterParticle} nonIndep=${isNonIndependentNoun})`);
        } else {
          if (TRACE) console.error(`  SKIP pos=${pos} (prev="${prev.surface_form}" is verb chain)`);
        }
      }
    }
    pos += tokens[i].surface_form.length;
  }

  // 3. proper-noun 内部を除外
  const properNounRanges = findProperNounRanges(telop.text, properNouns);
  const validCandidates = candidates.filter(p =>
    !properNounRanges.some(r => p > r.start && p < r.end)
  );
  if (TRACE) console.error(`validCandidates: [${validCandidates.join(',')}]`);

  // 4. 12字以内で前後バランスの良い位置を選ぶ
  // proper-noun の終端位置を分割候補として追加（優先）
  const properEndPositions = new Set<number>(properNounRanges.map(r => r.end));

  const center = Math.floor(telop.text.length / 2);
  let bestSplit = -1;
  let bestDistance = Infinity;
  for (const p of validCandidates) {
    if (p <= maxChars && (telop.text.length - p) <= maxChars) {
      const firstText = telop.text.slice(0, p);
      const secondText = telop.text.slice(p);
      if (firstText.endsWith(' ') || secondText.startsWith(' ')) continue;

      // C/D群: 不自然な分割位置を除外（kuromoji 候補にも適用）
      if (isInvalidSplitPos(telop.text, p, properNouns)) {
        if (TRACE) console.error(`  pos=${p} BLOCKED by isInvalidSplitPos`);
        continue;
      }

      // proper-noun 終端ボーナス: 一致すれば距離を半分にして優先
      const isProperEnd = properEndPositions.has(p);
      let effectiveDistance = isProperEnd ? Math.abs(p - center) * 0.5 : Math.abs(p - center);

      // バランスペナルティ: 両端が短い分割にペナルティ（強制ブロックではない）
      if (!isProperEnd && (p < 4 || (telop.text.length - p) < 4)) {
        effectiveDistance += 100;
      }

      if (effectiveDistance < bestDistance) {
        bestSplit = p;
        bestDistance = effectiveDistance;
      }
    }
  }

  // proper-noun 終端が validCandidates に含まれていなくても、12字以内かつ分割可能なら追加検討
  for (const properEnd of properEndPositions) {
    if (properEnd <= maxChars && (telop.text.length - properEnd) <= maxChars) {
      const firstText = telop.text.slice(0, properEnd);
      const secondText = telop.text.slice(properEnd);
      if (firstText.endsWith(' ') || secondText.startsWith(' ')) continue;
      if (isInvalidSplitPos(telop.text, properEnd, properNouns)) continue;

      const effectiveDistance = Math.abs(properEnd - center) * 0.5;
      if (effectiveDistance < bestDistance) {
        bestSplit = properEnd;
        bestDistance = effectiveDistance;
      }
    }
  }

  // 4.5. 全候補が isInvalidSplitPos でブロックされた場合、LINE_START_PROHIBITED のみ緩和リトライ
  if (bestSplit < 0 && validCandidates.length > 0) {
    if (TRACE) console.error('  all candidates blocked, retrying with LINE_START relaxed');
    for (const p of validCandidates) {
      if (p <= maxChars && (telop.text.length - p) <= maxChars) {
        const after = telop.text.slice(p);
        const beforeText = telop.text.slice(0, p);

        // DO_NOT_SPLIT_BETWEEN チェック維持
        let blockedBySplitBetween = false;
        for (const rule of DO_NOT_SPLIT_BETWEEN) {
          const bs = telop.text.slice(Math.max(0, p - rule.before.length), p);
          if (bs === rule.before && after.startsWith(rule.afterStartsWith)) {
            blockedBySplitBetween = true;
            break;
          }
        }
        if (blockedBySplitBetween) {
          if (TRACE) console.error(`  pos=${p} BLOCKED by DO_NOT_SPLIT_BETWEEN in relaxed`);
          continue;
        }

        // DO_NOT_START_WITH チェック維持（LINE_START_PROHIBITED 以外）
        let blockedByStartWith = false;
        for (const prefix of DO_NOT_START_WITH) {
          if (after.startsWith(prefix)) {
            blockedByStartWith = true;
            break;
          }
        }

        let effectiveDistance = Math.abs(p - center);
        if (p < 4 || (telop.text.length - p) < 4) effectiveDistance += 100;
        // DO_NOT_START_WITH 違反はペナルティ（ブロックではない）
        if (blockedByStartWith) effectiveDistance += 50;
        if (effectiveDistance < bestDistance) {
          bestSplit = p;
          bestDistance = effectiveDistance;
          if (TRACE) console.error(`  relaxed pos=${p} dist=${effectiveDistance}${blockedByStartWith ? ' (startWith penalty)' : ''}`);
        }
      }
    }
  }

  if (TRACE) console.error(`after kuromoji+proper: bestSplit=${bestSplit}`);

  // 5. 文節境界候補なし → 助詞境界フォールバック
  if (bestSplit < 0) {
    if (TRACE) console.error('entering fallback: particle boundary');
    const splitChars = ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'や', 'へ'];
    for (let i = 1; i < telop.text.length - 1; i++) {
      if (splitChars.includes(telop.text[i])) {
        const splitPos = i + 1;
        const insideProperNoun = properNounRanges.some(r => splitPos > r.start && splitPos < r.end);
        if (insideProperNoun) continue;
        if (isInvalidSplitPos(telop.text, splitPos, properNouns)) continue;

        if (splitPos <= maxChars && (telop.text.length - splitPos) <= maxChars) {
          const firstText = telop.text.slice(0, splitPos);
          const secondText = telop.text.slice(splitPos);
          if (firstText.endsWith(' ') || secondText.startsWith(' ')) continue;
          let distance = Math.abs(splitPos - center);

          // バランスペナルティ
          if (splitPos < 4 || (telop.text.length - splitPos) < 4) {
            distance += 100;
          }

          if (distance < bestDistance) {
            bestSplit = splitPos;
            bestDistance = distance;
          }
        }
      }
    }
  }

  if (TRACE) console.error(`after particle fallback: bestSplit=${bestSplit}`);

  // 6. それでもダメなら強制分割
  if (bestSplit < 0) {
    if (TRACE) console.error('entering FORCE split');
    bestSplit = Math.min(maxChars, Math.ceil(telop.text.length / 2));
    for (const range of properNounRanges) {
      if (bestSplit > range.start && bestSplit <= range.end) {
        if (range.start > 0 && range.start <= maxChars) {
          bestSplit = range.start;
        } else if (range.end <= maxChars) {
          bestSplit = range.end;
        }
        break;
      }
    }
    let attempts = 0;
    while ((isInvalidSplitPos(telop.text, bestSplit, properNouns) ||
            bestSplit < 4 || (telop.text.length - bestSplit) < 4) && attempts < 10) {
      if (bestSplit > 2) bestSplit--;
      else if (bestSplit + 1 < telop.text.length) bestSplit++;
      else break;
      attempts++;
    }
  }

  if (TRACE) console.error(`FINAL bestSplit=${bestSplit} → "${telop.text.slice(0, bestSplit)}" + "${telop.text.slice(bestSplit)}"`);

  const firstText = telop.text.slice(0, bestSplit);
  const secondText = telop.text.slice(bestSplit);
  const totalDuration = telop.endSec - telop.startSec;
  const splitTime = telop.startSec + totalDuration * (firstText.length / telop.text.length);

  const firstEmphasis = (telop.emphasis ?? [])
    .filter(e => e.start < bestSplit)
    .map(e => ({ ...e, end: Math.min(e.end, bestSplit) }));
  const secondEmphasis = (telop.emphasis ?? [])
    .filter(e => e.end > bestSplit)
    .map(e => ({ ...e, start: Math.max(0, e.start - bestSplit), end: e.end - bestSplit }));

  console.log(`     ✂️  Split "${telop.text}" → "${firstText}" + "${secondText}"`);

  const firstTelopResult = autoSplit12chars(
    { text: firstText, startSec: telop.startSec, endSec: splitTime, emphasis: firstEmphasis },
    properNouns,
    tokenizer,
    maxChars,
  );
  const secondTelopResult = autoSplit12chars(
    { text: secondText, startSec: splitTime, endSec: telop.endSec, emphasis: secondEmphasis },
    properNouns,
    tokenizer,
    maxChars,
  );

  return [...firstTelopResult, ...secondTelopResult];
}

function mergeShortTelops(
  telops: RefinedTelop[],
  properNouns: string[],
  tokenizer: any,
  minChars: number = 4
): RefinedTelop[] {
  // 単純な1パス: 短いテロップを前と統合（12字以内なら）
  let merged = [...telops];
  let changed = true;
  let pass = 0;

  while (changed && pass < 3) {
    changed = false;
    pass++;
    const result: RefinedTelop[] = [];

    for (let i = 0; i < merged.length; i++) {
      const cur = merged[i];
      if (!cur || !cur.text) continue;

      const isProperNoun = properNouns.some(p => cur.text === p);

      if (cur.text.length >= minChars || isProperNoun) {
        result.push(cur);
        continue;
      }

      // 3字以下: 前と統合
      if (result.length > 0) {
        const prev = result[result.length - 1];
        const mergedText = prev.text + cur.text;
        if (mergedText.length <= TELOP_MAX_CHARS) {
          result[result.length - 1] = {
            text: mergedText,
            startSec: prev.startSec,
            endSec: cur.endSec,
            emphasis: prev.emphasis || [],
          };
          if (pass === 1) console.log(`     🔀 Merge short "${cur.text}" → "${mergedText}"`);
          changed = true;
          continue;
        }
      }

      // 前と統合できない: 次と統合
      if (i + 1 < merged.length) {
        const next = merged[i + 1];
        if (!next || !next.text) { result.push(cur); continue; }
        const mergedText = cur.text + next.text;
        if (mergedText.length <= TELOP_MAX_CHARS) {
          result.push({
            text: mergedText,
            startSec: cur.startSec,
            endSec: next.endSec,
            emphasis: cur.emphasis || [],
          });
          if (pass === 1) console.log(`     🔀 Merge short fwd "${cur.text}" → "${mergedText}"`);
          i++;
          changed = true;
          continue;
        }
      }

      // 統合不可: そのまま
      result.push(cur);
    }

    merged = result;
  }

  return merged;
}

// === GPT 呼び出し（emphasis 抽出のみ）===

type EmphasisGptResponse = {
  telops: Array<{
    idx: number;
    emphasis: Array<{ start: number; end: number; label: string }>;
  }>;
};

function buildEmphasisPrompt(telops: RefinedTelop[]): string {
  const telopList = telops.map((t, i) => `[${i + 1}] ${t.text}`).join('\n');
  return `以下のテロップ群から、各テロップ内の強調語を抽出してください。

【テロップ群】
${telopList}

【強調対象】
- 数値: 「10年」「3割」「2026年」「365日」「24時間」
- 固有名詞: 「AI」「Netflix」「PHR」「Longevity」「Wellness」「Google」
- 感嘆・転換: 「実は」「絶対」「本当に」「もう遅い」
- 核キーワード: 「予防医療」「パーソナルドクター」「検査」

【強調しない】
- 助詞・助動詞（「を」「が」「です」）
- ありふれた動詞（「思う」「考える」「言う」）

【ルール】
- 各テロップで 0〜3個の強調語
- label には実際にテロップ内に存在する文字列のみ
- start/end は文字位置（0始まり、排他）
- 強調語ないテロップは emphasis: [] を返す

【出力形式】JSON only、説明文不要
{
  "telops": [
    { "idx": 1, "emphasis": [{"start": 0, "end": 7, "label": "戦略的予防医療"}] },
    { "idx": 2, "emphasis": [] },
    ...
  ]
}

【厳守】
- 全テロップを返す（idx 1 から ${telops.length} まで）
- label はテロップ内に必ず存在する文字列
- 「強調語」のようなジェネリック値は禁止`;
}

function correctEmphasisPositions(telops: RefinedTelop[]): RefinedTelop[] {
  return telops.map(t => ({
    ...t,
    emphasis: (t.emphasis ?? []).map(e => {
      if (!e.label) return e;
      const idx = t.text.indexOf(e.label);
      if (idx < 0) return e;
      return { start: idx, end: idx + e.label.length, label: e.label };
    }),
  }));
}

function calcEmphasisImportance(label: string): number {
  let score = 0;
  if (/\d+(年|割|分|秒|時間|日|回|個|人)/.test(label)) score += 10;
  if (/^\d+$/.test(label)) score += 8;
  if (/[A-Za-z]/.test(label)) score += 8;
  if (/^(実は|絶対|本当|もう遅い|まさに|決して|必ず)/.test(label)) score += 7;
  if (/(予防医療|パーソナルドクター|Wellness|検査|治療|医療)/.test(label)) score += 6;
  if (label.length >= 3 && label.length <= 8) score += 3;
  score += 2;
  return score;
}

function limitEmphasisByImportance(telops: RefinedTelop[]): void {
  const allEmphasis: Array<{ telopIdx: number; emphasisIdx: number; importance: number; label: string }> = [];
  telops.forEach((t, ti) => {
    (t.emphasis ?? []).forEach((e, ei) => {
      allEmphasis.push({
        telopIdx: ti,
        emphasisIdx: ei,
        importance: calcEmphasisImportance(e.label || ''),
        label: e.label || '',
      });
    });
  });

  if (allEmphasis.length > EMPHASIS_MAX) {
    console.log(`   ⚠️  Emphasis ${allEmphasis.length} > max ${EMPHASIS_MAX}, keeping top ${EMPHASIS_MAX}`);
    allEmphasis.sort((a, b) => b.importance - a.importance);
    const kept = allEmphasis.slice(0, EMPHASIS_MAX);
    const keepSet = new Set(kept.map(x => `${x.telopIdx}:${x.emphasisIdx}`));
    telops.forEach((t, ti) => {
      t.emphasis = (t.emphasis ?? []).filter((_, ei) => keepSet.has(`${ti}:${ei}`));
    });
  }
}

// === メイン処理 ===

type ScoringCandidate = {
  rank: number;
  shortId: string;
  topicId: string;
  label: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  title: string;
  reason: string;
};

type ScoringJson = {
  suggestedAutoSelection: ScoringCandidate[];
  allCandidatesRanked: ScoringCandidate[];
};

async function processOneCandidate(
  candidate: ScoringCandidate,
  allTelops: XlsxTelop[],
  dictionary: Record<string, string>,
  properNouns: string[],
  tokenizer: any,
  editPatterns: EditPattern[],
  cache: import('./lib/step2-types.js').EmphasisCache,
  config: any,
  isDryRun: boolean,
): Promise<{ result: DetailedCandidate | null; cacheHit: boolean }> {
  // 1. 候補区間の xlsx テロップを取得
  const rawTelops = allTelops.filter(t =>
    t.startSec >= candidate.startSec && t.endSec <= candidate.endSec,
  );
  if (rawTelops.length === 0) {
    console.warn(`⚠️   ${candidate.shortId}: no telops found in range`);
    return { result: null, cacheHit: false };
  }

  console.log(`📝 ${candidate.shortId} (${candidate.topicId}: ${candidate.label}): ${rawTelops.length} raw telops`);

  // 2. テロップ処理（コードのみ）
  let processed: RefinedTelop[] = rawTelops.map(t => {
    let text = t.text;
    text = removeFillers(text);
    text = removePunctuation(text);
    text = applyDictionary(text, dictionary);
    text = text.trim();  // 先頭末尾の余分なスペース除去
    return { text, startSec: t.startSec, endSec: t.endSec, emphasis: [] };
  }).filter(t => t.text.length > 0);

  // 3. 12字分割 + 分割後の trim
  const splitTelops: RefinedTelop[] = [];
  for (const t of processed) {
    const splits = autoSplit12chars(t, properNouns, tokenizer);
    for (const s of splits) {
      s.text = s.text.trim();
      if (s.text.length > 0) splitTelops.push(s);
    }
  }

  // 3.5. テロップ内の半角スペース除去（proper-noun 内のスペースは保護）
  for (const s of splitTelops) {
    let txt = s.text;
    const placeholders: Array<[string, string]> = [];
    const properRanges = findProperNounRanges(txt, properNouns);
    for (let i = properRanges.length - 1; i >= 0; i--) {
      const r = properRanges[i];
      const ph = '\x00PN' + i + '\x00';
      placeholders.push([ph, txt.slice(r.start, r.end)]);
      txt = txt.slice(0, r.start) + ph + txt.slice(r.end);
    }
    txt = txt.replace(/ +/g, '');
    for (const [ph, original] of placeholders) {
      txt = txt.replace(ph, original);
    }
    s.text = txt;
  }

  // 3.6. 隣接テロップ統合（xlsx 行をまたぐ分断の修正）
  let mergedCount = 0;
  const MAX_MERGE_OPS = 50;  // 安全弁: 無限ループ防止
  for (let i = 0; i < splitTelops.length - 1 && mergedCount < MAX_MERGE_OPS; i++) {
    const cur = splitTelops[i];
    const next = splitTelops[i + 1];

    let shouldMerge = false;
    let matchedRule = '';

    // DO_NOT_SPLIT_BETWEEN のルールチェック
    for (const rule of DO_NOT_SPLIT_BETWEEN) {
      if (cur.text.endsWith(rule.before) && next.text.startsWith(rule.afterStartsWith)) {
        shouldMerge = true;
        matchedRule = rule.before + '|' + rule.afterStartsWith;
        break;
      }
    }

    // DO_NOT_START_WITH のルールチェック（次のテロップが禁止語そのもの）
    if (!shouldMerge) {
      for (const word of DO_NOT_START_WITH) {
        if (next.text === word) {
          shouldMerge = true;
          matchedRule = 'start_with:' + word;
          break;
        }
      }
    }

    if (shouldMerge) {
      const mergedText = cur.text + next.text;
      if (mergedText.length <= TELOP_MAX_CHARS) {
        // 12字以内なら単純統合
        const merged: RefinedTelop = {
          text: mergedText,
          startSec: cur.startSec,
          endSec: next.endSec,
          emphasis: [...(cur.emphasis || []), ...(next.emphasis || [])],
        };
        console.log(`     🔗 Merge "${cur.text}" + "${next.text}" → "${merged.text}" (rule: ${matchedRule})`);
        splitTelops[i] = merged;
        splitTelops.splice(i + 1, 1);
        i--;
        mergedCount++;
      } else {
        // 12字超過 → 統合して再分割（「はず」等が正しい位置で分割される）
        const tempTelop: RefinedTelop = {
          text: mergedText,
          startSec: cur.startSec,
          endSec: next.endSec,
          emphasis: [],
        };
        const reSplit = autoSplit12chars(tempTelop, properNouns, tokenizer);
        if (reSplit.length >= 2) {
          console.log(`     🔗 Merge+resplit "${cur.text}" + "${next.text}" → ${reSplit.map(s => '"' + s.text + '"').join(' + ')} (rule: ${matchedRule})`);
          splitTelops.splice(i, 2, ...reSplit);
          i--;
          mergedCount++;
        }
      }
    }
  }
  if (mergedCount > 0) {
    console.log(`     🔗 Total merged: ${mergedCount}`);
  }

  // 3.7. 短いテロップ統合（3字以下を前後と merge）
  const mergedShort = mergeShortTelops(splitTelops, properNouns, tokenizer);

  // 3.8. edit-patterns.json の自動適用
  const patternedTelops = applyEditPatterns(candidate.shortId, mergedShort, editPatterns);

  console.log(`   After split: ${patternedTelops.length} telops`);

  if (isDryRun) {
    console.log(`   [DRY-RUN] Skipping GPT emphasis extraction`);
    return { result: {
      shortId: candidate.shortId,
      topicId: candidate.topicId,
      label: candidate.label,
      startSec: candidate.startSec,
      endSec: candidate.endSec,
      durationSec: candidate.durationSec,
      score: candidate.score,
      title: candidate.title,
      reason: candidate.reason,
      hookFirstTelop: { text: '', sourceIdx: 0 },
      telops: patternedTelops,
      totalEmphasis: 0,
    }, cacheHit: false };
  }

  // 4. emphasis 抽出（キャッシュ or GPT）
  const telopTexts = patternedTelops.map(t => t.text);
  const cached = findEntry(cache, candidate.shortId, telopTexts);
  let cacheHit = false;

  if (cached) {
    // キャッシュヒット: emphasis を復元
    for (let i = 0; i < patternedTelops.length && i < cached.emphasisData.length; i++) {
      patternedTelops[i].emphasis = cached.emphasisData[i] || [];
    }
    cacheHit = true;
    console.log(`   💾 Cache hit`);
  } else {
    // GPT 呼び出し
    const prompt = buildEmphasisPrompt(patternedTelops);
    try {
      const raw = await callGptJson<EmphasisGptResponse>(
        prompt,
        config.gpt.model,
        config.gpt.maxTokensPerCall,
        config.gpt.temperature,
      );

      for (const r of raw.telops || []) {
        const idx = r.idx - 1;
        if (idx >= 0 && idx < patternedTelops.length) {
          patternedTelops[idx].emphasis = r.emphasis || [];
        }
      }
    } catch (e) {
      console.warn(`   ⚠️ GPT emphasis extraction failed, continuing without emphasis: ${e}`);
    }

    // キャッシュ保存
    const emphasisData = patternedTelops.map(t => t.emphasis || []);
    addEntry(cache, candidate.shortId, telopTexts, emphasisData);
    console.log(`   🌐 GPT called, cached`);
  }

  // 5. emphasis 位置補正
  const correctedTelops = correctEmphasisPositions(patternedTelops);

  // 6. 重要度順制限
  limitEmphasisByImportance(correctedTelops);

  const totalEmphasis = correctedTelops.reduce((sum, t) => sum + (t.emphasis?.length ?? 0), 0);
  console.log(`   ✅ Final: ${correctedTelops.length} telops, ${totalEmphasis} emphasis`);

  return { result: {
    shortId: candidate.shortId,
    topicId: candidate.topicId,
    label: candidate.label,
    startSec: candidate.startSec,
    endSec: candidate.endSec,
    durationSec: candidate.durationSec,
    score: candidate.score,
    title: candidate.title,
    reason: candidate.reason,
    hookFirstTelop: { text: '', sourceIdx: 0 },
    telops: correctedTelops,
    totalEmphasis,
  }, cacheHit };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  const configPath = path.resolve('project.json');
  if (!fs.existsSync(configPath)) {
    console.error(`project.json not found at ${configPath}`);
    process.exit(1);
  }
  const config = loadConfig(configPath);
  console.log(`✅ project.json loaded: ${config.projectName}`);

  const scoringPath = path.resolve(config.workDir, 'scoring.json');
  if (!fs.existsSync(scoringPath)) {
    console.error(`scoring.json not found: ${scoringPath}`);
    process.exit(1);
  }
  const scoring: ScoringJson = JSON.parse(fs.readFileSync(scoringPath, 'utf-8'));
  const allCandidates = scoring.suggestedAutoSelection ?? scoring.allCandidatesRanked;
  console.log(`✅ scoring.json loaded: ${allCandidates.length} candidates`);

  console.log(`📂 Loading xlsx: ${XLSX_PATH}`);
  const allTelops = loadXlsxTelops(XLSX_PATH);
  console.log(`✅ xlsx loaded: ${allTelops.length} telops`);

  console.log('📂 Initializing kuromoji tokenizer...');
  const tokenizer = await buildTokenizer();
  console.log('✅ kuromoji tokenizer ready');

  const dictionary = loadDictionary(DICTIONARY_PATH);
  const properNouns = loadProperNouns(PROPER_NOUNS_PATH);
  console.log(`✅ dictionary loaded: ${Object.keys(dictionary).length} entries`);
  console.log(`✅ proper nouns loaded: ${properNouns.length} entries`);

  console.log('📂 Loading edit patterns...');
  const editPatterns = loadEditPatterns(EDIT_PATTERNS_PATH);
  console.log(`✅ edit patterns loaded: ${editPatterns.length} entries`);

  const NO_CACHE = process.argv.includes('--no-cache');
  const REBUILD_CACHE = process.argv.includes('--rebuild-cache');
  const EMPHASIS_CACHE_PATH = path.join(process.cwd(), 'data', 'work', 'emphasis-cache.json');
  const cache = (NO_CACHE || REBUILD_CACHE)
    ? { version: '1.0', createdAt: new Date().toISOString(), lastUpdated: '', entries: [] as any[] }
    : loadCache(EMPHASIS_CACHE_PATH);
  console.log(`✅ emphasis cache loaded: ${cache.entries.length} entries${NO_CACHE ? ' (disabled)' : ''}`);

  let totalCacheHits = 0;
  let totalGptCalls = 0;

  const result: CandidatesJson = {
    generatedAt: new Date().toISOString(),
    projectName: config.projectName,
    scoringJsonPath: scoringPath,
    totalCandidates: 0,
    candidates: [],
    errors: [],
  };

  for (const candidate of allCandidates) {
    try {
      const { result: detailed, cacheHit } = await processOneCandidate(
        candidate,
        allTelops,
        dictionary,
        properNouns,
        tokenizer,
        editPatterns,
        cache,
        config,
        isDryRun,
      );
      if (detailed) {
        result.candidates.push(detailed);
        result.totalCandidates += 1;
      }
      if (cacheHit) totalCacheHits++;
      else if (!isDryRun) totalGptCalls++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ ${candidate.shortId}: ${msg}`);
      result.errors.push({ shortId: candidate.shortId, message: msg });
    }
  }

  const outPath = path.resolve(config.workDir, 'candidates.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n📝 candidates.json saved: ${outPath}`);

  // キャッシュ保存
  if (!NO_CACHE && !isDryRun) {
    saveCache(EMPHASIS_CACHE_PATH, cache);
    console.log(`💾 emphasis cache saved: ${cache.entries.length} entries`);
  }
  console.log(`💾 Emphasis cache: ${totalCacheHits} hits / ${totalGptCalls} GPT calls`);

  // 品質サマリ
  let totalTelops = 0;
  let totalOver12 = 0;
  let totalPunct = 0;
  let totalEmph = 0;
  let totalLeadingSpace = 0;
  for (const c of result.candidates) {
    for (const t of c.telops) {
      totalTelops++;
      if (t.text.length > TELOP_MAX_CHARS) totalOver12++;
      if (/[、。]/.test(t.text)) totalPunct++;
      if (t.text.startsWith(' ') || t.text.endsWith(' ')) totalLeadingSpace++;
    }
    totalEmph += c.totalEmphasis;
  }
  console.log(`\n=== Summary ===`);
  console.log(`Candidates: ${result.totalCandidates}, Errors: ${result.errors.length}`);
  console.log(`Total telops: ${totalTelops}`);
  console.log(`12char over: ${totalOver12}`);
  console.log(`Punctuation: ${totalPunct}`);
  console.log(`Leading/trailing space: ${totalLeadingSpace}`);
  console.log(`Total emphasis: ${totalEmph} (avg ${result.totalCandidates > 0 ? (totalEmph / result.totalCandidates).toFixed(1) : 0}/short)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

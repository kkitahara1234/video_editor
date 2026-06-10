#!/usr/bin/env node
/**
 * analyze-step1.ts
 *
 * 目的:
 *   xlsx のテロップ群と topics.json から、トピックごとに
 *   GPT(gpt-4o-mini) で盛り上がり区間を粗評価する。
 *
 * 入出力:
 *   入力: project.json, script_check.xlsx, public/../work/topics.json
 *   出力: data/work/scoring.json
 *
 * 使い方:
 *   pnpm tsx scripts/analyze-step1.ts              # 全12トピック実行
 *   pnpm tsx scripts/analyze-step1.ts --dry-run    # GPT呼ばず構造確認のみ
 *   pnpm tsx scripts/analyze-step1.ts --only topic1 # 1トピックのみ実行
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './lib/loadConfig.js';
import { loadXlsxTelops, XlsxTelop } from './lib/xlsx-loader.js';
import { filterActiveTopics, Topic } from './lib/topic-filter.js';
import { callGptJson } from './lib/gpt-client.js';

const MAX_CANDIDATES_PER_TOPIC = 2;

type Candidate = {
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  title: string;
  reason: string;
};

type TopicScoring = {
  topicId: string;
  label: string;
  topicStartSec: number;
  topicEndSec: number;
  candidates: Candidate[];
};

type ScoringJson = {
  generatedAt: string;
  projectName: string;
  videoMinutes: number;
  shortsCountRange: { min: number; max: number };
  scoreThreshold: number;
  topicsAnalyzed: number;
  topicsSkipped: string[];
  totalCandidates: number;
  scorings: TopicScoring[];
  errors: Array<{ topicId: string; message: string }>;
};

function buildPrompt(
  videoMinutes: number,
  durationMinSec: number,
  durationMaxSec: number,
  scoreThreshold: number,
  topic: Topic,
  telops: XlsxTelop[]
): string {
  const telopList = telops
    .map((t, i) => `[${i + 1}] ${t.startSec.toFixed(1)}-${t.endSec.toFixed(1)}s: 「${t.text}」`)
    .join('\n');

  return `あなたはYouTube/TikTokショート動画の編集者です。
${videoMinutes.toFixed(1)}分の動画から縦型ショート（${durationMinSec}〜${durationMaxSec}秒）を切り出します。

以下は「${topic.label}」トピック（${topic.startSec}-${topic.endSec}秒）のテロップ群です。
この中から${durationMinSec}〜${durationMaxSec}秒の連続した区間を最大${MAX_CANDIDATES_PER_TOPIC}個抽出してください。

⚠️ 最重要: duration（endSec - startSec）が必ず ${durationMinSec} 秒以上 ${durationMaxSec} 秒以下である区間を探してください。
   - 1〜2文の短い「ハイライト瞬間」ではなく、${durationMinSec}秒以上の連続した話題のまとまりを抽出
   - その「盛り上がりポイント」の前後（導入文と結論文）を必ず含めて${durationMinSec}秒以上にする
   - 60秒未満になる場合は、より広い範囲で別の60秒以上の区間を探す
   - もし60秒以上の区間が見つからない場合は candidates を空配列にする（短い区間で代用しない）

【テロップ群】
${telopList}

【選定基準】
高スコア:
  - 数値・固有名詞・断定が含まれる
  - 質問→回答の完結性がある（導入から結論までで${durationMinSec}-${durationMaxSec}秒）
  - 感情の動き(驚き・笑い・気づき)がある
  - 結論先出しできる導入がある（冒頭3秒で視聴者を掴める）

低スコア:
  - 専門用語連発で一般視聴者が置いていかれる
  - 言い淀み・トピック転換の途中
  - 結論なく延々と話す
  - 文脈なしには理解できない

【制約 - 厳守】
- 区間長: ${durationMinSec}〜${durationMaxSec}秒（必ずこの範囲内）
- 区間は ${topic.startSec}〜${topic.endSec}秒の範囲内
- 1トピックから最大${MAX_CANDIDATES_PER_TOPIC}区間、ただし時間重複は不可
- スコアは 0〜10（10が最高）
- スコア${scoreThreshold}未満なら候補に入れない
- ${durationMinSec}秒未満または${durationMaxSec}秒超の区間は絶対に返さない

【出力形式】JSON only、説明文・コードブロック不要
{
  "candidates": [
    {
      "startSec": 切り抜き開始秒（${topic.startSec}〜${topic.endSec - durationMinSec}の範囲、テロップ境界）,
      "endSec": 切り抜き終了秒（startSec + ${durationMinSec}〜${durationMaxSec}秒、テロップ境界）,
      "score": 0-10の数値,
      "title": "視聴者向けキャッチコピー（12字以内、句読点なし）",
      "reason": "選定理由（50字以内）"
    }
  ]
}

【良い例 vs 悪い例】
✅ 良い: startSec: 175.3, endSec: 290.5 (duration 115.2s)
❌ 悪い: startSec: 291.8, endSec: 304.0 (duration 12.2s 短すぎる)
❌ 悪い: startSec: 354.3, endSec: 356.7 (duration 2.4s かつトピック範囲外)`;
}

function validateCandidates(
  raw: { candidates: Array<Partial<Candidate>> },
  topic: Topic,
  scoreThreshold: number,
  durationMinSec: number,
  durationMaxSec: number
): Candidate[] {
  const valid: Candidate[] = [];
  for (let i = 0; i < raw.candidates.length; i++) {
    const c = raw.candidates[i];
    const reasons: string[] = [];

    if (typeof c.startSec !== 'number') reasons.push(`startSec not number (${c.startSec})`);
    if (typeof c.endSec !== 'number') reasons.push(`endSec not number (${c.endSec})`);
    if (typeof c.score !== 'number') reasons.push(`score not number (${c.score})`);
    if (!c.title) reasons.push('title missing');
    if (!c.reason) reasons.push('reason missing');
    if (typeof c.score === 'number' && c.score < scoreThreshold) {
      reasons.push(`score ${c.score} < threshold ${scoreThreshold}`);
    }

    if (typeof c.startSec === 'number' && typeof c.endSec === 'number') {
      const duration = c.endSec - c.startSec;
      if (duration < durationMinSec) reasons.push(`duration ${duration.toFixed(1)}s < min ${durationMinSec}s`);
      if (duration > durationMaxSec) reasons.push(`duration ${duration.toFixed(1)}s > max ${durationMaxSec}s`);
      if (c.startSec < topic.startSec) reasons.push(`startSec ${c.startSec} < topic.startSec ${topic.startSec}`);
      if (c.endSec > topic.endSec) reasons.push(`endSec ${c.endSec} > topic.endSec ${topic.endSec}`);
    }

    if (reasons.length > 0) {
      console.log(`   ❌ Rejected [${i}]: ${reasons.join('; ')}`);
      continue;
    }

    console.log(`   ✅ Accepted [${i}]: score=${c.score}, ${c.startSec}-${c.endSec}s (${(c.endSec! - c.startSec!).toFixed(1)}s)`);
    valid.push({
      startSec: c.startSec as number,
      endSec: c.endSec as number,
      durationSec: (c.endSec as number) - (c.startSec as number),
      score: c.score as number,
      title: c.title!,
      reason: c.reason!,
    });
  }
  return valid.slice(0, MAX_CANDIDATES_PER_TOPIC);
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const onlyIdx = process.argv.indexOf('--only');
  const onlyTopicId = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

  const configPath = path.resolve('project.json');
  if (!fs.existsSync(configPath)) {
    console.error(`project.json not found at ${configPath}`);
    process.exit(1);
  }
  const config = loadConfig(configPath);
  console.log(`✅ project.json loaded: ${config.projectName}`);

  const topicsPath = path.resolve(config.sourceDir, '..', 'work', 'topics.json');
  if (!fs.existsSync(topicsPath)) {
    console.error(`topics.json not found: ${topicsPath}`);
    process.exit(1);
  }
  const allTopics: Topic[] = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
  const activeTopics = filterActiveTopics(allTopics);
  console.log(`✅ topics.json loaded: ${allTopics.length} total, ${activeTopics.length} active`);

  const lastTopic = allTopics[allTopics.length - 1];
  const videoSec = lastTopic.endSec;
  const videoMinutes = videoSec / 60;
  console.log(`📊 Video length: ${videoMinutes.toFixed(1)} minutes`);

  const ratio = videoMinutes / config.shortsCount.perMinutes;
  const minShorts = Math.round(ratio * config.shortsCount.minPer);
  const maxShorts = Math.round(ratio * config.shortsCount.maxPer);
  console.log(`📊 Shorts count range: ${minShorts}〜${maxShorts} (ratio=${ratio.toFixed(2)})`);

  console.log(`📂 Loading xlsx: ${config.xlsxPath}`);
  const allTelops = loadXlsxTelops(config.xlsxPath);
  console.log(`✅ xlsx loaded: ${allTelops.length} telops`);

  let targetTopics = activeTopics;
  if (onlyTopicId) {
    targetTopics = activeTopics.filter(t => t.id === onlyTopicId);
    if (targetTopics.length === 0) {
      console.error(`--only ${onlyTopicId} not found in active topics`);
      process.exit(1);
    }
    console.log(`🎯 --only mode: ${onlyTopicId}`);
  }

  const scoringResult: ScoringJson = {
    generatedAt: new Date().toISOString(),
    projectName: config.projectName,
    videoMinutes: Number(videoMinutes.toFixed(2)),
    shortsCountRange: { min: minShorts, max: maxShorts },
    scoreThreshold: config.scoreThreshold,
    topicsAnalyzed: 0,
    topicsSkipped: allTopics.filter(t => !activeTopics.includes(t)).map(t => t.id),
    totalCandidates: 0,
    scorings: [],
    errors: [],
  };

  if (isDryRun) {
    console.log('\n=== DRY-RUN MODE ===');
    for (const topic of targetTopics) {
      const telops = allTelops.filter(t => t.topic === topic.label);
      const prompt = buildPrompt(
        videoMinutes,
        config.duration.min,
        config.duration.max,
        config.scoreThreshold,
        topic,
        telops
      );
      console.log(`\n--- Topic: ${topic.id} (${topic.label}) ---`);
      console.log(`  Telops in topic: ${telops.length}`);
      console.log(`  Prompt length: ${prompt.length} chars`);
      console.log(`  Prompt preview (first 300 chars):`);
      console.log(`  ${prompt.substring(0, 300)}...`);
    }
    console.log('\n=== DRY-RUN PASSED ===');
    process.exit(0);
  }

  console.log(`\n🚀 Calling GPT (${config.gpt.model}) for ${targetTopics.length} topics...\n`);

  for (const topic of targetTopics) {
    const telops = allTelops.filter(t => t.topic === topic.label);
    if (telops.length === 0) {
      console.warn(`⚠️  ${topic.id}: no telops found, skipping`);
      continue;
    }

    const prompt = buildPrompt(
      videoMinutes,
      config.duration.min,
      config.duration.max,
      config.scoreThreshold,
      topic,
      telops
    );

    try {
      console.log(`📞 ${topic.id} (${topic.label}): ${telops.length} telops → GPT...`);
      const raw = await callGptJson<{ candidates: Array<Partial<Candidate>> }>(
        prompt,
        config.gpt.model,
        config.gpt.maxTokensPerCall,
        config.gpt.temperature
      );

      console.log(`   GPT raw response:`, JSON.stringify(raw, null, 2));

      const candidates = validateCandidates(
        raw,
        topic,
        config.scoreThreshold,
        config.duration.min,
        config.duration.max
      );

      scoringResult.scorings.push({
        topicId: topic.id,
        label: topic.label,
        topicStartSec: topic.startSec,
        topicEndSec: topic.endSec,
        candidates,
      });
      scoringResult.topicsAnalyzed += 1;
      scoringResult.totalCandidates += candidates.length;

      console.log(`   → ${candidates.length} candidates accepted (raw: ${raw.candidates.length})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ ${topic.id}: ${msg}`);
      scoringResult.errors.push({ topicId: topic.id, message: msg });
    }
  }

  // --- 重複情報付与 ---

  type FlatCandidate = Candidate & {
    topicId: string;
    label: string;
    conflicts: Array<{
      withTopicId: string;
      withRange: string;
      withScore: number;
      withTitle: string;
      overlapSec: number;
      overlapRatio: number;
    }>;
  };

  function isOverlap(a: { startSec: number; endSec: number }, b: { startSec: number; endSec: number }): boolean {
    return a.startSec < b.endSec && b.startSec < a.endSec;
  }

  function calcOverlapSec(a: { startSec: number; endSec: number }, b: { startSec: number; endSec: number }): number {
    return Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec));
  }

  // 全候補をフラット化してスコア降順ソート
  const allFlat: FlatCandidate[] = [];
  for (const ts of scoringResult.scorings) {
    for (const c of ts.candidates) {
      allFlat.push({
        ...c,
        topicId: ts.topicId,
        label: ts.label,
        conflicts: [],
      });
    }
  }
  allFlat.sort((a, b) => b.score - a.score);

  // 各候補に conflicts 情報を付与（除外せず情報だけ）
  for (let i = 0; i < allFlat.length; i++) {
    const c = allFlat[i];
    for (let j = 0; j < allFlat.length; j++) {
      if (i === j) continue;
      const other = allFlat[j];
      if (isOverlap(c, other)) {
        const overlapSec = calcOverlapSec(c, other);
        const minDuration = Math.min(c.durationSec, other.durationSec);
        const overlapRatio = minDuration > 0 ? overlapSec / minDuration : 0;
        c.conflicts.push({
          withTopicId: other.topicId,
          withRange: `${other.startSec}-${other.endSec}s`,
          withScore: other.score,
          withTitle: other.title,
          overlapSec: Number(overlapSec.toFixed(1)),
          overlapRatio: Number(overlapRatio.toFixed(2)),
        });
      }
    }
  }

  // rank 付与
  const allCandidatesRanked = allFlat.map((c, i) => ({
    rank: i + 1,
    shortId: `short-${String(i + 1).padStart(3, '0')}`,
    ...c,
  }));

  // 参考: 自動採用提案（強重複>50%は下位棄却、それ以外は両方残す）
  const suggestedAutoSelection: typeof allCandidatesRanked = [];
  for (const c of allCandidatesRanked) {
    const strongConflict = c.conflicts.find(cf => {
      if (cf.overlapRatio > 0.5) {
        const conflictPartner = allCandidatesRanked.find(x =>
          x.topicId === cf.withTopicId &&
          `${x.startSec}-${x.endSec}s` === cf.withRange
        );
        return conflictPartner && conflictPartner.score >= c.score && conflictPartner.rank < c.rank;
      }
      return false;
    });
    if (!strongConflict) {
      suggestedAutoSelection.push(c);
      if (suggestedAutoSelection.length >= maxShorts) break;
    }
  }

  // scoringResult に追加
  (scoringResult as any).allCandidatesRanked = allCandidatesRanked;
  (scoringResult as any).suggestedAutoSelection = suggestedAutoSelection;

  // ログ出力
  console.log(`\n=== All Candidates (sorted by score) ===`);
  for (const c of allCandidatesRanked) {
    const conflictStr = c.conflicts.length > 0
      ? ` ⚠️ ${c.conflicts.length} conflicts (max overlapRatio: ${Math.max(...c.conflicts.map(x => x.overlapRatio)).toFixed(2)})`
      : '';
    console.log(`  [${c.rank}] ${c.topicId} ${c.startSec}-${c.endSec}s (${c.durationSec.toFixed(1)}s) score=${c.score} "${c.title}"${conflictStr}`);
  }

  console.log(`\n=== Suggested Auto Selection (max ${maxShorts}) ===`);
  for (const c of suggestedAutoSelection) {
    console.log(`  [${c.rank}] ${c.topicId} score=${c.score} "${c.title}"`);
  }
  console.log(`\nNote: All ${allCandidatesRanked.length} candidates saved. ${suggestedAutoSelection.length} suggested. Final selection requires human review.`);

  // --- scoring.json 書き出し ---

  const outPath = path.resolve(config.workDir, 'scoring.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(scoringResult, null, 2));
  console.log(`\n📝 scoring.json saved: ${outPath}`);
  console.log(`\n=== Summary ===`);
  console.log(`Topics analyzed: ${scoringResult.topicsAnalyzed}`);
  console.log(`Total candidates: ${scoringResult.totalCandidates}`);
  console.log(`Errors: ${scoringResult.errors.length}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

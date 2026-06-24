#!/usr/bin/env node
/**
 * ingest.ts
 *
 * 目的:
 *   candidates.json から script-{shortId}.json × N本を生成する。
 *   テロップは candidate.telops をそのまま使い、絶対時刻を相対秒に変換。
 *   cameraSwitches を計算（C-Hook3 冒頭強制切替含む）。
 *
 * 使い方:
 *   pnpm tsx scripts/ingest.ts              # 全候補実行
 *   pnpm tsx scripts/ingest.ts --only short-001  # 1候補のみ
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './lib/loadConfig.js';
import type { ShortScript, Telop, CameraSwitch } from './lib/types.js';

type DetailedCandidate = {
  shortId: string;
  topicId: string;
  label: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  title: string;
  reason: string;
  hookFirstTelop?: { text: string; sourceIdx: number };
  telops: Array<{
    text: string;
    startSec: number;  // 絶対時刻
    endSec: number;
    emphasis: Array<{ start: number; end: number; label?: string }>;
    speaker?: string;
  }>;
  totalEmphasis: number;
};

type CandidatesJson = {
  generatedAt: string;
  projectName: string;
  totalCandidates: number;
  candidates: DetailedCandidate[];
  errors: Array<{ shortId: string; message: string }>;
};

function generateCameraSwitches(
  telops: Telop[],
  minInterval: number,
  maxInterval: number,
  boundaryGapSec: number,
  firstSwitchWithinSec: number,
): CameraSwitch[] {
  const switches: CameraSwitch[] = [];
  let currentCamera: 'left' | 'right' = 'left';
  let lastSwitchSec = 0;

  // 0秒: 開始カメラ
  switches.push({ atSec: 0, camera: currentCamera });

  // C-Hook3: 冒頭強制切替（firstSwitchWithinSec / 2 で反対カメラに切替）
  currentCamera = currentCamera === 'left' ? 'right' : 'left';
  lastSwitchSec = firstSwitchWithinSec / 2;
  switches.push({ atSec: lastSwitchSec, camera: currentCamera });

  // 通常の切替ロジック
  for (const telop of telops) {
    const elapsed = telop.endSec - lastSwitchSec;
    if (elapsed >= minInterval) {
      currentCamera = currentCamera === 'left' ? 'right' : 'left';
      const switchAt = telop.endSec + boundaryGapSec;
      switches.push({ atSec: switchAt, camera: currentCamera });
      lastSwitchSec = switchAt;
    } else if (elapsed > maxInterval) {
      currentCamera = currentCamera === 'left' ? 'right' : 'left';
      switches.push({ atSec: telop.endSec, camera: currentCamera });
      lastSwitchSec = telop.endSec;
    }
  }

  return switches;
}

/**
 * 話者ベースのカメラ切替生成（対談用）
 * - speaker が変わるたびにカメラ切替
 * - 相槌スキップ: 話者の連続発話が minDurationSec 未満なら切替えない
 */
function generateSpeakerCameraSwitches(
  telops: Array<{ startSec: number; endSec: number; speaker?: string }>,
  minDurationSec: number = 1.5,
): CameraSwitch[] {
  if (telops.length === 0) return [];

  // 話者が連続する区間をグループ化
  type SpeakerBlock = { speaker: string; startSec: number; endSec: number };
  const blocks: SpeakerBlock[] = [];
  let curSpeaker = telops[0].speaker ?? 'host';
  let blockStart = telops[0].startSec;
  let blockEnd = telops[0].endSec;

  for (let i = 1; i < telops.length; i++) {
    const t = telops[i];
    const spk = t.speaker ?? curSpeaker;
    if (spk === curSpeaker) {
      blockEnd = t.endSec;
    } else {
      blocks.push({ speaker: curSpeaker, startSec: blockStart, endSec: blockEnd });
      curSpeaker = spk;
      blockStart = t.startSec;
      blockEnd = t.endSec;
    }
  }
  blocks.push({ speaker: curSpeaker, startSec: blockStart, endSec: blockEnd });

  // 相槌スキップ: minDurationSec 未満のブロックを前のブロックに吸収
  const filtered: SpeakerBlock[] = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    const dur = blocks[i].endSec - blocks[i].startSec;
    if (dur < minDurationSec) {
      // 短すぎ → 前のブロックに吸収（カメラ切替えない）
      filtered[filtered.length - 1].endSec = blocks[i].endSec;
    } else {
      filtered.push(blocks[i]);
    }
  }

  // ブロック → CameraSwitch
  const switches: CameraSwitch[] = [];
  for (const block of filtered) {
    const camera = block.speaker as CameraSwitch['camera'];
    switches.push({ atSec: block.startSec, camera });
  }

  return switches;
}

async function main() {
  const onlyIdx = process.argv.indexOf('--only');
  const onlyShortId = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

  // project.json
  const configPath = path.resolve('project.json');
  if (!fs.existsSync(configPath)) {
    console.error(`project.json not found at ${configPath}`);
    process.exit(1);
  }
  const config = loadConfig(configPath);
  console.log(`✅ project.json loaded: ${config.projectName}`);

  // candidates.json
  const candidatesPath = path.resolve(config.workDir, 'candidates.json');
  if (!fs.existsSync(candidatesPath)) {
    console.error(`candidates.json not found: ${candidatesPath}`);
    console.error('Run analyze-step2-v2.ts first.');
    process.exit(1);
  }
  const candidatesData: CandidatesJson = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
  console.log(`✅ candidates.json loaded: ${candidatesData.candidates.length} candidates`);

  // フィルタ
  let targetCandidates = candidatesData.candidates;
  if (onlyShortId) {
    targetCandidates = candidatesData.candidates.filter(c => c.shortId === onlyShortId);
    if (targetCandidates.length === 0) {
      console.error(`--only ${onlyShortId} not found in candidates`);
      process.exit(1);
    }
    console.log(`🎯 --only mode: ${onlyShortId}`);
  }

  // 出力ディレクトリ
  const scriptsDir = path.resolve(config.workDir, '..', 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  let successCount = 0;

  for (const candidate of targetCandidates) {
    // 1. telops を相対秒に変換
    const telopsWithSpeaker = candidate.telops.map(t => ({
      text: t.text,
      startSec: t.startSec - candidate.startSec,
      endSec: t.endSec - candidate.startSec,
      emphasis: t.emphasis.map(e => ({
        start: e.start,
        end: e.end,
        ...(e.label ? { label: e.label } : {}),
      })),
      ...(t.speaker ? { speaker: t.speaker } : {}),
    }));
    const telops: Telop[] = telopsWithSpeaker;

    // 2. cameraSwitches 計算
    let cameraSwitches: CameraSwitch[];
    const talkType = (config as any).talkType || 'dialogue';
    const cameraMode = (config as any).cameraMode || 'left';

    if (talkType === 'monologue') {
      // 一人語り: 画角切替なし、指定カメラ固定
      cameraSwitches = [{ atSec: 0, camera: cameraMode as 'left' | 'right' }];
    } else {
      // 対談: 話者ベース切替（speaker情報があれば）、無ければ時間ベースにフォールバック
      const hasSpeaker = telopsWithSpeaker.some(t => t.speaker && t.speaker !== '');
      if (hasSpeaker) {
        cameraSwitches = generateSpeakerCameraSwitches(telopsWithSpeaker);
      } else {
        cameraSwitches = generateCameraSwitches(
          telops,
          config.cameraSwitch.minInterval,
          config.cameraSwitch.maxInterval,
          config.cameraSwitch.boundaryGapSec,
          config.cameraSwitch.firstSwitchWithinSec,
        );
      }
    }

    // 3. ShortScript 構築
    const script: ShortScript = {
      shortId: candidate.shortId,
      title: candidate.title,
      startSec: candidate.startSec,
      endSec: candidate.endSec,
      telops,
      cameraSwitches,
    };

    // 5. 出力
    const outPath = path.join(scriptsDir, `script-${candidate.shortId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(script, null, 2));
    console.log(`📝 ${candidate.shortId}: ${telops.length} telops, ${cameraSwitches.length} switches → ${path.basename(outPath)}`);
    successCount++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Scripts generated: ${successCount}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

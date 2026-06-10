#!/usr/bin/env node
/**
 * generate-topics.ts
 *
 * Whisper の文字起こし（master.json）全体を Claude に渡し、
 * 番組の内容を解析して自然な章立て（topicLabel + 時間境界）を生成する。
 *
 * Usage:
 *   npx tsx scripts/generate-topics.ts \
 *     --whisper master.json \
 *     --out work/topics.json
 */

import OpenAI from "openai";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const val = argv[i + 1];
    if (key && val && !val.startsWith("--")) result[key] = val;
  }
  return result;
}

const args = parseArgs(process.argv);
const whisperPath = args.whisper ?? "master.json";
const outPath = args.out ?? "work/topics.json";
const promptPath = args.prompt ?? "topics-prompt.txt";

type WhisperSegment = { start: number; end: number; text: string };
type WhisperOutput = { segments: WhisperSegment[] };
type TopicEntry = { id: string; label: string; startSec: number; endSec: number };

// ── プロンプトコンテキスト読み込み ──────────────────────────────────────────
const resolvedPromptPath = resolve(promptPath);
if (!existsSync(resolvedPromptPath)) {
  console.error(`❌ プロンプトファイルが見つかりません: ${resolvedPromptPath}`);
  console.error("  --prompt <file> で指定するか、CWD に topics-prompt.txt を配置してください。");
  process.exit(1);
}
const promptContext = readFileSync(resolvedPromptPath, "utf-8").trim();
console.log(`📋 プロンプト読み込み: ${resolvedPromptPath}`);

// ── Whisper データ読み込み ───────────────────────────────────────────────────
const whisper: WhisperOutput = JSON.parse(readFileSync(resolve(whisperPath), "utf-8"));
const segs = whisper.segments;
const totalDuration = Math.ceil(segs[segs.length - 1].end);

// 全テキストを「[秒数] テキスト」形式でまとめる（最大トークン節約のため要約）
const transcript = segs
  .map(s => `[${Math.floor(s.start)}s] ${s.text.trim()}`)
  .join("\n");

console.log(`📖 文字起こし読み込み: ${segs.length} セグメント, 総尺 ${totalDuration}秒 (${(totalDuration/60).toFixed(1)}分)`);
console.log("🤖 GPT-4o に章立てを依頼中...");

const client = new OpenAI();

const systemPrompt = `あなたはラジオ番組の編集アシスタントです。
Whisperが文字起こしした日本語ラジオ番組のトランスクリプトを解析し、
話題の切り替わりに沿って章立て（トピック区切り）を作成してください。

出力は必ず以下の JSON 配列形式のみで返してください（説明文は不要）:
[
  { "id": "intro", "label": "ラベル（日本語・簡潔に）", "startSec": 0, "endSec": 秒数 },
  ...
]

ルール:
- **話題が切り替わるたびに新章を作成すること**（個数の制約なし）
- **「1つ目は〜」「2つ目は〜」「次に〜」「そして〜」等の明示的な区切りを検知し、それぞれを独立した章にすること**
- **列挙形式（例: 「4つの要素」「3つのポイント」等）の場合、各要素を別章にすること**
- 1つの章に異なる話題を混ぜないこと
- label は画面右上に表示されるため 10文字以内の日本語で
- startSec/endSec は正確な整数秒で（最初は必ず 0、最後は必ず ${totalDuration}）
- 連続した章の境界は一致させること（前の endSec = 次の startSec）
- id は "intro", "topic1", "topic2", ... "outro" の形式
- オープニング・エンディングは必ず独立した章にする`;

const userPrompt = `以下はラジオ番組の文字起こしです。

${promptContext}

総尺: ${totalDuration}秒 (${(totalDuration/60).toFixed(1)}分)

文字起こし:
${transcript}

上記を解析して章立て JSON を返してください。`;

(async () => {
  const message = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = message.choices[0]?.message?.content ?? "";

  // JSON 部分を抽出（コードブロックに包まれている可能性を考慮）
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("❌ GPT-4o の応答から JSON を抽出できませんでした:");
    console.error(raw);
    process.exit(1);
  }

  let topics: TopicEntry[];
  try {
    topics = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("❌ JSON パースエラー:", e);
    console.error(raw);
    process.exit(1);
  }

  // バリデーション
  if (!Array.isArray(topics) || topics.length === 0) {
    console.error("❌ トピックが空です");
    process.exit(1);
  }

  // 最初と最後の境界を強制修正
  topics[0].startSec = 0;
  topics[topics.length - 1].endSec = totalDuration;

  // 連続性チェック・修正（前の endSec = 次の startSec）
  for (let i = 1; i < topics.length; i++) {
    topics[i].startSec = topics[i - 1].endSec;
  }

  writeFileSync(resolve(outPath), JSON.stringify(topics, null, 2), "utf-8");

  console.log(`\n✅ ${outPath} を生成しました:`);
  topics.forEach((t, i) => {
    const dur = t.endSec - t.startSec;
    console.log(`  ${i + 1}. [${t.startSec}s-${t.endSec}s] (${dur}秒) "${t.label}"`);
  });
})();

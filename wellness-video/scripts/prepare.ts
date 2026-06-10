#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { loadDefaultJapaneseParser } from "budoux";
import { applyDictionary } from "../../wellness-shared/display-corrections";

const budouxParser = loadDefaultJapaneseParser();

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
const whisperPath = args.whisper;
const topicsPath  = args.topics;
const outPath     = args.out ?? "public/script.json";
const forceOverwrite = args["force-overwrite"] === "true" || process.argv.includes("--force-overwrite");

if (!whisperPath || !topicsPath) process.exit(1);

// ── 安全装置: 手動修正済み script.json の保護 ──
if (existsSync(resolve(outPath)) && !forceOverwrite) {
  try {
    const existing = JSON.parse(readFileSync(resolve(outPath), "utf-8"));
    if (existing._meta?.lastManualEditAt) {
      const editedAt = existing._meta.lastManualEditAt;
      console.error("");
      console.error("❌ 出力先に手動修正済みの script.json が存在します");
      console.error(`   ファイル: ${resolve(outPath)}`);
      console.error(`   最終編集: ${editedAt}`);
      console.error("");
      console.error("   再生成すると北原さんの修正が失われます。");
      console.error("");
      console.error("   選択肢:");
      console.error("   A) dictionary 追加だけしたい場合:");
      console.error("      python3 scripts/apply_dictionary_to_script.py --script <path>");
      console.error("   B) 強制再生成する場合:");
      console.error("      --force-overwrite フラグを追加");
      console.error("");
      process.exit(1);
    }
  } catch {
    // JSON 読めない or _meta なし → そのまま続行
  }
}

type WhisperWord    = { word: string; start: number; end: number };
type WhisperSegment = { start: number; end: number; text: string; words: WhisperWord[] };
type WhisperOutput  = { segments: WhisperSegment[] };
type TopicEntry = { id: string; label: string; startSec: number; endSec: number };
type CameraAngle = "front" | "right" | "left";
type TelopEntry = { text: string; startSec: number; durationSec: number; endSec?: number; absStartSec?: number; absEndSec?: number; noDelay?: boolean };
type OutputSegment = { id: string; angle: CameraAngle; startSec: number; endSec: number; topicLabel: string };

const SOFT_MAX = 18;  // 通常はこの長さで切る目標
const HARD_MAX = 25;  // 絶対超えてはいけない上限

// 文節優先の分割位置を返す（-1 = 分割不要）
// 探索範囲: MAX_CHARS の 40%〜110% = [minPos, maxPos]
// priorityPositions: 句読点除去後テキスト上の優先分割候補（除去オフセット補正済み）
function getSmartSplitIndex(text: string, priorityPositions: number[]): number {
  if (text.length <= SOFT_MAX) return -1;

  const minPos = Math.floor(SOFT_MAX * 0.4); // ≈ 7
  const maxPos = SOFT_MAX;                    // = 18

  // ① 句読点があった位置を最優先 — 範囲内で最後のものを採用
  let bestPriority = -1;
  for (const pos of priorityPositions) {
    if (pos >= minPos && pos <= maxPos) bestPriority = pos;
  }
  if (bestPriority !== -1) return bestPriority;

  // ② BudouX で文節境界を取得し、範囲内で最後のものを採用
  const chunks = budouxParser.parse(text);
  let budouxBest = -1;
  let chunkPos = 0;
  for (const chunk of chunks) {
    chunkPos += chunk.length;
    if (chunkPos >= minPos && chunkPos <= maxPos) budouxBest = chunkPos;
  }
  if (budouxBest !== -1) return budouxBest;

  // ③ フォールバック：SOFT_MAX で自然な位置を探索、見つからなければ HARD_MAX まで広げる
  const softFallback = findFallbackSplitIndex(text, SOFT_MAX);
  if (softFallback > 0 && softFallback < text.length) return softFallback;
  return findFallbackSplitIndex(text, HARD_MAX);
}

/**
 * maxChars 位置から後方に探索し、自然な分割位置を返す。
 * 単語途中での分割を避け、助詞直後・文字種境界を優先する。
 */
function findFallbackSplitIndex(text: string, maxChars: number): number {
  const searchStart = Math.min(maxChars, text.length);
  const searchEnd = Math.max(maxChars - 6, Math.floor(maxChars * 0.4));

  function isBadSplit(pos: number): boolean {
    if (pos <= 0 || pos >= text.length) return true;
    const before2 = pos >= 2 ? text.slice(pos - 2, pos) : "";
    const after1 = text[pos] ?? "";
    const last1 = text[pos - 1] ?? "";
    // 連体詞の途中
    if (["この", "その", "あの", "どの"].includes(before2)) return true;
    // 「という」の途中
    if (before2 === "いう" || before2 === "とい") return true;
    // カタカナ連続の途中
    if (/[\u30a0-\u30ff]/.test(last1) && /[\u30a0-\u30ff]/.test(after1)) return true;
    // 漢字連続の途中
    if (/[\u4e00-\u9fff]/.test(last1) && /[\u4e00-\u9fff]/.test(after1)) return true;
    return false;
  }

  // (a) 助詞の直後
  for (let pos = searchStart; pos >= searchEnd; pos--) {
    if (pos <= 0 || pos >= text.length) continue;
    const prev = text[pos - 1];
    const next = text[pos];
    if ("をがにはでともやかのへ".includes(prev) && !"ねよぞさわ".includes(next) && !isBadSplit(pos)) return pos;
  }
  // (b) 文字種境界
  for (let pos = searchStart; pos >= searchEnd; pos--) {
    if (pos <= 0 || pos >= text.length) continue;
    const p = text[pos - 1], n = text[pos];
    const H = (c: string) => /[\u3040-\u309f]/.test(c);
    const K = (c: string) => /[\u4e00-\u9fff]/.test(c);
    const T = (c: string) => /[\u30a0-\u30ff]/.test(c);
    if ((H(p) && K(n)) || (K(p) && H(n)) || (H(p) && T(n)) || (T(p) && H(n))) {
      if (!isBadSplit(pos)) return pos;
    }
  }
  // (c) 接続助詞「て」の直後
  for (let pos = searchStart; pos >= searchEnd; pos--) {
    if (pos <= 0 || pos >= text.length) continue;
    if (text[pos - 1] === "て" && !isBadSplit(pos)) return pos;
  }
  // (d) 強制分割
  return Math.min(maxChars, text.length);
}

/**
 * 分割候補位置が漢字・カタカナ・英字・数字の連続途中なら、
 * その文字種の境界（前方優先）までずらす。
 */
function adjustForCharType(text: string, pos: number): number {
  if (pos <= 0 || pos >= text.length) return pos;

  const isKanji = (ch: string) => /[\u4e00-\u9fff]/.test(ch);
  const isKata  = (ch: string) => /[\u30a0-\u30ff]/.test(ch);
  const isAlpha = (ch: string) => /[a-zA-Z]/.test(ch);
  const isDigit = (ch: string) => /[0-9\uff10-\uff19]/.test(ch);

  const sameType = (a: string, b: string) =>
    (isKanji(a) && isKanji(b)) ||
    (isKata(a)  && isKata(b))  ||
    (isAlpha(a) && isAlpha(b)) ||
    (isDigit(a) && isDigit(b));

  const prevChar = text[pos - 1];
  const nextChar = text[pos];
  if (!sameType(prevChar, nextChar)) return pos; // 境界OK

  const minPos = Math.floor(SOFT_MAX * 0.4);

  // 前方に文字種の境界を探す
  for (let i = pos - 1; i >= minPos; i--) {
    if (i > 0 && !sameType(text[i - 1], text[i])) return i;
  }

  // 後方に文字種の境界を探す
  for (let i = pos + 1; i <= SOFT_MAX && i < text.length; i++) {
    if (!sameType(text[i - 1], text[i])) return i;
  }

  return pos; // 見つからなければ元の位置
}

// ── 保護トークン（この途中で絶対に改行しない固有名詞）──────────────────
// cleanAndSplit による固有名詞置換「後」のテキストに適用する
// ★ 複合トークン（Dr.中田 The Well-being）を単体トークンより先に書く
// ★ 長いトークンを先に書かないと短いトークンが先にマッチして内部で分割される
const PROTECTED_SOURCE = String.raw`Dr\.\s*中田\s+The Well-being|The Well-being|ウェルビーイング|Dr\.\s*中田|中田航太郎|橋本真希|準レギュラー|地下アイドル|トレンドのど真ん中|富裕層|CROSS\sFM|という|させていただ|させてもら|していただ|してもら`;

/**
 * 分割位置がトークン内部に入っている場合、トークン境界（前端 or 後端）へ移動する。
 * 有効な境界が見つからない場合は -1 を返す（= 分割しない）。
 */
function adjustForProtectedTokens(text: string, pos: number): number {
  const re = new RegExp(PROTECTED_SOURCE, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tokStart = m.index;
    const tokEnd   = m.index + m[0].length;
    if (pos > tokStart && pos < tokEnd) {
      const minPos = Math.floor(SOFT_MAX * 0.4);
      const maxPos = Math.floor(SOFT_MAX * 1.1);
      if (tokStart >= minPos) return tokStart; // トークン前端が有効範囲内
      if (tokEnd   <= maxPos) return tokEnd;   // トークン後端が有効範囲内
      return -1; // どちらも範囲外 → 分割しない
    }
  }
  return pos; // トークンに干渉なし → そのまま
}

/** テロップに自立語（漢字/カタカナ2文字以上/英数字/実質的な自立語）が含まれるか判定 */
function hasContentWord(text: string): boolean {
  if (/[\u4e00-\u9fff]/.test(text)) return true;       // 漢字1文字以上
  if (/[\u30a0-\u30ff]{2,}/.test(text)) return true;   // カタカナ2文字以上連続
  if (/[A-Za-z0-9]/.test(text)) return true;            // 英数字
  // ひらがなのみでも6文字以上なら自立語を含むとみなす（動詞活用形・形式名詞等）
  if (text.length >= 6) return true;
  return false;
}

/** 自立語を含まない短すぎテロップを前後に結合する後処理 */
function postProcessMergeShortTelops(lines: string[]): string[] {
  if (lines.length <= 1) return lines;
  const result = [...lines];
  let i = 0;
  while (i < result.length) {
    if (!hasContentWord(result[i])) {
      // 前に結合を試みる
      if (i > 0 && (result[i - 1].length + result[i].length) <= HARD_MAX) {
        result[i - 1] += result[i];
        result.splice(i, 1);
        continue;
      }
      // 後ろに結合を試みる
      if (i + 1 < result.length && (result[i].length + result[i + 1].length) <= HARD_MAX) {
        result[i] += result[i + 1];
        result.splice(i + 1, 1);
        continue;
      }
    }
    i++;
  }
  return result;
}

function cleanAndSplit(text: string): string[] {
  // 固有名詞置換 + Whisper 誤変換修正（句読点処理より先に行う）
  // 口語（〜じゃん/〜だよね 等）はそのまま維持。同音異義語・誤読のみ修正。
  const withProperNouns = text.trim()
    .replace(/\//g, "")                                // スラッシュ除去（Whisper 誤挿入: と/いう 等）
    // ─ 放送局・番組名 ─
    .replace(/クロス\s?FM/g, "CROSS FM")
    // ─ ウェルビーイング系 ─
    // 二重表記ガード（最優先）: The The Well-being → The Well-being
    .replace(/[Tt]he\s+[Tt]he\s+[Ww]ell[\s-]?[Bb]eing/g, "The Well-being")
    // ザ・付き → The Well-being（番組タイトル）。ザ重複ガードも含む
    .replace(/ザ[・\s]*(?:ウェルビーイング|ウェルビーング|ウェルビング|ウェルヴィング)/gi, "The Well-being")
    .replace(/ザ[・\s]+[Tt]he\s+[Ww]ell[\s-]?[Bb]eing/g, "The Well-being")
    // 単体の誤字バリアントのみ正規化（ウェルビーイング自体は The Well-being に変換しない）
    .replace(/ウェルビーング|ウェルビング|ウェルヴィング/gi, "ウェルビーイング")
    // ─ 人名（Dr. 敬称付きを先に処理してから単独の なかた / 中多 を修正）─
    .replace(/(?:Dr\.|ドクター|どくたー)\s*(?:中田|なかた)/g, "Dr.中田")
    .replace(/中多/g, "中田")
    .replace(/なかた/g, "中田")
    .replace(/中田\s*(?:こう太郎|光太郎|康太郎|孝太郎|幸太郎|好太郎|広太郎|皇太郎)/g, "中田航太郎")
    .replace(/橋本(?:まき|マキ|真樹|真紀|真記|万喜|牧)/g, "橋本真希")
    // ─ 準レギュラー（純レギュラー等の同音異字も含む）─
    .replace(/じゅんレギュラー|純レギュラー|準れぎゅらー|準レぎゅらー|準れギュラー/g, "準レギュラー")
    // ─ 社名 ─
    .replace(/ビニョキオ/g, "ピニョキオ")
    // ─ 慣用句・一般語の誤変換 ─
    .replace(/痴漢アイドル/g, "地下アイドル")
    .replace(/トレンドドセンターど真ん中/g, "トレンドのど真ん中")
    .replace(/重稼働/g, "重労働")
    .replace(/人事を尽くして天命を持つ/g, "人事を尽くして天命を待つ")
    .replace(/浮遊そうめ/g, "富裕層")
    .replace(/握手紙/g, "握手会")
    .replace(/前得点回/g, "前特典会")
    .replace(/後得点回/g, "後特典会")
    .replace(/ウルルくん/g, "ヒルルク")
    .replace(/肝付く/g, "気づく");

  // 句読点の位置を記録しながら全除去
  const priorityPositions: number[] = [];
  let removedBefore = 0;
  const cleaned = withProperNouns.replace(/[、。！？]/g, (match, pos: number) => {
    priorityPositions.push(pos - removedBefore);
    removedBefore += match.length;
    return "";
  });

  // 再帰的に SOFT_MAX 以内になるまで分割する
  function splitRecursive(txt: string): string[] {
    if (txt.length <= SOFT_MAX) return [txt];

    let idx = getSmartSplitIndex(txt, []);
    // SOFT_MAX で見つからなければ段階的にフォールバック
    if (idx === -1) {
      let fb = findFallbackSplitIndex(txt, Math.min(SOFT_MAX, txt.length));
      if (fb <= 0 || fb >= txt.length) fb = findFallbackSplitIndex(txt, Math.min(HARD_MAX, txt.length));
      idx = fb;
    }

    idx = adjustForProtectedTokens(txt, idx);
    if (idx <= 0 || idx >= txt.length) {
      let fb = findFallbackSplitIndex(txt, Math.min(SOFT_MAX, txt.length));
      if (fb <= 0 || fb >= txt.length) fb = findFallbackSplitIndex(txt, Math.min(HARD_MAX, txt.length));
      idx = fb;
    }

    const first  = txt.slice(0, idx);
    const second = txt.slice(idx);
    if (/^[ー、。〉）\]｝」!！？\?\-]/.test(second)) {
      // 禁則でも長すぎる場合は1文字ずらして強制分割
      if (txt.length > SOFT_MAX) {
        return [txt.slice(0, idx + 1), ...splitRecursive(txt.slice(idx + 1))];
      }
      return [txt];
    }

    const parts = [...splitRecursive(first), ...splitRecursive(second)];
    return postProcessMergeShortTelops(parts);
  }

  let splitIdx = getSmartSplitIndex(cleaned, priorityPositions);
  if (splitIdx === -1) {
    // SOFT_MAX 超なら強制分割
    if (cleaned.length > SOFT_MAX) return splitRecursive(cleaned);
    return [cleaned];
  }

  // 保護トークンの内部を割らないように分割位置を調整
  splitIdx = adjustForProtectedTokens(cleaned, splitIdx);
  if (splitIdx <= 0 || splitIdx >= cleaned.length) {
    if (cleaned.length > SOFT_MAX) return splitRecursive(cleaned);
    return [cleaned];
  }

  const first  = cleaned.slice(0, splitIdx);
  const second = cleaned.slice(splitIdx);
  // 行頭禁則：ーや句読点が行頭に来る場合は結合（ただし結合結果が HARD_MAX 超なら再帰分割）
  if (/^[ー、。〉）\]｝」!！？\?\-]/.test(second)) {
    const combined = first + second;
    if (combined.length > HARD_MAX) return splitRecursive(combined);
    return [combined];
  }

  // first も second も再帰分割し、短すぎテロップを後処理で結合
  return postProcessMergeShortTelops([...splitRecursive(first), ...splitRecursive(second)]);
}

/**
 * word-level timestamp で、cleanAndSplit 後のテキスト上の文字位置に対応する
 * Whisper word の終了時刻を返す。見つからなければ null（フォールバック用）。
 *
 * cleanAndSplit は句読点（、。！？）を除去するため、
 * 元テキスト上の累積文字位置と除去後の位置にオフセットが生じる。
 * words[] の word フィールドを順に連結しながら、
 * 句読点を飛ばした「クリーン文字位置」で charOffset に到達する word を探す。
 */
function findWordEndTime(ws: WhisperSegment, charOffset: number): number | null {
  const words = ws.words;
  if (!words || words.length === 0) return null;

  let cleanPos = 0; // 句読点除去後の累積文字位置
  for (const w of words) {
    for (const ch of w.word) {
      if (!/[、。！？]/.test(ch)) {
        cleanPos++;
      }
      if (cleanPos >= charOffset) {
        return w.end;
      }
    }
  }
  return null;
}

/**
 * Whisper セグメント 1 件 → テロップエントリを生成する。
 *
 * 複数行に分割された場合、word-level timestamp を使って分割時刻を決定する。
 * words[] がない場合や対応する word が見つからない場合は文字数比按分にフォールバック。
 */
function buildTelopEntries(
  ws: WhisperSegment,
  segStart: number,
): TelopEntry[] {
  const lines = cleanAndSplit(ws.text).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  const dur        = ws.end - ws.start;
  const wsStartRel = ws.start - segStart;

  // 1行: 従来通り1エントリ
  if (lines.length === 1) {
    return [{ text: lines[0], startSec: wsStartRel, durationSec: dur, endSec: ws.end - segStart, absStartSec: ws.start, absEndSec: ws.end }];
  }

  // 複数行: word-level timestamp で分割時刻を決定
  const totalChars = lines.reduce((sum, l) => sum + l.length, 0);
  const entries: TelopEntry[] = [];
  let t = ws.start;
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const isLast = i === lines.length - 1;
    charOffset += lines[i].length;

    let lineEnd: number;
    if (isLast) {
      lineEnd = ws.end;
    } else {
      // word-level timestamp を試行、失敗時は文字数比按分にフォールバック
      const wordEnd = findWordEndTime(ws, charOffset);
      lineEnd = wordEnd ?? (t + (lines[i].length / totalChars) * dur);
    }

    entries.push({
      text: lines[i],
      startSec: t - segStart,
      durationSec: lineEnd - t,
      endSec: lineEnd - segStart,
      absStartSec: t,
      absEndSec: lineEnd,
      ...(i > 0 ? { noDelay: true } : {}),
    });
    t = lineEnd;
  }
  return entries;
}

const whisper: WhisperOutput = JSON.parse(readFileSync(resolve(whisperPath), "utf-8"));
const topics: TopicEntry[] = JSON.parse(readFileSync(resolve(topicsPath), "utf-8"));
let angleState = { onSide: false, frontStreak: 0, sideStreak: 0, lastSide: "left" as "left" | "right", cycleCount: 0 };

function nextAngle(st: typeof angleState) {
  const FRONT_THRESHOLDS = [2, 3, 2, 3] as const;
  const SIDE_COUNT = 2;
  if (st.onSide) {
    if (st.sideStreak >= SIDE_COUNT) {
      return { angle: "front" as CameraAngle, state: { ...st, onSide: false, frontStreak: 1, sideStreak: 0 } };
    }
    const side = st.lastSide;
    return { angle: side as CameraAngle, state: { ...st, sideStreak: st.sideStreak + 1 } };
  }
  const threshold = FRONT_THRESHOLDS[st.cycleCount % FRONT_THRESHOLDS.length];
  if (st.frontStreak >= threshold) {
    const side: "left" | "right" = st.lastSide === "right" ? "left" : "right";
    return { angle: side as CameraAngle, state: { onSide: true, frontStreak: 0, sideStreak: 1, lastSide: side, cycleCount: st.cycleCount + 1 } };
  }
  return { angle: "front" as CameraAngle, state: { ...st, frontStreak: st.frontStreak + 1 } };
}

const outputSegments: OutputSegment[] = [];
const subtitles: Record<string, TelopEntry[]> = {};
const totalDurationSec = Math.max(...topics.map(t => t.endSec));

// ── カメラセグメントを固定インターバルで生成 ──────────────────────────────
// Whisper セグメント境界とカメラ切り替えを完全に分離する。
// テロップは GlobalTelopLayer が absStartSec/absEndSec で独立管理するため、
// カメラ Sequence の境界はテロップ表示に一切干渉しない。
const CAM_STEP_SEC = 6;
let camTime = 0;
let camIdx = 0;
while (camTime < totalDurationSec) {
  const segStart = camTime;
  const segEnd   = Math.min(camTime + CAM_STEP_SEC, totalDurationSec);
  const topicLabel = topics.find(t => t.startSec <= segStart && segStart < t.endSec)?.label
    ?? topics[topics.length - 1].label;
  const { angle, state } = nextAngle(angleState);
  angleState = state;
  const segId = `cam-${String(camIdx).padStart(4, "0")}`;
  outputSegments.push({ id: segId, angle, startSec: segStart, endSec: segEnd, topicLabel });
  subtitles[segId] = [];
  camTime = segEnd;
  camIdx++;
}

// ── Whisper セグメント → テロップ（カメラ境界と無関係に生成）────────────
// buildTelopEntries は absStartSec/absEndSec を ws.start/ws.end から生成する。
// startSec は ws.start を基準にした相対値（GlobalTelopLayer では不使用）。
for (const ws of whisper.segments) {
  const entries = buildTelopEntries(ws, ws.start);
  if (entries.length === 0) continue;
  // ws.start が属するカメラセグメントに格納（GlobalTelopLayer は格納先に依存しない）
  const seg = outputSegments.find(s => s.startSec <= ws.start && ws.start < s.endSec)
    ?? outputSegments[outputSegments.length - 1];
  subtitles[seg.id].push(...entries);
}

// ── patches.json の適用 ─────────────────────────────────────────
// work/patches.json が存在すれば、手修正パッチを適用する。
// 指紋チェック（originalText 一致）で安全に適用。不一致時はスキップ+警告。
const patchesPath = resolve("work/patches.json");
if (existsSync(patchesPath)) {
  type PatchEntry = {
    targetSegId: string;
    targetIndex: number;
    originalText: string;
    deleteCount?: number; // 削除するエントリ数（デフォルト: 1）。結合パッチでは 2
    replacement: Array<{ text: string; absStartSec?: number; absEndSec?: number; noDelay?: boolean }>;
    comment?: string;
  };
  const patches: PatchEntry[] = JSON.parse(readFileSync(patchesPath, "utf-8"));
  let applied = 0;
  let skipped = 0;
  let deleted = 0;

  // パッチはインデックスが大きい順に適用する（splice でインデックスがずれるため）
  // 同一セグメント内で複数パッチがある場合を考慮してセグメントID+index降順にソート
  const sorted = [...patches].sort((a, b) => {
    if (a.targetSegId !== b.targetSegId) return a.targetSegId < b.targetSegId ? 1 : -1;
    return b.targetIndex - a.targetIndex;
  });

  for (const patch of sorted) {
    const entries = subtitles[patch.targetSegId];
    if (!entries) { console.warn(`⚠️ パッチ対象セグメント不在: ${patch.targetSegId}`); skipped++; continue; }

    const target = entries[patch.targetIndex];
    if (!target) { console.warn(`⚠️ パッチ対象index不在: ${patch.targetSegId}#${patch.targetIndex}`); skipped++; continue; }

    // 指紋チェック
    if (target.text !== patch.originalText) {
      console.warn(`⚠️ テキスト不一致（指紋NG）: ${patch.targetSegId}#${patch.targetIndex}`);
      console.warn(`   期待: "${patch.originalText}"`);
      console.warn(`   実際: "${target.text}"`);
      skipped++;
      continue;
    }

    // 削除パッチ（replacement が空配列）
    if (patch.replacement.length === 0) {
      entries.splice(patch.targetIndex, 1);
      deleted++;
      continue;
    }

    // カメラセグメントの startSec を取得（相対時刻算出用）
    const camSeg = outputSegments.find(s => s.id === patch.targetSegId);
    const camStart = camSeg?.startSec ?? 0;

    // 置換エントリを生成
    const replacements: TelopEntry[] = patch.replacement.map(r => ({
      text: r.text,
      startSec: (r.absStartSec ?? 0) - camStart,
      durationSec: (r.absEndSec ?? 0) - (r.absStartSec ?? 0),
      endSec: (r.absEndSec ?? 0) - camStart,
      absStartSec: r.absStartSec,
      absEndSec: r.absEndSec,
      ...(r.noDelay ? { noDelay: true } : {}),
    }));

    entries.splice(patch.targetIndex, patch.deleteCount ?? 1, ...replacements);
    applied++;
  }

  console.log(`📋 パッチ適用: ${applied}件成功 / ${deleted}件削除 / ${skipped}件スキップ`);
}

// ── 時刻オーバーラップ重複の除去 ─────────────────────────────────
// patches.json 適用後、同一カット内で時刻が重なる短いテロップを削除する。
// 判定: 同一カット内で 0.3秒以上オーバーラップし、短い方のテキストが長い方に部分一致。
let removedDups = 0;
for (const segId of Object.keys(subtitles)) {
  const entries = subtitles[segId];
  const toRemove = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      if (toRemove.has(j)) continue;
      const a = entries[i], b = entries[j];
      const overlapSec = Math.min(a.absEndSec ?? 0, b.absEndSec ?? 0)
                       - Math.max(a.absStartSec ?? 0, b.absStartSec ?? 0);
      if (overlapSec < 0.3) continue;
      if (a.text.length < b.text.length && b.text.includes(a.text)) {
        toRemove.add(i);
      } else if (b.text.length < a.text.length && a.text.includes(b.text)) {
        toRemove.add(j);
      }
    }
  }
  if (toRemove.size > 0) {
    removedDups += toRemove.size;
    subtitles[segId] = entries.filter((_, idx) => !toRemove.has(idx));
  }
}
if (removedDups > 0) {
  console.log(`🗑️ 時刻オーバーラップ重複を ${removedDups}件 削除`);
}

// ── テキスト前後の空白を除去 ─────────────────────────────────
for (const segId of Object.keys(subtitles)) {
  subtitles[segId] = subtitles[segId].map(entry => ({
    ...entry,
    text: entry.text.trim(),
  }));
}

// 「っ」始まりテロップ結合時に、B先頭から抽出する活用語尾パターン（長い順）
const TSU_ENDINGS = [
  "っちゃった", "っちゃって", "っちゃう",
  "っていう", "ったり", "ってる", "ってた", "ってて", "っても", "っちゃ",
  "った", "って", "っち", "っぱ", "っき", "っく", "っと",
];

// ── 隣接テロップ間の不自然境界を修正 ─────────────────────────────
function postProcessFixBoundaries(entries: TelopEntry[]): TelopEntry[] {
  if (entries.length <= 1) return entries;
  const result = [...entries];

  const FORBIDDEN_NEXT: Record<string, string> = {
    "よ": "っうろかきく",
    "さ": "せらしすてし",
    "わ": "かきくけこたちつてとり",
    "ね": "",
  };

  let i = 0;
  while (i < result.length - 1) {
    const a = result[i];
    const b = result[i + 1];

    // ルール1: A末尾「に」+ B先頭「よって」→ 「に」をBに移動
    if (a.text.endsWith("に") && b.text.startsWith("よって")) {
      a.text = a.text.slice(0, -1);
      b.text = "に" + b.text;
      if (a.text.length === 0) {
        result.splice(i, 1);
        continue;
      }
      i++;
      continue;
    }

    // ルール4: A末尾「で」+ B先頭「すね」→ 「で」をBに移動して「ですね」に
    if (a.text.endsWith("で") && b.text.startsWith("すね")) {
      a.text = a.text.slice(0, -1);
      b.text = "で" + b.text;
      if (a.text.length === 0) {
        result.splice(i, 1);
        continue;
      }
      i++;
      continue;
    }

    // ルール2: B先頭が終助詞「ね/よ/さ/わ」
    if (b.text.length >= 2 && "ねよさわ".includes(b.text[0])) {
      const particle = b.text[0];
      const forbidden = FORBIDDEN_NEXT[particle] ?? "";
      if (forbidden.includes(b.text[1])) {
        i++;
        continue;
      }
      // ケース2a: Aの末尾に移動して HARD_MAX 以内なら結合
      if ((a.text.length + 1) <= HARD_MAX) {
        a.text = a.text + particle;
        b.text = b.text.slice(1);
        if (b.text.length === 0) {
          result.splice(i + 1, 1);
          continue;
        }
        i++;
        continue;
      }
      // ケース2b: 結合できない場合はBから削除（情報損失）
      console.warn(`⚠️ 終助詞「${particle}」を削除: ${b.text.slice(0, 10)}...`);
      b.text = b.text.slice(1);
      if (b.text.length === 0) {
        result.splice(i + 1, 1);
        continue;
      }
      i++;
      continue;
    }

    // ルール3: B先頭が「っ/ッ」→ 単語破壊。活用語尾の塊をA末尾に移動
    if (b.text.length >= 1 && (b.text[0] === "っ" || b.text[0] === "ッ")) {
      let matched = "";
      for (const ending of TSU_ENDINGS) {
        if (b.text.startsWith(ending)) {
          matched = ending;
          break;
        }
      }
      if (!matched) matched = b.text[0];

      if (a.text.length + matched.length <= HARD_MAX) {
        a.text = a.text + matched;
        b.text = b.text.slice(matched.length);
      } else if (a.text.length + 1 <= HARD_MAX) {
        a.text = a.text + b.text[0];
        b.text = b.text.slice(1);
      } else {
        console.warn(`⚠️ 「っ」始まり結合不可: ${a.text.slice(-5)}|${b.text.slice(0, 5)}`);
      }
      if (b.text.length === 0) {
        result.splice(i + 1, 1);
        continue;
      }
      i++;
      continue;
    }

    i++;
  }

  // 全テロップの両端スペースを除去（ルール適用で露出したスペース対策）
  for (let j = 0; j < result.length; j++) {
    result[j].text = result[j].text.replace(/^\s+/, "").replace(/\s+$/, "");
  }

  return result;
}

for (const segId of Object.keys(subtitles)) {
  subtitles[segId] = postProcessFixBoundaries(subtitles[segId]);
}

// ── dictionary + 正規表現補正 ─────────────────────────────────
for (const segId of Object.keys(subtitles)) {
  subtitles[segId] = subtitles[segId].map(entry => ({
    ...entry,
    text: applyDictionary(entry.text),
  }));
}

writeFileSync(
  resolve(outPath),
  JSON.stringify({ totalDurationSec, transitionSec: 0, segments: outputSegments, subtitles }, null, 2),
  "utf-8"
);

console.log(`✅ script.json を生成しました: ${outPath}`);
console.log(`   総尺: ${totalDurationSec}秒 / セグメント数: ${outputSegments.length}`);
console.log(`   テロップ総行数: ${Object.values(subtitles).flat().length}`);

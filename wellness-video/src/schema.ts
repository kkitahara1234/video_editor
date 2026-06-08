// ============================================================
//  schema.ts  ── データ型定義 + ヘルパー + デモデータ
//
//  実際の運用では public/script.json が唯一の編集ファイルになります。
//  この DEMO_SCRIPT は script.json が存在しない場合のフォールバックです。
// ============================================================

export type CameraAngle = "front" | "right" | "left";

export type ZoomKeyframe = {
  frame: number; // セグメント先頭からのフレーム番号
  scale: number; // 1.0 = 等倍
};

/** 1カットの定義 */
export type SegmentData = {
  id: string;
  angle: CameraAngle;
  /** ソース動画（全カメラ共通タイムライン）での開始秒 */
  startSec: number;
  /** ソース動画での終了秒 */
  endSec: number;
  topicLabel?: string;
  zoom?: ZoomKeyframe[];
};

/** 1行テロップエントリ */
export type TelopEntryData = {
  text: string;
  startSec: number;    // セグメント開始からの相対秒数
  durationSec: number; // 表示秒数
  endSec?: number;     // 音声セグメントの終了時刻（セグメント相対秒）= ws.end - segStart
                       // 指定がない場合は startSec + durationSec にフォールバック
  // グローバルタイムライン用 — master.wav 上の絶対音声時間（prepare.ts が設定）
  absStartSec?: number; // ws.start そのまま
  absEndSec?: number;   // ws.end そのまま
  noDelay?: boolean;    // true: +10f オフセットを適用しない（長行分割の後続行）
};

/** work/run-config.json から書き出されるトリム設定 */
export type VideoStartTrimSec = { front: number; right: number; left: number };

/** ネームタグオーバーレイ */
export type NameTagData = {
  line1: string;      // 1行目（会社名など）
  line2: string;      // 2行目（氏名・役職など）
  absStartSec: number;
  absEndSec: number;
};

/**
 * script.json のルート型
 *
 * totalDurationSec … 動画全体の尺（秒）
 * transitionSec   … セグメント間クロスフェード長（省略時: 0.5秒）
 * audioStartTrimSec  … master.wav の読み飛ばし秒数（run-config.json 由来）
 * videoStartTrimSec  … 各映像ファイルの読み飛ばし秒数（run-config.json 由来）
 * nameTag         … 左側人物のネームタグ（省略可）
 * nameTagRight    … 右側人物のネームタグ（省略可）
 * segments        … カット一覧（時系列順）。startSec/endSec は本編開始後の相対秒
 * subtitles       … セグメントIDをキーとするテロップ辞書
 */
export type ScriptData = {
  totalDurationSec: number;
  transitionSec?: number;
  audioStartTrimSec?: number;
  videoStartTrimSec?: VideoStartTrimSec;
  nameTag?: NameTagData;
  nameTagRight?: NameTagData;
  segments: SegmentData[];
  subtitles: Record<string, TelopEntryData[]>;
};

// ── ヘルパー関数 ──────────────────────────────────────────

export function getTransitionFrames(script: ScriptData, fps: number): number {
  return Math.round((script.transitionSec ?? 0.5) * fps);
}

export function getSegmentDurationInFrames(seg: SegmentData, fps: number): number {
  return Math.round((seg.endSec - seg.startSec) * fps);
}

export type TopicBadgeEntry = {
  label: string;
  startFrame: number;
  endFrame: number;
};

/** SEGMENTS の topicLabel からバッジ表示データを生成 */
export function computeTopicBadgeData(
  script: ScriptData,
  fps: number,
): TopicBadgeEntry[] {
  const tf = getTransitionFrames(script, fps);
  const result: TopicBadgeEntry[] = [];
  let globalFrame = 0;

  script.segments.forEach((seg, i) => {
    const dur = getSegmentDurationInFrames(seg, fps);
    if (seg.topicLabel) {
      const last = result[result.length - 1];
      if (last && last.label === seg.topicLabel) {
        last.endFrame = globalFrame + dur;
      } else {
        result.push({ label: seg.topicLabel, startFrame: globalFrame, endFrame: globalFrame + dur });
      }
    }
    globalFrame += dur;
    if (i < script.segments.length - 1) globalFrame -= tf;
  });

  return result;
}

// ── デモスクリプト（script.json がないときのフォールバック）──
//
// prepare.ts が生成するリズムを再現:
//   F F S F F S ... (F=front, S=right/left 交互)
//   サイドカメラは 1 カットのみ → front に戻る

export const DEMO_SCRIPT: ScriptData = {
  totalDurationSec: 130,
  transitionSec: 0.5,
  segments: [
    // ── はじめに ──────────────────────── F F S
    { id: "intro-00", angle: "front", startSec:  0, endSec:  8, topicLabel: "はじめに" },
    { id: "intro-01", angle: "front", startSec:  8, endSec: 14, topicLabel: "はじめに" },
    { id: "intro-02", angle: "right", startSec: 14, endSec: 20, topicLabel: "はじめに" },
    // ── 睡眠 ──────────────────────────── F F S F F S
    { id: "sleep-00", angle: "front", startSec: 20, endSec: 28, topicLabel: "睡眠" },
    { id: "sleep-01", angle: "front", startSec: 28, endSec: 36, topicLabel: "睡眠" },
    { id: "sleep-02", angle: "left",  startSec: 36, endSec: 43, topicLabel: "睡眠" },
    { id: "sleep-03", angle: "front", startSec: 43, endSec: 51, topicLabel: "睡眠" },
    { id: "sleep-04", angle: "front", startSec: 51, endSec: 58, topicLabel: "睡眠" },
    { id: "sleep-05", angle: "right", startSec: 58, endSec: 65, topicLabel: "睡眠" },
    // ── 食事と栄養 ────────────────────── F F S F F S
    { id: "nutrition-00", angle: "front", startSec:  65, endSec:  73, topicLabel: "食事と栄養" },
    { id: "nutrition-01", angle: "front", startSec:  73, endSec:  81, topicLabel: "食事と栄養" },
    { id: "nutrition-02", angle: "left",  startSec:  81, endSec:  88, topicLabel: "食事と栄養" },
    { id: "nutrition-03", angle: "front", startSec:  88, endSec:  96, topicLabel: "食事と栄養" },
    { id: "nutrition-04", angle: "front", startSec:  96, endSec: 103, topicLabel: "食事と栄養" },
    { id: "nutrition-05", angle: "right", startSec: 103, endSec: 110, topicLabel: "食事と栄養" },
    // ── まとめ ────────────────────────── F F S
    { id: "outro-00", angle: "front", startSec: 110, endSec: 118, topicLabel: "まとめ" },
    { id: "outro-01", angle: "front", startSec: 118, endSec: 124, topicLabel: "まとめ" },
    { id: "outro-02", angle: "left",  startSec: 124, endSec: 130, topicLabel: "まとめ" },
  ],
  subtitles: {
    "intro-00": [
      { text: "こんにちは 今日もよろしくお願いします", startSec: 1.0, durationSec: 3.0 },
    ],
    "intro-01": [
      { text: "今日はウェルネス習慣についてお話しします", startSec: 1.0, durationSec: 3.5 },
    ],
    "intro-02": [
      { text: "一緒に学んでいきましょう", startSec: 1.0, durationSec: 2.5 },
    ],
    "sleep-00": [
      { text: "まずは睡眠の話をしていきます",               startSec: 0.5, durationSec: 3.0 },
    ],
    "sleep-01": [
      { text: "睡眠って体全体の回復に直結してるんですよね", startSec: 0.5, durationSec: 4.0 },
    ],
    "sleep-02": [
      { text: "毎日同じ時間に寝起きするのが大事です",       startSec: 0.5, durationSec: 3.5 },
    ],
    "sleep-03": [
      { text: "ブルーライトは寝る2時間前には控えて",        startSec: 0.5, durationSec: 4.0 },
    ],
    "sleep-04": [
      { text: "寝る環境を整えてあげるのも効果的です",       startSec: 0.5, durationSec: 3.5 },
    ],
    "sleep-05": [
      { text: "特に睡眠の質を意識してほしいんです",         startSec: 0.5, durationSec: 3.5 },
    ],
    "nutrition-00": [
      { text: "次は食事と栄養の話です",                     startSec: 1.0, durationSec: 3.0 },
    ],
    "nutrition-01": [
      { text: "バランスのいい食事が健康の土台になります",   startSec: 0.5, durationSec: 3.5 },
    ],
    "nutrition-02": [
      { text: "野菜とタンパク質と良質な脂質を意識して",     startSec: 0.5, durationSec: 4.0 },
    ],
    "nutrition-03": [
      { text: "加工食品と砂糖は摂りすぎに注意ですね",       startSec: 0.5, durationSec: 3.5 },
    ],
    "nutrition-04": [
      { text: "食事は楽しんで食べることも大切ですよ",       startSec: 0.5, durationSec: 3.5 },
    ],
    "nutrition-05": [
      { text: "腸内環境も意識してみてください",             startSec: 0.5, durationSec: 3.5 },
    ],
    "outro-00": [
      { text: "今日は睡眠と食事についてお話ししました",     startSec: 1.0, durationSec: 3.5 },
    ],
    "outro-01": [
      { text: "少しずつ生活に取り入れてみてください",       startSec: 0.5, durationSec: 3.5 },
    ],
    "outro-02": [
      { text: "次回もお楽しみに",                           startSec: 1.0, durationSec: 3.0 },
    ],
  },
};

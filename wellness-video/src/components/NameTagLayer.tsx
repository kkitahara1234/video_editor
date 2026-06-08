import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { type ScriptData, type TelopEntryData } from "../schema";

const FONT =
  '"Tazugane Gothic StdN", "MT たづがね角ゴシック StdN", "TazuganeGothicStdN-Medium", "たづがね角ゴシック StdN Medium", "Noto Sans JP", sans-serif';

const FADE_FRAMES = 12; // フェードイン/アウトのフレーム数

/**
 * 字幕データから「中田」が最初に登場するタイミングを動的に検索し、
 * ネームタグの表示開始・終了時刻を計算する。
 *
 * - 動画開始から10秒以内に「中田」を含む字幕があればその時刻を使用（3秒間表示）
 * - 見つからなければデフォルト: 動画開始2秒後〜5秒後
 */
function computeNameTagTiming(
  script: ScriptData,
  audioStartTrimSec: number,
): { absStartSec: number; absEndSec: number } {
  const SEARCH_WINDOW_SEC = 10;
  const DISPLAY_DURATION_SEC = 3;

  const allEntries: TelopEntryData[] = Object.values(script.subtitles).flat();
  const found = allEntries
    .filter(
      (e) =>
        e.absStartSec !== undefined &&
        e.absStartSec - audioStartTrimSec >= 0 &&
        e.absStartSec - audioStartTrimSec <= SEARCH_WINDOW_SEC &&
        e.text.includes("中田"),
    )
    .sort((a, b) => (a.absStartSec ?? 0) - (b.absStartSec ?? 0))[0];

  if (found?.absStartSec !== undefined) {
    return {
      absStartSec: found.absStartSec,
      absEndSec: found.absStartSec + DISPLAY_DURATION_SEC,
    };
  }

  // デフォルト: 動画開始2秒後〜5秒後
  return {
    absStartSec: audioStartTrimSec + 2,
    absEndSec: audioStartTrimSec + 5,
  };
}

/** ネームタグ1件を描画するヘルパー */
function NameTag({
  tag,
  timing,
  frame,
  fps,
  audioStartTrimSec,
  side,
}: {
  tag: { line1: string; line2: string };
  timing: { absStartSec: number; absEndSec: number };
  frame: number;
  fps: number;
  audioStartTrimSec: number;
  side: "left" | "right";
}) {
  const startFrame = Math.round((timing.absStartSec - audioStartTrimSec) * fps);
  const endFrame   = Math.round((timing.absEndSec   - audioStartTrimSec) * fps);

  if (frame < startFrame - FADE_FRAMES || frame >= endFrame + FADE_FRAMES) return null;

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + FADE_FRAMES, endFrame - FADE_FRAMES, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  if (opacity <= 0) return null;

  const isRight = side === "right";

  return (
    <div
      style={{
        position: "absolute",
        ...(isRight ? { right: 72 } : { left: 72 }),
        bottom: 200,
        opacity,
        display: "flex",
        flexDirection: isRight ? "row-reverse" : "row",
        alignItems: "stretch",
      }}
    >
      {/* アクセントバー（左側タグは左端、右側タグは右端） */}
      <div
        style={{
          width: 6,
          borderRadius: 3,
          background: "#0092F9",
          ...(isRight ? { marginLeft: 18 } : { marginRight: 18 }),
          flexShrink: 0,
        }}
      />

      {/* テキストブロック */}
      <div
        style={{
          background: "rgba(0,0,0,0.72)",
          borderRadius: 8,
          padding: "14px 28px 14px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* line1: 会社名 */}
        <span
          style={{
            fontFamily: FONT,
            fontSize: 28,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
            lineHeight: 1,
            letterSpacing: "0.06em",
            textAlign: isRight ? "right" : "left",
          }}
        >
          {tag.line1}
        </span>

        {/* line2: 役職・氏名 */}
        <span
          style={{
            fontFamily: FONT,
            fontSize: 40,
            fontWeight: 700,
            color: "#FFFFFF",
            lineHeight: 1,
            letterSpacing: "0.04em",
            textShadow: "0 1px 6px rgba(0,0,0,0.8)",
            textAlign: isRight ? "right" : "left",
          }}
        >
          {tag.line2}
        </span>
      </div>
    </div>
  );
}

/**
 * ネームタグオーバーレイ。
 *
 * 字幕データから「中田」が最初に登場するタイミングを自動検索し、
 * そのタイミングでネームタグを表示する。
 * 動画開始10秒以内に「中田」が見つからない場合は 2〜5 秒にデフォルト表示。
 *
 * script.nameTag      → 画面左下（左側人物）
 * script.nameTagRight → 画面右下（右側人物）
 */
export const NameTagLayer: React.FC<{ script: ScriptData }> = ({ script }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioStartTrimSec = script.audioStartTrimSec ?? 0;

  if (!script.nameTag && !script.nameTagRight) return null;

  // 字幕データからタイミングを動的に計算（左右タグ共通）
  const timing = computeNameTagTiming(script, audioStartTrimSec);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {script.nameTag && (
        <NameTag
          tag={script.nameTag}
          timing={timing}
          frame={frame}
          fps={fps}
          audioStartTrimSec={audioStartTrimSec}
          side="left"
        />
      )}
      {script.nameTagRight && (
        <NameTag
          tag={script.nameTagRight}
          timing={timing}
          frame={frame}
          fps={fps}
          audioStartTrimSec={audioStartTrimSec}
          side="right"
        />
      )}
    </AbsoluteFill>
  );
};

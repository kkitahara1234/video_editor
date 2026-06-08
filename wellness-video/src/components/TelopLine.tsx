import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { type TelopEntryData } from "../schema";
import { fixText } from "../../wellness-shared/display-corrections";

const FONT =
  '"Tazugane Gothic StdN", "MT たづがね角ゴシック StdN", "TazuganeGothicStdN-Medium", "たづがね角ゴシック StdN Medium", "Noto Sans JP", sans-serif';

/**
 * 1行テロップ（1行固定・YouTube 標準サイズ）。
 *
 * @param entry テロップデータ（startSec はセグメント内相対秒）
 */
export const TelopLine: React.FC<{ entry: TelopEntryData }> = ({
  entry,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ① 表示開始フレーム: Whisper の start タイムスタンプ + 6f（≈0.20秒）
  //    話し始めてから字幕が出るよう一律後ろへオフセット。フェードイン6fと一致。
  const startFrame = Math.round(entry.startSec * fps) + 6;

  // ② 表示終了フレーム: endSec を直接変換。マージン・余白・ガードなし。
  //    endSec がない古いデータは startSec + durationSec にフォールバック
  const speechEndSec = entry.endSec ?? (entry.startSec + entry.durationSec);
  const endFrame     = Math.round(speechEndSec * fps); // endSec に直結（オフセットなし）

  if (frame < startFrame || frame >= endFrame) return null;

  // フェードインのみ（フェードアウトなし）: endFrame の瞬間にパッと消える。
  // 表示時間が短くてもフェードインが endFrame を超えないようキャップする。
  // → 短いテロップが「消えかける」ように見える現象を防ぐ。
  const fadeInFrames = Math.min(6, endFrame - startFrame);
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + fadeInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) },
  );

  const translateY = interpolate(
    frame,
    [startFrame, startFrame + fadeInFrames],
    [8, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 72, pointerEvents: "none" }}>
      <div style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        whiteSpace: "pre-wrap",
        padding: "14px 48px",
        background: "rgba(0,0,0,0.65)",
        borderRadius: 10,
      }}>
        <span style={{
          fontFamily: FONT,
          fontSize: 44,
          fontWeight: 700,
          color: "#FFFFFF",
          lineHeight: 1,
          letterSpacing: "0.03em",
          textShadow: "0 1px 6px rgba(0,0,0,1)",
        }}>
          {fixText(entry.text)}
        </span>
      </div>
    </AbsoluteFill>
  );
};

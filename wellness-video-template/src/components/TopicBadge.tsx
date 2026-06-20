import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { type TopicBadgeEntry } from "../schema";

const FADE_FRAMES = 14;
const FONT =
  '"Tazugane Gothic StdN", "MT たづがね角ゴシック StdN", "TazuganeGothicStdN-Medium", "たづがね角ゴシック StdN Medium", "Noto Sans JP", sans-serif';

/**
 * 右上トピックバッジ。
 * badgeData は VideoMain で computeTopicBadgeData() して渡す。
 */
export const TopicBadge: React.FC<{ badgeData: TopicBadgeEntry[] }> = ({ badgeData }) => {
  const frame = useCurrentFrame();

  const current = badgeData.find(
    (e) => frame >= e.startFrame && frame < e.endFrame,
  );
  if (!current) return null;

  const { startFrame, endFrame } = current;

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + FADE_FRAMES, endFrame - FADE_FRAMES, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // 右からスライドイン
  const translateX = interpolate(
    frame,
    [startFrame, startFrame + FADE_FRAMES],
    [24, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  return (
    // AbsoluteFill は column flex: alignItems=横, justifyContent=縦
    // flexDirection:row で通常の row 挙動にし、右上を指定
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end", padding: "44px 48px", pointerEvents: "none" }}>
      <div style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(0, 146, 249, 0.88)",
        borderRadius: 999,
        padding: "12px 28px",
        backdropFilter: "blur(4px)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
      }}>
        <span style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
          {current.label}
        </span>
      </div>
    </AbsoluteFill>
  );
};

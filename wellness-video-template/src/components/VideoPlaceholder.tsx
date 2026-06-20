import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { type SegmentData } from "../schema";

const ANGLE_STYLE: Record<string, { bg: string; accent: string; label: string }> = {
  front: { bg: "linear-gradient(135deg, #0f1f3d 0%, #1e3a6e 100%)", accent: "#4a9eff", label: "FRONT CAM" },
  left:  { bg: "linear-gradient(135deg, #1e0a2e 0%, #4a155c 100%)", accent: "#c97bff", label: "LEFT CAM"  },
};

const FONT = '"Tazugane Gothic StdN", "MT たづがね角ゴシック StdN", "TazuganeGothicStdN-Medium", "たづがね角ゴシック StdN Medium", "Noto Sans JP", sans-serif';

export const VideoPlaceholder: React.FC<{ segment: SegmentData }> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = ANGLE_STYLE[segment.angle] ?? ANGLE_STYLE.front;
  const currentSec = (frame / fps + segment.startSec).toFixed(1);

  return (
    <AbsoluteFill style={{ background: style.bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ border: `3px solid ${style.accent}`, borderRadius: 12, padding: "10px 36px", color: style.accent, fontFamily: FONT, fontSize: 36, fontWeight: 700, letterSpacing: "0.18em" }}>
        {style.label}
      </div>
      <div style={{ color: "rgba(255,255,255,0.85)", fontFamily: FONT, fontSize: 28, fontWeight: 500, textAlign: "center", lineHeight: 1.8, marginTop: 24 }}>
        <div style={{ opacity: 0.6, fontSize: 22, marginBottom: 4 }}>segment</div>
        <div>{segment.id}</div>
        <div style={{ opacity: 0.6, fontSize: 22, marginTop: 8 }}>
          {segment.startSec}s → {segment.endSec}s &nbsp;|&nbsp; now: {currentSec}s
        </div>
      </div>
      <div style={{ position: "absolute", top: 32, right: 48, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: 22, letterSpacing: "0.1em" }}>
        f:{String(frame).padStart(6, "0")}
      </div>
      <div style={{ position: "absolute", bottom: 32, right: 48, color: "rgba(255,255,255,0.2)", fontFamily: FONT, fontSize: 20, fontWeight: 700, letterSpacing: "0.3em" }}>
        DEMO MODE
      </div>
    </AbsoluteFill>
  );
};

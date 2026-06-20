import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { type SegmentData, type VideoStartTrimSec } from "../schema";
import { DEMO_MODE, VIDEO_SOURCES } from "../videoScript";
import { VideoPlaceholder } from "./VideoPlaceholder";

interface Props {
  segment: SegmentData;
  /** run-config.json 由来の各映像ファイル開始トリム秒数 */
  videoStartTrimSec?: VideoStartTrimSec;
}

export const VideoClip: React.FC<Props> = ({ segment, videoStartTrimSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── ズームスケール ────────────────────────────────────
  let scale = 1;
  if (segment.zoom && segment.zoom.length >= 2) {
    scale = interpolate(
      frame,
      segment.zoom.map((k) => k.frame),
      segment.zoom.map((k) => k.scale),
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  // ── ソース動画の実フレーム位置（本編相対秒 + カメラごとのオフセット）──
  const offset = videoStartTrimSec?.[segment.angle] ?? 0;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <div style={{ width: "100%", height: "100%", transform: `scale(${scale})`, transformOrigin: "center center" }}>
        {DEMO_MODE ? (
          <VideoPlaceholder segment={segment} />
        ) : (
          // ▼ 動画ファイルを差し替えるには videoScript.ts の VIDEO_SOURCES を変更
          // 音声は master.wav を使うため映像はミュート
          <Video
            src={staticFile(VIDEO_SOURCES[segment.angle])}
            trimBefore={Math.round((segment.startSec + offset) * fps)}
            trimAfter={Math.round((segment.endSec + offset) * fps)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 1 }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

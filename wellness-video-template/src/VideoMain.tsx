import { AbsoluteFill, Img, interpolate, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import {
  computeTopicBadgeData,
  getSegmentDurationInFrames,
  type CameraAngle,
  type ScriptData,
} from "./schema";
import { DEMO_MODE, VIDEO_SOURCES } from "./videoScript";
import { VideoClip } from "./components/VideoClip";
import { TelopLayer } from "./components/TelopLayer";
import { GlobalTelopLayer } from "./components/GlobalTelopLayer";
import { NameTagLayer } from "./components/NameTagLayer";
import { TopicBadge } from "./components/TopicBadge";

/**
 * メインコンポジション。
 *
 * レイヤー構成:
 *   1. Audio（master.wav）… 全体を通じて流れる基準音声。最後の2秒でフェードアウト
 *   2. 映像レイヤー       … front / left の2アングルを常時マウント。
 *                           visibility で切り替えるため Video が unmount/remount されず、
 *                           カメラ切り替え時の音飛び・暗転がゼロ。（DEMO_MODE は Series）
 *   3. GlobalTelopLayer … 絶対時間テロップ（Sequence 外で独立管理）
 *   4. TopicBadge       … 右上バッジ
 */
export const VideoMain: React.FC<{ script: ScriptData }> = ({ script }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badgeData = computeTopicBadgeData(script, fps);

  // logotype 開始フレーム（コンテンツ終了点）
  const logotypeStartFrame = Math.round(script.totalDurationSec * fps);
  const isLogotype = frame >= logotypeStartFrame;

  // master.wav のフェードアウト（コンテンツ最後の2秒）
  const masterVolume = interpolate(
    frame,
    [logotypeStartFrame - 2 * fps, logotypeStartFrame],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // logotype フェードイン（1秒）
  const logotypeOpacity = interpolate(
    frame - logotypeStartFrame,
    [0, fps],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: '"Tazugane Gothic StdN", "MT たづがね角ゴシック StdN", "TazuganeGothicStdN-Medium", "たづがね角ゴシック StdN Medium", "Noto Sans JP", sans-serif' }}>
      {/* ── 基準音声 ─────────────────────────────────────────
          映像側の音声はミュートしているため、音はここからのみ流れる。
          DEMO_MODE = true のときはファイルが存在しないためスキップする。 */}
      {!DEMO_MODE && (
        <Audio
          src={staticFile("master.wav")}
          trimBefore={Math.round((script.audioStartTrimSec ?? 0) * fps)}
          volume={masterVolume}
        />
      )}

      {DEMO_MODE ? (
        /* ── DEMO_MODE: Series でプレースホルダー表示（既存ロジック維持）─ */
        <Series>
          {script.segments.map((segment) => (
            <Series.Sequence
              key={segment.id}
              durationInFrames={getSegmentDurationInFrames(segment, fps)}
            >
              <AbsoluteFill>
                <VideoClip segment={segment} videoStartTrimSec={script.videoStartTrimSec} />
                {/* absStartSec がないエントリ（デモデータ等）のみ Sequence 内で表示 */}
                <TelopLayer telops={(script.subtitles[segment.id] ?? []).filter(t => t.absStartSec === undefined)} />
              </AbsoluteFill>
            </Series.Sequence>
          ))}
        </Series>
      ) : (
        /* ── Production: 全アングルを常時マウント、visibility で切り替え ──
           Video コンポーネントが一切 unmount/remount されないため、
           カメラ切り替え時に音飛び・暗転・残像が物理的に発生しない。
           ズームは Sequence 相対フレームではなく絶対フレームで計算する。  */
        <>
          {(["front", "left"] as CameraAngle[]).map((angle) => {
            // このアングルが現在フレームでアクティブなセグメントを探す
            const activeSeg = script.segments.find(
              (seg) =>
                seg.angle === angle &&
                frame >= Math.round(seg.startSec * fps) &&
                frame < Math.round(seg.endSec * fps),
            );
            const visible = activeSeg !== undefined;

            // ズームスケール（絶対フレームからセグメント先頭の相対フレームに変換）
            let scale = 1.2;
            if (activeSeg?.zoom && activeSeg.zoom.length >= 2) {
              const segStartFrame = Math.round(activeSeg.startSec * fps);
              scale = interpolate(
                frame - segStartFrame,
                activeSeg.zoom.map((k) => k.frame),
                activeSeg.zoom.map((k) => k.scale),
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
            }

            // 映像ファイルのカメラごとのオフセット（show time 0 → source 位置）
            const offset = script.videoStartTrimSec?.[angle] ?? 0;

            return (
              <AbsoluteFill
                key={angle}
                style={{ overflow: "hidden", visibility: visible ? "visible" : "hidden" }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: `scale(${scale})`,
                    transformOrigin: "center center",
                  }}
                >
                  <Video
                    src={staticFile(VIDEO_SOURCES[angle])}
                    trimBefore={Math.round(offset * fps)}
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 1 }}
                  />
                </div>
              </AbsoluteFill>
            );
          })}
        </>
      )}

      {/* ── グローバルテロップレイヤー ────────────────────────
          Sequence の外側に配置することで、カメラ切り替えの境界に
          依存せず absStartSec/absEndSec で独立してテロップを制御する。 */}
      <GlobalTelopLayer script={script} />

      {/* ── ネームタグ ───────────────────────────────────── */}
      <NameTagLayer script={script} />

      {/* ── トピックバッジ ────────────────────────────────── */}
      <TopicBadge badgeData={badgeData} />

      {/* ── エンディングロゴタイプ（フェードイン）──────────────── */}
      <Sequence from={logotypeStartFrame}>
        <AbsoluteFill>
          <Video
            src={staticFile("logotype.mp4")}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: logotypeOpacity }}
          />
        </AbsoluteFill>
      </Sequence>

      {/* ── ロゴマーク（左上固定・logotype 中は非表示）──────────── */}
      {!isLogotype && (
        <Img
          src={staticFile("logomark.svg")}
          style={{
            position: "absolute",
            top: 40,
            left: 40,
            height: 80,
            width: "auto",
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

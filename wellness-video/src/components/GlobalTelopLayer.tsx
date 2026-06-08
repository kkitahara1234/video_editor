import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { type ScriptData, type TelopEntryData } from "../schema";


const FONT =
  '"Tazugane Gothic StdN", "MT たづがね角ゴシック StdN", "TazuganeGothicStdN-Medium", "たづがね角ゴシック StdN Medium", "Noto Sans JP", sans-serif';

/**
 * グローバルタイムライン上でテロップを1行表示する。
 *
 * Sequence 内の相対フレームではなくコンポジション全体の絶対フレームで
 * 表示・消失を判定する。Sequence（カメラ切り替え）の境界がテロップ表示に
 * 干渉しない。表示はアニメーションなしで startFrame の瞬間に opacity: 1 で出現。
 *
 * @param entry            テロップデータ（absStartSec/absEndSec を使用）
 * @param audioStartTrimSec  script.audioStartTrimSec（master.wav の頭出し秒数）
 */
const GlobalTelopLine: React.FC<{ entry: TelopEntryData; audioStartTrimSec: number }> = ({
  entry,
  audioStartTrimSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 絶対フレーム計算: (master.wav 絶対時間 - 頭出し秒数) × fps
  // + 6f オフセット（話し始めてから字幕が出るよう一律後ろへ。TelopLine のフェードイン6fと一致）
  const startFrame = Math.round((entry.absStartSec! - audioStartTrimSec) * fps) + (entry.noDelay ? 0 : 6);
  const endFrame   = Math.round((entry.absEndSec!   - audioStartTrimSec) * fps);

  // 表示ウィンドウから遠く離れた期間のみ DOM を生成しない（パフォーマンス最適化）
  // 近傍では visibility で制御し、表示中は同一 DOM 要素を維持し続ける
  if (frame < startFrame - 30 || frame >= endFrame + 30) return null;

  const visible = frame >= startFrame && frame < endFrame;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 72, pointerEvents: "none", visibility: visible ? "visible" : "hidden" }}>
      <div style={{
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
          {entry.text}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/**
 * 全セグメントのテロップを Sequence の外側で一括レンダリングする。
 *
 * absStartSec/absEndSec を持つエントリのみを対象とする。
 * デモデータ（DEMO_SCRIPT）等、旧形式のエントリは TelopLayer（Sequence 内）が担当する。
 */
export const GlobalTelopLayer: React.FC<{ script: ScriptData }> = ({ script }) => {
  const audioStartTrimSec = script.audioStartTrimSec ?? 0;
  const allTelops = script.segments.flatMap(seg =>
    (script.subtitles[seg.id] ?? []).filter(t => t.absStartSec !== undefined),
  );

  return (
    <>
      {allTelops.map((entry, i) => (
        <GlobalTelopLine key={i} entry={entry} audioStartTrimSec={audioStartTrimSec} />
      ))}
    </>
  );
};

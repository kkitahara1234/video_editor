import "./index.css";
import { CalculateMetadataFunction, Composition, staticFile } from "remotion";
import { VideoMain } from "./VideoMain";
import { DEMO_SCRIPT, type ScriptData } from "./schema";
import { FPS, HEIGHT, LOGOTYPE_DURATION_SEC, WIDTH } from "./videoScript";

type Props = { script: ScriptData };

/**
 * calculateMetadata は public/script.json を非同期で読み込み、
 * 動画の尺をその内容に合わせて自動設定します。
 *
 * script.json が存在しない場合は DEMO_SCRIPT にフォールバックします。
 */
const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  abortSignal,
}) => {
  try {
    const res = await fetch(staticFile("script.json"), { signal: abortSignal });
    if (!res.ok) throw new Error(`script.json: HTTP ${res.status}`);
    const script: ScriptData = await res.json();
    return {
      durationInFrames: Math.round((script.totalDurationSec + LOGOTYPE_DURATION_SEC) * FPS),
      props: { script },
    };
  } catch {
    // script.json がない場合は DEMO_SCRIPT を使う
    return {
      durationInFrames: Math.round(DEMO_SCRIPT.totalDurationSec * FPS),
      props: { script: DEMO_SCRIPT },
    };
  }
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WellnessVideo"
      component={VideoMain}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      // durationInFrames は calculateMetadata で上書きされる。
      // ここの値は Studio 初回表示の一瞬だけ使われる。
      durationInFrames={Math.round(DEMO_SCRIPT.totalDurationSec * FPS)}
      defaultProps={{ script: DEMO_SCRIPT }}
      calculateMetadata={calculateMetadata}
    />
  );
};

import { AbsoluteFill, Audio, Img, Video, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { Telop } from './components/Telop';
import { VerticalCrop } from './components/VerticalCrop';
import { theme } from './theme';
import type { ShortClipProps, CameraSwitchData } from './types';

/**
 * 対談用 ShortClip
 * cameraSwitches の host/guest に応じて映像を瞬時切替。
 * 両映像を常時ロードし、opacity で表示/非表示を切替える（Sequence 再ロードのカクつき解消）。
 */
export const ShortClip: React.FC<ShortClipProps> = ({
  shortId,
  startSec,
  telops,
  cameraSwitches = [],
  cropOffsets,
  sourceDir,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentSec = frame / fps;

  // 現在のカメラを判定
  let activeCamera = 'host';
  for (const cs of cameraSwitches) {
    if (cs.atSec <= currentSec) activeCamera = cs.camera;
    else break;
  }

  // テロップ表示フラグ（false でテロップ非表示、true で表示）
  const SHOW_TELOP = false;

  // テロップ最小表示時間保証
  const MIN_DISPLAY_SEC = 0.7;
  const adjustedTelops = telops.map((t, i) => {
    const minEnd = t.startSec + MIN_DISPLAY_SEC;
    const nextStart = i + 1 < telops.length ? telops[i + 1].startSec : Infinity;
    const adjustedEnd = Math.min(Math.max(t.endSec, minEnd), nextStart);
    return { ...t, endSec: adjustedEnd };
  });

  // 使用するカメラの種類を特定（素材が存在するもののみレンダリング）
  const usedCameras = new Set(cameraSwitches.map(cs => cs.camera));
  if (usedCameras.size === 0) usedCameras.add('host');
  const cameras = Array.from(usedCameras);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.black }}>
      <Audio src={staticFile(`${shortId}-master.wav`)} startFrom={0} />

      {cameras.map((cam) => {
        const config = cam === 'guest' ? theme.camera.guest : theme.camera.host;
        const src = staticFile(`${shortId}-${cam}.mp4`);
        const isActive = activeCamera === cam;
        return (
          <AbsoluteFill
            key={cam}
            style={{
              opacity: isActive ? 1 : 0,
              pointerEvents: isActive ? 'auto' : 'none',
            }}
          >
            <VerticalCrop offsetX={config.x} offsetY={config.y}>
              <Video
                src={src}
                startFrom={0}
                muted
                style={{
                  transform: config.transform,
                  transformOrigin: config.transformOrigin,
                }}
              />
            </VerticalCrop>
          </AbsoluteFill>
        );
      })}

      {SHOW_TELOP && <Telop telops={adjustedTelops} currentSec={currentSec} />}

      <Img
        src={staticFile('logomark.svg')}
        style={{
          position: 'absolute',
          top: theme.logo.top,
          left: theme.logo.left,
          height: theme.logo.height,
          width: 'auto',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

import { AbsoluteFill, Audio, Img, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { Telop } from './components/Telop';
import { CameraFront } from './components/CameraFront';
import { theme } from './theme';
import type { ShortClipProps } from './types';

export const ShortClip: React.FC<ShortClipProps> = ({
  shortId,
  startSec,
  telops,
  cropOffsets,
  sourceDir,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.black }}>
      <Audio src={staticFile(`${shortId}-master.wav`)} startFrom={0} />
      <CameraFront shortId={shortId} cropOffsets={cropOffsets} />
      <Telop telops={telops} currentSec={currentSec} />
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

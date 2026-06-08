import { AbsoluteFill, Video, staticFile } from 'remotion';
import { VerticalCrop } from './VerticalCrop';
import { theme } from '../theme';

type Props = {
  shortId: string;
  cropOffsets: { front: { x: number; y: number } };
};

export const CameraFront: React.FC<Props> = ({ shortId, cropOffsets }) => {
  const offset = { x: theme.camera.front.x, y: theme.camera.front.y };
  const src = staticFile(`${shortId}-front.mp4`);

  return (
    <AbsoluteFill>
      <VerticalCrop offsetX={offset.x} offsetY={offset.y}>
        <Video src={src} startFrom={0} muted style={{
          transform: theme.camera.front.transform,
          transformOrigin: theme.camera.front.transformOrigin,
        }} />
      </VerticalCrop>
    </AbsoluteFill>
  );
};

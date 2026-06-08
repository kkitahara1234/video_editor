import { AbsoluteFill, Video, staticFile } from 'remotion';
import { VerticalCrop } from './VerticalCrop';
import { theme } from '../theme';
import type { CameraType, CropOffsets, TalkType } from '../types';

type Props = {
  currentCamera: CameraType;
  shortId: string;
  sourceDir: string;
  cropOffsets: CropOffsets;
  startFrom: number;
  talkType?: TalkType;
};

export const CameraSwitch: React.FC<Props> = ({ currentCamera, shortId, sourceDir, cropOffsets, startFrom, talkType = 'dialogue' }) => {
  const offset = theme.camera.leftRight;

  const frontStyle = {
    transform: theme.camera.front.transform,
    transformOrigin: theme.camera.front.transformOrigin,
  };

  if (talkType === 'monologue') {
    const src = staticFile(`${shortId}-${currentCamera}.mp4`);
    const style = currentCamera === 'front' ? frontStyle : {};

    return (
      <AbsoluteFill>
        <VerticalCrop offsetX={offset.x} offsetY={offset.y}>
          <Video src={src} startFrom={0} muted style={style} />
        </VerticalCrop>
      </AbsoluteFill>
    );
  }

  // 対談: left/right 両方マウント、display で切替（既存設計維持）
  const leftSrc = staticFile(`${shortId}-left.mp4`);
  const rightSrc = staticFile(`${shortId}-right.mp4`);
  const isLeft = currentCamera === 'left';

  return (
    <AbsoluteFill>
      <VerticalCrop offsetX={offset.x} offsetY={offset.y}>
        <Video src={leftSrc} startFrom={0} muted style={{ display: isLeft ? 'block' : 'none' }} />
        <Video src={rightSrc} startFrom={0} muted style={{ display: isLeft ? 'none' : 'block' }} />
      </VerticalCrop>
    </AbsoluteFill>
  );
};

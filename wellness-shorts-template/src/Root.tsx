import { Composition } from 'remotion';
import { ShortClip } from './ShortClip';
import scriptData from '../../wellness-video/shorts/data/scripts/script-short-001.json';
import projectConfig from '../../wellness-video/shorts/project.json';

const defaultSourceDir = '/Volumes/編集用/wellness-video/public';

const durationInFrames = Math.ceil((scriptData.endSec - scriptData.startSec) * 30);

const defaultProps = {
  shortId: scriptData.shortId,
  startSec: scriptData.startSec,
  telops: scriptData.telops,
  cropOffsets: projectConfig.cropOffsets,
  sourceDir: defaultSourceDir,
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ShortClip"
        component={ShortClip}
        durationInFrames={durationInFrames}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
    </>
  );
};

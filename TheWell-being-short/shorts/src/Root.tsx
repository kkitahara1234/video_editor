import { Composition } from 'remotion';
import { ShortClip } from './ShortClip';
import script001 from '../data/scripts/script-short-001.json';
import script002 from '../data/scripts/script-short-002.json';
import projectConfig from '../project.json';

const defaultSourceDir = '/Volumes/編集用/TheWell-being-short/public';

const scripts: Record<string, typeof script001> = {
  'short-001': script001,
  'short-002': script002,
};

const entries = Object.entries(scripts);

export const Root: React.FC = () => {
  return (
    <>
      {entries.map(([shortId, script]) => (
        <Composition
          key={shortId}
          id={shortId}
          component={ShortClip}
          durationInFrames={Math.ceil((script.endSec - script.startSec) * 30)}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            shortId,
            startSec: script.startSec,
            telops: script.telops,
            cameraSwitches: script.cameraSwitches,
            cropOffsets: projectConfig.cropOffsets,
            sourceDir: defaultSourceDir,
          }}
        />
      ))}
    </>
  );
};

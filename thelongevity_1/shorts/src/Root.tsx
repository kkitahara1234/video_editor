import { Composition } from 'remotion';
import { ShortClip } from './ShortClip';
import script001 from '../data/scripts/script-short-001.json';
import script002 from '../data/scripts/script-short-002.json';
import script003 from '../data/scripts/script-short-003.json';
import projectConfig from '../project.json';
import type { ShortClipProps } from './types';

const defaultSourceDir = '/Volumes/編集用/thelongevity_1/public';

const scripts: Record<string, typeof script001> = {
  'short-001': script001,
  'short-002': script002,
  'short-003': script003,
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ShortClip"
        component={ShortClip}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          shortId: 'short-001',
          startSec: script001.startSec,
          telops: script001.telops,
          cropOffsets: projectConfig.cropOffsets,
          sourceDir: defaultSourceDir,
        }}
        calculateMetadata={({ props }) => {
          const s = scripts[props.shortId] ?? script001;
          return {
            durationInFrames: Math.ceil((s.endSec - s.startSec) * 30),
            props: {
              ...props,
              startSec: s.startSec,
              telops: s.telops,
            },
          };
        }}
      />
    </>
  );
};

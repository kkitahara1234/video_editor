// ── 共通型: src/types.ts を正典とし re-export ──
export type { TelopEmphasis, CropOffsets } from '../../src/types';
export type { TelopData as Telop } from '../../src/types';
export type { CameraType as Camera } from '../../src/types';
export type { CameraSwitchData as CameraSwitch } from '../../src/types';

// ── lib 専用型 ──

export type ShortScript = {
  shortId: string;
  title: string;
  startSec: number;
  endSec: number;
  telops: import('../../src/types').TelopData[];
  cameraSwitches: import('../../src/types').CameraSwitchData[];
};

export type ProjectConfig = {
  projectName: string;
  sourceDir: string;
  workDir: string;
  outputDir: string;
  mode: 'solo' | 'dialogue';
  shortsCount: { perMinutes: number; minPer: number; maxPer: number };
  scoreThreshold: number;
  duration: { min: number; max: number };
  video: { width: number; height: number; fps: number };
  cameraSwitch: {
    minInterval: number;
    maxInterval: number;
    boundaryGapSec: number;
    firstSwitchWithinSec: number;
  };
  cropOffsets: {
    front: { x: number; y: number };
    left: { x: number; y: number };
    right: { x: number; y: number };
  };
  telop: {
    fontSize: number;
    emphasisFontSize: number;
    maxChars: number;
    fontFamily: string;
    color: string;
    backgroundColor: string;
    positionFromBottom: number;
    minEmphasisCount: number;
    maxEmphasisCount: number;
  };
  animations: {
    telop: any;
    emphasis: any;
    firstTelop: any;
  };
  gpt: {
    model: string;
    maxTokensPerCall: number;
    temperature: number;
  };
  sharedDictionary: string;
  xlsxPath: string;
};

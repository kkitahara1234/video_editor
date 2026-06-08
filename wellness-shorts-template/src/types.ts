export type TelopEmphasis = { start: number; end: number; label?: string };

export type TelopData = {
  text: string;
  startSec: number;
  endSec: number;
  emphasis?: TelopEmphasis[];
};

export type CameraType = 'left' | 'right' | 'front';

export type CameraSwitchData = {
  atSec: number;
  camera: CameraType;
};

export type CropOffsets = {
  front: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
};

export type TalkType = 'monologue' | 'dialogue';

export type ShortClipProps = {
  shortId: string;
  startSec: number;
  telops: TelopData[];
  cameraSwitches?: CameraSwitchData[];
  cropOffsets: CropOffsets;
  sourceDir: string;
  talkType?: TalkType;
};

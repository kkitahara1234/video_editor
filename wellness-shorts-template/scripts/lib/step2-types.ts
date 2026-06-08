export type TelopEmphasis = {
  start: number;
  end: number;
  label: string;
};

export type RefinedTelop = {
  text: string;
  startSec: number;
  endSec: number;
  emphasis: TelopEmphasis[];
};

export type HookFirstTelop = {
  text: string;
  sourceIdx: number;
};

export type DetailedCandidate = {
  shortId: string;
  topicId: string;
  label: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  title: string;
  reason: string;
  hookFirstTelop: HookFirstTelop;
  telops: RefinedTelop[];
  totalEmphasis: number;
};

export type EmphasisCacheEntry = {
  shortId: string;
  telopTexts: string[];
  emphasisData: Array<Array<{ start: number; end: number; label: string }>>;
};

export type EmphasisCache = {
  version: string;
  createdAt: string;
  lastUpdated: string;
  entries: EmphasisCacheEntry[];
};

export type CandidatesJson = {
  generatedAt: string;
  projectName: string;
  scoringJsonPath: string;
  totalCandidates: number;
  candidates: DetailedCandidate[];
  errors: Array<{ shortId: string; message: string }>;
};

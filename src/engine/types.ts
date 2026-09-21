export type LayoutMode = 'grid' | 'row' | 'column';

export type Geometry = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type PathStep = {
  id: string;
  duration_ms?: number;
};

export type FrameIR = {
  id: string;
  layout: LayoutMode | string;
  children: string[];
  geometry?: Geometry;
  markdown: string;
  raw: Record<string, unknown>;
};

export type DeckIR = {
  slug: string;
  title: string;
  lang: string;
  theme: string;
  root: string;
  camera: { duration_ms: number };
  video: { hold_ms: number };
  path: PathStep[];
  frames: Record<string, FrameIR>;
  deckDir: string;
  rawManifest: Record<string, unknown>;
};

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type LayoutMap = Record<string, Rect>;

export type Issue = {
  code: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
};

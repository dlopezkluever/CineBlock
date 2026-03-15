// --- Aspect Ratio ---

export type AspectRatioKey = '16:9' | '2.39:1' | '4:3' | '9:16';
export const ASPECT_RATIOS: Record<AspectRatioKey, number> = {
  '16:9': 16 / 9,
  '2.39:1': 2.39,
  '4:3': 4 / 3,
  '9:16': 9 / 16,
};

export interface CineBlockState {
  currentView: 'setup' | 'studio' | 'results';

  // Setup data
  locationImages: AzimuthSlot[];
  assets: CineBlockAsset[];
  shots: CineBlockShot[];
  aspectRatio: AspectRatioKey;

  // Marble world
  worldId: string | null;
  worldStatus: 'idle' | 'uploading' | 'generating' | 'polling' | 'ready' | 'error';
  worldError: string | null;
  spzUrl: string | null;
  colliderUrl: string | null;

  // Studio state
  activeShotIndex: number;
  activeFrameType: 'start' | 'end';
  assetVisibility: Record<string, boolean>;
  mannequinPlacements: MannequinPlacement[];
  captures: CaptureEntry[];
}

export interface AzimuthSlot {
  azimuth: 0 | 90 | 180 | 270;
  label: string;
  file: File | null;
  previewUrl: string | null;
  mediaAssetId: string | null;
}

export interface CineBlockAsset {
  id: string;
  name: string;
  type: 'character' | 'prop';
  description: string;
  color: string;
}

export interface CineBlockShot {
  id: string;
  name: string;
  action: string;
  cameraType: 'Wide' | 'Medium' | 'Close-Up' | 'OTS' | 'POV' | 'Two-Shot' | 'Insert';
  assetIds: string[];
  duration: number;
  cameraDistance?: 'wide' | 'medium' | 'close';
  cameraHeight?: 'eye_level' | 'high_angle' | 'low_angle' | 'overhead' | 'ground_level';
  cameraMovement?: string;
}

export interface MannequinPlacement {
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  shotId: string;
}

export interface CaptureEntry {
  id: string;
  shotId: string;
  frameType: 'start' | 'end';
  dataUrl: string;
  isHero: boolean;
  capturedAt: string;
}

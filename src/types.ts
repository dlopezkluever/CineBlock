// --- Aspect Ratio ---

export type AspectRatioKey = '16:9' | '2.39:1' | '4:3' | '9:16';
export const ASPECT_RATIOS: Record<AspectRatioKey, number> = {
  '16:9': 16 / 9,
  '2.39:1': 2.39,
  '4:3': 4 / 3,
  '9:16': 9 / 16,
};

export type InputMode = 'guided' | 'free' | 'text' | 'video' | 'single';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface FreeImageSlot {
  id: string;
  file: File;
  previewUrl: string;
  dimensions?: ImageDimensions;
}

export interface VideoSlot {
  file: File;
  previewUrl: string;
  sizeBytes: number;
  format: string;
}

export interface SingleImageSlot {
  file: File;
  previewUrl: string;
  dimensions?: ImageDimensions;
}

export interface GenerationSettings {
  model: 'Marble 0.1-mini' | 'Marble 0.1-plus';
  splatResolution: '100k' | '500k' | 'full_res';
  seed?: number;
}

export interface CineBlockState {
  currentView: 'setup' | 'studio' | 'results';

  // Setup data
  locationImages: AzimuthSlot[];
  assets: CineBlockAsset[];
  shots: CineBlockShot[];
  aspectRatio: AspectRatioKey;

  // Input mode & generation
  inputMode: InputMode;
  freeImages: FreeImageSlot[];
  sceneDescription: string;
  generationSettings: GenerationSettings;
  videoFile: VideoSlot | null;
  singleImage: SingleImageSlot | null;

  // Marble world
  worldId: string | null;
  worldStatus: 'idle' | 'uploading' | 'generating' | 'polling' | 'ready' | 'error';
  worldError: string | null;
  spzUrl: string | null;
  colliderUrl: string | null;
  worldMarbleUrl: string | null;

  // Studio state
  activeShotIndex: number;
  activeFrameType: 'start' | 'end';
  assetVisibility: Record<string, boolean>;
  mannequinPlacements: MannequinPlacement[];
  lightPlacements: LightPlacement[];
  sceneLighting: SceneLighting;
  lightingModeEnabled: boolean;
  captures: CaptureEntry[];
  rollAngle: number; // degrees, default 0
  mannequinOcclusion: boolean;
}

export interface AzimuthSlot {
  azimuth: 0 | 90 | 180 | 270;
  label: string;
  file: File | null;
  previewUrl: string | null;
  mediaAssetId: string | null;
  dimensions?: ImageDimensions;
}

export interface CineBlockAsset {
  id: string;
  name: string;
  type: 'character' | 'prop';
  shape?: PropShape;
  description: string;
  color: string;
}

export type PropShape = 'box' | 'cylinder' | 'sphere' | 'cone' | 'plane' | 'capsule' | 'dog' | 'cat';

export const PROP_SHAPES: { value: PropShape; label: string }[] = [
  { value: 'box', label: 'Box' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'sphere', label: 'Sphere' },
  { value: 'cone', label: 'Cone' },
  { value: 'plane', label: 'Plane' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
];

export const PROP_SHAPE_DEFAULTS: Record<PropShape, [number, number, number]> = {
  box:      [1, 1, 1],
  cylinder: [0.8, 1.5, 0.8],
  sphere:   [1, 1, 1],
  cone:     [0.8, 1.5, 0.8],
  plane:    [2.5, 0.05, 2.5],
  capsule:  [0.5, 1.8, 0.5],
  dog:      [1.2, 0.9, 0.6],
  cat:      [0.9, 0.7, 0.5],
};

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

// --- Mannequin Pose & Body ---

export interface MannequinPose {
  leftShoulder: [number, number, number];
  leftElbow: number;
  rightShoulder: [number, number, number];
  rightElbow: number;
  leftHip: [number, number, number];
  leftKnee: number;
  rightHip: [number, number, number];
  rightKnee: number;
}

export interface MannequinBodyParams {
  height: number;
  build: number;
}

export const DEFAULT_POSE: MannequinPose = {
  leftShoulder: [0, 0, -0.2],
  leftElbow: 0.3,
  rightShoulder: [0, 0, 0.2],
  rightElbow: 0.3,
  leftHip: [0, 0, 0],
  leftKnee: 0,
  rightHip: [0, 0, 0],
  rightKnee: 0,
};

export const DEFAULT_BODY_PARAMS: MannequinBodyParams = {
  height: 1.7,
  build: 1.0,
};

// --- Lighting ---

export type LightType = 'point' | 'spot';

export interface LightPlacement {
  id: string;
  shotId: string;
  lightType: LightType;
  position: [number, number, number];
  rotation: [number, number, number];
  kelvin: number;
  tintColor: string;
  intensity: number;
  distance: number;
  coneAngle: number;
  penumbra: number;
}

export interface SceneLighting {
  ambientIntensity: number;
  directionalIntensity: number;
}

export const DEFAULT_SCENE_LIGHTING: SceneLighting = {
  ambientIntensity: 0.5,
  directionalIntensity: 1.0,
};

export const DEFAULT_LIGHT: Omit<LightPlacement, 'id' | 'shotId'> = {
  lightType: 'spot',
  position: [0, 2, 0],
  rotation: [-Math.PI / 2, 0, 0],
  kelvin: 5500,
  tintColor: '#ffffff',
  intensity: 1.0,
  distance: 10,
  coneAngle: Math.PI / 6,
  penumbra: 0.5,
};

export interface MannequinPlacement {
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  shotId: string;
  pose?: MannequinPose;
  bodyParams?: MannequinBodyParams;
}

export interface CaptureEntry {
  id: string;
  shotId: string;
  frameType: 'start' | 'end';
  dataUrl: string;
  isHero: boolean;
  capturedAt: string;
  rollAngle: number; // degrees at time of capture
}

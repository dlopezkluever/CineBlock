import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { CineBlockState, AzimuthSlot } from './types';

// --- Actions ---

export type Action =
  | { type: 'NAVIGATE'; view: CineBlockState['currentView'] }
  | { type: 'SET_AZIMUTH_SLOT'; azimuth: AzimuthSlot['azimuth']; file: File; previewUrl: string }
  | { type: 'CLEAR_AZIMUTH_SLOT'; azimuth: AzimuthSlot['azimuth'] }
  | { type: 'ADD_ASSET'; id: string; name: string; assetType: 'character' | 'prop'; description: string; color: string }
  | { type: 'REMOVE_ASSET'; id: string }
  | { type: 'UPDATE_ASSET'; id: string; field: string; value: string }
  | { type: 'ADD_SHOT'; id: string; name: string }
  | { type: 'REMOVE_SHOT'; id: string }
  | { type: 'UPDATE_SHOT'; id: string; field: string; value: unknown }
  | { type: 'SET_WORLD_STATUS'; status: CineBlockState['worldStatus']; error?: string }
  | { type: 'SET_WORLD_DATA'; worldId: string; spzUrl: string; colliderUrl: string }
  | { type: 'SET_ACTIVE_SHOT'; index: number }
  | { type: 'SET_FRAME_TYPE'; frameType: 'start' | 'end' }
  | { type: 'TOGGLE_ASSET_VISIBILITY'; assetId: string }
  | { type: 'ADD_CAPTURE'; capture: CineBlockState['captures'][number] }
  | { type: 'TOGGLE_HERO'; captureId: string }
  | { type: 'RESET' };

// --- Initial State ---

const initialLocationImages: AzimuthSlot[] = [
  { azimuth: 0, label: 'Front', file: null, previewUrl: null, mediaAssetId: null },
  { azimuth: 90, label: 'Right', file: null, previewUrl: null, mediaAssetId: null },
  { azimuth: 180, label: 'Back', file: null, previewUrl: null, mediaAssetId: null },
  { azimuth: 270, label: 'Left', file: null, previewUrl: null, mediaAssetId: null },
];

export const initialState: CineBlockState = {
  currentView: 'setup',
  locationImages: initialLocationImages,
  assets: [],
  shots: [],
  worldId: null,
  worldStatus: 'idle',
  worldError: null,
  spzUrl: null,
  colliderUrl: null,
  activeShotIndex: 0,
  activeFrameType: 'start',
  assetVisibility: {},
  mannequinPlacements: [],
  captures: [],
};

// --- Reducer ---

export function reducer(state: CineBlockState, action: Action): CineBlockState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, currentView: action.view };

    case 'SET_AZIMUTH_SLOT':
      return {
        ...state,
        locationImages: state.locationImages.map((slot) =>
          slot.azimuth === action.azimuth
            ? { ...slot, file: action.file, previewUrl: action.previewUrl }
            : slot
        ),
      };

    case 'CLEAR_AZIMUTH_SLOT':
      return {
        ...state,
        locationImages: state.locationImages.map((slot) =>
          slot.azimuth === action.azimuth
            ? { ...slot, file: null, previewUrl: null, mediaAssetId: null }
            : slot
        ),
      };

    case 'ADD_ASSET':
      return {
        ...state,
        assets: [
          ...state.assets,
          { id: action.id, name: action.name, type: action.assetType, description: action.description, color: action.color },
        ],
      };

    case 'REMOVE_ASSET':
      return {
        ...state,
        assets: state.assets.filter((a) => a.id !== action.id),
        shots: state.shots.map((s) => ({
          ...s,
          assetIds: s.assetIds.filter((id) => id !== action.id),
        })),
      };

    case 'UPDATE_ASSET':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.id ? { ...a, [action.field]: action.value } : a
        ),
      };

    case 'ADD_SHOT':
      return {
        ...state,
        shots: [
          ...state.shots,
          {
            id: action.id,
            name: action.name,
            action: '',
            cameraType: 'Wide',
            assetIds: [],
            duration: 8,
          },
        ],
      };

    case 'REMOVE_SHOT':
      return {
        ...state,
        shots: state.shots.filter((s) => s.id !== action.id),
      };

    case 'UPDATE_SHOT':
      return {
        ...state,
        shots: state.shots.map((s) =>
          s.id === action.id ? { ...s, [action.field]: action.value } : s
        ),
      };

    case 'SET_WORLD_STATUS':
      return {
        ...state,
        worldStatus: action.status,
        worldError: action.error ?? null,
      };

    case 'SET_WORLD_DATA':
      return {
        ...state,
        worldId: action.worldId,
        spzUrl: action.spzUrl,
        colliderUrl: action.colliderUrl,
        worldStatus: 'ready',
      };

    case 'SET_ACTIVE_SHOT':
      return { ...state, activeShotIndex: action.index };

    case 'SET_FRAME_TYPE':
      return { ...state, activeFrameType: action.frameType };

    case 'TOGGLE_ASSET_VISIBILITY':
      return {
        ...state,
        assetVisibility: {
          ...state.assetVisibility,
          [action.assetId]: !state.assetVisibility[action.assetId],
        },
      };

    case 'ADD_CAPTURE':
      return { ...state, captures: [...state.captures, action.capture] };

    case 'TOGGLE_HERO': {
      const target = state.captures.find((c) => c.id === action.captureId);
      if (!target) return state;
      return {
        ...state,
        captures: state.captures.map((c) => {
          if (c.shotId === target.shotId && c.frameType === target.frameType) {
            return { ...c, isHero: c.id === action.captureId };
          }
          return c;
        }),
      };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// --- Context ---

const StateContext = createContext<CineBlockState>(initialState);
const DispatchContext = createContext<Dispatch<Action>>(() => {});

export function CineBlockProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useCineBlockState() {
  return useContext(StateContext);
}

export function useCineBlockDispatch() {
  return useContext(DispatchContext);
}

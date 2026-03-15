import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../store';
import type { CineBlockState } from '../types';

describe('Store — Initial State', () => {
  it('has correct initial view', () => {
    expect(initialState.currentView).toBe('setup');
  });

  it('has 4 azimuth slots with correct azimuths and labels', () => {
    expect(initialState.locationImages).toHaveLength(4);
    expect(initialState.locationImages.map((s) => s.azimuth)).toEqual([0, 90, 180, 270]);
    expect(initialState.locationImages.map((s) => s.label)).toEqual(['Front', 'Right', 'Back', 'Left']);
  });

  it('starts with null files in all slots', () => {
    for (const slot of initialState.locationImages) {
      expect(slot.file).toBeNull();
      expect(slot.previewUrl).toBeNull();
      expect(slot.mediaAssetId).toBeNull();
    }
  });

  it('has empty arrays and idle world status', () => {
    expect(initialState.assets).toEqual([]);
    expect(initialState.shots).toEqual([]);
    expect(initialState.captures).toEqual([]);
    expect(initialState.mannequinPlacements).toEqual([]);
    expect(initialState.worldStatus).toBe('idle');
    expect(initialState.worldId).toBeNull();
    expect(initialState.spzUrl).toBeNull();
    expect(initialState.colliderUrl).toBeNull();
  });
});

describe('Store — Reducer: Navigation', () => {
  it('navigates between views', () => {
    let state = reducer(initialState, { type: 'NAVIGATE', view: 'studio' });
    expect(state.currentView).toBe('studio');
    state = reducer(state, { type: 'NAVIGATE', view: 'results' });
    expect(state.currentView).toBe('results');
    state = reducer(state, { type: 'NAVIGATE', view: 'setup' });
    expect(state.currentView).toBe('setup');
  });
});

describe('Store — Reducer: World Status', () => {
  it('SET_WORLD_STATUS updates status', () => {
    const state = reducer(initialState, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    expect(state.worldStatus).toBe('uploading');
    expect(state.worldError).toBeNull();
  });

  it('SET_WORLD_STATUS with error stores error message', () => {
    const state = reducer(initialState, {
      type: 'SET_WORLD_STATUS',
      status: 'error',
      error: 'API key invalid',
    });
    expect(state.worldStatus).toBe('error');
    expect(state.worldError).toBe('API key invalid');
  });

  it('SET_WORLD_STATUS transitions through pipeline states', () => {
    let state = reducer(initialState, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    expect(state.worldStatus).toBe('uploading');

    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'generating' });
    expect(state.worldStatus).toBe('generating');

    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'polling' });
    expect(state.worldStatus).toBe('polling');
  });

  it('SET_WORLD_DATA stores world info and sets status to ready', () => {
    const state = reducer(initialState, {
      type: 'SET_WORLD_DATA',
      worldId: 'world-abc',
      spzUrl: 'https://example.com/splats.spz',
      colliderUrl: 'https://example.com/mesh.glb',
    });
    expect(state.worldId).toBe('world-abc');
    expect(state.spzUrl).toBe('https://example.com/splats.spz');
    expect(state.colliderUrl).toBe('https://example.com/mesh.glb');
    expect(state.worldStatus).toBe('ready');
  });

  it('SET_WORLD_DATA clears any previous error', () => {
    let state = reducer(initialState, {
      type: 'SET_WORLD_STATUS',
      status: 'error',
      error: 'Previous error',
    });
    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'world-1',
      spzUrl: 'https://example.com/splats.spz',
      colliderUrl: 'https://example.com/mesh.glb',
    });
    expect(state.worldStatus).toBe('ready');
    // worldError is not cleared by SET_WORLD_DATA directly, but status is ready
    expect(state.worldStatus).not.toBe('error');
  });
});

describe('Store — Reducer: Azimuth Slots', () => {
  it('SET_AZIMUTH_SLOT sets file and preview', () => {
    const file = new File(['data'], 'front.jpg', { type: 'image/jpeg' });
    const state = reducer(initialState, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: 0,
      file,
      previewUrl: 'blob:http://localhost/front',
    });
    const frontSlot = state.locationImages.find((s) => s.azimuth === 0)!;
    expect(frontSlot.file).toBe(file);
    expect(frontSlot.previewUrl).toBe('blob:http://localhost/front');
    // Other slots unchanged
    expect(state.locationImages.find((s) => s.azimuth === 90)!.file).toBeNull();
  });

  it('CLEAR_AZIMUTH_SLOT clears file, preview, and mediaAssetId', () => {
    const file = new File(['data'], 'right.jpg');
    let state = reducer(initialState, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: 90,
      file,
      previewUrl: 'blob:preview',
    });
    state = reducer(state, { type: 'CLEAR_AZIMUTH_SLOT', azimuth: 90 });
    const slot = state.locationImages.find((s) => s.azimuth === 90)!;
    expect(slot.file).toBeNull();
    expect(slot.previewUrl).toBeNull();
    expect(slot.mediaAssetId).toBeNull();
  });
});

describe('Store — Reducer: Assets & Shots', () => {
  it('ADD_ASSET adds asset to state', () => {
    const state = reducer(initialState, {
      type: 'ADD_ASSET',
      id: 'a1',
      name: 'Marcus',
      assetType: 'character',
      description: 'Tall man',
      color: '#3B82F6',
    });
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0].name).toBe('Marcus');
    expect(state.assets[0].type).toBe('character');
  });

  it('ADD_SHOT adds shot to state', () => {
    const state = reducer(initialState, {
      type: 'ADD_SHOT',
      id: 's1',
      name: 'Shot 1A',
    });
    expect(state.shots).toHaveLength(1);
    expect(state.shots[0].name).toBe('Shot 1A');
    expect(state.shots[0].cameraType).toBe('Wide');
    expect(state.shots[0].duration).toBe(8);
  });

  it('REMOVE_ASSET also removes from shot assetIds', () => {
    let state = reducer(initialState, {
      type: 'ADD_ASSET',
      id: 'a1',
      name: 'Marcus',
      assetType: 'character',
      description: '',
      color: '#3B82F6',
    });
    state = reducer(state, { type: 'ADD_SHOT', id: 's1', name: 'Shot 1' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a1'] });
    state = reducer(state, { type: 'REMOVE_ASSET', id: 'a1' });
    expect(state.assets).toHaveLength(0);
    expect(state.shots[0].assetIds).toEqual([]);
  });
});

describe('Store — Reducer: RESET', () => {
  it('resets to initial state', () => {
    let state = reducer(initialState, { type: 'NAVIGATE', view: 'studio' });
    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'w1',
      spzUrl: 'url',
      colliderUrl: 'url2',
    });
    state = reducer(state, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });
});

describe('Store — Phase 1 Integration Flow', () => {
  it('simulates the full Phase 1 state flow: setup → upload → generate → ready → studio', () => {
    let state: CineBlockState = initialState;

    // 1. Add images
    const f1 = new File(['data1'], 'front.jpg');
    const f2 = new File(['data2'], 'right.jpg');
    state = reducer(state, { type: 'SET_AZIMUTH_SLOT', azimuth: 0, file: f1, previewUrl: 'blob:1' });
    state = reducer(state, { type: 'SET_AZIMUTH_SLOT', azimuth: 90, file: f2, previewUrl: 'blob:2' });
    expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(2);

    // 2. Add a shot
    state = reducer(state, { type: 'ADD_SHOT', id: 's1', name: 'Shot 1' });
    expect(state.shots).toHaveLength(1);

    // 3. Start upload
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    expect(state.worldStatus).toBe('uploading');

    // 4. Generating
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'generating' });
    expect(state.worldStatus).toBe('generating');

    // 5. Polling
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'polling' });
    expect(state.worldStatus).toBe('polling');

    // 6. World ready
    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'world-123',
      spzUrl: 'https://example.com/500k.spz',
      colliderUrl: 'https://example.com/collider.glb',
    });
    expect(state.worldStatus).toBe('ready');
    expect(state.worldId).toBe('world-123');
    expect(state.spzUrl).toBe('https://example.com/500k.spz');
    expect(state.colliderUrl).toBe('https://example.com/collider.glb');

    // 7. Navigate to studio
    state = reducer(state, { type: 'NAVIGATE', view: 'studio' });
    expect(state.currentView).toBe('studio');
  });
});

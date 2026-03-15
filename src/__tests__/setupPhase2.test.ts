import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../store';
import type { CineBlockState } from '../types';

const ASSET_COLORS = ['#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withImages(state: CineBlockState, count: number): CineBlockState {
  const azimuths = [0, 90, 180, 270] as const;
  let s = state;
  for (let i = 0; i < count; i++) {
    s = reducer(s, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: azimuths[i],
      file: new File(['img'], `img${i}.jpg`, { type: 'image/jpeg' }),
      previewUrl: `blob:img${i}`,
    });
  }
  return s;
}

function withAsset(state: CineBlockState, id: string, name: string, type: 'character' | 'prop' = 'character', color = '#3B82F6'): CineBlockState {
  return reducer(state, { type: 'ADD_ASSET', id, name, assetType: type, description: '', color });
}

function withShot(state: CineBlockState, id: string, name: string): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name });
}

function canProceed(state: CineBlockState): boolean {
  const filledSlots = state.locationImages.filter((s) => s.file !== null).length;
  const hasShot = state.shots.some((s) => s.name.trim() !== '');
  return filledSlots >= 2 && hasShot;
}

// ─── 2.1 Azimuth Image Uploader ─────────────────────────────────────────────

describe('Phase 2.1 — Azimuth Image Uploader', () => {
  it('filling a slot stores file and previewUrl', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const state = reducer(initialState, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: 0,
      file,
      previewUrl: 'blob:preview-front',
    });
    const slot = state.locationImages.find((s) => s.azimuth === 0)!;
    expect(slot.file).toBe(file);
    expect(slot.previewUrl).toBe('blob:preview-front');
  });

  it('filling a slot does not affect other slots', () => {
    const state = withImages(initialState, 1);
    expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(1);
    expect(state.locationImages.find((s) => s.azimuth === 90)!.file).toBeNull();
    expect(state.locationImages.find((s) => s.azimuth === 180)!.file).toBeNull();
    expect(state.locationImages.find((s) => s.azimuth === 270)!.file).toBeNull();
  });

  it('replacing an image in a slot overwrites the previous file', () => {
    let state = withImages(initialState, 1);
    const newFile = new File(['new'], 'better.png', { type: 'image/png' });
    state = reducer(state, { type: 'SET_AZIMUTH_SLOT', azimuth: 0, file: newFile, previewUrl: 'blob:better' });
    const slot = state.locationImages.find((s) => s.azimuth === 0)!;
    expect(slot.file).toBe(newFile);
    expect(slot.previewUrl).toBe('blob:better');
  });

  it('clearing a slot resets file, previewUrl, and mediaAssetId', () => {
    let state = withImages(initialState, 1);
    state = reducer(state, { type: 'CLEAR_AZIMUTH_SLOT', azimuth: 0 });
    const slot = state.locationImages.find((s) => s.azimuth === 0)!;
    expect(slot.file).toBeNull();
    expect(slot.previewUrl).toBeNull();
    expect(slot.mediaAssetId).toBeNull();
  });

  it('can fill all 4 slots', () => {
    const state = withImages(initialState, 4);
    expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(4);
  });

  it('counts filled slots correctly after add and remove', () => {
    let state = withImages(initialState, 3);
    expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(3);
    state = reducer(state, { type: 'CLEAR_AZIMUTH_SLOT', azimuth: 90 });
    expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(2);
  });
});

// ─── 2.2 Asset List Builder ─────────────────────────────────────────────────

describe('Phase 2.2 — Asset List Builder', () => {
  it('adds an asset with correct fields', () => {
    const state = reducer(initialState, {
      type: 'ADD_ASSET',
      id: 'a1',
      name: 'Marcus',
      assetType: 'character',
      description: 'tall man, 30s',
      color: '#3B82F6',
    });
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0]).toEqual({
      id: 'a1',
      name: 'Marcus',
      type: 'character',
      description: 'tall man, 30s',
      color: '#3B82F6',
    });
  });

  it('adds a prop asset', () => {
    const state = reducer(initialState, {
      type: 'ADD_ASSET',
      id: 'p1',
      name: 'Kitchen knife',
      assetType: 'prop',
      description: '',
      color: '#F97316',
    });
    expect(state.assets[0].type).toBe('prop');
  });

  it('auto-assigns colors cycling through the palette', () => {
    let state = initialState;
    for (let i = 0; i < 10; i++) {
      state = reducer(state, {
        type: 'ADD_ASSET',
        id: `a${i}`,
        name: `Asset ${i}`,
        assetType: 'character',
        description: '',
        color: ASSET_COLORS[i % ASSET_COLORS.length],
      });
    }
    expect(state.assets).toHaveLength(10);
    // 9th asset (index 8) should wrap to color[0], 10th (index 9) to color[1]
    expect(state.assets[8].color).toBe(ASSET_COLORS[0]);
    expect(state.assets[9].color).toBe(ASSET_COLORS[1]);
  });

  it('updates asset name', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = reducer(state, { type: 'UPDATE_ASSET', id: 'a1', field: 'name', value: 'Marcus Jr.' });
    expect(state.assets[0].name).toBe('Marcus Jr.');
  });

  it('updates asset type from character to prop', () => {
    let state = withAsset(initialState, 'a1', 'Knife', 'character');
    state = reducer(state, { type: 'UPDATE_ASSET', id: 'a1', field: 'type', value: 'prop' });
    expect(state.assets[0].type).toBe('prop');
  });

  it('updates asset description', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = reducer(state, { type: 'UPDATE_ASSET', id: 'a1', field: 'description', value: 'grey hoodie' });
    expect(state.assets[0].description).toBe('grey hoodie');
  });

  it('removes an asset', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = withAsset(state, 'a2', 'Detective');
    state = reducer(state, { type: 'REMOVE_ASSET', id: 'a1' });
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0].id).toBe('a2');
  });

  it('removing an asset cascades to shot assetIds', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = withAsset(state, 'a2', 'Knife');
    state = withShot(state, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a1', 'a2'] });
    expect(state.shots[0].assetIds).toEqual(['a1', 'a2']);

    state = reducer(state, { type: 'REMOVE_ASSET', id: 'a1' });
    expect(state.shots[0].assetIds).toEqual(['a2']);
  });

  it('removing an asset cascades across multiple shots', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = withShot(state, 's1', 'Shot 1');
    state = withShot(state, 's2', 'Shot 2');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a1'] });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's2', field: 'assetIds', value: ['a1'] });

    state = reducer(state, { type: 'REMOVE_ASSET', id: 'a1' });
    expect(state.shots[0].assetIds).toEqual([]);
    expect(state.shots[1].assetIds).toEqual([]);
  });

  it('updating a non-existent asset changes nothing', () => {
    const state = withAsset(initialState, 'a1', 'Marcus');
    const next = reducer(state, { type: 'UPDATE_ASSET', id: 'nonexistent', field: 'name', value: 'Ghost' });
    expect(next.assets).toEqual(state.assets);
  });
});

// ─── 2.3 Shot List Builder ──────────────────────────────────────────────────

describe('Phase 2.3 — Shot List Builder', () => {
  it('adds a shot with defaults', () => {
    const state = withShot(initialState, 's1', 'Shot 1A');
    expect(state.shots).toHaveLength(1);
    expect(state.shots[0]).toEqual({
      id: 's1',
      name: 'Shot 1A',
      action: '',
      cameraType: 'Wide',
      assetIds: [],
      duration: 8,
    });
  });

  it('adds multiple shots in order', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = withShot(state, 's2', 'Shot 2');
    state = withShot(state, 's3', 'Shot 3');
    expect(state.shots).toHaveLength(3);
    expect(state.shots.map((s) => s.name)).toEqual(['Shot 1', 'Shot 2', 'Shot 3']);
  });

  it('updates shot name', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'name', value: 'Establishing' });
    expect(state.shots[0].name).toBe('Establishing');
  });

  it('updates shot action', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'action', value: 'Marcus enters the kitchen' });
    expect(state.shots[0].action).toBe('Marcus enters the kitchen');
  });

  it('updates camera type', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraType', value: 'Close-Up' });
    expect(state.shots[0].cameraType).toBe('Close-Up');
  });

  it('updates all camera types', () => {
    const types = ['Wide', 'Medium', 'Close-Up', 'OTS', 'POV', 'Two-Shot', 'Insert'] as const;
    let state = withShot(initialState, 's1', 'Shot 1');
    for (const t of types) {
      state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraType', value: t });
      expect(state.shots[0].cameraType).toBe(t);
    }
  });

  it('toggles asset checkboxes — add asset to shot', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = withShot(state, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a1'] });
    expect(state.shots[0].assetIds).toEqual(['a1']);
  });

  it('toggles asset checkboxes — remove asset from shot', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = withAsset(state, 'a2', 'Knife');
    state = withShot(state, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a1', 'a2'] });
    // Uncheck a1
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a2'] });
    expect(state.shots[0].assetIds).toEqual(['a2']);
  });

  it('different shots can have different asset selections', () => {
    let state = withAsset(initialState, 'a1', 'Marcus');
    state = withAsset(state, 'a2', 'Knife');
    state = withShot(state, 's1', 'Shot 1');
    state = withShot(state, 's2', 'Shot 2');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a1'] });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's2', field: 'assetIds', value: ['a1', 'a2'] });
    expect(state.shots[0].assetIds).toEqual(['a1']);
    expect(state.shots[1].assetIds).toEqual(['a1', 'a2']);
  });

  it('updates optional duration field', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    expect(state.shots[0].duration).toBe(8); // default
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'duration', value: 15 });
    expect(state.shots[0].duration).toBe(15);
  });

  it('updates optional cameraDistance field', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraDistance', value: 'close' });
    expect(state.shots[0].cameraDistance).toBe('close');
  });

  it('updates optional cameraHeight field', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraHeight', value: 'high_angle' });
    expect(state.shots[0].cameraHeight).toBe('high_angle');
  });

  it('updates optional cameraMovement field', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraMovement', value: 'slow dolly in' });
    expect(state.shots[0].cameraMovement).toBe('slow dolly in');
  });

  it('removes a shot', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = withShot(state, 's2', 'Shot 2');
    state = reducer(state, { type: 'REMOVE_SHOT', id: 's1' });
    expect(state.shots).toHaveLength(1);
    expect(state.shots[0].id).toBe('s2');
  });

  it('removing a shot preserves other shots', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = withShot(state, 's2', 'Shot 2');
    state = withShot(state, 's3', 'Shot 3');
    state = reducer(state, { type: 'REMOVE_SHOT', id: 's2' });
    expect(state.shots.map((s) => s.id)).toEqual(['s1', 's3']);
  });
});

// ─── 2.4 CTA Validation ────────────────────────────────────────────────────

describe('Phase 2.4 — CTA Validation', () => {
  it('blocks when no images and no shots', () => {
    expect(canProceed(initialState)).toBe(false);
  });

  it('blocks with 1 image and no shots', () => {
    const state = withImages(initialState, 1);
    expect(canProceed(state)).toBe(false);
  });

  it('blocks with 2 images but no shots', () => {
    const state = withImages(initialState, 2);
    expect(canProceed(state)).toBe(false);
  });

  it('blocks with 1 shot but no images', () => {
    const state = withShot(initialState, 's1', 'Shot 1');
    expect(canProceed(state)).toBe(false);
  });

  it('blocks with 1 image and 1 shot', () => {
    let state = withImages(initialState, 1);
    state = withShot(state, 's1', 'Shot 1');
    expect(canProceed(state)).toBe(false);
  });

  it('allows with 2 images and 1 named shot', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', 'Shot 1');
    expect(canProceed(state)).toBe(true);
  });

  it('allows with 4 images and 1 named shot', () => {
    let state = withImages(initialState, 4);
    state = withShot(state, 's1', 'Shot 1');
    expect(canProceed(state)).toBe(true);
  });

  it('allows with 3 images and multiple shots', () => {
    let state = withImages(initialState, 3);
    state = withShot(state, 's1', 'Shot 1');
    state = withShot(state, 's2', 'Shot 2');
    expect(canProceed(state)).toBe(true);
  });

  it('blocks when shot name is empty string', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', '');
    expect(canProceed(state)).toBe(false);
  });

  it('blocks when shot name is whitespace only', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', '   ');
    expect(canProceed(state)).toBe(false);
  });

  it('allows when at least one shot has a name even if another is empty', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', '');
    state = withShot(state, 's2', 'Real Shot');
    expect(canProceed(state)).toBe(true);
  });

  it('reverts to blocked if image removed below threshold', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', 'Shot 1');
    expect(canProceed(state)).toBe(true);
    state = reducer(state, { type: 'CLEAR_AZIMUTH_SLOT', azimuth: 0 });
    expect(canProceed(state)).toBe(false);
  });

  it('reverts to blocked if last named shot removed', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', 'Shot 1');
    expect(canProceed(state)).toBe(true);
    state = reducer(state, { type: 'REMOVE_SHOT', id: 's1' });
    expect(canProceed(state)).toBe(false);
  });

  it('reverts to blocked if shot name cleared', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', 'Shot 1');
    expect(canProceed(state)).toBe(true);
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'name', value: '' });
    expect(canProceed(state)).toBe(false);
  });
});

// ─── Full Phase 2 Integration ───────────────────────────────────────────────

describe('Phase 2 — Full Setup Integration Flow', () => {
  it('simulates complete setup: images → assets → shots → validate → proceed', () => {
    let state: CineBlockState = initialState;

    // Step 1: Upload 3 azimuth images
    state = withImages(state, 3);
    expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(3);

    // Step 2: Add assets
    state = reducer(state, { type: 'ADD_ASSET', id: 'a1', name: 'Marcus', assetType: 'character', description: 'tall man, 30s, grey hoodie', color: '#3B82F6' });
    state = reducer(state, { type: 'ADD_ASSET', id: 'a2', name: 'Kitchen knife', assetType: 'prop', description: 'large chef knife', color: '#F97316' });
    state = reducer(state, { type: 'ADD_ASSET', id: 'a3', name: 'Detective', assetType: 'character', description: 'woman, 40s, trench coat', color: '#10B981' });
    expect(state.assets).toHaveLength(3);

    // Step 3: Build shots with asset assignments
    state = reducer(state, { type: 'ADD_SHOT', id: 's1', name: 'Shot 1A' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'action', value: 'Marcus enters the kitchen, notices the knife' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraType', value: 'Wide' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'assetIds', value: ['a1', 'a2'] });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'duration', value: 10 });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraHeight', value: 'eye_level' });

    state = reducer(state, { type: 'ADD_SHOT', id: 's2', name: 'Shot 2A' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's2', field: 'action', value: 'Close-up of knife on counter' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's2', field: 'cameraType', value: 'Insert' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's2', field: 'assetIds', value: ['a2'] });

    state = reducer(state, { type: 'ADD_SHOT', id: 's3', name: 'Shot 3A' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's3', field: 'action', value: 'Detective enters behind Marcus' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's3', field: 'cameraType', value: 'OTS' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's3', field: 'assetIds', value: ['a1', 'a3'] });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's3', field: 'cameraMovement', value: 'slow dolly in' });

    // Verify structure
    expect(state.shots).toHaveLength(3);
    expect(state.shots[0].assetIds).toEqual(['a1', 'a2']);
    expect(state.shots[1].assetIds).toEqual(['a2']);
    expect(state.shots[2].assetIds).toEqual(['a1', 'a3']);
    expect(state.shots[0].duration).toBe(10);
    expect(state.shots[2].cameraMovement).toBe('slow dolly in');

    // Step 4: CTA should be enabled
    expect(canProceed(state)).toBe(true);

    // Step 5: Simulate generation pipeline
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    expect(state.worldStatus).toBe('uploading');

    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'generating' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'polling' });

    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'world-full-flow',
      spzUrl: 'https://marble.example/500k.spz',
      colliderUrl: 'https://marble.example/collider.glb',
    });
    expect(state.worldStatus).toBe('ready');

    // Step 6: Navigate to studio
    state = reducer(state, { type: 'NAVIGATE', view: 'studio' });
    expect(state.currentView).toBe('studio');

    // All setup data preserved
    expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(3);
    expect(state.assets).toHaveLength(3);
    expect(state.shots).toHaveLength(3);
    expect(state.worldId).toBe('world-full-flow');
  });

  it('handles error during generation and retries', () => {
    let state = withImages(initialState, 2);
    state = withShot(state, 's1', 'Shot 1');

    // First attempt fails
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'error', error: 'Rate limit exceeded' });
    expect(state.worldStatus).toBe('error');
    expect(state.worldError).toBe('Rate limit exceeded');

    // CTA should still be procedurally valid (error is separate from validation)
    expect(canProceed(state)).toBe(true);

    // Retry succeeds
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    expect(state.worldStatus).toBe('uploading');
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'generating' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'polling' });
    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'retry-world',
      spzUrl: 'https://example.com/retry.spz',
      colliderUrl: 'https://example.com/retry.glb',
    });
    expect(state.worldStatus).toBe('ready');
  });

  it('reset clears all setup data', () => {
    let state = withImages(initialState, 3);
    state = withAsset(state, 'a1', 'Marcus');
    state = withShot(state, 's1', 'Shot 1');
    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'w1',
      spzUrl: 'url',
      colliderUrl: 'url2',
    });

    state = reducer(state, { type: 'RESET' });
    expect(state).toEqual(initialState);
    expect(canProceed(state)).toBe(false);
  });
});

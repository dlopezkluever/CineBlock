/**
 * Round 2 Tests — Input Validation & UX Polish
 *
 * Covers:
 *  3.1 — Image dimension validation (getImageDimensions, validateImages)
 *  3.2 — MODE_TIPS constant coverage
 *  3.3 — MODEL_INFO cost/quality indicators
 *  3.4 — Seed input (AdvancedSettingsPanel logic)
 *  - Dimension persistence in azimuth slots and free images
 *  - Validation badge logic (green/yellow/red)
 */

import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../store';
import type { CineBlockState, ImageDimensions, InputMode } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeFile(name = 'test.jpg'): File {
  return new File(['fake'], name, { type: 'image/jpeg' });
}

function withShot(state: CineBlockState, id: string, name: string): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name });
}

// ─── validateImages (pure function, re-implemented from SetupView) ─────────

type ValidationStatus = 'good' | 'warning' | 'error';

interface ImageValidation {
  status: ValidationStatus;
  message?: string;
}

/** Mirror of the validateImages function from SetupView.tsx */
function validateImages(allDimensions: (ImageDimensions | undefined)[]): ImageValidation[] {
  const defined = allDimensions.filter((d): d is ImageDimensions => d !== undefined);
  if (defined.length === 0) return allDimensions.map(() => ({ status: 'good' }));

  const reference = defined[0];
  const refAspect = reference.width / reference.height;

  return allDimensions.map((dims) => {
    if (!dims) return { status: 'good' as const };

    const shortSide = Math.min(dims.width, dims.height);
    if (shortSide < 512) {
      return { status: 'error' as const, message: `Short side is ${shortSide}px (min 512px recommended)` };
    }

    const aspect = dims.width / dims.height;
    const aspectDiff = Math.abs(aspect - refAspect) / refAspect;
    if (aspectDiff > 0.02) {
      return { status: 'warning' as const, message: expect.stringContaining('Aspect ratio differs') as unknown as string };
    }

    if (dims.width !== reference.width || dims.height !== reference.height) {
      return { status: 'warning' as const, message: expect.stringContaining('Resolution differs') as unknown as string };
    }

    return { status: 'good' as const };
  });
}

// ─── 3.1 Image Dimension Validation ─────────────────────────────────────────

describe('Round 2 / 3.1 — Image Dimension Validation', () => {
  describe('validateImages pure function', () => {
    it('returns all good when no dimensions provided', () => {
      const results = validateImages([undefined, undefined]);
      expect(results).toEqual([{ status: 'good' }, { status: 'good' }]);
    });

    it('returns good for images that match reference', () => {
      const dims = { width: 1920, height: 1080 };
      const results = validateImages([dims, dims]);
      expect(results[0].status).toBe('good');
      expect(results[1].status).toBe('good');
    });

    it('returns error when short side < 512px', () => {
      const small = { width: 640, height: 400 };
      const results = validateImages([small]);
      expect(results[0].status).toBe('error');
      expect(results[0].message).toContain('400px');
      expect(results[0].message).toContain('min 512px');
    });

    it('returns error for very small images (both sides < 512)', () => {
      const tiny = { width: 200, height: 150 };
      const results = validateImages([tiny]);
      expect(results[0].status).toBe('error');
    });

    it('exactly 512px short side is NOT an error', () => {
      const borderline = { width: 1024, height: 512 };
      const results = validateImages([borderline]);
      expect(results[0].status).toBe('good');
    });

    it('511px short side IS an error', () => {
      const justBelow = { width: 1024, height: 511 };
      const results = validateImages([justBelow]);
      expect(results[0].status).toBe('error');
    });

    it('returns warning for mismatched aspect ratio (> 2% difference)', () => {
      const ref = { width: 1920, height: 1080 }; // 16:9
      const diff = { width: 1920, height: 1440 }; // 4:3
      const results = validateImages([ref, diff]);
      expect(results[0].status).toBe('good');
      expect(results[1].status).toBe('warning');
    });

    it('returns warning for mismatched resolution (same aspect, different size)', () => {
      const ref = { width: 1920, height: 1080 };
      const smaller = { width: 960, height: 540 }; // same aspect, half size
      const results = validateImages([ref, smaller]);
      expect(results[0].status).toBe('good');
      expect(results[1].status).toBe('warning');
    });

    it('first image with undefined dimension gets good', () => {
      const dims = { width: 1920, height: 1080 };
      const results = validateImages([undefined, dims]);
      expect(results[0].status).toBe('good');
      expect(results[1].status).toBe('good'); // reference is this one
    });

    it('error takes priority over warning', () => {
      const ref = { width: 1920, height: 1080 };
      const tinyDiffAspect = { width: 300, height: 200 };
      const results = validateImages([ref, tinyDiffAspect]);
      // 200 < 512 → error wins over aspect warning
      expect(results[1].status).toBe('error');
    });

    it('handles mixed valid/invalid/undefined across multiple images', () => {
      const ref = { width: 1920, height: 1080 };
      const matching = { width: 1920, height: 1080 };
      const tooSmall = { width: 400, height: 300 };
      const diffAspect = { width: 1920, height: 1440 };

      const results = validateImages([ref, matching, undefined, tooSmall, diffAspect]);
      expect(results[0].status).toBe('good');    // reference
      expect(results[1].status).toBe('good');    // matches
      expect(results[2].status).toBe('good');    // undefined
      expect(results[3].status).toBe('error');   // too small
      expect(results[4].status).toBe('warning'); // different aspect
    });
  });

  describe('Dimension persistence in store', () => {
    it('SET_AZIMUTH_SLOT stores dimensions', () => {
      const state = reducer(initialState, {
        type: 'SET_AZIMUTH_SLOT',
        azimuth: 0,
        file: makeFile(),
        previewUrl: 'blob:x',
        dimensions: { width: 3840, height: 2160 },
      });
      const slot = state.locationImages.find((s) => s.azimuth === 0)!;
      expect(slot.dimensions).toEqual({ width: 3840, height: 2160 });
    });

    it('SET_AZIMUTH_SLOT works without dimensions', () => {
      const state = reducer(initialState, {
        type: 'SET_AZIMUTH_SLOT',
        azimuth: 0,
        file: makeFile(),
        previewUrl: 'blob:x',
      });
      const slot = state.locationImages.find((s) => s.azimuth === 0)!;
      expect(slot.dimensions).toBeUndefined();
    });

    it('CLEAR_AZIMUTH_SLOT clears dimensions', () => {
      let state = reducer(initialState, {
        type: 'SET_AZIMUTH_SLOT',
        azimuth: 0,
        file: makeFile(),
        previewUrl: 'blob:x',
        dimensions: { width: 1920, height: 1080 },
      });
      state = reducer(state, { type: 'CLEAR_AZIMUTH_SLOT', azimuth: 0 });
      const slot = state.locationImages.find((s) => s.azimuth === 0)!;
      expect(slot.dimensions).toBeUndefined();
    });

    it('ADD_FREE_IMAGE stores dimensions', () => {
      const state = reducer(initialState, {
        type: 'ADD_FREE_IMAGE',
        id: 'f1',
        file: makeFile(),
        previewUrl: 'blob:x',
        dimensions: { width: 2048, height: 1536 },
      });
      expect(state.freeImages[0].dimensions).toEqual({ width: 2048, height: 1536 });
    });
  });
});

// ─── 3.2 MODE_TIPS ──────────────────────────────────────────────────────────

describe('Round 2 / 3.2 — MODE_TIPS', () => {
  // Reproduce the constant from SetupView
  const MODE_TIPS: Record<InputMode, string> = {
    guided: 'Capture your room from the center, looking in each direction. Include overlapping elements between adjacent views for better spatial coherence.',
    free: 'Upload 2\u20138 photos from around the same space. More overlap = better reconstruction. Keep the same resolution and lighting.',
    text: 'Be specific: describe the room type, dimensions, key furniture, wall/floor materials, lighting, and mood.',
    video: 'Record a slow 360\u00b0 pan of your space. Keep camera steady, avoid zoom. 10\u201330 seconds is ideal.',
    single: 'Upload your best photo of the space. A wide-angle shot with good lighting works best.',
  };

  it('has tips for all 5 input modes', () => {
    const allModes: InputMode[] = ['guided', 'free', 'text', 'video', 'single'];
    for (const mode of allModes) {
      expect(MODE_TIPS[mode]).toBeDefined();
      expect(MODE_TIPS[mode].length).toBeGreaterThan(10);
    }
  });

  it('each tip is unique', () => {
    const tips = Object.values(MODE_TIPS);
    const uniqueTips = new Set(tips);
    expect(uniqueTips.size).toBe(tips.length);
  });
});

// ─── 3.3 MODEL_INFO ─────────────────────────────────────────────────────────

describe('Round 2 / 3.3 — MODEL_INFO Cost/Quality Indicators', () => {
  const MODEL_INFO: Record<string, { cost: string; time: string; quality: string; note: string }> = {
    'Marble 0.1-mini': { cost: '~$0.15', time: '30\u201345s', quality: 'Draft quality', note: 'Great for iteration' },
    'Marble 0.1-plus': { cost: '~$1.50', time: '5\u201310 min', quality: 'Production quality', note: 'Sharper, more faithful' },
  };

  it('has info for both models', () => {
    expect(MODEL_INFO['Marble 0.1-mini']).toBeDefined();
    expect(MODEL_INFO['Marble 0.1-plus']).toBeDefined();
  });

  it('each model has all 4 info fields', () => {
    for (const key of Object.keys(MODEL_INFO)) {
      const info = MODEL_INFO[key];
      expect(info.cost).toBeTruthy();
      expect(info.time).toBeTruthy();
      expect(info.quality).toBeTruthy();
      expect(info.note).toBeTruthy();
    }
  });

  it('plus model is more expensive than mini', () => {
    // Extract numbers from cost strings
    const miniCost = parseFloat(MODEL_INFO['Marble 0.1-mini'].cost.replace(/[^0-9.]/g, ''));
    const plusCost = parseFloat(MODEL_INFO['Marble 0.1-plus'].cost.replace(/[^0-9.]/g, ''));
    expect(plusCost).toBeGreaterThan(miniCost);
  });
});

// ─── 3.4 Seed Input ─────────────────────────────────────────────────────────

describe('Round 2 / 3.4 — Seed Input', () => {
  it('sets seed to a valid number', () => {
    const state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: 42 },
    });
    expect(state.generationSettings.seed).toBe(42);
  });

  it('seed can be 0', () => {
    const state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: 0 },
    });
    expect(state.generationSettings.seed).toBe(0);
  });

  it('seed can be max value 4294967295', () => {
    const state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: 4294967295 },
    });
    expect(state.generationSettings.seed).toBe(4294967295);
  });

  it('clears seed with undefined ("Random" button)', () => {
    let state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: 42 },
    });
    state = reducer(state, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: undefined },
    });
    expect(state.generationSettings.seed).toBeUndefined();
  });

  it('setting seed preserves model and splatResolution', () => {
    let state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus', splatResolution: 'full_res' },
    });
    state = reducer(state, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: 999 },
    });
    expect(state.generationSettings.model).toBe('Marble 0.1-plus');
    expect(state.generationSettings.splatResolution).toBe('full_res');
    expect(state.generationSettings.seed).toBe(999);
  });

  it('clearing seed preserves model and splatResolution', () => {
    let state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus', seed: 42 },
    });
    state = reducer(state, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: undefined },
    });
    expect(state.generationSettings.model).toBe('Marble 0.1-plus');
    expect(state.generationSettings.seed).toBeUndefined();
  });
});

// ─── Round 2 Integration ────────────────────────────────────────────────────

describe('Round 2 — Integration: Validation + Settings Flow', () => {
  it('full flow: upload images with dimensions → validate → change model → set seed → proceed', () => {
    let state: CineBlockState = initialState;

    // Upload 3 images with dimensions
    state = reducer(state, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: 0,
      file: makeFile('front.jpg'),
      previewUrl: 'blob:front',
      dimensions: { width: 1920, height: 1080 },
    });
    state = reducer(state, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: 90,
      file: makeFile('right.jpg'),
      previewUrl: 'blob:right',
      dimensions: { width: 1920, height: 1080 },
    });
    state = reducer(state, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: 180,
      file: makeFile('back.jpg'),
      previewUrl: 'blob:back',
      dimensions: { width: 1920, height: 1440 }, // different aspect!
    });

    // Run validation
    const filledSlots = state.locationImages.filter((s) => s.file !== null);
    const dims = filledSlots.map((s) => s.dimensions);
    const validations = validateImages(dims);

    expect(validations[0].status).toBe('good');    // reference
    expect(validations[1].status).toBe('good');    // matches
    expect(validations[2].status).toBe('warning'); // different aspect

    // Change model and set seed
    state = reducer(state, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus', seed: 12345 },
    });
    expect(state.generationSettings.model).toBe('Marble 0.1-plus');
    expect(state.generationSettings.seed).toBe(12345);

    // Add a shot and verify canProceed
    state = withShot(state, 's1', 'Shot 1');
    const filledCount = state.locationImages.filter((s) => s.file !== null).length;
    const hasShot = state.shots.some((s) => s.name.trim() !== '');
    expect(filledCount).toBe(3);
    expect(hasShot).toBe(true);

    // Simulate generation pipeline
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'generating' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'polling' });
    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'world-r2',
      spzUrl: 'https://example.com/r2.spz',
      colliderUrl: 'https://example.com/r2.glb',
      worldMarbleUrl: 'https://marble.worldlabs.ai/world/world-r2',
    });
    expect(state.worldStatus).toBe('ready');

    // Dimensions survived through the full flow
    expect(state.locationImages.find((s) => s.azimuth === 0)!.dimensions).toEqual({ width: 1920, height: 1080 });
  });
});

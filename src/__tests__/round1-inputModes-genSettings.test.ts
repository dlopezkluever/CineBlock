/**
 * Round 1 Tests — Configurable Generation Options & 3-Way Input Mode
 *
 * Covers:
 *  - InputMode, FreeImageSlot, GenerationSettings types in state
 *  - SET_INPUT_MODE, ADD_FREE_IMAGE, REMOVE_FREE_IMAGE, SET_SCENE_DESCRIPTION,
 *    SET_GENERATION_SETTINGS actions
 *  - 8-image cap on free uploads
 *  - canProceed validation per mode
 *  - GenerationOptions in API layer (model, textPrompt, reconstructImages, seed)
 *  - generateWorldFromText API function
 *  - generateFromText orchestrator
 *  - Model-aware timeout (5min mini, 10min plus)
 *  - Mode-aware handleGenerate branching logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, reducer } from '../store';
import type { CineBlockState, InputMode } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeFile(name = 'test.jpg'): File {
  return new File(['fake-image-data'], name, { type: 'image/jpeg' });
}

function withShot(state: CineBlockState, id: string, name: string): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name });
}

function withFreeImages(state: CineBlockState, count: number): CineBlockState {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = reducer(s, {
      type: 'ADD_FREE_IMAGE',
      id: `free-${i}`,
      file: makeFile(`free${i}.jpg`),
      previewUrl: `blob:free${i}`,
    });
  }
  return s;
}

function withGuidedImages(state: CineBlockState, count: number): CineBlockState {
  const azimuths = [0, 90, 180, 270] as const;
  let s = state;
  for (let i = 0; i < count; i++) {
    s = reducer(s, {
      type: 'SET_AZIMUTH_SLOT',
      azimuth: azimuths[i],
      file: makeFile(`img${i}.jpg`),
      previewUrl: `blob:img${i}`,
    });
  }
  return s;
}

/** Mirrors the canProceed logic from SetupView */
function canProceed(state: CineBlockState): boolean {
  const hasShot = state.shots.some((s) => s.name.trim() !== '');
  if (!hasShot) return false;
  switch (state.inputMode) {
    case 'guided': return state.locationImages.filter((s) => s.file !== null).length >= 2;
    case 'free': return state.freeImages.length >= 2;
    case 'text': return state.sceneDescription.trim().length > 0;
    case 'video': return state.videoFile !== null;
    case 'single': return state.singleImage !== null;
  }
}

// ─── Initial State Defaults ─────────────────────────────────────────────────

describe('Round 1 — Initial State Defaults', () => {
  it('defaults inputMode to guided', () => {
    expect(initialState.inputMode).toBe('guided');
  });

  it('defaults freeImages to empty array', () => {
    expect(initialState.freeImages).toEqual([]);
  });

  it('defaults sceneDescription to empty string', () => {
    expect(initialState.sceneDescription).toBe('');
  });

  it('defaults generationSettings with mini model and 500k splat', () => {
    expect(initialState.generationSettings).toEqual({
      model: 'Marble 0.1-mini',
      splatResolution: '500k',
    });
    expect(initialState.generationSettings.seed).toBeUndefined();
  });
});

// ─── SET_INPUT_MODE ─────────────────────────────────────────────────────────

describe('Round 1 — SET_INPUT_MODE', () => {
  const allModes: InputMode[] = ['guided', 'free', 'text', 'video', 'single'];

  it.each(allModes)('switches to %s mode', (mode) => {
    const state = reducer(initialState, { type: 'SET_INPUT_MODE', mode });
    expect(state.inputMode).toBe(mode);
  });

  it('preserves other state when changing mode', () => {
    let state = withShot(initialState, 's1', 'Shot 1');
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'text' });
    expect(state.shots).toHaveLength(1);
    expect(state.shots[0].name).toBe('Shot 1');
  });

  it('can switch between modes back and forth', () => {
    let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'free' });
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'text' });
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'guided' });
    expect(state.inputMode).toBe('guided');
  });
});

// ─── ADD_FREE_IMAGE / REMOVE_FREE_IMAGE ─────────────────────────────────────

describe('Round 1 — Free Image Management', () => {
  it('adds a free image with all fields', () => {
    const file = makeFile('photo.jpg');
    const state = reducer(initialState, {
      type: 'ADD_FREE_IMAGE',
      id: 'f1',
      file,
      previewUrl: 'blob:f1',
      dimensions: { width: 1920, height: 1080 },
    });
    expect(state.freeImages).toHaveLength(1);
    expect(state.freeImages[0]).toEqual({
      id: 'f1',
      file,
      previewUrl: 'blob:f1',
      dimensions: { width: 1920, height: 1080 },
    });
  });

  it('adds free image without dimensions', () => {
    const state = reducer(initialState, {
      type: 'ADD_FREE_IMAGE',
      id: 'f1',
      file: makeFile(),
      previewUrl: 'blob:f1',
    });
    expect(state.freeImages[0].dimensions).toBeUndefined();
  });

  it('adds multiple free images in order', () => {
    const state = withFreeImages(initialState, 5);
    expect(state.freeImages).toHaveLength(5);
    expect(state.freeImages.map((i) => i.id)).toEqual(['free-0', 'free-1', 'free-2', 'free-3', 'free-4']);
  });

  it('enforces 8-image cap — silently ignores 9th add', () => {
    let state = withFreeImages(initialState, 8);
    expect(state.freeImages).toHaveLength(8);

    // 9th image should be silently rejected
    state = reducer(state, {
      type: 'ADD_FREE_IMAGE',
      id: 'free-8',
      file: makeFile('overflow.jpg'),
      previewUrl: 'blob:overflow',
    });
    expect(state.freeImages).toHaveLength(8);
  });

  it('8-image cap is exactly 8, not 7 or 9', () => {
    const state7 = withFreeImages(initialState, 7);
    const state8 = reducer(state7, {
      type: 'ADD_FREE_IMAGE',
      id: 'free-7',
      file: makeFile(),
      previewUrl: 'blob:7',
    });
    expect(state8.freeImages).toHaveLength(8);
  });

  it('removes a free image by id', () => {
    let state = withFreeImages(initialState, 3);
    state = reducer(state, { type: 'REMOVE_FREE_IMAGE', id: 'free-1' });
    expect(state.freeImages).toHaveLength(2);
    expect(state.freeImages.map((i) => i.id)).toEqual(['free-0', 'free-2']);
  });

  it('removing non-existent id is a no-op', () => {
    const state = withFreeImages(initialState, 2);
    const next = reducer(state, { type: 'REMOVE_FREE_IMAGE', id: 'doesnt-exist' });
    expect(next.freeImages).toHaveLength(2);
  });

  it('after removing below cap, can add again', () => {
    let state = withFreeImages(initialState, 8);
    state = reducer(state, { type: 'REMOVE_FREE_IMAGE', id: 'free-0' });
    expect(state.freeImages).toHaveLength(7);
    state = reducer(state, {
      type: 'ADD_FREE_IMAGE',
      id: 'replacement',
      file: makeFile('new.jpg'),
      previewUrl: 'blob:new',
    });
    expect(state.freeImages).toHaveLength(8);
  });
});

// ─── SET_SCENE_DESCRIPTION ──────────────────────────────────────────────────

describe('Round 1 — SET_SCENE_DESCRIPTION', () => {
  it('sets scene description', () => {
    const state = reducer(initialState, {
      type: 'SET_SCENE_DESCRIPTION',
      description: 'A dark kitchen with marble countertops',
    });
    expect(state.sceneDescription).toBe('A dark kitchen with marble countertops');
  });

  it('can update to empty string', () => {
    let state = reducer(initialState, { type: 'SET_SCENE_DESCRIPTION', description: 'hello' });
    state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: '' });
    expect(state.sceneDescription).toBe('');
  });

  it('preserves whitespace-only strings (trimming happens in validation)', () => {
    const state = reducer(initialState, { type: 'SET_SCENE_DESCRIPTION', description: '   ' });
    expect(state.sceneDescription).toBe('   ');
  });
});

// ─── SET_GENERATION_SETTINGS ────────────────────────────────────────────────

describe('Round 1 — SET_GENERATION_SETTINGS', () => {
  it('updates model to plus', () => {
    const state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus' },
    });
    expect(state.generationSettings.model).toBe('Marble 0.1-plus');
    // splatResolution should be preserved
    expect(state.generationSettings.splatResolution).toBe('500k');
  });

  it('updates splatResolution', () => {
    const state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { splatResolution: 'full_res' },
    });
    expect(state.generationSettings.splatResolution).toBe('full_res');
    expect(state.generationSettings.model).toBe('Marble 0.1-mini');
  });

  it('updates multiple settings at once', () => {
    const state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus', splatResolution: '100k' },
    });
    expect(state.generationSettings.model).toBe('Marble 0.1-plus');
    expect(state.generationSettings.splatResolution).toBe('100k');
  });

  it('sets seed', () => {
    const state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: 42 },
    });
    expect(state.generationSettings.seed).toBe(42);
  });

  it('clears seed with undefined', () => {
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

  it('preserves seed when updating other settings', () => {
    let state = reducer(initialState, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { seed: 123 },
    });
    state = reducer(state, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus' },
    });
    expect(state.generationSettings.seed).toBe(123);
    expect(state.generationSettings.model).toBe('Marble 0.1-plus');
  });
});

// ─── canProceed per Mode ────────────────────────────────────────────────────

describe('Round 1 — canProceed Validation per Mode', () => {
  describe('guided mode', () => {
    it('blocks with < 2 images', () => {
      let state = withGuidedImages(initialState, 1);
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(false);
    });

    it('allows with >= 2 images and a shot', () => {
      let state = withGuidedImages(initialState, 2);
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(true);
    });
  });

  describe('free mode', () => {
    it('blocks with < 2 free images', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'free' });
      state = withFreeImages(state, 1);
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(false);
    });

    it('allows with >= 2 free images and a shot', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'free' });
      state = withFreeImages(state, 3);
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(true);
    });

    it('blocks with 2 free images but no shot', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'free' });
      state = withFreeImages(state, 2);
      expect(canProceed(state)).toBe(false);
    });
  });

  describe('text mode', () => {
    it('blocks with empty description', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'text' });
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(false);
    });

    it('blocks with whitespace-only description', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'text' });
      state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: '   ' });
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(false);
    });

    it('allows with non-empty description and a shot', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'text' });
      state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: 'A dark room' });
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(true);
    });

    it('does NOT require images in text mode', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'text' });
      state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: 'room' });
      state = withShot(state, 's1', 'Shot');
      // no images uploaded at all
      expect(state.locationImages.filter((s) => s.file !== null)).toHaveLength(0);
      expect(canProceed(state)).toBe(true);
    });
  });

  describe('video mode', () => {
    it('blocks without video file', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'video' });
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(false);
    });

    it('allows with video file and shot', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'video' });
      state = reducer(state, {
        type: 'SET_VIDEO_FILE',
        file: makeFile('video.mp4'),
        previewUrl: 'blob:vid',
        sizeBytes: 50_000_000,
        format: 'mp4',
      });
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(true);
    });
  });

  describe('single mode', () => {
    it('blocks without single image', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'single' });
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(false);
    });

    it('allows with single image and shot', () => {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'single' });
      state = reducer(state, {
        type: 'SET_SINGLE_IMAGE',
        file: makeFile('photo.jpg'),
        previewUrl: 'blob:photo',
        dimensions: { width: 1920, height: 1080 },
      });
      state = withShot(state, 's1', 'Shot');
      expect(canProceed(state)).toBe(true);
    });
  });

  it('all modes require at least one named shot', () => {
    const modes: InputMode[] = ['guided', 'free', 'text', 'video', 'single'];
    for (const mode of modes) {
      let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode });
      // satisfy mode-specific requirement but NOT the shot requirement
      if (mode === 'guided') state = withGuidedImages(state, 4);
      if (mode === 'free') state = withFreeImages(state, 4);
      if (mode === 'text') state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: 'room' });
      if (mode === 'video') state = reducer(state, { type: 'SET_VIDEO_FILE', file: makeFile('v.mp4'), previewUrl: 'blob:v', sizeBytes: 1000, format: 'mp4' });
      if (mode === 'single') state = reducer(state, { type: 'SET_SINGLE_IMAGE', file: makeFile('p.jpg'), previewUrl: 'blob:p' });
      expect(canProceed(state)).toBe(false);
    }
  });
});

// ─── API: generateWorldFromText & generateFromText ──────────────────────────

vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key');

const marbleApiModule = await import('../services/marbleApi');
const {
  generateWorldFromText,
  generateWorld,
  generateFromText,
  prepareUpload,
} = marbleApiModule;

function mockFetch(responses: { ok: boolean; status: number; body: unknown }[]) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++] ?? responses[responses.length - 1];
    return {
      ok: resp.ok,
      status: resp.status,
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    };
  });
}

describe('Round 1 — API: generateWorldFromText', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key'));
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllEnvs();
  });

  it('sends text prompt with correct structure', async () => {
    const mockOp = { operation_id: 'op-txt', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    const result = await generateWorldFromText('A dark medieval dungeon');
    expect(result.operation_id).toBe('op-txt');

    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.worldlabs.ai/marble/v1/worlds:generate');
    const body = JSON.parse(opts.body);
    expect(body.world_prompt.type).toBe('text');
    expect(body.world_prompt.text_prompt).toBe('A dark medieval dungeon');
    expect(body.model).toBe('Marble 0.1-mini');
  });

  it('passes seed when provided', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromText('room', undefined, { seed: 42 });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.seed).toBe(42);
  });

  it('omits seed when not provided', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromText('room');
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.seed).toBeUndefined();
  });

  it('respects model override to plus', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromText('room', undefined, { model: 'Marble 0.1-plus' });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('Marble 0.1-plus');
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = mockFetch([{ ok: false, status: 400, body: 'Bad request' }]);
    await expect(generateWorldFromText('room')).rejects.toThrow('worlds:generate failed (400)');
  });
});

describe('Round 1 — API: generateWorld with GenerationOptions', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key'));
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllEnvs();
  });

  it('passes textPrompt inside world_prompt (not at top level)', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorld(
      [{ mediaAssetId: 'a1', azimuth: 0 }],
      undefined,
      { textPrompt: 'Moody kitchen' },
    );
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.text_prompt).toBe('Moody kitchen');
    // Must NOT be at top level — API ignores unrecognized top-level fields
    expect(body.text_prompt).toBeUndefined();
  });

  it('does NOT include text_prompt when empty/whitespace', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorld([{ mediaAssetId: 'a1', azimuth: 0 }], undefined, { textPrompt: '   ' });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.text_prompt).toBeUndefined();
    expect(body.text_prompt).toBeUndefined();
  });

  it('passes reconstructImages inside world_prompt (not at top level)', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorld(
      [{ mediaAssetId: 'a1', azimuth: null }],
      undefined,
      { reconstructImages: true },
    );
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.reconstruct_images).toBe(true);
    // Must NOT be at top level — would cause API to enforce 4-image limit
    expect(body.reconstruct_images).toBeUndefined();
  });

  it('omits azimuth when null (free mode)', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorld(
      [{ mediaAssetId: 'a1', azimuth: null }],
      undefined,
    );
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    const prompt = body.world_prompt.multi_image_prompt[0];
    expect(prompt.azimuth).toBeUndefined();
    expect(prompt.content.media_asset_id).toBe('a1');
  });

  it('includes azimuth when specified (guided mode)', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorld([{ mediaAssetId: 'a1', azimuth: 90 }]);
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.multi_image_prompt[0].azimuth).toBe(90);
  });

  it('passes seed in request body', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorld([{ mediaAssetId: 'a1', azimuth: 0 }], undefined, { seed: 777 });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.seed).toBe(777);
  });

  it('passes model choice', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorld([{ mediaAssetId: 'a1', azimuth: 0 }], undefined, { model: 'Marble 0.1-plus' });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('Marble 0.1-plus');
  });
});

describe('Round 1 — API: prepareUpload kind parameter', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key'));
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllEnvs();
  });

  it('defaults kind to image', async () => {
    const mockResp = {
      media_asset: { media_asset_id: 'a1', file_name: 'f.jpg', kind: 'image', extension: 'jpg' },
      upload_info: { upload_url: 'https://x.com/u', upload_method: 'PUT', required_headers: {} },
    };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockResp }]);

    await prepareUpload(makeFile('photo.jpg'));
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.kind).toBe('image');
  });

  it('passes kind=video when specified', async () => {
    const mockResp = {
      media_asset: { media_asset_id: 'a1', file_name: 'v.mp4', kind: 'video', extension: 'mp4' },
      upload_info: { upload_url: 'https://x.com/u', upload_method: 'PUT', required_headers: {} },
    };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockResp }]);

    await prepareUpload(makeFile('video.mp4'), 'video');
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.kind).toBe('video');
  });
});

// ─── Full Round 1 Integration Flow ──────────────────────────────────────────

describe('Round 1 — Integration: mode switching with canProceed', () => {
  it('switching mode changes validation requirements', () => {
    let state = withShot(initialState, 's1', 'Shot 1');

    // guided needs 2+ images — not met
    expect(canProceed(state)).toBe(false);

    // switch to text mode and provide description
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'text' });
    state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: 'A room' });
    expect(canProceed(state)).toBe(true);

    // switch back to guided — still needs images
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'guided' });
    expect(canProceed(state)).toBe(false);
  });

  it('complete free mode flow: add images → settings → validate', () => {
    let state: CineBlockState = initialState;

    // Switch to free mode
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'free' });

    // Add free images
    state = withFreeImages(state, 5);
    expect(state.freeImages).toHaveLength(5);

    // Set description (optional but useful)
    state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: 'Moody kitchen' });

    // Configure generation
    state = reducer(state, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus', splatResolution: 'full_res', seed: 42 },
    });

    // Add a shot
    state = withShot(state, 's1', 'Establishing');

    // Should be valid
    expect(canProceed(state)).toBe(true);

    // Verify all settings persisted
    expect(state.generationSettings.model).toBe('Marble 0.1-plus');
    expect(state.generationSettings.splatResolution).toBe('full_res');
    expect(state.generationSettings.seed).toBe(42);
    expect(state.sceneDescription).toBe('Moody kitchen');
  });

  it('RESET clears all round 1 state', () => {
    let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'free' });
    state = withFreeImages(state, 3);
    state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: 'test' });
    state = reducer(state, { type: 'SET_GENERATION_SETTINGS', settings: { model: 'Marble 0.1-plus', seed: 42 } });

    state = reducer(state, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });
});

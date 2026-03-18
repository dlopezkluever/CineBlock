/**
 * Round 3 Tests — World Generation Expansion (Video, Single Image, Compose, Marble Link)
 *
 * Covers:
 *  Phase 1 — Types & State: VideoSlot, SingleImageSlot, worldMarbleUrl
 *  Phase 2 — API Layer: generateWorldFromVideo, generateWorldFromImage,
 *            uploadVideoAndGenerate, uploadImageAndGenerate
 *  Phase 3 — composeScenePrompt utility, worldMarbleUrl in SET_WORLD_DATA
 *  Phase 4 — Video/Single-Image UI state, 5 input mode tabs, canProceed updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, reducer } from '../store';
import { composeScenePrompt } from '../utils/composeScenePrompt';
import type { CineBlockState, CineBlockAsset, CineBlockShot, InputMode } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeFile(name = 'test.jpg'): File {
  return new File(['fake-data'], name, { type: 'image/jpeg' });
}

function makeVideoFile(name = 'vid.mp4'): File {
  return new File(['fake-video'], name, { type: 'video/mp4' });
}

function withShot(state: CineBlockState, id: string, name: string): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name });
}

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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1 — Types & State
// ═══════════════════════════════════════════════════════════════════════════

describe('Round 3 / Phase 1 — Video Slot State', () => {
  it('initial videoFile is null', () => {
    expect(initialState.videoFile).toBeNull();
  });

  it('SET_VIDEO_FILE stores video with all fields', () => {
    const file = makeVideoFile('walkthrough.mp4');
    const state = reducer(initialState, {
      type: 'SET_VIDEO_FILE',
      file,
      previewUrl: 'blob:vid',
      sizeBytes: 50_000_000,
      format: 'mp4',
    });
    expect(state.videoFile).not.toBeNull();
    expect(state.videoFile!.file).toBe(file);
    expect(state.videoFile!.previewUrl).toBe('blob:vid');
    expect(state.videoFile!.sizeBytes).toBe(50_000_000);
    expect(state.videoFile!.format).toBe('mp4');
  });

  it('SET_VIDEO_FILE replaces previous video', () => {
    let state = reducer(initialState, {
      type: 'SET_VIDEO_FILE',
      file: makeVideoFile('v1.mp4'),
      previewUrl: 'blob:v1',
      sizeBytes: 10_000,
      format: 'mp4',
    });
    const newFile = makeVideoFile('v2.webm');
    state = reducer(state, {
      type: 'SET_VIDEO_FILE',
      file: newFile,
      previewUrl: 'blob:v2',
      sizeBytes: 20_000,
      format: 'webm',
    });
    expect(state.videoFile!.file).toBe(newFile);
    expect(state.videoFile!.format).toBe('webm');
  });

  it('CLEAR_VIDEO_FILE resets to null', () => {
    let state = reducer(initialState, {
      type: 'SET_VIDEO_FILE',
      file: makeVideoFile(),
      previewUrl: 'blob:v',
      sizeBytes: 5000,
      format: 'mp4',
    });
    state = reducer(state, { type: 'CLEAR_VIDEO_FILE' });
    expect(state.videoFile).toBeNull();
  });

  it('CLEAR_VIDEO_FILE when already null is a no-op', () => {
    const state = reducer(initialState, { type: 'CLEAR_VIDEO_FILE' });
    expect(state.videoFile).toBeNull();
  });
});

describe('Round 3 / Phase 1 — Single Image Slot State', () => {
  it('initial singleImage is null', () => {
    expect(initialState.singleImage).toBeNull();
  });

  it('SET_SINGLE_IMAGE stores image with dimensions', () => {
    const file = makeFile('hero.jpg');
    const state = reducer(initialState, {
      type: 'SET_SINGLE_IMAGE',
      file,
      previewUrl: 'blob:hero',
      dimensions: { width: 3840, height: 2160 },
    });
    expect(state.singleImage).not.toBeNull();
    expect(state.singleImage!.file).toBe(file);
    expect(state.singleImage!.previewUrl).toBe('blob:hero');
    expect(state.singleImage!.dimensions).toEqual({ width: 3840, height: 2160 });
  });

  it('SET_SINGLE_IMAGE without dimensions', () => {
    const state = reducer(initialState, {
      type: 'SET_SINGLE_IMAGE',
      file: makeFile(),
      previewUrl: 'blob:x',
    });
    expect(state.singleImage!.dimensions).toBeUndefined();
  });

  it('SET_SINGLE_IMAGE replaces previous image', () => {
    let state = reducer(initialState, {
      type: 'SET_SINGLE_IMAGE',
      file: makeFile('a.jpg'),
      previewUrl: 'blob:a',
    });
    const newFile = makeFile('b.jpg');
    state = reducer(state, {
      type: 'SET_SINGLE_IMAGE',
      file: newFile,
      previewUrl: 'blob:b',
    });
    expect(state.singleImage!.file).toBe(newFile);
  });

  it('CLEAR_SINGLE_IMAGE resets to null', () => {
    let state = reducer(initialState, {
      type: 'SET_SINGLE_IMAGE',
      file: makeFile(),
      previewUrl: 'blob:x',
    });
    state = reducer(state, { type: 'CLEAR_SINGLE_IMAGE' });
    expect(state.singleImage).toBeNull();
  });
});

describe('Round 3 / Phase 1 — worldMarbleUrl in State', () => {
  it('initial worldMarbleUrl is null', () => {
    expect(initialState.worldMarbleUrl).toBeNull();
  });

  it('SET_WORLD_DATA stores worldMarbleUrl', () => {
    const state = reducer(initialState, {
      type: 'SET_WORLD_DATA',
      worldId: 'w1',
      spzUrl: 'https://example.com/splats.spz',
      colliderUrl: 'https://example.com/mesh.glb',
      worldMarbleUrl: 'https://marble.worldlabs.ai/world/w1',
    });
    expect(state.worldMarbleUrl).toBe('https://marble.worldlabs.ai/world/w1');
  });

  it('SET_WORLD_DATA without worldMarbleUrl defaults to null', () => {
    const state = reducer(initialState, {
      type: 'SET_WORLD_DATA',
      worldId: 'w1',
      spzUrl: 'url1',
      colliderUrl: 'url2',
    });
    expect(state.worldMarbleUrl).toBeNull();
  });

  it('RESET clears worldMarbleUrl', () => {
    let state = reducer(initialState, {
      type: 'SET_WORLD_DATA',
      worldId: 'w1',
      spzUrl: 'u1',
      colliderUrl: 'u2',
      worldMarbleUrl: 'https://marble.worldlabs.ai/world/w1',
    });
    state = reducer(state, { type: 'RESET' });
    expect(state.worldMarbleUrl).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 — API Layer
// ═══════════════════════════════════════════════════════════════════════════

vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key');

const marbleApiModule = await import('../services/marbleApi');
const {
  generateWorldFromVideo,
  generateWorldFromImage,
  uploadVideoAndGenerate,
  uploadImageAndGenerate,
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

const worldData = {
  world_id: 'w-test',
  display_name: 'CineBlock World',
  world_marble_url: 'https://marble.worldlabs.ai/world/w-test',
  assets: {
    splats: { spz_urls: { '100k': 'u1', '500k': 'u2', full_res: 'u3' } },
    mesh: { collider_mesh_url: 'https://example.com/mesh.glb' },
  },
};

describe('Round 3 / Phase 2 — generateWorldFromVideo', () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key'));
  afterEach(() => { globalThis.fetch = origFetch; vi.unstubAllEnvs(); });

  it('sends video prompt with correct structure', async () => {
    const mockOp = { operation_id: 'op-vid', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    const result = await generateWorldFromVideo('asset-vid-1');
    expect(result.operation_id).toBe('op-vid');

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.type).toBe('video');
    expect(body.world_prompt.video_prompt.source).toBe('media_asset');
    expect(body.world_prompt.video_prompt.media_asset_id).toBe('asset-vid-1');
    expect(body.model).toBe('Marble 0.1-mini');
  });

  it('passes seed and model', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromVideo('a1', undefined, { model: 'Marble 0.1-plus', seed: 99 });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('Marble 0.1-plus');
    expect(body.seed).toBe(99);
  });

  it('includes text_prompt when provided', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromVideo('a1', undefined, { textPrompt: 'A sunny garden' });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.text_prompt).toBe('A sunny garden');
  });

  it('omits text_prompt when empty', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromVideo('a1', undefined, { textPrompt: '  ' });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.text_prompt).toBeUndefined();
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = mockFetch([{ ok: false, status: 500, body: 'Server error' }]);
    await expect(generateWorldFromVideo('a1')).rejects.toThrow('worlds:generate failed (500)');
  });
});

describe('Round 3 / Phase 2 — generateWorldFromImage', () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key'));
  afterEach(() => { globalThis.fetch = origFetch; vi.unstubAllEnvs(); });

  it('sends image prompt with correct structure', async () => {
    const mockOp = { operation_id: 'op-img', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    const result = await generateWorldFromImage('asset-img-1');
    expect(result.operation_id).toBe('op-img');

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.type).toBe('image');
    expect(body.world_prompt.image_prompt.source).toBe('media_asset');
    expect(body.world_prompt.image_prompt.media_asset_id).toBe('asset-img-1');
  });

  it('includes isPano flag', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromImage('a1', undefined, { isPano: true });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.is_pano).toBe(true);
  });

  it('omits isPano when not specified', async () => {
    const mockOp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
    globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

    await generateWorldFromImage('a1');
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.world_prompt.is_pano).toBeUndefined();
  });
});

describe('Round 3 / Phase 2 — uploadVideoAndGenerate orchestrator', () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key'));
  afterEach(() => { globalThis.fetch = origFetch; vi.unstubAllEnvs(); });

  it('orchestrates full flow: prepare(video) → upload → generate → poll → return', { timeout: 15000 }, async () => {
    const prepareResp = {
      media_asset: { media_asset_id: 'vid-asset-1', file_name: 'v.mp4', kind: 'video', extension: 'mp4' },
      upload_info: { upload_url: 'https://storage/upload', upload_method: 'PUT', required_headers: {} },
    };
    const genResp = { operation_id: 'op-vid', done: false, error: null, metadata: null, response: null };
    const pollDone = {
      operation_id: 'op-vid',
      done: true,
      error: null,
      metadata: { progress: { status: 'SUCCEEDED', description: 'Done' } },
      response: worldData,
    };

    globalThis.fetch = mockFetch([
      { ok: true, status: 200, body: prepareResp },  // prepare
      { ok: true, status: 200, body: {} },            // upload
      { ok: true, status: 200, body: genResp },       // generate
      { ok: true, status: 200, body: pollDone },      // poll
    ]);

    const callbacks = {
      onUploading: vi.fn(),
      onGenerating: vi.fn(),
      onPolling: vi.fn(),
      onSuccess: vi.fn(),
    };

    const result = await uploadVideoAndGenerate(makeVideoFile(), callbacks);
    expect(result.world_id).toBe('w-test');
    expect(callbacks.onUploading).toHaveBeenCalledTimes(1);
    expect(callbacks.onGenerating).toHaveBeenCalledTimes(1);

    // Verify prepareUpload was called with kind = 'video'
    const prepareBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(prepareBody.kind).toBe('video');
  });
});

describe('Round 3 / Phase 2 — uploadImageAndGenerate orchestrator', () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => vi.stubEnv('VITE_MARBLE_API_KEY', 'test-key'));
  afterEach(() => { globalThis.fetch = origFetch; vi.unstubAllEnvs(); });

  it('orchestrates full flow: prepare(image) → upload → generate → poll → return', { timeout: 15000 }, async () => {
    const prepareResp = {
      media_asset: { media_asset_id: 'img-asset-1', file_name: 'photo.jpg', kind: 'image', extension: 'jpg' },
      upload_info: { upload_url: 'https://storage/upload', upload_method: 'PUT', required_headers: {} },
    };
    const genResp = { operation_id: 'op-img', done: false, error: null, metadata: null, response: null };
    const pollDone = {
      operation_id: 'op-img',
      done: true,
      error: null,
      metadata: { progress: { status: 'SUCCEEDED', description: 'Done' } },
      response: worldData,
    };

    globalThis.fetch = mockFetch([
      { ok: true, status: 200, body: prepareResp },
      { ok: true, status: 200, body: {} },
      { ok: true, status: 200, body: genResp },
      { ok: true, status: 200, body: pollDone },
    ]);

    const callbacks = {
      onUploading: vi.fn(),
      onGenerating: vi.fn(),
      onPolling: vi.fn(),
      onSuccess: vi.fn(),
    };

    const result = await uploadImageAndGenerate(makeFile('hero.jpg'), callbacks, { textPrompt: 'A room' });
    expect(result.world_id).toBe('w-test');
    expect(callbacks.onUploading).toHaveBeenCalledTimes(1);
    expect(callbacks.onGenerating).toHaveBeenCalledTimes(1);

    // Verify prepareUpload was called with kind = 'image'
    const prepareBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(prepareBody.kind).toBe('image');

    // Verify generate was called with image prompt
    const genBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[2][1].body);
    expect(genBody.world_prompt.type).toBe('image');
    expect(genBody.world_prompt.text_prompt).toBe('A room');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 — composeScenePrompt
// ═══════════════════════════════════════════════════════════════════════════

describe('Round 3 / Phase 3 — composeScenePrompt', () => {
  it('returns empty string when no assets or shots', () => {
    expect(composeScenePrompt([], [])).toBe('');
  });

  it('describes assets with types', () => {
    const assets: CineBlockAsset[] = [
      { id: 'a1', name: 'Marcus', type: 'character', description: 'tall man', color: '#000' },
      { id: 'a2', name: 'Knife', type: 'prop', description: '', color: '#000' },
    ];
    const result = composeScenePrompt(assets, []);
    expect(result).toContain('Marcus (character: tall man)');
    expect(result).toContain('Knife (prop)');
    expect(result).toContain('An interior space containing:');
  });

  it('describes shots with camera types', () => {
    const shots: CineBlockShot[] = [
      { id: 's1', name: 'Establishing', action: 'Marcus enters', cameraType: 'Wide', assetIds: [], duration: 8 },
    ];
    const result = composeScenePrompt([], shots);
    expect(result).toContain('The scene involves:');
    expect(result).toContain('Establishing - Marcus enters (Wide)');
  });

  it('handles shots without action', () => {
    const shots: CineBlockShot[] = [
      { id: 's1', name: 'Opening', action: '', cameraType: 'Medium', assetIds: [], duration: 8 },
    ];
    const result = composeScenePrompt([], shots);
    expect(result).toContain('Opening (Medium)');
    expect(result).not.toContain(' - ');
  });

  it('combines assets and shots', () => {
    const assets: CineBlockAsset[] = [
      { id: 'a1', name: 'Marcus', type: 'character', description: '', color: '#000' },
    ];
    const shots: CineBlockShot[] = [
      { id: 's1', name: 'Shot 1', action: 'enters room', cameraType: 'Wide', assetIds: [], duration: 8 },
    ];
    const result = composeScenePrompt(assets, shots);
    expect(result).toContain('An interior space containing:');
    expect(result).toContain('The scene involves:');
  });

  it('skips assets with empty names', () => {
    const assets: CineBlockAsset[] = [
      { id: 'a1', name: '', type: 'character', description: 'invisible', color: '#000' },
      { id: 'a2', name: 'Marcus', type: 'character', description: '', color: '#000' },
    ];
    const result = composeScenePrompt(assets, []);
    expect(result).not.toContain('invisible');
    expect(result).toContain('Marcus');
  });

  it('skips shots with empty names', () => {
    const shots: CineBlockShot[] = [
      { id: 's1', name: '', action: 'hidden', cameraType: 'Wide', assetIds: [], duration: 8 },
      { id: 's2', name: 'Real Shot', action: 'enters', cameraType: 'Close-Up', assetIds: [], duration: 8 },
    ];
    const result = composeScenePrompt([], shots);
    expect(result).not.toContain('hidden');
    expect(result).toContain('Real Shot');
  });

  it('handles whitespace-only names by trimming', () => {
    const assets: CineBlockAsset[] = [
      { id: 'a1', name: '   ', type: 'character', description: '', color: '#000' },
    ];
    const result = composeScenePrompt(assets, []);
    expect(result).toBe('');
  });

  it('separates multiple shots with semicolons', () => {
    const shots: CineBlockShot[] = [
      { id: 's1', name: 'A', action: '', cameraType: 'Wide', assetIds: [], duration: 8 },
      { id: 's2', name: 'B', action: '', cameraType: 'Medium', assetIds: [], duration: 8 },
    ];
    const result = composeScenePrompt([], shots);
    expect(result).toContain('A (Wide); B (Medium)');
  });

  it('separates multiple assets with commas', () => {
    const assets: CineBlockAsset[] = [
      { id: 'a1', name: 'A', type: 'character', description: '', color: '#000' },
      { id: 'a2', name: 'B', type: 'prop', description: '', color: '#000' },
    ];
    const result = composeScenePrompt(assets, []);
    expect(result).toContain('A (character), B (prop)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 — Video & Single-Image UI State (5-tab mode selector)
// ═══════════════════════════════════════════════════════════════════════════

describe('Round 3 / Phase 4 — 5 Input Mode Tabs', () => {
  const allModes: InputMode[] = ['guided', 'free', 'text', 'video', 'single'];

  it('all 5 modes exist in the type union', () => {
    // Verify we can set each mode without TypeScript error
    for (const mode of allModes) {
      const state = reducer(initialState, { type: 'SET_INPUT_MODE', mode });
      expect(state.inputMode).toBe(mode);
    }
  });

  it('canProceed works correctly for video mode', () => {
    let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'video' });
    state = withShot(state, 's1', 'Shot');

    // without video → blocked
    expect(canProceed(state)).toBe(false);

    // add video → allowed
    state = reducer(state, {
      type: 'SET_VIDEO_FILE',
      file: makeVideoFile(),
      previewUrl: 'blob:v',
      sizeBytes: 10000,
      format: 'mp4',
    });
    expect(canProceed(state)).toBe(true);

    // clear video → blocked again
    state = reducer(state, { type: 'CLEAR_VIDEO_FILE' });
    expect(canProceed(state)).toBe(false);
  });

  it('canProceed works correctly for single mode', () => {
    let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'single' });
    state = withShot(state, 's1', 'Shot');

    expect(canProceed(state)).toBe(false);

    state = reducer(state, {
      type: 'SET_SINGLE_IMAGE',
      file: makeFile(),
      previewUrl: 'blob:p',
    });
    expect(canProceed(state)).toBe(true);

    state = reducer(state, { type: 'CLEAR_SINGLE_IMAGE' });
    expect(canProceed(state)).toBe(false);
  });

  it('switching modes does not clear other mode data', () => {
    let state = reducer(initialState, { type: 'SET_INPUT_MODE', mode: 'video' });
    state = reducer(state, {
      type: 'SET_VIDEO_FILE',
      file: makeVideoFile(),
      previewUrl: 'blob:v',
      sizeBytes: 1000,
      format: 'mp4',
    });

    // switch to single image mode
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'single' });
    state = reducer(state, {
      type: 'SET_SINGLE_IMAGE',
      file: makeFile(),
      previewUrl: 'blob:img',
    });

    // video data still there
    expect(state.videoFile).not.toBeNull();
    expect(state.singleImage).not.toBeNull();
    expect(state.inputMode).toBe('single');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Full Round 3 Integration
// ═══════════════════════════════════════════════════════════════════════════

describe('Round 3 — Full Integration: Video mode end-to-end', () => {
  it('complete flow: video upload → settings → generation → studio with marble link', () => {
    let state: CineBlockState = initialState;

    // Switch to video mode
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'video' });
    expect(state.inputMode).toBe('video');

    // Add video
    state = reducer(state, {
      type: 'SET_VIDEO_FILE',
      file: makeVideoFile('walkthrough.mp4'),
      previewUrl: 'blob:walkthrough',
      sizeBytes: 75_000_000,
      format: 'mp4',
    });

    // Add a scene description
    state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: 'Modern kitchen with marble counters' });

    // Configure generation
    state = reducer(state, {
      type: 'SET_GENERATION_SETTINGS',
      settings: { model: 'Marble 0.1-plus', seed: 42 },
    });

    // Add assets and shots
    state = reducer(state, { type: 'ADD_ASSET', id: 'a1', name: 'Chef', assetType: 'character', description: 'wearing white', color: '#3B82F6' });
    state = withShot(state, 's1', 'Establishing');

    // Validate
    expect(canProceed(state)).toBe(true);

    // Simulate generation pipeline
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'generating' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'polling' });

    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'world-video-1',
      spzUrl: 'https://example.com/vid-500k.spz',
      colliderUrl: 'https://example.com/vid-mesh.glb',
      worldMarbleUrl: 'https://marble.worldlabs.ai/world/world-video-1',
    });

    expect(state.worldStatus).toBe('ready');
    expect(state.worldMarbleUrl).toBe('https://marble.worldlabs.ai/world/world-video-1');

    // Navigate to studio
    state = reducer(state, { type: 'NAVIGATE', view: 'studio' });
    expect(state.currentView).toBe('studio');

    // All data preserved
    expect(state.videoFile).not.toBeNull();
    expect(state.assets).toHaveLength(1);
    expect(state.shots).toHaveLength(1);
    expect(state.worldMarbleUrl).toBe('https://marble.worldlabs.ai/world/world-video-1');
  });
});

describe('Round 3 — Full Integration: Single image mode with compose', () => {
  it('compose prompt → single image → generation → marble link', () => {
    let state: CineBlockState = initialState;

    // Add assets & shots first
    state = reducer(state, { type: 'ADD_ASSET', id: 'a1', name: 'Marcus', assetType: 'character', description: 'tall man', color: '#3B82F6' });
    state = reducer(state, { type: 'ADD_ASSET', id: 'a2', name: 'Knife', assetType: 'prop', description: 'chef knife', color: '#F97316' });
    state = withShot(state, 's1', 'Reveal');
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'action', value: 'Marcus picks up the knife' });
    state = reducer(state, { type: 'UPDATE_SHOT', id: 's1', field: 'cameraType', value: 'Close-Up' });

    // Use composeScenePrompt
    const prompt = composeScenePrompt(state.assets, state.shots);
    expect(prompt).toContain('Marcus');
    expect(prompt).toContain('Knife');
    expect(prompt).toContain('Reveal');
    expect(prompt.length).toBeGreaterThan(20);

    // Set the composed prompt as scene description
    state = reducer(state, { type: 'SET_SCENE_DESCRIPTION', description: prompt });

    // Switch to single image mode
    state = reducer(state, { type: 'SET_INPUT_MODE', mode: 'single' });
    state = reducer(state, {
      type: 'SET_SINGLE_IMAGE',
      file: makeFile('kitchen.jpg'),
      previewUrl: 'blob:kitchen',
      dimensions: { width: 4032, height: 3024 },
    });

    // Should be valid
    expect(canProceed(state)).toBe(true);

    // Generation
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'uploading' });
    state = reducer(state, { type: 'SET_WORLD_STATUS', status: 'generating' });
    state = reducer(state, {
      type: 'SET_WORLD_DATA',
      worldId: 'world-single-1',
      spzUrl: 'https://example.com/single.spz',
      colliderUrl: 'https://example.com/single.glb',
      worldMarbleUrl: 'https://marble.worldlabs.ai/world/world-single-1',
    });

    expect(state.worldStatus).toBe('ready');
    expect(state.worldMarbleUrl).toBeTruthy();
    expect(state.sceneDescription).toBe(prompt);
  });
});

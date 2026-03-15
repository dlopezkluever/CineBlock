import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock import.meta.env before importing the module
vi.stubEnv('VITE_MARBLE_API_KEY', 'test-api-key-123');

// We need to dynamically import after stubbing env
const marbleApiModule = await import('../services/marbleApi');
const {
  prepareUpload,
  uploadImage,
  generateWorld,
  pollOperation,
  getWorld,
  uploadAndGenerate,
} = marbleApiModule;

// --- Helpers ---

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

function makeFile(name = 'test.jpg'): File {
  return new File(['fake-image-data'], name, { type: 'image/jpeg' });
}

// --- Tests ---

describe('Marble API Client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('VITE_MARBLE_API_KEY', 'test-api-key-123');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  describe('prepareUpload', () => {
    it('sends correct request and returns parsed response', async () => {
      const mockResponse = {
        media_asset: {
          id: 'asset-uuid-1',
          file_name: 'photo.jpg',
          kind: 'image',
          extension: 'jpg',
        },
        upload_info: {
          upload_url: 'https://storage.example.com/signed-url',
          upload_method: 'PUT',
          required_headers: { 'x-custom': 'value' },
        },
      };

      globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockResponse }]);

      const result = await prepareUpload(makeFile('photo.jpg'));

      expect(result.media_asset.id).toBe('asset-uuid-1');
      expect(result.upload_info.upload_url).toBe('https://storage.example.com/signed-url');

      // Verify fetch was called with correct URL and headers
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('https://api.worldlabs.ai/marble/v1/media-assets:prepare_upload');
      expect(opts.method).toBe('POST');
      expect(opts.headers['WLT-Api-Key']).toBe('test-api-key-123');
      const body = JSON.parse(opts.body);
      expect(body.file_name).toBe('photo.jpg');
      expect(body.kind).toBe('image');
      expect(body.extension).toBe('jpg');
    });

    it('throws on HTTP error', async () => {
      globalThis.fetch = mockFetch([{ ok: false, status: 401, body: 'Unauthorized' }]);
      await expect(prepareUpload(makeFile())).rejects.toThrow('prepare_upload failed (401)');
    });
  });

  describe('uploadImage', () => {
    it('PUTs file to signed URL with required headers', async () => {
      globalThis.fetch = mockFetch([{ ok: true, status: 200, body: {} }]);

      const file = makeFile('img.jpg');
      await uploadImage('https://storage.example.com/upload', file, { 'x-amz': 'abc' });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('https://storage.example.com/upload');
      expect(opts.method).toBe('PUT');
      expect(opts.headers['x-amz']).toBe('abc');
      expect(opts.body).toBe(file);
    });

    it('throws on upload failure', async () => {
      globalThis.fetch = mockFetch([{ ok: false, status: 500, body: 'Server Error' }]);
      await expect(uploadImage('https://example.com', makeFile(), {})).rejects.toThrow('Image upload failed (500)');
    });
  });

  describe('generateWorld', () => {
    it('sends multi-image prompt with correct structure', async () => {
      const mockOp = {
        operation_id: 'op-123',
        done: false,
        error: null,
        metadata: null,
        response: null,
      };
      globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockOp }]);

      const result = await generateWorld([
        { mediaAssetId: 'asset-1', azimuth: 0 },
        { mediaAssetId: 'asset-2', azimuth: 90 },
      ]);

      expect(result.operation_id).toBe('op-123');

      const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('https://api.worldlabs.ai/marble/v1/worlds:generate');
      const body = JSON.parse(opts.body);
      expect(body.model_name).toBe('Marble 0.1-mini');
      expect(body.world_prompt.type).toBe('multi-image');
      expect(body.world_prompt.multi_image_prompt).toHaveLength(2);
      expect(body.world_prompt.multi_image_prompt[0]).toEqual({
        azimuth: 0,
        content: { source: 'media_asset', media_asset: { media_asset_id: 'asset-1' } },
      });
    });
  });

  describe('pollOperation', () => {
    it('returns operation status', async () => {
      const mockStatus = {
        operation_id: 'op-123',
        done: true,
        error: null,
        metadata: { progress: { status: 'SUCCEEDED', description: 'Done' }, world_id: 'world-1' },
        response: { id: 'world-1', display_name: 'Test', assets: {} },
      };
      globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockStatus }]);

      const result = await pollOperation('op-123');
      expect(result.done).toBe(true);
      expect(result.response?.id).toBe('world-1');

      const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('https://api.worldlabs.ai/marble/v1/operations/op-123');
    });
  });

  describe('getWorld', () => {
    it('fetches world details', async () => {
      const mockWorld = {
        world: {
          id: 'world-1',
          display_name: 'My World',
          world_marble_url: 'https://marble.worldlabs.ai/world/world-1',
          assets: {
            splats: { spz_urls: { '100k': 'url1', '500k': 'url2', full_res: 'url3' } },
            mesh: { collider_mesh_url: 'https://example.com/mesh.glb' },
            imagery: { pano_url: 'https://example.com/pano.jpg' },
            caption: 'A room',
            thumbnail_url: 'https://example.com/thumb.jpg',
          },
        },
      };
      globalThis.fetch = mockFetch([{ ok: true, status: 200, body: mockWorld }]);

      const result = await getWorld('world-1');
      expect(result.world.id).toBe('world-1');
      expect(result.world.assets.splats.spz_urls['500k']).toBe('url2');
      expect(result.world.assets.mesh.collider_mesh_url).toBe('https://example.com/mesh.glb');
    });
  });

  describe('uploadAndGenerate (orchestrator)', () => {
    it('orchestrates full flow: upload → generate → poll → return world', { timeout: 15000 }, async () => {
      const prepareResp = {
        media_asset: { id: 'asset-1', file_name: 'img.jpg', kind: 'image', extension: 'jpg' },
        upload_info: {
          upload_url: 'https://storage.example.com/upload',
          upload_method: 'PUT',
          required_headers: {},
        },
      };
      const generateResp = {
        operation_id: 'op-1',
        done: false,
        error: null,
        metadata: null,
        response: null,
      };
      const pollInProgress = {
        operation_id: 'op-1',
        done: false,
        error: null,
        metadata: { progress: { status: 'IN_PROGRESS', description: 'Generating...' } },
        response: null,
      };
      const worldData = {
        id: 'world-1',
        display_name: 'CineBlock World',
        world_marble_url: 'https://marble.worldlabs.ai/world/world-1',
        assets: {
          caption: 'A test world',
          thumbnail_url: 'https://example.com/thumb.jpg',
          splats: { spz_urls: { '100k': 'u1', '500k': 'u2', full_res: 'u3' } },
          mesh: { collider_mesh_url: 'https://example.com/mesh.glb' },
          imagery: { pano_url: 'https://example.com/pano.jpg' },
        },
      };
      const pollDone = {
        operation_id: 'op-1',
        done: true,
        error: null,
        metadata: { progress: { status: 'SUCCEEDED', description: 'Done' }, world_id: 'world-1' },
        response: worldData,
      };

      // 2 images: each needs prepare + upload = 4 calls, then generate = 1, then poll (in_progress) + poll (done) = 2
      globalThis.fetch = mockFetch([
        { ok: true, status: 200, body: prepareResp },   // prepare #1
        { ok: true, status: 200, body: {} },             // upload #1
        { ok: true, status: 200, body: { ...prepareResp, media_asset: { ...prepareResp.media_asset, id: 'asset-2' } } },  // prepare #2
        { ok: true, status: 200, body: {} },             // upload #2
        { ok: true, status: 200, body: generateResp },   // generate
        { ok: true, status: 200, body: pollInProgress },  // poll #1
        { ok: true, status: 200, body: pollDone },        // poll #2
      ]);

      const callbacks = {
        onUploading: vi.fn(),
        onGenerating: vi.fn(),
        onPolling: vi.fn(),
        onSuccess: vi.fn(),
      };

      const result = await uploadAndGenerate(
        [
          { file: makeFile('front.jpg'), azimuth: 0 },
          { file: makeFile('right.jpg'), azimuth: 90 },
        ],
        callbacks,
      );

      expect(result.id).toBe('world-1');
      expect(result.assets.splats.spz_urls['500k']).toBe('u2');
      expect(result.assets.mesh.collider_mesh_url).toBe('https://example.com/mesh.glb');

      expect(callbacks.onUploading).toHaveBeenCalledTimes(1);
      expect(callbacks.onGenerating).toHaveBeenCalledTimes(1);
      expect(callbacks.onPolling).toHaveBeenCalledTimes(1);
      expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    });

    it('throws when generation fails with error', { timeout: 15000 }, async () => {
      const prepareResp = {
        media_asset: { id: 'asset-1', file_name: 'img.jpg', kind: 'image', extension: 'jpg' },
        upload_info: { upload_url: 'https://example.com/upload', upload_method: 'PUT', required_headers: {} },
      };
      const generateResp = { operation_id: 'op-1', done: false, error: null, metadata: null, response: null };
      const pollError = {
        operation_id: 'op-1',
        done: false,
        error: { message: 'Internal error', code: 'INTERNAL' },
        metadata: null,
        response: null,
      };

      globalThis.fetch = mockFetch([
        { ok: true, status: 200, body: prepareResp },
        { ok: true, status: 200, body: {} },
        { ok: true, status: 200, body: prepareResp },
        { ok: true, status: 200, body: {} },
        { ok: true, status: 200, body: generateResp },
        { ok: true, status: 200, body: pollError },
      ]);

      await expect(
        uploadAndGenerate([
          { file: makeFile(), azimuth: 0 },
          { file: makeFile(), azimuth: 90 },
        ]),
      ).rejects.toThrow('Generation failed: Internal error');
    });
  });
});

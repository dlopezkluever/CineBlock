const BASE_URL = 'https://api.worldlabs.ai';

function getApiKey(): string {
  const key = import.meta.env.VITE_MARBLE_API_KEY;
  if (!key) throw new Error('VITE_MARBLE_API_KEY is not set');
  return key;
}

function headers(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'WLT-Api-Key': apiKey,
  };
}

// --- Types ---

export interface PrepareUploadResponse {
  media_asset: {
    media_asset_id: string;
    file_name: string;
    kind: string;
    extension: string;
  };
  upload_info: {
    upload_url: string;
    upload_method: string;
    required_headers: Record<string, string>;
  };
}

export interface OperationResponse {
  operation_id: string;
  done: boolean;
  error: { message: string; code: string } | null;
  metadata: {
    progress?: {
      status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
      description: string;
    };
    world_id?: string;
  } | null;
  response: WorldResponse | null;
}

export interface WorldResponse {
  world_id: string;
  display_name: string;
  world_marble_url: string;
  model?: string;
  assets: {
    caption?: string;
    thumbnail_url?: string;
    splats: {
      spz_urls: Record<string, string>;
      semantics_metadata?: {
        ground_plane_offset?: number;
        metric_scale_factor?: number;
      };
    };
    mesh: {
      collider_mesh_url: string;
    };
    imagery?: {
      pano_url?: string;
    };
  };
}

// --- Generation Options ---

export interface GenerationOptions {
  model?: 'Marble 0.1-mini' | 'Marble 0.1-plus';
  reconstructImages?: boolean;
  textPrompt?: string;
  seed?: number;
  splatResolution?: '100k' | '500k' | 'full_res';
}

// --- API Functions ---

export async function prepareUpload(file: File, kind: 'image' | 'video' = 'image'): Promise<PrepareUploadResponse> {
  const apiKey = getApiKey();
  const ext = file.name.split('.').pop() ?? 'jpg';
  const res = await fetch(`${BASE_URL}/marble/v1/media-assets:prepare_upload`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      file_name: file.name,
      kind,
      extension: ext,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`prepare_upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function uploadImage(uploadUrl: string, file: File, requiredHeaders: Record<string, string>): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      ...requiredHeaders,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image upload failed (${res.status}): ${text}`);
  }
}

export async function generateWorld(
  mediaAssets: { mediaAssetId: string; azimuth: number | null }[],
  displayName = 'CineBlock World',
  options: GenerationOptions = {},
): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    display_name: displayName,
    world_prompt: {
      type: 'multi-image',
      multi_image_prompt: mediaAssets.map((a) => ({
        ...(a.azimuth != null && { azimuth: a.azimuth }),
        content: {
          source: 'media_asset',
          media_asset_id: a.mediaAssetId,
        },
      })),
    },
    model: options.model ?? 'Marble 0.1-mini',
  };
  if (options.textPrompt?.trim()) {
    body.text_prompt = options.textPrompt.trim();
  }
  if (options.reconstructImages) {
    body.reconstruct_images = true;
  }
  if (options.seed != null) {
    body.seed = options.seed;
  }
  const res = await fetch(`${BASE_URL}/marble/v1/worlds:generate`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`worlds:generate failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function generateWorldFromText(
  textPrompt: string,
  displayName = 'CineBlock World',
  options: Pick<GenerationOptions, 'model' | 'seed'> = {},
): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    display_name: displayName,
    world_prompt: {
      type: 'text',
      text_prompt: textPrompt,
    },
    model: options.model ?? 'Marble 0.1-mini',
  };
  if (options.seed != null) {
    body.seed = options.seed;
  }
  const res = await fetch(`${BASE_URL}/marble/v1/worlds:generate`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`worlds:generate failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function pollOperation(operationId: string): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const res = await fetch(`${BASE_URL}/marble/v1/operations/${operationId}`, {
    headers: { 'WLT-Api-Key': apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pollOperation failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function getWorld(worldId: string): Promise<WorldResponse> {
  const apiKey = getApiKey();
  const res = await fetch(`${BASE_URL}/marble/v1/worlds/${worldId}`, {
    headers: { 'WLT-Api-Key': apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`getWorld failed (${res.status}): ${text}`);
  }
  return res.json();
}

// --- Orchestrator ---

const POLL_INTERVAL_MS = 5000;

export interface GenerationCallbacks {
  onUploading?: () => void;
  onGenerating?: () => void;
  onPolling?: () => void;
  onSuccess?: (world: WorldResponse) => void;
  onError?: (error: string) => void;
}

async function pollUntilDone(
  operationId: string,
  timeoutMs: number,
  callbacks?: Pick<GenerationCallbacks, 'onPolling' | 'onSuccess'>,
): Promise<WorldResponse> {
  callbacks?.onPolling?.();
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`World generation timed out after ${Math.round(timeoutMs / 60000)} minutes`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await pollOperation(operationId);

    if (status.error) {
      throw new Error(`Generation failed: ${status.error.message}`);
    }

    if (status.done && status.response) {
      callbacks?.onSuccess?.(status.response);
      return status.response;
    }
  }
}

function getTimeoutMs(model?: string): number {
  return model === 'Marble 0.1-plus' ? 10 * 60 * 1000 : 5 * 60 * 1000;
}

export async function uploadAndGenerate(
  slots: { file: File; azimuth: number | null }[],
  callbacks?: GenerationCallbacks,
  options?: GenerationOptions,
): Promise<WorldResponse> {
  // Step 1: Upload all images
  callbacks?.onUploading?.();
  const mediaAssets: { mediaAssetId: string; azimuth: number | null }[] = [];

  for (const slot of slots) {
    const prepared = await prepareUpload(slot.file);
    await uploadImage(
      prepared.upload_info.upload_url,
      slot.file,
      prepared.upload_info.required_headers,
    );
    mediaAssets.push({
      mediaAssetId: prepared.media_asset.media_asset_id,
      azimuth: slot.azimuth,
    });
  }

  // Step 2: Generate world
  callbacks?.onGenerating?.();
  const operation = await generateWorld(mediaAssets, undefined, options);

  // Step 3: Poll until done
  return pollUntilDone(operation.operation_id, getTimeoutMs(options?.model), callbacks);
}

export async function generateFromText(
  textPrompt: string,
  callbacks?: GenerationCallbacks,
  options?: Pick<GenerationOptions, 'model' | 'seed'>,
): Promise<WorldResponse> {
  callbacks?.onGenerating?.();
  const operation = await generateWorldFromText(textPrompt, undefined, options);
  return pollUntilDone(operation.operation_id, getTimeoutMs(options?.model), callbacks);
}

// --- Video & Single-Image Generation ---

export async function generateWorldFromVideo(
  mediaAssetId: string,
  displayName = 'CineBlock World',
  options: Pick<GenerationOptions, 'model' | 'seed'> & { textPrompt?: string } = {},
): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    display_name: displayName,
    world_prompt: {
      type: 'video',
      video_prompt: {
        source: 'media_asset',
        media_asset_id: mediaAssetId,
      },
      ...(options.textPrompt?.trim() && { text_prompt: options.textPrompt.trim() }),
    },
    model: options.model ?? 'Marble 0.1-mini',
  };
  if (options.seed != null) {
    body.seed = options.seed;
  }
  const res = await fetch(`${BASE_URL}/marble/v1/worlds:generate`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`worlds:generate failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function generateWorldFromImage(
  mediaAssetId: string,
  displayName = 'CineBlock World',
  options: Pick<GenerationOptions, 'model' | 'seed'> & { textPrompt?: string; isPano?: boolean } = {},
): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = {
    display_name: displayName,
    world_prompt: {
      type: 'image',
      image_prompt: {
        source: 'media_asset',
        media_asset_id: mediaAssetId,
      },
      ...(options.textPrompt?.trim() && { text_prompt: options.textPrompt.trim() }),
      ...(options.isPano != null && { is_pano: options.isPano }),
    },
    model: options.model ?? 'Marble 0.1-mini',
  };
  if (options.seed != null) {
    body.seed = options.seed;
  }
  const res = await fetch(`${BASE_URL}/marble/v1/worlds:generate`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`worlds:generate failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function uploadVideoAndGenerate(
  file: File,
  callbacks?: GenerationCallbacks,
  options?: Pick<GenerationOptions, 'model' | 'seed'> & { textPrompt?: string },
): Promise<WorldResponse> {
  callbacks?.onUploading?.();
  const prepared = await prepareUpload(file, 'video');
  await uploadImage(prepared.upload_info.upload_url, file, prepared.upload_info.required_headers);

  callbacks?.onGenerating?.();
  const operation = await generateWorldFromVideo(
    prepared.media_asset.media_asset_id,
    undefined,
    options,
  );

  return pollUntilDone(operation.operation_id, getTimeoutMs(options?.model), callbacks);
}

export async function uploadImageAndGenerate(
  file: File,
  callbacks?: GenerationCallbacks,
  options?: Pick<GenerationOptions, 'model' | 'seed'> & { textPrompt?: string; isPano?: boolean },
): Promise<WorldResponse> {
  callbacks?.onUploading?.();
  const prepared = await prepareUpload(file, 'image');
  await uploadImage(prepared.upload_info.upload_url, file, prepared.upload_info.required_headers);

  callbacks?.onGenerating?.();
  const operation = await generateWorldFromImage(
    prepared.media_asset.media_asset_id,
    undefined,
    options,
  );

  return pollUntilDone(operation.operation_id, getTimeoutMs(options?.model), callbacks);
}

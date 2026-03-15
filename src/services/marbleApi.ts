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
    id: string;
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
  id: string;
  display_name: string;
  world_marble_url: string;
  assets: {
    caption: string;
    thumbnail_url: string;
    splats: {
      spz_urls: {
        '100k': string;
        '500k': string;
        full_res: string;
      };
    };
    mesh: {
      collider_mesh_url: string;
    };
    imagery: {
      pano_url: string;
    };
  };
}

export interface GetWorldResponse {
  world: WorldResponse;
}

// --- API Functions ---

export async function prepareUpload(file: File): Promise<PrepareUploadResponse> {
  const apiKey = getApiKey();
  const ext = file.name.split('.').pop() ?? 'jpg';
  const res = await fetch(`${BASE_URL}/marble/v1/media-assets:prepare_upload`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      file_name: file.name,
      kind: 'image',
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
  mediaAssets: { mediaAssetId: string; azimuth: number }[],
  displayName = 'CineBlock World',
): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const res = await fetch(`${BASE_URL}/marble/v1/worlds:generate`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      display_name: displayName,
      world_prompt: {
        type: 'multi-image',
        multi_image_prompt: mediaAssets.map((a) => ({
          azimuth: a.azimuth,
          content: {
            source: 'media_asset',
            media_asset_id: a.mediaAssetId,
          },
        })),
      },
      model: 'Marble 0.1-mini',
    }),
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

export async function getWorld(worldId: string): Promise<GetWorldResponse> {
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
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface GenerationCallbacks {
  onUploading?: () => void;
  onGenerating?: () => void;
  onPolling?: () => void;
  onSuccess?: (world: WorldResponse) => void;
  onError?: (error: string) => void;
}

export async function uploadAndGenerate(
  slots: { file: File; azimuth: number }[],
  callbacks?: GenerationCallbacks,
): Promise<WorldResponse> {
  // Step 1: Upload all images
  callbacks?.onUploading?.();
  const mediaAssets: { mediaAssetId: string; azimuth: number }[] = [];

  for (const slot of slots) {
    const prepared = await prepareUpload(slot.file);
    await uploadImage(
      prepared.upload_info.upload_url,
      slot.file,
      prepared.upload_info.required_headers,
    );
    mediaAssets.push({
      mediaAssetId: prepared.media_asset.id,
      azimuth: slot.azimuth,
    });
  }

  // Step 2: Generate world
  callbacks?.onGenerating?.();
  const operation = await generateWorld(mediaAssets);

  // Step 3: Poll until done
  callbacks?.onPolling?.();
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      throw new Error('World generation timed out after 5 minutes');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await pollOperation(operation.operation_id);

    if (status.error) {
      throw new Error(`Generation failed: ${status.error.message}`);
    }

    if (status.done && status.response) {
      callbacks?.onSuccess?.(status.response);
      return status.response;
    }
  }
}

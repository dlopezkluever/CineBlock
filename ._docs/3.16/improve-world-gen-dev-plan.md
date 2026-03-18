# Improve World Generation Quality — Development Plan

## Problem Statement

When providing 4 directional photos of a single room (e.g. a diner), the Marble API generates disjointed, intertwining corridors with abstract artifacts instead of recognizing and reconstructing a single cohesive space. The generated worlds lack spatial coherence and fidelity to the source images.

## Root Cause Analysis

Three compounding issues in the current implementation:

| Issue | Current Value | Impact |
|---|---|---|
| **`reconstruct_images` not set** | `false` (default) | API treats 4 images as **separate environments to creatively connect**, not views of one room. This is the primary cause of the "four corridors" artifact. |
| **Model hardcoded to mini** | `"Marble 0.1-mini"` | Draft-quality model with less faithful geometry and materials. |
| **No text prompt** | Omitted entirely | The API has no semantic context about what the images represent or their spatial relationship. |
| **Splat resolution capped at 500k** | `spz_urls['500k']` | Higher-resolution `full_res` variant available but unused. |
| **No input validation** | None | Mismatched resolutions/aspect ratios between input images degrade reconstruction. |

---

## Architecture Overview

### Current Pipeline
```
4 Fixed Azimuth Slots (0/90/180/270)
    → Upload each image
    → POST worlds:generate {
        type: "multi-image",
        model: "Marble 0.1-mini",
        reconstruct_images: false (default)
        // no text_prompt
      }
    → Poll → Load 500k splat
```

### Proposed Pipeline
```
Input Mode Toggle: [Guided 4-Dir] | [Free Upload ≤8] | [Text Only]
    → (Images) Upload each image
    → (Images) POST worlds:generate {
        type: "multi-image",
        model: user-selected ("mini" | "plus"),
        reconstruct_images: true (for Free Upload mode),
        text_prompt: user-written description (optional),
        seed: optional
      }
    → (Text Only) POST worlds:generate {
        type: "text",
        text_prompt: user-written description,
        model: user-selected
      }
    → Poll (timeout scaled to model) → Load user-selected splat resolution
```

### Files Affected

| File | Changes |
|---|---|
| `src/types.ts` | New types: `InputMode`, `GenerationSettings`, updated `CineBlockState` |
| `src/store.tsx` | New state fields, new actions for input mode / settings |
| `src/services/marbleApi.ts` | Accept generation options, support text-only mode, `reconstruct_images`, `text_prompt` |
| `src/views/SetupView.tsx` | Input mode toggle, text prompt field, model selector, free upload UI, validation |
| `src/components/MarbleWorld.tsx` | Support `full_res` splat URL |

---

## Phase 1 — Core API Quality Improvements

**Goal:** Fix the root cause of incoherent generations without changing the UI layout significantly. These are parameter-level changes that immediately improve output quality.

### 1.1 Add `reconstruct_images: true` to multi-image requests

**File:** `src/services/marbleApi.ts`

The `generateWorld` function currently sends:
```ts
// Current (line 114-127)
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
})
```

**Change:** Add a `GenerationOptions` parameter and pass `reconstruct_images` through:

```ts
export interface GenerationOptions {
  model?: 'Marble 0.1-mini' | 'Marble 0.1-plus';
  reconstructImages?: boolean;
  textPrompt?: string;
  seed?: number;
  splatResolution?: '100k' | '500k' | 'full_res';
}

export async function generateWorld(
  mediaAssets: { mediaAssetId: string; azimuth: number }[],
  displayName = 'CineBlock World',
  options: GenerationOptions = {},
): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const model = options.model ?? 'Marble 0.1-mini';

  const worldPrompt: Record<string, unknown> = {
    type: 'multi-image',
    multi_image_prompt: mediaAssets.map((a) => ({
      azimuth: a.azimuth,
      content: {
        source: 'media_asset',
        media_asset_id: a.mediaAssetId,
      },
    })),
  };

  // Hybrid prompt: add text alongside images
  if (options.textPrompt?.trim()) {
    worldPrompt.text_prompt = options.textPrompt.trim();
  }

  // Reconstruction mode for coherent single-space generation
  if (options.reconstructImages) {
    worldPrompt.reconstruct_images = true;
  }

  const body: Record<string, unknown> = {
    display_name: displayName,
    world_prompt: worldPrompt,
    model,
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
```

**Important behavioral note:** When `reconstruct_images: true`, the model auto-determines spatial layout from visual overlap. The `azimuth` values become hints rather than strict constraints. Input images should ideally have **overlapping visual elements** between adjacent views.

### 1.2 Add text-only generation support

**File:** `src/services/marbleApi.ts`

Add a new function for text-only world generation:

```ts
export async function generateWorldFromText(
  textPrompt: string,
  displayName = 'CineBlock World',
  options: Pick<GenerationOptions, 'model' | 'seed'> = {},
): Promise<OperationResponse> {
  const apiKey = getApiKey();
  const model = options.model ?? 'Marble 0.1-mini';

  const body: Record<string, unknown> = {
    display_name: displayName,
    world_prompt: {
      type: 'text',
      text_prompt: textPrompt.trim(),
    },
    model,
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
```

### 1.3 Update the orchestrator to accept options

**File:** `src/services/marbleApi.ts`

Update `uploadAndGenerate` signature and add a parallel `generateFromText` orchestrator:

```ts
export async function uploadAndGenerate(
  slots: { file: File; azimuth: number }[],
  callbacks?: GenerationCallbacks,
  options?: GenerationOptions,
): Promise<WorldResponse> {
  // Step 1: Upload all images (unchanged)
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
      mediaAssetId: prepared.media_asset.media_asset_id,
      azimuth: slot.azimuth,
    });
  }

  // Step 2: Generate world with options
  callbacks?.onGenerating?.();
  const operation = await generateWorld(mediaAssets, 'CineBlock World', options);

  // Step 3: Poll until done (with model-aware timeout)
  callbacks?.onPolling?.();
  const timeoutMs = options?.model === 'Marble 0.1-plus'
    ? 10 * 60 * 1000  // 10 min for plus
    : POLL_TIMEOUT_MS; // 5 min for mini
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`World generation timed out after ${timeoutMs / 60000} minutes`);
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

// New: text-only orchestrator (no upload step)
export async function generateFromText(
  textPrompt: string,
  callbacks?: GenerationCallbacks,
  options?: Pick<GenerationOptions, 'model' | 'seed'>,
): Promise<WorldResponse> {
  callbacks?.onGenerating?.();
  const operation = await generateWorldFromText(textPrompt, 'CineBlock World', options);

  callbacks?.onPolling?.();
  const timeoutMs = options?.model === 'Marble 0.1-plus'
    ? 10 * 60 * 1000
    : POLL_TIMEOUT_MS;
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`World generation timed out after ${timeoutMs / 60000} minutes`);
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
```

### 1.4 Support configurable splat resolution

**File:** `src/views/SetupView.tsx` (line 383)

Currently hardcoded:
```ts
spzUrl: world.assets.splats.spz_urls['500k'],
```

Change to read from generation options:
```ts
const resolution = generationSettings.splatResolution ?? '500k';
const spzUrl = world.assets.splats.spz_urls[resolution]
  ?? world.assets.splats.spz_urls['500k']; // fallback

dispatch({
  type: 'SET_WORLD_DATA',
  worldId: world.world_id,
  spzUrl,
  colliderUrl: world.assets.mesh.collider_mesh_url,
});
```

### 1.5 Update loading overlay timing hints

**File:** `src/views/SetupView.tsx`

The loading overlay currently says "This may take 30-45 seconds" (line 325). This is only accurate for mini. Update to be model-aware:

```ts
const timeHint = generationSettings.model === 'Marble 0.1-plus'
  ? 'This may take 5–10 minutes (Plus model)'
  : 'This may take 30–45 seconds';
```

---

## Phase 2 — Input Mode System

**Goal:** Build a three-way input mode toggle that changes the entire Section A of SetupView.

### 2.1 New types

**File:** `src/types.ts`

```ts
// Input mode for world generation
export type InputMode = 'guided' | 'free' | 'text';

// Free-upload image slot (no fixed azimuth)
export interface FreeImageSlot {
  id: string;
  file: File;
  previewUrl: string;
}

// Generation settings controlled by user
export interface GenerationSettings {
  model: 'Marble 0.1-mini' | 'Marble 0.1-plus';
  splatResolution: '100k' | '500k' | 'full_res';
  seed?: number;
}
```

Update `CineBlockState` to add:
```ts
export interface CineBlockState {
  // ... existing fields ...

  // New: input mode
  inputMode: InputMode;
  freeImages: FreeImageSlot[];       // for 'free' mode (up to 8)
  sceneDescription: string;          // for 'text' mode, also hybrid text+image
  generationSettings: GenerationSettings;
}
```

### 2.2 New store actions

**File:** `src/store.tsx`

Add these actions to the `Action` union:

```ts
| { type: 'SET_INPUT_MODE'; mode: InputMode }
| { type: 'ADD_FREE_IMAGE'; id: string; file: File; previewUrl: string }
| { type: 'REMOVE_FREE_IMAGE'; id: string }
| { type: 'SET_SCENE_DESCRIPTION'; description: string }
| { type: 'SET_GENERATION_SETTINGS'; settings: Partial<GenerationSettings> }
```

Update `initialState`:
```ts
inputMode: 'guided',
freeImages: [],
sceneDescription: '',
generationSettings: {
  model: 'Marble 0.1-mini',
  splatResolution: '500k',
},
```

Add reducer cases:
```ts
case 'SET_INPUT_MODE':
  return { ...state, inputMode: action.mode };

case 'ADD_FREE_IMAGE':
  if (state.freeImages.length >= 8) return state;
  return {
    ...state,
    freeImages: [...state.freeImages, {
      id: action.id, file: action.file, previewUrl: action.previewUrl
    }],
  };

case 'REMOVE_FREE_IMAGE':
  return {
    ...state,
    freeImages: state.freeImages.filter((img) => img.id !== action.id),
  };

case 'SET_SCENE_DESCRIPTION':
  return { ...state, sceneDescription: action.description };

case 'SET_GENERATION_SETTINGS':
  return {
    ...state,
    generationSettings: { ...state.generationSettings, ...action.settings },
  };
```

### 2.3 SetupView — Input Mode Toggle

**File:** `src/views/SetupView.tsx`

Replace Section A with a mode-aware section. The toggle sits at the top:

```
┌─────────────────────────────────────────────────────────┐
│  A. World Input                                         │
│                                                         │
│  ┌──────────────┬──────────────┬────────────────┐       │
│  │ 4 Directions │  Free Upload │  Text Only     │       │
│  │  (Guided)    │   (≤8 imgs)  │  (Describe it) │       │
│  └──────────────┴──────────────┴────────────────┘       │
│                                                         │
│  [Mode-specific content below]                          │
│                                                         │
│  ┌─ Scene Description (optional for image modes) ─────┐ │
│  │  Describe your scene to help guide generation...    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ Generation Settings ──────────────────────────────┐ │
│  │  Model: [Mini ▾]   Splat Quality: [500k ▾]        │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### Mode: `guided` (current behavior, enhanced)

- Keep the existing 4-slot grid (Front/Right/Back/Left)
- Add a tip banner: *"For best results, ensure adjacent photos share some overlapping visual elements (corners, furniture, fixtures)."*
- Sends `reconstruct_images: false` (direction-control mode with azimuth)
- Optional text prompt sent as `text_prompt` if filled

#### Mode: `free` (new — reconstruction mode)

- Replace the 4-slot grid with a flexible dropzone for 2–8 images
- Display as a responsive grid of thumbnails with individual remove buttons
- No azimuth assignment — images are sent without azimuth values
- Sends `reconstruct_images: true`
- Tip: *"Upload 2–8 photos of the same space. Include overlapping views for best results. All images should be the same resolution."*
- Optional text prompt sent as `text_prompt` if filled

#### Mode: `text` (new — text-only)

- Hide the image upload entirely
- Show a large textarea for scene description (required, not optional)
- Character counter (max 2,000)
- Tip: *"Describe the room in detail: layout, furniture, materials, lighting, mood. The more specific, the better."*
- Uses `generateFromText` orchestrator instead of `uploadAndGenerate`

### 2.4 SetupView — Generation Settings Panel

Add a collapsible settings panel below the input mode content:

```tsx
function GenerationSettingsPanel() {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();
  const { generationSettings } = state;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-zinc-300">Generation Settings</h4>
      <div className="flex gap-4">
        {/* Model selector */}
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Model</label>
          <select
            value={generationSettings.model}
            onChange={(e) => dispatch({
              type: 'SET_GENERATION_SETTINGS',
              settings: { model: e.target.value as GenerationSettings['model'] }
            })}
            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5"
          >
            <option value="Marble 0.1-mini">Mini (fast, ~30s)</option>
            <option value="Marble 0.1-plus">Plus (high quality, ~5-10 min)</option>
          </select>
        </div>

        {/* Splat resolution */}
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Splat Quality</label>
          <select
            value={generationSettings.splatResolution}
            onChange={(e) => dispatch({
              type: 'SET_GENERATION_SETTINGS',
              settings: { splatResolution: e.target.value as GenerationSettings['splatResolution'] }
            })}
            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5"
          >
            <option value="100k">100k (fastest load)</option>
            <option value="500k">500k (balanced)</option>
            <option value="full_res">Full Resolution (best quality)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
```

### 2.5 SetupView — Update `handleGenerate`

The generate handler needs to branch based on input mode:

```ts
async function handleGenerate() {
  const { inputMode, generationSettings, sceneDescription } = state;

  try {
    let world: WorldResponse;

    if (inputMode === 'text') {
      // Text-only mode
      if (!sceneDescription.trim()) return;
      world = await generateFromText(sceneDescription, {
        onGenerating: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'generating' }),
        onPolling: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'polling' }),
      }, {
        model: generationSettings.model,
      });

    } else if (inputMode === 'free') {
      // Free upload mode (reconstruct)
      const slots = state.freeImages.map((img) => ({
        file: img.file,
        azimuth: 0, // azimuth ignored in reconstruct mode
      }));
      if (slots.length < 2) return;
      world = await uploadAndGenerate(slots, {
        onUploading: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'uploading' }),
        onGenerating: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'generating' }),
        onPolling: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'polling' }),
      }, {
        model: generationSettings.model,
        reconstructImages: true,
        textPrompt: sceneDescription || undefined,
      });

    } else {
      // Guided mode (current behavior, with text_prompt added)
      const slotsWithFiles = state.locationImages
        .filter((s): s is typeof s & { file: File } => s.file !== null)
        .map((s) => ({ file: s.file, azimuth: s.azimuth }));
      if (slotsWithFiles.length < 2) return;
      world = await uploadAndGenerate(slotsWithFiles, {
        onUploading: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'uploading' }),
        onGenerating: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'generating' }),
        onPolling: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'polling' }),
      }, {
        model: generationSettings.model,
        textPrompt: sceneDescription || undefined,
      });
    }

    const resolution = generationSettings.splatResolution;
    const spzUrl = world.assets.splats.spz_urls[resolution]
      ?? world.assets.splats.spz_urls['500k'];

    dispatch({
      type: 'SET_WORLD_DATA',
      worldId: world.world_id,
      spzUrl,
      colliderUrl: world.assets.mesh.collider_mesh_url,
    });
    onNavigate('studio');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    dispatch({ type: 'SET_WORLD_STATUS', status: 'error', error: message });
  }
}
```

### 2.6 Update `canProceed` logic

```ts
const canProceed = (() => {
  if (!hasShot) return false;
  switch (state.inputMode) {
    case 'guided': return filledSlots >= 2;
    case 'free': return state.freeImages.length >= 2;
    case 'text': return state.sceneDescription.trim().length > 0;
  }
})();
```

---

## Phase 3 — Input Validation & UX Polish

**Goal:** Prevent common causes of poor generation and guide users toward best practices.

### 3.1 Image resolution/aspect ratio validation

**File:** `src/views/SetupView.tsx`

When a user uploads an image (in both guided and free modes), validate:
- All uploaded images share the same aspect ratio (within a small tolerance, e.g. 2%)
- All images share the same resolution (warn if mismatched)
- Minimum resolution threshold (e.g. 512px on shortest side)

Implementation: read image dimensions via an `Image()` element on file select, store dimensions alongside the file, compare on each new upload.

```ts
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

Display validation state:
- Green check: all images consistent
- Yellow warning: mismatched aspect ratios (with message)
- Red error: image too small

### 3.2 Contextual tips per input mode

Add an info banner that changes based on selected input mode:

| Mode | Tip |
|---|---|
| Guided | "Capture your room from the center, looking in each direction. Include overlapping elements (corners, furniture) between adjacent views for better spatial coherence." |
| Free | "Upload 2–8 photos from around the same space. More overlap between photos = better reconstruction. Keep the same resolution and lighting across all images." |
| Text | "Be specific: describe the room type, dimensions, key furniture, wall/floor materials, lighting, and mood. Example: 'A cozy 1950s diner with red vinyl booths along the left wall, a chrome counter with stools on the right, checkered black-and-white floor tiles, warm overhead pendant lights, and neon signs in the windows.'" |

### 3.3 Model cost/quality indicator

Show expected cost and quality tradeoff next to the model selector:

```
Mini  — ~$0.15, 30-45s, draft quality (great for iteration)
Plus  — ~$1.50, 5-10 min, production quality (sharper, more faithful)
```

### 3.4 Seed input for reproducibility

Add an optional "Advanced" collapsible section in the Generation Settings panel with:
- Seed input (number, 0–4,294,967,295)
- "Random" button to clear it
- Explanation: "Set a seed to get reproducible results. Same inputs + same seed = same world."

---

## Phase 4 — Stretch Goals

### 4.1 Auto-generated text prompts

Instead of requiring users to write a scene description manually, auto-compose one from existing data:
- Scene assets (names + descriptions)
- Shot descriptions (actions)
- Camera types and movements

Example auto-generated prompt:
> "An interior space containing: a waitress character (young woman in a diner uniform), a customer character (man in a leather jacket), a jukebox prop (vintage 1950s jukebox), and a coffee machine prop. The scene involves: a wide establishing shot of the diner interior, a close-up of the customer at the counter, and a medium shot of the waitress approaching with a coffee pot."

Possible Implementation:
- Build a `composeScenePrompt(assets, shots)` utility function
- Show the auto-generated text in the description field as placeholder or pre-filled value
- User can edit/override before generating

### 4.2 Video input mode

Add a fourth input mode option: "Video Walkthrough"
- Accept a video file (MP4/MOV, up to 30s, max 100MB)
- Upload via media asset flow
- Send as `type: "video"` prompt
- Best for: temporal coherence, smooth room reconstruction from a phone walkthrough

### 4.3 Single image + expansion workflow

Add a simpler entry point:
- User uploads a single strong reference image
- Generate initial world from that image
- After viewing in Studio, offer an "Expand World" button
- Uses Marble's world expansion API to grow the scene

This is particularly useful for users who only have one good photo and don't want to describe the space in text.

---

## Implementation Order

```
Phase 1 (Core API) ─── estimated: straightforward
  1.1  Add GenerationOptions type + reconstruct_images param
  1.2  Add generateWorldFromText function
  1.3  Update uploadAndGenerate orchestrator + add generateFromText
  1.4  Support configurable splat resolution
  1.5  Update loading overlay timing

Phase 2 (Input Modes) ─── estimated: moderate complexity
  2.1  Add new types to types.ts
  2.2  Add new actions/reducer cases to store.tsx
  2.3  Build input mode toggle UI
  2.4  Build generation settings panel
  2.5  Update handleGenerate branching logic
  2.6  Update canProceed validation

Phase 3 (Validation) ─── estimated: moderate complexity
  3.1  Image dimension validation
  3.2  Contextual tips per mode
  3.3  Model cost/quality indicators
  3.4  Seed input

Phase 4 (Stretch) ─── estimated: variable
  4.1  Auto-generated text prompts
  4.2  Video input mode
  4.3  Single image + expansion
```

### Suggested approach
- Phase 1 can be done entirely within `marbleApi.ts` — test these changes first to validate the quality improvement before touching the UI
- Phase 2 is the main UI effort — the input mode toggle is the biggest single change
- Phase 3 is polish that can be done incrementally
- Phase 4 items are independent and can be tackled in any order

---

## Key API Reference (Quick Reference)

### Multi-Image Prompt Fields
| Field | Type | Notes |
|---|---|---|
| `type` | `"multi-image"` | Discriminator |
| `multi_image_prompt` | Array | 2-4 images (or up to 8 if `reconstruct_images: true`) |
| `multi_image_prompt[].azimuth` | Number \| null | Degrees. Nullable. Ignored in reconstruct mode. |
| `multi_image_prompt[].content.source` | `"media_asset"` | Our approach |
| `multi_image_prompt[].content.media_asset_id` | String | From prepare_upload |
| `text_prompt` | String \| undefined | Optional hybrid text (max 2,000 chars) |
| `reconstruct_images` | Boolean | Default `false`. `true` = Auto Layout / reconstruction |

### Text Prompt Fields
| Field | Type | Notes |
|---|---|---|
| `type` | `"text"` | Discriminator |
| `text_prompt` | String | Required (max 2,000 chars) |

### Generation Body Fields
| Field | Type | Notes |
|---|---|---|
| `model` | String | `"Marble 0.1-mini"` or `"Marble 0.1-plus"` |
| `seed` | Number \| undefined | 0–4,294,967,295 for reproducibility |
| `display_name` | String \| undefined | Max 64 chars |

### Model Comparison
| | Mini | Plus |
|---|---|---|
| Generation time | 30–45 seconds | 5–10 minutes |
| Credit cost | ~150–330 | ~1,500–1,600 |
| USD cost | ~$0.15 | ~$1.50 |
| Quality | Draft / exploration | Production / sharper / more faithful |
| Poll timeout needed | 5 minutes | 10 minutes |

### Splat Resolutions
| Key | Use Case |
|---|---|
| `100k` | Fastest load, preview quality |
| `500k` | Balanced (current default) |
| `full_res` | Highest fidelity, slower to load |

# Phase 1 (Core API) + Phase 2 (Input Modes) Implementation Plan

## Context

The current world generation pipeline produces incoherent "corridor" worlds because it sends 4 directional images without `reconstruct_images`, uses the mini model only, has no text prompt support, and hardcodes 500k splat resolution. This plan implements configurable generation options at the API layer, then builds a 3-way input mode UI (guided / free upload / text-only) so users can choose the right approach for their content.

## Reordered Execution (types+store first to unblock Phase 1.4/1.5)

---

### Step 1: Add new types to `src/types.ts`

Add after the `AspectRatioKey` block (before `CineBlockState`):

```ts
export type InputMode = 'guided' | 'free' | 'text';

export interface FreeImageSlot {
  id: string;
  file: File;
  previewUrl: string;
}

export interface GenerationSettings {
  model: 'Marble 0.1-mini' | 'Marble 0.1-plus';
  splatResolution: '100k' | '500k' | 'full_res';
  seed?: number;
}
```

Extend `CineBlockState` with:
```ts
inputMode: InputMode;
freeImages: FreeImageSlot[];
sceneDescription: string;
generationSettings: GenerationSettings;
```

---

### Step 2: Add actions, initial state, and reducer cases to `src/store.tsx`

**New actions** added to the `Action` union:
```ts
| { type: 'SET_INPUT_MODE'; mode: InputMode }
| { type: 'ADD_FREE_IMAGE'; id: string; file: File; previewUrl: string }
| { type: 'REMOVE_FREE_IMAGE'; id: string }
| { type: 'SET_SCENE_DESCRIPTION'; description: string }
| { type: 'SET_GENERATION_SETTINGS'; settings: Partial<GenerationSettings> }
```

**Initial state** additions:
```ts
inputMode: 'guided',
freeImages: [],
sceneDescription: '',
generationSettings: { model: 'Marble 0.1-mini', splatResolution: '500k' },
```

**Reducer cases**: Standard immutable updates. `ADD_FREE_IMAGE` caps at 8 images. `SET_GENERATION_SETTINGS` merges partial into existing.

Import `InputMode`, `GenerationSettings`, `FreeImageSlot` from types.

---

### Step 3: Add `GenerationOptions` type + update `generateWorld` in `src/services/marbleApi.ts`

Add the interface:
```ts
export interface GenerationOptions {
  model?: 'Marble 0.1-mini' | 'Marble 0.1-plus';
  reconstructImages?: boolean;
  textPrompt?: string;
  seed?: number;
  splatResolution?: '100k' | '500k' | 'full_res';
}
```

Update `generateWorld` signature to accept `options: GenerationOptions = {}`:
- Use `options.model ?? 'Marble 0.1-mini'` instead of hardcoded model
- Conditionally add `text_prompt` if `options.textPrompt?.trim()` exists
- Conditionally add `reconstruct_images: true` if `options.reconstructImages`
- Conditionally add `seed` if `options.seed != null`

---

### Step 4: Add `generateWorldFromText` function in `src/services/marbleApi.ts`

New function for text-only generation:
```ts
export async function generateWorldFromText(
  textPrompt: string,
  displayName: string,
  options: Pick<GenerationOptions, 'model' | 'seed'>,
): Promise<OperationResponse>
```

Sends `world_prompt: { type: 'text', text_prompt }` instead of multi-image.

---

### Step 5: Extract `pollUntilDone` helper + update orchestrators in `src/services/marbleApi.ts`

Extract shared polling logic:
```ts
async function pollUntilDone(
  operationId: string,
  timeoutMs: number,
  callbacks?: Pick<GenerationCallbacks, 'onPolling' | 'onSuccess'>,
): Promise<WorldResponse>
```

Update `uploadAndGenerate` to:
- Accept `options?: GenerationOptions` as third param
- Pass options through to `generateWorld`
- Compute timeout based on `options?.model` (10min for plus, 5min for mini)
- Use `pollUntilDone` instead of inline loop

Add `generateFromText` orchestrator:
```ts
export async function generateFromText(
  textPrompt: string,
  callbacks?: GenerationCallbacks,
  options?: Pick<GenerationOptions, 'model' | 'seed'>,
): Promise<WorldResponse>
```
- Skips upload step
- Calls `generateWorldFromText` then `pollUntilDone`

---

### Step 6: Update splat resolution in `src/views/SetupView.tsx`

In `handleGenerate` success path (line 382), replace:
```ts
spzUrl: world.assets.splats.spz_urls['500k'],
```
with:
```ts
const resolution = state.generationSettings.splatResolution;
const spzUrl = world.assets.splats.spz_urls[resolution]
  ?? world.assets.splats.spz_urls['500k'];
```

---

### Step 7: Update loading overlay timing in `src/views/SetupView.tsx`

Update `LoadingOverlay` to accept a `model` prop and show model-aware timing:
- Mini: "This may take 30-45 seconds"
- Plus: "This may take 5-10 minutes (Plus model)"

Also update `statusMessages.generating` (line 341) similarly.

---

### Step 8: Build input mode toggle UI in `src/views/SetupView.tsx`

Replace the fixed Section A with a mode-aware section:
- 3-tab toggle at top: "4 Directions" | "Free Upload" | "Text Only"
- **Guided mode**: Keep existing `AzimuthSlotCard` grid + optional scene description textarea
- **Free mode**: Flexible dropzone for 2-8 images, responsive thumbnail grid with remove buttons, required text field is optional. Build a `FreeImageCard` component (similar to `AzimuthSlotCard` but simpler — no azimuth label)
- **Text mode**: Large textarea (required), character counter (max 2000), no image upload area

Scene description textarea appears for all modes (required for text, optional for image modes).

---

### Step 9: Build generation settings panel in `src/views/SetupView.tsx`

Add `GenerationSettingsPanel` component below input mode content:
- Model selector dropdown (Mini / Plus with timing hints)
- Splat quality dropdown (100k / 500k / full_res)
- Dispatches `SET_GENERATION_SETTINGS` on change

---

### Step 10: Update `handleGenerate` branching logic in `src/views/SetupView.tsx`

Branch on `state.inputMode`:
- **`text`**: Call `generateFromText(sceneDescription, callbacks, { model })`. Guard on non-empty description.
- **`free`**: Call `uploadAndGenerate(slots, callbacks, { model, reconstructImages: true, textPrompt })`. Map freeImages to slots with `azimuth: null`. Guard on `freeImages.length >= 2`.
- **`guided`**: Call `uploadAndGenerate(slotsWithFiles, callbacks, { model, textPrompt })`. Existing azimuth flow with optional text. Guard on `filledSlots >= 2`.

All paths read `state.generationSettings` for model/splatResolution. Import `generateFromText` alongside `uploadAndGenerate`.

---

### Step 11: Update `canProceed` validation in `src/views/SetupView.tsx`

Replace the simple `filledSlots >= 2 && hasShot` with:
```ts
const canProceed = hasShot && (() => {
  switch (state.inputMode) {
    case 'guided': return filledSlots >= 2;
    case 'free': return state.freeImages.length >= 2;
    case 'text': return state.sceneDescription.trim().length > 0;
  }
})();
```

Update the disabled tooltip text to be mode-aware.

---

## Files Modified

| File | Steps | Nature of Changes |
|---|---|---|
| `src/types.ts` | 1 | Add `InputMode`, `FreeImageSlot`, `GenerationSettings` types; extend `CineBlockState` |
| `src/store.tsx` | 2 | Add 5 new actions, initial state fields, reducer cases |
| `src/services/marbleApi.ts` | 3, 4, 5 | `GenerationOptions` type, `generateWorldFromText`, `pollUntilDone` helper, update `uploadAndGenerate` + new `generateFromText` orchestrator |
| `src/views/SetupView.tsx` | 6, 7, 8, 9, 10, 11 | Input mode toggle, free upload UI, text mode, generation settings panel, branching handleGenerate, model-aware loading, configurable splat resolution |

**NOT modified**: `src/components/MarbleWorld.tsx` — splat URL is already resolved in SetupView and stored as a plain string in state.

## Key Decisions

- `reconstruct_images` stays `false` by default; only set `true` explicitly in free mode (Step 10)
- Free mode sends `azimuth: null` (not 0) — semantically correct per API docs
- Polling logic extracted to shared `pollUntilDone` helper (Step 5)
- `hasShot` remains required for all input modes
- Plus model timeout: 10 minutes; Mini: 5 minutes

## Verification

1. **Guided mode**: Upload 2+ images, select Mini/Plus, generate. Confirm azimuths sent correctly, splat resolution respected.
2. **Free mode**: Upload 2-8 images, confirm `reconstruct_images: true` and `azimuth: null` in request payload. Verify world generates.
3. **Text mode**: Enter description, generate. Confirm `type: "text"` prompt sent, no upload step.
4. **Settings**: Toggle model, verify loading overlay shows correct timing. Toggle splat resolution, verify correct URL used.
5. **Validation**: Confirm button disabled when requirements not met per mode. Confirm hasShot required for all modes.
6. **Error handling**: Test timeout with Plus model. Test generation failure. Confirm retry works.

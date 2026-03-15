# CineBlock — Hackathon Implementation Task List

> Iterative build plan. Each phase produces a functional (increasingly complete) product.
> Primary source of truth: `prd-revised.md`

---

## Phase 0: Scaffold
**Goal:** Empty app runs, routes between 3 views, styling works, 3D canvas renders a test cube.

### 0.1 — Project Init
- [ ] `npm create vite@latest cineblock -- --template react-ts`
- [ ] Install deps: `tailwindcss @tailwindcss/vite @react-three/fiber @react-three/drei three@0.181.0 @types/three`
- [ ] Configure Tailwind via Vite plugin in `vite.config.ts`
- [ ] Create `.env` with `VITE_MARBLE_API_KEY=` placeholder, add `.env` to `.gitignore`

### 0.2 — App Shell & Routing
- [ ] Create `App.tsx` with `currentView` state: `'setup' | 'studio' | 'results'`
- [ ] Create stub components: `SetupView.tsx`, `StudioView.tsx`, `ResultsView.tsx`
- [ ] Wire view switching — render active view, pass `onNavigate` callback
- [ ] Add a minimal top nav or breadcrumb showing current phase

### 0.3 — State Foundation
- [ ] Create `src/types.ts` with all interfaces from PRD: `CineBlockState`, `AzimuthSlot`, `CineBlockAsset`, `CineBlockShot`, `MannequinPlacement`, `CaptureEntry`
- [ ] Create `src/store.ts` — `useReducer` or context-based store with initial state shape
- [ ] Wrap `App` in state provider, verify state flows to child views

### 0.4 — 3D Canvas Smoke Test
- [ ] In `StudioView`, render `<Canvas gl={{ antialias: false, preserveDrawingBuffer: true }}>` with a colored `<mesh>` cube
- [ ] Add `<OrbitControls>` from drei, confirm mouse orbit works
- [ ] Verify `gl.domElement.toDataURL()` returns a non-blank image (preserveDrawingBuffer test)

**Checkpoint:** App launches, you can click between 3 empty views, the Studio view shows a spinning cube you can orbit.

---

## Phase 1: Marble API Pipeline
**Goal:** Upload images → generate world → load Gaussian splat in R3F canvas. This is the highest-risk integration — do it first.

### 1.1 — Marble API Client
- [ ] Create `src/services/marbleApi.ts` with functions: `prepareUpload(apiKey)`, `uploadImage(signedUrl, file)`, `generateWorld(apiKey, mediaAssetIds, azimuths)`, `pollOperation(apiKey, operationId)`, `getWorld(apiKey, worldId)`
- [ ] Each function is a plain `fetch` call returning typed responses
- [ ] Add error handling: HTTP status checks, timeout on polling (max 3 min, 5s intervals)
- [ ] `generateWorld` uses `model_name: "Marble 0.1-mini"`

### 1.2 — Upload → Generate Flow
- [ ] Wire the Setup CTA button to: iterate filled azimuth slots → `prepareUpload` each → `PUT` image to signed URL → collect `mediaAssetId`s → call `generateWorld`
- [ ] Show loading states: `"Uploading images…"` → `"Building your set (~30-45s)…"` → `"Loading world…"`
- [ ] On success: store `worldId`, `spzUrl` (500k), `colliderUrl` in state → navigate to Studio
- [ ] On error: show error message with retry button

### 1.3 — SparkJS Integration
- [ ] `npm install @sparkjsdev/spark` (v2.0.0-preview)
- [ ] Create `src/components/MarbleWorld.tsx` — imperative SparkJS setup inside R3F
- [ ] Instantiate `SparkRenderer` with R3F's `gl`, add to scene
- [ ] Load `SplatMesh` from `spzUrl`, add to scene
- [ ] Handle cleanup on unmount (remove + dispose)

### 1.4 — Collider Mesh
- [ ] Use drei's `useGLTF` to load the GLB from `colliderUrl`
- [ ] Set `visible={false}` on the mesh — it's only for raycasting
- [ ] Store ref to collider mesh for later use in mannequin placement
- [ ] Verify the mesh loads without errors (log bounding box as sanity check)

### 1.5 — Camera Clone Patch
- [ ] Implement camera clone patch from devkit: override `camera.clone()` to skip non-clonable properties
- [ ] Test that LoD doesn't crash when combined with drei's `OrbitControls`
- [ ] If LoD causes issues, disable it as fallback (`enableLod: false` equivalent)

**Checkpoint:** Upload 2-3 images in Setup → click CTA → world generates → Studio shows the Gaussian splat environment you can orbit around.

---

## Phase 2: Setup View — Complete
**Goal:** All three setup sections (images, assets, shots) are functional with validation. The CTA gates on requirements.

### 2.1 — Azimuth Image Uploader (Section A)
- [ ] Render 4 slots in a 2×2 grid: Front (0°), Right (90°), Back (180°), Left (270°)
- [ ] Each slot: drag-and-drop zone + file picker, accepts jpg/png/webp
- [ ] On file drop: generate preview URL via `URL.createObjectURL`, store `File` + `previewUrl` in slot state
- [ ] Show thumbnail with remove (×) button; helper text per slot ("Eye-level hero angle", etc.)
- [ ] Track filled count — CTA requires ≥2 filled

### 2.2 — Asset List Builder (Section B)
- [ ] Render asset rows: Name (text input), Type (select: character/prop), Description (text input)
- [ ] "Add Asset" button appends a new blank row with `crypto.randomUUID()` id
- [ ] Trash icon removes row; confirm if asset is referenced in shots
- [ ] Auto-assign color from palette on creation: `['#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4']`
- [ ] Show color dot next to each asset name

### 2.3 — Shot List Builder (Section C)
- [ ] Shot card component: Shot name (text), Action (textarea), Camera type (select dropdown), Asset checkboxes
- [ ] Asset checkboxes auto-populated from asset list — ticked = in-shot, unticked = off-screen
- [ ] "Add Shot" appends new card; shots display in order with index
- [ ] Collapsible "Details" section per shot: Duration (number, default 8, range 1-30), Camera distance (select), Camera height (select), Camera movement (text)

### 2.4 — CTA Validation & Wiring
- [ ] CTA button: "Generate World & Enter Studio"
- [ ] Disabled until: ≥2 azimuth slots filled AND ≥1 shot defined with a name
- [ ] Disabled state shows tooltip explaining what's missing
- [ ] On click: trigger the Marble upload→generate flow from Phase 1.2
- [ ] Loading overlay with progress text and spinner

**Checkpoint:** Full setup form works — fill slots, add assets, build shots, click CTA → generates world → lands in Studio.

---

## Phase 3: Studio — Core Capture Loop
**Goal:** You can navigate the splat world, see shot info, capture viewfinder-cropped screenshots saved per shot. This is the core demo loop.

### 3.1 — Split Layout
- [ ] Studio view: CSS grid — left: 3D canvas (flex-grow), right: sidebar (280px fixed)
- [ ] Canvas fills available space; sidebar scrollable if content overflows
- [ ] Sidebar has 3 sections stacked: shot list, active shot info, capture tray

### 3.2 — Shot Sidebar — List & Selection
- [ ] Render all shots in order: name + camera type badge
- [ ] Active shot highlighted (accent border/bg)
- [ ] Click shot → set as active → updates info panel and capture tray below
- [ ] Active shot info: name, camera badge, action description (read-only)

### 3.3 — Viewfinder Overlay
- [ ] HTML div overlaid on the canvas (positioned absolutely within a relative container)
- [ ] Default aspect ratio: 16:9, centered in canvas
- [ ] Outside viewfinder: semi-transparent dark overlay (CSS `box-shadow: inset` or 4 dark edge divs)
- [ ] Inside: clean, no chrome (for now — cosmetics in Phase 5)

### 3.4 — Capture Pipeline
- [ ] Toolbar below or over the canvas: "Capture" button + "Start Frame / End Frame" toggle
- [ ] On capture: `gl.domElement.toDataURL('image/png')` → load into `Image` → create offscreen canvas → `drawImage` cropped to viewfinder pixel bounds → export as data URL
- [ ] Store `CaptureEntry` in state: `{ id, shotId, frameType, dataUrl, isHero: false, capturedAt }`
- [ ] First capture per shot+frameType auto-marked as `isHero: true`

### 3.5 — Capture Tray
- [ ] Bottom section of sidebar: two rows labeled "Start Frames" / "End Frames"
- [ ] Show thumbnails (small, ~60px) of captures for the active shot, filtered by frameType
- [ ] Count badge: "Start: 3" / "End: 1"
- [ ] Click thumbnail → open in a simple full-size modal/lightbox

**Checkpoint:** Full capture loop works — select shot, toggle start/end, position camera in splat world, capture → thumbnails appear in tray.

---

## Phase 4: Results View & Export — MVP Complete
**Goal:** End-to-end flow works: Setup → Studio → Results → Export. This is the MVP.

### 4.1 — Results Layout
- [ ] Shot cards in order, each showing: name + camera badge, metadata line, action text
- [ ] Two thumbnail rows per shot: "Start Frames" and "End Frames"
- [ ] Thumbnails rendered from state's `captures` array filtered by `shotId`

### 4.2 — Hero Selection
- [ ] Star icon overlay on each thumbnail
- [ ] Click star → toggles `isHero` (only one hero per shot+frameType combo — unsets others)
- [ ] Default hero: first capture per frame type (set during capture in Phase 3.4)
- [ ] Hero thumbnail gets a gold border or star badge

### 4.3 — Lightbox
- [ ] Click any thumbnail → full-screen overlay with the image, shot name, frame type label
- [ ] Close on click outside, × button, or Escape key
- [ ] Left/right arrows to navigate between captures in the same shot

### 4.4 — ZIP Export
- [ ] Install `jszip` + `file-saver`
- [ ] Build folder structure: `cineblock-export/shot-{name}-{cameraType}/start-01.png`
- [ ] Convert data URLs to blobs, add to zip
- [ ] `saveAs(blob, 'cineblock-export.zip')`

### 4.5 — JSON Export (Dual Format)
- [ ] "Export JSON" button with dropdown: "CineBlock Format" / "Aiuteur-Compatible"
- [ ] CineBlock format: matches the human-readable schema from PRD
- [ ] Aiuteur format: maps fields to Aiuteur names (`asset_type`, `camera_distance`, `charactersForeground`, `referenceImageOrder`, etc.)
- [ ] Hero frames get `heroImageDataUrl`, alternates get `alternateImageDataUrls`
- [ ] Download as `.json` file via blob URL

### 4.6 — Navigation Polish
- [ ] "Done → Results" button in Studio toolbar navigates to Results
- [ ] "Back to Studio" button in Results returns to Studio (state preserved)
- [ ] "Start Over" in Results: confirmation dialog → resets all state → Setup
- [ ] "Back to Setup" from Studio: confirmation if captures exist ("You'll lose captures")

**Checkpoint: MVP — full end-to-end flow demoed: upload images → build shots → enter splat world → capture frames → view results → export ZIP/JSON.**

---

## Phase 5: Mannequin System
**Goal:** Place character/prop primitives in the 3D world, position them with gizmos, toggle visibility per shot.

### 5.1 — Mannequin Primitives
- [ ] `CharacterMannequin` component: capsule body (`<mesh>` with `CapsuleGeometry`) + sphere head, colored by asset color
- [ ] `PropMannequin` component: scaled box (`<mesh>` with `BoxGeometry`), colored by asset color
- [ ] Both accept `position`, `rotation`, `scale` props
- [ ] Floating name label above each mannequin via drei's `<Html>` component

### 5.2 — Click-to-Place (Raycast)
- [ ] "Place" button next to each asset in sidebar's asset visibility panel
- [ ] Click → enter placement mode: cursor becomes crosshair, canvas listens for next click
- [ ] On canvas click: cast ray from camera through mouse position → `raycaster.intersectObjects([colliderMesh])`
- [ ] If hit: spawn mannequin at intersection point (surface-aligned)
- [ ] If miss: spawn at 5 units forward from camera along view direction

### 5.3 — TransformControls Gizmo
- [ ] Click a mannequin → attach drei's `<TransformControls>` to it
- [ ] Default mode: translate; keyboard shortcuts (G=translate, R=rotate, S=scale) or toolbar toggle
- [ ] Click empty space or press Escape → deselect (detach gizmo)
- [ ] On transform end: save updated position/rotation/scale to `MannequinPlacement` in state

### 5.4 — Asset Visibility Toggles
- [ ] Eye icon (👁) next to each asset in sidebar
- [ ] Toggle: visible (👁) → mannequin rendered; hidden (–) → mannequin unmounted from scene
- [ ] On shot switch: reset visibility to match that shot's `assetIds` (checked = visible, unchecked = hidden)
- [ ] User can manually override at any time within a shot

### 5.5 — Remove Mannequin
- [ ] "Remove" button in sidebar per placed mannequin, or right-click context menu
- [ ] Remove deletes `MannequinPlacement` from state → mannequin unmounts
- [ ] Assets without placements show "Place" button; placed assets show visibility toggle + "Remove"

**Checkpoint:** Place colored mannequins on surfaces in the splat world, move them around with gizmos, toggle visibility per shot.

---

## Phase 6: Polish & Cosmetics
**Goal:** Match the mockup UI fidelity, add keyboard shortcuts, make it demo-ready.

### 6.1 — Viewfinder Cosmetics
- [ ] Lens info badge inside viewfinder: "35MM  f/1.8  16:9" (static text, cosmetic)
- [ ] Rule-of-thirds grid lines (subtle white lines at 1/3 and 2/3 horizontal + vertical)
- [ ] Optional `● REC` indicator top-left of viewfinder (red dot + text)
- [ ] Grid lines toggleable from settings

### 6.2 — Aspect Ratio System
- [ ] Aspect ratio selector in toolbar/settings: 16:9, 2.39:1, 4:3, 9:16
- [ ] Changing ratio recalculates viewfinder overlay dimensions (maintain height, adjust width — or vice versa)
- [ ] Capture crop respects the current ratio
- [ ] Selected ratio displayed in viewfinder badge

### 6.3 — Toolbar Polish
- [ ] Bottom-center floating toolbar: dark rounded pill, matches mockup
- [ ] Controls: Capture (prominent), Start/End dropdown, Reset Camera, Settings gear, Collapse sidebar
- [ ] Top-left cosmetic lens bar: lens dropdown (35mm/50mm/85mm), zoom display (cosmetic)
- [ ] Top-right: × close button (back to Setup with confirmation)

### 6.4 — Keyboard Shortcuts
- [ ] `Space` → Capture
- [ ] `1` → Start Frame, `2` → End Frame
- [ ] `Escape` → Deselect mannequin / close lightbox
- [ ] `G` / `R` / `S` → Transform mode (translate/rotate/scale) when mannequin selected

### 6.5 — Sidebar Collapse
- [ ] Collapse button (←) in toolbar hides sidebar, canvas takes full width
- [ ] Expand button (→) appears in top-right of canvas
- [ ] Smooth transition (CSS width animation or instant toggle)

### 6.6 — Camera Controls Polish
- [ ] "Reset Camera" button → returns to world origin / default orbit position
- [ ] Optional: PointerLockControls toggle for first-person WASD mode
- [ ] Smooth transition between orbit and FPS modes

### 6.7 — Loading & Error States
- [ ] World generation: full-screen overlay with animated progress ("Building your set…")
- [ ] SPZ load: progress bar or spinner in Studio while splat downloads
- [ ] Error states: retry buttons, clear error messages
- [ ] Empty states: "No captures yet" in tray, "Add your first shot" in shot list

**Checkpoint: Demo-ready product with polished UI matching mockups, keyboard shortcuts, and smooth UX.**

---

## Phase 7: Stretch Goals (If Time Permits)
**Goal:** Nice-to-haves that improve the demo but aren't required.

### 7.1 — Camera Position Memory
- [ ] On capture, serialize camera position + rotation into `CaptureEntry`
- [ ] "Return to angle" button on capture thumbnails → animates camera back to that position
- [ ] Uses drei's `OrbitControls` `setTarget` / camera `position.set`

### 7.2 — Shot Reordering
- [ ] Drag handles on shot cards in Setup view
- [ ] Reorder updates shot indices in state
- [ ] Order persists through Studio and Results

### 7.3 — Pre-Generated Demo Worlds
- [ ] Store 2-3 pre-generated world IDs + SPZ URLs as constants
- [ ] "Quick Demo" button in Setup that skips image upload, loads a pre-built world
- [ ] Useful for demo day — eliminates 30-45s generation wait

### 7.4 — Screenshot Annotation
- [ ] After capture, option to add a text note to the capture
- [ ] Notes display in Results view below thumbnails
- [ ] Included in JSON export

### 7.5 — Performance Optimization
- [ ] Load 100k SPZ initially, upgrade to 500k on demand
- [ ] Lazy-load capture thumbnails in Results (blob URLs instead of inline data URLs)
- [ ] Debounce state updates during mannequin transforms

---

## Quick Reference — Critical Technical Notes

| Topic | Detail |
|---|---|
| Three.js version | **Pin `three@0.181.0`** — SparkJS 2.0 requires r181 |
| Canvas antialias | **Must be `false`** — SparkJS Gaussian splats don't work with antialiasing |
| preserveDrawingBuffer | **Must be `true`** — required for `toDataURL()` capture |
| Camera clone patch | Override `camera.clone()` to skip non-clonable props (SparkJS LoD compat) |
| Marble API key | `VITE_MARBLE_API_KEY` env var — exposed client-side (hackathon only) |
| Marble rate limit | 6 generations/min — pre-generate worlds for demo day |
| SPZ resolution | Use 500k for real-time nav; 100k if performance is an issue |
| Collider mesh | GLB from Marble — loaded invisible, used only for raycast placement |

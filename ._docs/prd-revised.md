# CineBlock — Virtual Production Studio
### Revised Hackathon Build Spec · Standalone Demo

---

## What We're Building

A standalone web app where a filmmaker inputs location images (with azimuth angles), a shot list, and scene assets — then enters a Marble API-generated 3D Gaussian splat world to physically block each shot, place character/prop mannequins via raycast, and capture reference frames through a cinematic viewfinder. The output is a structured screenshot library grouped by shot, exportable as ZIP + dual-format JSON (human-readable + Aiuteur-compatible).

Self-contained demo. No backend. No auth. No Aiuteur integration during the hackathon.

**Target track:** Best Filmmaking, Entertainment, Simulation App

---

## Post-Hackathon Integration Context

> This section is NOT built during the hackathon. It documents how CineBlock plugs into Aiuteur after the event.

CineBlock will live as a **modal opened from Stage 10 (Frame Generation)** in Aiuteur's pipeline. When integrated:

- **Entry point:** Button in Stage 10's FramePanel or sidebar → opens `<VirtualProductionStudio>` modal
- **Props received:** `projectId`, `sceneId`, `selectedShot: ShotWithFrames`, `shots: ShotWithFrames[]`, scene assets, location views
- **Setup auto-populated:** Shot list from `ShotWithFrames[]`, assets from `SceneAssetInstance[]`, location images from `LocationView.image_key_url`
- **Captures flow back:** Hero frame → `frameService.uploadFrameImage(shotId, file, frameType, 'cineblock')` → populates shot's start/end frame
- **Alternate captures:** Become entries in `referenceImageOrder` array with `role: 'style'`
- **Camera metadata:** Hybrid fields map to Aiuteur's `camera_distance`, `camera_height`, `camera_movement`
- **Modal pattern:** `AnimatePresence` + `motion.div` full-screen overlay (same as InpaintingModal)
- **State management:** React Query mutations, invalidate `['frames', projectId, sceneId]` on close

**Key Aiuteur types this maps to:**
- `ShotWithFrames` — shot structure with start/end frames
- `Frame` — `{ frameType: 'start' | 'end', status, imageUrl }`
- `SceneAssetInstance` — per-scene asset with type/description/image
- `LocationView` — camera direction with azimuth, distance, height, image
- `ReferenceImageOrderEntry` — `{ label, assetName, url, type, role }`

---

## App Structure — 3 Views

```
[ 1. SETUP ] → [ 2. STUDIO ] → [ 3. RESULTS ]
```

Linear flow. Back-navigation allowed at any point. All state lives in React memory for the session.

---

## View 1: Setup

Three sections. Completed top-to-bottom. "Generate World & Enter Studio" CTA fires at the bottom.

---

### Section A — Location Images (Azimuth Slots)

A preset-slot uploader that maps directly to Marble's multi-image API.

**Four azimuth slots:**

| Slot | Azimuth | Suggested Content |
|---|---|---|
| Front (0°) | `0` | Eye-level hero angle |
| Right (90°) | `90` | Side view / perpendicular |
| Back (180°) | `180` | Opposite wall / reverse |
| Left (270°) | `270` | Other side / window wall |

**Behavior:**
- Each slot is a drop zone (drag & drop or file picker)
- Image previews as thumbnail within the slot with a remove button
- **Minimum 2 slots filled** to unlock the CTA (3+ recommended)
- Helper text per slot explaining the recommended angle
- All filled slots are passed to Marble's `images` array with their `azimuth_deg` values
- Supports jpg, png, webp

**Mapping to Marble API:**
```json
{
  "image_settings": {
    "images": [
      { "uri": "media_asset_id_front", "azimuth_deg": 0 },
      { "uri": "media_asset_id_right", "azimuth_deg": 90 },
      { "uri": "media_asset_id_back", "azimuth_deg": 180 }
    ]
  },
  "model_name": "Marble 0.1-mini"
}
```

**Aiuteur integration note:** These slots map to `LocationView` objects (establishing = front, directions = right/back/left). The azimuth angles map to `LocationView.camera_distance` + directional metadata.

---

### Section B — Scene Assets

A flat list of all characters and props present anywhere in the scene. No per-shot assignment here — that happens in the shot list.

Each asset row:

| Field | Input | Notes |
|---|---|---|
| Name | Text | e.g. "Marcus", "Kitchen knife" |
| Type | Select | `character` \| `prop` |
| Description | Text (1 line) | e.g. "tall man, 30s, grey hoodie" |

- "Add Asset" button appends a new row
- Trash icon removes a row
- This asset list is the master pool that shots draw from
- Characters are auto-assigned a consistent color from a palette (used for mannequins)

**Aiuteur field mapping:** `name` → `ProjectAsset.name`, `type` → `ProjectAsset.asset_type`, `description` → `SceneAssetInstance.effective_description`

---

### Section C — Shot List

Each shot is a structured card. Required fields are marked. Metadata fields are optional and displayed in a collapsible "Details" section.

**Required fields:**

| Field | Input | Notes |
|---|---|---|
| Shot name / ID | Text | e.g. "Shot 1", "1A" |
| Action / description | Textarea | What physically happens in the shot |
| Camera type | Select | Wide, Medium, Close-Up, OTS, POV, Two-Shot, Insert |
| Assets in shot | Checkbox list | Drawn from Section B asset pool |

**Optional metadata (collapsible "Details" section):**

| Field | Input | Aiuteur Mapping |
|---|---|---|
| Duration | Number (seconds), default 8, valid 1–30 | `Shot.duration` |
| Camera distance | Select: wide \| medium \| close | `Shot.camera_distance` |
| Camera height | Select: eye_level \| high_angle \| low_angle \| overhead \| ground_level | `Shot.camera_height` |
| Camera movement | Text, e.g. "slow dolly in", "static" | `Shot.camera_movement` |

**Camera type → Aiuteur mapping logic (applied during integration export):**

| CineBlock Type | → camera_distance | → camera_height (default) |
|---|---|---|
| Wide | wide | eye_level |
| Medium | medium | eye_level |
| Close-Up | close | eye_level |
| OTS | medium | eye_level |
| POV | close | eye_level |
| Two-Shot | medium | eye_level |
| Insert | close | eye_level |

If the user fills in the decomposed fields, those override the camera-type defaults.

**Asset checkbox behavior:**
- The checkbox list for each shot is auto-populated from the Section B asset pool
- User ticks which assets are visible/active in this shot
- Unchecked assets are noted as "off-screen" — their mannequins will be hidden by default when this shot is active in the Studio

"Add Shot" appends a new card. Shots stack in order — this order is preserved in the Studio sidebar and Results view.

**CTA:** "Generate World & Enter Studio" — disabled until ≥2 image slots filled + ≥1 shot defined. On click: images uploaded to Marble via `prepare_upload`, then `worlds:generate` fires, loading state shown ("Building your set… ~30-45 seconds"), polls `operations/{id}` until done, transitions to Studio on success.

---

## View 2: Studio

Split layout — 3D canvas left, Shot Sidebar right.

```
┌───────────────────────────────────┬─────────────────────┐
│                                   │  SHOT SIDEBAR       │
│           3D CANVAS               │                     │
│      (Marble Gaussian Splat)      │  ▶ Shot 1A — Wide   │
│                                   │    Shot 2A — OTS    │
│   ┌───────────────────────┐       │    Shot 3A — CU     │
│   │    VIEWFINDER BOX     │       │                     │
│   │   35MM  f/1.8   16:9  │       │  ── Active Shot ──  │
│   └───────────────────────┘       │  Action: Marcus     │
│                                   │  enters, sees knife │
│  [📷 Capture]  [Start│End]        │                     │
│  [Reset Camera] [Aspect ▾]        │  Assets:            │
│                                   │  👁 Marcus  [Place]  │
│                                   │  👁 Kitchen knife    │
│                                   │  – Detective (off)  │
│                                   │                     │
│                                   │  Start: 🖼 🖼        │
│                                   │  End:   🖼           │
└───────────────────────────────────┴─────────────────────┘
```

---

### 3D Canvas — SparkJS + R3F Hybrid

**Rendering stack:**
- `@react-three/fiber` as host React renderer
- `@sparkjsdev/spark` for Gaussian splat rendering
- SplatMesh loaded via `<primitive object={splatMesh} />` inside R3F scene
- Collider mesh (GLB from Marble API) loaded invisibly for raycast hit testing
- `@react-three/drei` for camera controls and TransformControls

**Camera controls:**
- `<OrbitControls>` from drei as default (orbit around point of interest)
- Optional `<PointerLockControls>` toggle for first-person WASD navigation
- Both modes use R3F's camera system, NOT SparkJS's built-in FpsMovement/PointerControls (to avoid conflicts)

**SparkJS setup (conceptual):**
```tsx
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

function MarbleWorld({ spzUrl }: { spzUrl: string }) {
  const sparkRef = useRef<SparkRenderer>();
  const splatRef = useRef<SplatMesh>();
  const { gl } = useThree();

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    sparkRef.current = spark;
    const splat = new SplatMesh({ url: spzUrl });
    splatRef.current = splat;
    return () => { /* cleanup */ };
  }, [spzUrl, gl]);

  return (
    <>
      {sparkRef.current && <primitive object={sparkRef.current} />}
      {splatRef.current && <primitive object={splatRef.current} />}
    </>
  );
}
```

**LOD:** Use the 500k resolution SPZ for real-time navigation (balance quality vs. performance). Load full_res only if performance allows.

---

### Viewfinder Overlay

- Fixed 2D rectangle rendered as an HTML overlay (NOT inside the R3F canvas) — positioned via CSS
- Aspect ratio selector in toolbar: `16:9` / `2.39:1` / `4:3` / `9:16`
- Lens info badge inside viewfinder: `35MM  f/1.8` + aspect ratio label (cosmetic, matching the UI mockups)
- Outside viewfinder: subtle dark vignette via CSS `box-shadow: inset`
- Rule-of-thirds grid lines inside viewfinder (subtle, togglable)
- Optional `● REC` indicator + `AF` label (cosmetic film camera feel, per mockups)
- **Captures crop to the viewfinder bounds only** — computed from the overlay's screen coordinates mapped to the WebGL canvas

---

### Shot Sidebar

Fixed right panel (~280–300px). The user's primary reference and control surface while in the world.

**Shot list (top section):**
- All shots listed in setup order
- Active shot highlighted with accent color
- Clicking a shot sets it as active — this updates:
  - The action description shown
  - The asset visibility state (assets unchecked in that shot auto-hide)
  - The capture tray shown below

**Active shot info:**
- Shot name + camera type badge (e.g. `Wide`, `OTS`)
- Action description (read-only reference)
- Optional metadata shown if filled in (duration, camera height/distance, movement) — small muted text, purely for the user to reference while positioning

**Asset visibility panel (middle section):**
- Lists every scene asset with its assigned color dot
- Each asset has:
  - **Eye toggle** (👁 = visible in world / – = hidden)
  - **Place button** — click-to-place mode: next click on the 3D canvas raycasts against the collider mesh and drops the mannequin at that point
- On shot switch: visibility resets to match that shot's checkbox selections from Setup
- User can manually override visibility at any time within a shot

**Capture tray (bottom section):**
- Two rows: **Start Frame** | **End Frame**
- Thumbnails of all captures taken for the active shot under each row
- Count badge per row (e.g. "Start: 3")
- Click thumbnail to view full-size

---

### Mannequin System

Each asset in the active shot can be placed as a 3D primitive in the world.

**Primitive types:**

| Asset type | Primitive | Notes |
|---|---|---|
| Character | Capsule + sphere (head) | Resizable, color-coded per character |
| Prop | Scaled box | Color-coded |

**Placement (raycast-based):**
1. User clicks "Place" button next to an asset in the sidebar
2. Cursor enters placement mode (crosshair cursor)
3. User clicks a point on the 3D canvas
4. Raycast fires against the invisible collider mesh (GLB from Marble API)
5. Mannequin spawns at the intersection point on the surface
6. If raycast misses (click on empty space), mannequin placed at a default distance from camera along the view direction

**Interaction:**
- Click mannequin → `<TransformControls>` gizmo appears (translate / rotate / scale)
- Click away to deselect gizmo
- Floating name label above each mannequin (HTML overlay via drei's `<Html>`)
- Right-click or sidebar "Remove" button to delete from world
- **Eye toggle = hidden means the mannequin is removed from the R3F scene** — not just invisible, fully unmounted

**Character colors:**
- Assigned at setup time from a fixed palette:
  `['#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4']`
- Consistent across the session (e.g. Marcus = blue, Detective = orange)

---

### Capture Flow

1. User selects active shot in sidebar
2. User selects **Start Frame** or **End Frame** via toggle in the toolbar
3. User positions camera using orbit/FPS controls to desired composition within the viewfinder
4. Clicks **"📷 Capture"** button or presses `Space`
5. Capture pipeline:
   a. Read WebGL canvas via `gl.domElement.toDataURL('image/png')`
   b. Create offscreen `<canvas>` element
   c. Calculate viewfinder bounds as pixel coordinates on the WebGL canvas
   d. Use `ctx.drawImage()` to crop to viewfinder region only
   e. Export cropped canvas as PNG data URL
6. Thumbnail added to active shot's capture tray under the correct frame type (Start or End)
7. No limit per shot — expect 3–4 per frame type in practice
8. All captures held in React state as data URLs for the session

---

### Toolbar (bottom-center, floating)

Styled to match the mockup UI — rounded pill shape, dark background.

| Control | Notes |
|---|---|
| 📷 Capture Take | Primary action button (prominent) |
| ▾ dropdown | Start Frame / End Frame toggle |
| ⟲ Reset Camera | Returns to world origin / default view |
| 🔧 Settings | Aspect ratio selector, grid toggle |
| ← Collapse sidebar | Full-canvas mode |

**Top-left toolbar (lens controls, cosmetic):**

| Control | Notes |
|---|---|
| 🌐 Lens selector | Dropdown: 35mm, 50mm, 85mm (cosmetic label only) |
| − / 100% / + | Zoom level display (cosmetic) |
| 🔍 ? | Help/shortcut reference |

**Top-right:** × Close button (returns to Setup with confirmation if captures exist)

---

## View 3: Results

Read-only. Structured view of everything captured.

### Layout

Shot cards in order, each showing:

```
Shot 1A — Wide
  Camera: Eye Level · Static · 8s
  Action: Marcus enters the kitchen, notices the knife on the counter

  START FRAMES              END FRAMES
  [img] [img] [img]         [img] [img]
   ★                         ★
```

- Clicking any thumbnail opens full-size lightbox
- Each image labeled with shot name + frame type
- **★ Hero selection:** User clicks a star icon on one capture per frame type to mark it as the "hero" (primary frame). The hero is what gets imported into Aiuteur during integration. Default: first capture is the hero.

### Export Options

**Download ZIP** — all screenshots as PNGs, structured:
```
cineblock-export/
  shot-01A-wide/
    start-01.png        ← hero marked in manifest
    start-02.png
    start-03.png
    end-01.png
    end-02.png
  shot-02A-ots/
    ...
```

**Export JSON (Human-Readable)** — CineBlock's own schema:
```json
{
  "exportedAt": "2026-03-15T14:32:00Z",
  "worldId": "marble_world_abc123",
  "scene": {
    "assets": [
      { "name": "Marcus", "type": "character", "description": "tall man, 30s, grey hoodie", "color": "#3B82F6" },
      { "name": "Kitchen knife", "type": "prop", "description": "" }
    ],
    "shots": [
      {
        "id": "shot-01A",
        "name": "Shot 1A",
        "cameraType": "Wide",
        "cameraHeight": "eye_level",
        "cameraDistance": "wide",
        "cameraMovement": "static",
        "duration": 8,
        "action": "Marcus enters the kitchen, notices the knife",
        "assetsInShot": ["Marcus", "Kitchen knife"],
        "startFrames": ["shot-01A-wide/start-01.png", "shot-01A-wide/start-02.png"],
        "endFrames": ["shot-01A-wide/end-01.png"],
        "heroStartFrame": "shot-01A-wide/start-01.png",
        "heroEndFrame": "shot-01A-wide/end-01.png"
      }
    ]
  }
}
```

**Export JSON (Aiuteur-Compatible)** — maps to Aiuteur's data model:
```json
{
  "exportedAt": "2026-03-15T14:32:00Z",
  "source": "cineblock",
  "version": "1.0",
  "worldId": "marble_world_abc123",
  "assets": [
    {
      "name": "Marcus",
      "asset_type": "character",
      "effective_description": "tall man, 30s, grey hoodie"
    },
    {
      "name": "Kitchen knife",
      "asset_type": "prop",
      "effective_description": ""
    }
  ],
  "shots": [
    {
      "shotId": "shot-01A",
      "action": "Marcus enters the kitchen, notices the knife",
      "camera": "Wide",
      "camera_distance": "wide",
      "camera_height": "eye_level",
      "camera_movement": "static",
      "duration": 8,
      "charactersForeground": ["Marcus"],
      "charactersForeground_props": ["Kitchen knife"],
      "startFrame": {
        "frameType": "start",
        "heroImageDataUrl": "<base64 png>",
        "alternateImageDataUrls": ["<base64 png>"]
      },
      "endFrame": {
        "frameType": "end",
        "heroImageDataUrl": "<base64 png>",
        "alternateImageDataUrls": []
      },
      "referenceImageOrder": [
        {
          "label": "CineBlock start frame",
          "assetName": "Scene Blocking",
          "url": "<hero start frame>",
          "type": "cineblock_capture",
          "role": "style"
        }
      ]
    }
  ]
}
```

**"Start Over"** — resets all state, returns to Setup.

---

## Tech Stack

### Scaffolding — Start from Scratch

```bash
npm create vite@latest cineblock -- --template react-ts
cd cineblock
npm install
npm install -D tailwindcss @tailwindcss/vite
```

**Why not the SensAI WebXR devkit?** The devkit (`sensai-webxr-worldmodels`) uses IWSDK, an ECS framework for VR headsets — no React, no JSX, no HTML/CSS UI, `.uikitml` markup. Adding React + Tailwind on top would mean fighting the architecture. The only reusable part is the SparkJS initialization pattern, which is straightforward to replicate in R3F directly.

### Dependencies

| Concern | Package | Notes |
|---|---|---|
| Framework | `react` + `vite` + `typescript` | `react-ts` Vite template |
| Styling | `tailwindcss` + `@tailwindcss/vite` | Vite plugin, no PostCSS config needed |
| 3D host | `@react-three/fiber` + `@react-three/drei` | R3F as scene graph, drei for controls/helpers |
| Gaussian splat | `@sparkjsdev/spark` (SparkJS 2.0 preview) | `npm install @sparkjsdev/spark@v2.0.0-preview` from GitHub |
| Three.js | `three` + `@types/three` | Pin to version compatible with SparkJS (r181 / `super-three@0.181.0` equivalent) |
| Collider mesh | drei's `useGLTF` | Load GLB from Marble API, set `visible={false}`, use as raycast target |
| Mannequin gizmos | `<TransformControls>` from drei | Translate / rotate / scale |
| Mannequin labels | `<Html>` from drei | Floating name labels in screen-space |
| Raycasting | `useThree` + `raycaster` | `raycaster.intersectObjects(colliderMesh)` on click |
| World generation | World Labs Marble API | Direct fetch calls, no SDK needed |
| API key | `VITE_MARBLE_API_KEY` in `.env` | Gitignored, exposed client-side (hackathon only) |
| Screenshot | `gl.domElement.toDataURL()` | Crop to viewfinder bounds via offscreen canvas 2D |
| ZIP export | `jszip` + `file-saver` | |
| UUID generation | `crypto.randomUUID()` | Built-in, no package needed |
| State | `useState` / `useReducer` | No backend, fully in-memory |
| Hosting | Vite dev server / Vercel | |

### SparkJS + R3F Integration

Reference the devkit's `gaussianSplatLoader.ts` for these patterns:

```tsx
// 1. SparkRenderer — must use R3F's WebGLRenderer instance
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

function MarbleWorld({ spzUrl, colliderUrl }: Props) {
  const { gl, scene } = useThree();
  const sparkRef = useRef<SparkRenderer>();
  const splatRef = useRef<SplatMesh>();

  useEffect(() => {
    // SparkRenderer wraps the existing WebGL renderer
    const spark = new SparkRenderer({ renderer: gl });
    sparkRef.current = spark;
    scene.add(spark); // Add to R3F scene

    const splat = new SplatMesh({ url: spzUrl });
    splatRef.current = splat;
    scene.add(splat);

    return () => {
      scene.remove(spark);
      scene.remove(splat);
      spark.dispose();
      splat.dispose();
    };
  }, [spzUrl, gl, scene]);

  return null; // Objects added imperatively, not via JSX
}
```

**Critical notes from the devkit:**
- **Disable antialiasing:** `<Canvas gl={{ antialias: false }}>` — required for SparkJS splat rendering
- **Three.js version:** Pin to r181 (`three@0.181.0`). SparkJS 2.0 preview targets this version. Mismatches cause runtime crashes.
- **Camera clone patch:** SparkJS LoD system deep-clones the camera each frame. If using drei controls that attach non-clonable objects to the camera, intercept `camera.clone()` to skip those properties (see devkit's `gaussianSplatLoader.ts` for the workaround).
- **LoD:** Enabled by default in SparkJS 2.0. Keeps frame rate stable by adjusting splat quality based on distance. Use 500k resolution SPZ for real-time nav; full_res as stretch goal.
- **preserveDrawingBuffer:** Set `<Canvas gl={{ preserveDrawingBuffer: true }}>` — required for `toDataURL()` capture to work (otherwise returns blank image).

---

## Marble API Integration

### Endpoints Used

| Step | Method | Endpoint | Notes |
|---|---|---|---|
| 1. Upload images | POST | `/marble/v1/media-assets:prepare_upload` | Returns signed URL per image |
| 2. PUT image | PUT | `<signed_upload_url>` | Upload jpg/png/webp |
| 3. Generate world | POST | `/marble/v1/worlds:generate` | Multi-image with azimuths |
| 4. Poll status | GET | `/marble/v1/operations/{operation_id}` | Until `done: true` |
| 5. Get world | GET | `/marble/v1/worlds/{world_id}` | Returns SPZ URLs + collider mesh URL |

### Generation Request Shape

```json
{
  "image_settings": {
    "images": [
      { "uri": "<media_asset_id>", "azimuth_deg": 0 },
      { "uri": "<media_asset_id>", "azimuth_deg": 90 },
      { "uri": "<media_asset_id>", "azimuth_deg": 180 }
    ]
  },
  "model_name": "Marble 0.1-mini"
}
```

### Response Shape (relevant fields)

```json
{
  "world_id": "abc123",
  "world_marble_url": "https://marble.worldlabs.ai/world/abc123",
  "assets": {
    "splats": {
      "spz_urls": {
        "100k": "https://...",
        "500k": "https://...",
        "full_res": "https://..."
      }
    },
    "mesh": {
      "collider_mesh_url": "https://...glb"
    },
    "imagery": {
      "pano_url": "https://..."
    },
    "caption": "A cozy treehouse interior..."
  }
}
```

### Budget

- Mini model: ~150-250 credits per generation (~$0.15)
- $5 minimum purchase = ~6,250 credits = ~25-40 mini generations
- Use mini for iteration, pre-generate hero worlds with plus model for demo

---

## Build Priority

### Day 1 — Core Loop (must be demo-able by end of day)

**P0 — Marble Integration:**
- [ ] Marble API client: `prepare_upload` → upload images → `worlds:generate` → poll → get world
- [ ] SparkJS + R3F integration: load SPZ, render in R3F canvas
- [ ] Collider mesh loading (invisible, for raycasting)
- [ ] Camera controls: OrbitControls (default) + optional PointerLockControls (FPS)

**P0 — Setup View:**
- [ ] Azimuth slot image uploader (4 slots, drag & drop)
- [ ] Asset list builder (name, type, description)
- [ ] Shot list builder with camera type + asset checkboxes
- [ ] CTA button: disabled state, loading state ("Building your set…"), transition to Studio

**P0 — Studio Core:**
- [ ] Split layout: 3D canvas + shot sidebar
- [ ] Viewfinder overlay (HTML, aspect ratio: 16:9 default)
- [ ] Shot sidebar: shot list, active shot selection, action description display
- [ ] Capture button → viewfinder crop → stores in shot tray with thumbnails
- [ ] Start / End frame toggle

### Day 2 — Depth + Polish

**P1 — Mannequin System:**
- [ ] Character capsule + sphere primitives with assigned colors
- [ ] Prop box primitives
- [ ] Click-to-place: "Place" button → crosshair cursor → raycast click on collider → spawn
- [ ] TransformControls gizmo on click (translate / rotate / scale)
- [ ] Floating name labels (`<Html>` from drei)
- [ ] Remove button / right-click delete

**P1 — Shot Workflow:**
- [ ] Asset visibility toggles (eye icon) + per-shot default state on shot switch
- [ ] Optional metadata display in sidebar (camera height, distance, movement, duration)
- [ ] Collapsible metadata "Details" section in shot cards

**P1 — Results View:**
- [ ] Shot cards grouped by shot, start/end frame rows
- [ ] Hero selection (star icon, default = first capture)
- [ ] Lightbox on thumbnail click
- [ ] ZIP export (structured folders)
- [ ] Dual JSON export (human-readable + Aiuteur-compatible)

**P2 — Polish:**
- [ ] Viewfinder cosmetics: lens badge, REC indicator, AF label, rule-of-thirds grid
- [ ] Sidebar collapse / full-canvas mode
- [ ] `Space` shortcut for capture
- [ ] Reset Camera button
- [ ] Top-left lens selector (cosmetic)
- [ ] Aspect ratio options: 16:9 / 2.39:1 / 4:3 / 9:16

### Cut If Needed

- [ ] Drag-to-reorder shots in Setup
- [ ] Camera position serialized per capture (return-to-angle)
- [ ] First-person WASD mode toggle (OrbitControls may suffice)
- [ ] Full-res SPZ loading (500k is likely sufficient)
- [ ] LoD (SparkJS 2.0 preview feature)

---

## State Shape

```typescript
// Top-level app state
interface CineBlockState {
  currentView: 'setup' | 'studio' | 'results';

  // Setup data
  locationImages: AzimuthSlot[];
  assets: CineBlockAsset[];
  shots: CineBlockShot[];

  // Marble world
  worldId: string | null;
  worldStatus: 'idle' | 'uploading' | 'generating' | 'polling' | 'ready' | 'error';
  worldError: string | null;
  spzUrl: string | null;       // 500k resolution
  colliderUrl: string | null;  // GLB mesh

  // Studio state
  activeShotIndex: number;
  activeFrameType: 'start' | 'end';
  assetVisibility: Record<string, boolean>;  // assetId → visible
  mannequinPlacements: MannequinPlacement[];
  captures: CaptureEntry[];
}

interface AzimuthSlot {
  azimuth: 0 | 90 | 180 | 270;
  label: string;         // "Front", "Right", "Back", "Left"
  file: File | null;
  previewUrl: string | null;
  mediaAssetId: string | null;  // From Marble upload
}

interface CineBlockAsset {
  id: string;            // Client-generated UUID
  name: string;
  type: 'character' | 'prop';
  description: string;
  color: string;         // From palette
}

interface CineBlockShot {
  id: string;            // Client-generated UUID
  name: string;          // "Shot 1A"
  action: string;
  cameraType: 'Wide' | 'Medium' | 'Close-Up' | 'OTS' | 'POV' | 'Two-Shot' | 'Insert';
  assetIds: string[];    // Which assets are in this shot
  // Optional metadata
  duration: number;      // Default 8
  cameraDistance?: 'wide' | 'medium' | 'close';
  cameraHeight?: 'eye_level' | 'high_angle' | 'low_angle' | 'overhead' | 'ground_level';
  cameraMovement?: string;
}

interface MannequinPlacement {
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  shotId: string;        // Placement is per-shot
}

interface CaptureEntry {
  id: string;
  shotId: string;
  frameType: 'start' | 'end';
  dataUrl: string;       // PNG data URL
  isHero: boolean;       // User-selected primary frame
  capturedAt: string;    // ISO timestamp
}
```

---

## Explicitly Out of Scope

- No database or backend
- No user auth
- No Aiuteur integration (during hackathon)
- No multi-scene support (single scene per session)
- No video generation
- No physics / mannequin animation
- No lighting controls
- No collaborative sessions
- No WebXR / VR headset support
- No SparkJS native camera controls (using R3F/drei controls instead)
- No session persistence (in-memory only, export is the persistence mechanism)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SparkJS + R3F integration friction | Medium | High | Test integration first (Day 1 morning). Fallback: use raw THREE.js without R3F |
| Marble API rate limits (6/min) | Low | Medium | Pre-generate hero worlds. Use mini model. Cache world IDs |
| Viewfinder capture quality | Low | Medium | Test `toDataURL` + crop pipeline early. Ensure canvas preserveDrawingBuffer |
| Mannequin raycast misses on thin collider | Medium | Low | Fallback: place at default distance along camera ray |
| SparkJS antialias conflict with R3F | Medium | Medium | Set `<Canvas gl={{ antialias: false }}>` per SparkJS docs |
| Large SPZ download time | Low | Medium | Use 500k instead of full_res. Show loading indicator |
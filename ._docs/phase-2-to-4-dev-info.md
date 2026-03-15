## Phase 2

Key Technical Concepts:
        - React + TypeScript + Vite project (react-ts template)
        - Tailwind CSS v4 with Vite plugin
        - `useReducer` + React Context for state management
        - Three.js (r181) + @react-three/fiber + @react-three/drei for 3D
        - @sparkjsdev/spark (v2.0.0-preview) for Gaussian splat rendering
        - World Labs Marble API for 3D world generation from images
        - Drag-and-drop file uploads with `URL.createObjectURL`
        - Vitest for testing (node environment, no testing-library)
        - Reducer-level testing pattern (no DOM rendering tests)
        - Marble API endpoints: `prepare_upload`, `uploadImage` (PUT to signed URL),     
     `worlds:generate`, `pollOperation`, `getWorld`
        - The correct Marble API `worlds:generate` request format (from
     https://docs.worldlabs.ai/api)

     3. Files and Code Sections:

        - **`._docs/dev-task-list.md`** — The master task list defining all phases. Phase      2 (lines 74-104) defines the Setup View requirements.

        - **`._docs/prd-revised.md`** — Project requirements doc. Contains the app       
     structure, state shape, API integration details. NOTE: The PRD's `image_settings`   
     format for the Marble API is WRONG — the actual API uses `world_prompt` format per  
     https://docs.worldlabs.ai/api.

        - **`src/views/SetupView.tsx`** — Complete rewrite from placeholder to full      
     implementation. Contains:
          - `AzimuthSlotCard` component: drag-and-drop zones with thumbnail previews,    
     remove buttons, helper text
          - `AssetRow` component: editable rows with color dot, name input, type select, 
     description, trash icon with confirmation
          - `ShotCard` component: shot name, camera type select (7 types), action        
     textarea, asset checkboxes, collapsible details (duration, camera
     distance/height/movement)
          - `LoadingOverlay` component: fixed overlay with spinner during world
     generation
          - Main `SetupView`: assembles all sections, handles CTA validation (≥2 images +      ≥1 named shot), wires to `uploadAndGenerate`
          - Color palette: `['#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#EF4444',      
     '#F59E0B', '#EC4899', '#06B6D4']`

        - **`src/services/marbleApi.ts`** — Marble API client. Key fixes applied:        
          - `PrepareUploadResponse.media_asset.id` changed to
     `media_asset.media_asset_id` (matching actual API response)
          - `generateWorld` request body — final correct format matching
     https://docs.worldlabs.ai/api:
          ```typescript
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
          ```

        - **`src/__tests__/setupPhase2.test.ts`** — New test file with 48 tests covering:          - Phase 2.1: Azimuth slot set/clear/replace, slot isolation, fill counting (6  
     tests)
          - Phase 2.2: Asset CRUD, color cycling, type switching, cascade deletion across      shots (9 tests)
          - Phase 2.3: Shot CRUD, all camera types, asset checkbox toggling, metadata    
     fields (14 tests)
          - Phase 2.4: CTA validation logic — all blocked/allowed combinations (12 tests)          - Full integration flow, error/retry, reset (3 tests)
          - Helper functions: `withImages()`, `withAsset()`, `withShot()`, `canProceed()`
        - **`src/__tests__/marbleApi.test.ts`** — Updated to match API fixes:
     `media_asset_id` field name, `model` instead of `model_name`, flat `content`        
     structure.

        - **`src/store.tsx`** — Unchanged. Already had all needed actions (ADD_ASSET,    
     REMOVE_ASSET, UPDATE_ASSET, ADD_SHOT, REMOVE_SHOT, UPDATE_SHOT, SET_AZIMUTH_SLOT,   
     CLEAR_AZIMUTH_SLOT, etc.)

        - **`src/types.ts`** — Unchanged. Already had complete type definitions.

## phase 3

  Phase 3 is implemented. Here's what was built:

  3.1 — Split Layout
  - CSS flex layout: 3D canvas (flex-grow) + sidebar (280px fixed)
  - Sidebar has 3 stacked sections: shot list, active shot info, capture tray
  - Sidebar scrolls independently when content overflows

  3.2 — Shot Sidebar — List & Selection
  - All shots rendered with name + camera type badge
  - Active shot highlighted with blue accent border/bg
  - Click shot → dispatches SET_ACTIVE_SHOT → updates info panel and capture tray        
  - Active shot section shows name, camera type badge, action description (read-only),   
  and optional metadata

  3.3 — Viewfinder Overlay
  - HTML div absolutely positioned over the canvas
  - 16:9 aspect ratio (aspect-video), centered, 80% height
  - Dark semi-transparent mask outside via box-shadow: 0 0 0 9999px rgba(0,0,0,0.5)      
  - pointer-events-none so it doesn't interfere with 3D controls

  3.4 — Capture Pipeline
  - Floating capture toolbar (dark pill) with Start/End frame toggle + red Capture button  - On capture: gl.domElement.toDataURL() → load into Image → crop to viewfinder pixel   
  bounds via offscreen canvas → store as CaptureEntry
  - First capture per shot+frameType auto-marked as isHero: true
  - Canvas onCreated callback stores the WebGL renderer ref for capture access

  3.5 — Capture Tray
  - Bottom sidebar section with two rows: "Start Frames" / "End Frames"
  - 60px thumbnails with count badges
  - Hero captures shown with amber/gold border + star icon
  - Click thumbnail → full-size lightbox modal (close via click outside, × button, or    
  Escape)

-

## Phase 4:

 Phase 4: Results View & Export — Summary

  4.1 — Results Layout
  - Shot cards in order, each showing: name + camera type badge, metadata line (height,  
  movement, duration), action text
  - Two thumbnail rows per shot: "Start Frames" and "End Frames" with count badges       
  - Empty state when no captures exist

  4.2 — Hero Selection
  - Star icon overlay on each thumbnail (appears on hover for non-hero, always visible   
  for hero)
  - Click star toggles isHero — only one hero per shot+frameType (uses existing
  TOGGLE_HERO action)
  - Hero thumbnails get gold/amber border + filled star

  4.3 — Lightbox
  - Click any thumbnail opens full-screen overlay with image, shot name, frame type      
  label, hero badge
  - Close via click outside, x button, or Escape key
  - Left/right arrow buttons + keyboard arrows to navigate between captures in the same  
  frame type

  4.4 — ZIP Export
  - Installed jszip + file-saver
  - Builds folder structure: cineblock-export/shot-{name}-{cameraType}/start-01.png      
  - Converts data URLs to blobs, downloads as cineblock-export.zip

  4.5 — JSON Export (Dual Format)
  - "Export JSON" button with dropdown: "CineBlock Format" / "Aiuteur-Compatible"        
  - CineBlock format matches the PRD schema (human-readable with file paths, hero        
  references)
  - Aiuteur format maps fields to Aiuteur names (asset_type, camera_distance,
  charactersForeground, referenceImageOrder, etc.)

  4.6 — Navigation Polish
  - "Done → Results" already in Studio toolbar
  - "Back to Studio" button in Results header
  - "Start Over" in Results: confirmation dialog → resets all state → Setup
  - "Back to Setup" from Studio: confirmation if captures exist ("You'll lose captures")

## Phase 5: Mannequin System

5.1 — Mannequin Primitives
- `CharacterMannequin` component: capsule body (CapsuleGeometry 0.2r, 0.7h) + sphere head (0.18r), colored by asset.color with 0.85 opacity
- `PropMannequin` component: box (0.4³ BoxGeometry), colored by asset.color with 0.85 opacity
- Both accept position/rotation/scale from MannequinPlacement
- Floating name label above each via drei's `<Html>` component with distanceFactor=8
- File: `src/components/Mannequins.tsx`

5.2 — Click-to-Place (Raycast)
- "Place" button in sidebar asset panel enters placement mode
- `PlacementRaycastHelper` R3F component: sets cursor to crosshair, listens for click
- On click: raycasts against collider mesh (traverses for all child Mesh objects)
- If hit: spawns mannequin at intersection point
- If miss: spawns at 5 units forward from camera along view direction
- Escape cancels placement mode
- Placement mode indicator shown in top toolbar

5.3 — TransformControls Gizmo
- `MannequinGizmo` wraps drei's `<TransformControls>` with mode state
- Click mannequin → select it → gizmo attaches (via conditional render)
- Keyboard shortcuts: G=translate, R=rotate, S=scale (global keydown listener)
- Click empty space (onPointerMissed on Canvas) → deselect
- On mouseUp: reads position/rotation/scale from object and dispatches UPDATE_MANNEQUIN
- `<OrbitControls makeDefault />` ensures TransformControls properly disables orbit during drag

5.4 — Asset Visibility Toggles
- Eye icon (👁) per asset in sidebar — toggles TOGGLE_ASSET_VISIBILITY
- Hidden assets (visibility[id] === false) are unmounted from the R3F scene (not just invisible)
- On shot switch: SET_ASSET_VISIBILITY resets to match the shot's assetIds (checked = visible)
- Uses useEffect with prevShotIndexRef to detect shot changes
- Default visibility is true (when key not in visibility map)

5.5 — Remove Mannequin
- "Remove" button in sidebar per placed mannequin (replaces "Place" button)
- Dispatches REMOVE_MANNEQUIN with assetId + shotId
- Clears selection if removed mannequin was selected
- After removal, "Place" button reappears for that asset

Store changes:
- New actions: SET_ASSET_VISIBILITY, ADD_MANNEQUIN, UPDATE_MANNEQUIN, REMOVE_MANNEQUIN
- TOGGLE_ASSET_VISIBILITY fixed: defaults to visible (true) when key is absent, using `?? true`
- SET_ASSET_VISIBILITY: replaces entire visibility map (used on shot switch)

Files modified:
- `src/store.tsx` — 4 new action types + reducer cases
- `src/views/StudioView.tsx` — New sidebar "Assets" section with visibility/place/remove controls, MannequinScene in Canvas, placement mode state
- `src/components/Mannequins.tsx` — New file with CharacterMannequin, PropMannequin, MannequinGizmo, PlacementRaycastHelper, MannequinScene
- `src/__tests__/mannequinPhase5.test.ts` — 16 tests covering ADD/UPDATE/REMOVE mannequin, visibility toggles, integration scenarios
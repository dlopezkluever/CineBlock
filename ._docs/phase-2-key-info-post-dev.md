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
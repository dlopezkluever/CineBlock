# Changes Made to Improve World Generation & Quality of User Experience: 
 Round 1: implemented configurable generation options at the API layer, then builds a 3-way input mode UI (guided / free upload / text-only) so users can choose the right approach for their content. (._docs/3.16/world-gen-p1-2-plan.md)                    

  src/types.ts — Added InputMode, FreeImageSlot,
  GenerationSettings types and extended CineBlockState with      
  inputMode, freeImages, sceneDescription, generationSettings.   

  src/store.tsx — Added 5 new actions (SET_INPUT_MODE,
  ADD_FREE_IMAGE, REMOVE_FREE_IMAGE, SET_SCENE_DESCRIPTION,      
  SET_GENERATION_SETTINGS), initial state defaults, and reducer  
  cases (with 8-image cap on free uploads).

  src/services/marbleApi.ts — Added GenerationOptions interface, 
  updated generateWorld to accept options (model, textPrompt,    
  reconstructImages, seed), added generateWorldFromText for      
  text-only generation, extracted pollUntilDone helper, updated  
  uploadAndGenerate to pass options through, added
  generateFromText orchestrator. Plus model gets 10min timeout vs   5min for mini.

  src/views/SetupView.tsx — 3-tab input mode toggle (4 Directions   / Free Upload / Text Only), FreeImageCard + FreeUploadDropzone   components, GenerationSettingsPanel (model + splat quality    
  selectors), scene description textarea (required for text mode,   optional for image modes), branching handleGenerate by mode   
  (guided sends azimuths, free sends azimuth: null +
  reconstructImages: true, text calls generateFromText),
  configurable splat resolution, model-aware loading overlay     
  timing, and mode-aware validation + disabled tooltips.

│ Verification                                          ││                                                       ││ 1. Guided mode: Upload 2+ images, select Mini/Plus,   ││ generate. Confirm azimuths sent correctly, splat      ││ resolution respected.                                 ││ 2. Free mode: Upload 2-8 images, confirm              ││ reconstruct_images: true and azimuth: null in request ││  payload. Verify world generates.                     ││ 3. Text mode: Enter description, generate. Confirm    ││ type: "text" prompt sent, no upload step.             ││ 4. Settings: Toggle model, verify loading overlay     ││ shows correct timing. Toggle splat resolution, verify ││  correct URL used.                                    ││ 5. Validation: Confirm button disabled when           ││ requirements not met per mode. Confirm hasShot        ││ required for all modes.                               ││ 6. Error handling: Test timeout with Plus model. Test ││  generation failure. Confirm retry works.     

### Round 2:  Input Validation & UX Polish  (adds validation feedback, contextual guidance, richer model info, and seed input — all advisory, non-blocking context from ._docs/3.16/world-gen-3-plan.md)


  3.1 — Image Dimension Validation
  - Added ImageDimensions interface to types.ts, extended both AzimuthSlot and FreeImageSlot
  - Updated store actions/reducer to carry and persist dimensions
  - Added getImageDimensions() utility and validateImages() pure function (error < 512px short side, warning on
  aspect/resolution mismatch)
  - Upload handlers (AzimuthSlotCard.handleFile, FreeUploadDropzone.handleFiles) are now async and pass dimensions to   dispatch
  - Per-card validation badges (green check / yellow ! / red X) and dimension text (1920×1080) displayed on filled   
  cards

  3.2 — Contextual Tips
  - Added MODE_TIPS constant with per-mode guidance text
  - Blue-tinted info banner with info icon renders after mode toggle, before content
  - Removed old per-mode <p> descriptions to avoid duplication

  3.3 — Model Cost/Quality Indicators
  - Added MODEL_INFO lookup with cost/time/quality/note per model
  - GenerationSettingsPanel now shows a dot-separated info line below selectors, updates dynamically on model change 

  3.4 — Seed Input
  - Added AdvancedSettingsPanel with collapsible chevron toggle
  - Seed number input (0–4,294,967,295) with "Random" clear button and helper text
  - handleGenerate now destructures and passes seed in all three API call branches

│ ---                                                                                                               ││ Verification                                                                                                      ││                                                                                                                   ││ - 3.1: Upload images with different resolutions/aspect ratios. Verify per-card badges (green/yellow/red) and      ││ dimension text. Verify generation is never blocked.                                                               ││ - 3.2: Switch between all three modes. Verify tip text changes. Verify old <p> descriptions are removed.          ││ - 3.3: Toggle between Mini and Plus. Verify info line updates with cost/time/quality.                             ││ - 3.4: Open Advanced, enter seed, generate — check network tab for seed in request body. Click Random, verify     ││ seed clears. Generate without seed — verify no seed in request.                                                   ││ - TypeScript: npx tsc --noEmit passes with no new errors.                                                         │╰───────────────────────────────────────────────────────────────────────────────────────
---

Round 3: World Generation Expanison Plan: 
This round impemented these features:                                                                           ││                                                                                     ││ 1. Auto-generated text prompts — "Compose from assets" button that builds a scene   ││ description from existing assets/shots                                              ││ 2. Video input mode — Upload a video walkthrough (MP4/WebM/MOV/AVI, max 100MB) to   ││ generate a world                                                                    ││ 3. Single image mode — Upload one reference photo to generate a world, plus "Open   ││ in Marble" link for expansion                                       

See ._docs/3.16/world-gen-4-plan.md
Phase 1 — Types & State:
  - src/types.ts: Extended InputMode with 'video' | 'single', added VideoSlot and      
  SingleImageSlot interfaces, added videoFile, singleImage, and worldMarbleUrl to      
  CineBlockState
  - src/store.tsx: Added 4 new actions (SET_VIDEO_FILE, CLEAR_VIDEO_FILE,
  SET_SINGLE_IMAGE, CLEAR_SINGLE_IMAGE), extended SET_WORLD_DATA with worldMarbleUrl,  
  added reducer cases and initial state

  Phase 2 — API Layer:
  - src/services/marbleApi.ts: Added kind parameter to prepareUpload, added
  generateWorldFromVideo, generateWorldFromImage, uploadVideoAndGenerate, and
  uploadImageAndGenerate functions

  Phase 3 — Compose & Marble Link:
  - src/utils/composeScenePrompt.ts: New pure utility that builds scene descriptions   
  from assets/shots
  - src/views/SetupView.tsx: Added "Compose from assets" button next to scene
  description label
  - src/views/SetupView.tsx: Passes worldMarbleUrl through SET_WORLD_DATA
  - src/views/StudioView.tsx: Added "Open in Marble" link with external-link icon in   
  the top bar

  Phase 4 — Video & Single-Image UI:
  - src/views/SetupView.tsx: Added VideoUploadDropzone and SingleImageDropzone
  components, expanded to 5 input mode tabs, updated canProceed validation,
  handleGenerate, status messages, and disabled hints


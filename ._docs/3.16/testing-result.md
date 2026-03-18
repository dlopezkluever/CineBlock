 All 251 tests pass (9 test files), including the 3 new test files covering all 3 rounds. Here's a summary of what was tested:

  Test Coverage Summary

  File: round1-inputModes-genSettings.test.ts
  Tests: ~55
  What it probes: Input modes (guided/free/text/video/single), free image 8-cap, scene description, generation settings
    (model/splat/seed), canProceed per mode, API options (textPrompt, reconstructImages, seed, model, azimuth null/present),
  prepareUpload
     kind param
  ────────────────────────────────────────
  File: round2-validation-ux.test.ts
  Tests: ~30
  What it probes: Image dimension validation (error <512px, warning on aspect/resolution mismatch, boundary at 512px), dimension
    persistence in store, MODE_TIPS completeness, MODEL_INFO cost/quality, seed input full lifecycle
  ────────────────────────────────────────
  File: round3-expansion.test.ts
  Tests: ~45
  What it probes: Video/SingleImage slot state (set/clear/replace), worldMarbleUrl storage, API: generateWorldFromVideo/Image (prompt    
    structure, seed, model, textPrompt, isPano), orchestrators (uploadVideoAndGenerate, uploadImageAndGenerate), composeScenePrompt      
    (assets, shots, empty names, separators), 5-tab mode switching, end-to-end integration flows

  ---
  Quick Manual UI Verification Guide

  Run npm run dev and go through each check:

  Round 1 — Input Modes & Settings:
  1. Mode tabs: Click each of the 5 tabs (4 Directions, Free Upload, Single Image, Video, Text Only) — UI should update, tip text should 
  change
  2. Free upload: Switch to "Free Upload", drop 2+ images — cards appear. Try adding past 8 (9th should be silently ignored)
  3. Text only: Switch to "Text Only", type a description. Button should enable. Clear it — button should disable
  4. Model selector: Toggle Mini/Plus — info line below should update with cost/time/quality
  5. Splat resolution: Change the resolution selector — confirm it updates

  Round 2 — Validation & UX:
  6. Image badges: Upload images of different sizes in "4 Directions" mode — look for green check (matching), yellow ! (aspect/resolution   mismatch), red X (< 512px short side)
  7. Dimension text: Each filled card should show WxH (e.g. "1920x1080") in the bottom bar
  8. Seed input: Click "Advanced" → type a seed number → click "Random" to clear. Generate with a seed, check Network tab for seed in the   request body
  9. Mode tips: Blue info banner should show different guidance text for each mode

  Round 3 — Video, Single Image, Compose:
  10. Video mode: Switch to "Video" tab, upload an MP4. Confirm dropzone appears, file name shown, button enables
  11. Single image mode: Switch to "Single Image", upload one photo. Button should enable
  12. Compose button: Add some assets + shots, then click "Compose from assets" next to the scene description label. Text should
  auto-populate
  13. Generate + Marble link: After any successful generation, navigate to Studio. Look for purple "Open in Marble" link in the top bar —   should link to the world on marble.worldlabs.ai
## Advanced Mannequin.md
mplementation Complete

  Files Created (4)

  - src/utils/ikSolver.ts — 2-bone IK solver using law of cosines with joint limits      
  (0-150deg)
  - src/utils/surfaceClamp.ts — Raycasts down/up to snap feet to collider mesh surfaces  
  - src/components/ArticulatedMannequin.tsx — Full humanoid body: torso, head, 2 arms    
  (upper+forearm+hand), 2 legs (upper+lower+foot), all proportionally scaled from        
  bodyParams
  - src/components/IKHandle.tsx — 4 draggable spheres (hands=cyan, feet=orange) that     
  solve IK on drag, disabling orbit controls during interaction

  Files Modified (4)

  - src/types.ts — Added MannequinPose, MannequinBodyParams, DEFAULT_POSE,
  DEFAULT_BODY_PARAMS; extended MannequinPlacement with optional pose? and bodyParams?   
  - src/store.tsx — Added UPDATE_MANNEQUIN_POSE and UPDATE_MANNEQUIN_BODY reducer actions
  - src/components/Mannequins.tsx — CharacterMannequin now renders <ArticulatedMannequin>   + <IKHandles> when selected; MannequinScene threads onPoseChange
  - src/views/StudioView.tsx — Added "Mannequin Build" sidebar section with height       
  (0.5-2.5m) and build (0.5-2.0x) sliders; surface clamping on transform end;
  handlePoseChange callback

  Tests Created (1)

  - src/__tests__/mannequinPhase7.test.ts — Covers reducer actions (pose, body, backward 
  compat), IK solver (in-range, beyond-reach, near-zero, joint limits), and full
  integration flow

  Verification

  - tsc --noEmit — zero errors
  - vitest run — 123 tests pass across 6 test files
  - npm run build — builds successfully
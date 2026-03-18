This is great research. It confirms several of my suspicions and reveals things I      
  missed. Here's my synthesis:

  ---
  Root Cause Ranking (updated with research)

  1. Double-raycast anti-pattern — HIGHEST PRIORITY

  The research confirms this is a known anti-pattern. Our clampToSurface fires a vertical   ray (0,-1,0) on a collider that's rotated by Math.PI around X. After that rotation,   
  "world down" and "collider surface normal" don't align the way the code assumes. The   
  vertical ray hits a different triangle or misses entirely, producing a different Y.    
  This is almost certainly the biggest contributor.

  Fix: On initial placement, skip clampToSurface entirely. Just use hits[0].point        
  directly and add feetOffset to Y.

  2. Collider may be double-flipped — HIGH PRIORITY

  This is the insight I missed. glTF spec mandates Y-up. If the collider .glb is already 
  Y-up, then rotation={[Math.PI, 0, 0]} flips it again — inverting it vertically and     
  displacing it. The splat needs Math.PI because it comes from a CV pipeline (Y-down),   
  but the collider may already be in the correct orientation.

  Fix: Temporarily make the collider visible as wireframe. If it's upside-down or offset 
  from the splat, remove its rotation={[Math.PI, 0, 0]} and see if it aligns.

  3. SparkJS visual-only transforms — MEDIUM PRIORITY

  The research flags that splat.rotation.x = Math.PI may only affect the shader/visual   
  rendering, not the spatial data. If that's the case, the splat appears Y-up visually   
  but its coordinate system is still Y-down internally. This wouldn't affect us directly 
  (we don't raycast the splat), but it could mean the collider needs a different
  transform than the splat to align visually.

  4. Missing updateMatrixWorld in clampToSurface — LOW-MEDIUM

  Confirmed by research: stale world matrices cause "subtly offset" hits. clampToSurface 
  is called from handleTransformEnd and the height slider without ensuring matrices are  
  fresh.

  5. Portal camera mismatch — LOW (but easy to rule out)

  Research says the risk is real. Quick console.log(camera.uuid) in both the main scene  
  and inside the portal would confirm/eliminate this.

  ---
  Recommended Action Plan (when we code)

  ┌──────┬────────────────────────────────────────────────┬──────────────────────────┐   
  │ Step │                     Action                     │         Purpose          │   
  ├──────┼────────────────────────────────────────────────┼──────────────────────────┤   
  │ 1    │ Make collider visible (wireframe,              │ Verify alignment with    │   
  │      │ semi-transparent)                              │ splat                    │   
  ├──────┼────────────────────────────────────────────────┼──────────────────────────┤   
  │ 2    │ Log camera.uuid in portal vs main scene        │ Rule out camera mismatch │   
  ├──────┼────────────────────────────────────────────────┼──────────────────────────┤   
  │ 3    │ Log raw hits[0].point vs final position after  │ See exactly where error  │   
  │      │ clamp                                          │ is introduced            │   
  ├──────┼────────────────────────────────────────────────┼──────────────────────────┤   
  │ 4    │ Kill clampToSurface on initial placement; use  │ Fix the double-raycast   │   
  │      │ hit point + feetOffset directly                │ anti-pattern             │   
  ├──────┼────────────────────────────────────────────────┼──────────────────────────┤   
  │ 5    │ Test collider WITHOUT rotation={[Math.PI, 0,   │ Check if glb is already  │   
  │      │ 0]}                                            │ Y-up                     │   
  ├──────┼────────────────────────────────────────────────┼──────────────────────────┤   
  │ 6    │ Add updateMatrixWorld(true) inside             │ Fix stale matrices for   │   
  │      │ clampToSurface                                 │ drag/slider              │   
  └──────┴────────────────────────────────────────────────┴──────────────────────────┘   

  Steps 1-3 are diagnostic (no behavior change). Steps 4-6 are fixes. I'd do the
  diagnostics first to confirm which combination of issues we're actually hitting.       

  ---
  I feel prepared enough to proceed — the research gave us the key insights (especially  
  the double-flip and double-raycast issues). I don't think another research round is    
  needed. Want me to start with the diagnostic logging, or go straight to the fixes?  
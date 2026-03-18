 Deep Analysis

  I've investigated the SparkJS source code (@sparkjsdev/spark    
  v2.0.0-preview) and combined it with what I know about the      
  rendering pipeline. Here's what I found:

  Confirmed facts from SparkJS internals

  - SparkRenderer extends THREE.Mesh — it's a regular Three.js    
  mesh in the scene
  - depthWrite: false by default (line 9815 of spark.module.js) — 
  splats don't write depth
  - depthTest: true by default — splats DO test against existing  
  depth
  - SparkJS has saveRenderState() / resetRenderState() that save  
  render target and autoClear, but does NOT save/restore
  depth-related WebGL state

  Why the current fix likely fails

  There are two likely culprits:

  1. scene.overrideMaterial may be broken/deprecated in Three.js  
  r181 (0.181.0)

  Three.js has been deprecating Scene.overrideMaterial in recent  
  versions. If it silently does nothing in r181, the collider     
  renders with its original GLTF materials — meaning it writes    
  both color AND depth. But the user doesn't see a visible        
  collider mesh in the screenshots, which would suggest either:   
  - overrideMaterial IS working (suppresses color) but somehow    
  depth isn't being preserved between passes
  - OR the collider isn't rendering at all in the separate        
  depthScene

  2. WebGL state leakage between separate gl.render() calls       

  SparkJS modifies the WebGL context during the main scene render 
  (setting depthMask(false) for its material). Three.js caches    
  WebGL state. When we start a NEW gl.render(depthScene) call,    
  Three.js's state cache might be stale if SparkJS did anything   
  outside Three.js's tracking. The depthMat says depthWrite: true,   but if the cached state is wrong, Three.js might not actually  
  call gl.depthMask(true).

  Two solution approaches

  Approach A (simplest): Enable depthWrite: true on SparkRenderer 
  directly

  The SparkJS API accepts this:
  new SparkRenderer({ renderer: gl, depthWrite: true })
  If splats write depth themselves, we don't need ANY collider    
  trickery. Just skip clearDepth() and mannequins depth-test      
  against splat depth naturally. Downside: splat depth values are 
  per-quad-center, so occlusion edges may be slightly noisy. But  
  it may be "good enough."

  Approach B (robust): Render collider depth-only INSIDE the main 
  scene pass, not separately

  Instead of a separate gl.render(depthScene) call, make the      
  collider visible with depth-only materials before
  gl.render(scene, camera), so it renders as part of the same
  pass. This completely eliminates cross-pass state issues:       

  1. Before main render: set collider.visible = true, manually    
  swap each child mesh's material to depthMat
  2. gl.render(scene, camera) — collider renders as opaque (before   splats), writes depth, no color
  3. After render: restore materials + visibility
  4. Don't clear depth
  5. gl.render(overlayScene, camera) — mannequins depth-test      
  against collider depth

  This avoids overrideMaterial entirely (manual material swap) and   avoids separate render passes (single gl.render for main +     
  collider).

  My recommendation

  Try Approach A first (one-line change in MarbleWorld.tsx) since 
  it's the simplest. If splat depth quality is too noisy, fall    
  back to Approach B.

  Want me to implement?

  ▎ I'm building a React Three Fiber app that places 3D mannequins onto a Gaussian splat 
  (3DGS) world. The splat is loaded via SparkJS (SplatMesh) and has rotation.x = Math.PI 
  to convert from Y-down (CV convention) to Y-up (Three.js). A separate invisible        
  collider mesh (loaded via useGLTF from a .glb URL) has the same rotation={[Math.PI, 0, 
  0]} and is used for raycasting.

  ▎ The problem: when I click on the scene to place an asset, it doesn't appear where I  
  clicked. It floats above the surface and appears horizontally offset.

  ▎ My placement pipeline:
  ▎ 1. User clicks canvas → native DOM click handler converts clientX/clientY to NDC →   
  Raycaster.setFromCamera(mouse, camera) → intersectObjects against the invisible        
  collider's child meshes → returns hits[0].point in world space
  ▎ 2. That point is passed to clampToSurface() which does a second raycast straight down   (0,-1,0) from (x, y+10, z) against the same collider meshes → returns [x, hitY +      
  feetOffset, z]
  ▎ 3. Result is stored as the mannequin group's position

  ▎ The mannequins are rendered in a separate Three.js scene via R3F createPortal (for   
  overlay rendering), while the collider lives in the main scene.

  ▎ Questions:
  ▎ 1. When using THREE.Raycaster.intersectObjects on meshes whose parent has visible:   
  false, does Three.js skip them? Does behavior differ across Three.js versions (r150+)? 
  ▎ 2. When raycasting against child meshes extracted via traverse() from a group with   
  rotation.x = Math.PI, does intersectObjects correctly use the meshes' world matrices   
  (including the parent's rotation)?
  ▎ 3. Is there a known issue with setFromCamera when the camera is obtained via         
  useThree() inside an R3F createPortal? Could the portal give a stale or incorrect      
  camera reference?
  ▎ 4. For Gaussian splats, is there a common alignment issue between the visual splat   
  and a separately-generated collider mesh? How do tools like Polycam, Luma, or Niantic's   Scaniverse handle collider/splat alignment?
  ▎ 5. Is the double-raycast pattern (camera ray → then vertical clamp ray) a known      
  anti-pattern for surface placement? Would it be better to just use the initial camera  
  ray hit point directly and only adjust Y by a constant offset?
  ▎ 6. In SparkJS's SplatMesh, does rotation.x = Math.PI correctly transform the splat's 
  world-space positions, or does SparkJS handle transforms differently than standard     
  Three.js objects (e.g., does it bypass the model matrix)?
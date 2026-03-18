# Occlusion Approach B: Collider Depth-Only in Main Scene Pass

## When to use this

If Approach A (`depthWrite: true` on SparkRenderer) causes visual artifacts in the splats — such as splats disappearing at certain angles, z-fighting between splats, or noisy edges — this approach achieves occlusion using the collider mesh instead of splat depth.

## How it works

Gaussian splats don't write to the depth buffer by default (`depthWrite: false`). The collider mesh (GLTF loaded by `MarbleWorld.tsx`) is a triangulated approximation of the world surface used for raycasting. We can render it **depth-only** (writes depth, no color output) as part of the main scene render pass, so the depth buffer contains world geometry depth values that mannequins can test against.

The key insight: render the collider inside `gl.render(scene, camera)` — the same render call that draws splats — rather than in a separate `gl.render(depthScene, camera)`. This avoids WebGL state leakage between render passes and issues with `scene.overrideMaterial` in newer Three.js versions.

## Implementation

### Step 1: Revert SparkRenderer to default depthWrite

In `src/components/MarbleWorld.tsx`, remove `depthWrite: true`:

```diff
- const spark = new SparkRenderer({ renderer: gl, depthWrite: true });
+ const spark = new SparkRenderer({ renderer: gl });
```

### Step 2: Pass colliderRef into MannequinOverlay

In `src/views/StudioView.tsx`:

```tsx
<MannequinOverlay occlude={state.mannequinOcclusion} colliderRef={colliderRef}>
```

### Step 3: Rewrite MannequinOverlay

In `src/components/Mannequins.tsx`, replace the `MannequinOverlay` component:

```tsx
interface MannequinOverlayProps {
  children: React.ReactNode;
  occlude?: boolean;
  colliderRef?: React.RefObject<THREE.Object3D | null>;
}

export function MannequinOverlay({ children, occlude = false, colliderRef }: MannequinOverlayProps) {
  const overlayScene = useMemo(() => new THREE.Scene(), []);
  const depthMat = useMemo(
    () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
    [],
  );

  useFrame(({ gl, scene, camera }) => {
    const collider = occlude ? colliderRef?.current ?? null : null;
    const meshBackups: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];

    // Before main render: make collider visible with depth-only material
    if (collider) {
      collider.visible = true;
      collider.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          meshBackups.push({ mesh, material: mesh.material });
          mesh.material = depthMat;
          mesh.renderOrder = -1; // render before splats (opaque pass)
        }
      });
    }

    // Step 1: render main scene — collider writes depth (no color), splats draw color
    gl.render(scene, camera);

    // Restore collider to invisible with original materials
    if (collider) {
      collider.visible = false;
      meshBackups.forEach(({ mesh, material }) => {
        mesh.material = material;
        mesh.renderOrder = 0;
      });
    }

    // Step 2: render mannequins — depth-test against collider depth values
    gl.autoClear = false;
    if (!occlude) gl.clearDepth();
    gl.render(overlayScene, camera);
    gl.autoClear = true;
  }, 1);

  return <>{createPortal(children, overlayScene)}</>;
}
```

## Why this works

1. The collider renders as an **opaque** object (MeshBasicMaterial) with `renderOrder: -1`, so Three.js draws it in the opaque pass **before** transparent splats.
2. `colorWrite: false` means no visible pixels — the collider is invisible to the user.
3. `depthWrite: true` fills the depth buffer with world surface depth values.
4. Splats render after with `depthWrite: false` (default) — they don't overwrite the collider's depth.
5. Mannequins render in the overlay pass with `depthTest: true` — fragments behind world geometry fail the depth test and are hidden.

All of this happens within a **single** `gl.render(scene, camera)` call for the collider + splats, which avoids the cross-pass state issues that broke the original separate-depthScene approach.

## Trade-offs vs Approach A

| | Approach A (splat depthWrite) | Approach B (collider depth) |
|---|---|---|
| Simplicity | One-line change | ~30 lines, material swapping per frame |
| Occlusion accuracy | Per-splat-quad depth (noisy edges) | Per-collider-triangle depth (smooth but approximate) |
| Performance | Negligible overhead | Extra material swap traversal per frame |
| Edge quality | May have holes where splats are sparse | Smooth edges but may not match splat visual exactly |
| Failure mode | Splat visual artifacts | Occlusion edges don't perfectly match visible geometry |

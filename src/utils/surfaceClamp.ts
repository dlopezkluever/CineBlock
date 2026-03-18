import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _downDir = new THREE.Vector3(0, -1, 0);
const _upDir = new THREE.Vector3(0, 1, 0);

/**
 * Compute the Y offset from group origin to the bottom of the character's feet.
 * The character mesh has feet slightly above Y=0 due to skeleton proportions.
 * Returns a negative value: the group must be placed below the surface hit point
 * so that feet visually touch the ground.
 */
export function computeFeetOffset(height: number, build: number): number {
  const pelvisY = 0.53 * height;
  const legs = 0.23 * height + 0.24 * height;
  const footRadius = 0.025 * build;
  return -(pelvisY - legs - footRadius); // negative: group sits below surface
}

/**
 * Raycasts downward (then upward) from a position to find the surface Y.
 * Returns clamped [x, hitY + feetOffset, z] or null if no hit.
 */
export function clampToSurface(
  position: [number, number, number],
  colliderRef: React.RefObject<THREE.Object3D | null>,
  feetOffset: number = 0,
): [number, number, number] | null {
  const collider = colliderRef.current;
  if (!collider) return null;

  collider.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  collider.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  if (meshes.length === 0) return null;

  const [x, y, z] = position;

  // Try raycast downward from above
  _ray.set(new THREE.Vector3(x, y + 10, z), _downDir);
  let hits = _ray.intersectObjects(meshes, false);
  if (hits.length > 0) {
    return [x, hits[0].point.y + feetOffset, z];
  }

  // Try raycast upward from below
  _ray.set(new THREE.Vector3(x, y - 10, z), _upDir);
  hits = _ray.intersectObjects(meshes, false);
  if (hits.length > 0) {
    return [x, hits[0].point.y + feetOffset, z];
  }

  return null;
}

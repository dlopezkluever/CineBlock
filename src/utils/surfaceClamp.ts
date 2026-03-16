import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _downDir = new THREE.Vector3(0, -1, 0);
const _upDir = new THREE.Vector3(0, 1, 0);

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

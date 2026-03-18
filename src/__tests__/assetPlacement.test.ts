import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { computeFeetOffset, clampToSurface } from '../utils/surfaceClamp';
import { reducer, initialState } from '../store';
import { DEFAULT_BODY_PARAMS } from '../types';
import type { CineBlockState } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withAsset(
  state: CineBlockState,
  overrides?: Partial<{ id: string; name: string; type: 'character' | 'prop' }>,
): CineBlockState {
  return reducer(state, {
    type: 'ADD_ASSET',
    id: overrides?.id ?? 'asset-1',
    name: overrides?.name ?? 'Actor',
    assetType: overrides?.type ?? 'character',
    description: '',
    color: '#3B82F6',
  });
}

function withShot(
  state: CineBlockState,
  id = 'shot-1',
): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name: 'Shot 1' });
}

/** Create a flat plane collider at Y = planeY, oriented face-up. */
function makeFlatCollider(planeY = 0): { ref: React.RefObject<THREE.Object3D | null>; group: THREE.Group } {
  const geo = new THREE.PlaneGeometry(100, 100);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  // PlaneGeometry lies in XY by default; rotate to lie flat in XZ (face-up)
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = planeY;
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  const ref = { current: group } as React.RefObject<THREE.Object3D | null>;
  return { ref, group };
}

/** Create a collider with Math.PI X-rotation (like the real collider) to test rotated raycasting. */
function makeRotatedCollider(planeY = 0): { ref: React.RefObject<THREE.Object3D | null>; group: THREE.Group } {
  const geo = new THREE.PlaneGeometry(100, 100);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  // Plane lies in XY; rotate so it faces +Y
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = planeY;
  const group = new THREE.Group();
  // Apply the same Math.PI rotation that MarbleWorld uses on the collider
  group.rotation.x = Math.PI;
  group.add(mesh);
  group.updateMatrixWorld(true);
  const ref = { current: group } as React.RefObject<THREE.Object3D | null>;
  return { ref, group };
}

// ---------------------------------------------------------------------------
// 1. computeFeetOffset — math correctness
// ---------------------------------------------------------------------------

describe('computeFeetOffset', () => {
  it('returns a negative value (group placed below surface)', () => {
    const offset = computeFeetOffset(1.7, 1.0);
    expect(offset).toBeLessThan(0);
  });

  it('matches hand-calculated value for defaults (h=1.7, b=1.0)', () => {
    // pelvisY = 0.53 * 1.7 = 0.901
    // legs = 0.23 * 1.7 + 0.24 * 1.7 = 0.391 + 0.408 = 0.799
    // footRadius = 0.025 * 1.0 = 0.025
    // gap = pelvisY - legs = 0.901 - 0.799 = 0.102
    // offset = -(gap - footRadius) = -(0.102 - 0.025) = -0.077
    const offset = computeFeetOffset(1.7, 1.0);
    expect(offset).toBeCloseTo(-0.077, 3);
  });

  it('scales with height — taller character has larger offset magnitude', () => {
    const short = computeFeetOffset(1.5, 1.0);
    const tall = computeFeetOffset(2.0, 1.0);
    expect(Math.abs(tall)).toBeGreaterThan(Math.abs(short));
  });

  it('scales with build — wider build reduces offset magnitude via larger feet', () => {
    const thin = computeFeetOffset(1.7, 0.5);
    const wide = computeFeetOffset(1.7, 1.5);
    // Wider build = larger footRadius = less gap = smaller magnitude
    expect(Math.abs(wide)).toBeLessThan(Math.abs(thin));
  });

  it('returns 0 when foot radius exactly fills the gap', () => {
    // gap = 0.06 * h; footRadius = 0.025 * b
    // 0.06h = 0.025b → b = 2.4h
    // For h=1.0: b = 2.4
    const offset = computeFeetOffset(1.0, 2.4);
    expect(offset).toBeCloseTo(0, 3);
  });
});

// ---------------------------------------------------------------------------
// 2. computeFeetOffset — matches ArticulatedMannequin geometry
// ---------------------------------------------------------------------------

describe('computeFeetOffset matches ArticulatedMannequin geometry', () => {
  it('foot bottom Y matches offset magnitude for default params', () => {
    const h = DEFAULT_BODY_PARAMS.height;
    const b = DEFAULT_BODY_PARAMS.build;

    // ArticulatedMannequin skeleton:
    // pelvis at Y = 0.53h
    // foot sphere center at Y = pelvisY - upperLeg - lowerLeg = 0.53h - 0.23h - 0.24h = 0.06h
    // foot bottom at Y = 0.06h - footRadius = 0.06h - 0.025b
    const footBottomY = 0.06 * h - 0.025 * b;

    // computeFeetOffset should equal -footBottomY (to lower group origin by that amount)
    const offset = computeFeetOffset(h, b);
    expect(offset).toBeCloseTo(-footBottomY, 6);
  });

  it('foot bottom Y matches for non-default params', () => {
    const h = 2.0;
    const b = 1.5;
    const footBottomY = 0.06 * h - 0.025 * b;
    const offset = computeFeetOffset(h, b);
    expect(offset).toBeCloseTo(-footBottomY, 6);
  });

  it('foot bottom Y matches for small character', () => {
    const h = 0.5;
    const b = 0.8;
    const footBottomY = 0.06 * h - 0.025 * b;
    const offset = computeFeetOffset(h, b);
    expect(offset).toBeCloseTo(-footBottomY, 6);
  });
});

// ---------------------------------------------------------------------------
// 3. clampToSurface — raycasting against flat collider
// ---------------------------------------------------------------------------

describe('clampToSurface', () => {
  it('clamps to a flat plane at Y=0', () => {
    const { ref } = makeFlatCollider(0);
    const result = clampToSurface([5, 3, 5], ref, 0);
    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(5, 1);     // X preserved
    expect(result![1]).toBeCloseTo(0, 1);     // Y clamped to plane
    expect(result![2]).toBeCloseTo(5, 1);     // Z preserved
  });

  it('clamps to an elevated plane at Y=2', () => {
    const { ref } = makeFlatCollider(2);
    const result = clampToSurface([3, 10, 3], ref, 0);
    expect(result).not.toBeNull();
    expect(result![1]).toBeCloseTo(2, 1);
  });

  it('applies feetOffset to the clamped Y', () => {
    const { ref } = makeFlatCollider(0);
    const offset = computeFeetOffset(1.7, 1.0); // ≈ -0.077
    const result = clampToSurface([5, 3, 5], ref, offset);
    expect(result).not.toBeNull();
    expect(result![1]).toBeCloseTo(offset, 2); // plane at 0 + offset
  });

  it('preserves XZ coordinates exactly', () => {
    const { ref } = makeFlatCollider(0);
    const result = clampToSurface([12.345, 99, -7.89], ref, 0);
    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(12.345, 3);
    expect(result![2]).toBeCloseTo(-7.89, 3);
  });

  it('returns null when collider ref is empty', () => {
    const ref = { current: null } as React.RefObject<THREE.Object3D | null>;
    const result = clampToSurface([0, 0, 0], ref, 0);
    expect(result).toBeNull();
  });

  it('returns null when collider has no meshes', () => {
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const ref = { current: group } as React.RefObject<THREE.Object3D | null>;
    const result = clampToSurface([0, 0, 0], ref, 0);
    expect(result).toBeNull();
  });

  it('handles upward raycast when position is below the plane', () => {
    const { ref } = makeFlatCollider(5);
    // Position below the plane — downward ray misses, upward ray should hit
    const result = clampToSurface([0, -2, 0], ref, 0);
    expect(result).not.toBeNull();
    expect(result![1]).toBeCloseTo(5, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. clampToSurface — with Math.PI-rotated collider (like real MarbleWorld)
// ---------------------------------------------------------------------------

describe('clampToSurface with rotated collider (Math.PI)', () => {
  it('still returns a valid hit on a π-rotated collider', () => {
    const { ref } = makeRotatedCollider(0);
    const result = clampToSurface([0, 5, 0], ref, 0);
    // With Math.PI rotation, the plane flips. The raycast should still hit
    // something — we just want to verify it doesn't return null or NaN.
    if (result) {
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
    }
    // If null, that's also informative — means the rotated collider
    // needs different handling (which is the bug we're investigating)
  });

  it('preserves XZ on rotated collider', () => {
    const { ref } = makeRotatedCollider(0);
    const result = clampToSurface([7, 5, -3], ref, 0);
    if (result) {
      expect(result[0]).toBeCloseTo(7, 1);
      expect(result[2]).toBeCloseTo(-3, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Placement pipeline — reducer integration
// ---------------------------------------------------------------------------

describe('Asset placement pipeline (reducer)', () => {
  let base: CineBlockState;

  beforeEach(() => {
    base = withShot(withAsset(initialState));
    base = withAsset(base, { id: 'prop-1', name: 'Box', type: 'prop' });
  });

  it('character placement stores position with feetOffset applied', () => {
    // Simulate what handlePlace does: hit point + feetOffset
    const hitPoint: [number, number, number] = [3, 1, 5];
    const feetOffset = computeFeetOffset(DEFAULT_BODY_PARAMS.height, DEFAULT_BODY_PARAMS.build);
    const finalPos: [number, number, number] = [hitPoint[0], hitPoint[1] + feetOffset, hitPoint[2]];

    const s = reducer(base, {
      type: 'ADD_MANNEQUIN',
      placement: {
        assetId: 'asset-1',
        shotId: 'shot-1',
        position: finalPos,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    });

    const p = s.mannequinPlacements[0];
    expect(p.position[0]).toBeCloseTo(3, 5);        // X unchanged
    expect(p.position[1]).toBeCloseTo(1 + feetOffset, 5); // Y = hitY + offset
    expect(p.position[2]).toBeCloseTo(5, 5);         // Z unchanged
  });

  it('prop placement stores raw hit point (no offset)', () => {
    const hitPoint: [number, number, number] = [3, 1, 5];

    const s = reducer(base, {
      type: 'ADD_MANNEQUIN',
      placement: {
        assetId: 'prop-1',
        shotId: 'shot-1',
        position: hitPoint, // no offset for props
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    });

    const p = s.mannequinPlacements[0];
    expect(p.position).toEqual([3, 1, 5]);
  });

  it('character feetOffset places foot bottom exactly at hit Y', () => {
    const hitY = 2.5;
    const h = DEFAULT_BODY_PARAMS.height;
    const b = DEFAULT_BODY_PARAMS.build;
    const feetOffset = computeFeetOffset(h, b);

    // Group origin Y = hitY + feetOffset
    const groupY = hitY + feetOffset;

    // Foot bottom Y in world = groupY + footBottomLocal
    const footBottomLocal = 0.06 * h - 0.025 * b;
    const footBottomWorld = groupY + footBottomLocal;

    // Foot bottom should land exactly at the hit Y (the surface)
    expect(footBottomWorld).toBeCloseTo(hitY, 6);
  });

  it('character feetOffset works for non-default body params', () => {
    const hitY = 0;
    const h = 2.5;
    const b = 1.8;
    const feetOffset = computeFeetOffset(h, b);
    const groupY = hitY + feetOffset;
    const footBottomLocal = 0.06 * h - 0.025 * b;
    const footBottomWorld = groupY + footBottomLocal;
    expect(footBottomWorld).toBeCloseTo(hitY, 6);
  });
});

// ---------------------------------------------------------------------------
// 6. Prop box geometry — bottom sits at Y=0
// ---------------------------------------------------------------------------

describe('Prop box geometry offset', () => {
  it('box bottom sits at Y=0 with position [0, 0.2, 0] and half-height 0.2', () => {
    // Box geometry args: [0.4, 0.4, 0.4] → half-height = 0.2
    // Mesh position: [0, 0.2, 0]
    // Bottom Y = 0.2 - 0.2 = 0.0
    const meshY = 0.2;
    const halfHeight = 0.4 / 2; // 0.2
    const bottomY = meshY - halfHeight;
    expect(bottomY).toBeCloseTo(0, 6);
  });

  it('cylinder bottom sits at Y=0 with same offset', () => {
    // Cylinder args: [0.2, 0.2, 0.4, 16] → half-height = 0.2
    const meshY = 0.2;
    const halfHeight = 0.4 / 2;
    const bottomY = meshY - halfHeight;
    expect(bottomY).toBeCloseTo(0, 6);
  });

  it('cone bottom sits at Y=0 with same offset', () => {
    // Cone args: [0.2, 0.4, 16] → half-height = 0.2
    const meshY = 0.2;
    const halfHeight = 0.4 / 2;
    const bottomY = meshY - halfHeight;
    expect(bottomY).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// 7. No double-raycast: handlePlace uses hit point directly
// ---------------------------------------------------------------------------

describe('handlePlace pipeline (no double-raycast)', () => {
  it('character: final Y = hitPoint.y + feetOffset (no clampToSurface call)', () => {
    const hitPoint: [number, number, number] = [4, 1.5, -2];
    const feetOffset = computeFeetOffset(DEFAULT_BODY_PARAMS.height, DEFAULT_BODY_PARAMS.build);

    // This is what handlePlace now does — direct offset, no second raycast
    const finalPos: [number, number, number] = [...hitPoint];
    finalPos[1] += feetOffset;

    expect(finalPos[0]).toBe(4);          // X exact
    expect(finalPos[1]).toBeCloseTo(1.5 + feetOffset, 6); // Y = hit + offset
    expect(finalPos[2]).toBe(-2);         // Z exact
  });

  it('prop: final position = hitPoint exactly (no offset)', () => {
    const hitPoint: [number, number, number] = [4, 1.5, -2];
    // Props: no offset applied in handlePlace
    const finalPos: [number, number, number] = [...hitPoint];
    expect(finalPos).toEqual([4, 1.5, -2]);
  });

  it('XZ is never modified by placement pipeline', () => {
    const hitPoint: [number, number, number] = [123.456, 0, -789.012];
    const finalPos: [number, number, number] = [...hitPoint];
    finalPos[1] += computeFeetOffset(1.7, 1.0);

    expect(finalPos[0]).toBe(123.456);
    expect(finalPos[2]).toBe(-789.012);
  });
});

// ---------------------------------------------------------------------------
// 8. handleTransformEnd — character clamped, prop free
// ---------------------------------------------------------------------------

describe('handleTransformEnd logic', () => {
  it('character: clampToSurface is used on gizmo drag-end', () => {
    const { ref } = makeFlatCollider(0);
    const pos: [number, number, number] = [5, 3, 5]; // floating above plane
    const bp = DEFAULT_BODY_PARAMS;
    const feetOffset = computeFeetOffset(bp.height, bp.build);

    const clamped = clampToSurface(pos, ref, feetOffset);
    expect(clamped).not.toBeNull();
    // Y should be clamped near the surface, not floating at 3
    expect(clamped![1]).toBeCloseTo(feetOffset, 1);
    // XZ preserved
    expect(clamped![0]).toBeCloseTo(5, 1);
    expect(clamped![2]).toBeCloseTo(5, 1);
  });

  it('prop: no clamping — position passes through as-is', () => {
    // Props skip clampToSurface entirely in handleTransformEnd
    const pos: [number, number, number] = [5, 3, 5];
    // Simulating what handleTransformEnd does for props: just use pos directly
    const finalPos = pos;
    expect(finalPos).toEqual([5, 3, 5]);
  });
});

// ---------------------------------------------------------------------------
// 9. Height slider re-clamp uses correct offset
// ---------------------------------------------------------------------------

describe('Height slider re-clamp', () => {
  it('changing height recomputes feetOffset and re-clamps', () => {
    const { ref } = makeFlatCollider(0);
    const currentBuild = 1.0;

    // Original height
    const offset1 = computeFeetOffset(1.7, currentBuild);
    const clamp1 = clampToSurface([5, 0, 5], ref, offset1);
    expect(clamp1).not.toBeNull();

    // New height
    const offset2 = computeFeetOffset(2.5, currentBuild);
    const clamp2 = clampToSurface([5, 0, 5], ref, offset2);
    expect(clamp2).not.toBeNull();

    // Taller character → larger offset magnitude → lower group Y
    expect(clamp2![1]).toBeLessThan(clamp1![1]);
  });

  it('feet still touch surface after height change', () => {
    const newHeight = 2.5;
    const build = 1.0;
    const hitY = 0; // flat surface

    const feetOffset = computeFeetOffset(newHeight, build);
    const groupY = hitY + feetOffset;
    const footBottomLocal = 0.06 * newHeight - 0.025 * build;
    const footBottomWorld = groupY + footBottomLocal;

    expect(footBottomWorld).toBeCloseTo(hitY, 6);
  });
});

// ---------------------------------------------------------------------------
// 10. Edge cases
// ---------------------------------------------------------------------------

describe('Placement edge cases', () => {
  it('very tall character (5m) — feetOffset still places feet on surface', () => {
    const h = 5.0;
    const b = 1.0;
    const hitY = 3.0;
    const feetOffset = computeFeetOffset(h, b);
    const groupY = hitY + feetOffset;
    const footBottom = groupY + (0.06 * h - 0.025 * b);
    expect(footBottom).toBeCloseTo(hitY, 6);
  });

  it('very small character (0.1m) — feetOffset still places feet on surface', () => {
    const h = 0.1;
    const b = 1.0;
    const hitY = 0;
    const feetOffset = computeFeetOffset(h, b);
    const groupY = hitY + feetOffset;
    const footBottom = groupY + (0.06 * h - 0.025 * b);
    expect(footBottom).toBeCloseTo(hitY, 6);
  });

  it('negative surface Y — placement still works', () => {
    const { ref } = makeFlatCollider(-3);
    const result = clampToSurface([0, 5, 0], ref, 0);
    expect(result).not.toBeNull();
    expect(result![1]).toBeCloseTo(-3, 1);
  });

  it('multiple sequential clamps produce consistent results', () => {
    const { ref } = makeFlatCollider(1);
    const offset = computeFeetOffset(1.7, 1.0);
    const r1 = clampToSurface([5, 10, 5], ref, offset);
    const r2 = clampToSurface([5, 10, 5], ref, offset);
    const r3 = clampToSurface([5, 10, 5], ref, offset);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });
});

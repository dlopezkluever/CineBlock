import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../store';
import type { CineBlockState, MannequinPose } from '../types';
import { DEFAULT_POSE, DEFAULT_BODY_PARAMS } from '../types';

// --- Helpers ---

function withAsset(
  state: CineBlockState,
  overrides?: Partial<{ name: string; type: 'character' | 'prop'; id: string }>,
): CineBlockState {
  const id = overrides?.id ?? 'asset-1';
  return reducer(state, {
    type: 'ADD_ASSET',
    id,
    name: overrides?.name ?? 'Marcus',
    assetType: overrides?.type ?? 'character',
    description: 'tall man',
    color: '#3B82F6',
  });
}

function withShot(
  state: CineBlockState,
  overrides?: Partial<{ id: string; name: string }>,
): CineBlockState {
  return reducer(state, {
    type: 'ADD_SHOT',
    id: overrides?.id ?? 'shot-1',
    name: overrides?.name ?? 'Shot 1',
  });
}

function withMannequin(
  state: CineBlockState,
  assetId = 'asset-1',
  shotId = 'shot-1',
  position: [number, number, number] = [1, 0, 1],
): CineBlockState {
  return reducer(state, {
    type: 'ADD_MANNEQUIN',
    placement: {
      assetId,
      shotId,
      position,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  });
}

// --- Tests ---

describe('Phase 7 — Enhanced Mannequin System', () => {
  describe('7.1 — UPDATE_MANNEQUIN_POSE', () => {
    it('sets pose on matching placement', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      const pose: MannequinPose = {
        ...DEFAULT_POSE,
        leftShoulder: [0.5, 0, -0.3],
        leftElbow: 1.2,
      };
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_POSE',
        assetId: 'asset-1',
        shotId: 'shot-1',
        pose,
      });
      expect(s.mannequinPlacements[0].pose).toEqual(pose);
    });

    it('does not affect other placements', () => {
      let s = withAsset(withShot(initialState));
      s = withAsset(s, { id: 'asset-2', name: 'Elena', type: 'character' });
      s = withMannequin(s, 'asset-1', 'shot-1');
      s = withMannequin(s, 'asset-2', 'shot-1', [3, 0, 3]);
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_POSE',
        assetId: 'asset-1',
        shotId: 'shot-1',
        pose: { ...DEFAULT_POSE, rightElbow: 2.0 },
      });
      expect(s.mannequinPlacements[0].pose?.rightElbow).toBe(2.0);
      expect(s.mannequinPlacements[1].pose).toBeUndefined();
    });

    it('replaces the entire pose object', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      const pose1: MannequinPose = { ...DEFAULT_POSE, leftElbow: 1.0 };
      s = reducer(s, { type: 'UPDATE_MANNEQUIN_POSE', assetId: 'asset-1', shotId: 'shot-1', pose: pose1 });
      const pose2: MannequinPose = { ...DEFAULT_POSE, rightElbow: 2.0 };
      s = reducer(s, { type: 'UPDATE_MANNEQUIN_POSE', assetId: 'asset-1', shotId: 'shot-1', pose: pose2 });
      // pose2 replaces pose1 entirely
      expect(s.mannequinPlacements[0].pose?.leftElbow).toBe(DEFAULT_POSE.leftElbow);
      expect(s.mannequinPlacements[0].pose?.rightElbow).toBe(2.0);
    });
  });

  describe('7.2 — UPDATE_MANNEQUIN_BODY', () => {
    it('sets bodyParams on matching placement', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_BODY',
        assetId: 'asset-1',
        shotId: 'shot-1',
        bodyParams: { height: 2.0 },
      });
      expect(s.mannequinPlacements[0].bodyParams?.height).toBe(2.0);
      // build should default to 1.0
      expect(s.mannequinPlacements[0].bodyParams?.build).toBe(1.0);
    });

    it('merges partial bodyParams', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_BODY',
        assetId: 'asset-1',
        shotId: 'shot-1',
        bodyParams: { height: 2.0 },
      });
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_BODY',
        assetId: 'asset-1',
        shotId: 'shot-1',
        bodyParams: { build: 1.5 },
      });
      expect(s.mannequinPlacements[0].bodyParams?.height).toBe(2.0);
      expect(s.mannequinPlacements[0].bodyParams?.build).toBe(1.5);
    });

    it('does not affect other placements', () => {
      let s = withAsset(withShot(initialState));
      s = withAsset(s, { id: 'asset-2', name: 'Elena', type: 'character' });
      s = withMannequin(s, 'asset-1', 'shot-1');
      s = withMannequin(s, 'asset-2', 'shot-1', [3, 0, 3]);
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_BODY',
        assetId: 'asset-1',
        shotId: 'shot-1',
        bodyParams: { height: 2.5 },
      });
      expect(s.mannequinPlacements[0].bodyParams?.height).toBe(2.5);
      expect(s.mannequinPlacements[1].bodyParams).toBeUndefined();
    });
  });

  describe('7.3 — Backward compatibility', () => {
    it('placements without pose/bodyParams still work', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      expect(s.mannequinPlacements[0].pose).toBeUndefined();
      expect(s.mannequinPlacements[0].bodyParams).toBeUndefined();
      // UPDATE_MANNEQUIN still works on existing fields
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        position: [5, 0, 5],
      });
      expect(s.mannequinPlacements[0].position).toEqual([5, 0, 5]);
      expect(s.mannequinPlacements[0].pose).toBeUndefined();
    });

    it('DEFAULT_POSE and DEFAULT_BODY_PARAMS are valid', () => {
      expect(DEFAULT_POSE.leftShoulder).toHaveLength(3);
      expect(DEFAULT_POSE.rightShoulder).toHaveLength(3);
      expect(DEFAULT_POSE.leftHip).toHaveLength(3);
      expect(DEFAULT_POSE.rightHip).toHaveLength(3);
      expect(typeof DEFAULT_POSE.leftElbow).toBe('number');
      expect(typeof DEFAULT_POSE.rightElbow).toBe('number');
      expect(typeof DEFAULT_POSE.leftKnee).toBe('number');
      expect(typeof DEFAULT_POSE.rightKnee).toBe('number');
      expect(DEFAULT_BODY_PARAMS.height).toBe(1.7);
      expect(DEFAULT_BODY_PARAMS.build).toBe(1.0);
    });

    it('pose and body updates preserve position/rotation/scale', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        position: [2, 1, 3],
        rotation: [0, Math.PI, 0],
        scale: [1.5, 1.5, 1.5],
      });
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_POSE',
        assetId: 'asset-1',
        shotId: 'shot-1',
        pose: { ...DEFAULT_POSE, leftElbow: 1.5 },
      });
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_BODY',
        assetId: 'asset-1',
        shotId: 'shot-1',
        bodyParams: { height: 2.0 },
      });
      const m = s.mannequinPlacements[0];
      expect(m.position).toEqual([2, 1, 3]);
      expect(m.rotation).toEqual([0, Math.PI, 0]);
      expect(m.scale).toEqual([1.5, 1.5, 1.5]);
      expect(m.pose?.leftElbow).toBe(1.5);
      expect(m.bodyParams?.height).toBe(2.0);
    });
  });

  describe('7.4 — Pose joint ranges', () => {
    it('shoulder accepts full euler range', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      const pose: MannequinPose = {
        ...DEFAULT_POSE,
        leftShoulder: [Math.PI, -Math.PI / 2, Math.PI / 4],
        rightShoulder: [-Math.PI / 3, 0, -Math.PI],
      };
      s = reducer(s, { type: 'UPDATE_MANNEQUIN_POSE', assetId: 'asset-1', shotId: 'shot-1', pose });
      expect(s.mannequinPlacements[0].pose?.leftShoulder).toEqual([Math.PI, -Math.PI / 2, Math.PI / 4]);
      expect(s.mannequinPlacements[0].pose?.rightShoulder).toEqual([-Math.PI / 3, 0, -Math.PI]);
    });

    it('elbow/knee accept bend values', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      const pose: MannequinPose = {
        ...DEFAULT_POSE,
        leftElbow: 2.5,
        rightElbow: 0,
        leftKnee: 1.8,
        rightKnee: 0.5,
      };
      s = reducer(s, { type: 'UPDATE_MANNEQUIN_POSE', assetId: 'asset-1', shotId: 'shot-1', pose });
      expect(s.mannequinPlacements[0].pose?.leftElbow).toBe(2.5);
      expect(s.mannequinPlacements[0].pose?.rightElbow).toBe(0);
      expect(s.mannequinPlacements[0].pose?.leftKnee).toBe(1.8);
      expect(s.mannequinPlacements[0].pose?.rightKnee).toBe(0.5);
    });
  });

  describe('7.5 — Integration flow', () => {
    it('full add -> pose -> body -> position flow', () => {
      let s = withMannequin(withAsset(withShot(initialState)));

      // Set pose
      const pose: MannequinPose = {
        ...DEFAULT_POSE,
        leftShoulder: [0.3, 0.1, -0.2],
        leftElbow: 0.8,
      };
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_POSE',
        assetId: 'asset-1',
        shotId: 'shot-1',
        pose,
      });

      // Set body params
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_BODY',
        assetId: 'asset-1',
        shotId: 'shot-1',
        bodyParams: { height: 1.9, build: 1.2 },
      });

      // Update position
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        position: [3, 0.5, 2],
      });

      const m = s.mannequinPlacements[0];
      expect(m.pose?.leftElbow).toBe(0.8);
      expect(m.bodyParams?.height).toBe(1.9);
      expect(m.bodyParams?.build).toBe(1.2);
      expect(m.position).toEqual([3, 0.5, 2]);
    });

    it('reset pose via DEFAULT_POSE', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_POSE',
        assetId: 'asset-1',
        shotId: 'shot-1',
        pose: { ...DEFAULT_POSE, leftElbow: 2.0, rightKnee: 1.5 },
      });
      // Reset to default
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN_POSE',
        assetId: 'asset-1',
        shotId: 'shot-1',
        pose: DEFAULT_POSE,
      });
      expect(s.mannequinPlacements[0].pose).toEqual(DEFAULT_POSE);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../store';
import type { CineBlockState } from '../types';

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

describe('Phase 5 — Mannequin System', () => {
  describe('5.1 — ADD_MANNEQUIN', () => {
    it('adds a mannequin placement to state', () => {
      let s = withAsset(withShot(initialState));
      s = withMannequin(s);
      expect(s.mannequinPlacements).toHaveLength(1);
      expect(s.mannequinPlacements[0].assetId).toBe('asset-1');
      expect(s.mannequinPlacements[0].shotId).toBe('shot-1');
      expect(s.mannequinPlacements[0].position).toEqual([1, 0, 1]);
    });

    it('allows multiple mannequins for different assets in same shot', () => {
      let s = withAsset(withShot(initialState));
      s = withAsset(s, { id: 'asset-2', name: 'Knife', type: 'prop' });
      s = withMannequin(s, 'asset-1', 'shot-1');
      s = withMannequin(s, 'asset-2', 'shot-1', [2, 0, 3]);
      expect(s.mannequinPlacements).toHaveLength(2);
    });

    it('allows same asset placed in different shots', () => {
      let s = withAsset(withShot(initialState));
      s = withShot(s, { id: 'shot-2', name: 'Shot 2' });
      s = withMannequin(s, 'asset-1', 'shot-1');
      s = withMannequin(s, 'asset-1', 'shot-2', [5, 0, 5]);
      expect(s.mannequinPlacements).toHaveLength(2);
      expect(s.mannequinPlacements[0].shotId).toBe('shot-1');
      expect(s.mannequinPlacements[1].shotId).toBe('shot-2');
    });
  });

  describe('5.3 — UPDATE_MANNEQUIN', () => {
    it('updates position of a mannequin', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        position: [10, 5, 10],
      });
      expect(s.mannequinPlacements[0].position).toEqual([10, 5, 10]);
      // rotation/scale unchanged
      expect(s.mannequinPlacements[0].rotation).toEqual([0, 0, 0]);
      expect(s.mannequinPlacements[0].scale).toEqual([1, 1, 1]);
    });

    it('updates rotation of a mannequin', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        rotation: [0, Math.PI, 0],
      });
      expect(s.mannequinPlacements[0].rotation).toEqual([0, Math.PI, 0]);
    });

    it('updates scale of a mannequin', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        scale: [2, 2, 2],
      });
      expect(s.mannequinPlacements[0].scale).toEqual([2, 2, 2]);
    });

    it('only updates the matching asset+shot placement', () => {
      let s = withAsset(withShot(initialState));
      s = withAsset(s, { id: 'asset-2', name: 'Knife', type: 'prop' });
      s = withMannequin(s, 'asset-1', 'shot-1', [1, 0, 1]);
      s = withMannequin(s, 'asset-2', 'shot-1', [5, 0, 5]);
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        position: [99, 99, 99],
      });
      expect(s.mannequinPlacements[0].position).toEqual([99, 99, 99]);
      expect(s.mannequinPlacements[1].position).toEqual([5, 0, 5]); // unchanged
    });
  });

  describe('5.5 — REMOVE_MANNEQUIN', () => {
    it('removes a mannequin placement', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      expect(s.mannequinPlacements).toHaveLength(1);
      s = reducer(s, {
        type: 'REMOVE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
      });
      expect(s.mannequinPlacements).toHaveLength(0);
    });

    it('only removes the matching asset+shot, leaves others', () => {
      let s = withAsset(withShot(initialState));
      s = withShot(s, { id: 'shot-2', name: 'Shot 2' });
      s = withMannequin(s, 'asset-1', 'shot-1');
      s = withMannequin(s, 'asset-1', 'shot-2');
      s = reducer(s, {
        type: 'REMOVE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
      });
      expect(s.mannequinPlacements).toHaveLength(1);
      expect(s.mannequinPlacements[0].shotId).toBe('shot-2');
    });
  });

  describe('5.4 — Asset Visibility', () => {
    it('TOGGLE_ASSET_VISIBILITY defaults visible then hides', () => {
      let s = withAsset(initialState);
      // Not in visibility map → treated as visible (true), toggling should set to false
      s = reducer(s, { type: 'TOGGLE_ASSET_VISIBILITY', assetId: 'asset-1' });
      expect(s.assetVisibility['asset-1']).toBe(false);
    });

    it('TOGGLE_ASSET_VISIBILITY toggles back to visible', () => {
      let s = withAsset(initialState);
      s = reducer(s, { type: 'TOGGLE_ASSET_VISIBILITY', assetId: 'asset-1' });
      expect(s.assetVisibility['asset-1']).toBe(false);
      s = reducer(s, { type: 'TOGGLE_ASSET_VISIBILITY', assetId: 'asset-1' });
      expect(s.assetVisibility['asset-1']).toBe(true);
    });

    it('SET_ASSET_VISIBILITY replaces entire visibility map', () => {
      let s = withAsset(initialState);
      s = withAsset(s, { id: 'asset-2', name: 'Knife', type: 'prop' });
      s = reducer(s, {
        type: 'SET_ASSET_VISIBILITY',
        visibility: { 'asset-1': true, 'asset-2': false },
      });
      expect(s.assetVisibility['asset-1']).toBe(true);
      expect(s.assetVisibility['asset-2']).toBe(false);
    });

    it('SET_ASSET_VISIBILITY overwrites previous state', () => {
      let s = reducer(initialState, {
        type: 'SET_ASSET_VISIBILITY',
        visibility: { 'asset-1': false },
      });
      s = reducer(s, {
        type: 'SET_ASSET_VISIBILITY',
        visibility: { 'asset-1': true },
      });
      expect(s.assetVisibility['asset-1']).toBe(true);
    });
  });

  describe('Integration — mannequin + shot interactions', () => {
    it('mannequin placements survive shot switching', () => {
      let s = withAsset(withShot(initialState));
      s = withShot(s, { id: 'shot-2', name: 'Shot 2' });
      s = withMannequin(s, 'asset-1', 'shot-1', [1, 0, 1]);
      s = withMannequin(s, 'asset-1', 'shot-2', [5, 0, 5]);

      // Switch to shot 2
      s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
      // Both placements still exist
      expect(s.mannequinPlacements).toHaveLength(2);
      // Filter for active shot
      const shot2Placements = s.mannequinPlacements.filter((m) => m.shotId === 'shot-2');
      expect(shot2Placements).toHaveLength(1);
      expect(shot2Placements[0].position).toEqual([5, 0, 5]);
    });

    it('RESET clears all mannequin placements', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      expect(s.mannequinPlacements).toHaveLength(1);
      s = reducer(s, { type: 'RESET' });
      expect(s.mannequinPlacements).toHaveLength(0);
    });

    it('multiple updates in sequence accumulate correctly', () => {
      let s = withMannequin(withAsset(withShot(initialState)));
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        position: [2, 0, 2],
      });
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        rotation: [0, 1.5, 0],
      });
      s = reducer(s, {
        type: 'UPDATE_MANNEQUIN',
        assetId: 'asset-1',
        shotId: 'shot-1',
        scale: [1.5, 1.5, 1.5],
      });
      const m = s.mannequinPlacements[0];
      expect(m.position).toEqual([2, 0, 2]);
      expect(m.rotation).toEqual([0, 1.5, 0]);
      expect(m.scale).toEqual([1.5, 1.5, 1.5]);
    });
  });
});

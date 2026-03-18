import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../store';
import { PROP_SHAPES, PROP_SHAPE_DEFAULTS } from '../types';
import type { PropShape, CineBlockState } from '../types';

function stateWithAsset(overrides?: Partial<CineBlockState>): CineBlockState {
  const base = reducer(initialState, {
    type: 'ADD_ASSET',
    id: 'prop-1',
    name: 'Table',
    assetType: 'prop',
    description: 'A table',
    color: '#3B82F6',
  });
  return { ...base, ...overrides };
}

describe('Prop Shapes — Types & Defaults', () => {
  it('PROP_SHAPES has entries for all 8 shapes', () => {
    expect(PROP_SHAPES).toHaveLength(8);
    const values = PROP_SHAPES.map((s) => s.value);
    expect(values).toEqual(['box', 'cylinder', 'sphere', 'cone', 'plane', 'capsule', 'dog', 'cat']);
  });

  it('PROP_SHAPE_DEFAULTS has entries for all 8 shapes with positive values', () => {
    const shapes: PropShape[] = ['box', 'cylinder', 'sphere', 'cone', 'plane', 'capsule', 'dog', 'cat'];
    for (const shape of shapes) {
      const defaults = PROP_SHAPE_DEFAULTS[shape];
      expect(defaults).toHaveLength(3);
      expect(defaults[0]).toBeGreaterThan(0);
      expect(defaults[1]).toBeGreaterThan(0);
      expect(defaults[2]).toBeGreaterThan(0);
    }
  });

  it('each PROP_SHAPES entry has a non-empty label', () => {
    for (const entry of PROP_SHAPES) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});

describe('Prop Shapes — Reducer', () => {
  it('UPDATE_ASSET with field=shape sets shape on the asset', () => {
    const state = stateWithAsset();
    const updated = reducer(state, { type: 'UPDATE_ASSET', id: 'prop-1', field: 'shape', value: 'cylinder' });
    const asset = updated.assets.find((a) => a.id === 'prop-1');
    expect(asset?.shape).toBe('cylinder');
  });

  it('asset with no shape field defaults to box behavior (backward compat)', () => {
    const state = stateWithAsset();
    const asset = state.assets.find((a) => a.id === 'prop-1');
    expect(asset?.shape).toBeUndefined();
    // Consumers should treat undefined as 'box'
    const effectiveShape = asset?.shape ?? 'box';
    expect(effectiveShape).toBe('box');
  });

  it('shape persists through unrelated UPDATE_ASSET calls', () => {
    let state = stateWithAsset();
    state = reducer(state, { type: 'UPDATE_ASSET', id: 'prop-1', field: 'shape', value: 'sphere' });
    state = reducer(state, { type: 'UPDATE_ASSET', id: 'prop-1', field: 'name', value: 'Round Table' });
    const asset = state.assets.find((a) => a.id === 'prop-1');
    expect(asset?.shape).toBe('sphere');
    expect(asset?.name).toBe('Round Table');
  });

  it('can set shape to each of the 8 values', () => {
    const shapes: PropShape[] = ['box', 'cylinder', 'sphere', 'cone', 'plane', 'capsule', 'dog', 'cat'];
    for (const shape of shapes) {
      let state = stateWithAsset();
      state = reducer(state, { type: 'UPDATE_ASSET', id: 'prop-1', field: 'shape', value: shape });
      const asset = state.assets.find((a) => a.id === 'prop-1');
      expect(asset?.shape).toBe(shape);
    }
  });
});

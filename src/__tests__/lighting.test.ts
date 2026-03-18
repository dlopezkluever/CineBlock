import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../store';
import type { CineBlockState, LightPlacement } from '../types';
import { DEFAULT_SCENE_LIGHTING, DEFAULT_LIGHT } from '../types';
import { kelvinToColor, blendKelvinWithTint } from '../utils/kelvinToColor';
import * as THREE from 'three';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withShot(state: CineBlockState, id: string, name: string): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name });
}

function withTwoShots(state: CineBlockState): CineBlockState {
  let s = withShot(state, 'shot-1', 'Shot 1');
  s = withShot(s, 'shot-2', 'Shot 2');
  return s;
}

function makeLight(shotId: string, overrides?: Partial<LightPlacement>): LightPlacement {
  return {
    ...DEFAULT_LIGHT,
    id: overrides?.id ?? crypto.randomUUID(),
    shotId,
    ...overrides,
  };
}

function addLight(state: CineBlockState, light: LightPlacement): CineBlockState {
  return reducer(state, { type: 'ADD_LIGHT', light });
}

// ─── Types & Defaults ────────────────────────────────────────────────────────

describe('Lighting — Types & Defaults', () => {
  it('DEFAULT_SCENE_LIGHTING has expected defaults', () => {
    expect(DEFAULT_SCENE_LIGHTING.ambientIntensity).toBe(0.5);
    expect(DEFAULT_SCENE_LIGHTING.directionalIntensity).toBe(1.0);
  });

  it('DEFAULT_LIGHT has expected shape', () => {
    expect(DEFAULT_LIGHT.lightType).toBe('spot');
    expect(DEFAULT_LIGHT.position).toEqual([0, 2, 0]);
    expect(DEFAULT_LIGHT.rotation).toEqual([-Math.PI / 2, 0, 0]);
    expect(DEFAULT_LIGHT.kelvin).toBe(5500);
    expect(DEFAULT_LIGHT.tintColor).toBe('#ffffff');
    expect(DEFAULT_LIGHT.intensity).toBe(1.0);
    expect(DEFAULT_LIGHT.distance).toBe(10);
    expect(DEFAULT_LIGHT.coneAngle).toBe(Math.PI / 6);
    expect(DEFAULT_LIGHT.penumbra).toBe(0.5);
  });

  it('DEFAULT_LIGHT does not include id or shotId', () => {
    expect('id' in DEFAULT_LIGHT).toBe(false);
    expect('shotId' in DEFAULT_LIGHT).toBe(false);
  });
});

// ─── Initial State ───────────────────────────────────────────────────────────

describe('Lighting — Initial State', () => {
  it('starts with empty lightPlacements', () => {
    expect(initialState.lightPlacements).toEqual([]);
  });

  it('starts with default sceneLighting', () => {
    expect(initialState.sceneLighting).toEqual(DEFAULT_SCENE_LIGHTING);
  });

  it('starts with lightingModeEnabled = false', () => {
    expect(initialState.lightingModeEnabled).toBe(false);
  });
});

// ─── kelvinToColor Utility ───────────────────────────────────────────────────

describe('Lighting — kelvinToColor', () => {
  it('returns a valid 7-char hex string', () => {
    const color = kelvinToColor(5500);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('warm temperatures (2000K) have high red, low blue', () => {
    const hex = kelvinToColor(2000);
    const r = parseInt(hex.slice(1, 3), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(r).toBeGreaterThan(200);
    expect(b).toBeLessThan(50);
  });

  it('daylight temperature (6500K) is near-white', () => {
    const hex = kelvinToColor(6500);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
  });

  it('cool temperatures (10000K) have high blue', () => {
    const hex = kelvinToColor(10000);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(b).toBe(255);
  });

  it('very low temperature (1900K) clamps blue to 0', () => {
    const hex = kelvinToColor(1900);
    const b = parseInt(hex.slice(5, 7), 16);
    expect(b).toBe(0);
  });

  it('different temperatures produce different colors', () => {
    const warm = kelvinToColor(2000);
    const cool = kelvinToColor(9000);
    expect(warm).not.toBe(cool);
  });
});

describe('Lighting — blendKelvinWithTint', () => {
  it('white tint returns kelvin color unchanged', () => {
    const color = blendKelvinWithTint(5500, '#ffffff');
    const direct = new THREE.Color(kelvinToColor(5500));
    expect(color.r).toBeCloseTo(direct.r, 4);
    expect(color.g).toBeCloseTo(direct.g, 4);
    expect(color.b).toBeCloseTo(direct.b, 4);
  });

  it('black tint results in black', () => {
    const color = blendKelvinWithTint(5500, '#000000');
    expect(color.r).toBeCloseTo(0, 4);
    expect(color.g).toBeCloseTo(0, 4);
    expect(color.b).toBeCloseTo(0, 4);
  });

  it('red tint zeroes green and blue channels', () => {
    const color = blendKelvinWithTint(5500, '#ff0000');
    expect(color.g).toBeCloseTo(0, 4);
    expect(color.b).toBeCloseTo(0, 4);
    expect(color.r).toBeGreaterThan(0);
  });

  it('returns a THREE.Color instance', () => {
    const color = blendKelvinWithTint(4000, '#88aacc');
    expect(color).toBeInstanceOf(THREE.Color);
  });
});

// ─── ADD_LIGHT ───────────────────────────────────────────────────────────────

describe('Lighting — ADD_LIGHT', () => {
  it('appends a light to lightPlacements', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    const light = makeLight('shot-1', { id: 'light-1' });
    s = addLight(s, light);
    expect(s.lightPlacements).toHaveLength(1);
    expect(s.lightPlacements[0]).toEqual(light);
  });

  it('can add multiple lights to the same shot', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = addLight(s, makeLight('shot-1', { id: 'l2' }));
    s = addLight(s, makeLight('shot-1', { id: 'l3' }));
    expect(s.lightPlacements).toHaveLength(3);
  });

  it('can add lights to different shots', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = addLight(s, makeLight('shot-2', { id: 'l2' }));
    expect(s.lightPlacements).toHaveLength(2);
    expect(s.lightPlacements[0].shotId).toBe('shot-1');
    expect(s.lightPlacements[1].shotId).toBe('shot-2');
  });

  it('preserves all light properties', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    const light = makeLight('shot-1', {
      id: 'l1',
      lightType: 'point',
      position: [1, 3, 5],
      rotation: [0.1, 0.2, 0.3],
      kelvin: 3200,
      tintColor: '#ff8800',
      intensity: 5.0,
      distance: 20,
      coneAngle: Math.PI / 4,
      penumbra: 0.8,
    });
    s = addLight(s, light);
    const stored = s.lightPlacements[0];
    expect(stored.lightType).toBe('point');
    expect(stored.position).toEqual([1, 3, 5]);
    expect(stored.kelvin).toBe(3200);
    expect(stored.tintColor).toBe('#ff8800');
    expect(stored.intensity).toBe(5.0);
    expect(stored.distance).toBe(20);
    expect(stored.penumbra).toBe(0.8);
  });

  it('does not affect other state fields', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    expect(s.shots).toHaveLength(1);
    expect(s.mannequinPlacements).toEqual([]);
    expect(s.captures).toEqual([]);
    expect(s.sceneLighting).toEqual(DEFAULT_SCENE_LIGHTING);
  });
});

// ─── UPDATE_LIGHT ────────────────────────────────────────────────────────────

describe('Lighting — UPDATE_LIGHT', () => {
  it('updates intensity of a specific light', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1', intensity: 1.0 }));
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'l1', shotId: 'shot-1', updates: { intensity: 7.5 } });
    expect(s.lightPlacements[0].intensity).toBe(7.5);
  });

  it('updates multiple properties at once', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, {
      type: 'UPDATE_LIGHT',
      id: 'l1',
      shotId: 'shot-1',
      updates: { kelvin: 3000, tintColor: '#ff0000', distance: 25 },
    });
    expect(s.lightPlacements[0].kelvin).toBe(3000);
    expect(s.lightPlacements[0].tintColor).toBe('#ff0000');
    expect(s.lightPlacements[0].distance).toBe(25);
  });

  it('updates position and rotation (transform end)', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1', position: [0, 2, 0], rotation: [0, 0, 0] }));
    s = reducer(s, {
      type: 'UPDATE_LIGHT',
      id: 'l1',
      shotId: 'shot-1',
      updates: { position: [3, 4, 5], rotation: [0.5, 1.0, 1.5] },
    });
    expect(s.lightPlacements[0].position).toEqual([3, 4, 5]);
    expect(s.lightPlacements[0].rotation).toEqual([0.5, 1.0, 1.5]);
  });

  it('changes light type from spot to point', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1', lightType: 'spot' }));
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'l1', shotId: 'shot-1', updates: { lightType: 'point' } });
    expect(s.lightPlacements[0].lightType).toBe('point');
  });

  it('only updates the matching light, leaves others unchanged', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1', intensity: 1.0 }));
    s = addLight(s, makeLight('shot-1', { id: 'l2', intensity: 2.0 }));
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'l1', shotId: 'shot-1', updates: { intensity: 9.0 } });
    expect(s.lightPlacements[0].intensity).toBe(9.0);
    expect(s.lightPlacements[1].intensity).toBe(2.0);
  });

  it('no-op if light id does not match', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1', intensity: 1.0 }));
    const before = s.lightPlacements[0];
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'nonexistent', shotId: 'shot-1', updates: { intensity: 9.0 } });
    expect(s.lightPlacements[0]).toEqual(before);
  });

  it('preserves unmentioned properties', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1', kelvin: 4000, intensity: 3.0 }));
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'l1', shotId: 'shot-1', updates: { intensity: 8.0 } });
    expect(s.lightPlacements[0].kelvin).toBe(4000);
    expect(s.lightPlacements[0].intensity).toBe(8.0);
  });
});

// ─── REMOVE_LIGHT ────────────────────────────────────────────────────────────

describe('Lighting — REMOVE_LIGHT', () => {
  it('removes a light by id + shotId', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, { type: 'REMOVE_LIGHT', id: 'l1', shotId: 'shot-1' });
    expect(s.lightPlacements).toHaveLength(0);
  });

  it('only removes the matching light', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = addLight(s, makeLight('shot-1', { id: 'l2' }));
    s = addLight(s, makeLight('shot-1', { id: 'l3' }));
    s = reducer(s, { type: 'REMOVE_LIGHT', id: 'l2', shotId: 'shot-1' });
    expect(s.lightPlacements).toHaveLength(2);
    expect(s.lightPlacements.map((l) => l.id)).toEqual(['l1', 'l3']);
  });

  it('no-op if light id does not exist', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, { type: 'REMOVE_LIGHT', id: 'nonexistent', shotId: 'shot-1' });
    expect(s.lightPlacements).toHaveLength(1);
  });

  it('requires both id and shotId to match', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    // Wrong shotId — should not remove
    s = reducer(s, { type: 'REMOVE_LIGHT', id: 'l1', shotId: 'shot-2' });
    expect(s.lightPlacements).toHaveLength(1);
  });
});

// ─── SET_SCENE_LIGHTING ──────────────────────────────────────────────────────

describe('Lighting — SET_SCENE_LIGHTING', () => {
  it('updates ambient intensity', () => {
    const s = reducer(initialState, { type: 'SET_SCENE_LIGHTING', lighting: { ambientIntensity: 0.2 } });
    expect(s.sceneLighting.ambientIntensity).toBe(0.2);
    expect(s.sceneLighting.directionalIntensity).toBe(1.0); // unchanged
  });

  it('updates directional intensity', () => {
    const s = reducer(initialState, { type: 'SET_SCENE_LIGHTING', lighting: { directionalIntensity: 0.3 } });
    expect(s.sceneLighting.directionalIntensity).toBe(0.3);
    expect(s.sceneLighting.ambientIntensity).toBe(0.5); // unchanged
  });

  it('updates both at once', () => {
    const s = reducer(initialState, { type: 'SET_SCENE_LIGHTING', lighting: { ambientIntensity: 0.1, directionalIntensity: 0.9 } });
    expect(s.sceneLighting.ambientIntensity).toBe(0.1);
    expect(s.sceneLighting.directionalIntensity).toBe(0.9);
  });

  it('can set to zero', () => {
    const s = reducer(initialState, { type: 'SET_SCENE_LIGHTING', lighting: { ambientIntensity: 0, directionalIntensity: 0 } });
    expect(s.sceneLighting.ambientIntensity).toBe(0);
    expect(s.sceneLighting.directionalIntensity).toBe(0);
  });

  it('empty partial is a no-op', () => {
    const s = reducer(initialState, { type: 'SET_SCENE_LIGHTING', lighting: {} });
    expect(s.sceneLighting).toEqual(DEFAULT_SCENE_LIGHTING);
  });
});

// ─── SET_LIGHTING_MODE ───────────────────────────────────────────────────────

describe('Lighting — SET_LIGHTING_MODE', () => {
  it('enables lighting mode', () => {
    const s = reducer(initialState, { type: 'SET_LIGHTING_MODE', enabled: true });
    expect(s.lightingModeEnabled).toBe(true);
  });

  it('disables lighting mode', () => {
    let s = reducer(initialState, { type: 'SET_LIGHTING_MODE', enabled: true });
    s = reducer(s, { type: 'SET_LIGHTING_MODE', enabled: false });
    expect(s.lightingModeEnabled).toBe(false);
  });

  it('toggling does not affect light data', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, { type: 'SET_LIGHTING_MODE', enabled: true });
    expect(s.lightPlacements).toHaveLength(1);
    s = reducer(s, { type: 'SET_LIGHTING_MODE', enabled: false });
    expect(s.lightPlacements).toHaveLength(1);
  });
});

// ─── REMOVE_SHOT — light cleanup ─────────────────────────────────────────────

describe('Lighting — REMOVE_SHOT cleans up lights', () => {
  it('removes all lights belonging to the deleted shot', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = addLight(s, makeLight('shot-1', { id: 'l2' }));
    s = addLight(s, makeLight('shot-2', { id: 'l3' }));
    s = reducer(s, { type: 'REMOVE_SHOT', id: 'shot-1' });
    expect(s.lightPlacements).toHaveLength(1);
    expect(s.lightPlacements[0].id).toBe('l3');
    expect(s.lightPlacements[0].shotId).toBe('shot-2');
  });

  it('no lights removed when shot has none', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, { type: 'REMOVE_SHOT', id: 'shot-2' });
    expect(s.lightPlacements).toHaveLength(1);
    expect(s.lightPlacements[0].shotId).toBe('shot-1');
  });
});

// ─── SET_ACTIVE_SHOT — copy-on-switch ────────────────────────────────────────

describe('Lighting — SET_ACTIVE_SHOT copy-on-switch', () => {
  it('copies lights from previous shot to new shot if new shot has none', () => {
    let s = withTwoShots(initialState);
    // Add lights to shot-1, active shot index is 0 (shot-1)
    s = addLight(s, makeLight('shot-1', { id: 'l1', kelvin: 3000 }));
    s = addLight(s, makeLight('shot-1', { id: 'l2', kelvin: 7000 }));
    // Switch to shot-2
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    // Should now have 4 lights: 2 originals + 2 clones
    expect(s.lightPlacements).toHaveLength(4);
    const shot2Lights = s.lightPlacements.filter((l) => l.shotId === 'shot-2');
    expect(shot2Lights).toHaveLength(2);
    // Clones have same kelvin values
    expect(shot2Lights.map((l) => l.kelvin).sort()).toEqual([3000, 7000]);
  });

  it('cloned lights get new unique ids', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    const shot1Ids = s.lightPlacements.filter((l) => l.shotId === 'shot-1').map((l) => l.id);
    const shot2Ids = s.lightPlacements.filter((l) => l.shotId === 'shot-2').map((l) => l.id);
    // No ID collision
    for (const id of shot2Ids) {
      expect(shot1Ids).not.toContain(id);
    }
  });

  it('does NOT copy if target shot already has lights', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = addLight(s, makeLight('shot-2', { id: 'l2' }));
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    // No extra lights — shot-2 already had one
    expect(s.lightPlacements).toHaveLength(2);
  });

  it('switching to same shot index is a no-op for lights', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 0 });
    expect(s.lightPlacements).toHaveLength(1);
  });

  it('switching to shot with no source lights copies nothing', () => {
    let s = withTwoShots(initialState);
    // No lights on shot-1
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    expect(s.lightPlacements).toHaveLength(0);
  });

  it('copy preserves all light properties except id and shotId', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', {
      id: 'l1',
      lightType: 'point',
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      kelvin: 4200,
      tintColor: '#ff8800',
      intensity: 3.5,
      distance: 15,
      coneAngle: Math.PI / 3,
      penumbra: 0.7,
    }));
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    const cloned = s.lightPlacements.find((l) => l.shotId === 'shot-2');
    expect(cloned).toBeDefined();
    expect(cloned!.lightType).toBe('point');
    expect(cloned!.position).toEqual([1, 2, 3]);
    expect(cloned!.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(cloned!.kelvin).toBe(4200);
    expect(cloned!.tintColor).toBe('#ff8800');
    expect(cloned!.intensity).toBe(3.5);
    expect(cloned!.distance).toBe(15);
    expect(cloned!.coneAngle).toBe(Math.PI / 3);
    expect(cloned!.penumbra).toBe(0.7);
    expect(cloned!.id).not.toBe('l1');
    expect(cloned!.shotId).toBe('shot-2');
  });
});

// ─── RESET clears lighting state ─────────────────────────────────────────────

describe('Lighting — RESET', () => {
  it('resets all lighting state to initial', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = reducer(s, { type: 'SET_SCENE_LIGHTING', lighting: { ambientIntensity: 0.1 } });
    s = reducer(s, { type: 'SET_LIGHTING_MODE', enabled: true });
    s = reducer(s, { type: 'RESET' });
    expect(s.lightPlacements).toEqual([]);
    expect(s.sceneLighting).toEqual(DEFAULT_SCENE_LIGHTING);
    expect(s.lightingModeEnabled).toBe(false);
  });
});

// ─── Integration: Multi-step workflows ───────────────────────────────────────

describe('Lighting — Integration', () => {
  it('full workflow: add shots, add lights, edit, switch, delete', () => {
    let s = withTwoShots(initialState);

    // Enable lighting mode
    s = reducer(s, { type: 'SET_LIGHTING_MODE', enabled: true });
    expect(s.lightingModeEnabled).toBe(true);

    // Add 2 lights to shot-1
    s = addLight(s, makeLight('shot-1', { id: 'l1', kelvin: 3000, intensity: 2.0 }));
    s = addLight(s, makeLight('shot-1', { id: 'l2', kelvin: 8000, intensity: 1.0 }));
    expect(s.lightPlacements).toHaveLength(2);

    // Edit first light
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'l1', shotId: 'shot-1', updates: { intensity: 5.0 } });
    expect(s.lightPlacements.find((l) => l.id === 'l1')!.intensity).toBe(5.0);

    // Switch to shot-2 — lights should copy
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    const shot2Lights = s.lightPlacements.filter((l) => l.shotId === 'shot-2');
    expect(shot2Lights).toHaveLength(2);

    // Edit shot-2's light independently
    const shot2Light = shot2Lights[0];
    s = reducer(s, { type: 'UPDATE_LIGHT', id: shot2Light.id, shotId: 'shot-2', updates: { kelvin: 6000 } });

    // Verify shot-1 lights are unchanged
    const shot1Lights = s.lightPlacements.filter((l) => l.shotId === 'shot-1');
    expect(shot1Lights.find((l) => l.id === 'l1')!.kelvin).toBe(3000);

    // Remove one light from shot-1
    s = reducer(s, { type: 'REMOVE_LIGHT', id: 'l1', shotId: 'shot-1' });
    expect(s.lightPlacements.filter((l) => l.shotId === 'shot-1')).toHaveLength(1);
    expect(s.lightPlacements.filter((l) => l.shotId === 'shot-2')).toHaveLength(2); // shot-2 unaffected

    // Adjust scene lighting
    s = reducer(s, { type: 'SET_SCENE_LIGHTING', lighting: { ambientIntensity: 0.3, directionalIntensity: 0.7 } });
    expect(s.sceneLighting.ambientIntensity).toBe(0.3);
    expect(s.sceneLighting.directionalIntensity).toBe(0.7);

    // Delete shot-1 — its lights should be cleaned up
    s = reducer(s, { type: 'REMOVE_SHOT', id: 'shot-1' });
    expect(s.lightPlacements.filter((l) => l.shotId === 'shot-1')).toHaveLength(0);
    expect(s.lightPlacements.filter((l) => l.shotId === 'shot-2')).toHaveLength(2);
  });

  it('lighting state coexists with mannequin state', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = reducer(s, { type: 'ADD_ASSET', id: 'a1', name: 'Hero', assetType: 'character', description: '', color: '#ff0000' });
    s = reducer(s, {
      type: 'ADD_MANNEQUIN',
      placement: { assetId: 'a1', shotId: 'shot-1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));

    expect(s.mannequinPlacements).toHaveLength(1);
    expect(s.lightPlacements).toHaveLength(1);

    // Modifying a light doesn't touch mannequins
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'l1', shotId: 'shot-1', updates: { intensity: 5.0 } });
    expect(s.mannequinPlacements).toHaveLength(1);

    // Removing a mannequin doesn't touch lights
    s = reducer(s, { type: 'REMOVE_MANNEQUIN', assetId: 'a1', shotId: 'shot-1' });
    expect(s.lightPlacements).toHaveLength(1);
    expect(s.mannequinPlacements).toHaveLength(0);
  });

  it('scene lighting changes do not affect custom light data', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1', intensity: 2.0 }));
    s = reducer(s, { type: 'SET_SCENE_LIGHTING', lighting: { ambientIntensity: 0 } });
    expect(s.lightPlacements[0].intensity).toBe(2.0);
  });

  it('switching back to a shot does not duplicate lights', () => {
    let s = withTwoShots(initialState);
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    // Switch to shot-2 (copies from shot-1)
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    expect(s.lightPlacements).toHaveLength(2);
    // Switch back to shot-1 (shot-1 already has lights, no copy)
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 0 });
    expect(s.lightPlacements).toHaveLength(2);
    // Switch to shot-2 again (shot-2 already has lights, no copy)
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    expect(s.lightPlacements).toHaveLength(2);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Lighting — Edge Cases', () => {
  it('ADD_LIGHT with all boundary values', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', {
      id: 'edge',
      kelvin: 2000,
      intensity: 0,
      distance: 0,
      coneAngle: 5 * Math.PI / 180,
      penumbra: 0,
    }));
    expect(s.lightPlacements[0].kelvin).toBe(2000);
    expect(s.lightPlacements[0].intensity).toBe(0);
    expect(s.lightPlacements[0].distance).toBe(0);
    expect(s.lightPlacements[0].penumbra).toBe(0);
  });

  it('ADD_LIGHT with max boundary values', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', {
      id: 'maxed',
      kelvin: 10000,
      intensity: 10,
      distance: 50,
      coneAngle: Math.PI / 2,
      penumbra: 1,
    }));
    expect(s.lightPlacements[0].kelvin).toBe(10000);
    expect(s.lightPlacements[0].intensity).toBe(10);
    expect(s.lightPlacements[0].distance).toBe(50);
    expect(s.lightPlacements[0].penumbra).toBe(1);
  });

  it('UPDATE_LIGHT with empty updates object is effectively a no-op', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    const light = makeLight('shot-1', { id: 'l1', intensity: 3.0 });
    s = addLight(s, light);
    s = reducer(s, { type: 'UPDATE_LIGHT', id: 'l1', shotId: 'shot-1', updates: {} });
    expect(s.lightPlacements[0].intensity).toBe(3.0);
  });

  it('removing all lights from a shot leaves it empty', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addLight(s, makeLight('shot-1', { id: 'l1' }));
    s = addLight(s, makeLight('shot-1', { id: 'l2' }));
    s = reducer(s, { type: 'REMOVE_LIGHT', id: 'l1', shotId: 'shot-1' });
    s = reducer(s, { type: 'REMOVE_LIGHT', id: 'l2', shotId: 'shot-1' });
    expect(s.lightPlacements).toHaveLength(0);
  });

  it('kelvinToColor handles temperature extremes gracefully', () => {
    // Very low
    expect(kelvinToColor(1000)).toMatch(/^#[0-9a-f]{6}$/);
    // Very high
    expect(kelvinToColor(15000)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('blendKelvinWithTint with partial color produces expected blend', () => {
    // Green tint should zero out red and blue from kelvin
    const color = blendKelvinWithTint(5500, '#00ff00');
    expect(color.r).toBeCloseTo(0, 4);
    expect(color.b).toBeCloseTo(0, 4);
    expect(color.g).toBeGreaterThan(0);
  });
});

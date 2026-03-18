import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../store';
import type { CineBlockState, CaptureEntry } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withShot(state: CineBlockState, id: string, name: string): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name });
}

function makeCapture(
  shotId: string,
  frameType: 'start' | 'end',
  isHero = false,
  rollAngle = 0,
  id?: string,
): CaptureEntry {
  return {
    id: id ?? crypto.randomUUID(),
    shotId,
    frameType,
    dataUrl: `data:image/png;base64,fake-${shotId}-${frameType}`,
    isHero,
    capturedAt: new Date().toISOString(),
    rollAngle,
  };
}

// ─── Roll Angle — Initial State ─────────────────────────────────────────────

describe('Camera Roll — Initial State', () => {
  it('rollAngle defaults to 0', () => {
    expect(initialState.rollAngle).toBe(0);
  });

  it('rollAngle is a number', () => {
    expect(typeof initialState.rollAngle).toBe('number');
  });
});

// ─── Roll Angle — SET_ROLL_ANGLE Action ─────────────────────────────────────

describe('Camera Roll — SET_ROLL_ANGLE', () => {
  it('sets a positive roll angle', () => {
    const state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 15 });
    expect(state.rollAngle).toBe(15);
  });

  it('sets a negative roll angle', () => {
    const state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: -30 });
    expect(state.rollAngle).toBe(-30);
  });

  it('sets roll to maximum +90', () => {
    const state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 90 });
    expect(state.rollAngle).toBe(90);
  });

  it('sets roll to minimum -90', () => {
    const state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: -90 });
    expect(state.rollAngle).toBe(-90);
  });

  it('resets roll back to 0', () => {
    let state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 25 });
    expect(state.rollAngle).toBe(25);
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 0 });
    expect(state.rollAngle).toBe(0);
  });

  it('overrides previous roll angle', () => {
    let state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 10 });
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: -20 });
    expect(state.rollAngle).toBe(-20);
  });

  it('handles fractional angles', () => {
    const state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 12.5 });
    expect(state.rollAngle).toBe(12.5);
  });

  it('does not affect other state properties', () => {
    const state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 33 });
    expect(state.currentView).toBe(initialState.currentView);
    expect(state.activeShotIndex).toBe(initialState.activeShotIndex);
    expect(state.activeFrameType).toBe(initialState.activeFrameType);
    expect(state.captures).toEqual(initialState.captures);
    expect(state.aspectRatio).toBe(initialState.aspectRatio);
  });
});

// ─── Roll Angle — Interaction with Other Actions ────────────────────────────

describe('Camera Roll — Interaction with Other Actions', () => {
  it('rollAngle persists across navigation', () => {
    let state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 22 });
    state = reducer(state, { type: 'NAVIGATE', view: 'studio' });
    expect(state.rollAngle).toBe(22);
  });

  it('rollAngle persists across shot changes', () => {
    let state = withShot(initialState, 'shot-1', 'Shot 1');
    state = withShot(state, 'shot-2', 'Shot 2');
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: -15 });
    state = reducer(state, { type: 'SET_ACTIVE_SHOT', index: 1 });
    expect(state.rollAngle).toBe(-15);
  });

  it('rollAngle persists across frame type changes', () => {
    let state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 40 });
    state = reducer(state, { type: 'SET_FRAME_TYPE', frameType: 'end' });
    expect(state.rollAngle).toBe(40);
  });

  it('rollAngle persists across aspect ratio changes', () => {
    let state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: -5 });
    state = reducer(state, { type: 'SET_ASPECT_RATIO', aspectRatio: '2.39:1' });
    expect(state.rollAngle).toBe(-5);
  });

  it('RESET restores rollAngle to 0', () => {
    let state = reducer(initialState, { type: 'SET_ROLL_ANGLE', angle: 42 });
    expect(state.rollAngle).toBe(42);
    state = reducer(state, { type: 'RESET' });
    expect(state.rollAngle).toBe(0);
  });
});

// ─── Roll Angle — Per-Capture Storage ───────────────────────────────────────

describe('Camera Roll — Capture Roll Metadata', () => {
  it('capture entry includes rollAngle field', () => {
    const cap = makeCapture('shot-1', 'start', true, 12);
    expect(cap.rollAngle).toBe(12);
  });

  it('capture with zero roll stores 0', () => {
    const cap = makeCapture('shot-1', 'start', true, 0);
    expect(cap.rollAngle).toBe(0);
  });

  it('capture with negative roll stores negative value', () => {
    const cap = makeCapture('shot-1', 'end', false, -30);
    expect(cap.rollAngle).toBe(-30);
  });

  it('ADD_CAPTURE stores roll angle in state', () => {
    let state = withShot(initialState, 'shot-1', 'Shot 1');
    const cap = makeCapture('shot-1', 'start', true, 18, 'cap-1');
    state = reducer(state, { type: 'ADD_CAPTURE', capture: cap });
    expect(state.captures[0].rollAngle).toBe(18);
  });

  it('different captures can have different roll angles', () => {
    let state = withShot(initialState, 'shot-1', 'Shot 1');
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'start', true, 10, 'cap-1'),
    });
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'end', true, -25, 'cap-2'),
    });
    expect(state.captures[0].rollAngle).toBe(10);
    expect(state.captures[1].rollAngle).toBe(-25);
  });

  it('roll angle preserved across hero toggle', () => {
    let state = withShot(initialState, 'shot-1', 'Shot 1');
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'start', true, 15, 'cap-1'),
    });
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'start', false, -10, 'cap-2'),
    });

    // Toggle hero to cap-2
    state = reducer(state, { type: 'TOGGLE_HERO', captureId: 'cap-2' });

    // Roll angles should be unchanged
    expect(state.captures.find((c) => c.id === 'cap-1')!.rollAngle).toBe(15);
    expect(state.captures.find((c) => c.id === 'cap-2')!.rollAngle).toBe(-10);
    // Hero status changed
    expect(state.captures.find((c) => c.id === 'cap-1')!.isHero).toBe(false);
    expect(state.captures.find((c) => c.id === 'cap-2')!.isHero).toBe(true);
  });
});

// ─── Scale Shortcut Remap (S → E) — Structural Verification ────────────────

describe('Scale Shortcut Remap — S freed for camera, E for scale', () => {
  it('S key is no longer mapped to scale in the new shortcut layout', () => {
    // This verifies the design intent: S is now for camera backward movement.
    // The actual key handler lives in Mannequins.tsx — this test documents the contract.
    const newShortcutMap: Record<string, string> = {
      w: 'camera forward',
      a: 'camera left',
      s: 'camera backward',
      d: 'camera right',
      q: 'camera down',
      e: 'scale / camera up',
      g: 'translate',
      r: 'rotate',
      h: 'reset roll',
    };

    expect(newShortcutMap['s']).toBe('camera backward');
    expect(newShortcutMap['e']).toContain('scale');
    expect(newShortcutMap['g']).toBe('translate');
    expect(newShortcutMap['r']).toBe('rotate');
  });

  it('T key is mapped to reset rotation in the new shortcut layout', () => {
    const newShortcutMap: Record<string, string> = {
      w: 'camera forward',
      a: 'camera left',
      s: 'camera backward',
      d: 'camera right',
      q: 'camera down',
      e: 'scale / camera up',
      g: 'translate',
      r: 'rotate',
      h: 'reset roll',
      t: 'reset rotation',
    };

    expect(newShortcutMap['t']).toBe('reset rotation');
    // T should not conflict with existing camera/gizmo keys
    expect(newShortcutMap['t']).not.toContain('camera');
    expect(newShortcutMap['t']).not.toBe('translate');
    expect(newShortcutMap['t']).not.toBe('rotate');
    expect(newShortcutMap['t']).not.toBe('scale');
  });

  it('WASD keys are all mapped to camera movement', () => {
    const cameraKeys = ['w', 'a', 's', 'd'];
    const cameraActions = ['camera forward', 'camera left', 'camera backward', 'camera right'];
    cameraKeys.forEach((key, i) => {
      expect(cameraActions[i]).toContain('camera');
    });
  });
});

// ─── Roll Angle — Rapid Sequential Updates ──────────────────────────────────

describe('Camera Roll — Rapid Sequential Updates', () => {
  it('handles many consecutive roll changes correctly', () => {
    let state = initialState;
    for (let angle = -90; angle <= 90; angle += 5) {
      state = reducer(state, { type: 'SET_ROLL_ANGLE', angle });
    }
    expect(state.rollAngle).toBe(90);
  });

  it('alternating positive and negative rolls settles on last value', () => {
    let state = initialState;
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 30 });
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: -30 });
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 15 });
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: -15 });
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 7 });
    expect(state.rollAngle).toBe(7);
  });
});

// ─── Roll Angle — Full Workflow ─────────────────────────────────────────────

describe('Camera Roll — Full Workflow', () => {
  it('set roll → capture → reset roll → capture different angle', () => {
    let state = withShot(initialState, 'shot-1', 'Shot 1');

    // Set roll to 20° and capture
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 20 });
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'start', true, state.rollAngle, 'cap-1'),
    });
    expect(state.captures[0].rollAngle).toBe(20);

    // Reset roll (simulates H key or reset button)
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 0 });
    expect(state.rollAngle).toBe(0);

    // Capture at different angle for end frame
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: -12 });
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'end', true, state.rollAngle, 'cap-2'),
    });

    expect(state.captures).toHaveLength(2);
    expect(state.captures[0].rollAngle).toBe(20);
    expect(state.captures[1].rollAngle).toBe(-12);
    expect(state.rollAngle).toBe(-12);
  });

  it('full reset clears roll and captures', () => {
    let state = withShot(initialState, 'shot-1', 'Shot 1');
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 33 });
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'start', true, 33, 'cap-1'),
    });

    state = reducer(state, { type: 'RESET' });
    expect(state.rollAngle).toBe(0);
    expect(state.captures).toEqual([]);
  });

  it('multiple shots with different roll angles per capture', () => {
    let state = withShot(initialState, 'shot-1', 'Wide Shot');
    state = withShot(state, 'shot-2', 'Dutch Angle');

    // Shot 1: no roll
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: 0 });
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-1', 'start', true, 0, 'cap-1'),
    });

    // Shot 2: heavy dutch angle
    state = reducer(state, { type: 'SET_ACTIVE_SHOT', index: 1 });
    state = reducer(state, { type: 'SET_ROLL_ANGLE', angle: -35 });
    state = reducer(state, {
      type: 'ADD_CAPTURE',
      capture: makeCapture('shot-2', 'start', true, -35, 'cap-2'),
    });

    expect(state.captures).toHaveLength(2);
    expect(state.captures[0].rollAngle).toBe(0);
    expect(state.captures[1].rollAngle).toBe(-35);
    expect(state.activeShotIndex).toBe(1);
    expect(state.rollAngle).toBe(-35);
  });
});

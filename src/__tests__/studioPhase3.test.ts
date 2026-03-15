import { describe, it, expect } from 'vitest';
import { initialState, reducer } from '../store';
import type { CineBlockState, CaptureEntry } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withShot(state: CineBlockState, id: string, name: string): CineBlockState {
  return reducer(state, { type: 'ADD_SHOT', id, name });
}

function withTwoShots(state: CineBlockState): CineBlockState {
  let s = withShot(state, 'shot-1', 'Shot 1A');
  s = withShot(s, 'shot-2', 'Shot 2A');
  return s;
}

function makeCapture(
  shotId: string,
  frameType: 'start' | 'end',
  isHero = false,
  id?: string,
): CaptureEntry {
  return {
    id: id ?? crypto.randomUUID(),
    shotId,
    frameType,
    dataUrl: `data:image/png;base64,fake-${shotId}-${frameType}`,
    isHero,
    capturedAt: new Date().toISOString(),
  };
}

function addCapture(state: CineBlockState, capture: CaptureEntry): CineBlockState {
  return reducer(state, { type: 'ADD_CAPTURE', capture });
}

// ─── 3.2 Shot Sidebar — List & Selection ────────────────────────────────────

describe('Phase 3.2 — Shot Selection', () => {
  it('default active shot index is 0', () => {
    expect(initialState.activeShotIndex).toBe(0);
  });

  it('SET_ACTIVE_SHOT changes the active shot index', () => {
    const s = withTwoShots(initialState);
    const updated = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    expect(updated.activeShotIndex).toBe(1);
  });

  it('active shot index survives adding more shots', () => {
    let s = withTwoShots(initialState);
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    s = withShot(s, 'shot-3', 'Shot 3A');
    expect(s.activeShotIndex).toBe(1);
    expect(s.shots.length).toBe(3);
  });
});

// ─── 3.3 — Frame Type Toggle ────────────────────────────────────────────────

describe('Phase 3.3 — Frame Type Toggle', () => {
  it('default frame type is start', () => {
    expect(initialState.activeFrameType).toBe('start');
  });

  it('SET_FRAME_TYPE toggles to end', () => {
    const s = reducer(initialState, { type: 'SET_FRAME_TYPE', frameType: 'end' });
    expect(s.activeFrameType).toBe('end');
  });

  it('SET_FRAME_TYPE toggles back to start', () => {
    let s = reducer(initialState, { type: 'SET_FRAME_TYPE', frameType: 'end' });
    s = reducer(s, { type: 'SET_FRAME_TYPE', frameType: 'start' });
    expect(s.activeFrameType).toBe('start');
  });
});

// ─── 3.4 Capture Pipeline ───────────────────────────────────────────────────

describe('Phase 3.4 — Capture Pipeline (state)', () => {
  it('ADD_CAPTURE stores a new capture', () => {
    const s = withShot(initialState, 'shot-1', 'Shot 1');
    const cap = makeCapture('shot-1', 'start', true);
    const updated = addCapture(s, cap);
    expect(updated.captures.length).toBe(1);
    expect(updated.captures[0]).toEqual(cap);
  });

  it('first capture per shot+frameType should be hero', () => {
    const s = withShot(initialState, 'shot-1', 'Shot 1');
    const cap = makeCapture('shot-1', 'start', true);
    const updated = addCapture(s, cap);
    expect(updated.captures[0].isHero).toBe(true);
  });

  it('subsequent captures for same shot+frameType are not auto-hero', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'cap-1'));
    s = addCapture(s, makeCapture('shot-1', 'start', false, 'cap-2'));
    expect(s.captures.length).toBe(2);
    expect(s.captures[0].isHero).toBe(true);
    expect(s.captures[1].isHero).toBe(false);
  });

  it('captures for different frameTypes are independent', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'cap-start-1'));
    s = addCapture(s, makeCapture('shot-1', 'end', true, 'cap-end-1'));
    expect(s.captures.length).toBe(2);
    expect(s.captures[0].frameType).toBe('start');
    expect(s.captures[1].frameType).toBe('end');
    expect(s.captures[0].isHero).toBe(true);
    expect(s.captures[1].isHero).toBe(true);
  });

  it('captures for different shots are independent', () => {
    let s = withTwoShots(initialState);
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'cap-s1'));
    s = addCapture(s, makeCapture('shot-2', 'start', true, 'cap-s2'));
    expect(s.captures.length).toBe(2);
    expect(s.captures[0].shotId).toBe('shot-1');
    expect(s.captures[1].shotId).toBe('shot-2');
  });

  it('captures store dataUrl and timestamp', () => {
    const s = withShot(initialState, 'shot-1', 'Shot 1');
    const cap = makeCapture('shot-1', 'start', true);
    const updated = addCapture(s, cap);
    expect(updated.captures[0].dataUrl).toContain('data:image/png');
    expect(updated.captures[0].capturedAt).toBeTruthy();
  });

  it('can accumulate many captures per shot', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    for (let i = 0; i < 5; i++) {
      s = addCapture(s, makeCapture('shot-1', 'start', i === 0, `cap-${i}`));
    }
    expect(s.captures.length).toBe(5);
    const heroes = s.captures.filter((c) => c.isHero);
    expect(heroes.length).toBe(1);
    expect(heroes[0].id).toBe('cap-0');
  });
});

// ─── 3.5 Hero Toggle ────────────────────────────────────────────────────────

describe('Phase 3.5 — Hero Toggle (TOGGLE_HERO)', () => {
  it('toggling hero unmarks the current hero and marks the new one', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'cap-1'));
    s = addCapture(s, makeCapture('shot-1', 'start', false, 'cap-2'));
    s = addCapture(s, makeCapture('shot-1', 'start', false, 'cap-3'));

    // Toggle cap-2 as hero
    s = reducer(s, { type: 'TOGGLE_HERO', captureId: 'cap-2' });
    expect(s.captures.find((c) => c.id === 'cap-1')!.isHero).toBe(false);
    expect(s.captures.find((c) => c.id === 'cap-2')!.isHero).toBe(true);
    expect(s.captures.find((c) => c.id === 'cap-3')!.isHero).toBe(false);
  });

  it('toggling hero only affects same shot+frameType', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'cap-start'));
    s = addCapture(s, makeCapture('shot-1', 'end', true, 'cap-end'));
    s = addCapture(s, makeCapture('shot-1', 'start', false, 'cap-start-2'));

    // Toggle cap-start-2 as hero — should only affect 'start' captures
    s = reducer(s, { type: 'TOGGLE_HERO', captureId: 'cap-start-2' });
    expect(s.captures.find((c) => c.id === 'cap-start')!.isHero).toBe(false);
    expect(s.captures.find((c) => c.id === 'cap-start-2')!.isHero).toBe(true);
    expect(s.captures.find((c) => c.id === 'cap-end')!.isHero).toBe(true); // untouched
  });

  it('toggling hero for non-existent capture is a no-op', () => {
    const s = withShot(initialState, 'shot-1', 'Shot 1');
    const updated = reducer(s, { type: 'TOGGLE_HERO', captureId: 'nonexistent' });
    expect(updated).toBe(s);
  });
});

// ─── Capture Tray Filtering Logic ───────────────────────────────────────────

describe('Phase 3.5 — Capture Tray Filtering', () => {
  it('filtering captures by shotId returns only that shots captures', () => {
    let s = withTwoShots(initialState);
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'c1'));
    s = addCapture(s, makeCapture('shot-1', 'end', true, 'c2'));
    s = addCapture(s, makeCapture('shot-2', 'start', true, 'c3'));

    const shot1Captures = s.captures.filter((c) => c.shotId === 'shot-1');
    const shot2Captures = s.captures.filter((c) => c.shotId === 'shot-2');
    expect(shot1Captures.length).toBe(2);
    expect(shot2Captures.length).toBe(1);
  });

  it('filtering by frameType splits start and end correctly', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'c1'));
    s = addCapture(s, makeCapture('shot-1', 'start', false, 'c2'));
    s = addCapture(s, makeCapture('shot-1', 'end', true, 'c3'));

    const shotCaps = s.captures.filter((c) => c.shotId === 'shot-1');
    const starts = shotCaps.filter((c) => c.frameType === 'start');
    const ends = shotCaps.filter((c) => c.frameType === 'end');
    expect(starts.length).toBe(2);
    expect(ends.length).toBe(1);
  });

  it('empty shot has no captures', () => {
    const s = withShot(initialState, 'shot-1', 'Shot 1');
    const caps = s.captures.filter((c) => c.shotId === 'shot-1');
    expect(caps.length).toBe(0);
  });
});

// ─── Integration: Full Capture Flow ─────────────────────────────────────────

describe('Phase 3 — Integration: Shot → Frame Type → Capture Flow', () => {
  it('full flow: select shot, set frame type, add captures', () => {
    let s = withTwoShots(initialState);

    // Select shot 2
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    expect(s.activeShotIndex).toBe(1);

    // Set frame type to end
    s = reducer(s, { type: 'SET_FRAME_TYPE', frameType: 'end' });
    expect(s.activeFrameType).toBe('end');

    // Capture for shot-2, end frame
    const activeShot = s.shots[s.activeShotIndex];
    s = addCapture(s, makeCapture(activeShot.id, s.activeFrameType, true, 'cap-1'));
    s = addCapture(s, makeCapture(activeShot.id, s.activeFrameType, false, 'cap-2'));

    // Verify captures are for shot-2, end type
    const shot2EndCaps = s.captures.filter(
      (c) => c.shotId === 'shot-2' && c.frameType === 'end',
    );
    expect(shot2EndCaps.length).toBe(2);
    expect(shot2EndCaps[0].isHero).toBe(true);
    expect(shot2EndCaps[1].isHero).toBe(false);
  });

  it('switching shots preserves all captures', () => {
    let s = withTwoShots(initialState);
    s = addCapture(s, makeCapture('shot-1', 'start', true, 'c1'));
    s = addCapture(s, makeCapture('shot-1', 'end', true, 'c2'));

    // Switch to shot 2
    s = reducer(s, { type: 'SET_ACTIVE_SHOT', index: 1 });
    s = addCapture(s, makeCapture('shot-2', 'start', true, 'c3'));

    // All captures still exist
    expect(s.captures.length).toBe(3);
    expect(s.captures.filter((c) => c.shotId === 'shot-1').length).toBe(2);
    expect(s.captures.filter((c) => c.shotId === 'shot-2').length).toBe(1);
  });

  it('RESET clears all captures', () => {
    let s = withShot(initialState, 'shot-1', 'Shot 1');
    s = addCapture(s, makeCapture('shot-1', 'start', true));
    s = addCapture(s, makeCapture('shot-1', 'end', true));
    expect(s.captures.length).toBe(2);

    s = reducer(s, { type: 'RESET' });
    expect(s.captures.length).toBe(0);
    expect(s.activeShotIndex).toBe(0);
    expect(s.activeFrameType).toBe('start');
  });
});

# Improve Camera Flexibility — Dev Plan

>Resume this session with:
claude --resume a88c037a-b9c8-48b7-a3ad-502cda543e68


> **Goal:** Give the user full cinematic control over the camera — free translation along X/Y/Z, orbital rotation, and dutch angle (roll) — while keeping the UX simple and intentional.

---

## Problem Statement

The current camera (`OrbitControls` from drei) is locked to a concentric orbit around the world origin `(0, 0, 0)`. This limits framing because:

1. **No free translation** — the camera can pan relative to the orbit center, but the user can't freely truck/dolly/elevate to reach arbitrary positions in the world.
2. **No camera roll** — OrbitControls uses spherical coordinates (azimuth + polar), which only supports 2 of 3 rotation axes. There is no way to achieve dutch angle shots.

---

## Solution Overview

**Replace `OrbitControls` with `CameraControls`** (drei's wrapper around [camera-controls by yomotsu](https://github.com/yomotsu/camera-controls)), then layer dutch angle roll on top via `camera.up` vector manipulation.

`CameraControls` is a drop-in replacement that preserves all existing orbit/pan/zoom behavior and adds:
- Programmatic `truck()`, `forward()`, `elevate()` methods
- Smooth animated transitions via built-in `smoothTime`
- `setLookAt()` for animated camera resets
- `toJSON()` / `fromJSON()` for potential future camera presets
- Configurable input mapping (mouse buttons, touch gestures)
- `updateCameraUp()` — the key hook we'll use for dutch angle roll

---

## Keyboard Shortcut Remapping

### Current shortcuts (StudioView.tsx + Mannequins.tsx)

| Key | Current Action | Location |
|-----|----------------|----------|
| `Space` | Capture frame | `StudioView.tsx:290-293` |
| `1` | Set frame type → start | `StudioView.tsx:294-295` |
| `2` | Set frame type → end | `StudioView.tsx:296-298` |
| `G` | Mannequin gizmo → translate | `Mannequins.tsx:145` |
| `R` | Mannequin gizmo → rotate | `Mannequins.tsx:146` |
| `S` | Mannequin gizmo → scale | `Mannequins.tsx:147` |
| `Esc` | Cancel / close panels | `StudioView.tsx:300-312` |

### New shortcut map (after changes)

| Key | Action | Notes |
|-----|--------|-------|
| `W` | Camera forward | New — WASD translation |
| `A` | Camera truck left | New — WASD translation |
| `S` | Camera backward | **Freed up** from mannequin scale |
| `D` | Camera truck right | New — WASD translation |
| `Q` | Camera elevate down | New — vertical translation |
| `E` | Mannequin gizmo → scale | **Moved from S** ("E for Extend") |
| `G` | Mannequin gizmo → translate | Unchanged |
| `R` | Mannequin gizmo → rotate | Unchanged |
| `H` | Reset roll to horizon (0°) | New — dutch angle reset |
| `Space` | Capture frame | Unchanged |
| `1` / `2` | Start / End frame type | Unchanged |
| `Esc` | Cancel / close | Unchanged |

**Conflict resolution:** WASD always drives camera translation regardless of mannequin selection. G/R/E only affect the mannequin gizmo when a mannequin is selected. No overlap.

---

## Implementation Steps

### Step 1: Swap OrbitControls → CameraControls

**Files to modify:** `StudioView.tsx`

**Changes:**
1. Change import: `OrbitControls` → `CameraControls` from `@react-three/drei`
2. Replace `<OrbitControls ref={controlsRef} makeDefault />` with `<CameraControls ref={controlsRef} makeDefault smoothTime={0.25} />`
3. Update `SceneControls` reset logic:
   ```ts
   // Before (OrbitControls):
   camera.position.set(3, 2, 3);
   camera.lookAt(0, 0, 0);
   controlsRef.current.target.set(0, 0, 0);
   controlsRef.current.update();

   // After (CameraControls):
   controlsRef.current.setLookAt(3, 2, 3, 0, 0, 0, true); // true = animated
   ```
4. Update the ref type — `CameraControls` from drei exposes a typed ref, replace the `any` type

**Risk — SparkJS camera clone patch:**
`MarbleWorld.tsx:8-32` patches `camera.clone()` because SparkJS deep-clones the camera each frame and OrbitControls attaches non-clonable properties (`domElement`, `_listeners`, `_controlsDispose`). CameraControls may attach different or additional non-clonable properties. **Test this immediately after the swap.** If new properties break cloning, add them to the `skipKeys` array in `patchCameraClone`.

**Risk — Mannequin TransformControls:**
`Mannequins.tsx:140-157` disables/enables OrbitControls via `orbit.enabled`. CameraControls uses the same `.enabled` property, so this should work as-is. Verify after swap.

---

### Step 2: Remap Scale Shortcut from S → E

**Files to modify:** `Mannequins.tsx`, `StudioView.tsx`

**Changes:**
1. In `Mannequins.tsx:147`, change:
   ```ts
   // Before:
   if (e.key === 's' || e.key === 'S') setMode('scale');
   // After:
   if (e.key === 'e' || e.key === 'E') setMode('scale');
   ```
2. In `StudioView.tsx`, update the keyboard shortcut help panel (around line 713):
   - Change the Scale shortcut display from `S` to `E`
   - Update any tooltip text referencing "S for Scale" to "E for Scale (Extend)"
3. In `StudioView.tsx`, update the full shortcuts modal (around line 1181):
   - Change `['S', 'Scale selected asset']` to `['E', 'Scale selected asset (Extend)']`

---

### Step 3: Add WASD + Q/E Camera Translation

**Files to modify:** `StudioView.tsx`

**Approach:** Track held keys in a `Set<string>`, apply translation each frame via `useFrame`.

**New component** — `CameraKeyboardDriver` (inside StudioView.tsx, alongside `SceneControls`):

```tsx
function CameraKeyboardDriver({
  controlsRef,
}: {
  controlsRef: React.MutableRefObject<CameraControlsImpl | null>;
}) {
  const keysRef = useRef(new Set<string>());
  const SPEED = 2; // units per second — tune to taste

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      keysRef.current.add(e.key.toLowerCase());
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useFrame((_, delta) => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const keys = keysRef.current;
    const d = SPEED * delta;

    // Truck left/right
    if (keys.has('a')) ctrl.truck(-d, 0, false);
    if (keys.has('d')) ctrl.truck(d, 0, false);

    // Forward/back
    if (keys.has('w')) ctrl.forward(d, false);
    if (keys.has('s')) ctrl.forward(-d, false);

    // Elevate up/down
    if (keys.has('e') && !selectedMannequin) ctrl.elevate(d, false);
    if (keys.has('q')) ctrl.elevate(-d, false);
  });

  return null;
}
```

> **Note on Q/E:** `Q` is always elevate-down. `E` is elevate-up **only when no mannequin is selected** (since E is also the scale gizmo shortcut). When a mannequin IS selected, E switches to scale mode and elevation via E is blocked. This is an acceptable trade-off — vertical movement via Q is always available, and the user can deselect the mannequin to get E-elevate back.

**Add to Canvas tree:**
```tsx
<Canvas ...>
  <SceneControls resetRef={cameraResetRef} controlsRef={orbitControlsRef} />
  <CameraKeyboardDriver controlsRef={orbitControlsRef} />
  {/* ... rest of scene */}
</Canvas>
```

---

### Step 4: Add Dutch Angle (Roll)

**Concept:** Store a `rollAngle` (degrees). In each frame, rotate the camera's `up` vector around its forward axis by `rollAngle`, then call `controls.updateCameraUp()`. This tilts the horizon without fighting CameraControls' internal spherical coordinate system.

#### 4a. Add roll state

**Files to modify:** `types.ts`, `store.tsx`

Add to `CineBlockState`:
```ts
rollAngle: number; // degrees, default 0
```

Add action:
```ts
| { type: 'SET_ROLL_ANGLE'; angle: number }
```

Add reducer case:
```ts
case 'SET_ROLL_ANGLE':
  return { ...state, rollAngle: action.angle };
```

Add to `initialState`:
```ts
rollAngle: 0,
```

#### 4b. Apply roll in useFrame

**New component** — `CameraRollDriver` (inside StudioView.tsx):

```tsx
function CameraRollDriver({
  controlsRef,
  rollAngle,
}: {
  controlsRef: React.MutableRefObject<CameraControlsImpl | null>;
  rollAngle: number;
}) {
  const { camera } = useThree();

  useFrame(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    if (rollAngle === 0) {
      // Reset to default up
      camera.up.set(0, 1, 0);
    } else {
      // Get camera forward direction
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);

      // Rotate default up vector around forward axis by rollAngle
      const defaultUp = new THREE.Vector3(0, 1, 0);
      const radians = THREE.MathUtils.degToRad(rollAngle);
      defaultUp.applyAxisAngle(forward, radians);
      camera.up.copy(defaultUp);
    }
    ctrl.updateCameraUp();
  });

  return null;
}
```

#### 4c. Add roll slider to sidebar UI

**Files to modify:** `StudioView.tsx`

Add a "Camera Roll" section in the sidebar (near the aspect ratio selector). Design:

```
┌─────────────────────────────┐
│  Camera Roll                │
│  ◄──────────●───────────►   │   ← slider: -45° to +45°, step 1°
│          12°                │   ← current value display
│  [↺ Return to Horizon]      │   ← reset button (sets roll to 0)
└─────────────────────────────┘
```

- **Slider:** `<input type="range" min={-45} max={45} step={1} />`
- **Value display:** Show current degrees with ° symbol
- **Reset button:** Label = "Return to Horizon", tooltip = "Reset camera roll to 0°" — dispatches `SET_ROLL_ANGLE` with `0`
- **Keyboard shortcut `H`:** Also resets roll to 0 (add to the keydown handler in StudioView.tsx)

#### 4d. Store roll per-keyframe in captures

**Files to modify:** `types.ts`

Add to `CaptureEntry`:
```ts
rollAngle: number; // degrees at time of capture
```

When `handleCapture()` is called, include `state.rollAngle` in the capture entry. This means each captured frame remembers its roll angle, enabling different dutch angles per start/end frame.

---

### Step 5: Update Camera Reset to Include Roll

**Files to modify:** `StudioView.tsx`

The existing reset button (`handleResetCamera`) should also reset roll:

```ts
const handleResetCamera = useCallback(() => {
  cameraResetRef.current?.();
  dispatch({ type: 'SET_ROLL_ANGLE', angle: 0 });
}, [dispatch]);
```

The `SceneControls` reset function (which calls `controls.setLookAt(...)`) will handle position/target reset. The roll reset via dispatch ensures the `CameraRollDriver` resets `camera.up` to `(0, 1, 0)`.

---

### Step 6: Update Keyboard Shortcuts Help UI

**Files to modify:** `StudioView.tsx`

Update all three places where shortcuts are displayed:

1. **Quick-reference panel** (~line 680-727): Add new entries for WASD, Q, H
2. **Full shortcuts modal** (~line 1170-1210): Add all new shortcuts
3. **Bottom toolbar tooltips**: Update any hover text that references old shortcuts

New entries to add:

| Key | Description |
|-----|-------------|
| `W / A / S / D` | Move camera forward / left / back / right |
| `Q` | Move camera down |
| `E` | Move camera up (or Scale when mannequin selected) |
| `H` | Return to horizon (reset roll to 0°) |

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/views/StudioView.tsx` | Swap OrbitControls → CameraControls; add `CameraKeyboardDriver` and `CameraRollDriver` components; add roll slider to sidebar; add H hotkey; update reset to include roll; update shortcut displays |
| `src/components/Mannequins.tsx` | Change scale shortcut from `S` → `E` (line 147) |
| `src/components/MarbleWorld.tsx` | Verify `patchCameraClone` still works; update `skipKeys` if CameraControls adds new non-clonable properties |
| `src/types.ts` | Add `rollAngle: number` to `CineBlockState`; add `rollAngle: number` to `CaptureEntry` |
| `src/store.tsx` | Add `SET_ROLL_ANGLE` action; add reducer case; add `rollAngle: 0` to initial state |

---

## Suggested Implementation Order

| # | Task | Effort | Risk |
|---|------|--------|------|
| 1 | Swap OrbitControls → CameraControls | Small | Medium — SparkJS clone patch must be verified |
| 2 | Remap S → E for mannequin scale | Trivial | None |
| 3 | Add WASD + Q camera translation | Small | Low — standard useFrame pattern |
| 4 | Add roll state + CameraRollDriver | Small | Low — camera.up manipulation is well-documented |
| 5 | Add roll slider UI + H hotkey | Small | None |
| 6 | Store roll per-keyframe in captures | Trivial | None |
| 7 | Update reset to include roll | Trivial | None |
| 8 | Update all shortcut help text | Small | None |

**Total estimated scope:** Moderate — mostly wiring. The only real risk is Step 1 (SparkJS compatibility).

---

## Testing Checklist

- [ ] Orbit (left drag) still works as before
- [ ] Pan (right drag) still works as before
- [ ] Scroll zoom still works as before
- [ ] WASD moves camera in expected directions
- [ ] Q lowers camera, E raises camera (when no mannequin selected)
- [ ] E switches gizmo to scale mode when mannequin is selected
- [ ] G/R still switch gizmo to translate/rotate
- [ ] Roll slider tilts the horizon smoothly
- [ ] H key and "Return to Horizon" button both reset roll to 0°
- [ ] Reset camera button resets position AND roll
- [ ] Mannequin TransformControls still disables camera during drag
- [ ] SparkJS Gaussian splat renders correctly (camera clone patch works)
- [ ] Captures include roll angle in metadata
- [ ] Mannequin placement raycast still works
- [ ] No keyboard shortcuts fire when typing in input fields

---

## References

- [camera-controls (yomotsu)](https://github.com/yomotsu/camera-controls) — underlying library
- [drei CameraControls docs](https://drei.docs.pmnd.rs/controls/camera-controls) — React wrapper
- [camera-controls Issue #190](https://github.com/yomotsu/camera-controls/issues/190) — roll axis limitation + workarounds
- [Three.js forum: OrbitControls + roll](https://discourse.threejs.org/t/proper-way-to-extend-orbitcontrols-to-support-camera-roll/18862)

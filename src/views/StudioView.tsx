import { useRef, useCallback, useState, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import type CameraControlsImpl from 'camera-controls';
import { useCineBlockState, useCineBlockDispatch } from '../store';
import MarbleWorld from '../components/MarbleWorld';
import { MannequinScene, MannequinOverlay } from '../components/Mannequins';
import { LightScene, LightPlacementHelper } from '../components/Lights';
import * as THREE from 'three';

import type { AspectRatioKey, PropShape, LightType } from '../types';
import { ASPECT_RATIOS, DEFAULT_BODY_PARAMS, DEFAULT_POSE, PROP_SHAPES, PROP_SHAPE_DEFAULTS, DEFAULT_LIGHT, DEFAULT_SCENE_LIGHTING } from '../types';
import { kelvinToColor } from '../utils/kelvinToColor';
import { clampToSurface, computeFeetOffset } from '../utils/surfaceClamp';

// --- Constants ---

type LensKey = '35mm' | '50mm' | '85mm';
const LENSES: Record<LensKey, { focal: string; aperture: string }> = {
  '35mm': { focal: '35MM', aperture: 'f/1.8' },
  '50mm': { focal: '50MM', aperture: 'f/1.4' },
  '85mm': { focal: '85MM', aperture: 'f/1.2' },
};
const LENS_ORDER: LensKey[] = ['35mm', '50mm', '85mm'];

// --- Test cube fallback ---

function TestCube() {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#3B82F6" />
    </mesh>
  );
}

// --- Camera controls with reset capability ---

function SceneControls({
  resetRef,
  controlsRef,
}: {
  resetRef: React.MutableRefObject<(() => void) | null>;
  controlsRef: React.MutableRefObject<CameraControlsImpl | null>;
}) {
  useEffect(() => {
    resetRef.current = () => {
      if (controlsRef.current) {
        controlsRef.current.setLookAt(3, 2, 3, 0, 0, 0, true);
      }
    };
    return () => {
      resetRef.current = null;
    };
  }, [resetRef, controlsRef]);

  return <CameraControls ref={controlsRef} makeDefault smoothTime={0.25} />;
}

// --- WASD + Q camera translation driver ---

function CameraKeyboardDriver({
  controlsRef,
  selectedAssetId,
}: {
  controlsRef: React.MutableRefObject<CameraControlsImpl | null>;
  selectedAssetId: string | null;
}) {
  const keysRef = useRef(new Set<string>());
  const SPEED = 2;

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

    if (keys.has('a')) ctrl.truck(-d, 0, false);
    if (keys.has('d')) ctrl.truck(d, 0, false);
    if (keys.has('w')) ctrl.forward(d, false);
    if (keys.has('s')) ctrl.forward(-d, false);
    if (keys.has('e') && !selectedAssetId) ctrl.elevate(d, false);
    if (keys.has('q')) ctrl.elevate(-d, false);
  });

  return null;
}

// --- Camera roll (dutch angle) driver ---

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
      camera.up.set(0, 1, 0);
    } else {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const defaultUp = new THREE.Vector3(0, 1, 0);
      const radians = THREE.MathUtils.degToRad(rollAngle);
      defaultUp.applyAxisAngle(forward, radians);
      camera.up.copy(defaultUp);
    }
    ctrl.updateCameraUp();
  });

  return null;
}

// --- Main StudioView ---

export default function StudioView({
  onNavigate,
}: {
  onNavigate: (view: 'setup' | 'results') => void;
}) {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();

  // Refs
  const colliderRef = useRef<THREE.Object3D | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const cameraResetRef = useRef<(() => void) | null>(null);
  const orbitControlsRef = useRef<CameraControlsImpl | null>(null);
  const overlaySceneRef = useRef<THREE.Scene | null>(null);
  const prevShotIndexRef = useRef(state.activeShotIndex);

  // Existing UI state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [placingAssetId, setPlacingAssetId] = useState<string | null>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [placingLight, setPlacingLight] = useState(false);

  // Phase 6 UI state
  const [showGrid, setShowGrid] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedLens, setSelectedLens] = useState<LensKey>('35mm');
  const [showSettings, setShowSettings] = useState(false);
  const [splatLoaded, setSplatLoaded] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Derived values
  const aspectRatioValue = ASPECT_RATIOS[state.aspectRatio];
  const lensInfo = LENSES[selectedLens];
  const hasWorld = state.worldStatus === 'ready' && state.spzUrl;
  const activeShot = state.shots[state.activeShotIndex] ?? null;
  const shotCaptures = activeShot
    ? state.captures.filter((c) => c.shotId === activeShot.id)
    : [];
  const startCaptures = shotCaptures.filter((c) => c.frameType === 'start');
  const endCaptures = shotCaptures.filter((c) => c.frameType === 'end');
  const activePlacements = activeShot
    ? state.mannequinPlacements.filter((m) => m.shotId === activeShot.id)
    : [];
  const activeLights = activeShot
    ? state.lightPlacements.filter((l) => l.shotId === activeShot.id)
    : [];
  const selectedLight = selectedLightId ? activeLights.find((l) => l.id === selectedLightId) ?? null : null;

  // Mutual exclusion helpers
  const selectAsset = useCallback((id: string | null) => {
    setSelectedAssetId(id);
    if (id) setSelectedLightId(null);
  }, []);
  const selectLight = useCallback((id: string | null) => {
    setSelectedLightId(id);
    if (id) setSelectedAssetId(null);
  }, []);

  // Viewfinder sizing: use width-based for ultra-wide, height-based otherwise
  const viewfinderStyle: React.CSSProperties = {
    aspectRatio: `${aspectRatioValue}`,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    ...(aspectRatioValue > 2
      ? { width: '90%', maxHeight: '85%' }
      : { height: '80%', maxWidth: '92%' }),
  };

  // --- Callbacks ---

  const handleColliderLoaded = useCallback((mesh: THREE.Object3D) => {
    colliderRef.current = mesh;
  }, []);

  const handleSplatLoaded = useCallback(() => {
    setSplatLoaded(true);
  }, []);

  // Reset visibility on shot switch
  useEffect(() => {
    if (state.activeShotIndex !== prevShotIndexRef.current) {
      prevShotIndexRef.current = state.activeShotIndex;
      setSelectedAssetId(null);
      setPlacingAssetId(null);
      setSelectedLightId(null);
      setPlacingLight(false);
      if (activeShot) {
        const visibility: Record<string, boolean> = {};
        state.assets.forEach((a) => {
          const hasPlacement = state.mannequinPlacements.some(
            (m) => m.assetId === a.id && m.shotId === activeShot.id,
          );
          visibility[a.id] = hasPlacement || activeShot.assetIds.includes(a.id);
        });
        dispatch({ type: 'SET_ASSET_VISIBILITY', visibility });
      }
    }
  }, [state.activeShotIndex, activeShot, state.assets, state.mannequinPlacements, dispatch]);

  // Mannequin placement — use the camera raycast hit point directly.
  // No second vertical raycast: on a rotated collider the vertical re-ray
  // can hit a different triangle and produce wrong Y values.
  const handlePlace = useCallback(
    (point: [number, number, number]) => {
      if (!placingAssetId || !activeShot) return;
      const placingAsset = state.assets.find((a) => a.id === placingAssetId);
      const shape: PropShape = placingAsset?.shape ?? 'box';
      const defaultScale = placingAsset?.type === 'prop' ? PROP_SHAPE_DEFAULTS[shape] : [1, 1, 1] as [number, number, number];

      const finalPos: [number, number, number] = [...point];
      if (placingAsset?.type === 'character') {
        finalPos[1] += computeFeetOffset(DEFAULT_BODY_PARAMS.height, DEFAULT_BODY_PARAMS.build);
      }

      dispatch({
        type: 'ADD_MANNEQUIN',
        placement: {
          assetId: placingAssetId,
          shotId: activeShot.id,
          position: finalPos,
          rotation: [0, 0, 0],
          scale: defaultScale,
        },
      });
      setPlacingAssetId(null);
    },
    [placingAssetId, activeShot, state.assets, dispatch],
  );

  const handleCancelPlace = useCallback(() => {
    setPlacingAssetId(null);
  }, []);

  // Light placement
  const handleLightPlace = useCallback(
    (point: [number, number, number]) => {
      if (!activeShot) return;
      dispatch({
        type: 'ADD_LIGHT',
        light: {
          ...DEFAULT_LIGHT,
          id: crypto.randomUUID(),
          shotId: activeShot.id,
          position: point,
        },
      });
      setPlacingLight(false);
    },
    [activeShot, dispatch],
  );

  const handleLightTransformEnd = useCallback(
    (id: string, shotId: string, pos: [number, number, number], rot: [number, number, number]) => {
      dispatch({ type: 'UPDATE_LIGHT', id, shotId, updates: { position: pos, rotation: rot } });
    },
    [dispatch],
  );

  const handleTransformEnd = useCallback(
    (
      assetId: string,
      shotId: string,
      pos: [number, number, number],
      rot: [number, number, number],
      scl: [number, number, number],
    ) => {
      const asset = state.assets.find((a) => a.id === assetId);
      let finalPos = pos;
      if (asset?.type === 'character') {
        // Use actual body params for this character's placement
        const placement = state.mannequinPlacements.find(
          (m) => m.assetId === assetId && m.shotId === shotId,
        );
        const bp = placement?.bodyParams ?? DEFAULT_BODY_PARAMS;
        const feetOffset = computeFeetOffset(bp.height, bp.build);
        const clamped = clampToSurface(pos, colliderRef, feetOffset);
        if (clamped) finalPos = clamped;
      }
      // Props: no clamping — user can freely position them
      dispatch({
        type: 'UPDATE_MANNEQUIN',
        assetId,
        shotId,
        position: finalPos,
        rotation: rot,
        scale: scl,
      });
    },
    [dispatch, state.assets, state.mannequinPlacements, colliderRef],
  );


  // Capture pipeline
  const handleCapture = useCallback(() => {
    if (!glRef.current || !viewfinderRef.current || !activeShot) return;

    // Flash effect
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 150);

    const canvas = glRef.current.domElement;
    const canvasRect = canvas.getBoundingClientRect();
    const vfRect = viewfinderRef.current.getBoundingClientRect();

    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const cropX = (vfRect.left - canvasRect.left) * scaleX;
    const cropY = (vfRect.top - canvasRect.top) * scaleY;
    const cropW = vfRect.width * scaleX;
    const cropH = vfRect.height * scaleY;

    // Hide light helper visuals before capture
    const hiddenHelpers: THREE.Object3D[] = [];
    if (overlaySceneRef.current) {
      overlaySceneRef.current.traverse((obj) => {
        if (obj.userData.isLightHelper && obj.visible) {
          obj.visible = false;
          hiddenHelpers.push(obj);
        }
      });
    }

    const fullDataUrl = canvas.toDataURL('image/png');

    // Restore light helpers
    hiddenHelpers.forEach((obj) => { obj.visible = true; });
    const img = new Image();
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = cropW;
      offscreen.height = cropH;
      const ctx = offscreen.getContext('2d')!;
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const croppedDataUrl = offscreen.toDataURL('image/png');

      const existingForType = state.captures.filter(
        (c) =>
          c.shotId === activeShot.id && c.frameType === state.activeFrameType,
      );

      dispatch({
        type: 'ADD_CAPTURE',
        capture: {
          id: crypto.randomUUID(),
          shotId: activeShot.id,
          frameType: state.activeFrameType,
          dataUrl: croppedDataUrl,
          isHero: existingForType.length === 0,
          capturedAt: new Date().toISOString(),
          rollAngle: state.rollAngle,
        },
      });
    };
    img.src = fullDataUrl;
  }, [activeShot, state.activeFrameType, state.captures, state.rollAngle, dispatch]);

  // Lens cycle
  const cycleLens = useCallback(() => {
    setSelectedLens((prev) => {
      const idx = LENS_ORDER.indexOf(prev);
      return LENS_ORDER[(idx + 1) % LENS_ORDER.length];
    });
  }, []);

  // Camera reset
  const handleResetCamera = useCallback(() => {
    cameraResetRef.current?.();
    dispatch({ type: 'SET_ROLL_ANGLE', angle: 0 });
  }, [dispatch]);

  // Close studio with confirmation
  const handleClose = useCallback(() => {
    if (
      state.captures.length > 0 &&
      !window.confirm("Go back to Setup? You'll lose your captures.")
    )
      return;
    onNavigate('setup');
  }, [state.captures.length, onNavigate]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handleCapture();
          break;
        case '1':
          dispatch({ type: 'SET_FRAME_TYPE', frameType: 'start' });
          break;
        case '2':
          dispatch({ type: 'SET_FRAME_TYPE', frameType: 'end' });
          break;
        case 'h':
        case 'H':
          dispatch({ type: 'SET_ROLL_ANGLE', angle: 0 });
          break;
        case 't':
        case 'T':
          if (selectedAssetId && activeShot) {
            const placement = activePlacements.find((m) => m.assetId === selectedAssetId);
            if (placement) {
              dispatch({
                type: 'UPDATE_MANNEQUIN',
                assetId: selectedAssetId,
                shotId: activeShot.id,
                position: placement.position,
                rotation: [0, 0, 0],
                scale: placement.scale,
              });
            }
          }
          break;
        case 'Escape':
          if (lightboxUrl) {
            setLightboxUrl(null);
          } else if (showControls) {
            setShowControls(false);
          } else if (showSettings) {
            setShowSettings(false);
          } else if (placingLight) {
            setPlacingLight(false);
          } else if (placingAssetId) {
            setPlacingAssetId(null);
          } else if (selectedLightId) {
            setSelectedLightId(null);
          } else {
            setSelectedAssetId(null);
          }
          break;
        case 'l':
        case 'L':
          dispatch({ type: 'SET_LIGHTING_MODE', enabled: !state.lightingModeEnabled });
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCapture, lightboxUrl, showControls, showSettings, placingLight, placingAssetId, selectedLightId, dispatch, selectedAssetId, activeShot, activePlacements, state.lightingModeEnabled]);

  // --- Render ---

  return (
    <div className="flex flex-col h-full">
      {/* ════════ Top bar ════════ */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/90 border-b border-zinc-700/50 backdrop-blur-sm">
        {/* Left — Lens controls (cosmetic) */}
        <div className="flex items-center gap-2">
          <button
            onClick={cycleLens}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900/80 border border-zinc-700/50 text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
            title="Cycle lens (cosmetic)"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            {selectedLens}
          </button>
          <div className="flex items-center gap-1 text-[10px] text-zinc-600 select-none">
            <span className="cursor-default">&minus;</span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-900/50 text-zinc-500 font-mono">
              100%
            </span>
            <span className="cursor-default">+</span>
          </div>
        </div>

        {/* Center — Title + placement indicator */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">Studio</span>
          {placingAssetId && (
            <span className="text-amber-400 text-xs animate-pulse">
              Click to place asset &middot; Esc to cancel
            </span>
          )}
          {placingLight && (
            <span className="text-amber-400 text-xs animate-pulse">
              Click to place light &middot; Esc to cancel
            </span>
          )}
        </div>

        {/* Right — Marble + Done + Close */}
        <div className="flex items-center gap-3">
          {state.worldMarbleUrl && (
            <a
              href={state.worldMarbleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium"
            >
              Open in Marble
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
          <button
            onClick={() => onNavigate('results')}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            Done &rarr; Results
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors text-lg"
            title="Close Studio"
          >
            &times;
          </button>
        </div>
      </div>

      {/* ════════ Main split: canvas | sidebar ════════ */}
      <div className="flex flex-1 min-h-0">
        {/* ──── 3D Canvas + overlays ──── */}
        <div className="flex-1 relative bg-black">
          <Canvas
            gl={{ antialias: false, preserveDrawingBuffer: true }}
            camera={{ position: [3, 2, 3], fov: 50 }}
            onCreated={({ gl }) => {
              glRef.current = gl;
            }}
            onPointerMissed={() => {
              if (!placingAssetId && !placingLight) {
                setSelectedAssetId(null);
                setSelectedLightId(null);
              }
            }}
          >
            <ambientLight intensity={state.sceneLighting.ambientIntensity} />
            <directionalLight position={[5, 5, 5]} intensity={state.sceneLighting.directionalIntensity} />

            {hasWorld ? (
              <MarbleWorld
                spzUrl={state.spzUrl!}
                colliderUrl={state.colliderUrl}
                onColliderLoaded={handleColliderLoaded}
                onSplatLoaded={handleSplatLoaded}
              />
            ) : (
              <>
                <TestCube />
                <gridHelper args={[10, 10, '#444444', '#222222']} />
              </>
            )}

            <MannequinOverlay occlude={state.mannequinOcclusion} overlaySceneRef={overlaySceneRef}>
              <ambientLight intensity={state.sceneLighting.ambientIntensity} />
              <directionalLight position={[5, 5, 5]} intensity={state.sceneLighting.directionalIntensity} />
              <MannequinScene
                assets={state.assets}
                placements={activePlacements}
                visibility={state.assetVisibility}
                selectedAssetId={selectedAssetId}
                onSelect={selectAsset}
                onTransformEnd={handleTransformEnd}
                colliderRef={colliderRef}
                placingAssetId={placingAssetId}
                onPlace={handlePlace}
                onCancelPlace={handleCancelPlace}
                orbitControlsRef={orbitControlsRef as React.RefObject<THREE.EventDispatcher | null>}
                occlude={state.mannequinOcclusion}
              />
              {state.lightingModeEnabled && (
                <LightScene
                  lights={activeLights}
                  selectedLightId={selectedLightId}
                  onSelect={selectLight}
                  onTransformEnd={handleLightTransformEnd}
                  orbitControlsRef={orbitControlsRef as React.RefObject<THREE.EventDispatcher | null>}
                />
              )}
              {placingLight && (
                <LightPlacementHelper
                  colliderRef={colliderRef}
                  onPlace={handleLightPlace}
                  onCancel={() => setPlacingLight(false)}
                />
              )}
            </MannequinOverlay>

            <SceneControls resetRef={cameraResetRef} controlsRef={orbitControlsRef} />
            <CameraKeyboardDriver controlsRef={orbitControlsRef} selectedAssetId={selectedAssetId} />
            <CameraRollDriver controlsRef={orbitControlsRef} rollAngle={state.rollAngle} />
          </Canvas>

          {/* SPZ loading indicator */}
          {hasWorld && !splatLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-zinc-400">
                  Loading world&hellip;
                </span>
              </div>
            </div>
          )}

          {/* World error state */}
          {state.worldStatus === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/70">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center">
                  <span className="text-red-400 text-xl">!</span>
                </div>
                <p className="text-sm text-zinc-300">Failed to load world</p>
                {state.worldError && (
                  <p className="text-xs text-zinc-500 max-w-xs">
                    {state.worldError}
                  </p>
                )}
                <button
                  onClick={() => onNavigate('setup')}
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                >
                  &larr; Back to Setup to retry
                </button>
              </div>
            </div>
          )}

          {/* Capture flash effect */}
          {captureFlash && (
            <div className="absolute inset-0 bg-white/15 pointer-events-none z-30" />
          )}

          {/* ──── Viewfinder overlay ──── */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              ref={viewfinderRef}
              className="border border-white/20 rounded-sm relative"
              style={viewfinderStyle}
            >
              {/* REC indicator — top left */}
              <div className="absolute top-2.5 left-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-mono text-red-500/80 tracking-wider">
                  REC
                </span>
              </div>

              {/* AF indicator — top right */}
              <div className="absolute top-2.5 right-3">
                <span className="text-[10px] font-mono text-green-500/60 tracking-wider">
                  AF
                </span>
              </div>

              {/* Rule-of-thirds grid */}
              {showGrid && (
                <>
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/[0.08]" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/[0.08]" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/[0.08]" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/[0.08]" />
                </>
              )}

              {/* Lens info badge — bottom left */}
              <div className="absolute bottom-2.5 left-3 flex items-center gap-3 text-[10px] font-mono text-white/40 tracking-wider">
                <span>{lensInfo.focal}</span>
                <span>{lensInfo.aperture}</span>
                <span>{state.aspectRatio}</span>
              </div>

              {/* Frame type indicator — bottom right */}
              <div className="absolute bottom-2.5 right-3">
                <span className="text-[10px] font-mono text-white/30">
                  {state.activeFrameType === 'start' ? 'START' : 'END'} F
                </span>
              </div>
            </div>
          </div>

          {/* Expand sidebar button (when collapsed) */}
          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-zinc-900/80 backdrop-blur-sm border border-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              title="Show sidebar"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}

          {/* ──── Bottom floating toolbar ──── */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-sm rounded-full px-4 py-2 border border-zinc-700/60 shadow-2xl">
            {/* Frame type toggle */}
            <div className="flex items-center bg-zinc-800 rounded-full overflow-hidden text-xs">
              <button
                onClick={() =>
                  dispatch({ type: 'SET_FRAME_TYPE', frameType: 'start' })
                }
                className={`px-3 py-1.5 transition-colors ${
                  state.activeFrameType === 'start'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="Start Frame (1)"
              >
                Start
              </button>
              <button
                onClick={() =>
                  dispatch({ type: 'SET_FRAME_TYPE', frameType: 'end' })
                }
                className={`px-3 py-1.5 transition-colors ${
                  state.activeFrameType === 'end'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="End Frame (2)"
              >
                End
              </button>
            </div>

            <div className="w-px h-5 bg-zinc-700/50" />

            {/* Capture button */}
            <button
              onClick={handleCapture}
              disabled={!activeShot}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors"
              title="Capture (Space)"
            >
              <span className="w-3 h-3 rounded-full bg-white/90 inline-block" />
              Capture
            </button>

            <div className="w-px h-5 bg-zinc-700/50" />

            {/* Reset Camera */}
            <button
              onClick={handleResetCamera}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Reset Camera"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>

            <div className="w-px h-5 bg-zinc-700/50" />

            {/* Lighting Toggle */}
            <button
              onClick={() => dispatch({ type: 'SET_LIGHTING_MODE', enabled: !state.lightingModeEnabled })}
              className={`p-1.5 rounded-full transition-colors ${
                state.lightingModeEnabled
                  ? 'bg-amber-900/30 text-amber-400'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Custom Lighting (L)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
              </svg>
            </button>

            {/* Settings */}
            <div className="relative">
              <button
                onClick={() => setShowSettings((s) => !s)}
                className={`p-1.5 rounded-full transition-colors ${
                  showSettings
                    ? 'text-white bg-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                title="Settings"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              {/* Settings panel */}
              {showSettings && (
                <div
                  className="absolute bottom-full mb-3 right-0 bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-2xl w-60"
                  style={{ zIndex: 9999 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Aspect Ratio */}
                  <div className="mb-4">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">
                      Aspect Ratio
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).map(
                        (r) => (
                          <button
                            key={r}
                            onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', aspectRatio: r })}
                            className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors ${
                              state.aspectRatio === r
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                            }`}
                          >
                            {r}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Grid toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-zinc-400">Grid Lines</span>
                    <button
                      onClick={() => setShowGrid((g) => !g)}
                      className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${
                        showGrid
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {showGrid ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* World Occlusion toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-zinc-400">World Occlusion</span>
                    <button
                      onClick={() => dispatch({ type: 'SET_MANNEQUIN_OCCLUSION', enabled: !state.mannequinOcclusion })}
                      className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${
                        state.mannequinOcclusion
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {state.mannequinOcclusion ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Keyboard shortcuts reference */}
                  <div className="pt-3 border-t border-zinc-700/50">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">
                      Shortcuts
                    </label>
                    <div className="space-y-1 text-[10px] text-zinc-500">
                      <div className="flex justify-between">
                        <span>Camera move</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          W A S D
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Camera down / up</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          Q / E
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Reset roll</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          H
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Capture</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          Space
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Start / End Frame</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          1 / 2
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Translate</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          G
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Rotate</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          R
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Scale</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          E
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Reset rotation</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          T
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Lighting toggle</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          L
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Cancel / Close</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          Esc
                        </kbd>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Collapse sidebar toggle */}
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {sidebarCollapsed ? (
                  <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                ) : (
                  <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* ──── Sidebar ──── */}
        <div
          className={`flex-shrink-0 bg-zinc-900 border-l border-zinc-700 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
            sidebarCollapsed
              ? 'w-0 border-l-0 opacity-0'
              : 'w-[280px] opacity-100'
          }`}
        >
          {/* Section 1 — Shot list */}
          <div className="p-4 border-b border-zinc-700/50">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Shots
            </h3>
            {state.shots.length === 0 ? (
              <p className="text-xs text-zinc-600">
                No shots defined. Add shots in Setup.
              </p>
            ) : (
              <div className="space-y-1.5">
                {state.shots.map((shot, i) => (
                  <button
                    key={shot.id}
                    onClick={() =>
                      dispatch({ type: 'SET_ACTIVE_SHOT', index: i })
                    }
                    className={`w-full text-left p-2 rounded text-xs transition-colors ${
                      i === state.activeShotIndex
                        ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                        : 'bg-zinc-800/50 border border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span className="font-medium">
                      {shot.name || `Shot ${i + 1}`}
                    </span>
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-zinc-700/50 text-zinc-500">
                      {shot.cameraType}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section 2 — Active shot info */}
          {activeShot && (
            <div className="p-4 border-b border-zinc-700/50">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Active Shot
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {activeShot.name || 'Untitled'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    {activeShot.cameraType}
                  </span>
                </div>
                {activeShot.action && (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {activeShot.action}
                  </p>
                )}
                {(activeShot.cameraHeight ||
                  activeShot.cameraDistance ||
                  activeShot.cameraMovement ||
                  (activeShot.duration && activeShot.duration !== 8)) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-600">
                    {activeShot.duration && activeShot.duration !== 8 && (
                      <span>{activeShot.duration}s</span>
                    )}
                    {activeShot.cameraHeight && (
                      <span>
                        {activeShot.cameraHeight.replace(/_/g, ' ')}
                      </span>
                    )}
                    {activeShot.cameraDistance && (
                      <span>{activeShot.cameraDistance}</span>
                    )}
                    {activeShot.cameraMovement && (
                      <span>{activeShot.cameraMovement}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 3 — Asset Visibility & Mannequin Controls */}
          {activeShot && state.assets.length > 0 && (
            <div className="p-4 border-b border-zinc-700/50">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Assets
              </h3>
              <div className="space-y-1.5">
                {state.assets.map((asset) => {
                  const isVisible = state.assetVisibility[asset.id] !== false;
                  const hasPlacement = activePlacements.some(
                    (m) => m.assetId === asset.id,
                  );
                  const isPlacing = placingAssetId === asset.id;
                  const isSelected = selectedAssetId === asset.id;

                  return (
                    <div
                      key={asset.id}
                      className={`flex items-center gap-2 p-1.5 rounded text-xs ${
                        isSelected
                          ? 'bg-zinc-700/50 border border-zinc-600'
                          : 'border border-transparent'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: asset.color }}
                      />
                      <span
                        className={`flex-1 truncate ${
                          isVisible ? 'text-zinc-300' : 'text-zinc-600'
                        }`}
                      >
                        {asset.name || 'Unnamed'}
                      </span>
                      <button
                        onClick={() =>
                          dispatch({
                            type: 'TOGGLE_ASSET_VISIBILITY',
                            assetId: asset.id,
                          })
                        }
                        className={`text-[11px] w-5 h-5 flex items-center justify-center rounded transition-colors ${
                          isVisible
                            ? 'text-zinc-300 hover:text-white'
                            : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                        title={isVisible ? 'Hide' : 'Show'}
                      >
                        {isVisible ? '\u{1F441}' : '\u2013'}
                      </button>
                      {hasPlacement ? (
                        <button
                          onClick={() => {
                            dispatch({
                              type: 'REMOVE_MANNEQUIN',
                              assetId: asset.id,
                              shotId: activeShot.id,
                            });
                            if (selectedAssetId === asset.id)
                              setSelectedAssetId(null);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors"
                          title="Remove from scene"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setPlacingAssetId(isPlacing ? null : asset.id)
                          }
                          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                            isPlacing
                              ? 'bg-amber-600/30 text-amber-300 border border-amber-500/30'
                              : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
                          }`}
                          title="Place in scene"
                        >
                          {isPlacing ? 'Placing...' : 'Place'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section — Scene Lighting */}
          {activeShot && (
            <div className="p-4 border-b border-zinc-700/50">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Scene Lighting
              </h3>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] text-zinc-400">Ambient</label>
                    <span className="text-[10px] font-mono text-zinc-500">{Math.round(state.sceneLighting.ambientIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={state.sceneLighting.ambientIntensity}
                    onChange={(e) => dispatch({ type: 'SET_SCENE_LIGHTING', lighting: { ambientIntensity: parseFloat(e.target.value) } })}
                    className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] text-zinc-400">Directional</label>
                    <span className="text-[10px] font-mono text-zinc-500">{Math.round(state.sceneLighting.directionalIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={state.sceneLighting.directionalIntensity}
                    onChange={(e) => dispatch({ type: 'SET_SCENE_LIGHTING', lighting: { directionalIntensity: parseFloat(e.target.value) } })}
                    className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              {/* Custom lights list + add button */}
              <div className="mt-3 pt-3 border-t border-zinc-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-400">Custom Lights</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => dispatch({ type: 'SET_LIGHTING_MODE', enabled: !state.lightingModeEnabled })}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                        state.lightingModeEnabled
                          ? 'bg-amber-600/30 text-amber-300'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                      title={state.lightingModeEnabled ? 'Custom lights visible' : 'Custom lights hidden'}
                    >
                      {state.lightingModeEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => { setPlacingLight(!placingLight); setPlacingAssetId(null); }}
                  className={`w-full text-[10px] px-2 py-1.5 rounded transition-colors mb-2 ${
                    placingLight
                      ? 'bg-amber-600/30 text-amber-300 border border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  {placingLight ? 'Placing light...' : '+ Add Light'}
                </button>

                {activeLights.length > 0 && (
                  <div className="space-y-1">
                    {activeLights.map((light, i) => (
                      <div
                        key={light.id}
                        className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer ${
                          selectedLightId === light.id
                            ? 'bg-zinc-700/50 border border-zinc-600'
                            : 'border border-transparent hover:bg-zinc-800/50'
                        }`}
                        onClick={() => selectLight(light.id)}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: kelvinToColor(light.kelvin) }}
                        />
                        <span className="flex-1 text-zinc-300 truncate">
                          {light.lightType === 'spot' ? 'Spot' : 'Point'} {i + 1}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">{light.kelvin}K</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'REMOVE_LIGHT', id: light.id, shotId: light.shotId });
                            if (selectedLightId === light.id) setSelectedLightId(null);
                          }}
                          className="text-zinc-600 hover:text-red-400 transition-colors text-[10px]"
                          title="Remove light"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 3b — Mannequin Controls (when a character is selected) */}
          {activeShot && selectedAssetId && (() => {
            const selectedAsset = state.assets.find((a) => a.id === selectedAssetId);
            if (!selectedAsset) return null;
            if (selectedAsset.type !== 'character') return null;
            const placement = activePlacements.find((m) => m.assetId === selectedAssetId);
            if (!placement) return null;
            const bp = placement.bodyParams ?? DEFAULT_BODY_PARAMS;
            const pose = placement.pose ?? DEFAULT_POSE;

            const poseSlider = (
              label: string,
              value: number,
              min: number,
              max: number,
              onChange: (v: number) => void,
            ) => (
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[10px] text-zinc-500">{label}</label>
                  <span className="text-[10px] font-mono text-zinc-600">{(value * 180 / Math.PI).toFixed(0)}&deg;</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step="0.01"
                  value={value}
                  onChange={(e) => onChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            );

            const updatePoseField = (field: string, value: number | [number, number, number]) => {
              dispatch({
                type: 'UPDATE_MANNEQUIN_POSE',
                assetId: selectedAssetId,
                shotId: activeShot.id,
                pose: { ...pose, [field]: value },
              });
            };

            const updateShoulderAxis = (side: 'left' | 'right', axis: 0 | 1 | 2, value: number) => {
              const field = side === 'left' ? 'leftShoulder' : 'rightShoulder';
              const current = side === 'left' ? [...pose.leftShoulder] as [number, number, number] : [...pose.rightShoulder] as [number, number, number];
              current[axis] = value;
              updatePoseField(field, current);
            };

            const updateHipAxis = (side: 'left' | 'right', axis: 0 | 1 | 2, value: number) => {
              const field = side === 'left' ? 'leftHip' : 'rightHip';
              const current = side === 'left' ? [...pose.leftHip] as [number, number, number] : [...pose.rightHip] as [number, number, number];
              current[axis] = value;
              updatePoseField(field, current);
            };

            return (
              <div className="p-4 border-b border-zinc-700/50 overflow-y-auto max-h-[50vh]">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Mannequin
                </h3>

                {/* Build */}
                <div className="space-y-2 mb-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-400">Height</label>
                      <span className="text-[10px] font-mono text-zinc-500">{bp.height.toFixed(2)}m</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.01"
                      value={bp.height}
                      onChange={(e) => {
                        const height = parseFloat(e.target.value);
                        dispatch({
                          type: 'UPDATE_MANNEQUIN_BODY',
                          assetId: selectedAssetId,
                          shotId: activeShot.id,
                          bodyParams: { height },
                        });
                        const feetOffset = computeFeetOffset(height, bp.build);
                        const clamped = clampToSurface(placement.position, colliderRef, feetOffset);
                        if (clamped) {
                          dispatch({
                            type: 'UPDATE_MANNEQUIN',
                            assetId: selectedAssetId,
                            shotId: activeShot.id,
                            position: clamped,
                          });
                        }
                      }}
                      className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-400">Build</label>
                      <span className="text-[10px] font-mono text-zinc-500">{bp.build.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4.0"
                      step="0.01"
                      value={bp.build}
                      onChange={(e) => {
                        const build = parseFloat(e.target.value);
                        dispatch({
                          type: 'UPDATE_MANNEQUIN_BODY',
                          assetId: selectedAssetId,
                          shotId: activeShot.id,
                          bodyParams: { build },
                        });
                      }}
                      className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>

                {/* Rotation — divider */}
                <div className="border-t border-zinc-700/50 pt-3 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Rotation</span>
                    <button
                      onClick={() => {
                        const placement = activePlacements.find((m) => m.assetId === selectedAssetId);
                        if (!placement) return;
                        dispatch({
                          type: 'UPDATE_MANNEQUIN',
                          assetId: selectedAssetId,
                          shotId: activeShot.id,
                          position: placement.position,
                          rotation: [0, 0, 0],
                          scale: placement.scale,
                        });
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Pose — divider */}
                <div className="border-t border-zinc-700/50 pt-3 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Pose</span>
                    <button
                      onClick={() => {
                        dispatch({
                          type: 'UPDATE_MANNEQUIN_POSE',
                          assetId: selectedAssetId,
                          shotId: activeShot.id,
                          pose: DEFAULT_POSE,
                        });
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Arms */}
                <div className="space-y-1.5 mb-3">
                  <span className="text-[10px] font-medium text-zinc-400 block">Left Arm</span>
                  {poseSlider('Raise / Lower', pose.leftShoulder[0], -Math.PI, Math.PI, (v) => updateShoulderAxis('left', 0, v))}
                  {poseSlider('Forward / Back', pose.leftShoulder[2], -Math.PI, Math.PI, (v) => updateShoulderAxis('left', 2, v))}
                  {poseSlider('Elbow Bend', pose.leftElbow, 0, 2.6, (v) => updatePoseField('leftElbow', v))}
                </div>

                <div className="space-y-1.5 mb-3">
                  <span className="text-[10px] font-medium text-zinc-400 block">Right Arm</span>
                  {poseSlider('Raise / Lower', pose.rightShoulder[0], -Math.PI, Math.PI, (v) => updateShoulderAxis('right', 0, v))}
                  {poseSlider('Forward / Back', pose.rightShoulder[2], -Math.PI, Math.PI, (v) => updateShoulderAxis('right', 2, v))}
                  {poseSlider('Elbow Bend', pose.rightElbow, 0, 2.6, (v) => updatePoseField('rightElbow', v))}
                </div>

                {/* Legs */}
                <div className="space-y-1.5 mb-3">
                  <span className="text-[10px] font-medium text-zinc-400 block">Left Leg</span>
                  {poseSlider('Raise / Lower', pose.leftHip[0], -Math.PI / 2, Math.PI / 2, (v) => updateHipAxis('left', 0, v))}
                  {poseSlider('Spread', pose.leftHip[2], -Math.PI / 4, Math.PI / 4, (v) => updateHipAxis('left', 2, v))}
                  {poseSlider('Knee Bend', pose.leftKnee, 0, 2.6, (v) => updatePoseField('leftKnee', v))}
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-medium text-zinc-400 block">Right Leg</span>
                  {poseSlider('Raise / Lower', pose.rightHip[0], -Math.PI / 2, Math.PI / 2, (v) => updateHipAxis('right', 0, v))}
                  {poseSlider('Spread', pose.rightHip[2], -Math.PI / 4, Math.PI / 4, (v) => updateHipAxis('right', 2, v))}
                  {poseSlider('Knee Bend', pose.rightKnee, 0, 2.6, (v) => updatePoseField('rightKnee', v))}
                </div>
              </div>
            );
          })()}

          {/* Section 3c — Prop Controls (when a prop is selected) */}
          {activeShot && selectedAssetId && (() => {
            const selectedAsset = state.assets.find((a) => a.id === selectedAssetId);
            if (!selectedAsset || selectedAsset.type !== 'prop') return null;
            const placement = activePlacements.find((m) => m.assetId === selectedAssetId);
            if (!placement) return null;
            const scaleX = placement.scale[0];
            const scaleY = placement.scale[1];

            return (
              <div className="p-4 border-b border-zinc-700/50">
                <div className="mb-3">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Shape</h3>
                  <select
                    value={selectedAsset.shape ?? 'box'}
                    onChange={(e) => {
                      const newShape = e.target.value as PropShape;
                      dispatch({ type: 'UPDATE_ASSET', id: selectedAsset.id, field: 'shape', value: newShape });
                      dispatch({
                        type: 'UPDATE_MANNEQUIN',
                        assetId: selectedAssetId,
                        shotId: activeShot.id,
                        scale: PROP_SHAPE_DEFAULTS[newShape],
                      });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
                  >
                    {PROP_SHAPES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Prop Scale
                </h3>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-400">Width</label>
                      <span className="text-[10px] font-mono text-zinc-500">{scaleX.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.01"
                      value={scaleX}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        dispatch({
                          type: 'UPDATE_MANNEQUIN',
                          assetId: selectedAssetId,
                          shotId: activeShot.id,
                          scale: [v, placement.scale[1], v],
                        });
                      }}
                      className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-400">Height</label>
                      <span className="text-[10px] font-mono text-zinc-500">{scaleY.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.01"
                      value={scaleY}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        dispatch({
                          type: 'UPDATE_MANNEQUIN',
                          assetId: selectedAssetId,
                          shotId: activeShot.id,
                          scale: [placement.scale[0], v, placement.scale[2]],
                        });
                      }}
                      className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Section — Light Controls (when a light is selected) */}
          {activeShot && selectedLight && (
            <div className="p-4 border-b border-zinc-700/50">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Light Controls
              </h3>
              <div className="space-y-2">
                {/* Type toggle */}
                <div>
                  <label className="text-[10px] text-zinc-400 mb-1 block">Type</label>
                  <div className="flex items-center bg-zinc-800 rounded-full overflow-hidden text-xs">
                    {(['point', 'spot'] as LightType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { lightType: t } })}
                        className={`flex-1 px-3 py-1.5 transition-colors capitalize ${
                          selectedLight.lightType === t
                            ? 'bg-blue-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kelvin */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] text-zinc-400">Temperature</label>
                    <span className="text-[10px] font-mono text-zinc-500">{selectedLight.kelvin}K</span>
                  </div>
                  <input
                    type="range"
                    min="2000"
                    max="10000"
                    step="100"
                    value={selectedLight.kelvin}
                    onChange={(e) => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { kelvin: parseInt(e.target.value) } })}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer accent-blue-500"
                    style={{
                      background: 'linear-gradient(to right, #ff8a00, #ffd4a0, #fff5eb, #e8eeff, #a0c4ff)',
                    }}
                  />
                </div>

                {/* Tint color */}
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-zinc-400">Tint Color</label>
                  <input
                    type="color"
                    value={selectedLight.tintColor}
                    onChange={(e) => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { tintColor: e.target.value } })}
                    className="w-6 h-6 rounded cursor-pointer border border-zinc-700 bg-transparent"
                  />
                </div>

                {/* Intensity */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] text-zinc-400">Intensity</label>
                    <span className="text-[10px] font-mono text-zinc-500">{selectedLight.intensity.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={selectedLight.intensity}
                    onChange={(e) => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { intensity: parseFloat(e.target.value) } })}
                    className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Distance */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] text-zinc-400">Distance</label>
                    <span className="text-[10px] font-mono text-zinc-500">{selectedLight.distance.toFixed(0)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={selectedLight.distance}
                    onChange={(e) => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { distance: parseInt(e.target.value) } })}
                    className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Spot-only controls */}
                {selectedLight.lightType === 'spot' && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-zinc-400">Cone Angle</label>
                        <span className="text-[10px] font-mono text-zinc-500">{Math.round(selectedLight.coneAngle * 180 / Math.PI)}&deg;</span>
                      </div>
                      <input
                        type="range"
                        min={5 * Math.PI / 180}
                        max={90 * Math.PI / 180}
                        step="0.01"
                        value={selectedLight.coneAngle}
                        onChange={(e) => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { coneAngle: parseFloat(e.target.value) } })}
                        className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-zinc-400">Penumbra</label>
                        <span className="text-[10px] font-mono text-zinc-500">{selectedLight.penumbra.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedLight.penumbra}
                        onChange={(e) => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { penumbra: parseFloat(e.target.value) } })}
                        className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => dispatch({ type: 'UPDATE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId, updates: { rotation: [-Math.PI / 2, 0, 0] } })}
                      className="w-full text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Reset Aim
                    </button>
                  </>
                )}

                {/* Delete */}
                <button
                  onClick={() => {
                    dispatch({ type: 'REMOVE_LIGHT', id: selectedLight.id, shotId: selectedLight.shotId });
                    setSelectedLightId(null);
                  }}
                  className="w-full text-[10px] px-2 py-1.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors mt-1"
                >
                  Delete Light
                </button>
              </div>
            </div>
          )}

          {/* Section 4 — Aspect Ratio */}
          <div className="p-4 border-b border-zinc-700/50">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Aspect Ratio
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).map((r) => (
                <button
                  key={r}
                  onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', aspectRatio: r })}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-mono transition-colors ${
                    state.aspectRatio === r
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  <div
                    className={`rounded-sm flex-shrink-0 ${
                      state.aspectRatio === r
                        ? 'bg-white/30'
                        : 'bg-zinc-600/40'
                    }`}
                    style={{
                      aspectRatio: `${ASPECT_RATIOS[r]}`,
                      ...(ASPECT_RATIOS[r] >= 1
                        ? { width: '18px' }
                        : { height: '18px' }),
                    }}
                  />
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Section 4b — Camera Roll */}
          <div className="p-4 border-b border-zinc-700/50">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Camera Roll
            </h3>
            <input
              type="range"
              min={-90}
              max={90}
              step={1}
              value={state.rollAngle}
              onChange={(e) =>
                dispatch({ type: 'SET_ROLL_ANGLE', angle: parseInt(e.target.value) })
              }
              className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] font-mono text-zinc-500">
                {state.rollAngle}&deg;
              </span>
              {state.rollAngle !== 0 && (
                <button
                  onClick={() => dispatch({ type: 'SET_ROLL_ANGLE', angle: 0 })}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
                  title="Reset camera roll to 0°"
                >
                  Return to Horizon
                </button>
              )}
            </div>
          </div>

          {/* Section 5 — Capture tray */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Captures
            </h3>

            {!activeShot ? (
              <p className="text-xs text-zinc-600">
                Select a shot to capture.
              </p>
            ) : shotCaptures.length === 0 ? (
              <p className="text-xs text-zinc-600">
                No captures yet. Position your camera and hit Capture.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Start frames */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-medium text-zinc-400 uppercase">
                      Start Frames
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
                      {startCaptures.length}
                    </span>
                  </div>
                  {startCaptures.length === 0 ? (
                    <p className="text-[10px] text-zinc-600 italic">None</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {startCaptures.map((cap) => (
                        <button
                          key={cap.id}
                          onClick={() => setLightboxUrl(cap.dataUrl)}
                          className={`relative w-[60px] h-[34px] rounded overflow-hidden border transition-colors ${
                            cap.isHero
                              ? 'border-amber-500/60'
                              : 'border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          <img
                            src={cap.dataUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          {cap.isHero && (
                            <span className="absolute top-0 right-0 text-[8px] text-amber-400 leading-none p-0.5">
                              &#9733;
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* End frames */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-medium text-zinc-400 uppercase">
                      End Frames
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
                      {endCaptures.length}
                    </span>
                  </div>
                  {endCaptures.length === 0 ? (
                    <p className="text-[10px] text-zinc-600 italic">None</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {endCaptures.map((cap) => (
                        <button
                          key={cap.id}
                          onClick={() => setLightboxUrl(cap.dataUrl)}
                          className={`relative w-[60px] h-[34px] rounded overflow-hidden border transition-colors ${
                            cap.isHero
                              ? 'border-amber-500/60'
                              : 'border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          <img
                            src={cap.dataUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          {cap.isHero && (
                            <span className="absolute top-0 right-0 text-[8px] text-amber-400 leading-none p-0.5">
                              &#9733;
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════ Controls help ════════ */}
      <button
        onClick={() => setShowControls((c) => !c)}
        className="fixed bottom-5 right-5 z-40 w-9 h-9 rounded-full bg-zinc-800/90 backdrop-blur-sm border border-zinc-700/60 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors shadow-lg"
        title="Show controls"
      >
        <span className="text-sm font-bold select-none">?</span>
      </button>

      {showControls && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setShowControls(false)}
          role="dialog"
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Studio Controls</h2>
              <button
                onClick={() => setShowControls(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors text-sm"
              >
                &times;
              </button>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="mb-5">
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Keyboard
              </h3>
              <div className="space-y-1.5 text-xs">
                {[
                  ['W / A / S / D', 'Move camera forward / left / back / right'],
                  ['Q', 'Move camera down'],
                  ['E', 'Move camera up (or Scale when asset selected)'],
                  ['H', 'Return to horizon (reset roll)'],
                  ['Space', 'Capture screenshot'],
                  ['1', 'Switch to Start Frame'],
                  ['2', 'Switch to End Frame'],
                  ['G', 'Move selected asset'],
                  ['R', 'Rotate selected asset'],
                  ['L', 'Toggle custom lighting'],
                  ['Esc', 'Cancel / Close / Deselect'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-zinc-400">{desc}</span>
                    <kbd className="text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded text-[11px] font-mono min-w-[2rem] text-center">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>

            {/* Mouse Controls */}
            <div className="mb-5">
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Mouse
              </h3>
              <div className="space-y-1.5 text-xs">
                {[
                  ['Left Drag', 'Orbit camera'],
                  ['Right Drag', 'Pan camera'],
                  ['Scroll', 'Zoom in / out'],
                  ['Click asset', 'Select asset'],
                  ['Click empty', 'Deselect asset'],
                  ['Drag gizmo', 'Transform selected asset'],
                ].map(([action, desc]) => (
                  <div key={action} className="flex items-center justify-between">
                    <span className="text-zinc-400">{desc}</span>
                    <span className="text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded text-[11px] font-mono">
                      {action}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* UI Controls */}
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Toolbar & Sidebar
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-400">
                <li><span className="text-zinc-300">Start / End</span> &mdash; toggle frame type for capture</li>
                <li><span className="text-zinc-300">Capture</span> &mdash; screenshot the viewfinder</li>
                <li><span className="text-zinc-300">Reset Camera</span> &mdash; return to default view</li>
                <li><span className="text-zinc-300">Settings gear</span> &mdash; aspect ratio & grid toggle</li>
                <li><span className="text-zinc-300">Sidebar shots</span> &mdash; switch active shot</li>
                <li><span className="text-zinc-300">Place / Remove</span> &mdash; add or remove assets in scene</li>
                <li><span className="text-zinc-300">Eye icon</span> &mdash; show / hide individual assets</li>
                <li><span className="text-zinc-300">Capture thumbnails</span> &mdash; click to preview</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Lightbox modal ════════ */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          tabIndex={0}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxUrl}
              alt="Capture"
              className="max-w-full max-h-[90vh] object-contain rounded"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-300 hover:text-white flex items-center justify-center text-sm"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

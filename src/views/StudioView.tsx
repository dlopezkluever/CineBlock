import { useRef, useCallback, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCineBlockState, useCineBlockDispatch } from '../store';
import MarbleWorld from '../components/MarbleWorld';
import { MannequinScene, MannequinOverlay } from '../components/Mannequins';
import type * as THREE from 'three';

// --- Constants ---

type AspectRatioKey = '16:9' | '2.39:1' | '4:3' | '9:16';
const ASPECT_RATIOS: Record<AspectRatioKey, number> = {
  '16:9': 16 / 9,
  '2.39:1': 2.39,
  '4:3': 4 / 3,
  '9:16': 9 / 16,
};

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    resetRef.current = () => {
      camera.position.set(3, 2, 3);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    };
    return () => {
      resetRef.current = null;
    };
  }, [camera, resetRef, controlsRef]);

  return <OrbitControls ref={controlsRef} makeDefault />;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbitControlsRef = useRef<any>(null);
  const prevShotIndexRef = useRef(state.activeShotIndex);

  // Existing UI state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [placingAssetId, setPlacingAssetId] = useState<string | null>(null);

  // Phase 6 UI state
  const [aspectRatio, setAspectRatio] = useState<AspectRatioKey>('16:9');
  const [showGrid, setShowGrid] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedLens, setSelectedLens] = useState<LensKey>('35mm');
  const [showSettings, setShowSettings] = useState(false);
  const [splatLoaded, setSplatLoaded] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);

  // Derived values
  const aspectRatioValue = ASPECT_RATIOS[aspectRatio];
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

  // Mannequin placement
  const handlePlace = useCallback(
    (point: [number, number, number]) => {
      if (!placingAssetId || !activeShot) return;
      dispatch({
        type: 'ADD_MANNEQUIN',
        placement: {
          assetId: placingAssetId,
          shotId: activeShot.id,
          position: point,
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      });
      setPlacingAssetId(null);
    },
    [placingAssetId, activeShot, dispatch],
  );

  const handleCancelPlace = useCallback(() => {
    setPlacingAssetId(null);
  }, []);

  const handleTransformEnd = useCallback(
    (
      assetId: string,
      shotId: string,
      pos: [number, number, number],
      rot: [number, number, number],
      scl: [number, number, number],
    ) => {
      dispatch({
        type: 'UPDATE_MANNEQUIN',
        assetId,
        shotId,
        position: pos,
        rotation: rot,
        scale: scl,
      });
    },
    [dispatch],
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

    const fullDataUrl = canvas.toDataURL('image/png');
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
        },
      });
    };
    img.src = fullDataUrl;
  }, [activeShot, state.activeFrameType, state.captures, dispatch]);

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
  }, []);

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
        case 'Escape':
          if (lightboxUrl) {
            setLightboxUrl(null);
          } else if (showSettings) {
            setShowSettings(false);
          } else if (placingAssetId) {
            setPlacingAssetId(null);
          } else {
            setSelectedAssetId(null);
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCapture, lightboxUrl, showSettings, placingAssetId, dispatch]);

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
              Click to place &middot; Esc to cancel
            </span>
          )}
        </div>

        {/* Right — Done + Close */}
        <div className="flex items-center gap-3">
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
              if (!placingAssetId) setSelectedAssetId(null);
            }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

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

            <MannequinOverlay>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <MannequinScene
                assets={state.assets}
                placements={activePlacements}
                visibility={state.assetVisibility}
                selectedAssetId={selectedAssetId}
                onSelect={setSelectedAssetId}
                onTransformEnd={handleTransformEnd}
                colliderRef={colliderRef}
                placingAssetId={placingAssetId}
                onPlace={handlePlace}
                onCancelPlace={handleCancelPlace}
                orbitControlsRef={orbitControlsRef}
              />
            </MannequinOverlay>

            <SceneControls resetRef={cameraResetRef} controlsRef={orbitControlsRef} />
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
                <span>{aspectRatio}</span>
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
                            onClick={() => setAspectRatio(r)}
                            className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors ${
                              aspectRatio === r
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

                  {/* Keyboard shortcuts reference */}
                  <div className="pt-3 border-t border-zinc-700/50">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">
                      Shortcuts
                    </label>
                    <div className="space-y-1 text-[10px] text-zinc-500">
                      <div className="flex justify-between">
                        <span>Capture</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          Space
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>Start Frame</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          1
                        </kbd>
                      </div>
                      <div className="flex justify-between">
                        <span>End Frame</span>
                        <kbd className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                          2
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
                          S
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

          {/* Section 4 — Capture tray */}
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

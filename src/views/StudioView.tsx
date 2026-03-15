import { useRef, useCallback, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCineBlockState, useCineBlockDispatch } from '../store';
import MarbleWorld from '../components/MarbleWorld';
import { MannequinScene } from '../components/Mannequins';
import type * as THREE from 'three';

function TestCube() {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#3B82F6" />
    </mesh>
  );
}

export default function StudioView({
  onNavigate,
}: {
  onNavigate: (view: 'setup' | 'results') => void;
}) {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();
  const colliderRef = useRef<THREE.Object3D | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [placingAssetId, setPlacingAssetId] = useState<string | null>(null);
  const prevShotIndexRef = useRef(state.activeShotIndex);

  const handleColliderLoaded = useCallback((mesh: THREE.Object3D) => {
    colliderRef.current = mesh;
  }, []);

  const hasWorld = state.worldStatus === 'ready' && state.spzUrl;
  const activeShot = state.shots[state.activeShotIndex] ?? null;
  const shotCaptures = activeShot
    ? state.captures.filter((c) => c.shotId === activeShot.id)
    : [];
  const startCaptures = shotCaptures.filter((c) => c.frameType === 'start');
  const endCaptures = shotCaptures.filter((c) => c.frameType === 'end');

  // Mannequin placements for the active shot
  const activePlacements = activeShot
    ? state.mannequinPlacements.filter((m) => m.shotId === activeShot.id)
    : [];

  // Reset visibility when switching shots — match the shot's assetIds
  useEffect(() => {
    if (state.activeShotIndex !== prevShotIndexRef.current) {
      prevShotIndexRef.current = state.activeShotIndex;
      setSelectedAssetId(null);
      setPlacingAssetId(null);
      if (activeShot) {
        const visibility: Record<string, boolean> = {};
        state.assets.forEach((a) => {
          visibility[a.id] = activeShot.assetIds.includes(a.id);
        });
        dispatch({ type: 'SET_ASSET_VISIBILITY', visibility });
      }
    }
  }, [state.activeShotIndex, activeShot, state.assets, dispatch]);

  // Handle mannequin placement
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

  const handleCapture = useCallback(() => {
    if (!glRef.current || !viewfinderRef.current || !activeShot) return;

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

  return (
    <div className="flex flex-col h-full">
      {/* ── Top toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
        <button
          onClick={() => {
            if (
              state.captures.length > 0 &&
              !window.confirm(
                'Go back to Setup? You\'ll lose your captures.',
              )
            )
              return;
            onNavigate('setup');
          }}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          &larr; Back to Setup
        </button>
        <span className="text-sm font-medium text-zinc-300">
          Studio
          {placingAssetId && (
            <span className="ml-2 text-amber-400 text-xs">
              Click to place &middot; Esc to cancel
            </span>
          )}
        </span>
        <button
          onClick={() => onNavigate('results')}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Done &rarr; Results
        </button>
      </div>

      {/* ── Main split: canvas | sidebar ── */}
      <div className="flex flex-1 min-h-0">
        {/* ─── 3D Canvas + overlays ─── */}
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
              />
            ) : (
              <>
                <TestCube />
                <gridHelper args={[10, 10, '#444444', '#222222']} />
              </>
            )}

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
            />

            <OrbitControls makeDefault />
          </Canvas>

          {/* Viewfinder overlay — 16:9, centred, dark mask outside */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              ref={viewfinderRef}
              className="h-[80%] max-w-[92%] aspect-video border border-white/20 rounded-sm"
              style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)' }}
            />
          </div>

          {/* Capture toolbar — floating pill */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-zinc-900/90 backdrop-blur-sm rounded-full px-5 py-2.5 border border-zinc-700/60">
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
              >
                End
              </button>
            </div>

            {/* Capture button */}
            <button
              onClick={handleCapture}
              disabled={!activeShot}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors"
            >
              <span className="w-3 h-3 rounded-full bg-white/90 inline-block" />
              Capture
            </button>
          </div>
        </div>

        {/* ─── Sidebar (280px fixed) ─── */}
        <div className="w-[280px] flex-shrink-0 bg-zinc-900 border-l border-zinc-700 flex flex-col overflow-hidden">
          {/* Section 1 — Shot list */}
          <div className="p-4 border-b border-zinc-700/50">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Shots
            </h3>
            {state.shots.length === 0 ? (
              <p className="text-xs text-zinc-600">No shots defined.</p>
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
                      {/* Color dot */}
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: asset.color }}
                      />
                      {/* Name */}
                      <span
                        className={`flex-1 truncate ${
                          isVisible ? 'text-zinc-300' : 'text-zinc-600'
                        }`}
                      >
                        {asset.name || 'Unnamed'}
                      </span>
                      {/* Visibility toggle */}
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
                      {/* Place / Remove */}
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
                {/* Start frames row */}
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

                {/* End frames row */}
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

      {/* ── Lightbox modal ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxUrl(null)}
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

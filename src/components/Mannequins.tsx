import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useThree, useFrame, createPortal } from '@react-three/fiber';
import { Html, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { MannequinPlacement, CineBlockAsset } from '../types';
import { DEFAULT_BODY_PARAMS } from '../types';
import { ArticulatedMannequin } from './ArticulatedMannequin';

// --- Character Mannequin: capsule body + sphere head ---

interface CharacterMannequinProps {
  asset: CineBlockAsset;
  placement: MannequinPlacement;
  isSelected: boolean;
  onSelect: () => void;
  onTransformEnd: (pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => void;
  orbitControlsRef: React.RefObject<THREE.EventDispatcher | null>;
}

export function CharacterMannequin({ asset, placement, isSelected, onSelect, onTransformEnd, orbitControlsRef }: CharacterMannequinProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const bp = placement.bodyParams ?? DEFAULT_BODY_PARAMS;
  const labelY = bp.height + 0.15;

  useEffect(() => {
    console.log('[CineBlock] CharacterMannequin mounted:', asset.name, 'at', placement.position);
  }, [asset.name, placement.position]);

  return (
    <>
      <group
        ref={groupRef}
        position={placement.position}
        rotation={placement.rotation}
        scale={placement.scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <ArticulatedMannequin
          color={asset.color}
          pose={placement.pose}
          bodyParams={placement.bodyParams}
        />
        {/* Name label */}
        <Html position={[0, labelY, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div
            className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
            style={{ backgroundColor: asset.color + 'CC', color: '#fff' }}
          >
            {asset.name || 'Unnamed'}
          </div>
        </Html>
      </group>
      {isSelected && groupRef.current && (
        <MannequinGizmo target={groupRef} onTransformEnd={onTransformEnd} orbitControlsRef={orbitControlsRef} />
      )}
    </>
  );
}

// --- Prop Mannequin: scaled box ---

interface PropMannequinProps {
  asset: CineBlockAsset;
  placement: MannequinPlacement;
  isSelected: boolean;
  onSelect: () => void;
  onTransformEnd: (pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => void;
  orbitControlsRef: React.RefObject<THREE.EventDispatcher | null>;
}

export function PropMannequin({ asset, placement, isSelected, onSelect, onTransformEnd, orbitControlsRef }: PropMannequinProps) {
  const groupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    console.log('[CineBlock] PropMannequin mounted:', asset.name, 'at', placement.position);
  }, [asset.name, placement.position]);

  return (
    <>
      <group
        ref={groupRef}
        position={placement.position}
        rotation={placement.rotation}
        scale={placement.scale}
      >
        <mesh
          position={[0, 0.25, 0]}
          renderOrder={999}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color={asset.color} depthTest={false} transparent opacity={0.85} />
        </mesh>
        <Html position={[0, 0.7, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div
            className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
            style={{ backgroundColor: asset.color + 'CC', color: '#fff' }}
          >
            {asset.name || 'Unnamed'}
          </div>
        </Html>
      </group>
      {isSelected && groupRef.current && (
        <MannequinGizmo target={groupRef} onTransformEnd={onTransformEnd} orbitControlsRef={orbitControlsRef} />
      )}
    </>
  );
}

// --- TransformControls Gizmo wrapper ---

interface MannequinGizmoProps {
  target: React.RefObject<THREE.Group>;
  onTransformEnd: (pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => void;
  orbitControlsRef: React.RefObject<THREE.EventDispatcher | null>;
}

function MannequinGizmo({ target, onTransformEnd, orbitControlsRef }: MannequinGizmoProps) {
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tcRef = useRef<any>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'g' || e.key === 'G') setMode('translate');
      if (e.key === 'r' || e.key === 'R') setMode('rotate');
      if (e.key === 's' || e.key === 'S') setMode('scale');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Disable OrbitControls while dragging the gizmo.
  // drei's built-in mechanism uses useThree(state => state.controls), which
  // returns a stale copy inside the MannequinOverlay portal (createPortal
  // mirrors the R3F store). We bypass this by using the actual OrbitControls
  // ref passed from the main scene.
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDrag = (event: any) => {
      const orbit = orbitControlsRef.current;
      if (orbit && 'enabled' in orbit) {
        (orbit as { enabled: boolean }).enabled = !event.value;
      }
    };
    tc.addEventListener('dragging-changed', onDrag);
    return () => tc.removeEventListener('dragging-changed', onDrag);
  }, [orbitControlsRef]);

  const handleChange = useCallback(() => {
    if (!target.current) return;
    const obj = target.current;
    onTransformEnd(
      obj.position.toArray() as [number, number, number],
      [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      obj.scale.toArray() as [number, number, number],
    );
  }, [target, onTransformEnd]);

  return (
    <TransformControls
      ref={tcRef}
      object={target.current!}
      mode={mode}
      onMouseUp={handleChange}
    />
  );
}

// --- Placement raycast helper (used from StudioView's scene) ---

interface PlacementRaycastHelperProps {
  colliderRef: React.RefObject<THREE.Object3D | null>;
  placingAssetId: string | null;
  onPlace: (point: [number, number, number]) => void;
  onCancel: () => void;
}

export function PlacementRaycastHelper({ colliderRef, placingAssetId, onPlace, onCancel }: PlacementRaycastHelperProps) {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());

  useEffect(() => {
    if (!placingAssetId) return;

    gl.domElement.style.cursor = 'crosshair';

    function handleClick(e: MouseEvent) {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycaster.current.setFromCamera(mouse, camera);

      // Try collider mesh first
      if (colliderRef.current) {
        const meshes: THREE.Mesh[] = [];
        colliderRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
        });
        console.log('[CineBlock] Raycast: found', meshes.length, 'collider meshes');
        const hits = raycaster.current.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const p = hits[0].point;
          console.log('[CineBlock] Raycast HIT at', [p.x, p.y, p.z], 'distance:', hits[0].distance);
          onPlace([p.x, p.y, p.z]);
          return;
        }
        console.log('[CineBlock] Raycast MISS — using fallback position');
      } else {
        console.log('[CineBlock] No collider mesh — using fallback position');
      }

      // Fallback: 5 units forward from camera
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const pos = camera.position.clone().add(dir.multiplyScalar(5));
      console.log('[CineBlock] Fallback position:', [pos.x, pos.y, pos.z]);
      onPlace([pos.x, pos.y, pos.z]);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }

    gl.domElement.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      gl.domElement.style.cursor = '';
      gl.domElement.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [placingAssetId, camera, gl, colliderRef, onPlace, onCancel]);

  return null;
}

// --- Scene component that renders all mannequins for the active shot ---

interface MannequinSceneProps {
  assets: CineBlockAsset[];
  placements: MannequinPlacement[];
  visibility: Record<string, boolean>;
  selectedAssetId: string | null;
  onSelect: (assetId: string | null) => void;
  onTransformEnd: (assetId: string, shotId: string, pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => void;
  colliderRef: React.RefObject<THREE.Object3D | null>;
  placingAssetId: string | null;
  onPlace: (point: [number, number, number]) => void;
  onCancelPlace: () => void;
  orbitControlsRef: React.RefObject<THREE.EventDispatcher | null>;
}

export function MannequinScene({
  assets,
  placements,
  visibility,
  selectedAssetId,
  onSelect,
  onTransformEnd,
  colliderRef,
  placingAssetId,
  onPlace,
  onCancelPlace,
  orbitControlsRef,
}: MannequinSceneProps) {
  // Click on empty space to deselect
  const { scene } = useThree();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedAssetId && !placingAssetId) {
        onSelect(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAssetId, placingAssetId, onSelect]);

  return (
    <>
      {placements.map((placement) => {
        const asset = assets.find((a) => a.id === placement.assetId);
        if (!asset) return null;
        // Check visibility — default visible if not explicitly set
        const isVisible = visibility[asset.id] !== false;
        if (!isVisible) return null;

        const isSelected = selectedAssetId === asset.id;
        const handleTransformEnd = (pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => {
          onTransformEnd(asset.id, placement.shotId, pos, rot, scl);
        };

        if (asset.type === 'character') {
          return (
            <CharacterMannequin
              key={`${placement.assetId}-${placement.shotId}`}
              asset={asset}
              placement={placement}
              isSelected={isSelected}
              onSelect={() => onSelect(asset.id)}
              onTransformEnd={handleTransformEnd}
              orbitControlsRef={orbitControlsRef}
            />
          );
        }

        return (
          <PropMannequin
            key={`${placement.assetId}-${placement.shotId}`}
            asset={asset}
            placement={placement}
            isSelected={isSelected}
            onSelect={() => onSelect(asset.id)}
            onTransformEnd={handleTransformEnd}
            orbitControlsRef={orbitControlsRef}
          />
        );
      })}

      {placingAssetId && (
        <PlacementRaycastHelper
          colliderRef={colliderRef}
          placingAssetId={placingAssetId}
          onPlace={onPlace}
          onCancel={onCancelPlace}
        />
      )}
    </>
  );
}

// --- Overlay renderer: renders mannequins in a separate pass on top of Gaussian splats ---

export function MannequinOverlay({ children }: { children: React.ReactNode }) {
  const overlayScene = useMemo(() => new THREE.Scene(), []);

  // Taking over rendering: render main scene first, then overlay with cleared depth
  useFrame(({ gl, scene, camera }) => {
    // Step 1: render the main scene (splats, collider, etc.)
    gl.render(scene, camera);

    // Step 2: clear only the depth buffer, keep color
    gl.autoClear = false;
    gl.clearDepth();

    // Step 3: render the overlay scene (mannequins + lights) on top
    gl.render(overlayScene, camera);

    gl.autoClear = true;
  }, 1); // priority > 0 = take over rendering

  return <>{createPortal(children, overlayScene)}</>;
}

import { useRef, useState, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { Html, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { LightPlacement } from '../types';
import { blendKelvinWithTint } from '../utils/kelvinToColor';

// --- Light gizmo (reuses MannequinGizmo pattern) ---

interface LightGizmoProps {
  target: React.RefObject<THREE.Group>;
  onTransformEnd: (pos: [number, number, number], rot: [number, number, number]) => void;
  orbitControlsRef: React.RefObject<THREE.EventDispatcher | null>;
}

function LightGizmo({ target, onTransformEnd, orbitControlsRef }: LightGizmoProps) {
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tcRef = useRef<any>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'g' || e.key === 'G') setMode('translate');
      if (e.key === 'r' || e.key === 'R') setMode('rotate');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

// --- Single light object ---

interface LightObjectProps {
  light: LightPlacement;
  isSelected: boolean;
  onSelect: () => void;
  onTransformEnd: (pos: [number, number, number], rot: [number, number, number]) => void;
  orbitControlsRef: React.RefObject<THREE.EventDispatcher | null>;
}

function LightObject({ light, isSelected, onSelect, onTransformEnd, orbitControlsRef }: LightObjectProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const color = blendKelvinWithTint(light.kelvin, light.tintColor);

  return (
    <>
      <group
        ref={groupRef}
        position={light.position}
        rotation={light.rotation}
      >
        {/* Actual light — always rendered for effects in captures */}
        {light.lightType === 'point' ? (
          <pointLight
            color={color}
            intensity={light.intensity}
            distance={light.distance}
          />
        ) : (
          <spotLight
            color={color}
            intensity={light.intensity}
            distance={light.distance}
            angle={light.coneAngle}
            penumbra={light.penumbra}
            position={[0, 0, 0]}
            target-position={[0, 0, -1]}
          />
        )}

        {/* Helper visuals — marked for capture hiding */}
        <group userData={{ isLightHelper: true }}>
          {/* Clickable emissive sphere handle */}
          <mesh
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
          >
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} />
          </mesh>

          {/* Spot cone wireframe helper */}
          {light.lightType === 'spot' && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[
                Math.tan(light.coneAngle) * Math.min(light.distance, 3),
                Math.min(light.distance, 3),
                16,
                1,
                true,
              ]} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.15} />
            </mesh>
          )}

          {/* Label */}
          <Html position={[0, 0.15, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div className="px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap bg-zinc-900/80 border border-zinc-700/50">
              <span style={{ color: `#${color.getHexString()}` }}>
                {light.lightType === 'spot' ? 'Spot' : 'Point'}
              </span>
              <span className="text-zinc-500 ml-1">{light.kelvin}K</span>
            </div>
          </Html>
        </group>
      </group>
      {isSelected && groupRef.current && (
        <LightGizmo target={groupRef} onTransformEnd={onTransformEnd} orbitControlsRef={orbitControlsRef} />
      )}
    </>
  );
}

// --- Scene component that renders all lights ---

interface LightSceneProps {
  lights: LightPlacement[];
  selectedLightId: string | null;
  onSelect: (id: string | null) => void;
  onTransformEnd: (id: string, shotId: string, pos: [number, number, number], rot: [number, number, number]) => void;
  orbitControlsRef: React.RefObject<THREE.EventDispatcher | null>;
}

export function LightScene({ lights, selectedLightId, onSelect, onTransformEnd, orbitControlsRef }: LightSceneProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedLightId) {
        onSelect(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLightId, onSelect]);

  return (
    <>
      {lights.map((light) => (
        <LightObject
          key={light.id}
          light={light}
          isSelected={selectedLightId === light.id}
          onSelect={() => onSelect(light.id)}
          onTransformEnd={(pos, rot) => onTransformEnd(light.id, light.shotId, pos, rot)}
          orbitControlsRef={orbitControlsRef}
        />
      ))}
    </>
  );
}

// --- Placement raycast helper for lights ---

interface LightPlacementHelperProps {
  colliderRef: React.RefObject<THREE.Object3D | null>;
  onPlace: (point: [number, number, number]) => void;
  onCancel: () => void;
}

export function LightPlacementHelper({ colliderRef, onPlace, onCancel }: LightPlacementHelperProps) {
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());

  useEffect(() => {
    gl.domElement.style.cursor = 'crosshair';

    function handleClick(e: MouseEvent) {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycaster.current.setFromCamera(mouse, camera);

      if (colliderRef.current) {
        colliderRef.current.updateMatrixWorld(true);
        const meshes: THREE.Mesh[] = [];
        colliderRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
        });
        const hits = raycaster.current.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const p = hits[0].point;
          onPlace([p.x, p.y + 1.5, p.z]);
          return;
        }
      }

      // Fallback: 5 units forward, elevated 2m
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const pos = camera.position.clone().add(dir.multiplyScalar(5));
      pos.y += 2;
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
  }, [camera, gl, colliderRef, onPlace, onCancel]);

  return null;
}

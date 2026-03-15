import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { Box3 } from 'three';
import type * as THREE from 'three';

// --- Camera Clone Patch ---
// SparkJS LoD deep-clones the camera each frame. drei's OrbitControls attaches
// non-clonable objects (event listeners, DOM refs) to the camera. This patch
// makes camera.clone() skip those properties so LoD doesn't crash.

function patchCameraClone(camera: THREE.Camera) {
  const originalClone = camera.clone.bind(camera);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cam = camera as any;
  camera.clone = function (recursive?: boolean) {
    const saved: Record<string, unknown> = {};
    const skipKeys = ['domElement', '_listeners', '_controlsDispose'];
    for (const key of skipKeys) {
      if (key in cam) {
        saved[key] = cam[key];
        delete cam[key];
      }
    }
    const cloned = originalClone(recursive);
    for (const [key, val] of Object.entries(saved)) {
      cam[key] = val;
    }
    return cloned;
  };
}

// --- Gaussian Splat Component ---

interface GaussianSplatProps {
  spzUrl: string;
  onLoaded?: () => void;
}

export function GaussianSplat({ spzUrl, onLoaded }: GaussianSplatProps) {
  const { gl, scene, camera } = useThree();
  const sparkRef = useRef<SparkRenderer | null>(null);
  const splatRef = useRef<SplatMesh | null>(null);
  const patchedRef = useRef(false);

  // Apply camera clone patch once
  useEffect(() => {
    if (!patchedRef.current) {
      patchCameraClone(camera);
      patchedRef.current = true;
    }
  }, [camera]);

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    sparkRef.current = spark;
    scene.add(spark);

    const splat = new SplatMesh({ url: spzUrl });
    splatRef.current = splat;
    scene.add(splat);

    splat.initialized.then(() => {
      const box = splat.getBoundingBox();
      console.log('[CineBlock] Splat loaded, bounding box:', box.min.toArray(), box.max.toArray());
      onLoaded?.();
    });

    return () => {
      scene.remove(spark);
      scene.remove(splat);
      spark.dispose();
      splat.dispose();
      sparkRef.current = null;
      splatRef.current = null;
    };
  }, [spzUrl, gl, scene]);

  return null;
}

// --- Collider Mesh Component ---

interface ColliderMeshProps {
  colliderUrl: string;
  onLoaded?: (mesh: THREE.Object3D) => void;
}

export function ColliderMesh({ colliderUrl, onLoaded }: ColliderMeshProps) {
  const { scene: gltfScene } = useGLTF(colliderUrl);
  const meshRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (gltfScene) {
      const box = new Box3().setFromObject(gltfScene);
      console.log('[CineBlock] Collider mesh loaded, bounding box:', box.min.toArray(), box.max.toArray());

      if (onLoaded && meshRef.current) {
        onLoaded(meshRef.current);
      }
    }
  }, [gltfScene, onLoaded]);

  return (
    <primitive ref={meshRef} object={gltfScene} visible={false} />
  );
}

// --- Combined MarbleWorld Component ---

interface MarbleWorldProps {
  spzUrl: string;
  colliderUrl: string | null;
  onColliderLoaded?: (mesh: THREE.Object3D) => void;
  onSplatLoaded?: () => void;
}

export default function MarbleWorld({ spzUrl, colliderUrl, onColliderLoaded, onSplatLoaded }: MarbleWorldProps) {
  return (
    <>
      <GaussianSplat spzUrl={spzUrl} onLoaded={onSplatLoaded} />
      {colliderUrl && (
        <ColliderMesh colliderUrl={colliderUrl} onLoaded={onColliderLoaded} />
      )}
    </>
  );
}

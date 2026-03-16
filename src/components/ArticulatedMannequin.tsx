import { useMemo } from 'react';
import * as THREE from 'three';
import type { MannequinPose, MannequinBodyParams } from '../types';
import { DEFAULT_POSE, DEFAULT_BODY_PARAMS } from '../types';

interface ArticulatedMannequinProps {
  color: string;
  pose?: MannequinPose;
  bodyParams?: MannequinBodyParams;
}

/** Shared material props for all body parts */
function bodyMat(color: string) {
  return { color, depthTest: false, transparent: true, opacity: 0.85 };
}

export function ArticulatedMannequin({ color, pose, bodyParams }: ArticulatedMannequinProps) {
  const p = pose ?? DEFAULT_POSE;
  const bp = bodyParams ?? DEFAULT_BODY_PARAMS;

  // Derive proportions from height & build
  const dims = useMemo(() => {
    const h = bp.height;
    const b = bp.build;
    return {
      pelvisY: 0.53 * h,
      torsoLen: 0.30 * h,
      torsoRadius: 0.10 * b,
      headRadius: 0.06 * h,
      upperArmLen: 0.17 * h,
      forearmLen: 0.14 * h,
      armRadius: 0.025 * b,
      handRadius: 0.02 * b,
      upperLegLen: 0.23 * h,
      lowerLegLen: 0.24 * h,
      legRadius: 0.035 * b,
      footRadius: 0.025 * b,
      shoulderWidth: 0.15 * b,
      hipWidth: 0.08 * b,
    };
  }, [bp.height, bp.build]);

  const mat = useMemo(() => bodyMat(color), [color]);

  // Convert shoulder/hip euler arrays to THREE.Euler for rotation
  const lShoulderRot = useMemo(() => new THREE.Euler(...p.leftShoulder), [p.leftShoulder]);
  const rShoulderRot = useMemo(() => new THREE.Euler(...p.rightShoulder), [p.rightShoulder]);
  const lHipRot = useMemo(() => new THREE.Euler(...p.leftHip), [p.leftHip]);
  const rHipRot = useMemo(() => new THREE.Euler(...p.rightHip), [p.rightHip]);

  return (
    <group>
      {/* Pelvis — root at feet (y=0) */}
      <group position={[0, dims.pelvisY, 0]}>
        {/* Torso */}
        <mesh position={[0, dims.torsoLen / 2, 0]} renderOrder={999}>
          <capsuleGeometry args={[dims.torsoRadius, dims.torsoLen, 8, 16]} />
          <meshStandardMaterial {...mat} />
        </mesh>

        {/* Head */}
        <mesh position={[0, dims.torsoLen + dims.headRadius * 1.5, 0]} renderOrder={999}>
          <sphereGeometry args={[dims.headRadius, 16, 16]} />
          <meshStandardMaterial {...mat} />
        </mesh>

        {/* ── Left Arm ── */}
        <group position={[-dims.shoulderWidth, dims.torsoLen * 0.9, 0]} rotation={lShoulderRot}>
          {/* Upper arm */}
          <mesh position={[0, -dims.upperArmLen / 2, 0]} renderOrder={999}>
            <cylinderGeometry args={[dims.armRadius, dims.armRadius, dims.upperArmLen, 8]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          {/* Forearm — pivots at elbow */}
          <group position={[0, -dims.upperArmLen, 0]} rotation={[p.leftElbow, 0, 0]}>
            <mesh position={[0, -dims.forearmLen / 2, 0]} renderOrder={999}>
              <cylinderGeometry args={[dims.armRadius * 0.9, dims.armRadius * 0.9, dims.forearmLen, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Hand */}
            <mesh position={[0, -dims.forearmLen, 0]} renderOrder={999}>
              <sphereGeometry args={[dims.handRadius, 8, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        </group>

        {/* ── Right Arm ── */}
        <group position={[dims.shoulderWidth, dims.torsoLen * 0.9, 0]} rotation={rShoulderRot}>
          <mesh position={[0, -dims.upperArmLen / 2, 0]} renderOrder={999}>
            <cylinderGeometry args={[dims.armRadius, dims.armRadius, dims.upperArmLen, 8]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <group position={[0, -dims.upperArmLen, 0]} rotation={[p.rightElbow, 0, 0]}>
            <mesh position={[0, -dims.forearmLen / 2, 0]} renderOrder={999}>
              <cylinderGeometry args={[dims.armRadius * 0.9, dims.armRadius * 0.9, dims.forearmLen, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, -dims.forearmLen, 0]} renderOrder={999}>
              <sphereGeometry args={[dims.handRadius, 8, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        </group>

        {/* ── Left Leg ── */}
        <group position={[-dims.hipWidth, 0, 0]} rotation={lHipRot}>
          <mesh position={[0, -dims.upperLegLen / 2, 0]} renderOrder={999}>
            <cylinderGeometry args={[dims.legRadius, dims.legRadius, dims.upperLegLen, 8]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <group position={[0, -dims.upperLegLen, 0]} rotation={[p.leftKnee, 0, 0]}>
            <mesh position={[0, -dims.lowerLegLen / 2, 0]} renderOrder={999}>
              <cylinderGeometry args={[dims.legRadius * 0.9, dims.legRadius * 0.9, dims.lowerLegLen, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, -dims.lowerLegLen, 0]} renderOrder={999}>
              <sphereGeometry args={[dims.footRadius, 8, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        </group>

        {/* ── Right Leg ── */}
        <group position={[dims.hipWidth, 0, 0]} rotation={rHipRot}>
          <mesh position={[0, -dims.upperLegLen / 2, 0]} renderOrder={999}>
            <cylinderGeometry args={[dims.legRadius, dims.legRadius, dims.upperLegLen, 8]} />
            <meshStandardMaterial {...mat} />
          </mesh>
          <group position={[0, -dims.upperLegLen, 0]} rotation={[p.rightKnee, 0, 0]}>
            <mesh position={[0, -dims.lowerLegLen / 2, 0]} renderOrder={999}>
              <cylinderGeometry args={[dims.legRadius * 0.9, dims.legRadius * 0.9, dims.lowerLegLen, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, -dims.lowerLegLen, 0]} renderOrder={999}>
              <sphereGeometry args={[dims.footRadius, 8, 8]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

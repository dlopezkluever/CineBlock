import * as THREE from 'three';

interface AnimalProps {
  color: string;
  occlude: boolean;
}

// --- Procedural Dog: multi-primitive silhouette ---
// Centered so feet sit at Y=0

export function ProceduralDog({ color, occlude }: AnimalProps) {
  const mat = <meshStandardMaterial color={color} depthTest={occlude} transparent opacity={0.85} />;

  return (
    <group>
      {/* Body — horizontal capsule */}
      <mesh position={[0, 0.35, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.12, 0.3, 8, 16]} />
        {mat}
      </mesh>

      {/* Head — sphere */}
      <mesh position={[0.3, 0.45, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        {mat}
      </mesh>

      {/* Snout — small box */}
      <mesh position={[0.4, 0.43, 0]}>
        <boxGeometry args={[0.08, 0.05, 0.06]} />
        {mat}
      </mesh>

      {/* Left ear */}
      <mesh position={[0.28, 0.55, -0.06]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.04, 0.07, 0.02]} />
        {mat}
      </mesh>

      {/* Right ear */}
      <mesh position={[0.28, 0.55, 0.06]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.04, 0.07, 0.02]} />
        {mat}
      </mesh>

      {/* Tail — thin cylinder angled up */}
      <mesh position={[-0.3, 0.45, 0]} rotation={[0, 0, -0.6]}>
        <cylinderGeometry args={[0.015, 0.015, 0.18, 8]} />
        {mat}
      </mesh>

      {/* Front-left leg */}
      <mesh position={[0.15, 0.12, -0.07]}>
        <cylinderGeometry args={[0.025, 0.025, 0.24, 8]} />
        {mat}
      </mesh>

      {/* Front-right leg */}
      <mesh position={[0.15, 0.12, 0.07]}>
        <cylinderGeometry args={[0.025, 0.025, 0.24, 8]} />
        {mat}
      </mesh>

      {/* Back-left leg */}
      <mesh position={[-0.15, 0.12, -0.07]}>
        <cylinderGeometry args={[0.025, 0.025, 0.24, 8]} />
        {mat}
      </mesh>

      {/* Back-right leg */}
      <mesh position={[-0.15, 0.12, 0.07]}>
        <cylinderGeometry args={[0.025, 0.025, 0.24, 8]} />
        {mat}
      </mesh>

      {/* Front-left foot */}
      <mesh position={[0.15, 0.01, -0.07]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        {mat}
      </mesh>

      {/* Front-right foot */}
      <mesh position={[0.15, 0.01, 0.07]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        {mat}
      </mesh>

      {/* Back-left foot */}
      <mesh position={[-0.15, 0.01, -0.07]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        {mat}
      </mesh>

      {/* Back-right foot */}
      <mesh position={[-0.15, 0.01, 0.07]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        {mat}
      </mesh>
    </group>
  );
}

// --- Procedural Cat: ~75% scale, rounder body, larger ears, thinner tail ---
// Centered so feet sit at Y=0

export function ProceduralCat({ color, occlude }: AnimalProps) {
  const mat = <meshStandardMaterial color={color} depthTest={occlude} transparent opacity={0.85} />;

  return (
    <group>
      {/* Body — horizontal capsule (rounder, slightly smaller) */}
      <mesh position={[0, 0.28, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.1, 0.2, 8, 16]} />
        {mat}
      </mesh>

      {/* Head — sphere (proportionally larger) */}
      <mesh position={[0.22, 0.35, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        {mat}
      </mesh>

      {/* Snout — small sphere */}
      <mesh position={[0.3, 0.33, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        {mat}
      </mesh>

      {/* Left ear — triangular (cone) */}
      <mesh position={[0.2, 0.46, -0.05]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.03, 0.08, 4]} />
        {mat}
      </mesh>

      {/* Right ear — triangular (cone) */}
      <mesh position={[0.2, 0.46, 0.05]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.03, 0.08, 4]} />
        {mat}
      </mesh>

      {/* Tail — long, thin, curved upward */}
      <mesh position={[-0.25, 0.35, 0]} rotation={[0, 0, -0.8]}>
        <cylinderGeometry args={[0.012, 0.008, 0.25, 8]} />
        {mat}
      </mesh>

      {/* Front-left leg */}
      <mesh position={[0.1, 0.1, -0.055]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        {mat}
      </mesh>

      {/* Front-right leg */}
      <mesh position={[0.1, 0.1, 0.055]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        {mat}
      </mesh>

      {/* Back-left leg */}
      <mesh position={[-0.1, 0.1, -0.055]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        {mat}
      </mesh>

      {/* Back-right leg */}
      <mesh position={[-0.1, 0.1, 0.055]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        {mat}
      </mesh>

      {/* Front-left foot */}
      <mesh position={[0.1, 0.01, -0.055]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        {mat}
      </mesh>

      {/* Front-right foot */}
      <mesh position={[0.1, 0.01, 0.055]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        {mat}
      </mesh>

      {/* Back-left foot */}
      <mesh position={[-0.1, 0.01, -0.055]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        {mat}
      </mesh>

      {/* Back-right foot */}
      <mesh position={[-0.1, 0.01, 0.055]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        {mat}
      </mesh>
    </group>
  );
}

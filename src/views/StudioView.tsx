import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

function TestCube() {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#3B82F6" />
    </mesh>
  );
}

export default function StudioView({ onNavigate }: { onNavigate: (view: 'setup' | 'results') => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
        <button
          onClick={() => onNavigate('setup')}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          &larr; Back to Setup
        </button>
        <span className="text-sm font-medium text-zinc-300">Studio</span>
        <button
          onClick={() => onNavigate('results')}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Done &rarr; Results
        </button>
      </div>

      {/* Main content: canvas + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* 3D Canvas */}
        <div className="flex-1 relative bg-black">
          <Canvas
            gl={{ antialias: false, preserveDrawingBuffer: true }}
            camera={{ position: [3, 2, 3], fov: 50 }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <TestCube />
            <OrbitControls />
            <gridHelper args={[10, 10, '#444444', '#222222']} />
          </Canvas>
        </div>

        {/* Sidebar */}
        <div className="w-[280px] bg-zinc-900 border-l border-zinc-700 p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Shot List</h3>
          <p className="text-xs text-zinc-500">Select a shot to begin capturing frames.</p>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Capture Tray</h3>
            <p className="text-xs text-zinc-500">No captures yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

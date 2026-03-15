import { useCineBlockState, useCineBlockDispatch } from '../store';
import { uploadAndGenerate } from '../services/marbleApi';

export default function SetupView({ onNavigate }: { onNavigate: (view: 'studio') => void }) {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();

  const filledSlots = state.locationImages.filter((s) => s.file !== null).length;
  const hasShot = state.shots.some((s) => s.name.trim() !== '');
  const canProceed = filledSlots >= 2 && hasShot;
  const isLoading = ['uploading', 'generating', 'polling'].includes(state.worldStatus);

  const statusMessages: Record<string, string> = {
    uploading: 'Uploading images…',
    generating: 'Building your set (~30-45s)…',
    polling: 'Waiting for world generation…',
  };

  async function handleGenerate() {
    const slotsWithFiles = state.locationImages
      .filter((s): s is typeof s & { file: File } => s.file !== null)
      .map((s) => ({ file: s.file, azimuth: s.azimuth }));

    if (slotsWithFiles.length < 2) return;

    try {
      const world = await uploadAndGenerate(slotsWithFiles, {
        onUploading: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'uploading' }),
        onGenerating: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'generating' }),
        onPolling: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'polling' }),
      });

      dispatch({
        type: 'SET_WORLD_DATA',
        worldId: world.id,
        spzUrl: world.assets.splats.spz_urls['500k'],
        colliderUrl: world.assets.mesh.collider_mesh_url,
      });
      onNavigate('studio');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      dispatch({ type: 'SET_WORLD_STATUS', status: 'error', error: message });
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Setup</h2>
        <p className="text-zinc-400">
          Upload location images, define assets, and build your shot list.
        </p>
      </div>

      {/* Section A — Location Images */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-zinc-200">A. Location Images</h3>
        <p className="text-sm text-zinc-500">Upload at least 2 azimuth images to generate your 3D world.</p>
        <div className="grid grid-cols-2 gap-4">
          {state.locationImages.map((slot) => (
            <div
              key={slot.azimuth}
              className="border border-zinc-700 rounded-lg p-4 flex flex-col items-center justify-center h-36 bg-zinc-800/50"
            >
              <span className="text-zinc-400 text-sm font-medium">
                {slot.label} ({slot.azimuth}&deg;)
              </span>
              <span className="text-zinc-600 text-xs mt-1">
                {slot.file ? slot.file.name : 'No image'}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{filledSlots}/4 slots filled (min 2)</p>
      </section>

      {/* Section B — Assets */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-zinc-200">B. Scene Assets</h3>
        <p className="text-sm text-zinc-500">Characters and props in your scene.</p>
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/50 text-zinc-500 text-sm">
          {state.assets.length === 0
            ? 'No assets yet. Add characters and props here.'
            : `${state.assets.length} asset(s) defined`}
        </div>
      </section>

      {/* Section C — Shots */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-zinc-200">C. Shot List</h3>
        <p className="text-sm text-zinc-500">Define your shots with camera type and action.</p>
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/50 text-zinc-500 text-sm">
          {state.shots.length === 0
            ? 'No shots yet. Build your shot list here.'
            : `${state.shots.length} shot(s) defined`}
        </div>
      </section>

      {/* Error display */}
      {state.worldStatus === 'error' && state.worldError && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400 text-sm font-medium">Generation failed</p>
          <p className="text-red-300 text-xs mt-1">{state.worldError}</p>
          <button
            onClick={handleGenerate}
            className="mt-2 text-xs text-red-300 underline hover:text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* CTA */}
      <div className="pt-4">
        <button
          disabled={!canProceed || isLoading}
          onClick={handleGenerate}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-colors
            disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
            bg-blue-600 hover:bg-blue-500 text-white"
          title={!canProceed ? 'Need at least 2 images and 1 shot' : undefined}
        >
          {isLoading
            ? statusMessages[state.worldStatus] ?? 'Processing…'
            : 'Generate World & Enter Studio'}
        </button>
        {!canProceed && !isLoading && (
          <p className="text-xs text-zinc-500 mt-2 text-center">
            {filledSlots < 2 && 'Upload at least 2 location images. '}
            {!hasShot && 'Define at least 1 shot.'}
          </p>
        )}
      </div>
    </div>
  );
}

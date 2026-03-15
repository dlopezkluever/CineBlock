import { useCineBlockState } from '../store';

export default function SetupView({ onNavigate }: { onNavigate: (view: 'studio') => void }) {
  const state = useCineBlockState();
  const filledSlots = state.locationImages.filter((s) => s.file !== null).length;
  const hasShot = state.shots.some((s) => s.name.trim() !== '');
  const canProceed = filledSlots >= 2 && hasShot;

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

      {/* CTA */}
      <div className="pt-4">
        <button
          disabled={!canProceed}
          onClick={() => onNavigate('studio')}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-colors
            disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
            bg-blue-600 hover:bg-blue-500 text-white"
          title={!canProceed ? 'Need at least 2 images and 1 shot' : undefined}
        >
          Generate World &amp; Enter Studio
        </button>
        {!canProceed && (
          <p className="text-xs text-zinc-500 mt-2 text-center">
            {filledSlots < 2 && 'Upload at least 2 location images. '}
            {!hasShot && 'Define at least 1 shot.'}
          </p>
        )}
      </div>
    </div>
  );
}

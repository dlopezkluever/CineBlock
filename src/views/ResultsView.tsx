export default function ResultsView({ onNavigate }: { onNavigate: (view: 'setup' | 'studio') => void }) {
  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Results</h2>
          <p className="text-zinc-400">Review your captured frames and export.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('studio')}
            className="px-4 py-2 text-sm rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
          >
            &larr; Back to Studio
          </button>
        </div>
      </div>

      <div className="border border-zinc-700 rounded-lg p-12 bg-zinc-800/50 text-center">
        <p className="text-zinc-500">No captures to display yet.</p>
        <p className="text-zinc-600 text-sm mt-2">
          Go to the Studio to capture frames for your shots.
        </p>
      </div>
    </div>
  );
}

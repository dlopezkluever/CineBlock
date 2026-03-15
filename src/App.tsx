import { useCineBlockState, useCineBlockDispatch } from './store';
import SetupView from './views/SetupView';
import StudioView from './views/StudioView';
import ResultsView from './views/ResultsView';
import type { CineBlockState } from './types';

const viewLabels: Record<CineBlockState['currentView'], string> = {
  setup: 'Setup',
  studio: 'Studio',
  results: 'Results',
};

const viewOrder: CineBlockState['currentView'][] = ['setup', 'studio', 'results'];

export default function App() {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();

  const navigate = (view: CineBlockState['currentView']) => {
    dispatch({ type: 'NAVIGATE', view });
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Top nav / breadcrumb */}
      <nav className="flex items-center gap-1 px-6 py-3 bg-zinc-900 border-b border-zinc-800">
        <span className="text-sm font-bold text-blue-400 mr-4">CineBlock</span>
        {viewOrder.map((view, i) => (
          <span key={view} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-600 mx-1">/</span>}
            <button
              onClick={() => navigate(view)}
              className={`text-sm transition-colors ${
                state.currentView === view
                  ? 'text-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {viewLabels[view]}
            </button>
          </span>
        ))}
      </nav>

      {/* Active view */}
      <main className="flex-1 min-h-0 overflow-auto">
        {state.currentView === 'setup' && <SetupView onNavigate={navigate} />}
        {state.currentView === 'studio' && <StudioView onNavigate={navigate} />}
        {state.currentView === 'results' && <ResultsView onNavigate={navigate} />}
      </main>
    </div>
  );
}

import { useState, useCallback, useEffect } from 'react';
import { useCineBlockState, useCineBlockDispatch } from '../store';
import type { CaptureEntry, CineBlockShot, CineBlockAsset } from '../types';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// ── Camera type → Aiuteur defaults ──

const cameraTypeDefaults: Record<
  CineBlockShot['cameraType'],
  { distance: 'wide' | 'medium' | 'close'; height: 'eye_level' }
> = {
  Wide: { distance: 'wide', height: 'eye_level' },
  Medium: { distance: 'medium', height: 'eye_level' },
  'Close-Up': { distance: 'close', height: 'eye_level' },
  OTS: { distance: 'medium', height: 'eye_level' },
  POV: { distance: 'close', height: 'eye_level' },
  'Two-Shot': { distance: 'medium', height: 'eye_level' },
  Insert: { distance: 'close', height: 'eye_level' },
};

// ── Helpers ──

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function shotFolderName(shot: CineBlockShot): string {
  return `shot-${slugify(shot.name || shot.id)}-${slugify(shot.cameraType)}`;
}

// ── Main Component ──

export default function ResultsView({
  onNavigate,
}: {
  onNavigate: (view: 'setup' | 'studio') => void;
}) {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();
  const [lightbox, setLightbox] = useState<{
    captures: CaptureEntry[];
    index: number;
    shotName: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [jsonDropdownOpen, setJsonDropdownOpen] = useState(false);

  const hasCaptures = state.captures.length > 0;

  // ── Lightbox keyboard navigation ──

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowLeft')
        setLightbox((prev) =>
          prev
            ? { ...prev, index: Math.max(0, prev.index - 1) }
            : null,
        );
      if (e.key === 'ArrowRight')
        setLightbox((prev) =>
          prev
            ? {
                ...prev,
                index: Math.min(prev.captures.length - 1, prev.index + 1),
              }
            : null,
        );
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox]);

  // ── Hero toggle ──

  const handleToggleHero = useCallback(
    (captureId: string) => {
      dispatch({ type: 'TOGGLE_HERO', captureId });
    },
    [dispatch],
  );

  // ── ZIP export ──

  const handleExportZip = useCallback(async () => {
    if (!hasCaptures) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const root = zip.folder('cineblock-export')!;

      for (const shot of state.shots) {
        const folder = root.folder(shotFolderName(shot))!;
        const shotCaps = state.captures.filter((c) => c.shotId === shot.id);
        const starts = shotCaps.filter((c) => c.frameType === 'start');
        const ends = shotCaps.filter((c) => c.frameType === 'end');

        starts.forEach((cap, i) => {
          folder.file(
            `start-${String(i + 1).padStart(2, '0')}.png`,
            dataUrlToBlob(cap.dataUrl),
          );
        });
        ends.forEach((cap, i) => {
          folder.file(
            `end-${String(i + 1).padStart(2, '0')}.png`,
            dataUrlToBlob(cap.dataUrl),
          );
        });
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, 'cineblock-export.zip');
    } finally {
      setExporting(false);
    }
  }, [hasCaptures, state.shots, state.captures]);

  // ── JSON export — CineBlock format ──

  const handleExportCineBlockJson = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      worldId: state.worldId,
      scene: {
        assets: state.assets.map((a) => ({
          name: a.name,
          type: a.type,
          description: a.description,
          color: a.color,
        })),
        shots: state.shots.map((shot) => {
          const shotCaps = state.captures.filter((c) => c.shotId === shot.id);
          const starts = shotCaps.filter((c) => c.frameType === 'start');
          const ends = shotCaps.filter((c) => c.frameType === 'end');
          const folder = shotFolderName(shot);
          const heroStart = starts.find((c) => c.isHero);
          const heroEnd = ends.find((c) => c.isHero);

          const defaults = cameraTypeDefaults[shot.cameraType];

          return {
            id: shot.id,
            name: shot.name,
            cameraType: shot.cameraType,
            cameraHeight: shot.cameraHeight ?? defaults.height,
            cameraDistance: shot.cameraDistance ?? defaults.distance,
            cameraMovement: shot.cameraMovement ?? 'static',
            duration: shot.duration,
            action: shot.action,
            assetsInShot: state.assets
              .filter((a) => shot.assetIds.includes(a.id))
              .map((a) => a.name),
            startFrames: starts.map(
              (_, i) =>
                `${folder}/start-${String(i + 1).padStart(2, '0')}.png`,
            ),
            endFrames: ends.map(
              (_, i) =>
                `${folder}/end-${String(i + 1).padStart(2, '0')}.png`,
            ),
            heroStartFrame: heroStart
              ? `${folder}/start-${String(starts.indexOf(heroStart) + 1).padStart(2, '0')}.png`
              : null,
            heroEndFrame: heroEnd
              ? `${folder}/end-${String(ends.indexOf(heroEnd) + 1).padStart(2, '0')}.png`
              : null,
          };
        }),
      },
    };

    downloadJson(data, 'cineblock-export.json');
  }, [state]);

  // ── JSON export — Aiuteur-compatible format ──

  const handleExportAiuteurJson = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      source: 'cineblock',
      version: '1.0',
      worldId: state.worldId,
      assets: state.assets.map((a) => ({
        name: a.name,
        asset_type: a.type,
        effective_description: a.description,
      })),
      shots: state.shots.map((shot) => {
        const shotCaps = state.captures.filter((c) => c.shotId === shot.id);
        const starts = shotCaps.filter((c) => c.frameType === 'start');
        const ends = shotCaps.filter((c) => c.frameType === 'end');
        const heroStart = starts.find((c) => c.isHero);
        const heroEnd = ends.find((c) => c.isHero);

        const defaults = cameraTypeDefaults[shot.cameraType];
        const shotAssets = state.assets.filter((a) =>
          shot.assetIds.includes(a.id),
        );

        return {
          shotId: shot.id,
          action: shot.action,
          camera: shot.cameraType,
          camera_distance: shot.cameraDistance ?? defaults.distance,
          camera_height: shot.cameraHeight ?? defaults.height,
          camera_movement: shot.cameraMovement ?? 'static',
          duration: shot.duration,
          charactersForeground: shotAssets
            .filter((a) => a.type === 'character')
            .map((a) => a.name),
          charactersForeground_props: shotAssets
            .filter((a) => a.type === 'prop')
            .map((a) => a.name),
          startFrame: {
            frameType: 'start' as const,
            heroImageDataUrl: heroStart?.dataUrl ?? null,
            alternateImageDataUrls: starts
              .filter((c) => !c.isHero)
              .map((c) => c.dataUrl),
          },
          endFrame: {
            frameType: 'end' as const,
            heroImageDataUrl: heroEnd?.dataUrl ?? null,
            alternateImageDataUrls: ends
              .filter((c) => !c.isHero)
              .map((c) => c.dataUrl),
          },
          referenceImageOrder: [
            ...(heroStart
              ? [
                  {
                    label: 'CineBlock start frame',
                    assetName: 'Scene Blocking',
                    url: heroStart.dataUrl,
                    type: 'cineblock_capture',
                    role: 'style',
                  },
                ]
              : []),
            ...(heroEnd
              ? [
                  {
                    label: 'CineBlock end frame',
                    assetName: 'Scene Blocking',
                    url: heroEnd.dataUrl,
                    type: 'cineblock_capture',
                    role: 'style',
                  },
                ]
              : []),
          ],
        };
      }),
    };

    downloadJson(data, 'cineblock-aiuteur-export.json');
  }, [state]);

  // ── Start over ──

  const handleStartOver = useCallback(() => {
    if (
      window.confirm(
        'Start over? This will clear all your shots, captures, and world data.',
      )
    ) {
      dispatch({ type: 'RESET' });
      onNavigate('setup');
    }
  }, [dispatch, onNavigate]);

  // ── Render ──

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Results</h2>
          <p className="text-zinc-400 text-sm">
            Review your captured frames and export.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate('studio')}
            className="px-4 py-2 text-sm rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
          >
            &larr; Back to Studio
          </button>
          <button
            onClick={handleStartOver}
            className="px-4 py-2 text-sm rounded-lg bg-zinc-800 text-red-400 hover:bg-zinc-700 hover:text-red-300 transition-colors border border-zinc-700"
          >
            Start Over
          </button>
        </div>
      </div>

      {/* Export bar */}
      {hasCaptures && (
        <div className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <span className="text-sm text-zinc-400 mr-auto">Export:</span>

          {/* ZIP */}
          <button
            onClick={handleExportZip}
            disabled={exporting}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
          >
            {exporting ? 'Exporting...' : 'Download ZIP'}
          </button>

          {/* JSON dropdown */}
          <div className="relative">
            <button
              onClick={() => setJsonDropdownOpen(!jsonDropdownOpen)}
              className="px-4 py-2 text-sm rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors flex items-center gap-1.5"
            >
              Export JSON
              <svg
                className={`w-3.5 h-3.5 transition-transform ${jsonDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {jsonDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setJsonDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-52 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      handleExportCineBlockJson();
                      setJsonDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    CineBlock Format
                  </button>
                  <button
                    onClick={() => {
                      handleExportAiuteurJson();
                      setJsonDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors border-t border-zinc-700"
                  >
                    Aiuteur-Compatible
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Shot cards */}
      {!hasCaptures ? (
        <div className="border border-zinc-700 rounded-lg p-12 bg-zinc-800/50 text-center">
          <p className="text-zinc-500">No captures to display yet.</p>
          <p className="text-zinc-600 text-sm mt-2">
            Go to the Studio to capture frames for your shots.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {state.shots.map((shot) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              assets={state.assets}
              captures={state.captures.filter((c) => c.shotId === shot.id)}
              onToggleHero={handleToggleHero}
              onOpenLightbox={(captures, index) =>
                setLightbox({ captures, index, shotName: shot.name })
              }
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && lightbox.captures[lightbox.index] && (
        <Lightbox
          capture={lightbox.captures[lightbox.index]}
          shotName={lightbox.shotName}
          canPrev={lightbox.index > 0}
          canNext={lightbox.index < lightbox.captures.length - 1}
          onPrev={() =>
            setLightbox((prev) =>
              prev ? { ...prev, index: prev.index - 1 } : null,
            )
          }
          onNext={() =>
            setLightbox((prev) =>
              prev ? { ...prev, index: prev.index + 1 } : null,
            )
          }
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ── Shot Card ──

function ShotCard({
  shot,
  assets,
  captures,
  onToggleHero,
  onOpenLightbox,
}: {
  shot: CineBlockShot;
  assets: CineBlockAsset[];
  captures: CaptureEntry[];
  onToggleHero: (captureId: string) => void;
  onOpenLightbox: (captures: CaptureEntry[], index: number) => void;
}) {
  const startCaptures = captures.filter((c) => c.frameType === 'start');
  const endCaptures = captures.filter((c) => c.frameType === 'end');
  const defaults = cameraTypeDefaults[shot.cameraType];

  const metaParts: string[] = [];
  const height = shot.cameraHeight ?? defaults.height;
  if (height) metaParts.push(height.replace(/_/g, ' '));
  if (shot.cameraMovement) metaParts.push(shot.cameraMovement);
  else metaParts.push('static');
  metaParts.push(`${shot.duration}s`);

  if (captures.length === 0) return null;

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold text-white">
            {shot.name || 'Untitled Shot'}
          </h3>
          <span className="px-2 py-0.5 rounded text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30">
            {shot.cameraType}
          </span>
        </div>
        <p className="text-xs text-zinc-500 capitalize">
          {metaParts.join(' \u00B7 ')}
        </p>
        {shot.action && (
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            {shot.action}
          </p>
        )}
      </div>

      {/* Frame rows */}
      <div className="px-5 pb-5 space-y-4">
        <FrameRow
          label="Start Frames"
          captures={startCaptures}
          onToggleHero={onToggleHero}
          onOpenLightbox={onOpenLightbox}
        />
        <FrameRow
          label="End Frames"
          captures={endCaptures}
          onToggleHero={onToggleHero}
          onOpenLightbox={onOpenLightbox}
        />
      </div>
    </div>
  );
}

// ── Frame Row ──

function FrameRow({
  label,
  captures,
  onToggleHero,
  onOpenLightbox,
}: {
  label: string;
  captures: CaptureEntry[];
  onToggleHero: (captureId: string) => void;
  onOpenLightbox: (captures: CaptureEntry[], index: number) => void;
}) {
  if (captures.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
          {captures.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {captures.map((cap, i) => (
          <div key={cap.id} className="relative group">
            <button
              onClick={() => onOpenLightbox(captures, i)}
              className={`block w-[120px] h-[68px] rounded-md overflow-hidden border-2 transition-colors ${
                cap.isHero
                  ? 'border-amber-500'
                  : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <img
                src={cap.dataUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
            {/* Star / hero toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleHero(cap.id);
              }}
              title={cap.isHero ? 'Hero frame' : 'Set as hero'}
              className={`absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full transition-all ${
                cap.isHero
                  ? 'bg-amber-500 text-white'
                  : 'bg-black/50 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-amber-400'
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Lightbox ──

function Lightbox({
  capture,
  shotName,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onClose,
}: {
  capture: CaptureEntry;
  shotName: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <img
          src={capture.dataUrl}
          alt="Capture"
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />

        {/* Info bar */}
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="text-white font-medium">{shotName}</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400 capitalize">
            {capture.frameType} frame
          </span>
          {capture.isHero && (
            <span className="text-amber-400 text-xs flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Hero
            </span>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-300 hover:text-white flex items-center justify-center text-lg"
        >
          &times;
        </button>

        {/* Prev/Next arrows */}
        {canPrev && (
          <button
            onClick={onPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center text-xl"
          >
            &lsaquo;
          </button>
        )}
        {canNext && (
          <button
            onClick={onNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-10 h-10 rounded-full bg-zinc-800/80 border border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center text-xl"
          >
            &rsaquo;
          </button>
        )}
      </div>
    </div>
  );
}

// ── Util ──

function downloadJson(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

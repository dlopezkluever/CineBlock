import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { useCineBlockState, useCineBlockDispatch } from '../store';
import { uploadAndGenerate, generateFromText } from '../services/marbleApi';
import type { AzimuthSlot, CineBlockShot, AspectRatioKey, InputMode, ImageDimensions } from '../types';
import { ASPECT_RATIOS } from '../types';

const ASSET_COLORS = ['#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4'];
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CAMERA_TYPES: CineBlockShot['cameraType'][] = ['Wide', 'Medium', 'Close-Up', 'OTS', 'POV', 'Two-Shot', 'Insert'];
const CAMERA_DISTANCES: NonNullable<CineBlockShot['cameraDistance']>[] = ['wide', 'medium', 'close'];
const CAMERA_HEIGHTS: NonNullable<CineBlockShot['cameraHeight']>[] = ['eye_level', 'high_angle', 'low_angle', 'overhead', 'ground_level'];

const SLOT_HINTS: Record<number, string> = {
  0: 'Eye-level hero angle',
  90: 'Side view / perpendicular',
  180: 'Opposite wall / reverse',
  270: 'Other side / window wall',
};

const MODE_TIPS: Record<InputMode, string> = {
  guided: 'Capture your room from the center, looking in each direction. Include overlapping elements between adjacent views for better spatial coherence.',
  free: 'Upload 2\u20138 photos from around the same space. More overlap = better reconstruction. Keep the same resolution and lighting.',
  text: 'Be specific: describe the room type, dimensions, key furniture, wall/floor materials, lighting, and mood.',
};

const MODEL_INFO: Record<string, { cost: string; time: string; quality: string; note: string }> = {
  'Marble 0.1-mini': { cost: '~$0.15', time: '30\u201345s', quality: 'Draft quality', note: 'Great for iteration' },
  'Marble 0.1-plus': { cost: '~$1.50', time: '5\u201310 min', quality: 'Production quality', note: 'Sharper, more faithful' },
};

// ─── Image Dimension Utilities ──────────────────────────────────────────────

function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

type ValidationStatus = 'good' | 'warning' | 'error';

interface ImageValidation {
  status: ValidationStatus;
  message?: string;
}

function validateImages(allDimensions: (ImageDimensions | undefined)[]): ImageValidation[] {
  const defined = allDimensions.filter((d): d is ImageDimensions => d !== undefined);
  if (defined.length === 0) return allDimensions.map(() => ({ status: 'good' }));

  const reference = defined[0];
  const refAspect = reference.width / reference.height;

  return allDimensions.map((dims) => {
    if (!dims) return { status: 'good' as const };

    const shortSide = Math.min(dims.width, dims.height);
    if (shortSide < 512) {
      return { status: 'error' as const, message: `Short side is ${shortSide}px (min 512px recommended)` };
    }

    const aspect = dims.width / dims.height;
    const aspectDiff = Math.abs(aspect - refAspect) / refAspect;
    if (aspectDiff > 0.02) {
      return { status: 'warning' as const, message: `Aspect ratio differs from first image (${dims.width}\u00d7${dims.height} vs ${reference.width}\u00d7${reference.height})` };
    }

    if (dims.width !== reference.width || dims.height !== reference.height) {
      return { status: 'warning' as const, message: `Resolution differs from first image (${dims.width}\u00d7${dims.height} vs ${reference.width}\u00d7${reference.height})` };
    }

    return { status: 'good' as const };
  });
}

const VALIDATION_BADGE: Record<ValidationStatus, { bg: string; text: string; icon: string }> = {
  good: { bg: 'bg-green-500', text: 'text-green-100', icon: '\u2713' },
  warning: { bg: 'bg-yellow-500', text: 'text-yellow-100', icon: '!' },
  error: { bg: 'bg-red-500', text: 'text-red-100', icon: '\u2715' },
};

// ─── Azimuth Slot ────────────────────────────────────────────────────────────

function AzimuthSlotCard({ slot, validation }: { slot: AzimuthSlot; validation?: ImageValidation }) {
  const dispatch = useCineBlockDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) return;
    const previewUrl = URL.createObjectURL(file);
    let dimensions: ImageDimensions | undefined;
    try {
      dimensions = await getImageDimensions(file);
    } catch {
      // proceed without dimensions
    }
    dispatch({ type: 'SET_AZIMUTH_SLOT', azimuth: slot.azimuth, file, previewUrl, dimensions });
  }, [dispatch, slot.azimuth]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const onClear = useCallback(() => {
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    dispatch({ type: 'CLEAR_AZIMUTH_SLOT', azimuth: slot.azimuth });
  }, [dispatch, slot.azimuth, slot.previewUrl]);

  if (slot.file && slot.previewUrl) {
    const badge = validation ? VALIDATION_BADGE[validation.status] : null;
    return (
      <div className="relative border border-zinc-600 rounded-lg overflow-hidden h-40 group">
        <img src={slot.previewUrl} alt={slot.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs text-white font-medium">
          {slot.label} ({slot.azimuth}&deg;)
        </div>
        {badge && (
          <div
            className={`absolute top-2 right-10 w-6 h-6 rounded-full ${badge.bg} ${badge.text} text-xs font-bold flex items-center justify-center`}
            title={validation?.message ?? validation?.status}
          >
            {badge.icon}
          </div>
        )}
        <button
          onClick={onClear}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          title="Remove image"
        >
          &times;
        </button>
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/40 rounded px-1.5 py-0.5">
          <span className="text-xs text-white/70 truncate">{slot.file.name}</span>
          {slot.dimensions && (
            <span className="text-xs text-white/50 shrink-0 ml-2">{slot.dimensions.width}&times;{slot.dimensions.height}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg h-40 flex flex-col items-center justify-center cursor-pointer transition-colors ${
        dragOver
          ? 'border-blue-400 bg-blue-400/10'
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500 hover:bg-zinc-800'
      }`}
    >
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={onFileChange} className="hidden" />
      <svg className="w-8 h-8 text-zinc-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
      <span className="text-sm font-medium text-zinc-300">{slot.label} ({slot.azimuth}&deg;)</span>
      <span className="text-xs text-zinc-500 mt-1">{SLOT_HINTS[slot.azimuth]}</span>
      <span className="text-xs text-zinc-600 mt-0.5">Drop image or click to browse</span>
    </div>
  );
}

// ─── Free Image Card ─────────────────────────────────────────────────────────

function FreeImageCard({ image, validation }: { image: { id: string; previewUrl: string; file: File; dimensions?: ImageDimensions }; validation?: ImageValidation }) {
  const dispatch = useCineBlockDispatch();
  const badge = validation ? VALIDATION_BADGE[validation.status] : null;
  return (
    <div className="relative border border-zinc-600 rounded-lg overflow-hidden h-32 group">
      <img src={image.previewUrl} alt={image.file.name} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      {badge && (
        <div
          className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full ${badge.bg} ${badge.text} text-xs font-bold flex items-center justify-center`}
          title={validation?.message ?? validation?.status}
        >
          {badge.icon}
        </div>
      )}
      <button
        onClick={() => {
          URL.revokeObjectURL(image.previewUrl);
          dispatch({ type: 'REMOVE_FREE_IMAGE', id: image.id });
        }}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
        title="Remove image"
      >
        &times;
      </button>
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between bg-black/40 rounded px-1.5 py-0.5">
        <span className="text-xs text-white/70 truncate">{image.file.name}</span>
        {image.dimensions && (
          <span className="text-xs text-white/50 shrink-0 ml-2">{image.dimensions.width}&times;{image.dimensions.height}</span>
        )}
      </div>
    </div>
  );
}

// ─── Free Upload Dropzone ────────────────────────────────────────────────────

function FreeUploadDropzone() {
  const dispatch = useCineBlockDispatch();
  const state = useCineBlockState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(async (files: FileList) => {
    const remaining = 8 - state.freeImages.length;
    const toAdd = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type)).slice(0, remaining);
    for (const file of toAdd) {
      let dimensions: ImageDimensions | undefined;
      try {
        dimensions = await getImageDimensions(file);
      } catch {
        // proceed without dimensions
      }
      dispatch({
        type: 'ADD_FREE_IMAGE',
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        dimensions,
      });
    }
  }, [dispatch, state.freeImages.length]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  }, [handleFiles]);

  if (state.freeImages.length >= 8) return null;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer transition-colors ${
        dragOver
          ? 'border-blue-400 bg-blue-400/10'
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500 hover:bg-zinc-800'
      }`}
    >
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={onFileChange} className="hidden" />
      <svg className="w-7 h-7 text-zinc-500 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
      <span className="text-xs text-zinc-400">Drop images or click to browse</span>
      <span className="text-xs text-zinc-600 mt-0.5">{state.freeImages.length}/8 images</span>
    </div>
  );
}

// ─── Generation Settings Panel ───────────────────────────────────────────────

function GenerationSettingsPanel() {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();
  const info = MODEL_INFO[state.generationSettings.model];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Model</label>
          <select
            value={state.generationSettings.model}
            onChange={(e) => dispatch({ type: 'SET_GENERATION_SETTINGS', settings: { model: e.target.value as 'Marble 0.1-mini' | 'Marble 0.1-plus' } })}
            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
          >
            <option value="Marble 0.1-mini">Mini (~30-45s)</option>
            <option value="Marble 0.1-plus">Plus (~5-10min)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Splat Quality</label>
          <select
            value={state.generationSettings.splatResolution}
            onChange={(e) => dispatch({ type: 'SET_GENERATION_SETTINGS', settings: { splatResolution: e.target.value as '100k' | '500k' | 'full_res' } })}
            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
          >
            <option value="100k">100k (fast)</option>
            <option value="500k">500k (balanced)</option>
            <option value="full_res">Full res (best)</option>
          </select>
        </div>
      </div>
      {info && (
        <p className="text-xs text-zinc-500">
          <span>{info.cost}</span>
          <span className="mx-1.5">&middot;</span>
          <span>{info.time}</span>
          <span className="mx-1.5">&middot;</span>
          <span>{info.quality}</span>
          <span className="mx-1.5">&middot;</span>
          <span>{info.note}</span>
        </p>
      )}
    </div>
  );
}

// ─── Advanced Settings Panel ─────────────────────────────────────────────────

function AdvancedSettingsPanel() {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();
  const [open, setOpen] = useState(false);
  const seed = state.generationSettings.seed;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Advanced
      </button>

      {open && (
        <div className="mt-2 border-l-2 border-zinc-700 pl-4 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Seed</label>
            <input
              type="number"
              min={0}
              max={4294967295}
              value={seed ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  dispatch({ type: 'SET_GENERATION_SETTINGS', settings: { seed: undefined } });
                } else {
                  const num = Math.max(0, Math.min(4294967295, Math.floor(Number(val))));
                  if (!isNaN(num)) {
                    dispatch({ type: 'SET_GENERATION_SETTINGS', settings: { seed: num } });
                  }
                }
              }}
              placeholder="Random"
              className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500 w-36"
            />
            {seed != null && (
              <button
                onClick={() => dispatch({ type: 'SET_GENERATION_SETTINGS', settings: { seed: undefined } })}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Random
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-600">Set a seed to get reproducible results. Same inputs + same seed = same world.</p>
        </div>
      )}
    </div>
  );
}

// ─── Asset Row ───────────────────────────────────────────────────────────────

function AssetRow({ asset, isReferenced }: { asset: { id: string; name: string; type: 'character' | 'prop'; description: string; color: string }; isReferenced: boolean }) {
  const dispatch = useCineBlockDispatch();

  const handleRemove = () => {
    if (isReferenced && !confirm('This asset is referenced in shots. Remove it anyway?')) return;
    dispatch({ type: 'REMOVE_ASSET', id: asset.id });
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
      {/* Color dot */}
      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: asset.color }} />

      {/* Name */}
      <input
        type="text"
        value={asset.name}
        onChange={(e) => dispatch({ type: 'UPDATE_ASSET', id: asset.id, field: 'name', value: e.target.value })}
        placeholder="Name"
        className="bg-transparent border-b border-zinc-700 focus:border-blue-500 outline-none text-sm text-white w-28 py-0.5"
      />

      {/* Type */}
      <select
        value={asset.type}
        onChange={(e) => dispatch({ type: 'UPDATE_ASSET', id: asset.id, field: 'type', value: e.target.value })}
        className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1 outline-none focus:border-blue-500"
      >
        <option value="character">Character</option>
        <option value="prop">Prop</option>
      </select>

      {/* Description */}
      <input
        type="text"
        value={asset.description}
        onChange={(e) => dispatch({ type: 'UPDATE_ASSET', id: asset.id, field: 'description', value: e.target.value })}
        placeholder="Description"
        className="bg-transparent border-b border-zinc-700 focus:border-blue-500 outline-none text-sm text-zinc-400 flex-1 py-0.5"
      />

      {/* Trash */}
      <button onClick={handleRemove} className="text-zinc-600 hover:text-red-400 transition-colors shrink-0" title="Remove asset">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  );
}

// ─── Shot Card ───────────────────────────────────────────────────────────────

function ShotCard({ shot, index, assets }: {
  shot: CineBlockShot;
  index: number;
  assets: { id: string; name: string; color: string }[];
}) {
  const dispatch = useCineBlockDispatch();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const toggleAsset = (assetId: string) => {
    const current = shot.assetIds;
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId];
    dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'assetIds', value: next });
  };

  return (
    <div className="border border-zinc-700 rounded-lg bg-zinc-800/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/80 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-mono">#{index + 1}</span>
          <input
            type="text"
            value={shot.name}
            onChange={(e) => dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'name', value: e.target.value })}
            placeholder="Shot name"
            className="bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm text-white font-medium w-32"
          />
        </div>
        <button
          onClick={() => dispatch({ type: 'REMOVE_SHOT', id: shot.id })}
          className="text-zinc-600 hover:text-red-400 transition-colors"
          title="Remove shot"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Camera type */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 w-16 shrink-0">Camera</label>
          <select
            value={shot.cameraType}
            onChange={(e) => dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'cameraType', value: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
          >
            {CAMERA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Action */}
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Action / Description</label>
          <textarea
            value={shot.action}
            onChange={(e) => dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'action', value: e.target.value })}
            placeholder="What happens in this shot…"
            rows={2}
            className="w-full bg-zinc-900/50 border border-zinc-700 rounded text-sm text-zinc-300 px-3 py-2 outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Asset checkboxes */}
        {assets.length > 0 && (
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Assets in shot</label>
            <div className="flex flex-wrap gap-2">
              {assets.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={shot.assetIds.includes(a.id)}
                    onChange={() => toggleAsset(a.id)}
                    className="accent-blue-500 w-3.5 h-3.5"
                  />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-200">{a.name || 'Unnamed'}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible details */}
        <div>
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${detailsOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            Details
          </button>

          {detailsOpen && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              {/* Duration */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Duration (s)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={shot.duration}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'duration', value: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                  className="w-full bg-zinc-900/50 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
                />
              </div>

              {/* Camera distance */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Camera distance</label>
                <select
                  value={shot.cameraDistance ?? ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'cameraDistance', value: e.target.value || undefined })}
                  className="w-full bg-zinc-900/50 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
                >
                  <option value="">—</option>
                  {CAMERA_DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Camera height */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Camera height</label>
                <select
                  value={shot.cameraHeight ?? ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'cameraHeight', value: e.target.value || undefined })}
                  className="w-full bg-zinc-900/50 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
                >
                  <option value="">—</option>
                  {CAMERA_HEIGHTS.map((h) => <option key={h} value={h}>{h.replace(/_/g, ' ')}</option>)}
                </select>
              </div>

              {/* Camera movement */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Camera movement</label>
                <input
                  type="text"
                  value={shot.cameraMovement ?? ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOT', id: shot.id, field: 'cameraMovement', value: e.target.value || undefined })}
                  placeholder="e.g. slow dolly in"
                  className="w-full bg-zinc-900/50 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Loading Overlay ─────────────────────────────────────────────────────────

function LoadingOverlay({ message, model }: { message: string; model?: string }) {
  const isPlus = model === 'Marble 0.1-plus';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 bg-zinc-900 border border-zinc-700 rounded-xl px-10 py-8 shadow-2xl">
        {/* Spinner */}
        <svg className="animate-spin w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-zinc-200 font-medium">{message}</p>
        <p className="text-xs text-zinc-500">
          {isPlus ? 'This may take 5\u201310 minutes (Plus model)' : 'This may take 30\u201345 seconds'}
        </p>
      </div>
    </div>
  );
}

// ─── Main SetupView ──────────────────────────────────────────────────────────

export default function SetupView({ onNavigate }: { onNavigate: (view: 'studio') => void }) {
  const state = useCineBlockState();
  const dispatch = useCineBlockDispatch();

  const filledSlots = state.locationImages.filter((s) => s.file !== null).length;
  const hasShot = state.shots.some((s) => s.name.trim() !== '');
  const isLoading = ['uploading', 'generating', 'polling'].includes(state.worldStatus);

  const canProceed = hasShot && (() => {
    switch (state.inputMode) {
      case 'guided': return filledSlots >= 2;
      case 'free': return state.freeImages.length >= 2;
      case 'text': return state.sceneDescription.trim().length > 0;
    }
  })();

  // Compute image validations
  const imageValidations: ImageValidation[] = (() => {
    switch (state.inputMode) {
      case 'guided': {
        const filledImages = state.locationImages.filter((s) => s.file !== null);
        const dims = filledImages.map((s) => s.dimensions);
        return validateImages(dims);
      }
      case 'free': {
        const dims = state.freeImages.map((img) => img.dimensions);
        return validateImages(dims);
      }
      default:
        return [];
    }
  })();

  const isPlus = state.generationSettings.model === 'Marble 0.1-plus';
  const statusMessages: Record<string, string> = {
    uploading: 'Uploading images\u2026',
    generating: isPlus ? 'Building your set (~5-10min, Plus model)\u2026' : 'Building your set (~30-45s)\u2026',
    polling: 'Waiting for world generation\u2026',
  };

  const INPUT_MODES: { key: InputMode; label: string }[] = [
    { key: 'guided', label: '4 Directions' },
    { key: 'free', label: 'Free Upload' },
    { key: 'text', label: 'Text Only' },
  ];

  function addAsset() {
    const colorIndex = state.assets.length % ASSET_COLORS.length;
    dispatch({
      type: 'ADD_ASSET',
      id: crypto.randomUUID(),
      name: '',
      assetType: 'character',
      description: '',
      color: ASSET_COLORS[colorIndex],
    });
  }

  function addShot() {
    dispatch({
      type: 'ADD_SHOT',
      id: crypto.randomUUID(),
      name: `Shot ${state.shots.length + 1}`,
    });
  }

  async function handleGenerate() {
    const { model, seed } = state.generationSettings;
    const textPrompt = state.sceneDescription.trim() || undefined;

    const callbacks = {
      onUploading: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'uploading' }),
      onGenerating: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'generating' }),
      onPolling: () => dispatch({ type: 'SET_WORLD_STATUS', status: 'polling' }),
    };

    try {
      let world;

      switch (state.inputMode) {
        case 'text': {
          if (!textPrompt) return;
          world = await generateFromText(textPrompt, callbacks, { model, seed });
          break;
        }
        case 'free': {
          if (state.freeImages.length < 2) return;
          const freeSlots = state.freeImages.map((img) => ({ file: img.file, azimuth: null as number | null }));
          world = await uploadAndGenerate(freeSlots, callbacks, {
            model,
            seed,
            reconstructImages: true,
            textPrompt,
          });
          break;
        }
        case 'guided':
        default: {
          const slotsWithFiles = state.locationImages
            .filter((s): s is typeof s & { file: File } => s.file !== null)
            .map((s) => ({ file: s.file, azimuth: s.azimuth as number | null }));
          if (slotsWithFiles.length < 2) return;
          world = await uploadAndGenerate(slotsWithFiles, callbacks, { model, seed, textPrompt });
          break;
        }
      }

      const resolution = state.generationSettings.splatResolution;
      const spzUrl = world.assets.splats.spz_urls[resolution]
        ?? world.assets.splats.spz_urls['500k'];

      dispatch({
        type: 'SET_WORLD_DATA',
        worldId: world.world_id,
        spzUrl,
        colliderUrl: world.assets.mesh.collider_mesh_url,
      });
      onNavigate('studio');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      dispatch({ type: 'SET_WORLD_STATUS', status: 'error', error: message });
    }
  }

  // Check which assets are referenced by shots (for removal confirmation)
  const referencedAssetIds = new Set(state.shots.flatMap((s) => s.assetIds));

  // Build a mapping from filled guided slots to their validation index
  let guidedValidationIndex = 0;

  return (
    <>
      {isLoading && <LoadingOverlay message={statusMessages[state.worldStatus] ?? 'Processing\u2026'} model={state.generationSettings.model} />}

      <div className="max-w-4xl mx-auto p-8 space-y-10">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Setup</h2>
          <p className="text-zinc-400 text-sm">
            Upload location images, define assets, and build your shot list.
          </p>
        </div>

        {/* ── Section A — World Input ─────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold text-zinc-200">A. World Input</h3>
            {state.inputMode === 'guided' && (
              <span className={`text-xs font-medium ${filledSlots >= 2 ? 'text-green-400' : 'text-zinc-500'}`}>
                {filledSlots}/4 slots filled {filledSlots < 2 && '(min 2)'}
              </span>
            )}
            {state.inputMode === 'free' && (
              <span className={`text-xs font-medium ${state.freeImages.length >= 2 ? 'text-green-400' : 'text-zinc-500'}`}>
                {state.freeImages.length}/8 images {state.freeImages.length < 2 && '(min 2)'}
              </span>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg bg-zinc-800/80 border border-zinc-700 p-1 gap-1">
            {INPUT_MODES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => dispatch({ type: 'SET_INPUT_MODE', mode: key })}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                  state.inputMode === key
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Contextual tip banner */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-blue-300/80 leading-relaxed">{MODE_TIPS[state.inputMode]}</p>
          </div>

          {/* Guided mode */}
          {state.inputMode === 'guided' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {state.locationImages.map((slot) => {
                  let validation: ImageValidation | undefined;
                  if (slot.file) {
                    validation = imageValidations[guidedValidationIndex];
                    guidedValidationIndex++;
                  }
                  return <AzimuthSlotCard key={slot.azimuth} slot={slot} validation={validation} />;
                })}
              </div>
            </div>
          )}

          {/* Free upload mode */}
          {state.inputMode === 'free' && (
            <div className="space-y-3">
              {state.freeImages.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {state.freeImages.map((img, i) => (
                    <FreeImageCard key={img.id} image={img} validation={imageValidations[i]} />
                  ))}
                </div>
              )}
              <FreeUploadDropzone />
            </div>
          )}

          {/* Text-only mode — no extra content needed, tip banner covers it */}
          {state.inputMode === 'text' && <div />}

          {/* Scene description (all modes) */}
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">
              Scene description {state.inputMode === 'text' ? '(required)' : '(optional)'}
            </label>
            <textarea
              value={state.sceneDescription}
              onChange={(e) => dispatch({ type: 'SET_SCENE_DESCRIPTION', description: e.target.value })}
              placeholder="Describe the scene you want to create…"
              maxLength={2000}
              rows={state.inputMode === 'text' ? 4 : 2}
              className="w-full bg-zinc-900/50 border border-zinc-700 rounded-lg text-sm text-zinc-300 px-3 py-2 outline-none focus:border-blue-500 resize-none"
            />
            {state.inputMode === 'text' && (
              <p className="text-xs text-zinc-600 text-right mt-0.5">{state.sceneDescription.length}/2000</p>
            )}
          </div>

          {/* Generation settings */}
          <GenerationSettingsPanel />
          <AdvancedSettingsPanel />
        </section>

        {/* ── Section B — Scene Assets ───────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold text-zinc-200">B. Scene Assets</h3>
            <span className="text-xs text-zinc-500">{state.assets.length} asset{state.assets.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-sm text-zinc-500">Characters and props that appear in your scene.</p>

          {state.assets.length > 0 && (
            <div className="space-y-2">
              {state.assets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  isReferenced={referencedAssetIds.has(asset.id)}
                />
              ))}
            </div>
          )}

          <button
            onClick={addAsset}
            className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Asset
          </button>
        </section>

        {/* ── Section C — Shot List ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold text-zinc-200">C. Shot List</h3>
            <span className="text-xs text-zinc-500">{state.shots.length} shot{state.shots.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-sm text-zinc-500">Define your shots with camera type, action, and which assets appear.</p>

          {state.shots.length > 0 && (
            <div className="space-y-4">
              {state.shots.map((shot, i) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  index={i}
                  assets={state.assets.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
                />
              ))}
            </div>
          )}

          <button
            onClick={addShot}
            className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Shot
          </button>
        </section>

        {/* ── Section D — Aspect Ratio ─────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-zinc-200">D. Aspect Ratio</h3>
          <p className="text-sm text-zinc-500">Choose the framing format for your viewfinder.</p>
          <div className="flex gap-3">
            {(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).map((key) => (
              <button
                key={key}
                onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', aspectRatio: key })}
                className={`flex flex-col items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                  state.aspectRatio === key
                    ? 'bg-blue-600/20 border-blue-500/50 text-white'
                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                <div
                  className={`rounded-sm ${
                    state.aspectRatio === key
                      ? 'bg-blue-400/60 border border-blue-400/80'
                      : 'bg-zinc-600/40 border border-zinc-600'
                  }`}
                  style={{
                    aspectRatio: `${ASPECT_RATIOS[key]}`,
                    ...(ASPECT_RATIOS[key] >= 1
                      ? { width: '48px' }
                      : { height: '48px' }),
                  }}
                />
                <span className="text-xs font-mono">{key}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Error display ──────────────────────────────────────────────── */}
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

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <div className="pt-2 pb-8">
          <button
            disabled={!canProceed || isLoading}
            onClick={handleGenerate}
            className="w-full py-3.5 rounded-lg font-semibold text-sm transition-colors
              disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
              bg-blue-600 hover:bg-blue-500 text-white"
            title={!canProceed ? (() => {
              const parts: string[] = [];
              if (!hasShot) parts.push('at least 1 named shot');
              if (state.inputMode === 'guided' && filledSlots < 2) parts.push('at least 2 images');
              if (state.inputMode === 'free' && state.freeImages.length < 2) parts.push('at least 2 images');
              if (state.inputMode === 'text' && !state.sceneDescription.trim()) parts.push('a scene description');
              return `Need ${parts.join(' and ')}`;
            })() : undefined}
          >
            Generate World &amp; Enter Studio
          </button>
          {!canProceed && !isLoading && (
            <p className="text-xs text-zinc-500 mt-2 text-center">
              {state.inputMode === 'guided' && filledSlots < 2 && 'Upload at least 2 location images. '}
              {state.inputMode === 'free' && state.freeImages.length < 2 && 'Upload at least 2 images. '}
              {state.inputMode === 'text' && !state.sceneDescription.trim() && 'Enter a scene description. '}
              {!hasShot && 'Define at least 1 shot with a name.'}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

import type { CineBlockAsset, CineBlockShot } from '../types';

export function composeScenePrompt(assets: CineBlockAsset[], shots: CineBlockShot[]): string {
  const parts: string[] = [];

  const namedAssets = assets.filter((a) => a.name.trim());
  if (namedAssets.length > 0) {
    const assetDescs = namedAssets.map((a) => {
      const desc = a.description.trim();
      return desc ? `${a.name} (${a.type}: ${desc})` : `${a.name} (${a.type})`;
    });
    parts.push(`An interior space containing: ${assetDescs.join(', ')}.`);
  }

  const namedShots = shots.filter((s) => s.name.trim());
  if (namedShots.length > 0) {
    const shotDescs = namedShots.map((s) => {
      const action = s.action.trim();
      return action
        ? `${s.name} - ${action} (${s.cameraType})`
        : `${s.name} (${s.cameraType})`;
    });
    parts.push(`The scene involves: ${shotDescs.join('; ')}.`);
  }

  return parts.join(' ');
}

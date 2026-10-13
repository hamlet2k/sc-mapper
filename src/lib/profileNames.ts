import type { Persisted } from './storage';

/** Empty names cannot replace a profile's existing name. */
export const trimProfileName = (name: string): string | null => name.trim() || null;

/** Preserve the importer's naming rules, with a useful fallback for an empty filename. */
export function defaultImportName(fileName: string, profileName = ''): string {
  const label = trimProfileName(profileName);
  if (label && label.toLowerCase() !== 'default') return label;
  const base = fileName.trim().replace(/\.xml$/i, '').trim();
  return /^actionmaps$/i.test(base) ? 'My bindings (actionmaps.xml)' : base || 'My bindings';
}

/** Immutable store update: names never change the profile id, bindings, or slot assignments. */
export function renameProfile(store: Persisted, id: string, name: string): Persisted {
  const trimmed = trimProfileName(name);
  if (!trimmed || !store.profiles.some((p) => p.id === id && p.name !== trimmed)) return store;
  return { ...store, profiles: store.profiles.map((p) => p.id === id ? { ...p, name: trimmed } : p) };
}

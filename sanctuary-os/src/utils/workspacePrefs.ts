import { isDesktop } from './envUtils';
import { useStore } from '../store';

export const PINNED_WORKSPACES_KEY = 'sanctuary_pinned_workspaces';
export const RECENT_WORKSPACES_KEY = 'sanctuary_workspace_recent_timestamps';
export const WORKSPACE_PREFS_EVENT = 'sanctuary-workspace-pins-updated';

export function getCanonicalWorkspaceKey(item: any): string {
  if (!item) return '';
  if (typeof item === 'string') return item.trim().toLowerCase();
  const raw =
    item.schema_id ||
    item.workspace?.schema_id ||
    item.game?.schema_id ||
    item.id ||
    item.workspace?.id ||
    item.game?.id ||
    '';
  return String(raw).trim().toLowerCase();
}

export function getCandidateWorkspaceKeys(item: any): string[] {
  if (!item) return [];
  if (typeof item === 'string') {
    const clean = item.trim().toLowerCase();
    return clean ? [clean] : [];
  }
  const set = new Set<string>();
  const add = (val: any) => {
    if (val !== undefined && val !== null) {
      const clean = String(val).trim().toLowerCase();
      if (clean) set.add(clean);
    }
  };
  add(item.schema_id);
  add(item.id);
  add(item.game_id);
  add(item.workspace?.schema_id);
  add(item.workspace?.id);
  add(item.game?.schema_id);
  add(item.game?.id);
  return Array.from(set);
}

export function getPinnedWorkspaceIds(defaultSeedIds?: string[]): string[] {
  try {
    const raw = localStorage.getItem(PINNED_WORKSPACES_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed
              .map((id) => String(id || '').trim().toLowerCase())
              .filter(Boolean)
          )
        );
      }
    }
    if (defaultSeedIds && defaultSeedIds.length > 0) {
      const cleanSeed = Array.from(
        new Set(
          defaultSeedIds
            .map((id) => String(id || '').trim().toLowerCase())
            .filter(Boolean)
        )
      );
      if (cleanSeed.length > 0) {
        localStorage.setItem(PINNED_WORKSPACES_KEY, JSON.stringify(cleanSeed));
        return cleanSeed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function isWorkspacePinned(item: any, pinnedIds: string[]): boolean {
  if (!pinnedIds || pinnedIds.length === 0) return false;
  const normalizedPins = new Set(
    pinnedIds.map((p) => String(p || '').trim().toLowerCase())
  );
  const candidates = getCandidateWorkspaceKeys(item);
  return candidates.some((key) => normalizedPins.has(key));
}

export function togglePinnedWorkspace(
  item: any,
  currentPins?: string[]
): string[] {
  const pins = (currentPins ?? getPinnedWorkspaceIds()).map((p) =>
    String(p || '').trim().toLowerCase()
  );
  const candidates = getCandidateWorkspaceKeys(item);
  const canonical = getCanonicalWorkspaceKey(item);
  if (!canonical) return pins;

  const currentlyPinned = candidates.some((k) => pins.includes(k));
  let nextPins: string[];
  if (currentlyPinned) {
    nextPins = pins.filter((p) => !candidates.includes(p));
  } else {
    nextPins = Array.from(new Set([...pins, canonical]));
  }

  try {
    localStorage.setItem(PINNED_WORKSPACES_KEY, JSON.stringify(nextPins));
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_PREFS_EVENT, { detail: { pinnedIds: nextPins } })
    );
  } catch {
    // ignore storage errors
  }
  return nextPins;
}

export function getWorkspaceRecentTimestamps(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RECENT_WORKSPACES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return {};
}

export function recordWorkspaceLoaded(itemOrId: any): Record<string, number> {
  const map = { ...getWorkspaceRecentTimestamps() };
  const candidates = getCandidateWorkspaceKeys(itemOrId);
  const canonical = getCanonicalWorkspaceKey(itemOrId);
  const now = Date.now();
  if (canonical) {
    map[canonical] = now;
  }
  for (const key of candidates) {
    map[key] = now;
  }
  try {
    localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_PREFS_EVENT, { detail: { recentTimestamps: map } })
    );
  } catch {
    // ignore
  }
  return map;
}

export function getWorkspaceLastLoadedAt(
  item: any,
  timestamps: Record<string, number>,
  activeWorkspaceId?: string | null
): number {
  const candidates = getCandidateWorkspaceKeys(item);
  let best = 0;
  for (const key of candidates) {
    const ts = Number(timestamps?.[key] || 0);
    if (ts > best) best = ts;
  }
  if (
    activeWorkspaceId &&
    candidates.includes(String(activeWorkspaceId).trim().toLowerCase())
  ) {
    // Active workspace is guaranteed to have at least a baseline recent timestamp
    best = Math.max(best, 1);
  }
  return best;
}

export function isWorkspaceSetupConfigured(
  item: any,
  workspaces: any[] = [],
  activeWorkspaceId?: string | null
): boolean {
  const game = item?.game || item;
  const ws = item?.workspace;
  if (game && game.is_active === false) {
    return false;
  }

  const candidates = getCandidateWorkspaceKeys(item);
  const matchedWs =
    ws ||
    (workspaces || []).find((w: any) => {
      const wKeys = getCandidateWorkspaceKeys(w);
      return wKeys.some((k) => candidates.includes(k));
    });

  if (isDesktop()) {
    const hasConfiguredPaths = Boolean(
      (typeof matchedWs?.mods_path === 'string' &&
        matchedWs.mods_path.trim().length > 0) ||
        (typeof matchedWs?.live_path === 'string' &&
          matchedWs.live_path.trim().length > 0)
    );
    if (hasConfiguredPaths) return true;

    const isCurrentlyActive = Boolean(
      activeWorkspaceId &&
        candidates.includes(String(activeWorkspaceId).trim().toLowerCase())
    );
    if (isCurrentlyActive) {
      const storeState = useStore.getState();
      if (
        storeState.isConfigured &&
        Boolean(
          storeState.modsPath?.trim() ||
            storeState.livePath?.trim() ||
            matchedWs?.vault_path?.trim()
        )
      ) {
        return true;
      }
    }
    return false;
  }

  // Web / PWA: workspace is active/setup if it has a live Supabase endpoint or is the primary Sims 4 workspace
  const url = String(
    game?.supabase_url || matchedWs?.supabase_url || ''
  ).trim();
  const anonKey = String(
    game?.supabase_anon_key || matchedWs?.supabase_anon_key || ''
  ).trim();
  if (/^https?:\/\//i.test(url) && anonKey.length > 0) {
    return true;
  }
  if (candidates.includes('sims4')) {
    return true;
  }
  return false;
}

export function sortWorkspacesList(
  list: any[],
  options: {
    pinnedIds: string[];
    recentTimestamps: Record<string, number>;
    workspaces?: any[];
    activeWorkspaceId?: string | null;
    sortBy?: 'recent' | 'name';
    prioritizePinned?: boolean;
  }
): any[] {
  const {
    pinnedIds,
    recentTimestamps,
    workspaces = [],
    activeWorkspaceId,
    sortBy = 'recent',
    prioritizePinned = true,
  } = options;

  return [...list].sort((a, b) => {
    if (prioritizePinned) {
      const aPinned = isWorkspacePinned(a, pinnedIds) ? 1 : 0;
      const bPinned = isWorkspacePinned(b, pinnedIds) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
    }

    const aSetup = isWorkspaceSetupConfigured(a, workspaces, activeWorkspaceId)
      ? 1
      : 0;
    const bSetup = isWorkspaceSetupConfigured(b, workspaces, activeWorkspaceId)
      ? 1
      : 0;
    if (aSetup !== bSetup) return bSetup - aSetup;

    if (sortBy === 'recent') {
      const aRecent = getWorkspaceLastLoadedAt(
        a,
        recentTimestamps,
        activeWorkspaceId
      );
      const bRecent = getWorkspaceLastLoadedAt(
        b,
        recentTimestamps,
        activeWorkspaceId
      );
      if (aRecent !== bRecent) return bRecent - aRecent;

      const aActive =
        activeWorkspaceId &&
        getCandidateWorkspaceKeys(a).includes(
          String(activeWorkspaceId).trim().toLowerCase()
        )
          ? 1
          : 0;
      const bActive =
        activeWorkspaceId &&
        getCandidateWorkspaceKeys(b).includes(
          String(activeWorkspaceId).trim().toLowerCase()
        )
          ? 1
          : 0;
      if (aActive !== bActive) return bActive - aActive;
    }

    const aName = String(
      a?.game?.name || a?.name || a?.workspace?.name || a?.schema_id || a?.id || ''
    );
    const bName = String(
      b?.game?.name || b?.name || b?.workspace?.name || b?.schema_id || b?.id || ''
    );
    return aName.localeCompare(bName);
  });
}


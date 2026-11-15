import { getBundledSchema } from "./bundledSchemas";
import { resolvePresetForGameId } from "./gameArchitecturePresets";

const PLACEHOLDER_KEYS = new Set([
  "",
  "default",
  "default_schema",
  "default_workspace",
  "web",
]);

export function isPlaceholderWorkspaceKey(val?: string | null): boolean {
  const clean = String(val || "").trim().toLowerCase();
  return PLACEHOLDER_KEYS.has(clean);
}

const isNonEmptyLocalPath = (val: unknown): boolean => {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "web";
};

export function isWorkspaceRecordConfigured(
  ws: any,
  fallbackMasterVault?: string
): boolean {
  if (!ws || typeof ws !== "object") return false;
  const hasLive = isNonEmptyLocalPath(ws.live_path);
  const hasMods = isNonEmptyLocalPath(ws.mods_path);
  const hasVault =
    isNonEmptyLocalPath(ws.vault_path) ||
    isNonEmptyLocalPath(ws.master_vault_path) ||
    isNonEmptyLocalPath(fallbackMasterVault);
  return hasLive && hasMods && hasVault;
}

export function extractNonPlaceholderWorkspaceKeys(target: any): string[] {
  if (!target) return [];
  const rawList =
    typeof target === "string"
      ? [target]
      : [target?.schema_id, target?.id, target?.game_id];
  const keys: string[] = [];
  for (const item of rawList) {
    const clean = String(item || "").trim().toLowerCase();
    if (clean && !isPlaceholderWorkspaceKey(clean) && !keys.includes(clean)) {
      keys.push(clean);
    }
  }
  return keys;
}

export function findMatchingWorkspaceEntry(
  target: any,
  workspaces: any[] = []
): any | undefined {
  if (!target || !Array.isArray(workspaces) || workspaces.length === 0) {
    return undefined;
  }
  const targetKeys = extractNonPlaceholderWorkspaceKeys(target);
  if (targetKeys.length === 0) return undefined;

  const matches = workspaces.filter((w: any) => {
    const wKeys = extractNonPlaceholderWorkspaceKeys(w);
    return wKeys.some((k) => targetKeys.includes(k));
  });
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  return (
    matches.find((m: any) => isWorkspaceRecordConfigured(m)) ||
    matches.find((m: any) => isNonEmptyLocalPath(m?.mods_path) || isNonEmptyLocalPath(m?.live_path)) ||
    matches[0]
  );
}

function splitPathSegments(rawPath?: string | null): string[] {
  if (typeof rawPath !== "string") return [];
  return rawPath
    .split(/[\\/]+/)
    .map((seg) => seg.trim().toLowerCase())
    .filter((seg) => seg.length > 0 && !/^[a-z]:$/.test(seg));
}

function extractLeafFolder(rawPath?: string | null): string {
  const segs = splitPathSegments(rawPath);
  return segs.length > 0 ? segs[segs.length - 1] : "";
}

function loadSchemaForGameMatch(game: any): Record<string, any> | null {
  const candidates = [game?.schema_id, game?.id, game?.game_id]
    .map((v) => String(v || "").trim())
    .filter((v) => v && !isPlaceholderWorkspaceKey(v));

  if (typeof localStorage !== "undefined") {
    for (const cand of candidates) {
      for (const variant of [cand, cand.toLowerCase(), cand.toUpperCase()]) {
        try {
          const cached = localStorage.getItem(`sanctuary_master_schema_${variant}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === "object") return parsed;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  for (const cand of candidates) {
    const bundled = getBundledSchema(cand);
    if (bundled) return bundled;
  }

  for (const cand of candidates) {
    const preset = resolvePresetForGameId(cand);
    if (preset && !isPlaceholderWorkspaceKey(preset.id) && preset.id !== "universal") {
      return preset;
    }
  }

  return null;
}

function doesLegacyWorkspaceMatchGame(
  ws: any,
  game: any,
  activeSchemaHint?: any
): boolean {
  const gameKeys = extractNonPlaceholderWorkspaceKeys(game);
  const vaultTail = extractLeafFolder(ws?.vault_path);
  if (vaultTail && gameKeys.includes(vaultTail)) {
    return true;
  }

  const wsSegments = new Set<string>([
    ...splitPathSegments(ws?.live_path),
    ...splitPathSegments(ws?.mods_path),
    ...splitPathSegments(ws?.docs_path),
    ...splitPathSegments(ws?.user_data_path),
  ]);
  if (wsSegments.size === 0) return false;

  const schema = loadSchemaForGameMatch(game);
  const signatureNames = new Set<string>();

  const addName = (val?: unknown) => {
    if (typeof val !== "string") return;
    const clean = val.trim().toLowerCase();
    if (clean && clean !== "bin" && clean !== "game" && clean !== "mods" && clean !== "data") {
      signatureNames.add(clean);
    }
  };

  addName(game?.name);
  addName(schema?.display_name);
  addName(schema?.name);

  const userDataFolderNames = schema?.paths?.user_data_folder_names;
  if (Array.isArray(userDataFolderNames)) {
    userDataFolderNames.forEach(addName);
  }

  for (const key of [
    "user_data_dir_windows",
    "user_data_dir_mac",
    "user_data_dir_linux",
  ]) {
    addName(extractLeafFolder(schema?.paths?.[key]));
  }

  for (const scanKey of [
    "auto_scan_paths_windows",
    "auto_scan_paths_mac",
    "auto_scan_paths_linux",
  ]) {
    const scanList = schema?.paths?.[scanKey];
    if (Array.isArray(scanList)) {
      for (const scanPath of scanList) {
        addName(extractLeafFolder(scanPath));
      }
    }
  }

  for (const sig of signatureNames) {
    if (wsSegments.has(sig)) {
      return true;
    }
  }

  if (activeSchemaHint && typeof activeSchemaHint === "object") {
    const hintKeys = extractNonPlaceholderWorkspaceKeys(activeSchemaHint);
    if (hintKeys.some((k) => gameKeys.includes(k))) {
      const hintDisplay = String(
        activeSchemaHint.display_name || activeSchemaHint.name || ""
      )
        .trim()
        .toLowerCase();
      if (hintDisplay && wsSegments.has(hintDisplay)) {
        return true;
      }
    }
  }

  return false;
}

export function healAndMatchLocalWorkspaces(
  games: any[],
  localWorkspaces: any[] = [],
  activeSchemaHint?: any
): { healedWorkspaces: any[]; changed: boolean } {
  if (!Array.isArray(localWorkspaces) || localWorkspaces.length === 0) {
    return { healedWorkspaces: [], changed: false };
  }
  if (!Array.isArray(games) || games.length === 0) {
    return {
      healedWorkspaces: localWorkspaces.map((w) => (w ? { ...w } : w)),
      changed: false,
    };
  }

  const healedWorkspaces = localWorkspaces.map((w) => (w ? { ...w } : w));
  let changed = false;

  const claimedWsIndices = new Set<number>();
  const claimedGameIndices = new Set<number>();

  // Pass 1: Direct case-insensitive matching across id / schema_id / game_id
  games.forEach((g: any, gIdx: number) => {
    const gameKeys = extractNonPlaceholderWorkspaceKeys(g);
    if (gameKeys.length === 0) return;

    healedWorkspaces.forEach((w: any, wIdx: number) => {
      if (!w || claimedWsIndices.has(wIdx)) return;
      const wsKeys = extractNonPlaceholderWorkspaceKeys(w);
      if (wsKeys.some((k) => gameKeys.includes(k))) {
        claimedWsIndices.add(wIdx);
        claimedGameIndices.add(gIdx);

        const targetSchemaId = g.schema_id || g.id;
        if (isPlaceholderWorkspaceKey(w.id) && targetSchemaId) {
          w.id = targetSchemaId;
          changed = true;
        }
        if (isPlaceholderWorkspaceKey(w.schema_id) && targetSchemaId) {
          w.schema_id = targetSchemaId;
          changed = true;
        }
        if (
          g.name &&
          (!w.name ||
            w.name === "Default Game" ||
            isPlaceholderWorkspaceKey(w.name))
        ) {
          w.name = g.name;
          changed = true;
        }
      }
    });
  });

  // Pass 2: Schema-driven healing for unclaimed configured legacy placeholder entries
  const legacyCandidateIndices: number[] = [];
  healedWorkspaces.forEach((w: any, wIdx: number) => {
    if (!w || claimedWsIndices.has(wIdx)) return;
    const hasConfiguredActivity =
      isNonEmptyLocalPath(w.live_path) || isNonEmptyLocalPath(w.mods_path);
    if (
      hasConfiguredActivity &&
      isPlaceholderWorkspaceKey(w.id) &&
      isPlaceholderWorkspaceKey(w.schema_id)
    ) {
      legacyCandidateIndices.push(wIdx);
    }
  });

  const unclaimedGameIndices = games
    .map((_, idx) => idx)
    .filter((idx) => !claimedGameIndices.has(idx));

  for (const wIdx of legacyCandidateIndices) {
    const w = healedWorkspaces[wIdx];
    let matchedGIdx = unclaimedGameIndices.find(
      (gIdx) =>
        !claimedGameIndices.has(gIdx) &&
        doesLegacyWorkspaceMatchGame(w, games[gIdx], activeSchemaHint)
    );

    if (matchedGIdx === undefined && legacyCandidateIndices.length === 1) {
      const unclaimedPublic = unclaimedGameIndices.filter(
        (gIdx) =>
          !claimedGameIndices.has(gIdx) && games[gIdx]?.is_keepers_only !== true
      );
      if (unclaimedPublic.length === 1) {
        matchedGIdx = unclaimedPublic[0];
      }
    }

    if (matchedGIdx !== undefined) {
      const g = games[matchedGIdx];
      const canonicalId = g.schema_id || g.id;
      const nextWs: Record<string, any> = {
        ...w,
        id: canonicalId,
        schema_id: canonicalId,
        name:
          !w.name ||
          w.name === "Default Game" ||
          isPlaceholderWorkspaceKey(w.name)
            ? g.name
            : w.name,
      };
      if (
        isNonEmptyLocalPath(nextWs.master_vault_path) &&
        extractLeafFolder(nextWs.vault_path) &&
        isPlaceholderWorkspaceKey(extractLeafFolder(nextWs.vault_path))
      ) {
        const mv = String(nextWs.master_vault_path).trim().replace(/[\\/]+$/, "");
        const sep = mv.includes("/") && !mv.includes("\\") ? "/" : "\\";
        nextWs.vault_path = `${mv}${sep}${canonicalId}`;
      }
      healedWorkspaces[wIdx] = nextWs;
      claimedWsIndices.add(wIdx);
      claimedGameIndices.add(matchedGIdx);
      changed = true;
    }
  }

  return { healedWorkspaces, changed };
}


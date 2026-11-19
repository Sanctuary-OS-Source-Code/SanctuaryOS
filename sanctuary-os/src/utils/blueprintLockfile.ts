export interface LockfileConfigDelta {
  rel_path: string;
  sha256: string;
  content: string;
}

export interface ModLockfileVaultEntry {
  fomod_wizard_kind?: string;
  fomod_selections?: string[];
  hidden_files?: string[];
}

export interface BlueprintVaultLockState {
  mod_entries: Record<string, ModLockfileVaultEntry>;
  config_deltas: LockfileConfigDelta[];
}

export interface LockfileArtifactEntry {
  id: string;
  name: string;
  sha256?: string;
  version?: string;
  download_url?: string;
  manifest_url?: string;
  url?: string;
  author?: string;
  channel?: string;
  fomod_selections?: string[];
  hidden_files?: string[];
  is_paid?: boolean;
  is_early_access?: boolean;
}

export interface HydrationLockItem {
  id: string;
  name: string;
  download_url: string;
  fallback_url?: string | null;
  expected_sha256?: string | null;
  target_folder?: string | null;
  force_replace?: boolean | null;
  fomod_selections?: string[] | null;
  hidden_files?: string[] | null;
}

export type MasonReleaseChannel = "stable" | "beta" | "alpha";

export interface PatchCompatibilityEntry {
  game_version_range: string;
  channel: MasonReleaseChannel;
  min_mod_version: string;
  status: "compatible" | "untested" | "incompatible";
}

export function normalizeReleaseChannel(raw?: string | null): MasonReleaseChannel {
  const clean = String(raw || "").trim().toLowerCase();
  if (clean === "alpha" || clean === "beta") return clean;
  return "stable";
}

export function resolveChannelDisplayOrder(
  channels?: Record<string, any> | null
): MasonReleaseChannel[] {
  const avail: MasonReleaseChannel[] = ["stable", "beta", "alpha"];
  if (!channels || typeof channels !== "object") return ["stable"];
  const present = avail.filter((ch) => Boolean(channels[ch]));
  return present.length > 0 ? present : ["stable"];
}

export function isSanctuaryBlueprintLockfile(raw: any): boolean {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      (typeof raw.sanctuary_lockfile_version === "string" ||
        Array.isArray(raw.artifacts) ||
        Array.isArray(raw.config_deltas))
  );
}

function lookupVaultModEntry(
  entries: Record<string, ModLockfileVaultEntry>,
  modName: string
): ModLockfileVaultEntry | undefined {
  if (!modName) return undefined;
  if (entries[modName]) return entries[modName];
  const norm = modName.replace(/\\/g, "/").replace(/^\/+/, "");
  const firstSeg = norm.split("/")[0] || norm;
  if (entries[firstSeg]) return entries[firstSeg];
  const lowerTarget = firstSeg.toLowerCase();
  for (const [k, v] of Object.entries(entries)) {
    if (k.toLowerCase() === lowerTarget) return v;
  }
  return undefined;
}

export function buildSanctuaryBlueprintLockfile({
  exportBase,
  vaultLockState,
  hiddenFilesMap,
}: {
  exportBase: Record<string, any>;
  vaultLockState?: BlueprintVaultLockState | null;
  hiddenFilesMap?: Record<string, string[]>;
}): Record<string, any> {
  const modEntries = vaultLockState?.mod_entries || {};
  const rawMods: any[] = Array.isArray(exportBase?.mods) ? exportBase.mods : [];

  const artifacts: LockfileArtifactEntry[] = rawMods.map((raw, idx) => {
    const obj = typeof raw === "string" ? { name: raw } : raw || {};
    const name = String(obj.name || obj.path || "").trim();
    const vaultEntry = lookupVaultModEntry(modEntries, name);
    const firstSeg = name.replace(/\\/g, "/").split("/")[0] || name;
    const blueprintHidden =
      (hiddenFilesMap &&
        (hiddenFilesMap[name] ||
          hiddenFilesMap[firstSeg] ||
          hiddenFilesMap[firstSeg.toLowerCase()])) ||
      [];
    const mergedHidden = Array.from(
      new Set([...(vaultEntry?.hidden_files || []), ...blueprintHidden].filter(Boolean))
    );
    const downloadUrl = String(obj.download_url || "").trim();
    const fallbackUrl = String(obj.url || "").trim();

    return {
      id: String(obj.id || obj.dbId || obj.hash || `artifact_${idx}`),
      name,
      sha256: obj.hash ? String(obj.hash).trim() : undefined,
      version: obj.version ? String(obj.version).trim() : undefined,
      download_url: downloadUrl || (fallbackUrl.startsWith("https://") ? fallbackUrl : undefined),
      manifest_url: obj.manifest_url ? String(obj.manifest_url).trim() : undefined,
      url: fallbackUrl || undefined,
      author: obj.author ? String(obj.author).trim() : undefined,
      channel: obj.channel ? normalizeReleaseChannel(obj.channel) : undefined,
      fomod_selections:
        vaultEntry?.fomod_selections && vaultEntry.fomod_selections.length > 0
          ? vaultEntry.fomod_selections
          : Array.isArray(obj.fomod_selections)
            ? obj.fomod_selections
            : undefined,
      hidden_files: mergedHidden.length > 0 ? mergedHidden : undefined,
      is_paid: Boolean(obj.is_paid) || undefined,
      is_early_access: Boolean(obj.is_early_access) || undefined,
    };
  });

  return {
    ...exportBase,
    sanctuary_lockfile_version: "1.0",
    exported_at: new Date().toISOString(),
    artifacts,
    config_deltas: vaultLockState?.config_deltas || [],
  };
}

export function extractLockfileHydrationPlan(
  pendingSet: any,
  missingMods: any[]
): {
  items: HydrationLockItem[];
  configDeltas: LockfileConfigDelta[];
} {
  const lockArtifacts: LockfileArtifactEntry[] = Array.isArray(pendingSet?.artifacts)
    ? pendingSet.artifacts
    : [];
  const byHash = new Map<string, LockfileArtifactEntry>();
  const byName = new Map<string, LockfileArtifactEntry>();
  for (const a of lockArtifacts) {
    if (a?.sha256) byHash.set(String(a.sha256).toLowerCase(), a);
    if (a?.name) byName.set(String(a.name).toLowerCase(), a);
  }

  const items: HydrationLockItem[] = (missingMods || []).map((raw, idx) => {
    const obj = typeof raw === "string" ? { name: raw } : raw || {};
    const name = String(obj.name || obj.path || `mod_${idx}`).trim();
    const hash = String(obj.hash || obj.sha256 || "").trim();
    const matched =
      (hash ? byHash.get(hash.toLowerCase()) : undefined) ||
      byName.get(name.toLowerCase());

    const downloadUrl = String(
      obj.download_url || matched?.download_url || obj.url || matched?.url || ""
    ).trim();
    const fallbackUrl = String(obj.url || matched?.url || downloadUrl || "").trim();
    const fomodSelections = Array.isArray(obj.fomod_selections)
      ? obj.fomod_selections
      : Array.isArray(matched?.fomod_selections)
        ? matched.fomod_selections
        : null;
    const hiddenFiles = Array.isArray(obj.hidden_files)
      ? obj.hidden_files
      : Array.isArray(matched?.hidden_files)
        ? matched.hidden_files
        : null;

    const firstFolderSeg = name.replace(/\\/g, "/").split("/")[0]?.trim() || "";
    const targetFolder =
      firstFolderSeg && !firstFolderSeg.includes(".") ? firstFolderSeg : null;

    return {
      id: String(matched?.id || hash || name || `missing_${idx}`),
      name,
      download_url: downloadUrl,
      fallback_url: fallbackUrl || null,
      expected_sha256: hash || matched?.sha256 || null,
      target_folder: targetFolder,
      force_replace: false,
      fomod_selections: fomodSelections,
      hidden_files: hiddenFiles,
    };
  });

  const configDeltas: LockfileConfigDelta[] = Array.isArray(pendingSet?.configDeltas)
    ? pendingSet.configDeltas
    : Array.isArray(pendingSet?.config_deltas)
      ? pendingSet.config_deltas
      : [];

  return { items, configDeltas };
}

import { invoke } from "@tauri-apps/api/core";
import { stripJsonCommentsAndTrailingCommas } from "../workbench/workbenchFormatUtils";
import { compressImageBytesToDataUrl, guessImageMime } from "../chameleon-components/ChameleonShared";
import { sanitizeThemeObject } from "../ThemeContext";
import { useStore, getSafeSchema } from "../store";
import { useModalStore } from "../store/modalStore";

export interface DiskImageAsset {
  path: string;
  file_name: string;
  data_base64: string;
  mime: string;
}

export interface DroppedJsonFileEntry {
  source_path: string;
  file_name: string;
  json_text: string;
  sibling_images: DiskImageAsset[];
}

export interface DroppedZipJsonBundle {
  source_path: string;
  file_name: string;
  json_entries: Array<{ entry_name: string; json_text: string }>;
  images: Array<{ entry_name: string; data_base64: string; mime: string }>;
}

export interface DroppedJsonInspectionReport {
  json_files: DroppedJsonFileEntry[];
  zip_bundles: DroppedZipJsonBundle[];
  standalone_images: DiskImageAsset[];
}

export interface JsonAssetDropResult {
  handledCount: number;
  remainingPaths: string[];
  summaryLabels: string[];
}

type CandidateImage = {
  fileName: string;
  mime: string;
  data_base64: string;
  sourcePath?: string;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function getFileStem(name: string): string {
  const leaf = String(name || "").split(/[\\/]/).pop() || "asset";
  return leaf.replace(/\.json$/i, "").replace(/\.sanctuary\.template$/i, "") || "asset";
}

function tryParseJson(rawText: string): any | null {
  try {
    return JSON.parse(rawText);
  } catch {
    try {
      return JSON.parse(stripJsonCommentsAndTrailingCommas(rawText));
    } catch {
      return null;
    }
  }
}

function isEdgeSidecarPayload(fileName: string, parsed: any): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".sanctuary.manifest.json") || lower.endsWith(".sanctuary.override.json")) {
    return true;
  }
  return Boolean(
    parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed.sanctuary_edge_override ||
        parsed.sanctuary_edge_manifest ||
        parsed.edge_manifest_version)
  );
}

function isMasterSchemaPayload(parsed: any): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const ext = parsed.extensions;
  if (!ext || typeof ext !== "object" || !Array.isArray(ext.supported)) return false;
  return Boolean(
    parsed.folders ||
      parsed.deployment_strategy ||
      parsed.load_order ||
      parsed.executables ||
      parsed.features ||
      parsed.id ||
      parsed.game_id
  );
}

function isWorkbenchTemplatePayload(fileName: string, parsed: any): boolean {
  const candidate = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : parsed;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  if (fileName.toLowerCase().endsWith(".sanctuary.template.json")) {
    return Boolean(candidate.template_id || candidate.target_file || Array.isArray(candidate.settings));
  }
  return Boolean(
    typeof candidate.template_id === "string" &&
      (typeof candidate.target_file === "string" || Array.isArray(candidate.settings))
  );
}

function isBlueprintPayload(parsed: any): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (!Array.isArray(parsed.mods)) return false;
  if (isMasterSchemaPayload(parsed)) return false;
  return typeof parsed.name === "string" || typeof parsed.blueprint_name === "string";
}

function isChameleonPayload(parsed: any): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (typeof parsed.bg !== "string") return false;
  return Boolean(
    typeof parsed.accent === "string" ||
      typeof parsed.card === "string" ||
      typeof parsed.panel === "string" ||
      typeof parsed.text === "string"
  );
}

const KNOWN_LEXICON_SAMPLE_KEYS = new Set([
  "save",
  "cancel",
  "delete",
  "remove",
  "edit",
  "close",
  "settings",
  "search",
  "filters",
  "overview",
  "term_mod",
  "term_mods",
  "term_vault",
  "term_blueprint",
  "term_blueprints",
  "nav_library",
  "nav_playsets",
  "nav_settings",
  "btn_launch",
]);

function isLexiconPayload(parsed: any): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (isMasterSchemaPayload(parsed) || isBlueprintPayload(parsed) || isChameleonPayload(parsed)) {
    return false;
  }
  if (typeof parsed._meta_language === "string" || typeof parsed._meta_code === "string") {
    return true;
  }
  const entries = Object.entries(parsed);
  if (entries.length < 4) return false;
  let stringCount = 0;
  let knownMatches = 0;
  for (const [k, v] of entries) {
    if (typeof v === "string") {
      stringCount++;
      if (
        KNOWN_LEXICON_SAMPLE_KEYS.has(k) ||
        k.startsWith("nav_") ||
        k.startsWith("btn_") ||
        k.startsWith("term_")
      ) {
        knownMatches++;
      }
    }
  }
  return stringCount >= 4 && knownMatches >= 2;
}

async function hydrateChameleonImages(
  themeObj: Record<string, any>,
  candidates: CandidateImage[],
  consumedImagePaths: Set<string>
): Promise<Record<string, any>> {
  const next = { ...themeObj };
  if (candidates.length === 0) return next;

  const isBgName = (n: string) => /bg|background|wallpaper|banner|backdrop/i.test(n);
  const isPreviewName = (n: string) => /preview|thumb|thumbnail|cover/i.test(n);

  let bgCandidate = candidates.find((c) => isBgName(c.fileName));
  let previewCandidate = candidates.find((c) => isPreviewName(c.fileName));

  if (!bgCandidate && candidates.length === 1 && !previewCandidate) {
    bgCandidate = candidates[0];
  } else if (!bgCandidate) {
    bgCandidate = candidates.find((c) => c !== previewCandidate);
  }

  if (bgCandidate && (!next.bgImage || String(next.bgImage).length < 64)) {
    const bytes = base64ToBytes(bgCandidate.data_base64);
    next.bgImage = await compressImageBytesToDataUrl(
      bytes,
      bgCandidate.mime || guessImageMime(bgCandidate.fileName),
      1920,
      1080
    );
    if (bgCandidate.sourcePath) consumedImagePaths.add(bgCandidate.sourcePath);
  }

  if (previewCandidate && (!next.previewImage || String(next.previewImage).length < 64)) {
    const bytes = base64ToBytes(previewCandidate.data_base64);
    next.previewImage = await compressImageBytesToDataUrl(
      bytes,
      previewCandidate.mime || guessImageMime(previewCandidate.fileName),
      1280,
      720
    );
    if (previewCandidate.sourcePath) consumedImagePaths.add(previewCandidate.sourcePath);
  }

  return next;
}

function installBlueprintObject(parsed: any): { name: string; missingCount: number } {
  const state = useStore.getState();
  const vaultMods: any[] = Array.isArray(state.modList) ? state.modList : [];
  const playSets: any[] = Array.isArray(state.playSets) ? state.playSets : [];

  const hashToMod = new Map<string, any>();
  const cleanNameToMod = new Map<string, any>();
  for (const m of vaultMods) {
    if (m?.hash) hashToMod.set(String(m.hash), m);
    const leaf = String(m?.name || m?.path || "").split(/[\\/]/).pop()?.toLowerCase() || "";
    if (leaf && !cleanNameToMod.has(leaf)) cleanNameToMod.set(leaf, m);
  }

  const nextMods: string[] = [];
  const nextModHashes: Record<string, string> = { ...(parsed.modHashes || {}) };
  const missing: any[] = [];

  for (const item of parsed.mods || []) {
    const rawName =
      typeof item === "string" ? item : String(item?.name || item?.path || "").trim();
    if (!rawName) continue;
    const leaf = (rawName.split(/[\\/]/).pop() || rawName).toLowerCase();

    let found: any = null;
    if (item && typeof item === "object" && item.hash) {
      found = hashToMod.get(String(item.hash)) || null;
    }
    if (!found && leaf) {
      found = cleanNameToMod.get(leaf) || null;
    }

    if (found) {
      nextMods.push(found.name);
      if (found.hash) nextModHashes[found.name] = found.hash;
    } else {
      nextMods.push(rawName);
      missing.push(item);
      if (item && typeof item === "object" && item.hash) {
        nextModHashes[rawName] = String(item.hash);
      }
    }
  }

  const baseName = String(parsed.name || parsed.blueprint_name || "Imported Blueprint").trim();
  let finalName = baseName;
  let suffix = 2;
  while (playSets.some((s) => String(s?.name || "").toLowerCase() === finalName.toLowerCase())) {
    finalName = `${baseName} (${suffix})`;
    suffix++;
  }

  const readySet = {
    ...parsed,
    name: finalName,
    enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : false,
    mods: nextMods,
    modHashes: nextModHashes,
  };

  state.setPlaySets([...playSets, readySet]);
  if (missing.length > 0) {
    useModalStore.getState().setMissingImportMods(missing);
  }
  return { name: finalName, missingCount: missing.length };
}

export function translateExternalModlistToBlueprint(
  fileName: string,
  parsed: any
): Record<string, any> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  // 1. Modrinth .mrpack (`modrinth.index.json`)
  if (parsed.formatVersion === 1 && Array.isArray(parsed.files)) {
    const modHashes: Record<string, string> = {};
    const modMeta: Record<string, any> = {};
    const mods: any[] = [];
    for (const f of parsed.files) {
      const leaf = String(f?.path || "").split(/[\\/]/).pop()?.trim() || "";
      if (!leaf) continue;
      const hash = String(f?.hashes?.sha256 || f?.hashes?.sha512 || f?.hashes?.sha1 || "").trim();
      const url = Array.isArray(f?.downloads) ? String(f.downloads[0] || "").trim() : "";
      if (hash) modHashes[leaf] = hash;
      if (url) modMeta[leaf] = { url };
      mods.push(hash || url ? { name: leaf, ...(hash ? { hash } : {}), ...(url ? { url } : {}) } : leaf);
    }
    return {
      sanctuary_profile: true,
      name: String(parsed.name || getFileStem(fileName) || "Modrinth Modpack").trim(),
      description: String(parsed.summary || ""),
      mods,
      modHashes,
      modMeta,
      source_format: "mrpack",
    };
  }

  // 2. CurseForge (`manifest.json`)
  if (
    (parsed.manifestType === "minecraftModpack" || Boolean(parsed.minecraft)) &&
    Array.isArray(parsed.files)
  ) {
    const mods: string[] = [];
    for (const f of parsed.files) {
      const explicitName = String(f?.fileName || f?.name || "").trim();
      const pid = f?.projectID ?? f?.projectId;
      const fid = f?.fileID ?? f?.fileId;
      const label = explicitName || (pid ? `curseforge-${pid}-${fid || "latest"}` : "");
      if (label) mods.push(label);
    }
    return {
      sanctuary_profile: true,
      name: String(parsed.name || getFileStem(fileName) || "CurseForge Modpack").trim(),
      author: String(parsed.author || ""),
      version: String(parsed.version || ""),
      mods,
      modHashes: {},
      source_format: "curseforge",
    };
  }

  // 3. Nexus Collections (`collection.json`)
  if (parsed.info && typeof parsed.info === "object" && Array.isArray(parsed.mods)) {
    const modHashes: Record<string, string> = {};
    const modMeta: Record<string, any> = {};
    const mods: any[] = [];
    for (const m of parsed.mods) {
      const leaf = String(
        m?.source?.logicalFilename || m?.name || m?.domainName || ""
      ).trim();
      if (!leaf) continue;
      const md5 = String(m?.source?.md5 || "").trim();
      const url = String(m?.source?.url || "").trim();
      if (md5) modHashes[leaf] = md5;
      if (url) modMeta[leaf] = { url };
      mods.push(md5 || url ? { name: leaf, ...(md5 ? { hash: md5 } : {}), ...(url ? { url } : {}) } : leaf);
    }
    const loadRules = Array.isArray(parsed.modRules)
      ? parsed.modRules
          .map((r: any, idx: number) => {
            const modA = String(r?.source?.logicalFilename || r?.sourceName || r?.source || "").trim();
            const modB = String(r?.reference?.logicalFilename || r?.referenceName || r?.reference || "").trim();
            const rawType = String(r?.type || "").toLowerCase();
            if (!modA || !modB || (rawType !== "before" && rawType !== "after")) return null;
            return { id: `rosetta_${idx}`, modA, modB, type: rawType as "before" | "after" };
          })
          .filter(Boolean)
      : [];
    return {
      sanctuary_profile: true,
      name: String(parsed.info?.name || getFileStem(fileName) || "Nexus Collection").trim(),
      author: String(parsed.info?.author || ""),
      mods,
      modHashes,
      modMeta,
      loadRules,
      source_format: "nexus_collection",
    };
  }

  // 4. Wabbajack (`modlist` JSON)
  if (
    Array.isArray(parsed.Archives) &&
    (typeof parsed.Name === "string" || parsed.ModListType !== undefined)
  ) {
    const modHashes: Record<string, string> = {};
    const modMeta: Record<string, any> = {};
    const mods: any[] = [];
    for (const a of parsed.Archives) {
      const leaf = String(a?.Name || a?.State?.PrimaryKeyString || "").trim();
      if (!leaf) continue;
      const hash = String(a?.Hash || "").trim();
      const url = String(a?.State?.Url || "").trim();
      if (hash) modHashes[leaf] = hash;
      if (url) modMeta[leaf] = { url };
      mods.push(hash || url ? { name: leaf, ...(hash ? { hash } : {}), ...(url ? { url } : {}) } : leaf);
    }
    return {
      sanctuary_profile: true,
      name: String(parsed.Name || getFileStem(fileName) || "Wabbajack Modlist").trim(),
      author: String(parsed.Author || ""),
      version: String(parsed.Version || ""),
      mods,
      modHashes,
      modMeta,
      source_format: "wabbajack",
    };
  }

  return null;
}

export async function installDroppedJsonAssets(
  paths: string[],
  opts: {
    importTheme: (rawJson: any) => void;
    importLexicon: (json: any, langCode: string) => void;
    t: (key: string, fallback?: string) => string;
  }
): Promise<JsonAssetDropResult> {
  const candidates = paths.filter((p) => {
    const lower = String(p || "").toLowerCase();
    return (
      lower.endsWith(".json") ||
      lower.endsWith(".zip") ||
      lower.endsWith(".mrpack") ||
      lower.endsWith(".wabbajack") ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".gif")
    );
  });

  if (candidates.length === 0) {
    return { handledCount: 0, remainingPaths: paths, summaryLabels: [] };
  }

  let report: DroppedJsonInspectionReport;
  try {
    report = await invoke<DroppedJsonInspectionReport>("inspect_dropped_json_bundles", {
      paths: candidates,
    });
  } catch {
    return { handledCount: 0, remainingPaths: paths, summaryLabels: [] };
  }

  const consumedPaths = new Set<string>();
  const summaryLabels: string[] = [];
  let handledCount = 0;

  const standalonePool: CandidateImage[] = (report.standalone_images || []).map((img) => ({
    fileName: img.file_name,
    mime: img.mime,
    data_base64: img.data_base64,
    sourcePath: img.path,
  }));

  const processParsedJson = async (
    fileName: string,
    rawText: string,
    extraImages: CandidateImage[]
  ): Promise<boolean> => {
    const parsed = tryParseJson(rawText);
    if (!parsed) return false;
    if (isEdgeSidecarPayload(fileName, parsed)) return false;

    const rosettaBlueprint = translateExternalModlistToBlueprint(fileName, parsed);
    if (rosettaBlueprint) {
      const bp = installBlueprintObject(rosettaBlueprint);
      await invoke("save_dropped_os_asset", {
        assetKind: "blueprint",
        fileName: `${bp.name}.json`,
        content: JSON.stringify(rosettaBlueprint, null, 2),
      }).catch(() => {});
      handledCount++;
      summaryLabels.push(bp.name);
      return true;
    }

    if (isMasterSchemaPayload(parsed)) {
      const schemaId = String(parsed.id || parsed.game_id || getFileStem(fileName)).trim() || "custom";
      const cleanSchema: Record<string, any> = {
        ...parsed,
        id: schemaId,
        game_id: String(parsed.game_id || schemaId).trim(),
      };
      delete cleanSchema.mod_categories;
      delete cleanSchema.taxonomy;
      delete cleanSchema.dlc_catalog;
      delete cleanSchema.exception_rules;

      const serialized = JSON.stringify(cleanSchema, null, 2);
      try {
        localStorage.setItem(`sanctuary_master_schema_${schemaId}`, serialized);
        localStorage.setItem(`sanctuary_master_schema_${schemaId.toLowerCase()}`, serialized);
      } catch {}

      await invoke("save_dropped_os_asset", {
        assetKind: "master_schema",
        fileName: `${schemaId}.json`,
        content: serialized,
      }).catch(() => {});

      const storeState = useStore.getState();
      const activeId = String(
        storeState.activeGameSchema?.id || storeState.activeGameSchema?.game_id || ""
      ).toLowerCase();
      if (!activeId || activeId === "default" || activeId === schemaId.toLowerCase()) {
        storeState.setActiveGameSchema(getSafeSchema(cleanSchema, schemaId));
      }

      handledCount++;
      summaryLabels.push(cleanSchema.game_name || cleanSchema.name || schemaId);
      return true;
    }

    if (isWorkbenchTemplatePayload(fileName, parsed)) {
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      const tmplId = String(first?.template_id || getFileStem(fileName));
      await invoke("save_dropped_os_asset", {
        assetKind: "workbench_template",
        fileName: `${tmplId}.sanctuary.template.json`,
        content: JSON.stringify(parsed, null, 2),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sanctuary-workbench-templates-updated"));
      }
      handledCount++;
      summaryLabels.push(first?.template_name || tmplId);
      return true;
    }

    if (isBlueprintPayload(parsed)) {
      const bp = installBlueprintObject(parsed);
      await invoke("save_dropped_os_asset", {
        assetKind: "blueprint",
        fileName: `${bp.name}.json`,
        content: JSON.stringify(parsed, null, 2),
      }).catch(() => {});
      handledCount++;
      summaryLabels.push(bp.name);
      return true;
    }

    if (isChameleonPayload(parsed)) {
      const mergedImages = [...extraImages, ...standalonePool];
      const hydrated = await hydrateChameleonImages(parsed, mergedImages, consumedPaths);
      const sanitized = sanitizeThemeObject(hydrated);
      opts.importTheme(sanitized);
      const themeName = String(sanitized.name || sanitized.id || getFileStem(fileName));
      await invoke("save_dropped_os_asset", {
        assetKind: "chameleon",
        fileName: `${themeName}.json`,
        content: JSON.stringify(sanitized, null, 2),
      }).catch(() => {});
      handledCount++;
      summaryLabels.push(themeName);
      return true;
    }

    if (isLexiconPayload(parsed)) {
      const langCode = String(
        parsed._meta_code || parsed._meta_id || getFileStem(fileName)
      ).trim() || "custom";
      opts.importLexicon(parsed, langCode);
      await invoke("save_dropped_os_asset", {
        assetKind: "lexicon",
        fileName: `${langCode}.json`,
        content: JSON.stringify(parsed, null, 2),
      }).catch(() => {});
      handledCount++;
      summaryLabels.push(String(parsed._meta_language || langCode));
      return true;
    }

    return false;
  };

  for (const jf of report.json_files || []) {
    const siblingPool: CandidateImage[] = (jf.sibling_images || []).map((img) => ({
      fileName: img.file_name,
      mime: img.mime,
      data_base64: img.data_base64,
    }));
    const handled = await processParsedJson(jf.file_name, jf.json_text, siblingPool);
    if (handled) {
      consumedPaths.add(jf.source_path);
    }
  }

  for (const zb of report.zip_bundles || []) {
    const zipImgPool: CandidateImage[] = (zb.images || []).map((img) => ({
      fileName: img.entry_name.split(/[\\/]/).pop() || img.entry_name,
      mime: img.mime,
      data_base64: img.data_base64,
    }));
    let zipHandledAny = false;
    for (const entry of zb.json_entries || []) {
      const leaf = entry.entry_name.split(/[\\/]/).pop() || entry.entry_name;
      if (await processParsedJson(leaf, entry.json_text, zipImgPool)) {
        zipHandledAny = true;
      }
    }
    if (zipHandledAny) {
      consumedPaths.add(zb.source_path);
    }
  }

  return {
    handledCount,
    remainingPaths: paths.filter((p) => !consumedPaths.has(p)),
    summaryLabels,
  };
}

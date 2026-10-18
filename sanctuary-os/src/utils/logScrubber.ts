import {
  matchExceptionRules,
  normalizeRuleSeverity,
  SchemaExceptionRule,
} from "../components/KnownExceptionRules";

export const REDACTED_TOKEN = "[REDACTED BY SANCTUARY]";
export const REDACTED_HEX_SESSION_TOKEN = "000000000000000000000000";

export interface ScrubbedRealLogFile {
  file_name: string;
  fileName?: string;
  content: string;
  modified_epoch?: number;
}

/**
 * Scrubs any user-identifying information (GUIDs, session/desync IDs, OS usernames in file paths,
 * machine/host names, Windows SIDs, and email addresses) from any log string.
 * - `<sessionid>` and `<desyncid>` are replaced with 24 hex zeroes (`000000000000000000000000`)
 *   so external XML tools and regex parsers expecting `<desyncid>[0-9a-f]+</desyncid>` remain 100% compatible.
 * - Machine/user identifiers (`GUID`, `<guid>`, `C:\Users\<Username>\`, `/Users/<Username>/`, etc.)
 *   are replaced with `[REDACTED BY SANCTUARY]`.
 */
export function scrubLogUserData(rawText?: string | null): string {
  if (!rawText) return "";
  let text = String(rawText);

  // 1. Scrub GUID: <UUID/Hex> (e.g., GUID: BC7AFD5D-ECE9-11EF-BE02-E6D1369926EE&#13; &#10;</desyncdata></report>)
  text = text.replace(
    /\b(GUID\s*[:=]\s*)\{?[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\}?/gi,
    `$1${REDACTED_TOKEN}`
  );
  text = text.replace(
    /\b(GUID\s*[:=]\s*)\{?[0-9a-fA-F-]{12,}\}?/gi,
    `$1${REDACTED_TOKEN}`
  );

  // 2a. Scrub <sessionid> and <desyncid> with 24 hex zeroes for strict XML hex parser compatibility
  text = text.replace(
    /<(sessionid|desyncid)>([^<]*)<\/\1>/gi,
    `<$1>${REDACTED_HEX_SESSION_TOKEN}</$1>`
  );

  // 2b. Scrub machine/user XML identifying tags (<guid>, <userid>, <machineid>, <computername>, <accountid>)
  text = text.replace(
    /<(guid|userid|machineid|computername|accountid)>([^<]*)<\/\1>/gi,
    `<$1>${REDACTED_TOKEN}</$1>`
  );

  // 3. Scrub Windows, macOS, and Linux file paths containing the Username
  // Matches C:\Users\<Username>\, C:\\Users\\<Username>\\, C:/Users/<Username>/, /Users/<Username>/, \Users\<Username>\
  text = text.replace(
    /((?:[A-Za-z]:)?(?:\\{1,2}|\/)Users(?:\\{1,2}|\/))(?!\[REDACTED BY SANCTUARY\])([^\\/\r\n"'<>|&]+)((?:\\{1,2}|\/)?)/gi,
    `$1${REDACTED_TOKEN}$3`
  );

  // Matches Linux /home/<Username>/
  text = text.replace(
    /((?:^|[\s"'=(])\/home\/)(?!\[REDACTED BY SANCTUARY\])([^\\/\r\n"'<>|&]+)(\/?)/gi,
    `$1${REDACTED_TOKEN}$3`
  );

  // Matches Windows legacy Documents and Settings\<Username>\
  text = text.replace(
    /((?:[A-Za-z]:)?(?:\\{1,2}|\/)Documents and Settings(?:\\{1,2}|\/))(?!\[REDACTED BY SANCTUARY\])([^\\/\r\n"'<>|&]+)((?:\\{1,2}|\/)?)/gi,
    `$1${REDACTED_TOKEN}$3`
  );

  // Matches OneDrive - <Personal/Org Name>
  text = text.replace(
    /(OneDrive\s*-\s*)(?!\[REDACTED BY SANCTUARY\])([^\\/\r\n"'<>|&]+)/gi,
    `$1${REDACTED_TOKEN}`
  );

  // 4. Scrub explicit user/machine key-value pairs in logs
  text = text.replace(
    /\b(User\s*Name|Username|Computer\s*Name|Machine\s*Name|Host\s*Name|Machine\s*Id|Hardware\s*Id|Device\s*Id|Account\s*Id|Steam\s*Id|EA\s*Id|Origin\s*Id|Session\s*Id)\s*([:=])\s*(?!\[REDACTED BY SANCTUARY\])([^\r\n,;<>]+)/gi,
    `$1$2 ${REDACTED_TOKEN}`
  );

  // 5. Scrub Windows Security Identifiers (SIDs)
  text = text.replace(/\bS-1-5-21(?:-\d+){3,}\b/g, REDACTED_TOKEN);

  // 6. Scrub email addresses in logs
  text = text.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    REDACTED_TOKEN
  );

  return text;
}

/**
 * Converts scrubbed log text into clean, human-readable multi-line text for the UI Execution Logs box
 * and the bottom section of `Lab_Report_#.txt` by replacing `&#13;&#10;` / `&#13; &#10;` XML entities
 * with real `\n` line breaks while leaving `extractCleanRealLogContent` untouched for raw XML exports.
 */
export function formatHumanReadableLogText(rawText?: string | null): string {
  if (!rawText) return "";
  return scrubLogUserData(rawText)
    .replace(/&#13;\s*&#10;|&#x0?[dD];\s*&#x0?[aA];/g, "\n")
    .replace(/&#10;|&#x0?[aA];/g, "\n")
    .replace(/&#13;|&#x0?[dD];/g, "\n")
    .replace(/&#0?9;/g, "\t")
    .replace(/(<\/report>)(?=<report>)/gi, "$1\n");
}

/**
 * Strips any internal Sanctuary prefix ("⚠️ EXCEPTION DETECTED:") and returns the pure,
 * scrubbed real game log content (e.g., lastException.txt / lastUIException.txt XML)
 * with XML entities (`&#13;&#10;`) preserved for external XML parsers.
 */
export function extractCleanRealLogContent(rawSnippet?: string | null): string {
  if (!rawSnippet) return "";
  const cleaned = String(rawSnippet).replace(
    /^(?:⚠️\s*)?EXCEPTION DETECTED(?:\s*\[[^\]]*\])?:\s*/i,
    ""
  );
  return scrubLogUserData(cleaned);
}

/**
 * Infers a sensible real log filename (e.g. lastUIException.txt vs lastException.txt)
 * when saving the companion real game log alongside Lab_Report_#.txt.
 */
export function inferRealLogFileName(logText?: string | null, explicitFileName?: string): string {
  if (explicitFileName && explicitFileName.trim()) {
    return explicitFileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  }
  const lower = (logText || "").toLowerCase();
  if (lower.includes("uiexception") || lower.includes("widgets.") || lower.includes("actionscript")) {
    return "lastUIException.txt";
  }
  if (lower.includes("crash") && !lower.includes("<desyncdata>")) {
    return "lastCrash.txt";
  }
  return "lastException.txt";
}

/**
 * Returns a stable 1-based report number (#) for a given report so filenames are saved as Lab_Report_#.txt.
 */
export function resolveLabReportNumber(report: any, allReports: any[] = []): number {
  if (typeof report?.reportNumber === "number" && report.reportNumber > 0) {
    return report.reportNumber;
  }
  if (Array.isArray(allReports) && allReports.length > 0 && report) {
    // Oldest report is #1, newest report is #N
    const chronological = [...allReports].reverse();
    const idx = chronological.findIndex(
      (r) =>
        (report.id && r?.id === report.id) ||
        (report.sessionKey && r?.sessionKey === report.sessionKey)
    );
    if (idx >= 0) {
      return idx + 1;
    }
    return allReports.length;
  }
  try {
    const rawCounter = parseInt(localStorage.getItem("sanctuary_lab_report_counter") || "0", 10);
    const next = (Number.isFinite(rawCounter) ? rawCounter : 0) + 1;
    localStorage.setItem("sanctuary_lab_report_counter", String(next));
    return next;
  } catch {
    return 1;
  }
}

export interface BuildLabReportOptions {
  reportNumber: number;
  mod?: any;
  targetMod?: any;
  errorFound?: boolean;
  verified?: boolean;
  time?: string;
  date?: string;
  selectedVersion?: string;
  gameVersion?: string;
  logSnippet?: string;
  rawLogText?: string;
  conflictTarget?: any;
  stagedExtras?: any[];
  conflictExtras?: any[];
  missingDeps?: any[];
  linkedFiles?: string[];
  matchedRules?: SchemaExceptionRule[];
  activeGameSchema?: any;
  modList?: any[];
}

function normalizeBaseKey(raw: string): string {
  return (raw || "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[a-z0-9]{2,12}$/i, "")
    .replace(/[_-\s]+scripts?$/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * Determines the file extension tag for a mod (e.g. "ts4script", "package", "world").
 */
export function getModExtensionLabel(
  m: any,
  activeGameSchema?: any,
  modList?: any[],
  companionMods?: any[]
): string {
  const supportedExts: string[] = Array.isArray(activeGameSchema?.extensions?.supported)
    ? activeGameSchema.extensions.supported.map((e: string) =>
        String(e).replace(/^\./, "").toLowerCase()
      )
    : ["package", "ts4script"];

  const defaultPkgExt =
    supportedExts.find((e) => !e.includes("script")) || "package";
  const defaultScriptExt =
    supportedExts.find((e) => e.includes("script")) || "ts4script";

  if (!m) return defaultPkgExt;

  const detectOwnExt = (): string | null => {
    if (typeof m === "string") {
      const extMatch = m.match(/\.([a-z0-9]{2,12})$/i);
      if (extMatch && supportedExts.includes(extMatch[1].toLowerCase())) {
        return extMatch[1].toLowerCase();
      }
      if (/script/i.test(m)) return defaultScriptExt;
      return null;
    }

    // 1. Explicit file_extension property
    if (typeof m.file_extension === "string" && m.file_extension.trim()) {
      const cleanExt = m.file_extension.trim().replace(/^\./, "").toLowerCase();
      if (cleanExt) return cleanExt;
    }

    // 2. Check direct file paths / names for a known extension
    const pathCandidates = [m.physical_path, m.path, m.name, m.fileName];
    for (const cand of pathCandidates) {
      if (typeof cand === "string" && cand.trim()) {
        const extMatch = cand.trim().match(/\.([a-z0-9]{2,12})$/i);
        if (extMatch) {
          const ext = extMatch[1].toLowerCase();
          if (
            supportedExts.includes(ext) ||
            ["package", "ts4script", "script", "world", "asi", "dll", "archive", "pak"].includes(ext)
          ) {
            return ext;
          }
        }
      }
    }

    // 3. Check folder_structure if present
    if (m.folder_structure) {
      try {
        const parsed =
          typeof m.folder_structure === "string"
            ? JSON.parse(m.folder_structure)
            : m.folder_structure;
        if (Array.isArray(parsed)) {
          const flatFiles = parsed.map((item: any) =>
            typeof item === "string" ? item : item?.name || item?.path || ""
          );
          if (flatFiles.some((f: string) => /\.ts4script$/i.test(f))) {
            return "ts4script";
          }
          if (flatFiles.some((f: string) => /script/i.test(f))) {
            return defaultScriptExt;
          }
          for (const f of flatFiles) {
            const mExt = String(f).match(/\.([a-z0-9]{2,12})$/i);
            if (mExt && supportedExts.includes(mExt[1].toLowerCase())) {
              return mExt[1].toLowerCase();
            }
          }
        }
      } catch {}
    }

    // 4. Check if name/displayName/type indicates a script twin (e.g. UI_Cheats_Extension_Scripts)
    const rawIdentity = `${m.name || ""} ${m.displayName || ""} ${m.physical_path || ""} ${m.type || ""} ${m.category || ""}`;
    if (
      /[_-\s]scripts?\b/i.test(m.name || "") ||
      /[_-\s]scripts?\b/i.test(m.displayName || "") ||
      /\bts4scripts?\b/i.test(rawIdentity) ||
      String(m.type || "").toLowerCase() === "script"
    ) {
      return defaultScriptExt;
    }

    // 5. If modList is provided, check matching non-virtual entry
    if (Array.isArray(modList) && modList.length > 0) {
      const matched = modList.find(
        (item: any) =>
          !item.isVirtual &&
          ((m.hash && item.hash === m.hash) ||
            (m.id && item.id === m.id) ||
            (m.name && item.name === m.name))
      );
      if (matched && matched !== m) {
        return getModExtensionLabel(matched, activeGameSchema);
      }
    }

    return null;
  };

  const ownExt = detectOwnExt();

  // If companionMods (stagedExtras) has a twin with the same base name, ensure Subject & Injected twin have complementary extensions
  if (Array.isArray(companionMods) && companionMods.length > 0 && typeof m !== "string") {
    const targetKey = normalizeBaseKey(m.displayName || m.name || "");
    const twinCompanion = companionMods.find((c: any) => {
      if (!c || c === m) return false;
      const cKey = normalizeBaseKey(
        typeof c === "string" ? c : c.displayName || c.name || ""
      );
      return Boolean(targetKey && cKey && targetKey === cKey);
    });
    if (twinCompanion) {
      const compExt = getModExtensionLabel(
        twinCompanion,
        activeGameSchema,
        modList
      );
      if (!ownExt || ownExt === compExt) {
        if (compExt === defaultPkgExt) return defaultScriptExt;
        if (compExt === defaultScriptExt) return defaultPkgExt;
      }
    }
  }

  return ownExt || defaultPkgExt;
}

/**
 * Resolves the human-readable version number for a mod, checking the mod itself,
 * its virtual flavors, any companion/staged twin, and any matching/twin entry in `modList`.
 */
export function getModVersionLabel(
  m: any,
  modList?: any[],
  companionMods?: any[]
): string {
  const isRealVersion = (v: any): v is string => {
    if (typeof v !== "string") return false;
    const trimmed = v.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return (
      lower !== "local" &&
      lower !== "vlocal" &&
      lower !== "v.local" &&
      lower !== "unknown" &&
      lower !== "n/a"
    );
  };

  if (!m || typeof m === "string") return "Local";

  const directCandidates = [
    m.version,
    m.mod_version,
    m.latest_version,
    m.version_label,
  ];
  for (const c of directCandidates) {
    if (isRealVersion(c)) return c.trim();
  }

  if (Array.isArray(m.flavors)) {
    for (const f of m.flavors) {
      const fv = f?.version || f?.mod_version || f?.latest_version;
      if (isRealVersion(fv)) return fv.trim();
    }
  }

  const targetKey = normalizeBaseKey(m.displayName || m.name || "");
  const rawFamilyId = String(
    m.dbId || m.baseFamilyId || m.familyId || m.hash || ""
  ).replace(/^virtual_/, "");

  // Check companionMods (e.g. stagedExtras twin like UI CHEATS EXTENSION (1.54))
  if (Array.isArray(companionMods) && companionMods.length > 0) {
    for (const comp of companionMods) {
      if (!comp || typeof comp === "string") continue;
      const compKey = normalizeBaseKey(comp.displayName || comp.name || "");
      const compFamId = String(
        comp.dbId || comp.baseFamilyId || comp.familyId || comp.hash || ""
      ).replace(/^virtual_/, "");
      const isTwin =
        (targetKey && compKey && targetKey === compKey) ||
        (rawFamilyId && compFamId && rawFamilyId === compFamId);
      if (isTwin) {
        const cv =
          comp.version ||
          comp.mod_version ||
          comp.latest_version ||
          comp.version_label;
        if (isRealVersion(cv)) return cv.trim();
      }
    }
  }

  if (Array.isArray(modList) && modList.length > 0) {
    const siblings = modList.filter((item: any) => {
      if (!item) return false;
      if (m.hash && item.hash === m.hash) return true;
      if (m.id && item.id === m.id) return true;
      if (
        rawFamilyId &&
        (String(item.familyId) === rawFamilyId ||
          String(item.baseFamilyId) === rawFamilyId ||
          String(item.dbId) === rawFamilyId ||
          String(item.hash || "").replace(/^virtual_/, "") === rawFamilyId)
      ) {
        return true;
      }
      const itemKey = normalizeBaseKey(item.displayName || item.name || "");
      return Boolean(targetKey && itemKey && targetKey === itemKey);
    });
    for (const sibling of siblings) {
      const sv =
        sibling.version || sibling.mod_version || sibling.latest_version;
      if (isRealVersion(sv)) return sv.trim();
      if (Array.isArray(sibling.flavors)) {
        for (const f of sibling.flavors) {
          const fv = f?.version || f?.mod_version || f?.latest_version;
          if (isRealVersion(fv)) return fv.trim();
        }
      }
    }
  }

  const fallback = m.version || m.mod_version || m.latest_version;
  if (typeof fallback === "string" && fallback.trim() && isRealVersion(fallback)) {
    return fallback.trim();
  }
  return "Local";
}

/**
 * Resolves a report's mod (which may have been stored as a virtual family card or minimal object)
 * to its actual non-virtual physical mod entry in `modList`.
 * If the mod has twins (e.g. .package and .ts4script) and one of them is in `stagedExtras`,
 * it selects the complementary twin that is NOT in `stagedExtras`.
 */
export function resolveRealReportMod(
  m: any,
  stagedExtras?: any[],
  modList?: any[]
): any {
  if (!m || typeof m === "string") return m;
  if (!Array.isArray(modList) || modList.length === 0) return m;

  const isVirtualMod =
    Boolean(m.isVirtual) || String(m.hash || "").startsWith("virtual_");

  const nonVirtuals = modList.filter(
    (item: any) =>
      item &&
      !item.isVirtual &&
      !String(item.hash || "").startsWith("virtual_")
  );

  if (!isVirtualMod) {
    const lowerName = String(m.name || "").toLowerCase();
    const exactMatch =
      nonVirtuals.find((item: any) => m.hash && item.hash === m.hash) ||
      nonVirtuals.find((item: any) => {
        const iName = String(item.name || "").toLowerCase();
        return (
          Boolean(lowerName && iName) &&
          (iName === lowerName ||
            iName.endsWith("/" + lowerName) ||
            iName.endsWith("\\" + lowerName) ||
            iName.replace(/\.[a-z0-9]{2,12}$/i, "") === lowerName)
        );
      });
    if (exactMatch) {
      return {
        ...exactMatch,
        ...m,
        name: exactMatch.name || m.name,
        physical_path: exactMatch.physical_path || m.physical_path || exactMatch.name,
        file_extension: exactMatch.file_extension || m.file_extension,
        version:
          getModVersionLabel(exactMatch, modList, stagedExtras) !== "Local"
            ? getModVersionLabel(exactMatch, modList, stagedExtras)
            : m.version,
        hash: exactMatch.hash || m.hash,
      };
    }
    return m;
  }

  // If m is a virtual family card, find its physical family members
  const rawFamilyId = String(m.dbId || m.baseFamilyId || m.hash || "").replace(
    /^virtual_/,
    ""
  );
  const targetKey = normalizeBaseKey(m.displayName || m.name || "");

  let candidates = nonVirtuals.filter((item: any) => {
    if (
      rawFamilyId &&
      (String(item.familyId) === rawFamilyId ||
        String(item.baseFamilyId) === rawFamilyId ||
        String(item.dbId) === rawFamilyId)
    ) {
      return true;
    }
    const itemKey = normalizeBaseKey(item.displayName || item.name || "");
    return Boolean(targetKey && itemKey && targetKey === itemKey);
  });

  if (
    candidates.length === 0 &&
    Array.isArray(m.flavors) &&
    m.flavors.length > 0
  ) {
    candidates = m.flavors;
  }

  if (candidates.length === 0) return m;
  if (candidates.length === 1) return candidates[0];

  if (Array.isArray(stagedExtras) && stagedExtras.length > 0) {
    const resolvedExtras = stagedExtras.map((s: any) =>
      resolveRealReportMod(s, [], modList)
    );
    const stagedHashes = new Set(
      resolvedExtras.map((s: any) => s?.hash).filter(Boolean)
    );
    const stagedNames = new Set(
      resolvedExtras
        .map((s: any) => String(s?.name || "").toLowerCase())
        .filter(Boolean)
    );
    const stagedExts = new Set(
      resolvedExtras
        .map((s: any) => getModExtensionLabel(s, undefined, modList))
        .filter(Boolean)
    );

    const notInStaged = candidates.filter(
      (c: any) =>
        !(c.hash && stagedHashes.has(c.hash)) &&
        !(c.name && stagedNames.has(String(c.name).toLowerCase()))
    );
    if (notInStaged.length > 0) {
      return notInStaged[0];
    }

    const diffExt = candidates.filter(
      (c: any) => !stagedExts.has(getModExtensionLabel(c, undefined, modList))
    );
    if (diffExt.length > 0) {
      return diffExt[0];
    }
  }

  return candidates[0];
}

/**
 * Cleans a mod's base display name (stripping file extensions and redundant trailing _Scripts suffix
 * since the [ts4script] / [package] tag explicitly shows the file type).
 */
export function getCleanModBaseName(m: any): string {
  if (!m) return "UNKNOWN";
  const raw =
    typeof m === "string"
      ? m
      : m.displayName || m.name || "UNKNOWN";
  return String(raw)
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(package|ts4scripts?|scripts?|world|zip|rar|7z|asi|dll|archive|pak)$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+scripts?$/i, "")
    .trim()
    .toUpperCase();
}

/**
 * Formats a mod with its file extension and version number:
 * Ex: `UI CHEATS EXTENSION [ts4script] (1.54)`
 */
export function formatModWithExtAndVersion(
  m: any,
  activeGameSchema?: any,
  modList?: any[],
  companionMods?: any[]
): string {
  if (!m) return "UNKNOWN";
  const resolved = resolveRealReportMod(m, companionMods, modList);
  const baseName = getCleanModBaseName(resolved);
  const ext = getModExtensionLabel(
    resolved,
    activeGameSchema,
    modList,
    companionMods
  );
  const ver = getModVersionLabel(resolved, modList, companionMods);
  return `${baseName} [${ext}] (${ver})`;
}

/**
 * Builds the complete Sanctuary OS Lab Report text (`Lab_Report_#.txt`), including:
 * - Target Mod metadata
 * - Dependencies Loaded for Test (Symbiotic) & Missing Dependencies
 * - Conflicts Loaded for Test (Adversarial)
 * - Known Error Stamp (if applicable)
 * - Scrubbed Execution Log (`[REDACTED BY SANCTUARY]`)
 */
export function buildFormattedLabReportText(opts: BuildLabReportOptions): string {
  const {
    reportNumber,
    mod,
    targetMod,
    errorFound = false,
    time,
    date,
    selectedVersion,
    gameVersion,
    logSnippet,
    rawLogText,
    conflictTarget,
    stagedExtras = [],
    conflictExtras = [],
    missingDeps = [],
    linkedFiles = [],
    matchedRules: explicitMatchedRules,
    activeGameSchema,
    modList,
  } = opts;

  const resolvedMod = resolveRealReportMod(
    mod || targetMod,
    stagedExtras,
    modList
  );
  const resolvedVersion = selectedVersion || gameVersion || "Local";
  const resolvedRawLog = logSnippet ?? rawLogText ?? "";
  const resolvedDate =
    date || (time ? new Date(time).toLocaleString() : new Date().toLocaleString());

  const scrubbedLog = scrubLogUserData(resolvedRawLog);
  const matchedRules: SchemaExceptionRule[] =
    Array.isArray(explicitMatchedRules) && explicitMatchedRules.length > 0
      ? explicitMatchedRules
      : matchExceptionRules(scrubbedLog, activeGameSchema);

  const formatEntry = (item: any, companions?: any[]) =>
    formatModWithExtAndVersion(
      resolveRealReportMod(item, companions, modList),
      activeGameSchema,
      modList,
      companions
    );

  const depsList = (Array.isArray(stagedExtras) ? stagedExtras : [])
    .map((d) => formatEntry(d))
    .filter(Boolean);
  const missingList = (Array.isArray(missingDeps) ? missingDeps : [])
    .map((mItem) => formatEntry(mItem))
    .filter(Boolean);
  const conflictsList = [
    ...(conflictTarget ? [`[Primary Adversary] ${formatEntry(conflictTarget)}`] : []),
    ...(Array.isArray(conflictExtras) ? conflictExtras : []).map(
      (c) => `[Additional Adversary] ${formatEntry(c)}`
    ),
  ].filter(Boolean);

  const targetFormatted = resolvedMod
    ? formatEntry(resolvedMod, stagedExtras)
    : "Unknown";
  const targetModVersion = getModVersionLabel(resolvedMod, modList, stagedExtras);
  const targetModExt = getModExtensionLabel(
    resolvedMod,
    activeGameSchema,
    modList,
    stagedExtras
  );

  const lines: string[] = [
    "=========================================",
    `SANCTUARY OS LAB REPORT (Lab_Report_${reportNumber})`,
    "=========================================",
    `Report ID     : Lab_Report_${reportNumber}`,
    `Date          : ${resolvedDate}`,
    `Verdict       : ${errorFound ? "FAILED (Exception Detected)" : "VERIFIED (Passed)"}`,
    `Game Version  : ${resolvedVersion}`,
    `Target Mod    : ${targetFormatted}`,
    `File Type     : [${targetModExt}]`,
    `Mod Version   : ${targetModVersion}`,
    `Mod ID (Hash) : ${resolvedMod?.hash || resolvedMod?.id || "N/A"}`,
    `Privacy Guard : User Data Scrubbed (${REDACTED_TOKEN})`,
    "",
    "-----------------------------------------",
    "DEPENDENCIES & CONFLICTS LOADED FOR TEST",
    "-----------------------------------------",
    `Dependencies Loaded (${depsList.length}):`,
    ...(depsList.length > 0 ? depsList.map((d) => `  - ${d}`) : ["  - None Loaded"]),
  ];

  if (missingList.length > 0) {
    lines.push(
      `Missing Dependencies (${missingList.length}):`,
      ...missingList.map((mItem) => `  - [MISSING] ${mItem}`)
    );
  }

  lines.push(
    `Conflicts Loaded (${conflictsList.length}):`,
    ...(conflictsList.length > 0 ? conflictsList.map((c) => `  - ${c}`) : ["  - None Loaded"])
  );

  if (Array.isArray(linkedFiles) && linkedFiles.length > 0) {
    lines.push(
      `Sandbox Deployed Files (${linkedFiles.length}):`,
      ...linkedFiles.map((f) => `  - ${scrubLogUserData(f)}`)
    );
  }

  if (matchedRules.length > 0) {
    lines.push(
      "",
      "-----------------------------------------",
      "KNOWN ERROR STAMP (COMMUNITY DIAGNOSIS)",
      "-----------------------------------------"
    );
    matchedRules.forEach((rule, idx) => {
      const rawNormSev = normalizeRuleSeverity(rule);
      const normSev =
        rawNormSev === "unrelated" && errorFound ? "unstable" : rawNormSev;
      const sevLabel =
        normSev === "corrupted"
          ? "CORRUPTED (FATAL MOD ERROR)"
          : normSev === "unrelated"
            ? "UNRELATED (NORMAL BASE GAME BUG)"
            : "UNSTABLE (UI / AUTONOMY EXCEPTION)";
      if (idx > 0) lines.push("---");
      lines.push(
        `[KNOWN ERROR STAMP]: ${rule.title}`,
        `Classification   : ${sevLabel}`,
        `Matched Pattern  : ${rule.pattern}`,
        ...(rule.file_hint ? [`Log File Hint    : ${rule.file_hint}`] : []),
        `Diagnosis        : ${rule.diagnosis}`,
        `Recommended Fix  : ${rule.resolution}`
      );
    });
  }

  lines.push(
    "=========================================",
    "",
    "--- EXECUTION LOG (SCRUBBED BY SANCTUARY) ---",
    formatHumanReadableLogText(scrubbedLog) || "No execution log recorded."
  );

  return lines.join("\n");
}



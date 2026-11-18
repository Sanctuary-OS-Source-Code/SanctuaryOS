import { isModBinaryExtension, isScriptExtension } from "../../shared";

export const LAB_PANEL_MEMORY_KEY = "sanctuary_lab_panel_memory";

export function resolveSpokeLabScopeKey(activeWorkspaceId?: string | null, activeGameSchema?: any): string {
  const raw =
    (activeWorkspaceId && activeWorkspaceId !== "default_workspace" ? activeWorkspaceId : "") ||
    activeGameSchema?.id ||
    activeGameSchema?.game_id ||
    "";
  const clean = String(raw || "").trim().toLowerCase();
  if (!clean || clean === "default_workspace" || clean === "default_schema") {
    return "default_workspace";
  }
  return clean;
}

export function resolveDefaultRealLogName(activeGameSchema?: any): string {
  const logs = activeGameSchema?.exception_logs;
  if (Array.isArray(logs) && logs.length > 0) {
    for (const entry of logs) {
      const raw =
        typeof entry === "string"
          ? entry
          : entry?.file_name || entry?.exact_name || entry?.pattern || "";
      const cleaned = String(raw || "")
        .trim()
        .replace(/[*?]/g, "");
      if (cleaned && /\.[a-z0-9]+$/i.test(cleaned)) {
        return cleaned;
      }
    }
  }
  return "exception.log";
}

export function parseLabTimestamp(raw: any): Date {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 0 && raw < 100_000_000_000 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num > 0 && num < 100_000_000_000 ? num * 1000 : num;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function isLabTestableArtifact(mod: any, activeGameSchema: any): boolean {
  if (!mod || mod.isVirtual) return false;
  const rawName = String(mod.name || mod.physical_path || "").trim();
  if (!rawName) return false;
  const baseName = (rawName.split(/[\\/]/).pop() || rawName).toLowerCase();
  if (!baseName) return false;

  // Exclude Sanctuary OS internal metadata sidecars, templates, and lexicon JSONs
  if (
    baseName.includes(".sanctuary.") ||
    baseName === "manifest.json" ||
    baseName === "override.json" ||
    baseName.endsWith(".manifest.json") ||
    baseName.endsWith(".override.json") ||
    /^[a-z]{2}-[a-z0-9_-]+\.json$/i.test(baseName)
  ) {
    return false;
  }

  const categoryLower = String(mod.category || mod.type || "").trim().toLowerCase();
  if (categoryLower === "configuration" || categoryLower === "config") {
    return false;
  }

  const normalizeExt = (val: any): string => {
    const raw =
      typeof val === "string"
        ? val
        : val?.extension || val?.ext || val?.format || "";
    const trimmed = String(raw || "").trim().toLowerCase();
    if (!trimmed) return "";
    return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
  };

  const extBlock = activeGameSchema?.extensions || {};
  const scriptExts = new Set<string>(
    (Array.isArray(extBlock.script_extensions) ? extBlock.script_extensions : [])
      .map(normalizeExt)
      .filter(Boolean)
  );
  const matchesAnyExt = (extSet: Set<string>) => {
    for (const ext of extSet) {
      if (baseName.endsWith(ext)) return true;
    }
    return false;
  };

  if (matchesAnyExt(scriptExts)) {
    return true;
  }

  const nonModExts = new Set<string>(
    [
      ...(Array.isArray(extBlock.config_extensions) ? extBlock.config_extensions : []),
      ...(Array.isArray(extBlock.editable_config_formats) ? extBlock.editable_config_formats : []),
      ...(Array.isArray(extBlock.ignore_unidentified) ? extBlock.ignore_unidentified : []),
    ]
      .map(normalizeExt)
      .filter(Boolean)
  );
  if (matchesAnyExt(nonModExts)) {
    return false;
  }

  const exactExcludedFiles = new Set<string>(
    [
      activeGameSchema?.paths?.manifest_file,
      activeGameSchema?.load_order?.manifest_file,
      ...(Array.isArray(extBlock.cache_files) ? extBlock.cache_files : []),
    ]
      .map((f: any) => String(f || "").split(/[\\/]/).pop()?.trim().toLowerCase() || "")
      .filter(Boolean)
  );
  if (exactExcludedFiles.has(baseName)) {
    return false;
  }

  if (Array.isArray(extBlock.vault_visible) && extBlock.vault_visible.length > 0) {
    const visibleExts = new Set<string>(extBlock.vault_visible.map(normalizeExt).filter(Boolean));
    return matchesAnyExt(visibleExts);
  }

  if (Array.isArray(extBlock.supported) && extBlock.supported.length > 0) {
    return isModBinaryExtension(rawName, activeGameSchema) || isScriptExtension(rawName, activeGameSchema);
  }

  if (/\.(json|jsonc|ini|cfg|toml|yaml|yml|txt|md|log)$/i.test(baseName)) {
    return false;
  }
  return true;
}

export function LabFilterSection({
  title,
  options,
  value,
  onChange,
  t,
}: {
  title: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
  t: (key: string, fallback: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1 flex items-center gap-2">
        <span>{title}</span>
        <div className="h-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)] flex-1"></div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const active = String(value).toLowerCase() === String(opt.id).toLowerCase();
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`sa-dropdown-item flex items-center justify-between gap-2.5 px-3 py-2 text-[11px] capitalize tracking-wide text-left cursor-pointer ${
                active ? "is-selected font-bold" : "font-semibold"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {active && (
                <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                  {t("icon_check", "check")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

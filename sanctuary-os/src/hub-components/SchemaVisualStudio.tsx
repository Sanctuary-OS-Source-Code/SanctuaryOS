import { useState, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import { getSafeSchema } from "../store";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";

type SchemaMainTab = "identity_paths" | "routing_ext" | "load_lab" | "rules_capsule";

export interface SchemaVisualStudioProps {
  content: string;
  onChange: (newContent: string) => void;
  fileName?: string;
  isKeepers?: boolean;
}

function StringListBuilder({
  items = [],
  onChange,
  placeholder,
  addButtonLabel,
  mono = true,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addButtonLabel: string;
  mono?: boolean;
}) {
  const { t } = useLexicon();
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    const val = draft.trim();
    if (!val) return;
    if (!items.includes(val)) {
      onChange([...items, val]);
    }
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {items.map((item, idx) => (
            <div
              key={`${item}-${idx}`}
              className="glass-panel rounded-xl px-3.5 py-2 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-bold text-[var(--text)] flex items-center justify-between gap-2"
            >
              <span className={`truncate ${mono ? "font-mono text-[var(--accent)]" : ""}`}>
                {item}
              </span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                className="text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer flex items-center shrink-0"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_delete", "delete")}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className={`flex-1 h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] ${
            mono ? "font-mono" : ""
          }`}
        />
        <ActionButton
          variant="accent"
          icon={t("icon_add", "add")}
          disabled={!draft.trim()}
          onClick={handleAdd}
          className="!h-10 !px-4 !text-xs !rounded-xl"
        >
          {addButtonLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function KeyValueMapBuilder({
  record = {},
  onChange,
  keyPlaceholder,
  valPlaceholder,
}: {
  record: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder: string;
  valPlaceholder: string;
}) {
  const { t } = useLexicon();
  const [newK, setNewK] = useState("");
  const [newV, setNewV] = useState("");

  const entries = Object.entries(record || {});

  const handleAdd = () => {
    const k = newK.trim();
    const v = newV.trim();
    if (!k) return;
    onChange({ ...record, [k]: v });
    setNewK("");
    setNewV("");
  };

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[150px_1fr_auto] gap-2.5 items-center">
          <div className="h-10 glass-panel rounded-xl px-3.5 flex items-center text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] truncate">
            {k}
          </div>
          <input
            type="text"
            value={v}
            onChange={(e) => onChange({ ...record, [k]: e.target.value })}
            className="h-10 glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => {
              const next = { ...record };
              delete next[k];
              onChange(next);
            }}
            className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_delete", "delete")}
            </span>
          </button>
        </div>
      ))}
      <div className="grid grid-cols-[150px_1fr_auto] gap-2.5 items-center pt-1">
        <input
          type="text"
          value={newK}
          onChange={(e) => setNewK(e.target.value)}
          placeholder={keyPlaceholder}
          className="h-10 glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="text"
          value={newV}
          onChange={(e) => setNewV(e.target.value)}
          placeholder={valPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="h-10 glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newK.trim()}
          className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center cursor-pointer disabled:opacity-40"
        >
          <span className="material-symbols-outlined !text-[16px]">{t("icon_add", "add")}</span>
        </button>
      </div>
    </div>
  );
}

export default function SchemaVisualStudio({
  content,
  onChange,
  fileName = "",
}: SchemaVisualStudioProps) {
  const { t } = useLexicon();
  const [activeTab, setActiveTab] = useState<SchemaMainTab>("identity_paths");

  const { parsedSchema, parseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(content || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsedSchema: parsed as Record<string, any>, parseError: null };
      }
      return { parsedSchema: {} as Record<string, any>, parseError: "Root JSON must be an object" };
    } catch (e: any) {
      return { parsedSchema: {} as Record<string, any>, parseError: e?.message || "Invalid JSON" };
    }
  }, [content]);

  const commitSchema = (nextSchema: Record<string, any>) => {
    onChange(JSON.stringify(nextSchema, null, 2));
  };

  const updateField = (key: string, value: any) => {
    commitSchema({ ...parsedSchema, [key]: value });
  };

  const updateNestedField = (parentKey: string, childKey: string, value: any) => {
    const parentObj =
      parsedSchema[parentKey] && typeof parsedSchema[parentKey] === "object"
        ? parsedSchema[parentKey]
        : {};
    commitSchema({
      ...parsedSchema,
      [parentKey]: {
        ...parentObj,
        [childKey]: value,
      },
    });
  };

  const handleSeedDefaults = () => {
    const fallbackId = parsedSchema.id || fileName.replace(/\.json$/i, "") || "sims4";
    const seeded = getSafeSchema(parsedSchema, fallbackId);
    commitSchema(seeded);
  };

  if (parseError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <div className="glass-panel rounded-3xl p-8 border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] max-w-xl w-full text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] flex items-center justify-center text-[var(--danger)]">
            <span className="material-symbols-outlined !text-3xl">{t("icon_error", "error")}</span>
          </div>
          <h3 className="text-lg font-black text-[var(--text)] tracking-wide">
            {t("publish_disabled_errors_desc", "Fix syntax errors before saving")}
          </h3>
          <p className="text-xs font-mono text-[var(--danger)] opacity-85 px-4 py-2.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] w-full break-all">
            {parseError}
          </p>
        </div>
      </div>
    );
  }

  const pathsObj = parsedSchema.paths || {};
  const extObj = parsedSchema.extensions || {};
  const routesArr: any[] = Array.isArray(parsedSchema.install_routes)
    ? parsedSchema.install_routes
    : [];
  const loadOrderObj = parsedSchema.load_order || {};
  const priorityTiers: any[] = Array.isArray(loadOrderObj.priority_tiers)
    ? loadOrderObj.priority_tiers
    : [];
  const labObj = parsedSchema.lab_verification || {};
  const worldSig = labObj.world_load_signature || {};
  const exceptionRules: any[] = Array.isArray(parsedSchema.exception_rules)
    ? parsedSchema.exception_rules
    : [];
  const capsuleObj = parsedSchema.time_capsule || {};
  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-y-auto custom-scrollbar px-5 pt-4 pb-10 gap-4 select-none">
      {/* 1. Sleek Header Bar + 1x4 DashboardStatTile Filter Grid */}
      <div className="flex flex-col gap-3.5 pb-1 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col justify-start min-w-0">
            <input
              type="text"
              value={parsedSchema.display_name || parsedSchema.name || fileName.replace(/\.json$/i, "")}
              onChange={(e) => updateField("display_name", e.target.value)}
              className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-xl md:text-2xl font-black text-[var(--text)] tracking-tight transition-colors py-0.5 truncate"
              placeholder={t("schema_studio_display_name", "Display Name")}
            />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 mt-0.5 truncate">
              {`${fileName || "schema.json"} • v${parsedSchema.schema_version ?? 1} • ${
                (extObj.supported || []).length
              } ${t("extensions", "Extensions")}`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ActionButton
              variant="glass"
              icon={t("icon_auto_fix_high", "auto_fix_high")}
              label={t("schema_studio_populate_defaults", "Populate Safe Defaults")}
              onClick={handleSeedDefaults}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 w-full">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_badge", "badge")}
            label={t("schema_studio_sec_identity", "Identity & Paths")}
            value={parsedSchema.id || "core"}
            isActive={activeTab === "identity_paths"}
            onClick={() => setActiveTab("identity_paths")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_alt_route", "alt_route")}
            label={t("schema_studio_sec_routes", "Extensions & Routes")}
            value={String(routesArr.length)}
            isActive={activeTab === "routing_ext"}
            onClick={() => setActiveTab("routing_ext")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_science", "science")}
            label={t("schema_studio_sec_lab", "Load Order & {Lab}")}
            value={String(priorityTiers.length)}
            isActive={activeTab === "load_lab"}
            onClick={() => setActiveTab("load_lab")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_bug_report", "bug_report")}
            label={t("schema_studio_sec_exceptions", "Rules & {Backups}")}
            value={String(exceptionRules.length)}
            isActive={activeTab === "rules_capsule"}
            onClick={() => setActiveTab("rules_capsule")}
          />
        </div>
      </div>

      {/* =====================================================================
          TAB 1: IDENTITY & PATHS
         ===================================================================== */}
      {activeTab === "identity_paths" && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_identity", "Identity & Core")}
            icon={t("icon_badge", "badge")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_auto_fix_high", "auto_fix_high")}
                onClick={handleSeedDefaults}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_reset_defaults", "Populate Safe Defaults")}
              </ActionButton>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_id", "Schema ID (id)")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.id ?? ""}
                  onChange={(e) => updateField("id", e.target.value)}
                  placeholder="sims4"
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_game_id", "Game Identifier (game_id)")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.game_id ?? ""}
                  onChange={(e) => updateField("game_id", e.target.value)}
                  placeholder="sims4"
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_display_name", "Display Title (display_name)")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.display_name ?? ""}
                  onChange={(e) => updateField("display_name", e.target.value)}
                  placeholder="The Sims 4"
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_default_lexicon", "Default Lexicon Pack")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.default_lexicon ?? "en-default"}
                  onChange={(e) => updateField("default_lexicon", e.target.value)}
                  placeholder="en-default"
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_version", "Schema Version")}
                </label>
                <input
                  type="number"
                  value={parsedSchema.schema_version ?? 1}
                  onChange={(e) => updateField("schema_version", Number(e.target.value) || 1)}
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_min_scout", "Min Scout Submissions")}
                </label>
                <input
                  type="number"
                  value={parsedSchema.min_scout_submissions ?? 3}
                  onChange={(e) => updateField("min_scout_submissions", Number(e.target.value) || 1)}
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_paths", "Executables & Paths")}
            icon={t("icon_folder_open", "folder_open")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_exe_list", "Game Executable Binaries (executable_names)")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.executable_names)
                      ? parsedSchema.executable_names
                      : []
                  }
                  onChange={(next) => updateField("executable_names", next)}
                  placeholder="e.g. TS4_x64.exe"
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_win_mod_dir", "Default Windows {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_windows ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_windows", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/Electronic Arts/The Sims 4/Mods"
                    className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_mac_mod_dir", "Default macOS {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_mac ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_mac", e.target.value)
                    }
                    placeholder="~/Documents/Electronic Arts/The Sims 4/Mods"
                    className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_manifest_file", "Engine Manifest File")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.manifest_file ?? "Resource.cfg"}
                    onChange={(e) => updateNestedField("paths", "manifest_file", e.target.value)}
                    placeholder="Resource.cfg"
                    className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 2: EXTENSIONS & INSTALL ROUTES
         ===================================================================== */}
      {activeTab === "routing_ext" && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_extensions", "Extensions & Parsers")}
            icon={t("icon_extension", "extension")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_supported_ext", "Supported {Mod} Extensions")}
                </label>
                <StringListBuilder
                  items={Array.isArray(extObj.supported) ? extObj.supported : []}
                  onChange={(next) => updateNestedField("extensions", "supported", next)}
                  placeholder=".package"
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ext_parsers", "Binary Extension Parsers")}
                  </label>
                  <KeyValueMapBuilder
                    record={extObj.parsers || {}}
                    onChange={(next) => updateNestedField("extensions", "parsers", next)}
                    keyPlaceholder=".package"
                    valPlaceholder="dbpf / zip_python"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ext_labels", "Extension Badge Labels")}
                  </label>
                  <KeyValueMapBuilder
                    record={extObj.labels || {}}
                    onChange={(next) => updateNestedField("extensions", "labels", next)}
                    keyPlaceholder="package"
                    valPlaceholder="PACKAGE"
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={`${t("schema_studio_sec_routes", "Install Routes")} (${routesArr.length})`}
            icon={t("icon_alt_route", "alt_route")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const nextRoute = {
                    id: `route_${routesArr.length + 1}`,
                    label: "Custom Install Route",
                    extensions: [".package"],
                    folder_match: "",
                    target_root: "live_path",
                    target_subdir: "",
                    preserve_vanilla: true,
                  };
                  updateField("install_routes", [...routesArr, nextRoute]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_route", "Add Install Route")}
              </ActionButton>
            }
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
              {routesArr.map((route, idx) => (
                <div
                  key={`${route.id || idx}-${idx}`}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[var(--accent)] font-mono">
                      {`#${idx + 1} • ${route.id || "route"}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          "install_routes",
                          routesArr.filter((_, i) => i !== idx)
                        )
                      }
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_id", "Route ID")}
                      </label>
                      <input
                        type="text"
                        value={route.id ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, id: e.target.value };
                          updateField("install_routes", next);
                        }}
                        className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_label", "Route Label")}
                      </label>
                      <input
                        type="text"
                        value={route.label ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, label: e.target.value };
                          updateField("install_routes", next);
                        }}
                        className="h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 3: LOAD ORDER & LAB VERIFICATION
         ===================================================================== */}
      {activeTab === "load_lab" && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_load_order", "Load Order & Tiers")}
            icon={t("icon_low_priority", "low_priority")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const nextTier = {
                    id: `tier_${priorityTiers.length}`,
                    label: `Tier ${priorityTiers.length}`,
                    priority: 500 + priorityTiers.length * 500,
                    folder: `Sanctuary${priorityTiers.length}`,
                  };
                  updateNestedField("load_order", "priority_tiers", [...priorityTiers, nextTier]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_tier", "Add Priority Tier")}
              </ActionButton>
            }
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_strategy", "Load Order Strategy")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={loadOrderObj.strategy ?? "folder_priority"}
                    onChange={(v: string[]) => updateNestedField("load_order", "strategy", v[0])}
                    options={[
                      { id: "folder_priority", label: "Folder Priority (Resource.cfg)" },
                      { id: "manifest_list", label: "Manifest List (plugins.txt)" },
                      { id: "numeric_prefix", label: "Numeric Prefix ({index}_)" },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_direction", "Winner Direction")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={loadOrderObj.direction ?? "higher_wins"}
                    onChange={(v: string[]) => updateNestedField("load_order", "direction", v[0])}
                    options={[
                      { id: "higher_wins", label: "Higher Priority Number Wins" },
                      { id: "lower_wins", label: "Lower Priority Number Wins" },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_manifest_file", "Engine Manifest File")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.manifest_file ?? "Resource.cfg"}
                    onChange={(e) =>
                      updateNestedField("load_order", "manifest_file", e.target.value)
                    }
                    className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {priorityTiers.map((tier, idx) => (
                  <div
                    key={`${tier.id || idx}-${idx}`}
                    className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid grid-cols-[1fr_90px_1fr_auto] gap-2.5 items-end"
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_label", "Label")}
                      </label>
                      <input
                        type="text"
                        value={tier.label ?? ""}
                        onChange={(e) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, label: e.target.value };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                        className="h-10 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_tier_priority", "Priority")}
                      </label>
                      <input
                        type="number"
                        value={tier.priority ?? 500}
                        onChange={(e) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, priority: Number(e.target.value) || 0 };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                        className="h-10 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_tier_folder", "Folder")}
                      </label>
                      <input
                        type="text"
                        value={tier.folder ?? ""}
                        onChange={(e) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, folder: e.target.value };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                        placeholder="(Base)"
                        className="h-10 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateNestedField(
                          "load_order",
                          "priority_tiers",
                          priorityTiers.filter((_, i) => i !== idx)
                        )
                      }
                      className="w-9 h-10 rounded-xl flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_lab", "{Lab} Verification")}
            icon={t("icon_science", "science")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_lab_active_sec", "Required Active Seconds")}
                </label>
                <input
                  type="number"
                  value={labObj.required_active_seconds ?? 120}
                  onChange={(e) =>
                    updateNestedField(
                      "lab_verification",
                      "required_active_seconds",
                      Number(e.target.value) || 0
                    )
                  }
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_lab_idle_sec", "Max Allowed Idle Seconds")}
                </label>
                <input
                  type="number"
                  value={labObj.max_idle_seconds ?? 20}
                  onChange={(e) =>
                    updateNestedField(
                      "lab_verification",
                      "max_idle_seconds",
                      Number(e.target.value) || 0
                    )
                  }
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_lab_disk_mb", "Min Disk Read (MB)")}
                </label>
                <input
                  type="number"
                  value={worldSig.min_disk_read_mb ?? 75}
                  onChange={(e) =>
                    updateNestedField("lab_verification", "world_load_signature", {
                      ...worldSig,
                      min_disk_read_mb: Number(e.target.value) || 0,
                    })
                  }
                  className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 4: EXCEPTION RULES, BACKUPS & EXTERNAL TOOLS
         ===================================================================== */}
      {activeTab === "rules_capsule" && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-200">
          <UniversalGroup
            title={`${t("schema_studio_sec_exceptions", "Exception Rules")} (${exceptionRules.length})`}
            icon={t("icon_bug_report", "bug_report")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  const newRule = {
                    id: `rule_${exceptionRules.length + 1}`,
                    title: "New Exception Signature",
                    pattern: "ExceptionToken | ErrorKeyword",
                    file_hint: "lastException.txt",
                    severity: "warning",
                    diagnosis: "",
                    resolution: "",
                    ignore_in_lab: false,
                    enabled: true,
                  };
                  updateField("exception_rules", [newRule, ...exceptionRules]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_exception", "Add Exception Rule")}
              </ActionButton>
            }
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
              {exceptionRules.map((rule, idx) => (
                <div
                  key={`${rule.id || idx}-${idx}`}
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[var(--text)] truncate">
                      {rule.title || rule.id}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          "exception_rules",
                          exceptionRules.filter((_, i) => i !== idx)
                        )
                      }
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={rule.title ?? ""}
                    onChange={(e) => {
                      const next = [...exceptionRules];
                      next[idx] = { ...rule, title: e.target.value };
                      updateField("exception_rules", next);
                    }}
                    placeholder="Rule Title"
                    className="h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />

                  <input
                    type="text"
                    value={rule.pattern ?? ""}
                    onChange={(e) => {
                      const next = [...exceptionRules];
                      next[idx] = { ...rule, pattern: e.target.value };
                      updateField("exception_rules", next);
                    }}
                    placeholder="Pattern1 | Pattern2"
                    className="h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>
              ))}
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_capsule", "{Backups} & Tools")}
            icon={t("icon_history", "history")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_tc_airgap_targets", "Save Airgap Isolation Directories")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(capsuleObj.save_airgap_targets)
                      ? capsuleObj.save_airgap_targets
                      : ["saves"]
                  }
                  onChange={(next) =>
                    updateNestedField("time_capsule", "save_airgap_targets", next)
                  }
                  placeholder="saves"
                  addButtonLabel={t("add", "Add")}
                />
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}
    </div>
  );
}

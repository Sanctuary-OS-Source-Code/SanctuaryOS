import { useState, useMemo } from "react";
import { useLexicon } from "../LexiconContext";
import { getSafeSchema } from "../store";
import {
  GAME_ARCHITECTURE_PRESETS,
  resolvePresetForGameId,
} from "../utils/gameArchitecturePresets";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
  HoverTooltip,
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";

type SchemaMainTab = "identity_paths" | "routing_ext" | "load_lab" | "rules_capsule";

export interface SchemaVisualStudioProps {
  content: string;
  onChange: (newContent: string) => void;
  fileName?: string;
  isKeepers?: boolean;
}

function GlassNumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className = "",
  accentText = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  accentText?: boolean;
}) {
  const { t } = useLexicon();
  const numericVal = Number.isFinite(Number(value)) ? Number(value) : min;

  const applyDelta = (delta: number) => {
    let next = numericVal + delta;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    onChange(next);
  };

  return (
    <div
      className={`h-10 glass-panel rounded-xl px-1.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-between gap-1 ${className}`}
    >
      <button
        type="button"
        onClick={() => applyDelta(-step)}
        disabled={typeof min === "number" && numericVal <= min}
        className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
      >
        <span className="material-symbols-outlined !text-[15px]">
          {t("icon_remove", "remove")}
        </span>
      </button>
      <input
        type="number"
        value={numericVal}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isNaN(parsed)) {
            onChange(min);
            return;
          }
          let clamped = parsed;
          if (typeof min === "number") clamped = Math.max(min, clamped);
          if (typeof max === "number") clamped = Math.min(max, clamped);
          onChange(clamped);
        }}
        className={`flex-1 min-w-0 w-full bg-transparent border-none text-center text-xs font-mono font-bold focus:outline-none px-1 ${
          accentText ? "text-[var(--accent)]" : "text-[var(--text)]"
        }`}
      />
      <button
        type="button"
        onClick={() => applyDelta(step)}
        disabled={typeof max === "number" && numericVal >= max}
        className="w-7 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--accent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-all cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
      >
        <span className="material-symbols-outlined !text-[15px]">
          {t("icon_add", "add")}
        </span>
      </button>
    </div>
  );
}

function StringListBuilder({
  items = [],
  onChange,
  placeholder,
  addButtonLabel,
  mono = true,
  layout = "chips",
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addButtonLabel: string;
  mono?: boolean;
  layout?: "chips" | "paths";
}) {
  const { t } = useLexicon();
  const [draft, setDraft] = useState("");

  const cleanItems = useMemo(
    () =>
      (Array.isArray(items) ? items : []).filter(
        (it) => typeof it === "string" && it.trim().length > 0
      ),
    [items]
  );

  const handleAdd = () => {
    const val = draft.trim();
    if (!val) return;
    if (!cleanItems.includes(val)) {
      onChange([...cleanItems, val]);
    }
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {cleanItems.length > 0 &&
        (layout === "paths" ? (
          <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
            {cleanItems.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="h-10 min-h-[40px] shrink-0 glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-bold text-[var(--text)] flex items-center justify-between gap-2.5 min-w-0"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)] opacity-75 shrink-0">
                    {t("icon_folder", "folder")}
                  </span>
                  <span
                    className={`truncate min-w-0 flex-1 ${
                      mono ? "font-mono text-[var(--accent)]" : ""
                    }`}
                  >
                    {item}
                    <HoverTooltip title={item} onlyWhenTruncated />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(cleanItems.filter((_, i) => i !== idx))}
                  className="w-7 h-7 rounded-lg text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer flex items-center justify-center shrink-0"
                >
                  <span className="material-symbols-outlined !text-[15px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip title={t("delete", "Delete")} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cleanItems.map((item, idx) => (
              <div
                key={`${item}-${idx}`}
                className="h-9 min-h-[36px] shrink-0 glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-xs font-bold text-[var(--text)] flex items-center gap-2 max-w-full"
              >
                <span
                  className={`truncate ${mono ? "font-mono text-[var(--accent)]" : ""}`}
                >
                  {item}
                  <HoverTooltip title={item} onlyWhenTruncated />
                </span>
                <button
                  type="button"
                  onClick={() => onChange(cleanItems.filter((_, i) => i !== idx))}
                  className="text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer flex items-center shrink-0"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_delete", "delete")}
                  </span>
                  <HoverTooltip title={t("delete", "Delete")} />
                </button>
              </div>
            ))}
          </div>
        ))}
      <div className="flex items-center gap-2 min-w-0">
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
          className={`flex-1 min-w-0 h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] ${
            mono ? "font-mono" : ""
          }`}
        />
        <ActionButton
          variant="accent"
          icon={t("icon_add", "add")}
          disabled={!draft.trim()}
          onClick={handleAdd}
          className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
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
    <div className="flex flex-col gap-3 min-w-0">
      {entries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {entries.map(([k, v]) => (
            <div
              key={k}
              className="grid grid-cols-[minmax(95px,135px)_minmax(0,1fr)_auto] gap-2 items-center min-w-0"
            >
              <div className="h-10 glass-panel rounded-xl px-3 flex items-center text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] truncate min-w-0">
                <span className="truncate min-w-0">
                  {k}
                  <HoverTooltip title={k} onlyWhenTruncated />
                </span>
              </div>
              <input
                type="text"
                value={v}
                onChange={(e) => onChange({ ...record, [k]: e.target.value })}
                className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => {
                  const next = { ...record };
                  delete next[k];
                  onChange(next);
                }}
                className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined !text-[16px]">
                  {t("icon_delete", "delete")}
                </span>
                <HoverTooltip title={t("delete", "Delete")} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[minmax(110px,160px)_minmax(0,1fr)_auto] gap-2 items-center pt-1 min-w-0">
        <input
          type="text"
          value={newK}
          onChange={(e) => setNewK(e.target.value)}
          placeholder={keyPlaceholder}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
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
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <ActionButton
          variant="accent"
          icon={t("icon_add", "add")}
          disabled={!newK.trim()}
          onClick={handleAdd}
          className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
        >
          {t("add", "Add")}
        </ActionButton>
      </div>
    </div>
  );
}

function TargetListBuilder({
  targets = [],
  onChange,
  namePlaceholder = "Saves",
  pathPlaceholder = "saves",
}: {
  targets: { name: string; path: string }[];
  onChange: (next: { name: string; path: string }[]) => void;
  namePlaceholder?: string;
  pathPlaceholder?: string;
}) {
  const { t } = useLexicon();
  const [draftName, setDraftName] = useState("");
  const [draftPath, setDraftPath] = useState("");

  const handleAdd = () => {
    const n = draftName.trim();
    const p = draftPath.trim();
    if (!n) return;
    onChange([...targets, { name: n, path: p }]);
    setDraftName("");
    setDraftPath("");
  };

  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      {targets.map((tgt, idx) => (
        <div
          key={`${tgt.name}-${idx}`}
          className="grid grid-cols-[minmax(100px,140px)_minmax(0,1fr)_auto] gap-2 items-center min-w-0"
        >
          <input
            type="text"
            value={tgt.name ?? ""}
            onChange={(e) => {
              const next = [...targets];
              next[idx] = { ...tgt, name: e.target.value };
              onChange(next);
            }}
            className="h-10 min-w-0 w-full glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
          />
          <input
            type="text"
            value={tgt.path ?? ""}
            onChange={(e) => {
              const next = [...targets];
              next[idx] = { ...tgt, path: e.target.value };
              onChange(next);
            }}
            className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
          />
          <button
            type="button"
            onClick={() => onChange(targets.filter((_, i) => i !== idx))}
            className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined !text-[16px]">
              {t("icon_delete", "delete")}
            </span>
          </button>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(100px,140px)_minmax(0,1fr)_auto] gap-2 items-center pt-1 min-w-0">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={namePlaceholder}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="text"
          value={draftPath}
          onChange={(e) => setDraftPath(e.target.value)}
          placeholder={pathPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="h-10 min-w-0 w-full glass-surface rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draftName.trim()}
          className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] flex items-center justify-center cursor-pointer disabled:opacity-40"
        >
          <span className="material-symbols-outlined !text-[16px]">{t("icon_add", "add")}</span>
        </button>
      </div>
    </div>
  );
}

function SchemaToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-between gap-3 text-left transition-all cursor-pointer w-full"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-black text-[var(--text)]">{label}</span>
        {description && (
          <span className="text-[10px] font-medium text-[var(--subtext)] opacity-75 leading-relaxed">
            {description}
          </span>
        )}
      </div>
      <div
        className={`sa-glass-toggle shrink-0 ${checked ? "is-on" : ""}`}
        aria-checked={checked}
      >
        <div className="sa-glass-toggle-thumb" />
      </div>
    </button>
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
      return {
        parsedSchema: {} as Record<string, any>,
        parseError: "Root JSON must be an object",
      };
    } catch (e: any) {
      return {
        parsedSchema: {} as Record<string, any>,
        parseError: e?.message || "Invalid JSON",
      };
    }
  }, [content]);

  const fileStem = fileName.replace(/\.json$/i, "") || "universal";
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const initialPreset = resolvePresetForGameId(
      parsedSchema.game_id || parsedSchema.id || fileStem
    );
    return initialPreset.id || "universal";
  });

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
    const fallbackId = parsedSchema.id || fileStem || "universal";
    const seeded = getSafeSchema(parsedSchema, fallbackId);
    commitSchema(seeded);
  };

  const handleApplyArchitecturePreset = (presetKey: string) => {
    const preset = GAME_ARCHITECTURE_PRESETS[presetKey] || GAME_ARCHITECTURE_PRESETS.universal;
    const preserveId = parsedSchema.id || fileStem || preset.id;
    const preserveGameId = parsedSchema.game_id || preset.game_id || preserveId;
    const existingTitle = parsedSchema.display_name || parsedSchema.name;
    const preserveDisplayName =
      existingTitle && existingTitle !== "Universal Game Schema"
        ? existingTitle
        : preset.display_name;
    const next = JSON.parse(JSON.stringify(preset));
    next.id = preserveId;
    next.game_id = preserveGameId;
    next.display_name = preserveDisplayName;
    next.name = preserveDisplayName;
    if (parsedSchema.mod_categories) next.mod_categories = parsedSchema.mod_categories;
    if (parsedSchema.exception_rules) next.exception_rules = parsedSchema.exception_rules;
    if (parsedSchema.lab_verification) next.lab_verification = parsedSchema.lab_verification;
    if (parsedSchema.taxonomy) next.taxonomy = parsedSchema.taxonomy;
    delete next.external_tools;
    commitSchema(next);
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
  const constraintsObj = parsedSchema.constraints || {};
  const versionExtObj = parsedSchema.version_extraction || {};
  const routesArr: any[] = Array.isArray(parsedSchema.install_routes)
    ? parsedSchema.install_routes
    : [];
  const loadOrderObj = parsedSchema.load_order || {};
  const priorityTiers: any[] = Array.isArray(loadOrderObj.priority_tiers)
    ? loadOrderObj.priority_tiers
    : [];
  const labObj = parsedSchema.lab_verification || {};
  const exceptionLogs: any[] = Array.isArray(parsedSchema.exception_logs)
    ? parsedSchema.exception_logs
    : [];
  const capsuleObj = parsedSchema.time_capsule || {};

  const presetOptions = [
    {
      id: "universal",
      label: t("schema_studio_preset_universal", "Universal Game Engine (Agnostic)"),
    },
    {
      id: "sims4",
      label: t("schema_studio_preset_sims4", "The Sims 4 (DBPF + Python Script)"),
    },
    {
      id: "gtav",
      label: t("schema_studio_preset_gtav", "Grand Theft Auto V (RAGE .rpf / .asi / ScriptHookV)"),
    },
    {
      id: "wwe2k",
      label: t("schema_studio_preset_wwe2k", "WWE 2K Series (Baked .cak / .pac / CakeTools)"),
    },
    {
      id: "skyrim",
      label: t("schema_studio_preset_skyrim", "Skyrim / Creation Engine (.esp / .esm / .bsa / SKSE)"),
    },
    {
      id: "cyberpunk2077",
      label: t(
        "schema_studio_preset_cyberpunk",
        "Cyberpunk 2077 (REDengine .archive / REDmod / CET)"
      ),
    },
    {
      id: "bg3",
      label: t("schema_studio_preset_bg3", "Baldur's Gate 3 (Divinity .pak + Script Extender)"),
    },
    {
      id: "stardew",
      label: t("schema_studio_preset_stardew", "Stardew Valley (SMAPI Folder Manifests)"),
    },
  ];

  return (
    <div className="@container flex flex-col h-full min-h-0 w-full overflow-y-auto custom-scrollbar px-5 pt-4 pb-36 gap-4 select-none">
      {/* 1. Sleek Header Bar + Architecture Preset Loader + 1x4 DashboardStatTile Filter Grid */}
      <div className="flex flex-col gap-3.5 pb-1 shrink-0">
        <div className="flex flex-col @[860px]:flex-row @[860px]:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col justify-start min-w-0">
            <input
              type="text"
              value={
                parsedSchema.display_name || parsedSchema.name || fileName.replace(/\.json$/i, "")
              }
              onChange={(e) => updateField("display_name", e.target.value)}
              className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-xl md:text-2xl font-black text-[var(--text)] tracking-tight transition-colors py-0.5 truncate"
              placeholder={t("schema_studio_display_name", "Display Title")}
            />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 mt-0.5 truncate">
              {`${fileName || "schema.json"} • v${parsedSchema.schema_version ?? 1} • ${
                (extObj.supported || []).length
              } ${t("extensions", "Extensions")} • ${routesArr.length} ${t(
                "schema_studio_sec_routes",
                "Install Routes"
              )}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="w-[290px] max-w-full">
              <CustomDropdown
                disableTint={true}
                value={selectedPresetId}
                onChange={(v: string[]) => {
                  const chosen = v[0] || "universal";
                  setSelectedPresetId(chosen);
                }}
                options={presetOptions}
              />
            </div>
            <ActionButton
              variant="accent"
              icon={t("icon_architecture", "architecture")}
              onClick={() => handleApplyArchitecturePreset(selectedPresetId)}
              className="!h-10 !px-3.5 !text-xs !rounded-xl"
            >
              {t("schema_studio_apply_preset", "Apply Preset")}
            </ActionButton>
            <ActionButton
              variant="glass"
              icon={t("icon_auto_fix_high", "auto_fix_high")}
              onClick={handleSeedDefaults}
              className="!h-10 !px-3.5 !text-xs !rounded-xl"
            >
              {t("schema_studio_reset_defaults", "Populate Safe Defaults")}
            </ActionButton>
          </div>
        </div>

        <div className="grid grid-cols-2 @[820px]:grid-cols-4 gap-3 w-full">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_badge", "badge")}
            label={t("schema_studio_tab_identity", "Identity & Paths")}
            value={`${(parsedSchema.executable_names || []).length} ${t(
              "schema_studio_tile_binaries",
              "Binaries"
            )}`}
            isActive={activeTab === "identity_paths"}
            onClick={() => setActiveTab("identity_paths")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_alt_route", "alt_route")}
            label={t("schema_studio_tab_routes", "Extensions & Routes")}
            value={`${(extObj.supported || []).length} ${t("extensions", "Extensions")}`}
            isActive={activeTab === "routing_ext"}
            onClick={() => setActiveTab("routing_ext")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_low_priority", "low_priority")}
            label={t("schema_studio_tab_load_order", "Load Order & Tiers")}
            value={`${priorityTiers.length} ${t("schema_studio_tile_tiers", "Tiers")}`}
            isActive={activeTab === "load_lab"}
            onClick={() => setActiveTab("load_lab")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_history", "history")}
            label={t("schema_studio_tab_logs_backups", "Logs & {Backups}")}
            value={`${exceptionLogs.length} ${t("schema_studio_tile_log_rules", "Log Rules")}`}
            isActive={activeTab === "rules_capsule"}
            onClick={() => setActiveTab("rules_capsule")}
          />
        </div>
      </div>

      {/* =====================================================================
          TAB 1: IDENTITY, PATHS, CONSTRAINTS & VERSION/DLC DETECTION
         ===================================================================== */}
      {activeTab === "identity_paths" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_identity", "Identity & Core")}
            icon={t("icon_badge", "badge")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_id", "Schema ID")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.id ?? ""}
                  onChange={(e) => updateField("id", e.target.value)}
                  placeholder="gtav"
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_game_id", "Game Identifier")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.game_id ?? ""}
                  onChange={(e) => updateField("game_id", e.target.value)}
                  placeholder="gtav"
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_display_name", "Display Title")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.display_name ?? parsedSchema.name ?? ""}
                  onChange={(e) =>
                    commitSchema({
                      ...parsedSchema,
                      display_name: e.target.value,
                      name: e.target.value,
                    })
                  }
                  placeholder="Grand Theft Auto V"
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_default_lexicon", "Default Lexicon Pack")}
                </label>
                <input
                  type="text"
                  value={parsedSchema.default_lexicon ?? "en-default"}
                  onChange={(e) => updateField("default_lexicon", e.target.value)}
                  placeholder="en-default"
                  className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_version", "Schema Version")}
                </label>
                <GlassNumberInput
                  value={parsedSchema.schema_version ?? 2}
                  min={1}
                  onChange={(val) => updateField("schema_version", val)}
                />
              </div>

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_min_scout", "Min Scout Submissions")}
                </label>
                <GlassNumberInput
                  value={parsedSchema.min_scout_submissions ?? 3}
                  min={1}
                  onChange={(val) => updateField("min_scout_submissions", val)}
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_paths", "Executables & Paths")}
            icon={t("icon_folder_open", "folder_open")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_exe_list", "Game Executable Binaries")}
                </label>
                <StringListBuilder
                  items={
                    Array.isArray(parsedSchema.executable_names)
                      ? parsedSchema.executable_names
                      : []
                  }
                  onChange={(next) => updateField("executable_names", next)}
                  placeholder="e.g. GTA5.exe / SkyrimSE.exe / Cyberpunk2077.exe / TS4_x64.exe"
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="grid grid-cols-1 @[780px]:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_exe_subdir", "Executable Subfolder")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.executable_subdir ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "executable_subdir", e.target.value)
                    }
                    placeholder="e.g. Game/Bin or bin/x64 (Blank = Root)"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_manifest_file", "Engine Manifest File")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.manifest_file ?? ""}
                    onChange={(e) => updateNestedField("paths", "manifest_file", e.target.value)}
                    placeholder="Resource.cfg / plugins.txt / (Blank = None)"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_win_mod_dir", "Default Windows {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_windows ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_windows", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_mac_mod_dir", "Default macOS {Mods} Directory")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.default_mod_dir_mac ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "default_mod_dir_mac", e.target.value)
                    }
                    placeholder="~/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_win", "Windows User Data / Saves Root")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_windows ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_windows", e.target.value)
                    }
                    placeholder="%USERPROFILE%/Documents/My Games/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_user_data_mac", "macOS User Data / Saves Root")}
                  </label>
                  <input
                    type="text"
                    value={pathsObj.user_data_dir_mac ?? ""}
                    onChange={(e) =>
                      updateNestedField("paths", "user_data_dir_mac", e.target.value)
                    }
                    placeholder="~/Documents/..."
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 @[920px]:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_win", "Windows Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_windows)
                        ? pathsObj.auto_scan_paths_windows
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("paths", "auto_scan_paths_windows", next)
                    }
                    placeholder="C:/Program Files (x86)/Steam/steamapps/common/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_auto_scan_mac", "macOS Auto-Discovery Paths")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(pathsObj.auto_scan_paths_mac)
                        ? pathsObj.auto_scan_paths_mac
                        : []
                    }
                    onChange={(next) => updateNestedField("paths", "auto_scan_paths_mac", next)}
                    placeholder="/Applications/..."
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_constraints", "Engine Constraints & Vanilla Safety")}
            icon={t("icon_shield", "shield")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
              <SchemaToggleRow
                label={t(
                  "schema_studio_shared_vanilla",
                  "{Mods} Directory Shared With Vanilla Game Files"
                )}
                description={t(
                  "schema_studio_shared_vanilla_desc",
                  "Protects untouched vanilla game files when deploying to shared folders (e.g. Skyrim Data/, GTA V root, WWE 2K root)."
                )}
                checked={Boolean(constraintsObj.mods_dir_is_shared_with_vanilla)}
                onChange={(val) =>
                  updateNestedField("constraints", "mods_dir_is_shared_with_vanilla", val)
                }
              />

              <SchemaToggleRow
                label={t(
                  "schema_studio_preserve_folders",
                  "Preserve Archive Subfolder Hierarchy"
                )}
                description={t(
                  "schema_studio_preserve_folders_desc",
                  "Keeps internal archive paths (e.g. meshes/, textures/, archive/pc/mod/, scripts/) intact on import."
                )}
                checked={Boolean(constraintsObj.preserve_archive_folder_structure)}
                onChange={(val) =>
                  updateNestedField("constraints", "preserve_archive_folder_structure", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_wrap_loose", "Auto-Folder Loose Root {Mod} Files")}
                description={t(
                  "schema_studio_wrap_loose_desc",
                  "Automatically organizes loose single files in the {Vault} root into named subfolders."
                )}
                checked={constraintsObj.wrap_loose_files_in_folders !== false}
                onChange={(val) =>
                  updateNestedField("constraints", "wrap_loose_files_in_folders", val)
                }
              />

              <SchemaToggleRow
                label={t("schema_studio_script_unzip", "Require Script Unzipping Check")}
                description={t(
                  "schema_studio_script_unzip_desc",
                  "Flags nested script archives that must be extracted to load in-engine."
                )}
                checked={Boolean(constraintsObj.requires_script_unzipping)}
                onChange={(val) =>
                  updateNestedField("constraints", "requires_script_unzipping", val)
                }
              />

              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_max_depth", "Max Subfolder Depth")}
                </label>
                <GlassNumberInput
                  value={constraintsObj.max_folder_depth ?? 5}
                  min={1}
                  max={32}
                  onChange={(val) => updateNestedField("constraints", "max_folder_depth", val)}
                  className="max-w-[200px]"
                />
              </div>
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_version_dlc", "Version Ripping & DLC Detection")}
            icon={t("icon_verified", "verified")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_method", "Version Extraction Method")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={versionExtObj.method ?? "pe_header"}
                    onChange={(v: string[]) =>
                      updateNestedField("version_extraction", "method", v[0] || "pe_header")
                    }
                    options={[
                      {
                        id: "pe_header",
                        label: t(
                          "schema_studio_ver_method_pe",
                          "Executable PE Header + Text Fallback"
                        ),
                      },
                      {
                        id: "ini_key",
                        label: t("schema_studio_ver_method_ini", "INI / Config Key Prefix"),
                      },
                      {
                        id: "json_key",
                        label: t("schema_studio_ver_method_json", "JSON Property Key"),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_rel_path", "Version File Relative Path")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.relative_path ?? ""}
                    onChange={(e) =>
                      updateNestedField("version_extraction", "relative_path", e.target.value)
                    }
                    placeholder="e.g. Game/Bin/Default.ini"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ver_line_prefix", "Version Line Prefix / Key")}
                  </label>
                  <input
                    type="text"
                    value={versionExtObj.line_prefix ?? ""}
                    onChange={(e) =>
                      updateNestedField("version_extraction", "line_prefix", e.target.value)
                    }
                    placeholder="e.g. gameversion"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_mask_tpl", "Launch Args DLC Mask Template")}
                  </label>
                  <input
                    type="text"
                    value={parsedSchema.launch_args_dlc_mask_template ?? ""}
                    onChange={(e) =>
                      updateField("launch_args_dlc_mask_template", e.target.value)
                    }
                    placeholder="e.g. -disablepack:{packs}"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_prefixes", "DLC Folder Prefixes")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(parsedSchema.dlc_folder_prefixes)
                        ? parsedSchema.dlc_folder_prefixes
                        : []
                    }
                    onChange={(next) => updateField("dlc_folder_prefixes", next)}
                    placeholder="EP / GP / SP / mp"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_subdirs", "DLC Search Subdirectories")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(parsedSchema.dlc_subdirs) ? parsedSchema.dlc_subdirs : []
                    }
                    onChange={(next) => updateField("dlc_subdirs", next)}
                    placeholder="Data / update/x64/dlcpacks"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_dlc_exts", "DLC File Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(parsedSchema.dlc_file_extensions)
                        ? parsedSchema.dlc_file_extensions
                        : []
                    }
                    onChange={(next) => updateField("dlc_file_extensions", next)}
                    placeholder=".esm / .rpf / .cak"
                    addButtonLabel={t("add", "Add")}
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
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={t("schema_studio_sec_extensions", "Extensions & Badges")}
            icon={t("icon_extension", "extension")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_supported_ext", "Supported {Mod} Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(extObj.supported) ? extObj.supported : []}
                    onChange={(next) => updateNestedField("extensions", "supported", next)}
                    placeholder=".package / .rpf / .cak / .esp / .archive / .pak"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_vault_visible_ext", "{Vault} Visible Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(extObj.vault_visible) ? extObj.vault_visible : []}
                    onChange={(next) => updateNestedField("extensions", "vault_visible", next)}
                    placeholder=".package / .ini / .json"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_config_ext", "Editable Config File Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.config_extensions) ? extObj.config_extensions : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "config_extensions", next)
                    }
                    placeholder=".ini / .cfg / .json / .toml / .yaml"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_ignore_unid_ext", "Ignore Unidentified Extensions")}
                  </label>
                  <StringListBuilder
                    items={
                      Array.isArray(extObj.ignore_unidentified)
                        ? extObj.ignore_unidentified
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("extensions", "ignore_unidentified", next)
                    }
                    placeholder=".txt / .md / .jpg / .png"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_cache_files", "Purgeable Engine Cache Files")}
                </label>
                <StringListBuilder
                  layout="paths"
                  items={Array.isArray(extObj.cache_files) ? extObj.cache_files : []}
                  onChange={(next) => updateNestedField("extensions", "cache_files", next)}
                  placeholder="localthumbcache.package"
                  addButtonLabel={t("add", "Add")}
                />
              </div>

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_ext_labels", "Extension Badge Labels")}
                </label>
                <KeyValueMapBuilder
                  record={extObj.labels || {}}
                  onChange={(next) => updateNestedField("extensions", "labels", next)}
                  keyPlaceholder="package / rpf"
                  valPlaceholder="PACKAGE / RPF ARCHIVE"
                />
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
                  const defaultExt = (extObj.supported && extObj.supported[0]) || ".pak";
                  const nextRoute = {
                    id: `route_${routesArr.length + 1}`,
                    label: "Custom Install Route",
                    extensions: [defaultExt],
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
                  className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3.5 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[var(--accent)] font-mono truncate">
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
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] transition-colors cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
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
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_label", "Label")}
                      </label>
                      <input
                        type="text"
                        value={route.label ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, label: e.target.value };
                          updateField("install_routes", next);
                        }}
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_target_root", "Target Root")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={route.target_root ?? "live_path"}
                        onChange={(v: string[]) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, target_root: v[0] || "live_path" };
                          updateField("install_routes", next);
                        }}
                        options={[
                          {
                            id: "live_path",
                            label: t(
                              "schema_studio_route_root_live",
                              "Game Install Root"
                            ),
                          },
                          {
                            id: "mods_path",
                            label: t(
                              "schema_studio_route_root_mods",
                              "Active {Mods} Folder"
                            ),
                          },
                          {
                            id: "docs_path",
                            label: t(
                              "schema_studio_route_root_docs",
                              "User Data / Saves Root"
                            ),
                          },
                        ]}
                      />
                    </div>

                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_route_target_subdir", "Target Subdirectory")}
                      </label>
                      <input
                        type="text"
                        value={route.target_subdir ?? ""}
                        onChange={(e) => {
                          const next = [...routesArr];
                          next[idx] = { ...route, target_subdir: e.target.value };
                          updateField("install_routes", next);
                        }}
                        placeholder="e.g. scripts or bin/x64/plugins (Blank = Root)"
                        className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_route_folder_match", "Source Folder Match (Optional)")}
                    </label>
                    <input
                      type="text"
                      value={route.folder_match ?? ""}
                      onChange={(e) => {
                        const next = [...routesArr];
                        next[idx] = { ...route, folder_match: e.target.value };
                        updateField("install_routes", next);
                      }}
                      placeholder="e.g. scripts / SKSE / movies"
                      className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                      {t("schema_studio_route_extensions", "Routed File Extensions")}
                    </label>
                    <StringListBuilder
                      items={Array.isArray(route.extensions) ? route.extensions : []}
                      onChange={(nextExts) => {
                        const next = [...routesArr];
                        next[idx] = { ...route, extensions: nextExts };
                        updateField("install_routes", next);
                      }}
                      placeholder=".asi / .dll / .cak / .world"
                      addButtonLabel={t("add", "Add")}
                    />
                  </div>

                  <SchemaToggleRow
                    label={t(
                      "schema_studio_route_preserve_vanilla",
                      "Backup & Preserve Vanilla Files"
                    )}
                    checked={route.preserve_vanilla !== false}
                    onChange={(val) => {
                      const next = [...routesArr];
                      next[idx] = { ...route, preserve_vanilla: val };
                      updateField("install_routes", next);
                    }}
                  />
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
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
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
                    folder: `Sanctuary${priorityTiers.length || ""}`,
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_strategy", "Load Order Strategy")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={loadOrderObj.strategy ?? "folder_priority"}
                    onChange={(v: string[]) => updateNestedField("load_order", "strategy", v[0])}
                    options={[
                      {
                        id: "folder_priority",
                        label: t(
                          "schema_studio_lo_strat_folder",
                          "Folder Priority (Resource.cfg / Tier Subfolders)"
                        ),
                      },
                      {
                        id: "manifest_list",
                        label: t(
                          "schema_studio_lo_strat_manifest",
                          "Manifest List (plugins.txt / modsettings.lsx)"
                        ),
                      },
                      {
                        id: "numeric_prefix",
                        label: t(
                          "schema_studio_lo_strat_prefix",
                          "Numeric Filename Prefix ({index:03}_)"
                        ),
                      },
                      {
                        id: "timestamp",
                        label: t(
                          "schema_studio_lo_strat_timestamp",
                          "File Modified Timestamp Order"
                        ),
                      },
                      {
                        id: "none",
                        label: t(
                          "schema_studio_lo_strat_none",
                          "Direct Symlink Only (No Manifest / Prefix)"
                        ),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_direction", "Winner Direction")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    value={loadOrderObj.direction ?? "higher_wins"}
                    onChange={(v: string[]) =>
                      updateNestedField("load_order", "direction", v[0])
                    }
                    options={[
                      {
                        id: "higher_wins",
                        label: t("schema_studio_lo_dir_higher", "Higher Priority Number Wins"),
                      },
                      {
                        id: "lower_wins",
                        label: t("schema_studio_lo_dir_lower", "Lower Priority Number Wins"),
                      },
                    ]}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_manifest_file", "Engine Manifest File")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.manifest_file ?? ""}
                    onChange={(e) =>
                      updateNestedField("load_order", "manifest_file", e.target.value)
                    }
                    placeholder="Resource.cfg / plugins.txt / (Blank)"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_prefix_fmt", "Numeric Prefix Format")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.prefix_format ?? "{index:03}_"}
                    onChange={(e) =>
                      updateNestedField("load_order", "prefix_format", e.target.value)
                    }
                    placeholder="{index:03}_ or bakedfile{index:02}_"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lo_line_tpl", "Manifest Line Template")}
                  </label>
                  <input
                    type="text"
                    value={loadOrderObj.line_template ?? "{file}"}
                    onChange={(e) =>
                      updateNestedField("load_order", "line_template", e.target.value)
                    }
                    placeholder="{file} or *{file}"
                    className="h-10 min-w-0 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                  />
                </div>
              </div>

              <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("schema_studio_manifest_content", "Base Manifest Header / Template")}
                </label>
                <textarea
                  rows={4}
                  value={parsedSchema.manifest_content ?? ""}
                  onChange={(e) => updateField("manifest_content", e.target.value)}
                  placeholder="Optional manifest file header or base Resource.cfg template..."
                  className="w-full glass-panel rounded-xl p-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {priorityTiers.map((tier, idx) => (
                  <div
                    key={`${tier.id || idx}-${idx}`}
                    className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid grid-cols-[minmax(0,1.2fr)_130px_minmax(0,1fr)_auto] gap-2.5 items-end min-w-0"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
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
                        className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_tier_priority", "Priority")}
                      </label>
                      <GlassNumberInput
                        value={tier.priority ?? 500}
                        min={0}
                        step={100}
                        accentText={true}
                        onChange={(val) => {
                          const next = [...priorityTiers];
                          next[idx] = { ...tier, priority: val };
                          updateNestedField("load_order", "priority_tiers", next);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
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
                        className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
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
                      className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer transition-all"
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
        </div>
      )}

      {/* =====================================================================
          TAB 4: EXCEPTION LOG MATCHERS & BACKUPS / SAVE AIRGAP
         ===================================================================== */}
      {activeTab === "rules_capsule" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          <UniversalGroup
            title={`${t("schema_studio_sec_log_matchers", "Exception Log File Matchers")} (${
              exceptionLogs.length
            })`}
            icon={t("icon_description", "description")}
            headerAction={
              <ActionButton
                variant="accent"
                icon={t("icon_add", "add")}
                onClick={() => {
                  updateField("exception_logs", [
                    ...exceptionLogs,
                    { starts_with: "crash", ends_with: ".log" },
                  ]);
                }}
                className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
              >
                {t("schema_studio_add_log_matcher", "Add Log Matcher")}
              </ActionButton>
            }
          >
            <div className="grid grid-cols-1 @[920px]:grid-cols-2 gap-3.5 w-full">
              {exceptionLogs.map((matcher, idx) => {
                const isExactMode = Boolean(
                  matcher.exact && !matcher.starts_with && !matcher.ends_with
                );
                return (
                  <div
                    key={`log-matcher-${idx}`}
                    className={`glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] grid gap-2.5 items-end min-w-0 ${
                      isExactMode
                        ? "grid-cols-1 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1.95fr)_auto]"
                        : "grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]"
                    }`}
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("schema_studio_cfg_rule_type", "Rule Type")}
                      </label>
                      <CustomDropdown
                        disableTint={true}
                        value={isExactMode ? "exact" : "prefix"}
                        onChange={(v: string[]) => {
                          const mode = v[0] || "prefix";
                          if (mode === "exact" && !isExactMode) {
                            const fallbackExact =
                              matcher.starts_with || matcher.ends_with
                                ? `${matcher.starts_with || "crash"}${matcher.ends_with || ".log"}`
                                : "lastcrash.txt";
                            const next = [...exceptionLogs];
                            next[idx] = { exact: fallbackExact };
                            updateField("exception_logs", next);
                          } else if (mode === "prefix" && isExactMode) {
                            const currentExact = String(matcher.exact || "");
                            const dotIdx = currentExact.lastIndexOf(".");
                            const nextStarts =
                              dotIdx > 0 ? currentExact.slice(0, dotIdx) : currentExact || "crash";
                            const nextEnds = dotIdx > 0 ? currentExact.slice(dotIdx) : ".log";
                            const next = [...exceptionLogs];
                            next[idx] = {
                              starts_with: nextStarts,
                              ends_with: nextEnds,
                            };
                            updateField("exception_logs", next);
                          }
                        }}
                        options={[
                          {
                            id: "prefix",
                            label: t("schema_studio_log_mode_prefix", "Prefix + Extension"),
                          },
                          {
                            id: "exact",
                            label: t("schema_studio_log_mode_exact", "Exact Filename"),
                          },
                        ]}
                      />
                    </div>

                    {isExactMode ? (
                      <div className="flex flex-col gap-1 min-w-0">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("schema_studio_log_exact", "Exact Filename")}
                        </label>
                        <input
                          type="text"
                          value={matcher.exact ?? ""}
                          onChange={(e) => {
                            const next = [...exceptionLogs];
                            next[idx] = {
                              exact: e.target.value,
                            };
                            updateField("exception_logs", next);
                          }}
                          placeholder="lastcrash.txt"
                          className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_log_starts", "Starts With")}
                          </label>
                          <input
                            type="text"
                            value={matcher.starts_with ?? ""}
                            onChange={(e) => {
                              const next = [...exceptionLogs];
                              next[idx] = {
                                starts_with: e.target.value || undefined,
                                ends_with: matcher.ends_with,
                              };
                              updateField("exception_logs", next);
                            }}
                            placeholder="lastexception"
                            className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <label className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)]">
                            {t("schema_studio_log_ends", "Ends With")}
                          </label>
                          <input
                            type="text"
                            value={matcher.ends_with ?? ""}
                            onChange={(e) => {
                              const next = [...exceptionLogs];
                              next[idx] = {
                                starts_with: matcher.starts_with,
                                ends_with: e.target.value || undefined,
                              };
                              updateField("exception_logs", next);
                            }}
                            placeholder=".txt"
                            className="h-10 min-w-0 glass-panel rounded-xl px-3 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)]"
                          />
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          "exception_logs",
                          exceptionLogs.filter((_, i) => i !== idx)
                        )
                      }
                      className="w-10 h-10 shrink-0 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[var(--danger)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--danger)] cursor-pointer transition-all"
                    >
                      <span className="material-symbols-outlined !text-[16px]">
                        {t("icon_delete", "delete")}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </UniversalGroup>

          <UniversalGroup
            title={t("schema_studio_sec_capsule", "{Backups} & Save Airgap Targets")}
            icon={t("icon_history", "history")}
          >
            <div className="flex flex-col gap-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_tc_world_targets", "World State {Backups} Targets")}
                  </label>
                  <TargetListBuilder
                    targets={
                      Array.isArray(capsuleObj.world_state_targets)
                        ? capsuleObj.world_state_targets
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("time_capsule", "world_state_targets", next)
                    }
                    namePlaceholder="Saves"
                    pathPlaceholder="saves"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_tc_engine_targets", "Engine State {Backups} Targets")}
                  </label>
                  <TargetListBuilder
                    targets={
                      Array.isArray(capsuleObj.engine_state_targets)
                        ? capsuleObj.engine_state_targets
                        : []
                    }
                    onChange={(next) =>
                      updateNestedField("time_capsule", "engine_state_targets", next)
                    }
                    namePlaceholder="Data"
                    pathPlaceholder="Data"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_tc_airgap_targets", "Save Airgap Isolation Directories")}
                  </label>
                  <StringListBuilder
                    layout="paths"
                    items={
                      Array.isArray(capsuleObj.save_airgap_targets)
                        ? capsuleObj.save_airgap_targets
                        : ["saves"]
                    }
                    onChange={(next) =>
                      updateNestedField("time_capsule", "save_airgap_targets", next)
                    }
                    placeholder="saves / Profiles / Saves"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3 min-w-0">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("schema_studio_lab_save_exts", "Save File Extensions")}
                  </label>
                  <StringListBuilder
                    items={Array.isArray(labObj.save_extensions) ? labObj.save_extensions : []}
                    onChange={(next) =>
                      updateNestedField("lab_verification", "save_extensions", next)
                    }
                    placeholder=".save / .ess / .lsv / .dat / .sgta"
                    addButtonLabel={t("add", "Add")}
                  />
                </div>
              </div>
            </div>
          </UniversalGroup>
        </div>
      )}
    </div>
  );
}

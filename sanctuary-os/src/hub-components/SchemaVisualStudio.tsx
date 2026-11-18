import { useState, useMemo, useEffect } from "react";
import { useLexicon } from "../LexiconContext";
import { getSafeSchema } from "../store";
import {
  GAME_ARCHITECTURE_PRESETS,
  resolvePresetForGameId,
} from "../utils/gameArchitecturePresets";
import { getCachedOrBundledDefaultSchema } from "../utils/bundledSchemas";
import { deepAddMissing } from "../lib/MasonValidation";
import {
  ActionButton,
  CustomDropdown,
  DashboardStatTile,
  SidePanelFilterBar,
} from "../shared";

type SchemaMainTab = "identity_paths" | "routing_ext" | "load_lab" | "rules_capsule";

export interface SchemaVisualStudioProps {
  content: string;
  onChange: (newContent: string) => void;
  fileName?: string;
  isKeepers?: boolean;
  onOpenGuide?: () => void;
}

import { SchemaIdentityAndRoutingTabs } from "./schema-studio/SchemaIdentityAndRoutingTabs";
import { SchemaLoadLabAndRulesTabs } from "./schema-studio/SchemaLoadLabAndRulesTabs";

export default function SchemaVisualStudio({
  content,
  onChange,
  fileName = "",
  onOpenGuide,
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
  const isDefaultTemplateFile = fileStem.trim().toLowerCase() === "default";
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    if (isDefaultTemplateFile) return "universal";
    const initialPreset = resolvePresetForGameId(
      parsedSchema.game_id || parsedSchema.id || fileStem
    );
    return initialPreset.id || "universal";
  });

  useEffect(() => {
    if (isDefaultTemplateFile) {
      setSelectedPresetId("universal");
      return;
    }
    const nextPreset = resolvePresetForGameId(
      parsedSchema.game_id || parsedSchema.id || fileStem
    );
    setSelectedPresetId(nextPreset.id || "universal");
  }, [fileName, isDefaultTemplateFile]);

  const commitSchema = (nextSchema: Record<string, any>) => {
    const cleaned = { ...nextSchema };
    delete cleaned.dlc_catalog;
    delete cleaned.exception_rules;
    onChange(JSON.stringify(cleaned, null, 2));
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

  const updateDeepLabSignatureField = (childKey: string, value: any) => {
    const curLab =
      parsedSchema.lab_verification && typeof parsedSchema.lab_verification === "object"
        ? parsedSchema.lab_verification
        : {};
    const curSig =
      curLab.world_load_signature && typeof curLab.world_load_signature === "object"
        ? curLab.world_load_signature
        : {};
    commitSchema({
      ...parsedSchema,
      lab_verification: {
        ...curLab,
        world_load_signature: {
          ...curSig,
          [childKey]: value,
        },
      },
    });
  };

  const handleSeedDefaults = () => {
    const baseline = getCachedOrBundledDefaultSchema();
    if (isDefaultTemplateFile) {
      const mergedDefault = deepAddMissing(
        baseline,
        {
          ...parsedSchema,
          id: "default",
          game_id: "default",
          display_name: parsedSchema.display_name || "Default Master Schema",
        },
        false
      );
      delete mergedDefault.name;
      delete mergedDefault.archive_containers;
      delete mergedDefault.mod_categories;
      delete mergedDefault.taxonomy;
      commitSchema(mergedDefault);
      return;
    }
    const fallbackId = parsedSchema.id || fileStem || "universal";
    const seeded = getSafeSchema(parsedSchema, fallbackId);
    delete seeded.name;
    delete seeded.archive_containers;
    delete seeded.mod_categories;
    delete seeded.taxonomy;
    const aligned = deepAddMissing(baseline, seeded, false);
    commitSchema(aligned);
  };

  const handleApplyArchitecturePreset = (presetKey: string) => {
    const baseline = getCachedOrBundledDefaultSchema();
    const preset = GAME_ARCHITECTURE_PRESETS[presetKey] || GAME_ARCHITECTURE_PRESETS.universal;
    const preserveId = isDefaultTemplateFile
      ? "default"
      : parsedSchema.id || fileStem || preset.id;
    const preserveGameId = isDefaultTemplateFile
      ? "default"
      : parsedSchema.game_id || preset.game_id || preserveId;
    const existingTitle = parsedSchema.display_name || parsedSchema.name;
    const preserveDisplayName = isDefaultTemplateFile
      ? "Default Master Schema"
      : existingTitle &&
          existingTitle !== "Universal Game Schema" &&
          existingTitle !== "Default Master Schema"
        ? existingTitle
        : preset.display_name;
    const next = JSON.parse(JSON.stringify(preset));
    next.id = preserveId;
    next.game_id = preserveGameId;
    next.display_name = preserveDisplayName;
    delete next.name;
    delete next.archive_containers;
    delete next.dlc_catalog;
    delete next.exception_rules;
    delete next.mod_categories;
    delete next.taxonomy;
    const aligned = deepAddMissing(baseline, next, false);
    commitSchema(aligned);
  };

  if (parseError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <div className="glass-panel rounded-3xl p-8 border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] max-w-xl w-full text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--danger)]">
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
  const externalToolsArr: any[] = Array.isArray(parsedSchema.external_tools)
    ? parsedSchema.external_tools
    : [];

  const routesArr: any[] = Array.isArray(parsedSchema.install_routes)
    ? parsedSchema.install_routes
    : [];
  const loadOrderObj = parsedSchema.load_order || {};
  const priorityTiers: any[] = Array.isArray(loadOrderObj.priority_tiers)
    ? loadOrderObj.priority_tiers
    : [];
  const conflictAnalyzersArr: any[] = Array.isArray(parsedSchema.conflict_analyzers)
    ? parsedSchema.conflict_analyzers
    : [];
  const labObj = parsedSchema.lab_verification || {};
  const worldSigObj = labObj.world_load_signature || {};
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
      label: t("schema_studio_preset_sims4", "Life Simulation Engine (Binary Index + Script)"),
    },
    {
      id: "gtav",
      label: t("schema_studio_preset_gtav", "Open-World Action Engine (Container / Native Plugin)"),
    },
    {
      id: "wwe2k",
      label: t("schema_studio_preset_wwe2k", "Sports Simulation Engine (Baked Container)"),
    },
    {
      id: "skyrim",
      label: t("schema_studio_preset_skyrim", "Creation RPG Engine (Plugin Load Order + Extender)"),
    },
    {
      id: "cyberpunk2077",
      label: t(
        "schema_studio_preset_cyberpunk",
        "Cyberpunk Action Engine (Archive Container + Script)"
      ),
    },
    {
      id: "bg3",
      label: t("schema_studio_preset_bg3", "Isometric CRPG Engine (Container + Script Extender)"),
    },
    {
      id: "stardew",
      label: t("schema_studio_preset_stardew", "Indie Simulation Engine (Folder Manifests)"),
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
              )} • ${conflictAnalyzersArr.length} ${t(
                "schema_studio_tile_analyzers",
                "Radar Analyzers"
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
            {onOpenGuide && (
              <ActionButton
                variant="glass"
                icon={t("icon_menu_book", "menu_book")}
                onClick={onOpenGuide}
                className="!h-10 !px-3.5 !text-xs !rounded-xl"
              >
                {t("schema_guide_btn", "Schema Guide")}
              </ActionButton>
            )}
          </div>
        </div>

        <SidePanelFilterBar className="grid-cols-2 @[820px]:grid-cols-4 gap-3">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_badge", "badge")}
            label={t("schema_studio_tab_identity", "Identity & Paths")}
            value={`${(parsedSchema.executable_names || []).length} ${t(
              "schema_studio_tile_binaries",
              "Binaries"
            )} • ${externalToolsArr.length} ${t("schema_studio_tile_tools", "Tools")}`}
            isActive={activeTab === "identity_paths"}
            onClick={() => setActiveTab("identity_paths")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_alt_route", "alt_route")}
            label={t("schema_studio_tab_routes", "Extensions & Routes")}
            value={`${(extObj.supported || []).length} ${t(
              "extensions",
              "Extensions"
            )} • ${routesArr.length} ${t("schema_studio_tile_routes", "Routes")}`}
            isActive={activeTab === "routing_ext"}
            onClick={() => setActiveTab("routing_ext")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_low_priority", "low_priority")}
            label={t("schema_studio_tab_load_lab", "Load Order, Radar & {Lab}")}
            value={`${priorityTiers.length} ${t(
              "schema_studio_tile_tiers",
              "Tiers"
            )} • ${conflictAnalyzersArr.length} ${t("schema_studio_tile_analyzers", "Radar Analyzers")}`}
            isActive={activeTab === "load_lab"}
            onClick={() => setActiveTab("load_lab")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_history", "history")}
            label={t("schema_studio_tab_logs_backups", "Logs & {Backups}")}
            value={`${exceptionLogs.length} ${t(
              "schema_studio_tile_log_matchers",
              "Log Matchers"
            )}`}
            isActive={activeTab === "rules_capsule"}
            onClick={() => setActiveTab("rules_capsule")}
          />
        </SidePanelFilterBar>
      </div>

      <SchemaIdentityAndRoutingTabs
        t={t}
        activeTab={activeTab}
        parsedSchema={parsedSchema}
        commitSchema={commitSchema}
        updateField={updateField}
        updateNestedField={updateNestedField}
        pathsObj={pathsObj}
        extObj={extObj}
        constraintsObj={constraintsObj}
        versionExtObj={versionExtObj}
        externalToolsArr={externalToolsArr}
        routesArr={routesArr}
      />
      <SchemaLoadLabAndRulesTabs
        t={t}
        activeTab={activeTab}
        parsedSchema={parsedSchema}
        updateField={updateField}
        updateNestedField={updateNestedField}
        updateDeepLabSignatureField={updateDeepLabSignatureField}
        extObj={extObj}
        loadOrderObj={loadOrderObj}
        priorityTiers={priorityTiers}
        conflictAnalyzersArr={conflictAnalyzersArr}
        labObj={labObj}
        worldSigObj={worldSigObj}
        exceptionLogs={exceptionLogs}
        capsuleObj={capsuleObj}
      />
    </div>
  );
}

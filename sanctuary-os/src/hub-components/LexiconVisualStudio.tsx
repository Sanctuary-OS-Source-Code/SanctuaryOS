import { useState, useMemo } from "react";
import {
  useLexicon,
  CORE_GLOSSARY_TERMS,
  interpolateGlossaryTokens,
  isKeeperLockedLexiconKey,
} from "../LexiconContext";
import { useStore } from "../store";
import enDefaultRaw from "../lexicons/en-default.json";
import enSanctuaryRaw from "../lexicons/en-sanctuary.json";
import enSimsRaw from "../lexicons/en-sims.json";
import simlishRaw from "../lexicons/Simlish.json";
import IconPicker, { ICON_CATEGORIES } from "../IconPicker";
import {
  ActionButton,
  ActionPill,
  CustomDropdown,
  DashboardStatTile,
  EmptyState,
  HoverTooltip,
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";

const enDefault = enDefaultRaw as Record<string, any>;
const enSanctuary = enSanctuaryRaw as Record<string, any>;
const enSims = enSimsRaw as Record<string, any>;
const simlish = simlishRaw as Record<string, any>;

type StudioMainTab = "glossary" | "modules" | "navigation" | "tools";

type ModuleGroupId =
  | "vault"
  | "blueprints"
  | "nexus"
  | "lab"
  | "backups"
  | "workbench"
  | "hubs"
  | "common";

type NavSubGroupId = "sidebar_views" | "landing";

const NAV_VIEW_TITLE_KEYS = new Set<string>([
  "vault_title",
  "market_title",
  "title_lab",
  "title_radar",
  "title_sidebar",
  "title_settings",
  "tc_title",
  "mason_mods_title",
  "wayfinder_title",
  "wf_chameleons_title",
  "keepers_title",
  "scout_title",
  "architect_title",
  "oversight_title",
  "defcon_title",
]);

function isNavigationLexiconKey(key: string): boolean {
  const k = key.toLowerCase();
  if (isKeeperLockedLexiconKey(k)) return false;
  return (
    k.startsWith("sidebar_") ||
    k.startsWith("nav_") ||
    k.startsWith("tab_") ||
    k.startsWith("landing_") ||
    NAV_VIEW_TITLE_KEYS.has(k)
  );
}

function classifyModuleKey(key: string): ModuleGroupId {
  const k = key.toLowerCase();

  if (
    k.startsWith("tc_") ||
    k.startsWith("backup") ||
    k.startsWith("capsule") ||
    k.startsWith("restore") ||
    k.startsWith("snapshot")
  ) {
    return "backups";
  }

  if (
    k.startsWith("bp_") ||
    k.startsWith("blueprint") ||
    k.startsWith("playset") ||
    k.startsWith("share_code") ||
    k.startsWith("export_bp") ||
    k.startsWith("import_bp") ||
    k.startsWith("matrix_")
  ) {
    return "blueprints";
  }

  if (
    k.startsWith("lab_") ||
    k.startsWith("radar_") ||
    k.startsWith("diag_") ||
    k.startsWith("verify_") ||
    k.startsWith("exception") ||
    k.startsWith("exc_") ||
    k.startsWith("crash_") ||
    k.startsWith("telemetry") ||
    k.startsWith("health_") ||
    k.startsWith("bench") ||
    k.startsWith("tier3") ||
    k.startsWith("tier4") ||
    k.startsWith("conflict") ||
    k.startsWith("enemy_")
  ) {
    return "lab";
  }

  if (
    k.startsWith("wb_") ||
    k.startsWith("workbench") ||
    k.startsWith("ide_") ||
    k.startsWith("lex_") ||
    k.startsWith("lexicon") ||
    k.startsWith("schema_") ||
    k.startsWith("chameleon") ||
    k.startsWith("theme_") ||
    k.startsWith("template_") ||
    k.startsWith("upload_template") ||
    k.startsWith("forge_") ||
    k.startsWith("color_")
  ) {
    return "workbench";
  }

  if (
    k.startsWith("nexus_") ||
    k.startsWith("market_") ||
    k.startsWith("dispatch") ||
    k.startsWith("feed_") ||
    k.startsWith("poll_") ||
    k.startsWith("post_") ||
    k.startsWith("comment") ||
    k.startsWith("bounty") ||
    k.startsWith("creator_") ||
    k.startsWith("donate") ||
    k.startsWith("upload_") ||
    k.startsWith("asset_")
  ) {
    return "nexus";
  }

  if (
    k.startsWith("mason_") ||
    k.startsWith("wayfinder") ||
    k.startsWith("wf_") ||
    k.startsWith("keeper") ||
    k.startsWith("scout_") ||
    k.startsWith("architect") ||
    k.startsWith("hub_") ||
    k.startsWith("audit_") ||
    k.startsWith("clearance") ||
    k.startsWith("flag_") ||
    k.startsWith("role_") ||
    k.startsWith("oversight") ||
    k.startsWith("defcon")
  ) {
    return "hubs";
  }

  if (
    k.startsWith("vault_") ||
    k.startsWith("class_dd_") ||
    k.startsWith("mod_") ||
    k.startsWith("mods_") ||
    k.startsWith("pkg_") ||
    k.startsWith("tray_") ||
    k.startsWith("cat_") ||
    k.startsWith("tier_") ||
    k.startsWith("load_order") ||
    k.startsWith("lo_") ||
    k.startsWith("dep_") ||
    k.startsWith("install") ||
    k.startsWith("scan_") ||
    k.startsWith("orphan") ||
    k.startsWith("duplicate") ||
    k.startsWith("dlc_") ||
    k.startsWith("type_") ||
    k.startsWith("card_") ||
    k.startsWith("local_")
  ) {
    return "vault";
  }

  return "common";
}

function classifyNavSubGroup(key: string): NavSubGroupId {
  const k = key.toLowerCase();
  if (k.startsWith("landing_")) {
    return "landing";
  }
  return "sidebar_views";
}

function humanizeKey(key: string): string {
  return key
    .replace(
      /^(btn_|lbl_|label_|title_|tab_|nav_|msg_|err_|alert_|lex_studio_|schema_studio_|wb_|icon_|action_|filter_|status_|vault_cat_|vault_sub_|class_dd_|dlc_type_|role_)/,
      ""
    )
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface LexiconVisualStudioProps {
  content: string;
  onChange: (newContent: string) => void;
  referenceData?: Record<string, any>;
  fileName?: string;
  onAddMissing?: () => void;
  onPurgeDeprecated?: () => void;
  isKeepers?: boolean;
  onOpenGuide?: () => void;
}

export default function LexiconVisualStudio({
  content,
  onChange,
  referenceData,
  fileName = "",
  isKeepers = false,
  onOpenGuide,
}: LexiconVisualStudioProps) {
  const { t, registry, lexiconMeta } = useLexicon();
  const osRole = useStore((state) => state.osRole);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const canEditKeeperKeys = Boolean(isKeepers || osRole === "keeper");

  const [activeTab, setActiveTab] = useState<StudioMainTab>("glossary");
  const [expandedModuleId, setExpandedModuleId] = useState<ModuleGroupId>("vault");
  const [expandedNavGroupId, setExpandedNavGroupId] = useState<NavSubGroupId>("sidebar_views");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyCustomized, setOnlyCustomized] = useState(false);

  // Batch Replace state
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(true);
  const [wholeWord, setWholeWord] = useState(true);

  // Add Key / Icon state
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [activeIconPickerKey, setActiveIconPickerKey] = useState<string | null>(null);
  const [selectedIconTarget, setSelectedIconTarget] = useState<string>("icon_delete");
  const [selectedIconReplacement, setSelectedIconReplacement] = useState<string>("delete_forever");
  const [selectedIconCategory, setSelectedIconCategory] = useState<string>("core_os");
  const [iconSearchQuery, setIconSearchQuery] = useState<string>("");

  const isBuiltinFullLexicon = useMemo(() => {
    const lower = (fileName || "").toLowerCase();
    return (
      lower === "en-default.json" ||
      lower === "en-sanctuary.json" ||
      lower === "en-sims.json" ||
      lower === "simlish.json"
    );
  }, [fileName]);

  const { parsedDict, parseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(content || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsedDict: parsed as Record<string, any>, parseError: null };
      }
      return { parsedDict: {} as Record<string, any>, parseError: "Root JSON must be an object" };
    } catch (e: any) {
      return { parsedDict: {} as Record<string, any>, parseError: e?.message || "Invalid JSON" };
    }
  }, [content]);

  const effectiveReference = useMemo(() => {
    const baseRef =
      referenceData && Object.keys(referenceData).length > 50 ? referenceData : enDefault;
    const merged: Record<string, any> = { ...baseRef };
    const cats = Array.isArray(activeGameSchema?.mod_categories)
      ? activeGameSchema.mod_categories
      : [];
    for (const c of cats) {
      if (!c || typeof c !== "object") continue;
      const cid = String(c.id || "").trim();
      const lexKey =
        typeof c.lexicon_key === "string" && c.lexicon_key.trim()
          ? c.lexicon_key.trim()
          : cid
            ? `class_dd_${cid.toLowerCase().replace(/[^a-z0-9]/g, "_")}`
            : "";
      if (lexKey && !merged[lexKey]) {
        merged[lexKey] = c.label || cid;
      }
      if (Array.isArray(c.subcategories)) {
        for (const sub of c.subcategories) {
          if (!sub || typeof sub !== "object") continue;
          const sid = String(sub.id || "").trim();
          const subKey =
            typeof sub.lexicon_key === "string" && sub.lexicon_key.trim()
              ? sub.lexicon_key.trim()
              : sid
                ? `vault_sub_${sid.toLowerCase().replace(/[^a-z0-9]/g, "_")}`
                : "";
          if (subKey && !merged[subKey]) {
            merged[subKey] = sub.label || sid;
          }
        }
      }
    }
    return merged;
  }, [referenceData, activeGameSchema]);

  const packBaseline = useMemo(() => {
    const lower = (fileName || "").toLowerCase();
    if (lower === "en-default.json") return enDefault;
    if (lower === "en-sanctuary.json") return enSanctuary;
    if (lower === "en-sims.json") return enSims;
    if (lower === "simlish.json") return simlish;
    return effectiveReference;
  }, [fileName, effectiveReference]);

  const emptyOrDeprecatedBloatCount = useMemo(() => {
    if (isBuiltinFullLexicon) return 0;
    let count = 0;
    for (const [k, v] of Object.entries(parsedDict)) {
      if (k.startsWith("_meta") || k === "schema_version") continue;
      if (v === "" || v === null || v === undefined) {
        count++;
      } else if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) {
        count++;
      } else if (!k.startsWith("icon_") && !k.startsWith("term_") && effectiveReference[k] === undefined) {
        count++;
      }
    }
    return count;
  }, [parsedDict, effectiveReference, isBuiltinFullLexicon, canEditKeeperKeys]);

  const commitDict = (nextDict: Record<string, any>, stripBloat = !isBuiltinFullLexicon) => {
    if (!stripBloat) {
      if (!canEditKeeperKeys) {
        const safeDict = { ...nextDict };
        for (const k of Object.keys(safeDict)) {
          if (isKeeperLockedLexiconKey(k)) {
            safeDict[k] = parsedDict[k] ?? effectiveReference[k];
          }
        }
        onChange(JSON.stringify(safeDict, null, 2));
        return;
      }
      onChange(JSON.stringify(nextDict, null, 2));
      return;
    }

    const cleanDict: Record<string, any> = {};
    for (const [k, v] of Object.entries(nextDict)) {
      if (k.startsWith("_meta")) {
        cleanDict[k] = v;
        continue;
      }
      if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) continue;
      if (v === "" || v === null || v === undefined) continue;
      cleanDict[k] = v;
    }
    onChange(JSON.stringify(cleanDict, null, 2));
  };

  const handleCompactJson = () => {
    const cleanDict: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsedDict)) {
      if (k.startsWith("_meta")) {
        cleanDict[k] = v;
        continue;
      }
      if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) continue;
      if (v === "" || v === null || v === undefined) continue;
      if (!k.startsWith("icon_") && !k.startsWith("term_") && effectiveReference[k] === undefined) continue;
      cleanDict[k] = v;
    }
    onChange(JSON.stringify(cleanDict, null, 2));
  };

  const handleUpdateKey = (key: string, val: any) => {
    if (!canEditKeeperKeys && isKeeperLockedLexiconKey(key)) return;
    const next = { ...parsedDict };
    if (!isBuiltinFullLexicon && (val === "" || val === null || val === undefined)) {
      delete next[key];
    } else {
      next[key] = val;
    }
    commitDict(next);
  };

  const handleResetKey = (key: string) => {
    if (!canEditKeeperKeys && isKeeperLockedLexiconKey(key)) return;
    const next = { ...parsedDict };
    if (isBuiltinFullLexicon) {
      next[key] = packBaseline[key] ?? effectiveReference[key] ?? "";
    } else {
      delete next[key];
    }
    commitDict(next);
  };

  const allKeys = useMemo(() => {
    const keySet = new Set<string>();
    for (const item of CORE_GLOSSARY_TERMS) {
      keySet.add(item.key);
    }
    for (const k of Object.keys(effectiveReference)) {
      if (!k.startsWith("_meta") && k !== "schema_version") keySet.add(k);
    }
    for (const k of Object.keys(parsedDict)) {
      if (!k.startsWith("_meta") && k !== "schema_version") {
        const val = parsedDict[k];
        if (val !== "" && val !== null && val !== undefined && effectiveReference[k] !== undefined) {
          keySet.add(k);
        } else if (k.startsWith("icon_") && val) {
          keySet.add(k);
        }
      }
    }
    return Array.from(keySet).sort((a, b) => a.localeCompare(b));
  }, [effectiveReference, parsedDict]);

  const { navigationKeys, moduleKeysMap, customizedCount } = useMemo(() => {
    const navKeys: string[] = [];
    const modMap: Record<ModuleGroupId, string[]> = {
      vault: [],
      blueprints: [],
      nexus: [],
      lab: [],
      backups: [],
      workbench: [],
      hubs: [],
      common: [],
    };
    let customTotal = 0;

    for (const k of allKeys) {
      if (k.startsWith("icon_")) continue;
      if (isKeeperLockedLexiconKey(k)) continue;
      const val = parsedDict[k];
      const baseVal = packBaseline[k] ?? effectiveReference[k] ?? enDefault[k] ?? "";
      const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
      if (hasVal && (!isBuiltinFullLexicon || String(val) !== String(baseVal))) {
        customTotal++;
      }

      if (k.startsWith("term_")) continue;
      if (isNavigationLexiconKey(k)) {
        navKeys.push(k);
      } else {
        const mGroup = classifyModuleKey(k);
        modMap[mGroup].push(k);
      }
    }

    return {
      navigationKeys: navKeys,
      moduleKeysMap: modMap,
      customizedCount: customTotal,
    };
  }, [allKeys, parsedDict, packBaseline, effectiveReference, isBuiltinFullLexicon]);

  const filterKeyList = (keys: string[]) => {
    const q = searchQuery.trim().toLowerCase();
    return keys.filter((k) => {
      const val = parsedDict[k];
      const refVal = effectiveReference[k] ?? enDefault[k] ?? "";
      const baseVal = packBaseline[k] ?? refVal;
      const sancVal = enSanctuary[k] ?? "";
      const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
      const isCustom = hasVal && (!isBuiltinFullLexicon || String(val) !== String(baseVal));

      if (onlyCustomized && !isCustom) return false;
      if (q) {
        const matchKey = k.toLowerCase().includes(q) || humanizeKey(k).toLowerCase().includes(q);
        const matchVal = hasVal && String(val).toLowerCase().includes(q);
        const matchRef = String(refVal).toLowerCase().includes(q);
        const matchSanc = String(sancVal).toLowerCase().includes(q);
        if (!matchKey && !matchVal && !matchRef && !matchSanc) return false;
      }
      return true;
    });
  };

  const countCustomizedInList = (keys: string[]) => {
    let c = 0;
    for (const k of keys) {
      const val = parsedDict[k];
      const baseVal = packBaseline[k] ?? effectiveReference[k] ?? enDefault[k] ?? "";
      const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
      if (hasVal && (!isBuiltinFullLexicon || String(val) !== String(baseVal))) c++;
    }
    return c;
  };

  const terminologySourceOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [
      {
        id: "en-default",
        label: `${t("lex_studio_preset_std", "Standard")} (Mod • Library • Play Set)`,
      },
      {
        id: "en-sanctuary",
        label: `${t("lex_studio_preset_sanctuary", "Sanctuary")} (Artifact • Vault • Blueprint)`,
      },
      {
        id: "en-sims",
        label: `${t("lex_studio_preset_sims", "Sims")} (Mod • Library • Modpack • Simmer)`,
      },
    ];
    const seen = new Set(["en-default", "en-sanctuary", "en-sims", "Simlish"]);
    for (const m of lexiconMeta || []) {
      if (m?.id && !seen.has(m.id)) {
        seen.add(m.id);
        opts.push({
          id: m.id,
          label: `${m.name || m.id}${m.badge ? ` (${m.badge})` : ""}`,
        });
      }
    }
    for (const k of Object.keys(registry || {})) {
      if (!seen.has(k)) {
        seen.add(k);
        const customName = registry[k]?._meta_name || k;
        opts.push({
          id: k,
          label: `${customName} (${t("community", "Community")})`,
        });
      }
    }
    return opts;
  }, [lexiconMeta, registry, t]);

  const handleApplyTerminologyFromSource = (sourceId: string) => {
    if (!sourceId) return;
    const next = { ...parsedDict };
    if (
      sourceId === "en-default" ||
      sourceId === "en-sanctuary" ||
      sourceId === "en-sims"
    ) {
      for (const term of CORE_GLOSSARY_TERMS) {
        next[term.key] = term.defaults[sourceId];
      }
    } else {
      const sourceDict = registry?.[sourceId] || {};
      for (const term of CORE_GLOSSARY_TERMS) {
        if (sourceDict[term.key]) {
          next[term.key] = sourceDict[term.key];
        }
      }
    }
    commitDict(next);
  };

  const batchMatchCount = useMemo(() => {
    if (!findText) return 0;
    try {
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
      const regex = new RegExp(pattern, matchCase ? "g" : "gi");
      let count = 0;
      for (const k of allKeys) {
        if (k.startsWith("icon_") || k.startsWith("term_")) continue;
        if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) continue;
        const v = parsedDict[k] ?? effectiveReference[k];
        if (typeof v !== "string") continue;
        if (regex.test(v)) count++;
        regex.lastIndex = 0;
      }
      return count;
    } catch {
      return 0;
    }
  }, [findText, matchCase, wholeWord, parsedDict, effectiveReference, allKeys, canEditKeeperKeys]);

  const executeBatchReplace = () => {
    if (!findText || batchMatchCount === 0) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
    const regex = new RegExp(pattern, matchCase ? "g" : "gi");
    const next = { ...parsedDict };
    for (const k of allKeys) {
      if (k.startsWith("icon_") || k.startsWith("term_")) continue;
      if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) continue;
      const v = next[k] ?? effectiveReference[k];
      if (typeof v !== "string") continue;
      if (regex.test(v)) {
        next[k] = v.replace(regex, replaceText);
      }
      regex.lastIndex = 0;
    }
    commitDict(next);
  };

  const handleAddCustomKey = () => {
    const cleanKey = newKeyName.trim().replace(/\s+/g, "_").toLowerCase();
    if (!cleanKey) return;
    if (!canEditKeeperKeys && isKeeperLockedLexiconKey(cleanKey)) return;
    handleUpdateKey(cleanKey, newKeyValue);
    setNewKeyName("");
    setNewKeyValue("");
  };

  if (parseError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <EmptyState
          icon={t("icon_error", "error")}
          title={t("lex_studio_json_err_title", "JSON Syntax Error")}
          subtitle={parseError}
        />
      </div>
    );
  }

  const coreTermGroups = [
    {
      id: "assets",
      title: t("lex_studio_group_assets", "Core Assets & Locations"),
      icon: t("icon_inventory_2", "inventory_2"),
      keys: ["term_mod", "term_mods", "term_vault", "term_blueprint", "term_blueprints", "term_nexus"],
    },
    {
      id: "roles",
      title: t("lex_studio_group_roles", "Community Roles & Broadcasts"),
      icon: t("icon_group", "group"),
      keys: ["term_citizen", "term_citizens", "term_mason", "term_masons", "term_dispatch", "term_dispatches"],
    },
    {
      id: "system",
      title: t("lex_studio_group_system", "System Modules, Themes & Actions"),
      icon: t("icon_tune", "tune"),
      keys: [
        "term_lab",
        "term_backups",
        "term_settings",
        "term_chameleon",
        "term_chameleons",
        "term_lexicon",
        "term_lexicons",
        "term_delete",
        "term_remove",
      ],
    },
  ];

  const moduleSectionDefs: {
    id: ModuleGroupId;
    overline: string;
    title: string;
    icon: string;
  }[] = [
    {
      id: "vault",
      overline: t("term_vault", "{Vault}"),
      title: t("lex_studio_cat_vault", "{Vault} & {Mods}"),
      icon: t("icon_inventory_2", "inventory_2"),
    },
    {
      id: "blueprints",
      overline: t("term_blueprints", "{Blueprints}"),
      title: t("tab_blueprints", "{Blueprints}"),
      icon: t("icon_map", "map"),
    },
    {
      id: "nexus",
      overline: t("term_nexus", "{Nexus}"),
      title: t("market_title", "The {Nexus}"),
      icon: t("icon_hub", "hub"),
    },
    {
      id: "lab",
      overline: t("term_lab", "{Lab}"),
      title: t("lex_studio_cat_lab", "{Lab} & Radar"),
      icon: t("icon_science", "science"),
    },
    {
      id: "backups",
      overline: t("term_backups", "{Backups}"),
      title: t("term_backups", "{Backups}"),
      icon: t("icon_history", "history"),
    },
    {
      id: "workbench",
      overline: t("title_sidebar", "Workbench"),
      title: t("lex_studio_cat_workbench", "Workbench & Studio"),
      icon: t("icon_design_services", "design_services"),
    },
    {
      id: "hubs",
      overline: t("mason", "{Mason}"),
      title: t("lex_studio_cat_hubs", "Command Hubs"),
      icon: t("icon_construction", "construction"),
    },
    {
      id: "common",
      overline: t("term_settings", "{Settings}"),
      title: t("lex_studio_cat_common", "Common Actions, Statuses & {Settings}"),
      icon: t("icon_touch_app", "touch_app"),
    },
  ];

  const navSubGroups: {
    id: NavSubGroupId;
    overline: string;
    title: string;
    icon: string;
    keys: string[];
  }[] = [
    {
      id: "sidebar_views",
      overline: t("workspace_sidebar", "Sidebar"),
      title: t("lex_studio_nav_sidebar_title", "Sidebar Navigation & Primary View Titles"),
      icon: t("icon_explore", "explore"),
      keys: navigationKeys.filter((k) => classifyNavSubGroup(k) === "sidebar_views"),
    },
    {
      id: "landing",
      overline: t("tab_landing", "Landing"),
      title: t("lex_studio_nav_landing_title", "Public Landing & System Directives"),
      icon: t("icon_public", "public"),
      keys: navigationKeys.filter((k) => classifyNavSubGroup(k) === "landing"),
    },
  ];

  const renderFieldGridCard = (key: string, isLockedField = false) => {
    const rawVal = parsedDict[key];
    const refVal = effectiveReference[key] ?? enDefault[key] ?? "";
    const baseVal = packBaseline[key] ?? refVal;
    const sancVal = enSanctuary[key] ?? "";
    const hasVal = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
    const isCustomized = hasVal && (!isBuiltinFullLexicon || String(rawVal) !== String(baseVal));
    const effectiveStr = hasVal ? String(rawVal) : String(refVal);
    const hasTokens = effectiveStr.includes("{") || String(refVal).includes("{");
    const livePreview = hasTokens ? interpolateGlossaryTokens(effectiveStr, parsedDict) : null;
    const isLong = effectiveStr.length > 85 || String(refVal).length > 85;

    return (
      <div
        key={key}
        className={`glass-surface rounded-xl px-3.5 py-2.5 border flex flex-col justify-between gap-1.5 transition-all ${
          isLockedField
            ? "border-[color-mix(in_srgb,var(--warning)_22%,transparent)] opacity-75"
            : isCustomized
              ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        } ${isLong ? "md:col-span-2" : ""}`}
      >
        <div className="flex items-center justify-between gap-2 min-w-0 px-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {isLockedField && (
              <span className="material-symbols-outlined !text-[13px] text-[var(--warning)] shrink-0">
                {t("icon_lock", "lock")}
              </span>
            )}
            <label className="text-[10px] font-black text-[var(--text)] uppercase tracking-wider truncate">
              {humanizeKey(key)}
              <HoverTooltip title={humanizeKey(key)} />
            </label>
            <span className="text-[9px] font-mono text-[var(--subtext)] opacity-55 truncate">
              {key}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isLockedField &&
              sancVal &&
              String(sancVal) !== String(refVal) &&
              String(rawVal ?? "") !== String(sancVal) && (
                <button
                  type="button"
                  onClick={() => handleUpdateKey(key, sancVal)}
                  className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[9px] font-black text-[var(--text)] flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[11px] text-[var(--accent)]">
                    {t("icon_auto_awesome", "auto_awesome")}
                  </span>
                  <span>{t("lex_studio_preset_sanctuary", "Sanctuary")}</span>
                  <HoverTooltip title={String(sancVal)} />
                </button>
              )}
            {!isLockedField && isCustomized && (
              <button
                type="button"
                onClick={() => handleResetKey(key)}
                className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[9px] font-black text-[var(--text)] flex items-center gap-1 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[11px] text-[var(--subtext)]">
                  {t("icon_restart_alt", "restart_alt")}
                </span>
                <span>{t("reset", "Reset")}</span>
                <HoverTooltip title={String(refVal)} />
              </button>
            )}
          </div>
        </div>

        {isLong ? (
          <textarea
            rows={2}
            disabled={isLockedField}
            readOnly={isLockedField}
            value={rawVal ?? ""}
            placeholder={String(refVal)}
            onChange={(e) => handleUpdateKey(key, e.target.value)}
            className={`w-full glass-surface rounded-lg px-3.5 py-1.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] resize-y ${
              isLockedField ? "cursor-not-allowed opacity-75" : ""
            }`}
          />
        ) : (
          <input
            type="text"
            disabled={isLockedField}
            readOnly={isLockedField}
            value={rawVal ?? ""}
            placeholder={String(refVal)}
            onChange={(e) => handleUpdateKey(key, e.target.value)}
            className={`w-full h-[34px] glass-surface rounded-lg px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] ${
              isLockedField ? "cursor-not-allowed opacity-75" : ""
            }`}
          />
        )}

        {livePreview && livePreview !== effectiveStr && (
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[var(--success)] px-1 truncate">
            <span className="truncate">{`→ ${livePreview}`}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="@container flex flex-col h-full min-h-0 w-full overflow-y-auto custom-scrollbar px-5 pt-4 pb-36 gap-4 select-none">
      {/* 1. Sleek Header Bar + 1x4 DashboardStatTile Filter Grid (Zero Redundant Boxes) */}
      <div className="flex flex-col gap-3.5 pb-1 shrink-0">
        <div className="flex flex-col @[860px]:flex-row @[860px]:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col justify-start min-w-0">
            <input
              type="text"
              value={parsedDict._meta_name || fileName.replace(/\.json$/i, "")}
              onChange={(e) => handleUpdateKey("_meta_name", e.target.value)}
              className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-xl md:text-2xl font-black text-[var(--text)] tracking-tight transition-colors py-0.5 truncate"
              placeholder={t("label_lexicon_name", "Lexicon Name")}
            />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-65 mt-0.5 truncate">
              {`${fileName || "lexicon.json"} • ${
                parsedDict._meta_lang ? String(parsedDict._meta_lang).toUpperCase() : "EN"
              } • ${customizedCount} ${t("modified", "Customized")}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="w-[270px] max-w-full">
              <CustomDropdown
                className="h-10 w-full text-xs"
                value={null}
                options={terminologySourceOptions}
                onChange={(val: any) => {
                  const picked = Array.isArray(val) ? val[0] : val;
                  if (picked) handleApplyTerminologyFromSource(String(picked));
                }}
                placeholder={
                  t("lex_studio_load_preset_dropdown", "Apply Terms From {Lexicon}...") as string
                }
              />
            </div>
            {onOpenGuide && (
              <ActionButton
                variant="glass"
                icon={t("icon_menu_book", "menu_book")}
                onClick={onOpenGuide}
                className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
              >
                {t("lexicon_guide_btn", "{Lexicon} Guide")}
              </ActionButton>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 @[820px]:grid-cols-4 gap-3 w-full">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_auto_awesome", "auto_awesome")}
            label={t("lex_studio_cat_glossary", "Core Terms")}
            value={String(CORE_GLOSSARY_TERMS.length)}
            isActive={activeTab === "glossary"}
            onClick={() => setActiveTab("glossary")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_dashboard", "dashboard")}
            label={t("lex_studio_tab_modules", "OS Modules")}
            value={String(moduleSectionDefs.length)}
            isActive={activeTab === "modules"}
            onClick={() => setActiveTab("modules")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_explore", "explore")}
            label={t("workspace_sidebar", "Sidebar")}
            value={String(navigationKeys.length)}
            isActive={activeTab === "navigation"}
            onClick={() => setActiveTab("navigation")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_handyman", "handyman")}
            label={t("lex_studio_tab_tools", "Pack & Tools")}
            value={
              customizedCount > 0
                ? `${customizedCount} ${t("modified", "Customized")}`
                : String(parsedDict._meta_version || "1.0.0")
            }
            isActive={activeTab === "tools"}
            onClick={() => setActiveTab("tools")}
          />
        </div>
      </div>

      {/* =====================================================================
          TAB 1: CORE TERMINOLOGY (3 STRUCTURED GROUP GRIDS)
         ===================================================================== */}
      {activeTab === "glossary" && (
        <div className="flex flex-col gap-4 pb-12 animate-in fade-in duration-200">
          {coreTermGroups.map((group) => (
            <UniversalGroup key={group.id} title={group.title} icon={group.icon}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 w-full">
                {group.keys.map((termKey) => {
                  const term = CORE_GLOSSARY_TERMS.find((g) => g.key === termKey);
                  if (!term) return null;
                  const rawVal = parsedDict[term.key];
                  const refVal =
                    effectiveReference[term.key] ?? term.defaults["en-default"];
                  const baseVal = packBaseline[term.key] ?? refVal;
                  const hasVal =
                    rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
                  const isCustom =
                    hasVal && (!isBuiltinFullLexicon || String(rawVal) !== String(baseVal));

                  return (
                    <div
                      key={term.key}
                      className={`glass-surface rounded-xl px-3.5 py-2.5 border flex flex-col justify-between gap-1.5 transition-all ${
                        isCustom
                          ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <label className="text-[10px] font-black text-[var(--subtext)] uppercase tracking-widest flex items-center gap-1.5 truncate">
                          <span className="material-symbols-outlined !text-[14px] text-[var(--accent)] shrink-0">
                            {t(`icon_${term.icon}`, term.icon)}
                          </span>
                          <span className="truncate text-[var(--text)]">
                            {`${term.defaults["en-default"]} / ${term.defaults["en-sanctuary"]}`}
                          </span>
                        </label>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-mono font-bold text-[var(--text)]">
                            {`{${term.token}}`}
                          </span>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => handleResetKey(term.key)}
                              className="text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer flex items-center"
                            >
                              <span className="material-symbols-outlined !text-[13px]">
                                {t("icon_restart_alt", "restart_alt")}
                              </span>
                              <HoverTooltip title={String(refVal)} />
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={rawVal ?? ""}
                        placeholder={String(refVal)}
                        onChange={(e) => handleUpdateKey(term.key, e.target.value)}
                        className="w-full h-[34px] glass-surface rounded-lg px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  );
                })}
              </div>
            </UniversalGroup>
          ))}
        </div>
      )}

      {/* =====================================================================
          TAB 2: OS MODULES (EXPANDABLE ACCORDION CARDS + 2-COL FORM GRID)
         ===================================================================== */}
      {activeTab === "modules" && (
        <div className="flex flex-col gap-4 pb-12 animate-in fade-in duration-200">
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("lex_studio_search", "Search strings or keys...") as string}
            className="w-full shrink-0"
            rightContent={
              <div className="flex items-center gap-2 px-3 py-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setOnlyCustomized(!onlyCustomized)}
                  className={`h-8 px-3 rounded-xl glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
                    onlyCustomized
                      ? "sa-glass-pill-active text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                    {t("icon_tune", "tune")}
                  </span>
                  <span>{t("modified", "Customized")}</span>
                </button>
              </div>
            }
          />

          <div className="flex flex-col gap-3.5 w-full">
            {moduleSectionDefs.map((sec) => {
              const rawKeys = moduleKeysMap[sec.id] || [];
              const filtered = filterKeyList(rawKeys);
              const customInSec = countCustomizedInList(rawKeys);
              const isExpanded = expandedModuleId === sec.id;

              if (!isExpanded) {
                return (
                  <div
                    key={sec.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedModuleId(sec.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedModuleId(sec.id);
                      }
                    }}
                    className="glass-panel rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 border transition-all duration-200 cursor-pointer opacity-60 hover:opacity-95 border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[17px]">
                          {sec.icon}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)] truncate">
                          {sec.overline}
                        </span>
                        <span className="text-xs font-black text-[var(--text)] truncate">
                          {sec.title}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[10px] tabular-nums font-bold">
                        {`${customInSec} / ${filtered.length}`}
                      </span>
                      <ActionButton
                        variant="glass"
                        icon={t("icon_expand_more", "expand_more")}
                        iconOnly={true}
                        onClick={() => setExpandedModuleId(sec.id)}
                        className="!w-7 !h-7 !rounded-lg"
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={sec.id}
                  className="glass-panel rounded-2xl p-3.5 flex flex-col gap-3 border opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] w-full animate-in fade-in duration-150"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[17px]">
                          {sec.icon}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)]">
                          {sec.overline}
                        </span>
                        <span className="text-xs font-black text-[var(--text)]">
                          {sec.title}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[10px] tabular-nums font-bold">
                        {`${customInSec} / ${filtered.length}`}
                      </span>
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <EmptyState
                      icon={t("icon_search_off", "search_off")}
                      title={t("no_results", "No matching strings")}
                      className="py-6"
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 w-full">
                      {filtered.map((k) => renderFieldGridCard(k, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: SIDEBAR, NAVIGATION & LANDING (FULLY UNLOCKED FOR SPOKES/MASONS)
         ===================================================================== */}
      {activeTab === "navigation" && (
        <div className="flex flex-col gap-4 pb-12 animate-in fade-in duration-200">
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={t("lex_studio_search", "Search strings or keys...") as string}
            className="w-full shrink-0"
            rightContent={
              <div className="flex items-center gap-2 px-3 py-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setOnlyCustomized(!onlyCustomized)}
                  className={`h-8 px-3 rounded-xl glass-surface border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
                    onlyCustomized
                      ? "sa-glass-pill-active text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                  }`}
                >
                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                    {t("icon_tune", "tune")}
                  </span>
                  <span>{t("modified", "Customized")}</span>
                </button>
              </div>
            }
          />

          <div className="flex flex-col gap-3.5 w-full">
            {navSubGroups.map((sec) => {
              const filtered = filterKeyList(sec.keys);
              const customInSec = countCustomizedInList(sec.keys);
              const isExpanded = expandedNavGroupId === sec.id;

              if (!isExpanded) {
                return (
                  <div
                    key={sec.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedNavGroupId(sec.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedNavGroupId(sec.id);
                      }
                    }}
                    className="glass-panel rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 border transition-all duration-200 cursor-pointer opacity-60 hover:opacity-95 border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[17px]">
                          {sec.icon}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)] truncate">
                          {sec.overline}
                        </span>
                        <span className="text-xs font-black text-[var(--text)] truncate">
                          {sec.title}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[10px] tabular-nums font-bold">
                        {`${customInSec} / ${filtered.length}`}
                      </span>
                      <ActionButton
                        variant="glass"
                        icon={t("icon_expand_more", "expand_more")}
                        iconOnly={true}
                        onClick={() => setExpandedNavGroupId(sec.id)}
                        className="!w-7 !h-7 !rounded-lg"
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={sec.id}
                  className="glass-panel rounded-2xl p-3.5 flex flex-col gap-3 border opacity-100 !border-[color-mix(in_srgb,var(--text)_26%,transparent)] w-full animate-in fade-in duration-150"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined !text-[17px]">
                          {sec.icon}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)]">
                          {sec.overline}
                        </span>
                        <span className="text-xs font-black text-[var(--text)]">
                          {sec.title}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] text-[10px] tabular-nums font-bold">
                        {`${customInSec} / ${filtered.length}`}
                      </span>
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <EmptyState
                      icon={t("icon_search_off", "search_off")}
                      title={t("no_results", "No matching strings")}
                      className="py-6"
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 w-full">
                      {filtered.map((k) => renderFieldGridCard(k, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PACK METADATA, BATCH FIND/REPLACE & ICON OVERRIDES
         ===================================================================== */}
      {activeTab === "tools" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          {/* Card 1: Pack Metadata */}
          <UniversalGroup
            title={t("lex_studio_meta_btn", "Pack Metadata")}
            icon={t("icon_badge", "badge")}
            headerAction={
              emptyOrDeprecatedBloatCount > 0 ? (
                <ActionButton
                  variant="accent"
                  icon={t("icon_cleaning_services", "cleaning_services")}
                  onClick={handleCompactJson}
                  className="!px-3.5 !py-1.5 !text-[10px] !rounded-xl"
                >
                  {`${t("clear", "Clean")} (${emptyOrDeprecatedBloatCount})`}
                </ActionButton>
              ) : undefined
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full">
              {[
                { key: "_meta_name", label: t("name", "Name"), ph: "Cyberpunk Pack" },
                { key: "_meta_lang", label: t("term_lexicon", "Language"), ph: "en" },
                { key: "_meta_author", label: t("author", "Author"), ph: "Creator" },
                { key: "_meta_version", label: t("version", "Version"), ph: "1.0.0" },
              ].map((m) => (
                <div
                  key={m.key}
                  className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2"
                >
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {m.label}
                  </label>
                  <input
                    type="text"
                    value={parsedDict[m.key] ?? ""}
                    placeholder={m.ph}
                    onChange={(e) => handleUpdateKey(m.key, e.target.value)}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              ))}
            </div>
          </UniversalGroup>

          {/* Card 2: Batch Find & Replace */}
          <UniversalGroup
            title={t("lex_studio_batch_btn", "Batch Find & Replace")}
            icon={t("icon_find_replace", "find_replace")}
          >
            <div className="flex flex-col gap-3.5 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("search", "Find")}
                  </label>
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder={t("lex_studio_find_ph", "Find word or phrase...") as string}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lex_studio_replace_all_btn", "Replace")}
                  </label>
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder={t("lex_studio_replace_ph", "Replace with...") as string}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setWholeWord(!wholeWord)}
                    className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center gap-3 cursor-pointer transition-all"
                  >
                    <span className="text-xs font-bold text-[var(--text)]">
                      {t("lex_studio_whole_word", "Whole word")}
                    </span>
                    <div
                      className={`sa-glass-toggle shrink-0 ${wholeWord ? "is-on" : ""}`}
                      aria-checked={wholeWord}
                    >
                      <div className="sa-glass-toggle-thumb" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMatchCase(!matchCase)}
                    className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center gap-3 cursor-pointer transition-all"
                  >
                    <span className="text-xs font-bold text-[var(--text)]">
                      {t("lex_studio_match_case", "Match case")}
                    </span>
                    <div
                      className={`sa-glass-toggle shrink-0 ${matchCase ? "is-on" : ""}`}
                      aria-checked={matchCase}
                    >
                      <div className="sa-glass-toggle-thumb" />
                    </div>
                  </button>
                </div>

                <ActionButton
                  variant="accent"
                  icon={t("icon_find_replace", "find_replace")}
                  disabled={!findText || batchMatchCount === 0}
                  onClick={executeBatchReplace}
                  className="!px-4 !py-2 !text-xs !rounded-xl"
                >
                  {`${t("lex_studio_replace_all_btn", "Replace")} (${batchMatchCount})`}
                </ActionButton>
              </div>
            </div>
          </UniversalGroup>

          {/* Card 3: Guided Material Icon Overrides & Custom Keys */}
          <UniversalGroup
            title={t("lex_studio_add_key_btn", "Custom Keys & Icon Overrides")}
            icon={t("icon_interests", "interests")}
          >
            {(() => {
              const coreOsIcons = [
                "inventory_2",
                "hub",
                "map",
                "science",
                "history",
                "design_services",
                "construction",
                "shield",
                "rocket_launch",
                "bug_report",
                "palette",
                "translate",
                "tune",
                "delete",
                "search",
                "settings",
                "verified",
                "check_circle",
                "warning",
                "error",
                "folder_open",
                "download",
                "upload",
                "code",
                "menu_book",
                "auto_awesome",
              ];

              const allKnownIcons = Array.from(
                new Set([
                  ...coreOsIcons,
                  ...Object.keys(parsedDict)
                    .filter((k) => k.startsWith("icon_"))
                    .map((k) => k.replace(/^icon_/, "")),
                  ...ICON_CATEGORIES.flatMap((c) => c.icons),
                ])
              );

              const targetIconDropdownOptions = allKnownIcons.map((glyph) => ({
                id: `icon_${glyph}`,
                label: `${humanizeKey(glyph)} (icon_${glyph})`,
                searchText: `${glyph} ${humanizeKey(glyph)} icon_${glyph}`,
                icon: glyph,
              }));

              const categoryDropdownOptions = [
                {
                  id: "core_os",
                  label: t("lex_studio_icon_cat_core", "Core OS & Customized Icons"),
                  icon: t("icon_auto_awesome", "auto_awesome"),
                },
                ...ICON_CATEGORIES.map((cat) => ({
                  id: cat.name,
                  label: cat.name,
                  icon: cat.icons[0] || "apps",
                })),
              ];

              const customizedIconNames = Object.keys(parsedDict)
                .filter((k) => k.startsWith("icon_") && parsedDict[k])
                .map((k) => k.replace(/^icon_/, ""));

              const baseCategoryIcons =
                selectedIconCategory === "core_os"
                  ? Array.from(new Set([...customizedIconNames, ...coreOsIcons]))
                  : ICON_CATEGORIES.find((c) => c.name === selectedIconCategory)?.icons ||
                    coreOsIcons;

              const visibleIcons = iconSearchQuery.trim()
                ? allKnownIcons.filter((ic) =>
                    ic.toLowerCase().includes(iconSearchQuery.trim().toLowerCase())
                  )
                : baseCategoryIcons;

              return (
                <div className="flex flex-col gap-4 w-full">
                  {/* Guided Icon Override Builder Row (No Guessing!) */}
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("lex_studio_icon_builder_title", "Guided OS Icon Override Builder")}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--subtext)] opacity-75">
                        {`${selectedIconTarget} → ${selectedIconReplacement}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 @[780px]:grid-cols-[1fr_240px_auto] gap-3 items-end">
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("lex_studio_icon_target_lbl", "1. Select OS Icon to Override")}
                        </label>
                        <CustomDropdown
                          disableTint={true}
                          searchable={true}
                          value={selectedIconTarget}
                          options={targetIconDropdownOptions}
                          onChange={(val: string[]) => {
                            const chosen = val[0] || "icon_delete";
                            setSelectedIconTarget(chosen);
                            const rawGlyph = chosen.replace(/^icon_/, "");
                            setSelectedIconReplacement(parsedDict[chosen] || rawGlyph);
                          }}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 min-w-0 relative">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                          {t("lex_studio_icon_replacement_lbl", "2. Choose Replacement Icon")}
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveIconPickerKey(
                              activeIconPickerKey === "__builder__" ? null : "__builder__"
                            )
                          }
                          className="h-10 w-full glass-panel rounded-xl px-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[var(--accent)] flex items-center justify-between gap-2 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0">
                              {selectedIconReplacement}
                            </span>
                            <span className="text-xs font-mono font-bold text-[var(--text)] truncate">
                              {selectedIconReplacement}
                            </span>
                          </div>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--subtext)] shrink-0">
                            {t("icon_apps", "apps")}
                          </span>
                        </button>

                        {activeIconPickerKey === "__builder__" && (
                          <div className="absolute right-0 top-12 z-[200]">
                            <IconPicker
                              onSelect={(newGlyph: string) => {
                                setSelectedIconReplacement(newGlyph);
                                setActiveIconPickerKey(null);
                              }}
                              onClose={() => setActiveIconPickerKey(null)}
                            />
                          </div>
                        )}
                      </div>

                      <ActionButton
                        variant="accent"
                        icon={t("icon_check", "check")}
                        onClick={() =>
                          handleUpdateKey(selectedIconTarget, selectedIconReplacement)
                        }
                        className="!h-10 !px-4 !text-xs !rounded-xl shrink-0"
                      >
                        {t("apply", "Apply")}
                      </ActionButton>
                    </div>
                  </div>

                  {/* Browse & Edit OS Icons By Category or Search */}
                  <div className="flex flex-col gap-3 pt-1">
                    <div className="grid grid-cols-1 @[680px]:grid-cols-[260px_1fr] gap-3 items-center">
                      <CustomDropdown
                        disableTint={true}
                        searchable={true}
                        value={selectedIconCategory}
                        options={categoryDropdownOptions}
                        onChange={(val: string[]) =>
                          setSelectedIconCategory(val[0] || "core_os")
                        }
                      />
                      <input
                        type="text"
                        value={iconSearchQuery}
                        onChange={(e) => setIconSearchQuery(e.target.value)}
                        placeholder={
                          t(
                            "lex_studio_icon_search_ph",
                            "Filter icons by name (e.g. delete, folder, shield, science)..."
                          ) as string
                        }
                        className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {visibleIcons.slice(0, 32).map((iconName) => {
                        const iconKey = `icon_${iconName}`;
                        const currentGlyph = parsedDict[iconKey] || iconName;
                        const isOverridden =
                          Boolean(parsedDict[iconKey]) && parsedDict[iconKey] !== iconName;
                        return (
                          <div
                            key={iconKey}
                            className={`glass-surface rounded-2xl p-3 border flex items-center justify-between gap-2 relative transition-all ${
                              isOverridden
                                ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                                : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                                <span className="material-symbols-outlined !text-[18px]">
                                  {currentGlyph}
                                </span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-[var(--text)] truncate">
                                  {humanizeKey(iconName)}
                                </span>
                                <span className="text-[9px] font-mono text-[var(--subtext)] opacity-70 truncate">
                                  {isOverridden
                                    ? `${iconName} → ${currentGlyph}`
                                    : `icon_${iconName}`}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isOverridden && (
                                <button
                                  type="button"
                                  onClick={() => handleResetKey(iconKey)}
                                  className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
                                >
                                  <span className="material-symbols-outlined !text-[13px]">
                                    {t("icon_restart_alt", "restart_alt")}
                                  </span>
                                  <HoverTooltip title={t("reset", "Reset")} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveIconPickerKey(
                                    activeIconPickerKey === iconKey ? null : iconKey
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[9px] font-black uppercase text-[var(--text)] cursor-pointer shrink-0"
                              >
                                {t("edit", "Edit")}
                              </button>
                            </div>

                            {activeIconPickerKey === iconKey && (
                              <div className="absolute right-0 top-12 z-[200]">
                                <IconPicker
                                  onSelect={(newGlyph: string) => {
                                    handleUpdateKey(iconKey, newGlyph);
                                    setActiveIconPickerKey(null);
                                  }}
                                  onClose={() => setActiveIconPickerKey(null)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Text Key Addition */}
                  <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-3 items-end pt-3 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("lex_studio_new_key_ph", "Custom Key ID")}
                      </label>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="custom_key_name"
                        className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                        {t("value", "Value")}
                      </label>
                      <input
                        type="text"
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        placeholder={
                          t(
                            "lex_studio_new_val_ph",
                            "Display text (supports {Mod}, {Vault}...)"
                          ) as string
                        }
                        className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <ActionButton
                      variant="accent"
                      icon={t("icon_add", "add")}
                      disabled={!newKeyName.trim()}
                      onClick={handleAddCustomKey}
                      className="!h-10 !px-4 !text-xs !rounded-xl"
                    >
                      {t("add", "Add")}
                    </ActionButton>
                  </div>
                </div>
              );
            })()}
          </UniversalGroup>
        </div>
      )}
    </div>
  );
}

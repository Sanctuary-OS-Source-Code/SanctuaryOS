import { useState, useMemo, useEffect, useRef } from "react";
import {
  useLexicon,
  CORE_GLOSSARY_TERMS,
  interpolateGlossaryTokens,
  isKeeperLockedLexiconKey,
} from "../LexiconContext";
import { useStore } from "../store";
import {
  SUPPORTED_LEXICON_LANGUAGES,
  batchTranslateLexiconStrings,
  resolveTargetLanguageIso,
} from "../utils/translationEngine";
import enDefaultRaw from "../lexicons/en-default.json";
import IconPicker, { ICON_CATEGORIES } from "../IconPicker";
import {
  ActionButton,
  ActionPill,
  CustomDropdown,
  DashboardStatTile,
  EmptyState,
  HoverTooltip,
  SidePanelFilterBar,
} from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";

const enDefault = enDefaultRaw as Record<string, any>;

type StudioMainTab = "glossary" | "strings" | "translate" | "settings";
type AutoTranslateScope = "untranslated" | "essential" | "all";
type StringStatusFilter = "all" | "customized" | "untranslated";

type StringSectionId =
  | "all"
  | "navigation"
  | "vault"
  | "blueprints"
  | "nexus"
  | "lab"
  | "backups"
  | "workbench"
  | "hubs"
  | "common"
  | "landing";

function isDynamicDomainKey(k: string): boolean {
  return (
    k.startsWith("icon_") ||
    k.startsWith("term_") ||
    k.startsWith("class_dd_") ||
    k.startsWith("vault_sub_") ||
    k.startsWith("dlc_type_")
  );
}

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

function classifyStringSection(key: string): Exclude<StringSectionId, "all"> {
  const k = key.toLowerCase();

  if (k.startsWith("landing_")) {
    return "landing";
  }

  if (
    k.startsWith("sidebar_") ||
    k.startsWith("nav_") ||
    k.startsWith("tab_") ||
    NAV_VIEW_TITLE_KEYS.has(k)
  ) {
    return "navigation";
  }

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

const GLOSSARY_EXAMPLE_PHRASES: Record<string, string> = {
  term_mod: "Install a {mod}",
  term_mods: "Scan {Mods} folder",
  term_vault: "Open {Vault}",
  term_blueprint: "Export {Blueprint}",
  term_blueprints: "Active {Blueprints}",
  term_nexus: "Browse {Nexus}",
  term_citizen: "{Citizen} Profile",
  term_citizens: "Active {Citizens}",
  term_mason: "Verified {Mason}",
  term_masons: "Featured {Masons}",
  term_dispatch: "Publish {Dispatch}",
  term_dispatches: "Recent {Dispatches}",
  term_lab: "Launch {Lab}",
  term_backups: "Create {Backups} Snapshot",
  term_settings: "System {Settings}",
  term_chameleon: "Apply {Chameleon}",
  term_chameleons: "Saved {Chameleons}",
  term_lexicon: "Active {Lexicon}",
  term_lexicons: "Installed {Lexicons}",
  term_delete: "{Delete} Permanently",
  term_remove: "{Remove} Selected",
};

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
  const pushStatus = useStore((state) => state.pushStatus);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const canEditKeeperKeys = Boolean(isKeepers || osRole === "keeper");

  const [activeTab, setActiveTab] = useState<StudioMainTab>("glossary");
  const [selectedSection, setSelectedSection] = useState<StringSectionId>("all");
  const [statusFilter, setStatusFilter] = useState<StringStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState<number>(100);
  const [dismissTranslateHint, setDismissTranslateHint] = useState(false);

  // Batch Replace state
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(true);
  const [wholeWord, setWholeWord] = useState(true);
  const [replaceCustomizedOnly, setReplaceCustomizedOnly] = useState(true);

  // 1-Click Neural Auto-Translate state
  const [autoTranslateLang, setAutoTranslateLang] = useState<string>("es");
  const [autoTranslateScope, setAutoTranslateScope] =
    useState<AutoTranslateScope>("untranslated");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [translateStatusMsg, setTranslateStatusMsg] = useState<string | null>(null);
  const translateAbortRef = useRef<AbortController | null>(null);

  // Custom Key & Icon state
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [activeIconPickerKey, setActiveIconPickerKey] = useState<string | null>(null);
  const [selectedIconTarget, setSelectedIconTarget] = useState<string>("icon_delete");
  const [selectedIconReplacement, setSelectedIconReplacement] = useState<string>("delete_forever");
  const [selectedIconCategory, setSelectedIconCategory] = useState<string>("core_os");
  const [iconSearchQuery, setIconSearchQuery] = useState<string>("");
  const [customMetaLangInput, setCustomMetaLangInput] = useState<string>("");

  const isBuiltinFullLexicon = useMemo(() => {
    return (fileName || "").trim().toLowerCase() === "en-default.json";
  }, [fileName]);

  useEffect(() => {
    setVisibleLimit(100);
  }, [activeTab, selectedSection, statusFilter, searchQuery]);

  useEffect(() => {
    setDismissTranslateHint(false);
  }, [fileName]);

  useEffect(() => {
    return () => {
      if (translateAbortRef.current) {
        translateAbortRef.current.abort();
      }
    };
  }, []);

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

  const detectedLangIso = useMemo(() => {
    const baseId = (fileName || "").replace(/\.json$/i, "");
    return resolveTargetLanguageIso(baseId, parsedDict, lexiconMeta);
  }, [fileName, parsedDict._meta_lang, lexiconMeta]);

  useEffect(() => {
    if (detectedLangIso && detectedLangIso !== "en") {
      const supported = SUPPORTED_LEXICON_LANGUAGES.some((l) => l.id === detectedLangIso);
      if (supported) {
        setAutoTranslateLang(detectedLangIso);
      }
    }
  }, [detectedLangIso]);

  const resolvedLangLabel = useMemo(() => {
    const raw = String(parsedDict._meta_lang || "").trim();
    if (!raw || raw.toLowerCase() === "en" || raw.toLowerCase() === "english") {
      return "English";
    }
    const byId = SUPPORTED_LEXICON_LANGUAGES.find(
      (l) =>
        l.id.toLowerCase() === raw.toLowerCase() ||
        l.label.toLowerCase() === raw.toLowerCase()
    );
    if (byId) return byId.label;
    if (detectedLangIso && detectedLangIso !== "en") {
      const byDetected = SUPPORTED_LEXICON_LANGUAGES.find((l) => l.id === detectedLangIso);
      if (byDetected) return byDetected.label;
    }
    return raw;
  }, [parsedDict._meta_lang, detectedLangIso]);

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

  const emptyOrDeprecatedBloatCount = useMemo(() => {
    if (isBuiltinFullLexicon) return 0;
    let count = 0;
    for (const [k, v] of Object.entries(parsedDict)) {
      if (k.startsWith("_meta") || k === "schema_version") continue;
      if (v === "" || v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
        count++;
      } else if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) {
        count++;
      } else if (!isDynamicDomainKey(k) && effectiveReference[k] === undefined) {
        count++;
      } else if (
        !k.startsWith("term_") &&
        !k.startsWith("icon_") &&
        effectiveReference[k] !== undefined &&
        v === effectiveReference[k]
      ) {
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
      if (v === "" || v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
        continue;
      }
      if (!isDynamicDomainKey(k) && effectiveReference[k] === undefined) continue;
      if (
        !k.startsWith("term_") &&
        !k.startsWith("icon_") &&
        effectiveReference[k] !== undefined &&
        v === effectiveReference[k]
      ) {
        continue;
      }
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
      next[key] = enDefault[key] ?? effectiveReference[key] ?? "";
    } else {
      delete next[key];
    }
    commitDict(next);
  };

  const handleResetAllGlossaryTerms = () => {
    if (isBuiltinFullLexicon) return;
    const next = { ...parsedDict };
    for (const term of CORE_GLOSSARY_TERMS) {
      delete next[term.key];
    }
    commitDict(next);
  };

  const handleBlurKey = (key: string, currentVal: any, refVal: any) => {
    if (isBuiltinFullLexicon || key.startsWith("term_") || key.startsWith("_meta")) return;
    if (!canEditKeeperKeys && isKeeperLockedLexiconKey(key)) return;
    if (
      currentVal !== undefined &&
      (String(currentVal).trim() === "" || String(currentVal) === String(refVal ?? ""))
    ) {
      handleResetKey(key);
    }
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
        if (
          val !== "" &&
          val !== null &&
          val !== undefined &&
          (effectiveReference[k] !== undefined || isDynamicDomainKey(k))
        ) {
          keySet.add(k);
        }
      }
    }
    return Array.from(keySet).sort((a, b) => a.localeCompare(b));
  }, [effectiveReference, parsedDict]);

  const {
    uiStringKeys,
    sectionKeysMap,
    customizedGlossaryCount,
    customizedUiCount,
    totalCustomizedCount,
    overriddenIcons,
  } = useMemo(() => {
    const sMap: Record<Exclude<StringSectionId, "all">, string[]> = {
      navigation: [],
      vault: [],
      blueprints: [],
      nexus: [],
      lab: [],
      backups: [],
      workbench: [],
      hubs: [],
      common: [],
      landing: [],
    };
    const uiKeys: string[] = [];
    let glossaryCustom = 0;
    let uiCustom = 0;

    for (const term of CORE_GLOSSARY_TERMS) {
      const val = parsedDict[term.key];
      const refVal = effectiveReference[term.key] ?? term.defaults["en-default"];
      const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
      if (hasVal && String(val) !== String(refVal)) {
        glossaryCustom++;
      }
    }

    for (const k of allKeys) {
      if (k.startsWith("icon_") || k.startsWith("term_")) continue;
      if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) continue;
      uiKeys.push(k);
      const sec = classifyStringSection(k);
      sMap[sec].push(k);

      const val = parsedDict[k];
      const refVal = effectiveReference[k] ?? enDefault[k] ?? "";
      const compareTarget = isBuiltinFullLexicon ? (enDefault[k] ?? "") : refVal;
      const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
      if (hasVal && String(val) !== String(compareTarget)) {
        uiCustom++;
      }
    }

    const icons: Array<{ key: string; baseGlyph: string; overrideGlyph: string }> = [];
    for (const [k, v] of Object.entries(parsedDict)) {
      if (k.startsWith("icon_") && typeof v === "string" && v.trim()) {
        const baseGlyph = k.replace(/^icon_/, "");
        if (v.trim() !== baseGlyph) {
          icons.push({ key: k, baseGlyph, overrideGlyph: v.trim() });
        }
      }
    }

    return {
      uiStringKeys: uiKeys,
      sectionKeysMap: sMap,
      customizedGlossaryCount: glossaryCustom,
      customizedUiCount: uiCustom,
      totalCustomizedCount: glossaryCustom + uiCustom + icons.length,
      overriddenIcons: icons,
    };
  }, [allKeys, parsedDict, effectiveReference, isBuiltinFullLexicon, canEditKeeperKeys]);

  const isKeyCustomized = (k: string): boolean => {
    const val = parsedDict[k];
    const refVal = effectiveReference[k] ?? enDefault[k] ?? "";
    const compareTarget = isBuiltinFullLexicon ? (enDefault[k] ?? "") : refVal;
    const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
    return Boolean(hasVal && String(val) !== String(compareTarget));
  };

  const matchesSearchAndStatus = (k: string): boolean => {
    const custom = isKeyCustomized(k);
    if (statusFilter === "customized" && !custom) return false;
    if (statusFilter === "untranslated" && custom) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    const val = parsedDict[k];
    const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
    const refVal = String(effectiveReference[k] ?? enDefault[k] ?? "");
    if (k.toLowerCase().includes(q)) return true;
    if (hasVal && String(val).toLowerCase().includes(q)) return true;
    if (refVal.toLowerCase().includes(q)) return true;
    if (refVal.includes("{")) {
      const interpolated = interpolateGlossaryTokens(refVal, parsedDict).toLowerCase();
      if (interpolated.includes(q)) return true;
    }
    return false;
  };

  const sectionDefs: Array<{
    id: StringSectionId;
    label: string;
    icon: string;
  }> = [
      {
        id: "all",
        label: t("lex_studio_sec_all", "All Sections"),
        icon: t("icon_apps", "apps"),
      },
      {
        id: "navigation",
        label: t("lex_studio_sec_nav", "Navigation & Titles"),
        icon: t("icon_explore", "explore"),
      },
      {
        id: "vault",
        label: t("lex_studio_cat_vault", "{Vault} & {Mods}"),
        icon: t("icon_inventory_2", "inventory_2"),
      },
      {
        id: "blueprints",
        label: t("tab_blueprints", "{Blueprints}"),
        icon: t("icon_map", "map"),
      },
      {
        id: "nexus",
        label: t("market_title", "The {Nexus}"),
        icon: t("icon_hub", "hub"),
      },
      {
        id: "lab",
        label: t("lex_studio_cat_lab", "{Lab} & Radar"),
        icon: t("icon_science", "science"),
      },
      {
        id: "backups",
        label: t("term_backups", "{Backups}"),
        icon: t("icon_history", "history"),
      },
      {
        id: "workbench",
        label: t("title_sidebar", "Workbench"),
        icon: t("icon_design_services", "design_services"),
      },
      {
        id: "hubs",
        label: t("lex_studio_cat_hubs", "Command Hubs"),
        icon: t("icon_construction", "construction"),
      },
      {
        id: "common",
        label: t("lex_studio_sec_common_short", "Common & {Settings}"),
        icon: t("icon_tune", "tune"),
      },
      {
        id: "landing",
        label: t("lex_studio_sec_landing", "Website Landing"),
        icon: t("icon_public", "public"),
      },
    ];

  const filteredSectionCounts = useMemo(() => {
    const counts: Record<StringSectionId, number> = {
      all: 0,
      navigation: 0,
      vault: 0,
      blueprints: 0,
      nexus: 0,
      lab: 0,
      backups: 0,
      workbench: 0,
      hubs: 0,
      common: 0,
      landing: 0,
    };
    for (const k of uiStringKeys) {
      if (matchesSearchAndStatus(k)) {
        counts.all++;
        const sec = classifyStringSection(k);
        counts[sec]++;
      }
    }
    return counts;
  }, [uiStringKeys, parsedDict, effectiveReference, statusFilter, searchQuery, isBuiltinFullLexicon]);

  const activeStringList = useMemo(() => {
    const sourcePool =
      selectedSection === "all" ? uiStringKeys : sectionKeysMap[selectedSection] || [];
    return sourcePool.filter((k) => matchesSearchAndStatus(k));
  }, [
    selectedSection,
    uiStringKeys,
    sectionKeysMap,
    parsedDict,
    effectiveReference,
    statusFilter,
    searchQuery,
    isBuiltinFullLexicon,
  ]);

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
    ];
    const currentId = (fileName || "").replace(/\.json$/i, "");
    const seen = new Set(["en-default", "en-sanctuary", currentId]);
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
          label: String(customName),
        });
      }
    }
    return opts;
  }, [lexiconMeta, registry, fileName, t]);

  const handleApplyTerminologyFromSource = (sourceId: string) => {
    if (!sourceId) return;
    const next = { ...parsedDict };
    if (sourceId === "en-default") {
      for (const term of CORE_GLOSSARY_TERMS) {
        if (isBuiltinFullLexicon) {
          next[term.key] = term.defaults["en-default"];
        } else {
          delete next[term.key];
        }
      }
    } else if (sourceId === "en-sanctuary") {
      for (const term of CORE_GLOSSARY_TERMS) {
        next[term.key] = term.defaults["en-sanctuary"];
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

  // Scope counts for 1-Click Auto-Translate
  const scopeCounts = useMemo(() => {
    const essentialCount =
      CORE_GLOSSARY_TERMS.length +
      (sectionKeysMap.navigation?.length || 0) +
      (sectionKeysMap.common?.length || 0);
    const fullCount = CORE_GLOSSARY_TERMS.length + uiStringKeys.length;
    const untranslatedGlossary = CORE_GLOSSARY_TERMS.length - customizedGlossaryCount;
    const untranslatedUi = Math.max(0, uiStringKeys.length - customizedUiCount);
    return {
      essential: essentialCount,
      untranslated: untranslatedGlossary + untranslatedUi,
      all: fullCount,
    };
  }, [sectionKeysMap, uiStringKeys.length, customizedGlossaryCount, customizedUiCount]);

  // Batch Find & Replace preview + execution
  const batchPreview = useMemo(() => {
    if (!findText) return { total: 0, samples: [] as Array<{ key: string; before: string; after: string }> };
    try {
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
      const regex = new RegExp(pattern, matchCase ? "g" : "gi");
      let total = 0;
      const samples: Array<{ key: string; before: string; after: string }> = [];

      for (const k of uiStringKeys) {
        const hasCustom =
          parsedDict[k] !== undefined &&
          parsedDict[k] !== null &&
          String(parsedDict[k]).trim() !== "";
        if (replaceCustomizedOnly && !isBuiltinFullLexicon && !hasCustom) continue;
        const v = hasCustom ? parsedDict[k] : effectiveReference[k];
        if (typeof v !== "string") continue;
        if (regex.test(v)) {
          total++;
          regex.lastIndex = 0;
          if (samples.length < 6) {
            samples.push({
              key: k,
              before: v,
              after: v.replace(regex, replaceText),
            });
          }
        }
        regex.lastIndex = 0;
      }
      return { total, samples };
    } catch {
      return { total: 0, samples: [] };
    }
  }, [
    findText,
    replaceText,
    matchCase,
    wholeWord,
    replaceCustomizedOnly,
    isBuiltinFullLexicon,
    parsedDict,
    effectiveReference,
    uiStringKeys,
  ]);

  const executeBatchReplace = () => {
    if (!findText || batchPreview.total === 0) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
    const regex = new RegExp(pattern, matchCase ? "g" : "gi");
    const next = { ...parsedDict };
    let replaced = 0;

    for (const k of uiStringKeys) {
      const hasCustom =
        next[k] !== undefined && next[k] !== null && String(next[k]).trim() !== "";
      if (replaceCustomizedOnly && !isBuiltinFullLexicon && !hasCustom) continue;
      const v = hasCustom ? next[k] : effectiveReference[k];
      if (typeof v !== "string") continue;
      if (regex.test(v)) {
        regex.lastIndex = 0;
        next[k] = v.replace(regex, replaceText);
        replaced++;
      }
      regex.lastIndex = 0;
    }
    commitDict(next);
    if (pushStatus && replaced > 0) {
      pushStatus(
        t("lex_studio_replaced_toast", "Updated {count} strings").replace(
          "{count}",
          String(replaced)
        ),
        "success"
      );
    }
  };

  const handleAddCustomKey = () => {
    const cleanKey = newKeyName.trim().replace(/\s+/g, "_").toLowerCase();
    if (!cleanKey) return;
    if (!canEditKeeperKeys && isKeeperLockedLexiconKey(cleanKey)) return;
    handleUpdateKey(cleanKey, newKeyValue);
    setNewKeyName("");
    setNewKeyValue("");
  };

  const stopBatchAutoTranslate = () => {
    if (translateAbortRef.current) {
      translateAbortRef.current.abort();
      translateAbortRef.current = null;
    }
    setIsTranslating(false);
    setTranslateStatusMsg(t("lex_studio_translate_stopped", "Auto-translation paused"));
  };

  const executeBatchAutoTranslate = async () => {
    if (isBuiltinFullLexicon || isTranslating) return;
    if (!autoTranslateLang || autoTranslateLang === "en") return;

    const targetKeySet = new Set<string>();
    const glossaryKeys = CORE_GLOSSARY_TERMS.map((g) => g.key);

    if (autoTranslateScope === "essential") {
      for (const k of glossaryKeys) targetKeySet.add(k);
      for (const k of sectionKeysMap.navigation || []) targetKeySet.add(k);
      for (const k of sectionKeysMap.common || []) targetKeySet.add(k);
    } else if (autoTranslateScope === "all") {
      for (const k of glossaryKeys) targetKeySet.add(k);
      for (const k of uiStringKeys) targetKeySet.add(k);
    } else {
      for (const k of glossaryKeys) {
        const cur = parsedDict[k];
        const ref = effectiveReference[k] ?? enDefault[k] ?? "";
        if (cur === undefined || String(cur).trim() === "" || String(cur) === String(ref)) {
          targetKeySet.add(k);
        }
      }
      for (const k of uiStringKeys) {
        const cur = parsedDict[k];
        const ref = effectiveReference[k] ?? enDefault[k] ?? "";
        if (cur === undefined || String(cur).trim() === "" || String(cur) === String(ref)) {
          targetKeySet.add(k);
        }
      }
    }

    const entries: Array<{ key: string; source: string }> = [];
    for (const key of targetKeySet) {
      const termDef = CORE_GLOSSARY_TERMS.find((g) => g.key === key);
      const sourceStr = String(
        effectiveReference[key] ?? enDefault[key] ?? termDef?.defaults["en-default"] ?? ""
      ).trim();
      if (sourceStr) {
        entries.push({ key, source: sourceStr });
      }
    }

    if (entries.length === 0) {
      setTranslateStatusMsg(t("lex_studio_translate_done", "Auto-translation complete"));
      return;
    }

    const controller = new AbortController();
    translateAbortRef.current = controller;
    setIsTranslating(true);
    setTranslateStatusMsg(null);
    setTranslateProgress({ completed: 0, total: entries.length });

    const langMeta = SUPPORTED_LEXICON_LANGUAGES.find((l) => l.id === autoTranslateLang);
    const workingDict: Record<string, any> = {
      ...parsedDict,
      _meta_lang: langMeta?.label || autoTranslateLang,
    };

    try {
      await batchTranslateLexiconStrings(entries, autoTranslateLang, {
        signal: controller.signal,
        onProgress: (completed, total, batchPatch) => {
          for (const [k, translated] of Object.entries(batchPatch)) {
            if (!canEditKeeperKeys && isKeeperLockedLexiconKey(k)) continue;
            const refStr = String(effectiveReference[k] ?? enDefault[k] ?? "");
            if (k.startsWith("term_") || translated !== refStr) {
              workingDict[k] = translated;
            }
          }
          setTranslateProgress({ completed, total });
          commitDict({ ...workingDict });
        },
      });
      if (!controller.signal.aborted) {
        setTranslateStatusMsg(t("lex_studio_translate_done", "Auto-translation complete"));
      }
    } finally {
      if (translateAbortRef.current === controller) {
        translateAbortRef.current = null;
      }
      setIsTranslating(false);
    }
  };

  const metaLangDropdownOptions = useMemo(() => {
    const opts = [
      {
        id: "en",
        label: "English",
        searchText: "english en",
        icon: t("icon_language", "language"),
      },
      ...SUPPORTED_LEXICON_LANGUAGES.map((lang) => ({
        id: lang.label,
        label: `${lang.label} (${lang.nativeLabel})`,
        searchText: `${lang.label} ${lang.nativeLabel} ${lang.id}`,
        icon: t("icon_language", "language"),
      })),
    ];
    const currentRaw = String(parsedDict._meta_lang || "").trim();
    if (
      currentRaw &&
      currentRaw.toLowerCase() !== "en" &&
      currentRaw.toLowerCase() !== "english" &&
      !opts.some((o) => o.id.toLowerCase() === currentRaw.toLowerCase())
    ) {
      opts.push({
        id: currentRaw,
        label: `${currentRaw} (${t("custom", "Custom")})`,
        searchText: currentRaw,
        icon: t("icon_auto_awesome", "auto_awesome"),
      });
    }
    return opts;
  }, [parsedDict._meta_lang, t]);

  const currentMetaLangSelectValue = useMemo(() => {
    const currentRaw = String(parsedDict._meta_lang || "en").trim();
    if (!currentRaw || currentRaw.toLowerCase() === "en" || currentRaw.toLowerCase() === "english") {
      return "en";
    }
    const bySupported = SUPPORTED_LEXICON_LANGUAGES.find(
      (l) =>
        l.id.toLowerCase() === currentRaw.toLowerCase() ||
        l.label.toLowerCase() === currentRaw.toLowerCase()
    );
    return bySupported ? bySupported.label : currentRaw;
  }, [parsedDict._meta_lang]);

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
      keys: [
        "term_mod",
        "term_mods",
        "term_vault",
        "term_blueprint",
        "term_blueprints",
        "term_nexus",
      ],
    },
    {
      id: "roles",
      title: t("lex_studio_group_roles", "Community Roles & Posts"),
      icon: t("icon_group", "group"),
      keys: [
        "term_citizen",
        "term_citizens",
        "term_mason",
        "term_masons",
        "term_dispatch",
        "term_dispatches",
      ],
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

  const renderStringCard = (key: string) => {
    const rawVal = parsedDict[key];
    const refVal = String(effectiveReference[key] ?? enDefault[key] ?? "");
    const compareTarget = isBuiltinFullLexicon ? String(enDefault[key] ?? "") : refVal;
    const hasVal = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
    const isCustomized = hasVal && String(rawVal) !== compareTarget;
    const effectiveStr = hasVal ? String(rawVal) : refVal;
    const hasTokens = effectiveStr.includes("{") || refVal.includes("{");
    const livePreview = hasTokens ? interpolateGlossaryTokens(effectiveStr, parsedDict) : null;
    const isLong =
      effectiveStr.length > 90 || refVal.length > 90 || effectiveStr.includes("\n") || refVal.includes("\n");
    const secId = classifyStringSection(key);
    const secDef = sectionDefs.find((s) => s.id === secId);

    return (
      <div
        key={key}
        className={`glass-surface rounded-2xl p-3.5 border flex flex-col justify-between gap-2 transition-all ${isCustomized
          ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
          } ${isLong ? "md:col-span-2" : ""}`}
      >
        {/* Top Metadata & Action Row */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {secDef && selectedSection === "all" && (
              <span className="material-symbols-outlined !text-[13px] text-[var(--accent)] shrink-0">
                {secDef.icon}
              </span>
            )}
            <span className="text-[10px] font-mono font-bold text-[var(--subtext)] opacity-75 truncate select-text">
              {key}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isBuiltinFullLexicon && !isCustomized && refVal && (
              <button
                type="button"
                onClick={() => handleUpdateKey(key, refVal)}
                className="px-2 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[9px] font-black text-[var(--subtext)] hover:text-[var(--text)] flex items-center gap-1 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[11px]">
                  {t("icon_content_copy", "content_copy")}
                </span>
                <span>{t("lex_studio_copy_default_btn", "Edit Copy")}</span>
                <HoverTooltip
                  title={t(
                    "lex_studio_copy_default_tip",
                    "Copy default text into box to edit"
                  )}
                />
              </button>
            )}

            {isCustomized && (
              <>
                <span className="px-2 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--accent)]">
                  {t("modified", "Customized")}
                </span>
                <button
                  type="button"
                  onClick={() => handleResetKey(key)}
                  className="px-2 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_28%,transparent)] text-[9px] font-black text-[var(--subtext)] hover:text-[var(--text)] flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[11px]">
                    {t("icon_restart_alt", "restart_alt")}
                  </span>
                  <span>{t("reset", "Reset")}</span>
                  <HoverTooltip
                    title={t("lex_studio_reset_default_tip", "Revert to default string")}
                  />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Always-Visible Source English Reference (Never vanishes when customized!) */}
        {!isBuiltinFullLexicon && (
          <div className="px-2.5 py-1.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_7%,transparent)] flex items-start gap-2 select-text">
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] opacity-60 shrink-0 mt-0.5">
              {t("default", "Default")}
            </span>
            <span className="text-xs font-medium text-[var(--text)] opacity-85 leading-relaxed break-words">
              {refVal}
            </span>
          </div>
        )}

        {/* Override / Translation Input */}
        {isLong ? (
          <textarea
            rows={2}
            value={isBuiltinFullLexicon ? (rawVal ?? refVal) : (rawVal ?? "")}
            placeholder={
              isBuiltinFullLexicon
                ? refVal
                : detectedLangIso && detectedLangIso !== "en"
                  ? (t("lex_studio_type_translation_ph", "Type translation (or leave blank for default)...") as string)
                  : (t("lex_studio_inherit_ph", "Using default above — type here to override...") as string)
            }
            onChange={(e) => handleUpdateKey(key, e.target.value)}
            onBlur={(e) => handleBlurKey(key, e.target.value, refVal)}
            className="w-full glass-panel rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] resize-y select-text"
          />
        ) : (
          <input
            type="text"
            value={isBuiltinFullLexicon ? (rawVal ?? refVal) : (rawVal ?? "")}
            placeholder={
              isBuiltinFullLexicon
                ? refVal
                : detectedLangIso && detectedLangIso !== "en"
                  ? (t("lex_studio_type_translation_ph", "Type translation (or leave blank for default)...") as string)
                  : (t("lex_studio_inherit_ph", "Using default above — type here to override...") as string)
            }
            onChange={(e) => handleUpdateKey(key, e.target.value)}
            onBlur={(e) => handleBlurKey(key, e.target.value, refVal)}
            className="w-full h-9 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
          />
        )}

        {/* Live Dynamic Glossary Preview */}
        {livePreview && livePreview !== effectiveStr && (
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--success)] px-1 truncate">
            <span className="opacity-75 shrink-0">{t("preview", "Preview")}:</span>
            <span className="truncate">{livePreview}</span>
          </div>
        )}
      </div>
    );
  };

  const inheritedDefaultCount = Math.max(0, uiStringKeys.length - customizedUiCount);
  const showFirstRunTranslateBanner =
    !isBuiltinFullLexicon &&
    !dismissTranslateHint &&
    activeTab !== "translate" &&
    Boolean(detectedLangIso && detectedLangIso !== "en") &&
    customizedUiCount === 0 &&
    SUPPORTED_LEXICON_LANGUAGES.some((l) => l.id === detectedLangIso);

  return (
    <div className="@container flex flex-col h-full min-h-0 w-full overflow-y-auto custom-scrollbar px-5 pt-4 pb-36 gap-4 select-none">
      {/* 1. Clean Pack Header + 1x4 Task-Focused Studio Tabs */}
      <div className="flex flex-col gap-3.5 pb-1 shrink-0">
        <div className="flex flex-col @[840px]:flex-row @[840px]:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col justify-start min-w-0 gap-1">
            <input
              type="text"
              value={parsedDict._meta_name || fileName.replace(/\.json$/i, "")}
              onChange={(e) => handleUpdateKey("_meta_name", e.target.value)}
              className="w-full bg-transparent border-b border-transparent hover:border-[color-mix(in_srgb,var(--text)_20%,transparent)] focus:theme-border-accent outline-none text-xl md:text-2xl font-black text-[var(--text)] tracking-tight transition-colors py-0.5 truncate select-text"
              placeholder={t("label_lexicon_name", "{Lexicon} Display Name")}
            />

            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-mono font-bold text-[var(--subtext)]">
                {fileName || "lexicon.json"}
              </span>

              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className="px-2.5 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:border-[var(--accent)] text-[10px] font-black text-[var(--accent)] flex items-center gap-1 cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined !text-[12px]">
                  {t("icon_language", "language")}
                </span>
                <span>{resolvedLangLabel}</span>
              </button>

              <span className="text-[11px] font-bold text-[var(--subtext)] opacity-80">
                {isBuiltinFullLexicon
                  ? `${allKeys.length.toLocaleString()} ${t("lex_studio_baseline_keys", "Baseline Strings")}`
                  : `${totalCustomizedCount.toLocaleString()} ${t("modified", "Customized")} • ${inheritedDefaultCount.toLocaleString()} ${t("lex_studio_inherited_lbl", "Using Default")}`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isBuiltinFullLexicon && (
              <ActionButton
                variant={
                  isTranslating || (detectedLangIso && detectedLangIso !== "en")
                    ? "accent"
                    : "glass"
                }
                icon={t("icon_translate", "translate")}
                onClick={() => setActiveTab("translate")}
                className="!h-10 !px-3.5 !text-xs !rounded-xl shrink-0"
              >
                {isTranslating && translateProgress
                  ? `${translateProgress.completed}/${translateProgress.total}`
                  : t("lex_studio_auto_translate_btn", "Auto-Translate")}
              </ActionButton>
            )}
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

        {/* Helpful First-Run Banner When Opening an Untranslated Foreign-Language Pack */}
        {showFirstRunTranslateBanner && (
          <div className="glass-panel rounded-2xl px-4 py-3 border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <span className="material-symbols-outlined !text-[18px]">
                  {t("icon_translate", "translate")}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black text-[var(--text)]">
                  {t("lex_studio_ready_translate_title", "Ready to translate into {lang}?").replace(
                    "{lang}",
                    resolvedLangLabel
                  )}
                </span>
                <span className="text-[11px] font-medium text-[var(--subtext)]">
                  {t(
                    "lex_studio_ready_translate_sub",
                    "Use 1-Click Auto-Translate to populate starter or full interface strings in seconds, then fine-tune any phrase."
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ActionButton
                variant="accent"
                icon={t("icon_bolt", "bolt")}
                onClick={() => setActiveTab("translate")}
                className="!h-9 !px-3.5 !text-xs !rounded-xl"
              >
                {t("lex_studio_auto_translate_btn", "Auto-Translate")}
              </ActionButton>
              <button
                type="button"
                onClick={() => setDismissTranslateHint(true)}
                className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[15px]">
                  {t("icon_close", "close")}
                </span>
                <HoverTooltip title={t("close", "Close")} />
              </button>
            </div>
          </div>
        )}

        {/* 1x4 Task-Oriented Studio Tabs */}
        <SidePanelFilterBar className="grid-cols-2 @[820px]:grid-cols-4 gap-3">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_auto_awesome", "auto_awesome")}
            label={t("lex_studio_tab_vocab", "Core Vocabulary")}
            value={
              isBuiltinFullLexicon
                ? String(CORE_GLOSSARY_TERMS.length)
                : `${customizedGlossaryCount} / ${CORE_GLOSSARY_TERMS.length}`
            }
            isActive={activeTab === "glossary"}
            onClick={() => setActiveTab("glossary")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_edit_note", "edit_note")}
            label={t("lex_studio_tab_strings", "UI Strings")}
            value={
              isBuiltinFullLexicon
                ? uiStringKeys.length.toLocaleString()
                : `${customizedUiCount.toLocaleString()} / ${uiStringKeys.length.toLocaleString()}`
            }
            isActive={activeTab === "strings"}
            onClick={() => setActiveTab("strings")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_translate", "translate")}
            label={t("lex_studio_tab_translate", "Translate & Replace")}
            value={
              isTranslating && translateProgress
                ? `${Math.round(
                  (translateProgress.completed / Math.max(1, translateProgress.total)) * 100
                )}%`
                : resolvedLangLabel
            }
            isActive={activeTab === "translate"}
            onClick={() => setActiveTab("translate")}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_badge", "badge")}
            label={t("lex_studio_tab_pack_info", "Pack Info & Icons")}
            value={
              overriddenIcons.length > 0
                ? `v${parsedDict._meta_version || 1} • ${overriddenIcons.length}`
                : `v${parsedDict._meta_version || 1}`
            }
            isActive={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
          />
        </SidePanelFilterBar>
      </div>

      {/* =====================================================================
          TAB 1: CORE VOCABULARY (21 DYNAMIC GLOSSARY TOKENS + LIVE PREVIEWS)
         ===================================================================== */}
      {activeTab === "glossary" && (
        <div className="flex flex-col gap-4 pb-12 animate-in fade-in duration-200">
          {/* Explainer + Quick-Fill Vocabulary Preset Bar */}
          <div className="glass-surface rounded-2xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col @[820px]:flex-row @[820px]:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined !text-[18px] text-[var(--accent)] shrink-0 mt-0.5 sm:mt-0">
                {t("icon_lightbulb", "lightbulb")}
              </span>
              <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                {t(
                  "lex_studio_vocab_helper",
                  "Renaming these 21 words automatically updates {Mod}, {Vault}, {Blueprint}, {Citizen}, and grammar across 5,600+ interface strings—no manual line-by-line editing needed."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="w-[260px] max-w-full">
                <CustomDropdown
                  className="h-9 w-full text-xs"
                  value={null}
                  options={terminologySourceOptions}
                  onChange={(val: any) => {
                    const picked = Array.isArray(val) ? val[0] : val;
                    if (picked) handleApplyTerminologyFromSource(String(picked));
                  }}
                  placeholder={
                    t("lex_studio_quick_fill_vocab", "Quick-Fill From Preset...") as string
                  }
                />
              </div>

              {!isBuiltinFullLexicon && customizedGlossaryCount > 0 && (
                <ActionButton
                  variant="glass"
                  icon={t("icon_restart_alt", "restart_alt")}
                  onClick={handleResetAllGlossaryTerms}
                  className="!h-9 !px-3 !text-xs !rounded-xl shrink-0"
                >
                  {t("lex_studio_reset_terms_btn", "Reset Terms")}
                </ActionButton>
              )}
            </div>
          </div>

          {coreTermGroups.map((group) => (
            <UniversalGroup key={group.id} title={group.title} icon={group.icon}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                {group.keys.map((termKey) => {
                  const term = CORE_GLOSSARY_TERMS.find((g) => g.key === termKey);
                  if (!term) return null;
                  const rawVal = parsedDict[term.key];
                  const refVal =
                    effectiveReference[term.key] ?? term.defaults["en-default"];
                  const compareTarget = isBuiltinFullLexicon
                    ? term.defaults["en-default"]
                    : refVal;
                  const hasVal =
                    rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
                  const isCustom = hasVal && String(rawVal) !== String(compareTarget);
                  const sampleTemplate =
                    GLOSSARY_EXAMPLE_PHRASES[term.key] || `{${term.token}}`;
                  const sampleResolved = interpolateGlossaryTokens(
                    sampleTemplate,
                    parsedDict
                  );

                  return (
                    <div
                      key={term.key}
                      className={`glass-surface rounded-2xl p-3.5 border flex flex-col justify-between gap-2 transition-all ${isCustom
                        ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        : "border-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-black text-[var(--text)] flex items-center gap-1.5 truncate">
                          <span className="material-symbols-outlined !text-[15px] text-[var(--accent)] shrink-0">
                            {t(`icon_${term.icon}`, term.icon)}
                          </span>
                          <span className="truncate">{String(refVal)}</span>
                        </label>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(`{${term.token}}`);
                              if (pushStatus) {
                                pushStatus(
                                  t("copied_to_clipboard", "Copied to clipboard"),
                                  "info"
                                );
                              }
                            }}
                            className="px-2 py-0.5 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--accent)] text-[10px] font-mono font-bold text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer transition-all"
                          >
                            {`{${term.token}}`}
                            <HoverTooltip
                              title={t("lex_studio_copy_token_tip", "Click to copy token")}
                            />
                          </button>

                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => handleResetKey(term.key)}
                              className="w-6 h-6 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[var(--text)] text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer flex items-center justify-center"
                            >
                              <span className="material-symbols-outlined !text-[13px]">
                                {t("icon_restart_alt", "restart_alt")}
                              </span>
                              <HoverTooltip title={`${t("reset", "Reset")}: ${String(refVal)}`} />
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        type="text"
                        value={isBuiltinFullLexicon ? (rawVal ?? refVal) : (rawVal ?? "")}
                        placeholder={String(refVal)}
                        onChange={(e) => handleUpdateKey(term.key, e.target.value)}
                        className="w-full h-9 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                      />

                      <div className="flex items-center justify-between gap-1.5 text-[10px] font-semibold text-[var(--subtext)] opacity-80 px-0.5 truncate">
                        <span className="font-mono opacity-65 truncate">{sampleTemplate}</span>
                        <span className="text-[var(--success)] font-bold truncate shrink-0">
                          {`→ ${sampleResolved}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </UniversalGroup>
          ))}
        </div>
      )}

      {/* =====================================================================
          TAB 2: UNIFIED UI STRINGS BROWSER (GLOBAL SEARCH + CATEGORY PILLS)
         ===================================================================== */}
      {activeTab === "strings" && (
        <div className="flex flex-col gap-3.5 pb-12 animate-in fade-in duration-200">
          {/* Unified Search + Status Filter Bar */}
          <ActionPill
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchPlaceholder={
              t(
                "lex_studio_search_unified",
                "Search Default English, custom overrides, or key IDs..."
              ) as string
            }
            className="w-full shrink-0"
            rightContent={
              !isBuiltinFullLexicon ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0">
                  {(
                    [
                      {
                        id: "all" as const,
                        label: t("all", "All"),
                        count: uiStringKeys.length,
                      },
                      {
                        id: "customized" as const,
                        label: t("modified", "Customized"),
                        count: customizedUiCount,
                      },
                      {
                        id: "untranslated" as const,
                        label:
                          detectedLangIso && detectedLangIso !== "en"
                            ? t("lex_studio_filter_untranslated", "Untranslated")
                            : t("default", "Default"),
                        count: Math.max(0, uiStringKeys.length - customizedUiCount),
                      },
                    ] as const
                  ).map((st) => {
                    const active = statusFilter === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setStatusFilter(st.id)}
                        className={`h-8 px-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${active
                          ? "sa-glass-pill-active text-[var(--text)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                          : "bg-transparent border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                          }`}
                      >
                        <span>{st.label}</span>
                        <span className="font-mono opacity-75 tabular-nums">
                          {st.count.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : undefined
            }
          />

          {/* Workbench-Style Glass Section Filter Pills (No Hidden Accordions!) */}
          <div className="flex flex-wrap items-center gap-1.5 w-full">
            {sectionDefs.map((sec) => {
              const count = filteredSectionCounts[sec.id] || 0;
              const isSelected = selectedSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSelectedSection(sec.id)}
                  className={`h-8 px-3 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${isSelected
                    ? "sa-glass-pill-active text-[var(--text)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                    : "glass-surface border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
                    }`}
                >
                  <span className="material-symbols-outlined !text-[14px] text-[var(--accent)]">
                    {sec.icon}
                  </span>
                  <span>{sec.label}</span>
                  <span className="text-[10px] font-mono opacity-70 tabular-nums">
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Results Summary & Clear Filters */}
          {(searchQuery.trim() || statusFilter !== "all" || selectedSection !== "all") && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-bold text-[var(--subtext)]">
                {t("lex_studio_showing_count", "Showing {count} matching strings").replace(
                  "{count}",
                  activeStringList.length.toLocaleString()
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setSelectedSection("all");
                }}
                className="text-[11px] font-black text-[var(--accent)] hover:underline cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_filter_alt_off", "filter_alt_off")}
                </span>
                <span>{t("clear", "Clear")}</span>
              </button>
            </div>
          )}

          {/* String Grid */}
          {activeStringList.length === 0 ? (
            <EmptyState
              icon={t("icon_search_off", "search_off")}
              title={t("no_results", "No matching strings")}
              subtitle={
                statusFilter === "customized"
                  ? t(
                    "lex_studio_no_custom_yet",
                    "No custom string overrides match your filter yet."
                  )
                  : undefined
              }
              className="py-10"
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {activeStringList.slice(0, visibleLimit).map((k) => renderStringCard(k))}
              </div>

              {activeStringList.length > visibleLimit && (
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <ActionButton
                    variant="glass"
                    icon={t("icon_expand_more", "expand_more")}
                    onClick={() => setVisibleLimit((prev) => prev + 120)}
                    className="!h-9 !px-4 !text-xs !rounded-xl"
                  >
                    {`${t("show_more", "Show More")} (+120)`}
                  </ActionButton>
                  <ActionButton
                    variant="glass"
                    icon={t("icon_unfold_more", "unfold_more")}
                    onClick={() => setVisibleLimit(activeStringList.length)}
                    className="!h-9 !px-4 !text-xs !rounded-xl"
                  >
                    {`${t("lex_studio_show_all_strings", "Show All")} (${activeStringList.length.toLocaleString()})`}
                  </ActionButton>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: 1-CLICK AUTO-TRANSLATE & SAFE BATCH FIND/REPLACE
         ===================================================================== */}
      {activeTab === "translate" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          {!isBuiltinFullLexicon && (
            <UniversalGroup
              title={t("lex_studio_auto_translate_clean_title", "1-Click Language Auto-Translate")}
              icon={t("icon_translate", "translate")}
            >
              <div className="flex flex-col gap-4 w-full">
                <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                  {t(
                    "lex_studio_auto_translate_desc",
                    "Translates {Lexicon} strings into your target language while keeping {Mod}, {Vault}, {Blueprint}, and variable tokens intact."
                  )}
                </p>

                {/* Step 1: Pick Target Language */}
                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {t("lex_studio_target_lang_lbl", "Target Language")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    searchable={true}
                    value={autoTranslateLang}
                    options={SUPPORTED_LEXICON_LANGUAGES.map((lang) => ({
                      id: lang.id,
                      label: `${lang.label} (${lang.nativeLabel})`,
                      searchText: `${lang.label} ${lang.nativeLabel} ${lang.id}`,
                      icon: t("icon_language", "language"),
                    }))}
                    onChange={(val: string[]) => {
                      const chosen = val[0] || "es";
                      setAutoTranslateLang(chosen);
                      const meta = SUPPORTED_LEXICON_LANGUAGES.find((l) => l.id === chosen);
                      if (meta) {
                        handleUpdateKey("_meta_lang", meta.label);
                      }
                    }}
                  />
                </div>

                {/* Step 2: Pick Scope via Clear Visual Tiles with Live Counts */}
                <div className="flex flex-col gap-2 w-full">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] ml-1">
                    {t("lex_studio_translate_scope_lbl", "Translation Scope")}
                  </label>
                  <SidePanelFilterBar className="@[760px]:grid-cols-3 gap-3">
                    <DashboardStatTile
                      variant="filter"
                      icon={t("icon_bolt", "bolt")}
                      label={t(
                        "lex_studio_scope_essential_short",
                        "Core Terms, Nav & Common Buttons"
                      )}
                      value={`${t("lex_studio_starter_lbl", "Starter")} (${scopeCounts.essential.toLocaleString()})`}
                      isActive={autoTranslateScope === "essential"}
                      onClick={() => setAutoTranslateScope("essential")}
                    />
                    <DashboardStatTile
                      variant="filter"
                      icon={t("icon_auto_fix_high", "auto_fix_high")}
                      label={t(
                        "lex_studio_scope_untranslated_short",
                        "Keeps Existing Custom Edits Safe"
                      )}
                      value={`${t("lex_studio_remaining_lbl", "Remaining")} (${scopeCounts.untranslated.toLocaleString()})`}
                      isActive={autoTranslateScope === "untranslated"}
                      onClick={() => setAutoTranslateScope("untranslated")}
                    />
                    <DashboardStatTile
                      variant="filter"
                      icon={t("icon_public", "public")}
                      label={t(
                        "lex_studio_scope_all_short",
                        "Overwrites All Interface Strings"
                      )}
                      value={`${t("all", "All")} (${scopeCounts.all.toLocaleString()})`}
                      isActive={autoTranslateScope === "all"}
                      onClick={() => setAutoTranslateScope("all")}
                    />
                  </SidePanelFilterBar>
                </div>

                {/* Action & Live Progress Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] font-medium text-[var(--subtext)]">
                    {t(
                      "lex_studio_translate_safe_note",
                      "You can pause anytime—completed batches are saved immediately to your draft."
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    {customizedUiCount > 0 && !isTranslating && (
                      <ActionButton
                        variant="glass"
                        icon={t("icon_visibility", "visibility")}
                        onClick={() => {
                          setStatusFilter("customized");
                          setActiveTab("strings");
                        }}
                        className="!h-10 !px-4 !text-xs !rounded-xl"
                      >
                        {t("lex_studio_review_translated_btn", "Review Strings")}
                      </ActionButton>
                    )}

                    {isTranslating ? (
                      <ActionButton
                        variant="danger"
                        icon={t("icon_stop_circle", "stop_circle")}
                        onClick={stopBatchAutoTranslate}
                        className="!h-10 !px-5 !text-xs !rounded-xl"
                      >
                        {t("cancel", "Cancel")}
                      </ActionButton>
                    ) : (
                      <ActionButton
                        variant="accent"
                        icon={t("icon_translate", "translate")}
                        onClick={executeBatchAutoTranslate}
                        className="!h-10 !px-5 !text-xs !rounded-xl"
                      >
                        {`${t("lex_studio_start_translate_btn", "Translate")} (${scopeCounts[
                          autoTranslateScope
                        ].toLocaleString()})`}
                      </ActionButton>
                    )}
                  </div>
                </div>

                {(isTranslating || translateProgress || translateStatusMsg) && (
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold">
                      <span className="text-[var(--text)] truncate">
                        {isTranslating
                          ? t("lex_studio_translating_status", "Translating strings...")
                          : translateStatusMsg ||
                          t("lex_studio_translate_done", "Auto-translation complete")}
                      </span>
                      {translateProgress && (
                        <span className="font-mono tabular-nums text-[var(--accent)] shrink-0">
                          {`${translateProgress.completed.toLocaleString()} / ${translateProgress.total.toLocaleString()}`}
                        </span>
                      )}
                    </div>
                    {translateProgress && translateProgress.total > 0 && (
                      <div className="w-full h-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all duration-200"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (translateProgress.completed / translateProgress.total) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </UniversalGroup>
          )}

          {/* Card 2: Batch Find & Replace with Safe Live Preview */}
          <UniversalGroup
            title={t("lex_studio_batch_btn", "Batch Find & Replace")}
            icon={t("icon_find_replace", "find_replace")}
          >
            <div className="flex flex-col gap-3.5 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lex_studio_find_lbl", "Find Text")}
                  </label>
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder={t("lex_studio_find_ph", "Find word or phrase...") as string}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lex_studio_replace_with_lbl", "Replace With")}
                  </label>
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder={t("lex_studio_replace_ph", "Replace with...") as string}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setWholeWord(!wholeWord)}
                    className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center gap-2.5 cursor-pointer transition-all"
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
                    className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center gap-2.5 cursor-pointer transition-all"
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

                  {!isBuiltinFullLexicon && (
                    <button
                      type="button"
                      onClick={() => setReplaceCustomizedOnly(!replaceCustomizedOnly)}
                      className="h-10 px-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center gap-2.5 cursor-pointer transition-all"
                    >
                      <span className="text-xs font-bold text-[var(--text)]">
                        {t("lex_studio_replace_custom_only", "Customized strings only")}
                      </span>
                      <div
                        className={`sa-glass-toggle shrink-0 ${replaceCustomizedOnly ? "is-on" : ""
                          }`}
                        aria-checked={replaceCustomizedOnly}
                      >
                        <div className="sa-glass-toggle-thumb" />
                      </div>
                    </button>
                  )}
                </div>

                <ActionButton
                  variant="accent"
                  icon={t("icon_find_replace", "find_replace")}
                  disabled={!findText || batchPreview.total === 0}
                  onClick={executeBatchReplace}
                  className="!h-10 !px-4 !text-xs !rounded-xl"
                >
                  {`${t("lex_studio_replace_all_btn", "Replace")} (${batchPreview.total.toLocaleString()})`}
                </ActionButton>
              </div>

              {/* Live Diff Preview Before Replacing */}
              {findText && batchPreview.samples.length > 0 && (
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("lex_studio_replace_preview_lbl", "Preview Changes")}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {batchPreview.samples.map((s) => (
                      <div
                        key={s.key}
                        className="px-3 py-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_4%,transparent)] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col gap-1 text-xs"
                      >
                        <span className="text-[10px] font-mono text-[var(--subtext)] opacity-70">
                          {s.key}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[var(--subtext)] line-through opacity-80">
                            {s.before}
                          </span>
                          <span className="text-[var(--accent)] font-black">→</span>
                          <span className="text-[var(--success)] font-bold">{s.after}</span>
                        </div>
                      </div>
                    ))}
                    {batchPreview.total > batchPreview.samples.length && (
                      <span className="text-[11px] font-semibold text-[var(--subtext)] px-1 pt-0.5">
                        {t("lex_studio_and_more_matches", "...and {count} more matching strings").replace(
                          "{count}",
                          (batchPreview.total - batchPreview.samples.length).toLocaleString()
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </UniversalGroup>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PACK METADATA, STORAGE HEALTH & ICON OVERRIDES
         ===================================================================== */}
      {activeTab === "settings" && (
        <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-200">
          {/* Card 1: Pack Identity & Sparse Storage */}
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
                  {t("lex_studio_clean_redundant_btn", "Remove {count} Redundant Keys").replace(
                    "{count}",
                    String(emptyOrDeprecatedBloatCount)
                  )}
                </ActionButton>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-3.5 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full">
                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("name", "Name")}
                  </label>
                  <input
                    type="text"
                    value={parsedDict._meta_name ?? ""}
                    placeholder={fileName.replace(/\.json$/i, "")}
                    onChange={(e) => handleUpdateKey("_meta_name", e.target.value)}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("language", "Language")}
                  </label>
                  <CustomDropdown
                    disableTint={true}
                    searchable={true}
                    value={currentMetaLangSelectValue}
                    options={metaLangDropdownOptions}
                    onChange={(val: string[]) => {
                      const picked = val[0] || "en";
                      handleUpdateKey("_meta_lang", picked);
                    }}
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("author", "Author")}
                  </label>
                  <input
                    type="text"
                    value={parsedDict._meta_author ?? ""}
                    placeholder="Creator"
                    onChange={(e) => handleUpdateKey("_meta_author", e.target.value)}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>

                <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                    {t("version", "Version")}
                  </label>
                  <input
                    type="text"
                    value={parsedDict._meta_version ?? "1"}
                    placeholder="1"
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      handleUpdateKey(
                        "_meta_version",
                        !Number.isNaN(num) && e.target.value.trim() !== ""
                          ? num
                          : e.target.value
                      );
                    }}
                    className="w-full h-10 glass-panel rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                </div>
              </div>

              {/* Optional Custom Dialect / Constructed Language Input */}
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-black text-[var(--text)]">
                    {isBuiltinFullLexicon
                      ? t("lex_studio_baseline_summary_title", "Master Standard English Baseline")
                      : t("lex_studio_sparse_summary_title", "Sparse Delta Storage")}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--subtext)]">
                    {isBuiltinFullLexicon
                      ? t(
                        "lex_studio_baseline_summary_desc",
                        "Every other {Lexicon} pack automatically inherits missing strings from this file."
                      )
                      : t(
                        "lex_studio_sparse_summary_desc",
                        "Stores {custom} custom entries and automatically inherits {inherited} default strings from en-default.json."
                      )
                        .replace("{custom}", totalCustomizedCount.toLocaleString())
                        .replace("{inherited}", inheritedDefaultCount.toLocaleString())}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={customMetaLangInput}
                    onChange={(e) => setCustomMetaLangInput(e.target.value)}
                    placeholder={t("lex_studio_custom_dialect_ph", "Custom language name...") as string}
                    className="w-44 h-9 glass-panel rounded-xl px-3 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                  />
                  <ActionButton
                    variant="glass"
                    disabled={!customMetaLangInput.trim()}
                    onClick={() => {
                      handleUpdateKey("_meta_lang", customMetaLangInput.trim());
                      setCustomMetaLangInput("");
                    }}
                    className="!h-9 !px-3 !text-xs !rounded-xl"
                  >
                    {t("lex_studio_set_lang_btn", "Set Language")}
                  </ActionButton>
                </div>
              </div>
            </div>
          </UniversalGroup>

          {/* Card 2: Material Icon Overrides */}
          <UniversalGroup
            title={t("lex_studio_icon_overrides_title", "Icon Overrides")}
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
                  ...overriddenIcons.map((o) => o.baseGlyph),
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

              const baseCategoryIcons =
                selectedIconCategory === "core_os"
                  ? Array.from(new Set([...overriddenIcons.map((o) => o.baseGlyph), ...coreOsIcons]))
                  : ICON_CATEGORIES.find((c) => c.name === selectedIconCategory)?.icons ||
                  coreOsIcons;

              const visibleIcons = iconSearchQuery.trim()
                ? allKnownIcons.filter((ic) =>
                  ic.toLowerCase().includes(iconSearchQuery.trim().toLowerCase())
                )
                : baseCategoryIcons;

              return (
                <div className="flex flex-col gap-4 w-full">
                  {/* Active Icon Overrides Strip */}
                  {overriddenIcons.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {overriddenIcons.map((ic) => (
                        <div
                          key={ic.key}
                          className="px-3 py-1.5 rounded-xl bg-transparent border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center gap-2 text-xs"
                        >
                          <span className="material-symbols-outlined !text-[15px] text-[var(--subtext)]">
                            {ic.baseGlyph}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--subtext)]">→</span>
                          <span className="material-symbols-outlined !text-[16px] text-[var(--accent)]">
                            {ic.overrideGlyph}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[var(--text)]">
                            {ic.baseGlyph}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleResetKey(ic.key)}
                            className="text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer flex items-center ml-0.5"
                          >
                            <span className="material-symbols-outlined !text-[14px]">
                              {t("icon_close", "close")}
                            </span>
                            <HoverTooltip title={t("reset", "Reset")} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-[var(--subtext)]">
                      {t(
                        "lex_studio_no_icon_overrides",
                        "No custom icon overrides set—all interface icons currently use standard Material Symbols."
                      )}
                    </p>
                  )}

                  {/* Guided Icon Override Builder */}
                  <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-3">
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

                  {/* Browse Icons Grid */}
                  <div className="flex flex-col gap-3">
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
                        className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {visibleIcons.slice(0, 24).map((iconName) => {
                        const iconKey = `icon_${iconName}`;
                        const currentGlyph = parsedDict[iconKey] || iconName;
                        const isOverridden =
                          Boolean(parsedDict[iconKey]) && parsedDict[iconKey] !== iconName;
                        return (
                          <div
                            key={iconKey}
                            className={`glass-surface rounded-2xl p-3 border flex items-center justify-between gap-2 relative transition-all ${isOverridden
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
                                  className="w-6 h-6 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] flex items-center justify-center text-[var(--subtext)] hover:text-[var(--text)] cursor-pointer"
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
                                className="px-2.5 py-1 rounded-lg bg-transparent border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] text-[9px] font-black uppercase text-[var(--text)] cursor-pointer shrink-0"
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
                </div>
              );
            })()}
          </UniversalGroup>

          {/* Card 3: Custom Schema / Domain Key */}
          <UniversalGroup
            title={t("lex_studio_custom_keys_title", "Custom Schema & Category Keys")}
            icon={t("icon_add_circle", "add_circle")}
          >
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] gap-3 items-end w-full">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)]">
                  {t("lex_studio_new_key_ph", "Custom Key ID")}
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="class_dd_custom_category"
                  className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-mono font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
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
                  className="w-full h-10 glass-surface rounded-xl px-3.5 text-xs font-bold text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:outline-none focus:border-[var(--accent)] select-text"
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
          </UniversalGroup>
        </div>
      )}
    </div>
  );
}

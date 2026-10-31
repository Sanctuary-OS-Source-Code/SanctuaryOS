import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  SidePanel,
  DashboardStatTile,
  EmptyState,
  VAULT_CHIP_CLASS,
  ModData,
  getModIcon,
  HoverTooltip,
  countBlueprintArtifacts,
} from "../shared";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { isDesktop } from "../utils/envUtils";
import { isRootDomain, scrollToLandingSection } from "../utils/routingUtils";

export interface GlobalCommandPaletteProps {
  onInspectMod: (mod: ModData) => void;
  onToggleModInBlueprint: (mod: ModData) => void;
  onEquipBlueprint: (setName: string) => void;
  onQuickLaunch: () => void;
  onRunRadarSweep: () => void;
  onOpenDropzone: () => void;
  onTriggerFullBackup: () => void;
  onTriggerPrePatchSnapshot: () => void;
  onOpenNotifications: () => void;
}

type CommandCategory = "all" | "views" | "vault" | "actions";

interface CommandItem {
  id: string;
  category: Exclude<CommandCategory, "all">;
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeIcon: string;
  badgeColorVar?: string;
  icon: string;
  iconColorClass?: string;
  keywords: string;
  isActive?: boolean;
  onSelect: () => void;
  secondaryAction?: {
    label: string;
    icon: string;
    isActive?: boolean;
    onClick: (e: React.MouseEvent) => void;
  };
}

function isSubsequenceOfInitials(queryToken: string, words: string[]): boolean {
  if (queryToken.length < 2 || queryToken.length > words.length) return false;
  let qi = 0;
  for (let wi = 0; wi < words.length && qi < queryToken.length; wi++) {
    if (words[wi].startsWith(queryToken[qi])) {
      qi++;
    }
  }
  return qi === queryToken.length;
}

function scoreSingleToken(token: string, fieldLower: string, words: string[]): number {
  if (!token || !fieldLower) return 0;

  // 1. Exact full field match
  if (fieldLower === token) return 1200;

  // 2. Exact word match
  for (let i = 0; i < words.length; i++) {
    if (words[i] === token) {
      return 1000 - Math.min(i * 15, 120);
    }
  }

  // 3. Word prefix match (e.g. "part" -> "partner", "keep" -> "keepers")
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(token)) {
      return 850 - Math.min(i * 15, 120);
    }
  }

  // 4. Contiguous substring match inside a word or phrase (require >= 2 chars)
  if (token.length >= 2) {
    const idx = fieldLower.indexOf(token);
    if (idx !== -1) {
      return 650 - Math.min(idx * 2, 150);
    }
  }

  // 5. Word-initial acronym match (e.g. "kc" -> "Keepers Core", "ps" -> "Partner Spokes")
  if (isSubsequenceOfInitials(token, words)) {
    return 520;
  }

  return 0;
}

function scoreFuzzyMatch(query: string, title: string, subtitle: string, keywords: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;

  const titleLower = title.toLowerCase();
  const subLower = subtitle.toLowerCase();
  const kwLower = keywords.toLowerCase();

  // Direct phrase match boost
  if (titleLower === q) return 2500;
  if (titleLower.startsWith(q)) return 2000;
  if (titleLower.includes(q)) return 1600 - Math.min(titleLower.indexOf(q) * 2, 200);

  const queryTokens = q.split(/[\s>_/-]+/).filter(Boolean);
  if (queryTokens.length === 0) return 1;

  const titleWords = titleLower.split(/[^a-z0-9]+/).filter(Boolean);
  const subWords = subLower.split(/[^a-z0-9]+/).filter(Boolean);
  const kwWords = kwLower.split(/[^a-z0-9]+/).filter(Boolean);

  let totalScore = 0;
  for (const tok of queryTokens) {
    const tScore = scoreSingleToken(tok, titleLower, titleWords) * 1.5;
    const sScore = scoreSingleToken(tok, subLower, subWords) * 0.85;
    const kScore = scoreSingleToken(tok, kwLower, kwWords) * 0.9;
    const bestForToken = Math.max(tScore, sScore, kScore);

    // Every token in the user's query must genuinely match at least one field
    if (bestForToken <= 0) {
      return 0;
    }
    totalScore += bestForToken;
  }

  return totalScore / queryTokens.length;
}

const cleanNavLabel = (raw: any, fallback: string): string => {
  const s = String(raw || fallback || "").replace(/^[^\w{]*/, "").trim();
  return s || fallback;
};

export function GlobalCommandPalette({
  onInspectMod,
  onToggleModInBlueprint,
  onEquipBlueprint,
  onQuickLaunch,
  onRunRadarSweep,
  onOpenDropzone,
  onTriggerFullBackup,
  onTriggerPrePatchSnapshot,
  onOpenNotifications,
}: GlobalCommandPaletteProps) {
  const { t, activeLang, setActiveLang, lexiconMeta } = useLexicon();
  const { activeThemeId, setActiveThemeId, CORE_THEMES, customThemes, gameThemes } = useTheme();

  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const modList = useStore((state) => state.modList);
  const playSets = useStore((state) => state.playSets);
  const activeSetName = useStore((state) => state.activeSetName);
  const userRole = useStore((state) => state.userRole);
  const osRole = useStore((state) => state.osRole);
  const isConfigured = useStore((state) => state.isConfigured);
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const marketTab = useStore((state) => state.marketTab);
  const setMarketTab = useStore((state) => state.setMarketTab);
  const cwMainTab = useStore((state) => state.cwMainTab);
  const setCwMainTab = useStore((state) => state.setCwMainTab);
  const masonActiveTab = useStore((state) => state.masonActiveTab);
  const setMasonActiveTab = useStore((state) => state.setMasonActiveTab);
  const architectActiveTab = useStore((state) => state.architectActiveTab);
  const setArchitectActiveTab = useStore((state) => state.setArchitectActiveTab);
  const oversightActiveTab = useStore((state) => state.oversightActiveTab);
  const setOversightActiveTab = useStore((state) => state.setOversightActiveTab);
  const wayfinderActiveTab = useStore((state) => state.wayfinderActiveTab);
  const setWayfinderActiveTab = useStore((state) => state.setWayfinderActiveTab);
  const keepersActiveTab = useStore((state) => state.keepersActiveTab);
  const setKeepersActiveTab = useStore((state) => state.setKeepersActiveTab);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CommandCategory>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const openPalette = useCallback((initialTab?: CommandCategory) => {
    if (initialTab) setActiveTab(initialTab);
    setIsOpen(true);
    setSelectedIndex(0);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            setSelectedIndex(0);
            window.setTimeout(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            }, 40);
          }
          return next;
        });
      }
    };

    const handleCustomOpen = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const requestedTab = detail?.tab as CommandCategory | undefined;
      openPalette(requestedTab);
    };

    const handleCustomClose = () => {
      closePalette();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("sanctuary-open-command-palette", handleCustomOpen);
    window.addEventListener("sanctuary-close-command-palette", handleCustomClose);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("sanctuary-open-command-palette", handleCustomOpen);
      window.removeEventListener("sanctuary-close-command-palette", handleCustomClose);
    };
  }, [openPalette, closePalette]);

  const activeBlueprintModsSet = useMemo(() => {
    const set = new Set<string>();
    if (!isOpen) return set;
    const currentSet = (playSets || []).find(
      (ps: any) => String(ps?.name || "").toLowerCase() === String(activeSetName || "").toLowerCase()
    );
    if (currentSet && Array.isArray(currentSet.mods)) {
      for (const m of currentSet.mods) {
        const raw = typeof m === "string" ? m : m?.name || m?.path || "";
        const clean = (raw.split(/[\\/]/).pop() || raw).toLowerCase();
        if (clean) set.add(clean);
      }
    }
    return set;
  }, [isOpen, playSets, activeSetName]);

  const navigateToLandingTab = useCallback(
    (tabId: string) => {
      setView("landing");
      window.setTimeout(() => scrollToLandingSection(tabId), 50);
      closePalette();
    },
    [setView, closePalette]
  );

  const navigateToView = useCallback(
    (targetView: string) => {
      setView(targetView);
      closePalette();
    },
    [setView, closePalette]
  );

  const navigateToSettingsTab = useCallback(
    (tabId: string) => {
      try {
        localStorage.setItem("sanctuary_settings_tab", tabId);
      } catch {}
      setView("settings");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("navigateSettings", { detail: { tab: tabId } }));
      }, 40);
      closePalette();
    },
    [setView, closePalette]
  );

  const allItems = useMemo<CommandItem[]>(() => {
    if (!isOpen) return [];
    const items: CommandItem[] = [];
    const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };
    const isWebRootOnly = !isDesktop() && isRootDomain() && !isConfigured;
    const viewsBadge = t("cmd_palette_tab_views", "Views & Hubs");
    const subsectionDescTemplate = t("cmd_palette_subsection_desc", "Open {0} subsection");
    const makeSubDesc = (parentTitle: string, childTitle: string) =>
      subsectionDescTemplate.replace("{0}", `${parentTitle} › ${childTitle}`);

    // 1. OS Views, Hubs & Subsections
    if (!isWebRootOnly) {
      const cmdCenterTitle = t("center_title", "Command Center");
      const vaultTitle = t("vault_title", "Your {Vault}");
      const nexusTitle = t("market_title", "The {Nexus}");
      const blueprintsTitle = t("playsets_title", "{Blueprints}");
      const feedTitle = t("feed_title", "Comm-Link Feed");
      const radarTitle = t("radar_title", "Conflict Radar");
      const labTitle = t("term_lab", "Homestead {Lab}");
      const workbenchTitle = t("title_sidebar", "{Citizen}'s Workbench");
      const backupsTitle = t("term_backups", "{Backups}");
      const masonHubTitle = `${t("mason", "{Mason}")} ${t("sidebar_mason_hub", "Workshop")}`;
      const architectTitle = `${t("tab_architect", "Architect")} ${t("sidebar_architect_hub", "Console")}`;
      const oversightTitle = `${t("stat_oversight", "Oversight")} ${t("wf_tab_command", "Command")}`;
      const wayfinderTitle = `${t("sidebar_wayfinder_tools", "Wayfinder")} ${t("ui_btn_operations", "Operations")}`;

      items.push(
        {
          id: "view_dashboard",
          category: "views",
          title: cmdCenterTitle,
          subtitle: t("center_subtitle", "System Overview, Active Alerts & Workspace Telemetry"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_desktop_windows", "desktop_windows"),
          icon: t("icon_desktop_windows", "desktop_windows"),
          keywords: "dashboard command center home overview status",
          isActive: view === "dashboard",
          onSelect: () => navigateToView("dashboard"),
        },
        {
          id: "view_vault",
          category: "views",
          title: vaultTitle,
          subtitle: t("bunker_subtitle", "Local {Vault}, Secured Assets & Installed {Mods}"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_account_balance", "account_balance"),
          icon: t("icon_account_balance", "account_balance"),
          keywords: "vault library mods packages files installed artifacts",
          isActive: view === "vault",
          onSelect: () => navigateToView("vault"),
        },
        {
          id: "view_nexus",
          category: "views",
          title: nexusTitle,
          subtitle: t("nexus_subtitle", "Verified Community {Mods}, {Masons} & {Blueprints}"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_hub", "hub"),
          icon: t("icon_hub", "hub"),
          keywords: "nexus market browse discover download creators masons",
          isActive: view === "nexus",
          onSelect: () => navigateToView("nexus"),
        }
      );

      // The Nexus Subsections
      const nexusSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        { id: "HOME", label: t("overview", "Overview"), icon: t("icon_dashboard", "dashboard"), kw: "overview home featured" },
        { id: "MODS", label: t("term_mods", "{Mods}"), icon: t("icon_inventory_2", "inventory_2"), kw: "mods artifacts browse download" },
        { id: "BLUEPRINTS", label: t("term_blueprints", "{Blueprints}"), icon: t("icon_map", "map"), kw: "blueprints playsets modpacks" },
        { id: "MASONS", label: t("term_masons", "{Masons}"), icon: t("icon_engineering", "engineering"), kw: "masons creators authors" },
        { id: "AESTHETICS", label: t("tab_aesthetics", "Aesthetics"), icon: t("icon_palette", "palette"), kw: "aesthetics chameleons themes lexicons" },
      ];
      for (const sub of nexusSubsections) {
        items.push({
          id: `sub_nexus_${sub.id}`,
          category: "views",
          title: `${nexusTitle} > ${sub.label}`,
          subtitle: makeSubDesc(nexusTitle, sub.label),
          badgeLabel: nexusTitle,
          badgeIcon: t("icon_hub", "hub"),
          icon: sub.icon,
          keywords: `${nexusTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "nexus" && marketTab === sub.id,
          onSelect: () => {
            setMarketTab(sub.id);
            navigateToView("nexus");
          },
        });
      }

      if (schemaFeatures.has_cc) {
        items.push({
          id: "view_blueprints",
          category: "views",
          title: blueprintsTitle,
          subtitle: t("playsets_subtitle", "Load Orders, Profiles & Curated {Blueprint} Manifests"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_map", "map"),
          icon: t("icon_map", "map"),
          keywords: "blueprints playsets modpacks load order profiles",
          isActive: view === "playsets",
          onSelect: () => navigateToView("playsets"),
        });
      }

      items.push(
        {
          id: "view_feed",
          category: "views",
          title: feedTitle,
          subtitle: t("feed_subtitle", "Creator Dispatches, Polls & Patch Announcements"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_satellite_alt", "satellite_alt"),
          icon: t("icon_satellite_alt", "satellite_alt"),
          keywords: "comm-link feed posts news updates social",
          isActive: view === "GlobalFeed",
          onSelect: () => navigateToView("GlobalFeed"),
        },
        {
          id: "view_radar",
          category: "views",
          title: radarTitle,
          subtitle: t("scout_subtitle", "Resource Overlaps, Duplicate Files & Load-Order Winners"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_track_changes", "track_changes"),
          icon: t("icon_track_changes", "track_changes"),
          keywords: "conflict radar duplicates collisions dbpf scout scanner",
          isActive: view === "DbpfScout",
          onSelect: () => navigateToView("DbpfScout"),
        },
        {
          id: "view_lab",
          category: "views",
          title: labTitle,
          subtitle: t("lab_subtitle", "Save-Airgapped {Mod} Testing & Exception Diagnostics"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_science", "science"),
          icon: t("icon_science", "science"),
          keywords: "homestead lab sandbox test save airgap crash exception",
          isActive: view === "lab",
          onSelect: () => navigateToView("lab"),
        },
        {
          id: "view_workbench",
          category: "views",
          title: workbenchTitle,
          subtitle: t("workbench_subtitle", "Visual Config Sliders, Monaco Diff & Version Timeline"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_design_services", "design_services"),
          icon: t("icon_design_services", "design_services"),
          keywords: "workbench config ini json cfg editor monaco diff",
          isActive: view === "CitizensWorkbench",
          onSelect: () => navigateToView("CitizensWorkbench"),
        }
      );

      // Citizen's Workbench Subsections
      const cwSubsections: { id: "COMMAND" | "CONFIGS" | "TEMPLATES"; label: string; icon: string; kw: string }[] = [
        { id: "COMMAND", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command overview workbench" },
        { id: "CONFIGS", label: t("cw_tab_configs", "Configs"), icon: t("icon_tune", "tune"), kw: "configs settings sliders ini json" },
        { id: "TEMPLATES", label: cleanNavLabel(t("ql_templates", "Templates"), "Templates"), icon: t("icon_data_object", "data_object"), kw: "templates presets defaults" },
      ];
      for (const sub of cwSubsections) {
        items.push({
          id: `sub_cw_${sub.id}`,
          category: "views",
          title: `${workbenchTitle} > ${sub.label}`,
          subtitle: makeSubDesc(workbenchTitle, sub.label),
          badgeLabel: workbenchTitle,
          badgeIcon: t("icon_design_services", "design_services"),
          icon: sub.icon,
          keywords: `${workbenchTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "CitizensWorkbench" && cwMainTab === sub.id,
          onSelect: () => {
            setCwMainTab(sub.id);
            navigateToView("CitizensWorkbench");
          },
        });
      }

      if (schemaFeatures.has_saves) {
        items.push({
          id: "view_time_capsule",
          category: "views",
          title: backupsTitle,
          subtitle: t("backups_subtitle", "Zstd Snapshots, Save Rollbacks & Pre-Patch Archives"),
          badgeLabel: viewsBadge,
          badgeIcon: t("icon_history", "history"),
          icon: t("icon_history", "history"),
          keywords: "time capsule backups saves restore snapshot archive",
          isActive: view === "backups",
          onSelect: () => navigateToView("backups"),
        });
      }

      // Mason Workshop & Subsections
      items.push({
        id: "view_mason_hub",
        category: "views",
        title: masonHubTitle,
        subtitle: t("mason_hub_subtitle", "Package Releases, Static Edge Auto-Push & Creator Tools"),
        badgeLabel: t("term_mason", "{Mason}"),
        badgeIcon: t("icon_construction", "construction"),
        icon: t("icon_construction", "construction"),
        keywords: "mason workshop creator studio publish sandbox static edge",
        isActive: view === "MasonHub",
        onSelect: () => navigateToView("MasonHub"),
      });

      const masonSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
        { id: "sandbox", label: cleanNavLabel(t("term_mods", "{Mods}"), "Mods"), icon: t("icon_deployed_code", "deployed_code"), kw: "sandbox mods artifacts release publish" },
        { id: "nexus", label: cleanNavLabel(t("tab_nexus", "{Nexus}"), "Nexus"), icon: t("icon_hub", "hub"), kw: "nexus marketplace listings" },
        { id: "chameleons", label: cleanNavLabel(t("tab_aesthetics", "Aesthetics"), "Aesthetics"), icon: t("icon_palette", "palette"), kw: "aesthetics chameleons themes lexicons" },
        { id: "collections", label: cleanNavLabel(t("tab_cc", "Collections"), "Collections"), icon: t("icon_collections_bookmark", "collections_bookmark"), kw: "collections sets bundles" },
        { id: "posts", label: cleanNavLabel(t("tab_posts", "{Dispatches}"), "Dispatches"), icon: t("icon_edit_document", "edit_document"), kw: "posts dispatches transmissions blog" },
        { id: "bug_reports", label: cleanNavLabel(t("stat_bugs", "Reports"), "Reports"), icon: t("icon_bug_report", "bug_report"), kw: "bug reports issues feedback" },
      ];
      for (const sub of masonSubsections) {
        items.push({
          id: `sub_mason_${sub.id}`,
          category: "views",
          title: `${masonHubTitle} > ${sub.label}`,
          subtitle: makeSubDesc(masonHubTitle, sub.label),
          badgeLabel: masonHubTitle,
          badgeIcon: t("icon_construction", "construction"),
          icon: sub.icon,
          keywords: `${masonHubTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "MasonHub" && masonActiveTab === sub.id,
          onSelect: () => {
            setMasonActiveTab(sub.id);
            navigateToView("MasonHub");
          },
        });
      }

      // Architect Console & Subsections
      if (["architect", "senior_architect", "oversight", "wayfinder", "admin"].includes(userRole)) {
        items.push({
          id: "view_architect_hub",
          category: "views",
          title: architectTitle,
          subtitle: t("architect_hub_subtitle", "{Mod} Registry, Scout Queue & Compatibility Triage"),
          badgeLabel: t("tab_architect", "Architect"),
          badgeIcon: t("icon_analytics", "analytics"),
          icon: t("icon_analytics", "analytics"),
          keywords: "architect console moderation registry scout queue mass update",
          isActive: view === "ArchitectHub",
          onSelect: () => navigateToView("ArchitectHub"),
        });

        const architectSubsections: { id: string; label: string; icon: string; kw: string }[] = [
          { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
          { id: "registry", label: cleanNavLabel(t("term_mods", "{Mods}"), "Mods"), icon: t("icon_inventory_2", "inventory_2"), kw: "registry mods artifacts database" },
          { id: "queue", label: cleanNavLabel(t("tab_queue", "Scanner"), "Scanner"), icon: t("icon_search", "search"), kw: "scanner scout queue triage" },
          { id: "lab", label: cleanNavLabel(t("tab_diagnostics", "Diagnostics"), "Diagnostics"), icon: t("icon_monitor_heart", "monitor_heart"), kw: "diagnostics lab logs" },
          { id: "collections", label: cleanNavLabel(t("tab_cc", "Collections"), "Collections"), icon: t("icon_collections_bookmark", "collections_bookmark"), kw: "collections sets" },
          { id: "mason_queue", label: cleanNavLabel(t("mason", "{Mason}"), "Mason"), icon: t("icon_construction", "construction"), kw: "mason queue verification" },
          { id: "template_oversight", label: cleanNavLabel(t("ql_templates", "Templates"), "Templates"), icon: t("icon_data_object", "data_object"), kw: "templates config oversight" },
          { id: "nexus_reports", label: cleanNavLabel(t("stat_bugs", "Reports"), "Reports"), icon: t("icon_flag", "flag"), kw: "reports flags moderation" },
          { id: "support_tickets", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_local_activity", "local_activity"), kw: "support tickets help" },
        ];
        for (const sub of architectSubsections) {
          items.push({
            id: `sub_architect_${sub.id}`,
            category: "views",
            title: `${architectTitle} > ${sub.label}`,
            subtitle: makeSubDesc(architectTitle, sub.label),
            badgeLabel: architectTitle,
            badgeIcon: t("icon_analytics", "analytics"),
            icon: sub.icon,
            keywords: `${architectTitle} ${sub.label} ${sub.kw}`,
            isActive: view === "ArchitectHub" && architectActiveTab === sub.id,
            onSelect: () => {
              setArchitectActiveTab(sub.id);
              navigateToView("ArchitectHub");
            },
          });
        }
      }

      // Oversight Command & Subsections
      if (["oversight", "wayfinder", "admin"].includes(userRole)) {
        items.push({
          id: "view_oversight",
          category: "views",
          title: oversightTitle,
          subtitle: t("oversight_subtitle", "Security Audits, Heuristic Signatures & Quarantine Review"),
          badgeLabel: t("stat_oversight", "Oversight"),
          badgeIcon: t("icon_security", "security"),
          icon: t("icon_security", "security"),
          keywords: "oversight command security malware heuristics audit",
          isActive: view === "Oversight",
          onSelect: () => navigateToView("Oversight"),
        });

        const oversightSubsections: { id: string; label: string; icon: string; kw: string }[] = [
          { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
          { id: "oversight_comms", label: cleanNavLabel(t("wf_tab_dispatch", "Dispatch"), "Dispatch"), icon: t("icon_satellite_alt", "satellite_alt"), kw: "dispatch broadcasts announcements" },
          { id: "identities", label: cleanNavLabel(t("tab_identities", "Identity"), "Identity"), icon: t("icon_group", "group"), kw: "identity users roles citizens" },
          { id: "compliance", label: cleanNavLabel(t("tab_compliance", "Compliance"), "Compliance"), icon: t("icon_policy", "policy"), kw: "compliance policy rules" },
          { id: "malware_oversight", label: cleanNavLabel(t("rating_malware", "Malware"), "Malware"), icon: t("icon_coronavirus", "coronavirus"), kw: "malware threats quarantine signatures" },
          { id: "sanctuary_tickets", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_local_activity", "local_activity"), kw: "support tickets help" },
          { id: "mass_update", label: cleanNavLabel(t("tab_mass_update", "Mass Update"), "Mass Update"), icon: t("icon_dynamic_feed", "dynamic_feed"), kw: "mass update batch patch" },
          { id: "game_versions", label: cleanNavLabel(t("tab_game_versions", "Management"), "Management"), icon: t("icon_settings", "settings"), kw: "game versions management" },
          { id: "audit_logs", label: cleanNavLabel(t("tab_audit", "Logs"), "Logs"), icon: t("icon_history", "history"), kw: "audit logs history" },
        ];
        for (const sub of oversightSubsections) {
          items.push({
            id: `sub_oversight_${sub.id}`,
            category: "views",
            title: `${oversightTitle} > ${sub.label}`,
            subtitle: makeSubDesc(oversightTitle, sub.label),
            badgeLabel: oversightTitle,
            badgeIcon: t("icon_security", "security"),
            icon: sub.icon,
            keywords: `${oversightTitle} ${sub.label} ${sub.kw}`,
            isActive: view === "Oversight" && oversightActiveTab === sub.id,
            onSelect: () => {
              setOversightActiveTab(sub.id);
              navigateToView("Oversight");
            },
          });
        }
      }

      // Wayfinder Operations & Subsections
      if (["wayfinder", "admin"].includes(userRole)) {
        items.push({
          id: "view_wayfinder",
          category: "views",
          title: wayfinderTitle,
          subtitle: t("wayfinder_subtitle", "Spoke Control, Master Schemas & Community Governance"),
          badgeLabel: t("sidebar_wayfinder_tools", "Wayfinder"),
          badgeIcon: t("icon_terminal", "terminal"),
          icon: t("icon_terminal", "terminal"),
          keywords: "wayfinder operations spoke control master schema lexicon",
          isActive: view === "WayfinderHub",
          onSelect: () => navigateToView("WayfinderHub"),
        });

        const wayfinderSubsections: { id: string; label: string; icon: string; kw: string }[] = [
          { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
          { id: "wf_comms_title", label: cleanNavLabel(t("wf_tab_dispatch", "Dispatch"), "Dispatch"), icon: t("icon_satellite_alt", "satellite_alt"), kw: "dispatch broadcasts comms" },
          { id: "sanctuary_tickets", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_local_activity", "local_activity"), kw: "support tickets queue" },
          { id: "identities", label: cleanNavLabel(t("tab_identities", "Identity"), "Identity"), icon: t("icon_group", "group"), kw: "identity roles citizens masons" },
          { id: "compliance", label: cleanNavLabel(t("tab_compliance", "Compliance"), "Compliance"), icon: t("icon_policy", "policy"), kw: "compliance rules moderation" },
          { id: "malware_oversight", label: cleanNavLabel(t("rating_malware", "Malware"), "Malware"), icon: t("icon_coronavirus", "coronavirus"), kw: "malware security quarantine" },
          { id: "reports", label: cleanNavLabel(t("stat_bugs", "Reports"), "Reports"), icon: t("icon_flag", "flag"), kw: "reports flags issues" },
          { id: "ide", label: cleanNavLabel(t("wf_tab_spoke_control", "Spoke Control"), "Spoke Control"), icon: t("icon_data_object", "data_object"), kw: "spoke control schema ide database" },
          { id: "chameleons", label: cleanNavLabel(t("wf_tab_spoke_aesthetics", "Spoke Aesthetics"), "Spoke Aesthetics"), icon: t("icon_palette", "palette"), kw: "spoke aesthetics chameleons themes lexicons" },
        ];
        for (const sub of wayfinderSubsections) {
          items.push({
            id: `sub_wayfinder_${sub.id}`,
            category: "views",
            title: `${wayfinderTitle} > ${sub.label}`,
            subtitle: makeSubDesc(wayfinderTitle, sub.label),
            badgeLabel: wayfinderTitle,
            badgeIcon: t("icon_terminal", "terminal"),
            icon: sub.icon,
            keywords: `${wayfinderTitle} ${sub.label} ${sub.kw}`,
            isActive: view === "WayfinderHub" && wayfinderActiveTab === sub.id,
            onSelect: () => {
              setWayfinderActiveTab(sub.id);
              navigateToView("WayfinderHub");
            },
          });
        }
      }
    }

    // Keepers Core & Subsections
    if (["core_dev", "admin", "keeper"].includes(osRole)) {
      const keepersTitle = t("sidebar_keepers_core", "Keepers Core");
      items.push({
        id: "view_keepers_core",
        category: "views",
        title: keepersTitle,
        subtitle: t("keepers_core_subtitle", "Core OS Oversight, Partner Spokes & Global Heuristics"),
        badgeLabel: keepersTitle,
        badgeIcon: t("icon_admin_panel_settings", "admin_panel_settings"),
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        keywords: "keepers core foundry global dispatch partner spokes tickets",
        isActive: view === "KeepersCore",
        onSelect: () => navigateToView("KeepersCore"),
      });

      const keepersSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        { id: "command_center", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command center overview" },
        { id: "keepers_comms", label: cleanNavLabel(t("wf_tab_dispatch", "Dispatch"), "Dispatch"), icon: t("icon_satellite_alt", "satellite_alt"), kw: "dispatch broadcasts release notes" },
        { id: "web_directives", label: cleanNavLabel(t("keepers_tab_web_landing", "Web Landing"), "Web Landing"), icon: t("icon_public", "public"), kw: "web landing directives news legal eula" },
        { id: "active_games", label: cleanNavLabel(t("keepers_tab_partner_spokes", "Partner Spokes"), "Partner Spokes"), icon: t("icon_dns", "dns"), kw: "partner spokes games schemas audit logs applications" },
        { id: "identities", label: cleanNavLabel(t("citizen_oversight", "Citizen Oversight"), "Citizen Oversight"), icon: t("icon_group", "group"), kw: "citizen oversight identities users roles" },
        { id: "heuristics", label: cleanNavLabel(t("core_heuristics_tab", "Core Heuristics"), "Core Heuristics"), icon: t("icon_shield_lock", "shield_lock"), kw: "core heuristics malware signatures security" },
        { id: "support", label: cleanNavLabel(t("wf_tab_tickets", "Support"), "Support"), icon: t("icon_support_agent", "support_agent"), kw: "support tickets feedback applications" },
        { id: "chameleons", label: cleanNavLabel(t("keepers_tab_core_aesthetics", "Core Aesthetics"), "Core Aesthetics"), icon: t("icon_palette", "palette"), kw: "core aesthetics chameleons themes lexicons title area" },
      ];
      for (const sub of keepersSubsections) {
        items.push({
          id: `sub_keepers_${sub.id}`,
          category: "views",
          title: `${keepersTitle} > ${sub.label}`,
          subtitle: makeSubDesc(keepersTitle, sub.label),
          badgeLabel: keepersTitle,
          badgeIcon: t("icon_admin_panel_settings", "admin_panel_settings"),
          icon: sub.icon,
          keywords: `${keepersTitle} ${sub.label} ${sub.kw}`,
          isActive: view === "KeepersCore" && keepersActiveTab === sub.id,
          onSelect: () => {
            setKeepersActiveTab(sub.id);
            navigateToView("KeepersCore");
          },
        });
      }
    }

    // Sanctuary OS Public Hub Sections
    const appTitle = t("sidebar_app_title", "Sanctuary OS");
    const landingSections: { id: string; label: string; subtitle: string; icon: string; kw: string }[] = [
      {
        id: "overview",
        label: t("overview", "Overview"),
        subtitle: t("landing_subtitle", "Sanctuary OS Hub Overview & Pinned Workspaces"),
        icon: t("icon_dashboard", "dashboard"),
        kw: "landing hub overview home welcome",
      },
      {
        id: "workspaces",
        label: t("landing_workspaces", "Active Workspaces"),
        subtitle: t("workspace_section_active_setup", "Switch or Configure Game Workspaces"),
        icon: t("icon_public", "public"),
        kw: "workspaces games switch spoke sims gta skyrim cyberpunk bg3 stardew",
      },
      {
        id: "news",
        label: t("landing_news", "Sanctuary Foundry News"),
        subtitle: t("feed_subtitle", "Creator Dispatches, Polls & Patch Announcements"),
        icon: t("icon_newspaper", "newspaper"),
        kw: "news foundry announcements press release notes",
      },
      {
        id: "directives",
        label: t("web_directives", "System Directives"),
        subtitle: t("cmd_palette_directives_sub", "Phase Roadmap, {Citizen} Guide & Master Architecture"),
        icon: t("icon_folder_special", "folder_special"),
        kw: "system directives roadmap citizen guide documentation protocols",
      },
      {
        id: "support",
        label: t("landing_nav_feedback", "Feedback & Support"),
        subtitle: t("cmd_palette_support_sub", "Platform Feedback, Bug Reports & Apply to Sanctuary Foundry"),
        icon: t("icon_support_agent", "support_agent"),
        kw: "feedback support bug report ticket contact apply foundry",
      },
      {
        id: "partners",
        label: t("landing_partners_tab", "Partner Spokes"),
        subtitle: t("keepers_core_subtitle", "Core OS Oversight, Partner Spokes & Global Heuristics"),
        icon: t("icon_handshake", "handshake"),
        kw: "partner spokes community apply spoke",
      },
      {
        id: "legal",
        label: t("landing_legal_tab", "Legal"),
        subtitle: t("web_directives", "System Directives"),
        icon: t("icon_gavel", "gavel"),
        kw: "legal eula terms privacy policy",
      },
      {
        id: "donations",
        label: t("wf_tab_donations", "Donations"),
        subtitle: t("tab_supporter", "Supporter & Perks"),
        icon: t("icon_volunteer_activism", "volunteer_activism"),
        kw: "donations supporter perks contribute",
      },
    ];
    for (const sec of landingSections) {
      items.push({
        id: `landing_${sec.id}`,
        category: "views",
        title: `${appTitle} > ${sec.label}`,
        subtitle: sec.subtitle,
        badgeLabel: appTitle,
        badgeIcon: sec.icon,
        icon: sec.icon,
        keywords: `${appTitle} ${sec.label} ${sec.kw}`,
        onSelect: () => navigateToLandingTab(sec.id),
      });
    }

    // Settings / System Preferences & Subsections
    const settingsTitle = t("settings", "{Settings}");
    items.push({
      id: "view_settings",
      category: "views",
      title: settingsTitle,
      subtitle: t(
        "cmd_palette_settings_sub",
        "Chameleon Themes, {Lexicons}, Supporter Perks & Engine Coordinates"
      ),
      badgeLabel: settingsTitle,
      badgeIcon: t("icon_settings", "settings"),
      icon: t("icon_settings", "settings"),
      keywords: "settings preferences options theme lexicon paths configuration",
      isActive: view === "settings",
      onSelect: () => navigateToView("settings"),
    });

    const settingsSubsections: { id: string; label: string; icon: string; kw: string; desktopOnly?: boolean }[] = [
      { id: "CORE", label: t("tab_core", "Core"), icon: t("icon_account_circle", "account_circle"), kw: "core account profile paths coordinates vault" },
      { id: "SUPPORTER", label: t("tab_supporter", "Supporter & Perks"), icon: t("icon_volunteer_activism", "volunteer_activism"), kw: "supporter perks dev builds donations" },
      { id: "TICKETS", label: t("support_tickets", "Support Tickets"), icon: t("icon_confirmation_number", "confirmation_number"), kw: "support tickets feedback core spoke my tickets" },
      { id: "ENGINE", label: t("tab_engine", "Engine"), icon: t("icon_history", "history"), kw: "engine retention backups cycles", desktopOnly: true },
      { id: "CLIENT", label: t("tab_preferences", "Preferences"), icon: t("icon_tune", "tune"), kw: "client preferences interface behavior" },
      { id: "NOTIFICATIONS", label: t("tab_notifs", "Notifications"), icon: t("icon_notifications", "notifications"), kw: "notifications alerts sounds" },
      { id: "AESTHETICS", label: t("tab_aesthetics", "Aesthetics"), icon: t("icon_format_paint", "format_paint"), kw: "aesthetics chameleons themes lexicons fonts glass" },
      { id: "LOGIC", label: t("tab_logic", "Logic Integrity"), icon: t("icon_flag", "flag"), kw: "logic integrity anarchy highlander rules", desktopOnly: true },
    ];
    for (const sub of settingsSubsections) {
      if (sub.desktopOnly && !isDesktop()) continue;
      items.push({
        id: `sub_settings_${sub.id}`,
        category: "views",
        title: `${settingsTitle} > ${sub.label}`,
        subtitle: makeSubDesc(settingsTitle, sub.label),
        badgeLabel: settingsTitle,
        badgeIcon: t("icon_settings", "settings"),
        icon: sub.icon,
        keywords: `${settingsTitle} ${sub.label} ${sub.kw}`,
        onSelect: () => navigateToSettingsTab(sub.id),
      });
    }

    // 2. Blueprints & Vault Mods (Deduplicated & Virtual-Placeholder Filtered)
    const seenBlueprintNames = new Set<string>();
    for (const ps of playSets || []) {
      const setName = String(ps?.name || "").trim();
      if (!setName) continue;
      const lowerSet = setName.toLowerCase();
      if (seenBlueprintNames.has(lowerSet)) continue;
      seenBlueprintNames.add(lowerSet);

      const isCurrent = lowerSet === String(activeSetName || "").toLowerCase();
      const modCount = Array.isArray(ps?.mods)
        ? countBlueprintArtifacts(ps.mods, activeGameSchema)
        : Array.isArray(ps?.items)
          ? countBlueprintArtifacts(ps.items, activeGameSchema)
          : 0;
      items.push({
        id: `blueprint_${setName}`,
        category: "vault",
        title: setName,
        subtitle: `${modCount} ${t("term_mods", "{Mods}")} • ${
          isCurrent ? t("active", "Active") : t("cmd_palette_activate_blueprint", "Activate {Blueprint}")
        }`,
        badgeLabel: t("term_blueprint", "{Blueprint}"),
        badgeIcon: isCurrent ? t("icon_check_circle", "check_circle") : t("icon_map", "map"),
        badgeColorVar: isCurrent ? "var(--success)" : "var(--accent)",
        icon: t("icon_map", "map"),
        iconColorClass: isCurrent ? "text-[var(--success)]" : "text-[var(--accent)]",
        keywords: `blueprint playset ${setName} activate deploy load`,
        isActive: isCurrent,
        onSelect: () => {
          onEquipBlueprint(setName);
          closePalette();
        },
      });
    }

    const seenModKeys = new Set<string>();
    for (const mod of modList || []) {
      if (!mod || mod.isVirtual || mod.isCollection) continue;
      const rawName = String(mod?.name || "").trim();
      if (
        !rawName ||
        rawName.startsWith("FOLDER_") ||
        rawName.startsWith("SET_") ||
        rawName.startsWith("LOCAL_SET_") ||
        String(mod?.hash || "").startsWith("local_set_")
      ) {
        continue;
      }
      const displayName = String(mod?.displayName || rawName.split(/[\\/]/).pop() || rawName).trim();
      if (!displayName || seenBlueprintNames.has(displayName.toLowerCase())) continue;

      const dedupeKey = `${displayName.toLowerCase()}__${String(mod?.author || "").toLowerCase()}`;
      if (seenModKeys.has(dedupeKey)) continue;
      seenModKeys.add(dedupeKey);

      const author = String(mod?.author || t("unknown", "Unknown"));
      const category = String(mod?.category || mod?.type || t("term_mod", "{Mod}"));
      const cleanFile = (rawName.split(/[\\/]/).pop() || rawName).toLowerCase();
      const cleanBaseName = cleanFile.replace(/\.[^.]+$/, "");
      const inBlueprint = activeBlueprintModsSet.has(cleanFile);
      const modIcon = getModIcon(mod, activeGameSchema, t);
      const rawVer = String(mod?.version || "").trim();
      const isPlaceholderVer =
        !rawVer ||
        /^(v?\.?local|vv\.?local|local node|unknown|v\.?unknown)$/i.test(rawVer);
      const formattedVer = !isPlaceholderVer
        ? ` • ${/^v/i.test(rawVer) ? rawVer : `v${rawVer}`}`
        : ` • ${t("unknown", "Unknown")}`;

      items.push({
        id: `mod_${mod.hash || rawName}`,
        category: "vault",
        title: displayName,
        subtitle: `${author} • ${category}${formattedVer}`,
        badgeLabel: inBlueprint ? t("in_set", "In {Blueprint}") : t("term_mod", "{Mod}"),
        badgeIcon: inBlueprint ? t("icon_check_circle", "check_circle") : modIcon,
        badgeColorVar: inBlueprint ? "var(--success)" : "var(--accent)",
        icon: modIcon,
        keywords: `${displayName} ${cleanBaseName} ${author} ${category}`,
        isActive: inBlueprint,
        onSelect: () => {
          onInspectMod(mod);
          closePalette();
        },
        secondaryAction: {
          label: t("cmd_palette_toggle_in_blueprint", "Toggle in {Blueprint}"),
          icon: inBlueprint ? t("icon_check_circle", "check_circle") : t("icon_add_circle", "add_circle"),
          isActive: inBlueprint,
          onClick: (e) => {
            e.stopPropagation();
            onToggleModInBlueprint(mod);
          },
        },
      });
    }

    // 3. Quick Actions, Chameleon Themes & Lexicons
    const actionsBadge = t("cmd_palette_tab_actions", "Commands & {Settings}");
    if (isDesktop()) {
      items.push(
        {
          id: "action_quick_launch",
          category: "actions",
          title: t("quick_launch", "Quick Launch"),
          subtitle: t(
            "cmd_palette_quick_launch_sub",
            "Deploy Active {Blueprint} & Launch Game Executable"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_rocket_launch", "rocket_launch"),
          badgeColorVar: "var(--success)",
          icon: t("icon_rocket_launch", "rocket_launch"),
          iconColorClass: "text-[var(--success)]",
          keywords: "launch play start game execute ignition",
          onSelect: () => {
            onQuickLaunch();
            closePalette();
          },
        },
        {
          id: "action_radar_sweep",
          category: "actions",
          title: t("cmd_palette_radar_sweep_title", "Scan {Vault} & Run Conflict Radar Sweep"),
          subtitle: t(
            "cmd_palette_radar_sweep_sub",
            "Verify SHA-256 DNA Hashes, Check Updates & Refresh {Vault}"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_radar", "radar"),
          icon: t("icon_radar", "radar"),
          keywords: "scan radar sweep refresh vault check updates hashes",
          onSelect: () => {
            onRunRadarSweep();
            closePalette();
          },
        },
        {
          id: "action_open_dropzone",
          category: "actions",
          title: t("cmd_palette_open_dropzone_title", "Open {Vault} Dropzone"),
          subtitle: t(
            "cmd_palette_open_dropzone_sub",
            "Ingest & Scan Archives (.zip, .rar, .7z) or {Mod} Files"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_upload_file", "upload_file"),
          icon: t("icon_upload_file", "upload_file"),
          keywords: "dropzone import add install mod zip archive",
          onSelect: () => {
            onOpenDropzone();
            closePalette();
          },
        },
        {
          id: "action_full_backup",
          category: "actions",
          title: t("cmd_palette_full_backup_title", "Create Full {Backups} Snapshot"),
          subtitle: t(
            "cmd_palette_full_backup_sub",
            "Compress Saves & {Mods} into a Zstd {Backups} Archive"
          ),
          badgeLabel: t("term_backups", "{Backups}"),
          badgeIcon: t("icon_backup", "backup"),
          icon: t("icon_backup", "backup"),
          keywords: "backup snapshot time capsule save archive zstd",
          onSelect: () => {
            onTriggerFullBackup();
            closePalette();
          },
        },
        {
          id: "action_pre_patch_snapshot",
          category: "actions",
          title: t("cmd_palette_pre_patch_title", "Create Pre-Patch Snapshot"),
          subtitle: t(
            "cmd_palette_pre_patch_sub",
            "Emergency Pre-Update Save & {Vault} State Snapshot"
          ),
          badgeLabel: t("term_backups", "{Backups}"),
          badgeIcon: t("icon_history", "history"),
          icon: t("icon_history", "history"),
          keywords: "pre-patch snapshot backup update emergency",
          onSelect: () => {
            onTriggerPrePatchSnapshot();
            closePalette();
          },
        }
      );
    }

    items.push(
      {
        id: "action_notifications",
        category: "actions",
        title: t("notifications", "Notifications"),
        subtitle: t(
          "cmd_palette_notifications_sub",
          "Open System Alerts, {Mod} Updates & Broadcast Drawer"
        ),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_notifications", "notifications"),
        icon: t("icon_notifications", "notifications"),
        keywords: "notifications alerts inbox updates messages",
        onSelect: () => {
          onOpenNotifications();
          closePalette();
        },
      },
      {
        id: "action_system_queues",
        category: "actions",
        title: t("system_queues_title", "System Queues & Updates"),
        subtitle: t(
          "system_queues_subtitle",
          "Pending updates, file verification queues, and quick system utilities."
        ),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_layers", "layers"),
        icon: t("icon_layers", "layers"),
        keywords: "queues updates scout signature dna malware quarantine pending",
        onSelect: () => {
          useModalStore.getState().setIsQueuesPanelOpen(true);
          closePalette();
        },
      },
      {
        id: "action_system_logs",
        category: "actions",
        title: t("sys_log_history", "System Log History"),
        subtitle: t("audit_logs", "Audit Logs"),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_terminal", "terminal"),
        icon: t("icon_terminal", "terminal"),
        keywords: "logs terminal console history audit status",
        onSelect: () => {
          useModalStore.getState().setIsLogExpanded(true);
          closePalette();
        },
      }
    );

    if (isDesktop()) {
      items.push({
        id: "action_system_status",
        category: "actions",
        title: t("system_status", "System Status"),
        subtitle: t("sys_panel_desc", "Hardware & Environment Telemetry"),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_memory", "memory"),
        icon: t("icon_memory", "memory"),
        keywords: "system status hardware telemetry ram cpu disk version update",
        onSelect: () => {
          useModalStore.getState().setIsSystemStatusOpen(true);
          closePalette();
        },
      });
    }

    // Chameleon Themes
    const mergedThemes: Record<string, any> = {
      ...(CORE_THEMES || {}),
      ...(gameThemes || {}),
      ...(customThemes || {}),
    };
    for (const [themeKey, themeObj] of Object.entries(mergedThemes)) {
      const themeName = String((themeObj as any)?.name || themeKey);
      const isCurrent = activeThemeId === themeKey;
      items.push({
        id: `theme_${themeKey}`,
        category: "actions",
        title: `${t("ui_btn_apply", "Apply")} ${t("term_chameleon", "Chameleon")}: ${themeName}`,
        subtitle: `${t("term_chameleon", "Chameleon")} • ${
          isCurrent ? t("active", "Active") : t("cmd_palette_click_activate", "Click to activate")
        }`,
        badgeLabel: t("term_chameleon", "Chameleon"),
        badgeIcon: isCurrent ? t("icon_check_circle", "check_circle") : t("icon_palette", "palette"),
        badgeColorVar: isCurrent ? "var(--success)" : "var(--accent)",
        icon: t("icon_palette", "palette"),
        keywords: `theme chameleon appearance dark light glass ${themeName} ${themeKey}`,
        isActive: isCurrent,
        onSelect: () => {
          setActiveThemeId(themeKey);
          closePalette();
        },
      });
    }

    // Lexicons
    const builtinLexList = [
      { id: "en-sanctuary", name: "Sanctuary (Sci-Fi)" },
      { id: "en-default", name: "Standard English" },
      { id: "en-sims", name: "The Sims Friendly" },
      { id: "Simlish", name: "Simlish" },
    ];
    const seenLexIds = new Set<string>();
    const combinedLexicons = [...builtinLexList, ...(Array.isArray(lexiconMeta) ? lexiconMeta : [])];
    for (const lex of combinedLexicons) {
      const lexId = String(lex?.id || "").trim();
      if (!lexId || seenLexIds.has(lexId)) continue;
      seenLexIds.add(lexId);
      const lexName = String(lex?.name || lexId);
      const isCurrent = activeLang === lexId;
      items.push({
        id: `lexicon_${lexId}`,
        category: "actions",
        title: `${t("cmd_palette_switch_lexicon", "Switch {Lexicon}")}: ${lexName}`,
        subtitle: `${t("cmd_palette_lexicon_pack_sub", "{Lexicon} Vocabulary Pack")} • ${
          isCurrent ? t("active", "Active") : t("cmd_palette_click_activate", "Click to activate")
        }`,
        badgeLabel: t("term_lexicon", "{Lexicon}"),
        badgeIcon: isCurrent ? t("icon_check_circle", "check_circle") : t("icon_translate", "translate"),
        badgeColorVar: isCurrent ? "var(--success)" : "var(--accent)",
        icon: t("icon_translate", "translate"),
        keywords: `lexicon language vocabulary words translation ${lexName} ${lexId}`,
        isActive: isCurrent,
        onSelect: () => {
          setActiveLang(lexId);
          closePalette();
        },
      });
    }

    return items;
  }, [
    isOpen,
    t,
    view,
    modList,
    playSets,
    activeSetName,
    activeBlueprintModsSet,
    userRole,
    osRole,
    isConfigured,
    activeGameSchema,
    marketTab,
    setMarketTab,
    cwMainTab,
    setCwMainTab,
    masonActiveTab,
    setMasonActiveTab,
    architectActiveTab,
    setArchitectActiveTab,
    oversightActiveTab,
    setOversightActiveTab,
    wayfinderActiveTab,
    setWayfinderActiveTab,
    keepersActiveTab,
    setKeepersActiveTab,
    CORE_THEMES,
    gameThemes,
    customThemes,
    activeThemeId,
    setActiveThemeId,
    lexiconMeta,
    activeLang,
    setActiveLang,
    navigateToView,
    navigateToLandingTab,
    navigateToSettingsTab,
    onEquipBlueprint,
    onInspectMod,
    onToggleModInBlueprint,
    onQuickLaunch,
    onRunRadarSweep,
    onOpenDropzone,
    onTriggerFullBackup,
    onTriggerPrePatchSnapshot,
    onOpenNotifications,
    closePalette,
  ]);

  const filteredItems = useMemo(() => {
    const trimmed = query.trim();
    const categoryFiltered =
      activeTab === "all" ? allItems : allItems.filter((item) => item.category === activeTab);

    if (!trimmed) {
      if (activeTab === "all") {
        const viewsSlice = categoryFiltered.filter((i) => i.category === "views").slice(0, 24);
        const actionsSlice = categoryFiltered.filter((i) => i.category === "actions").slice(0, 12);
        const vaultSlice = categoryFiltered.filter((i) => i.category === "vault").slice(0, 14);
        return [...viewsSlice, ...actionsSlice, ...vaultSlice];
      }
      return categoryFiltered.slice(0, 60);
    }

    const scored: { item: CommandItem; score: number }[] = [];
    for (const item of categoryFiltered) {
      const best = scoreFuzzyMatch(trimmed, item.title, item.subtitle, item.keywords);
      if (best > 0) {
        scored.push({ item, score: best + (item.isActive ? 15 : 0) });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 60).map((s) => s.item);
  }, [allItems, activeTab, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeTab]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredItems[selectedIndex];
      if (target) {
        target.onSelect();
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const order: CommandCategory[] = ["all", "views", "vault", "actions"];
      const idx = order.indexOf(activeTab);
      const nextIdx = e.shiftKey
        ? (idx - 1 + order.length) % order.length
        : (idx + 1) % order.length;
      setActiveTab(order[nextIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={closePalette}
      title={t("cmd_palette_title", "Command Palette")}
      subtitle={t(
        "cmd_palette_subtitle",
        "Instant Fuzzy Search Across {Vault} {Mods}, {Blueprints}, OS Views & Quick Actions"
      )}
      icon={t("icon_terminal", "terminal")}
      widthClass="w-[92vw] md:w-[680px] lg:w-[760px] max-w-4xl"
      backdropZ="z-[100040]"
      panelZ="z-[100041]"
    >
      <div className="flex flex-col gap-4 pb-8">
        {/* Search Input Box */}
        <div className="glass-panel rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex flex-col gap-2.5">
          <div className="relative flex items-center w-full">
            <span className="material-symbols-outlined !text-[20px] text-[var(--accent)] absolute left-3.5 pointer-events-none">
              {t("icon_search", "search")}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={t(
                "cmd_palette_placeholder",
                "Search {mods}, {blueprints}, views, themes, or type a command..."
              )}
              className="w-full h-11 pl-11 pr-28 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-xs sm:text-sm font-bold text-[var(--text)] placeholder:text-[var(--subtext)] placeholder:opacity-60 outline-none transition-all"
            />
            <div className="absolute right-2.5 flex items-center gap-1.5">
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  title={t("clear", "Clear")}
                  className="w-6 h-6 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--subtext)] hover:text-[var(--accent)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[14px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              )}
              <span className={`${VAULT_CHIP_CLASS} pointer-events-none hidden sm:inline-flex`}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_keyboard_command_key", "keyboard_command_key")}
                </span>
                <span>{t("cmd_palette_shortcut_badge", "Ctrl+K")}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-[10px] font-bold text-[var(--subtext)] opacity-75">
            <span>
              {t("cmd_palette_hint_nav", "↑↓ Navigate • Enter Run • Tab Filter • Esc Close")}
            </span>
            <span className="tabular-nums">
              {filteredItems.length} {t("results", "Results")}
            </span>
          </div>
        </div>

        {/* 2x2 Category Filter Tiles (Full-Width Labels — Never Cut Off) */}
        <div className="grid grid-cols-2 gap-3">
          <DashboardStatTile
            variant="filter"
            icon={t("icon_apps", "apps")}
            label={t("all", "All")}
            active={activeTab === "all"}
            onClick={() => {
              setActiveTab("all");
              inputRef.current?.focus();
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_dashboard", "dashboard")}
            label={t("cmd_palette_tab_views", "Views & Hubs")}
            active={activeTab === "views"}
            onClick={() => {
              setActiveTab("views");
              inputRef.current?.focus();
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_account_balance", "account_balance")}
            label={t("cmd_palette_tab_vault", "{Vault} & {Blueprints}")}
            active={activeTab === "vault"}
            onClick={() => {
              setActiveTab("vault");
              inputRef.current?.focus();
            }}
          />
          <DashboardStatTile
            variant="filter"
            icon={t("icon_bolt", "bolt")}
            label={t("cmd_palette_tab_actions", "Commands & {Settings}")}
            active={activeTab === "actions"}
            onClick={() => {
              setActiveTab("actions");
              inputRef.current?.focus();
            }}
          />
        </div>

        {/* Results Grid */}
        {filteredItems.length === 0 ? (
          <EmptyState
            icon={t("icon_search_off", "search_off")}
            title={t("cmd_palette_empty_title", "No Matching Commands or {Mods}")}
            subtitle={t(
              "cmd_palette_empty_desc",
              "Try searching for a {mod} name, {blueprint}, OS view, Chameleon theme, or system action."
            )}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onSelect}
                  className={`glass-panel rounded-2xl p-3.5 border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 group/card ${
                    isSelected
                      ? "border-[color-mix(in_srgb,var(--accent)_48%,rgba(255,255,255,0.35))] -translate-y-0.5"
                      : "border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,rgba(255,255,255,0.35))]"
                  }`}
                >
                  {/* Top Row: Icon + Full-Width Title & Subtitle */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl glass-surface flex items-center justify-center shrink-0 border transition-transform duration-300 group-hover/card:scale-105"
                      style={{
                        backgroundColor: "var(--glass-card-icon-bg)",
                        borderColor: isSelected
                          ? "color-mix(in srgb, var(--accent) 45%, var(--glass-card-icon-border, rgba(255,255,255,0.22)))"
                          : "var(--glass-card-icon-border)",
                        boxShadow: "var(--glass-card-icon-shadow)",
                      }}
                    >
                      <span
                        className={`material-symbols-outlined !text-[20px] ${
                          item.iconColorClass || "text-[var(--accent)]"
                        }`}
                      >
                        {item.icon}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className={`text-xs sm:text-sm font-black tracking-tight leading-snug break-words transition-colors ${
                          isSelected
                            ? "text-[var(--accent)]"
                            : "text-[var(--text)] group-hover/card:text-[var(--accent)]"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--subtext)] opacity-80 leading-snug break-words mt-0.5">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Footer Row: Left Neutral Badge + Right Action Controls */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                    <span className={VAULT_CHIP_CLASS}>
                      <span
                        className="material-symbols-outlined !text-[12px]"
                        style={{ color: item.badgeColorVar || "var(--accent)" }}
                      >
                        {item.badgeIcon}
                      </span>
                      <span>{item.badgeLabel}</span>
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.secondaryAction && (
                        <HoverTooltip content={item.secondaryAction.label}>
                          <button
                            type="button"
                            onClick={item.secondaryAction.onClick}
                            className="h-7 px-2.5 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[10px] font-black text-[var(--text)] hover:text-[var(--accent)] flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <span
                              className="material-symbols-outlined !text-[13px]"
                              style={{
                                color: item.secondaryAction.isActive
                                  ? "var(--success)"
                                  : "var(--accent)",
                              }}
                            >
                              {item.secondaryAction.icon}
                            </span>
                            <span className="hidden sm:inline">
                              {item.secondaryAction.label}
                            </span>
                          </button>
                        </HoverTooltip>
                      )}

                      <span className="text-[10px] font-black text-[var(--text)] opacity-80 group-hover/card:text-[var(--accent)] group-hover/card:opacity-100 flex items-center gap-1 transition-colors">
                        <span className="material-symbols-outlined !text-[14px]">
                          {t("icon_keyboard_return", "keyboard_return")}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SidePanel>
  );
}

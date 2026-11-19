import { useMemo } from "react";
import { getModIcon, countBlueprintArtifacts } from "../../shared";
import { useModalStore } from "../../store/modalStore";
import { isDesktop } from "../../utils/envUtils";
import { isRootDomain } from "../../utils/routingUtils";
import {
  CommandItem,
  cleanNavLabel,
  CONFIG_EXTENSIONS_REGEX,
} from "./hotkeysAndSpatialNav";

export function useCommandPaletteItems({
  onInspectMod,
  onToggleModInBlueprint,
  onEquipBlueprint,
  onQuickLaunch,
  onRunRadarSweep,
  onOpenDropzone,
  onTriggerFullBackup,
  onTriggerPrePatchSnapshot,
  onOpenNotifications,
  onOpenMasonProfile,
  onOpenDefcon,
  onTriggerShelter,
  onOpenCitizenTickets,
  t,
  lexiconMeta,
  activeLang,
  setActiveLang,
  CORE_THEMES,
  gameThemes,
  customThemes,
  activeThemeId,
  setActiveThemeId,
  view,
  setView,
  modList,
  playSets,
  activeSetName,
  shelterActive,
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
  isOpen,
  setIsControlsOpen,
  masonsRegistry,
  workbenchPaths,
  closePalette,
  activeBlueprintModsSet,
  navigateToLandingTab,
  navigateToView,
  navigateToSettingsTab,
  navigateToVaultSubTab,
  openConfigInWorkbench,
}: any) {
  const allItems = useMemo<CommandItem[]>(() => {
    if (!isOpen) return [];
    const items: CommandItem[] = [];
    const schemaFeatures = activeGameSchema?.features || { has_cc: true, has_saves: true };
    const isWebRootOnly = !isDesktop() && isRootDomain() && !isConfigured;
    const viewsBadge = t("cmd_palette_tab_views", "Views & Hubs");
    const actionsBadge = t("cmd_palette_tab_actions", "Commands & {Settings}");
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
          keywords: "dashboard command center home overview status alerts",
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
        }
      );

      // Your Vault Sub-Tabs
      const vaultSubsections: { id: string; label: string; icon: string; kw: string }[] = [
        {
          id: "OVERVIEW",
          label: t("tab_overview", "Overview"),
          icon: t("icon_space_dashboard", "space_dashboard"),
          kw: "overview recent injections updates vault summary",
        },
        {
          id: "ALL",
          label: t("filter_all_vault", "Main"),
          icon: t("icon_inventory_2", "inventory_2"),
          kw: "main all mods artifacts installed vault",
        },
        {
          id: "EQUIPPED",
          label: t("filter_equipped", "In {Blueprint}"),
          icon: t("icon_check_circle", "check_circle"),
          kw: "equipped active in blueprint playset enabled",
        },
        {
          id: "UNEQUIPPED",
          label: t("filter_unequipped", "Not Equipped"),
          icon: t("icon_cancel", "cancel"),
          kw: "unequipped disabled inactive spare",
        },
        {
          id: "DEV",
          label: t("filter_dev", "Sandbox"),
          icon: t("icon_code", "code"),
          kw: "sandbox dev testing local development",
        },
        {
          id: "ARCHIVES",
          label: t("filter_archives", "Archives"),
          icon: t("icon_archive", "archive"),
          kw: "archives legacy incompatible older versions",
        },
      ];
      for (const sub of vaultSubsections) {
        items.push({
          id: `sub_vault_${sub.id}`,
          category: "views",
          title: `${vaultTitle} > ${sub.label}`,
          subtitle: makeSubDesc(vaultTitle, sub.label),
          badgeLabel: vaultTitle,
          badgeIcon: t("icon_account_balance", "account_balance"),
          icon: sub.icon,
          keywords: `${vaultTitle} ${sub.label} ${sub.kw}`,
          onSelect: () => navigateToVaultSubTab(sub.id),
        });
      }

      items.push({
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
      });

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
          keywords: "conflict radar duplicates collisions artifact scout scanner",
          isActive: view === "ArtifactScout",
          onSelect: () => navigateToView("ArtifactScout"),
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
          keywords: "workbench config ini json cfg editor monaco diff settings",
          isActive: view === "CitizensWorkbench",
          onSelect: () => navigateToView("CitizensWorkbench"),
        }
      );

      // Citizen's Workbench Subsections
      const cwSubsections: { id: "COMMAND" | "CONFIGS" | "TEMPLATES"; label: string; icon: string; kw: string }[] = [
        { id: "COMMAND", label: cleanNavLabel(t("wf_tab_command", "Command"), "Command"), icon: t("icon_desktop_windows", "desktop_windows"), kw: "command overview workbench" },
        { id: "CONFIGS", label: t("cw_tab_configs", "Configs"), icon: t("icon_tune", "tune"), kw: "configs settings sliders ini json cfg" },
        { id: "TEMPLATES", label: cleanNavLabel(t("ql_templates", "Templates"), "Templates"), icon: t("icon_data_object", "data_object"), kw: "templates presets defaults json" },
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
        { id: "spoke_support", label: cleanNavLabel(t("keepers_tab_spoke_support", "Spoke Support"), "Spoke Support"), icon: t("icon_hub", "hub"), kw: "spoke support partner escalations wayfinder tickets" },
        { id: "platform_support", label: cleanNavLabel(t("keepers_tab_platform_support", "Platform Support"), "Platform Support"), icon: t("icon_bug_report", "bug_report"), kw: "platform support core bugs feedback feature requests" },
        { id: "compliance_contact", label: cleanNavLabel(t("keepers_tab_compliance_contact", "Compliance & Contact"), "Compliance & Contact"), icon: t("icon_gavel", "gavel"), kw: "compliance contact dmca legal email threads relay" },
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
        kw: "workspaces games switch spoke profiles libraries",
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
        kw: "system directives roadmap citizen guide documentation protocols compliance eula",
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

    // Settings / System Preferences & Deep-Link Cards
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
      { id: "CORE", label: t("settings_tab_account_system", "Account & System"), icon: t("icon_shield_person", "shield_person"), kw: "core os account profile privacy offline malware passkey 2fa webauthn blinded email browser hotkeys controller" },
      { id: "VAULT", label: t("settings_tab_vault_blueprints", "{Vault} & {Blueprints}"), icon: t("icon_inventory_2", "inventory_2"), kw: "vault path master storage intake drag drop version history atomic logic blueprint safeguards highlander family dependencies conflicts workbench config snapshots overrides", desktopOnly: true },
      { id: "ENGINE", label: t("settings_tab_game_backups", "Game & {Backups}"), icon: t("icon_sports_esports", "sports_esports"), kw: "game paths executable library saves auto detect quick launch window cache backups time capsule defcon emergency retention", desktopOnly: true },
      { id: "AESTHETICS", label: t("settings_tab_appearance_v2", "Appearance"), icon: t("icon_palette", "palette"), kw: "appearance chameleons themes lexicons workspace spaces date format images cards", desktopOnly: false },
      { id: "NOTIFICATIONS", label: t("tab_notifs", "Notifications"), icon: t("icon_notifications", "notifications"), kw: "notifications alerts sounds defcon lockdown mute spoke", desktopOnly: false },
      { id: "SUPPORTER", label: t("tab_supporter", "Supporter & Perks"), icon: t("icon_volunteer_activism", "volunteer_activism"), kw: "supporter perks dev builds donations", desktopOnly: false },
      { id: "TICKETS", label: t("support_tickets", "Support Tickets"), icon: t("icon_confirmation_number", "confirmation_number"), kw: "support tickets feedback core spoke my tickets", desktopOnly: false },
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

    // Individual Settings Deep-Link Cards (including Master Vault Path, Per-Space Themes/Lexicons, DEFCON Protocol, etc.)
    const deepSettingsCards: {
      id: string;
      tab: string;
      title: string;
      subtitle: string;
      icon: string;
      kw: string;
      desktopOnly?: boolean;
    }[] = [
      {
        id: "setting_master_vault_path",
        tab: "VAULT",
        title: t("vault_path", "The {Vault} Path"),
        subtitle: t(
          "vault_universal_desc",
          "Universal Master {Vault} directory shared across the Hub (Themes & Lexicons) and all Spoke workspaces."
        ),
        icon: t("icon_account_balance", "account_balance"),
        kw: "master vault path universal storage directory root folder",
        desktopOnly: true,
      },
      {
        id: "setting_space_themes_lexicons",
        tab: "AESTHETICS",
        title: t("settings_chameleon_assignment_title", "Workspace {Chameleon} Assignment"),
        subtitle: t("term_chameleons", "Themes"),
        icon: t("icon_workspaces", "workspaces"),
        kw: "per space workspace theme chameleon lexicon language routing assign",
      },
      {
        id: "setting_defcon_protocol",
        tab: "ENGINE",
        title: t("cmd_palette_defcon_protocol_title", "Emergency Backup Protocol (DEFCON)"),
        subtitle: t(
          "cmd_palette_defcon_protocol_sub",
          "Configure Automatic Pre-Patch Backup Scope & Emergency Agency Level"
        ),
        icon: t("icon_shield", "shield"),
        kw: "defcon emergency backup target level protocol pre-patch snapshot lockdown engine agency",
        desktopOnly: true,
      },
      {
        id: "setting_engine_agency",
        tab: "ENGINE",
        title: t("engine_agency", "Emergency Backup Level"),
        subtitle: t("agency_full_desc", "Automatic backups & protection."),
        icon: t("icon_tune", "tune"),
        kw: "defcon level emergency agency full auto semi manual backup protection",
        desktopOnly: true,
      },
      {
        id: "setting_backup_retention",
        tab: "ENGINE",
        title: `${t("vault_capacity", "{Backups} Limit")} & ${t("engine_retention", "Game Files Retention Policy")}`,
        subtitle: t("term_backups", "Backups"),
        icon: t("icon_storage", "storage"),
        kw: "backups limit retention saves storage capacity version copies days",
        desktopOnly: true,
      },
      {
        id: "setting_workbench_history",
        tab: "VAULT",
        title: t("settings_workbench_section", "Workbench Config History"),
        subtitle: t("settings_workbench_guide_title", "Config File Undo Snapshots"),
        icon: t("icon_construction", "construction"),
        kw: "workbench config history revisions storage snapshots undo",
        desktopOnly: true,
      },
      {
        id: "setting_version_history",
        tab: "VAULT",
        title: t("version_pool_auto_archive", "Version History System"),
        subtitle: t(
          "version_pool_auto_archive_desc",
          "When enabled, keeps multiple {mod} versions for rollback and auto-swapping. When disabled, keeps only one version."
        ),
        icon: t("icon_history", "history"),
        kw: "version history system archive legacy versions rollback auto swap",
        desktopOnly: true,
      },
      {
        id: "setting_ingest_mode",
        tab: "VAULT",
        title: t("settings_ingest_file_mode_title", "Drag & Drop File Behavior"),
        subtitle: t(
          "settings_ingest_file_mode_desc",
          "Choose whether dragged and dropped {mod} files and archives are copied into your {Vault} or moved."
        ),
        icon: t("icon_drive_file_move", "drive_file_move"),
        kw: "drag drop file behavior payload intake copy move import",
        desktopOnly: true,
      },
      {
        id: "setting_date_format",
        tab: "AESTHETICS",
        title: t("settings_date_format_title", "Date Format"),
        subtitle: t(
          "settings_date_format_desc",
          "Choose how dates are displayed on Comm-Link posts, dispatches, release notes, and records across the OS."
        ),
        icon: t("icon_calendar_month", "calendar_month"),
        kw: "date format calendar mm dd yyyy iso",
      },
      {
        id: "setting_internal_browser",
        tab: "CORE",
        title: t("settings_use_internal_browser", "Use the Sanctuary Browser"),
        subtitle: t(
          "use_internal_browser_desc",
          "Use Sanctuary's built-in web browser for supported {Mod} download pages."
        ),
        icon: t("icon_language", "language"),
        kw: "sanctuary browser internal web download external",
        desktopOnly: true,
      },
      {
        id: "setting_local_only",
        tab: "CORE",
        title: t("local_only", "Local Network Only"),
        subtitle: t("local_only_desc", "Block external uploads/downloads. Strict offline mode."),
        icon: t("icon_wifi_off", "wifi_off"),
        kw: "local network only offline mode privacy block external",
      },
      {
        id: "setting_malware_share",
        tab: "CORE",
        title: t("malware_share_title", "Share Malware Reports"),
        subtitle: t(
          "malware_share_desc",
          "Send your local quarantine manifests to the Admins for analysis and malware activity updates."
        ),
        icon: t("icon_security", "security"),
        kw: "share malware reports quarantine security telemetry",
      },
      {
        id: "setting_defcon_notifs",
        tab: "NOTIFICATIONS",
        title: t("notify_defcon_title", "DEFCON Lockdown Alerts"),
        subtitle: t("tab_notifs", "Notifications"),
        icon: t("icon_notifications_active", "notifications_active"),
        kw: "defcon lockdown alerts notifications patch detected emergency",
      },
      {
        id: "setting_blueprint_safeguards",
        tab: "VAULT",
        title: t("anarchy_title", "{Blueprint} Safeguards"),
        subtitle: t("anarchy_highlander", "Swap Exclusive {Mods}"),
        icon: t("icon_psychology", "psychology"),
        kw: "atomic logic anarchy blueprint safeguards highlander nuclear family dependencies conflict intercept",
        desktopOnly: true,
      },
    ];

    for (const card of deepSettingsCards) {
      if (card.desktopOnly && !isDesktop()) continue;
      items.push({
        id: card.id,
        category: "actions",
        title: card.title,
        subtitle: card.subtitle,
        badgeLabel: settingsTitle,
        badgeIcon: t("icon_settings", "settings"),
        icon: card.icon,
        keywords: `${settingsTitle} ${card.title} ${card.kw}`,
        onSelect: () => navigateToSettingsTab(card.tab),
      });
    }

    // 2. Verified & Local Masons (Profile Viewing)
    const seenMasonIds = new Set<string>();
    const seenMasonNames = new Set<string>();
    const combinedMasons: { id: string; name: string; bio?: string; isVerified?: boolean }[] = [];

    for (const m of masonsRegistry) {
      const mId = String(m?.id || "").trim();
      const mName = String(m?.name || "").trim();
      if (!mId || !mName || seenMasonIds.has(mId)) continue;
      seenMasonIds.add(mId);
      seenMasonNames.add(mName.toLowerCase());
      combinedMasons.push({
        id: mId,
        name: mName,
        bio: String(m?.bio || ""),
        isVerified: Boolean(m?.is_verified),
      });
    }

    // Also discover any mason_id + author pairs from modList
    for (const mod of modList || []) {
      const mId = String((mod as any)?.mason_id || "").trim();
      const authorName = String(mod?.author || "").trim();
      if (
        mId &&
        authorName &&
        authorName.toLowerCase() !== "unknown" &&
        !seenMasonIds.has(mId) &&
        !seenMasonNames.has(authorName.toLowerCase())
      ) {
        seenMasonIds.add(mId);
        seenMasonNames.add(authorName.toLowerCase());
        combinedMasons.push({
          id: mId,
          name: authorName,
          isVerified: true,
        });
      }
    }

    for (const mason of combinedMasons) {
      items.push({
        id: `mason_profile_${mason.id}`,
        category: "vault",
        title: `${mason.name} — ${t("term_mason", "{Mason}")}`,
        subtitle:
          mason.bio && mason.bio.trim().length > 0
            ? mason.bio
            : t("cmd_palette_mason_profile_sub", "Verified {Mason} Profile, Published {Mods} & {Blueprints}"),
        badgeLabel: t("term_mason", "{Mason}"),
        badgeIcon: t("icon_verified", "verified"),
        badgeColorVar: "var(--accent)",
        icon: t("icon_engineering", "engineering"),
        keywords: `mason creator author profile ${mason.name}`,
        onSelect: () => {
          if (onOpenMasonProfile) {
            onOpenMasonProfile(mason.id);
          } else {
            setMarketTab("MASONS");
            setView("nexus");
          }
          closePalette();
        },
      });
    }

    // 3. Blueprints & Vault Mods (Including Suites, Collections & Config Files Routed to Workbench)
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

    const seenConfigFiles = new Set<string>();
    const seenModKeys = new Set<string>();

    for (const mod of modList || []) {
      if (!mod) continue;
      const rawName = String(mod?.name || "").trim();
      if (
        !rawName ||
        rawName.startsWith("LOCAL_SET_") ||
        String(mod?.hash || "").startsWith("local_set_")
      ) {
        continue;
      }

      const displayName = String(
        mod?.displayName || (mod as any)?.meta_name || rawName.split(/[\\/]/).pop() || rawName
      ).trim();
      if (!displayName || seenBlueprintNames.has(displayName.toLowerCase())) continue;

      const cleanFile = (rawName.split(/[\\/]/).pop() || rawName).toLowerCase();
      const cleanBaseName = cleanFile.replace(/\.[^.]+$/, "");
      const author = String(mod?.author || t("unknown", "Unknown"));
      const category = String(mod?.category || mod?.type || t("term_mod", "{Mod}"));

      // Check if this entry is a Settings / Config / Template file that belongs in Citizen's Workbench
      const isConfigFile =
        CONFIG_EXTENSIONS_REGEX.test(rawName) ||
        CONFIG_EXTENSIONS_REGEX.test(String(mod?.type || "")) ||
        category.toLowerCase() === "configuration" ||
        /^mc[\s_]*settings$/i.test(displayName);

      if (isConfigFile) {
        seenConfigFiles.add(cleanFile);
        const dedupeCfgKey = `cfg__${displayName.toLowerCase()}`;
        if (seenModKeys.has(dedupeCfgKey)) continue;
        seenModKeys.add(dedupeCfgKey);

        items.push({
          id: `cfg_mod_${mod.hash || rawName}`,
          category: "vault",
          title: displayName,
          subtitle: `${t("cmd_palette_open_in_workbench", "Open in {Citizen}'s Workbench")} • ${cleanFile}`,
          badgeLabel: t("cw_tab_configs", "Configs"),
          badgeIcon: t("icon_tune", "tune"),
          badgeColorVar: "var(--accent)",
          icon: t("icon_design_services", "design_services"),
          keywords: `${displayName} ${cleanFile} ${cleanBaseName} config settings workbench ini cfg json`,
          onSelect: () => {
            openConfigInWorkbench((mod as any)?.physical_path || rawName, displayName);
          },
        });
        continue;
      }

      const dedupeKey = `${displayName.toLowerCase()}__${author.toLowerCase()}__${Boolean(
        mod.isVirtual || mod.isCollection
      )}`;
      if (seenModKeys.has(dedupeKey)) continue;
      seenModKeys.add(dedupeKey);

      const inBlueprint = activeBlueprintModsSet.has(cleanFile);
      const modIcon = getModIcon(mod, activeGameSchema, t);
      const rawVer = String(mod?.version || "").trim();
      const isPlaceholderVer =
        !rawVer ||
        /^(v?\.?local|vv\.?local|local node|unknown|v\.?unknown)$/i.test(rawVer);
      const formattedVer = !isPlaceholderVer
        ? ` • ${/^v/i.test(rawVer) ? rawVer : `v${rawVer}`}`
        : ` • ${t("unknown", "Unknown")}`;

      const isSuiteOrCollection = Boolean(mod.isVirtual || mod.isCollection);
      const matchedMason = combinedMasons.find(
        (m) =>
          (mod as any)?.mason_id === m.id ||
          (author && m.name.toLowerCase() === author.toLowerCase())
      );

      items.push({
        id: `mod_${mod.hash || rawName}`,
        category: "vault",
        title: displayName,
        subtitle: `${author} • ${isSuiteOrCollection ? t("tab_cc", "Collections") : category}${formattedVer}`,
        badgeLabel: inBlueprint
          ? t("in_set", "In {Blueprint}")
          : isSuiteOrCollection
            ? t("tab_cc", "Collections")
            : t("term_mod", "{Mod}"),
        badgeIcon: inBlueprint ? t("icon_check_circle", "check_circle") : modIcon,
        badgeColorVar: inBlueprint ? "var(--success)" : "var(--accent)",
        icon: modIcon,
        keywords: `${displayName} ${cleanBaseName} ${author} ${category}`,
        isActive: inBlueprint,
        onSelect: () => {
          onInspectMod(mod);
          closePalette();
        },
        secondaryAction: matchedMason && onOpenMasonProfile
          ? {
              label: t("cmd_palette_view_mason_profile", "View {Mason} Profile"),
              icon: t("icon_verified", "verified"),
              isActive: false,
              onClick: (e) => {
                e.stopPropagation();
                onOpenMasonProfile(matchedMason.id);
                closePalette();
              },
            }
          : {
              label: t("cmd_palette_toggle_in_blueprint", "Toggle in {Blueprint}"),
              icon: inBlueprint
                ? t("icon_check_circle", "check_circle")
                : t("icon_add_circle", "add_circle"),
              isActive: inBlueprint,
              onClick: (e) => {
                e.stopPropagation();
                onToggleModInBlueprint(mod);
              },
            },
      });
    }

    // Also index any additional Workbench config/template files discovered on disk
    for (const wbPath of workbenchPaths) {
      const norm = String(wbPath || "").replace(/\\/g, "/");
      const fileName = norm.split("/").pop() || norm;
      const lowerFile = fileName.toLowerCase();
      if (!fileName || seenConfigFiles.has(lowerFile)) continue;
      seenConfigFiles.add(lowerFile);

      const prettyTitle = fileName
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      items.push({
        id: `wb_file_${norm}`,
        category: "vault",
        title: prettyTitle,
        subtitle: `${t("cmd_palette_open_in_workbench", "Open in {Citizen}'s Workbench")} • ${fileName}`,
        badgeLabel: lowerFile.endsWith(".json")
          ? cleanNavLabel(t("ql_templates", "Templates"), "Templates")
          : t("cw_tab_configs", "Configs"),
        badgeIcon: t("icon_tune", "tune"),
        badgeColorVar: "var(--accent)",
        icon: t("icon_design_services", "design_services"),
        keywords: `${prettyTitle} ${fileName} config settings workbench ini cfg json`,
        onSelect: () => {
          openConfigInWorkbench(wbPath, prettyTitle);
        },
      });
    }

    // 4. Quick Actions, DEFCON Lockdown, Version History, Hotkeys & Controller Mapping
    items.push({
      id: "action_controls_mapping",
      category: "actions",
      title: t("cmd_palette_controls_title", "Hotkeys & Controller Mapping"),
      subtitle: t(
        "cmd_palette_controls_sub",
        "Customize Keyboard Shortcuts & Gamepad / Steam Deck Input Bindings"
      ),
      badgeLabel: actionsBadge,
      badgeIcon: t("icon_sports_esports", "sports_esports"),
      icon: t("icon_sports_esports", "sports_esports"),
      keywords: "hotkeys shortcuts keybinds controller gamepad steam deck input mapping buttons",
      onSelect: () => {
        setIsControlsOpen(true);
      },
    });

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
          id: "action_lockdown_vault",
          category: "actions",
          title: shelterActive
            ? cleanNavLabel(t("btn_reclaim", "Reclaim {Vault}"), "Reclaim {Vault}")
            : cleanNavLabel(t("btn_lockdown", "Lockdown {Vault}"), "Lockdown {Vault}"),
          subtitle: shelterActive
            ? t("btn_bunker_unlock_desc", "Disable Defensive Process")
            : t(
                "cmd_palette_lockdown_vault_sub",
                "Remove All Symlinks & Clean Game Folder (Safe Mode Shelter)"
              ),
          badgeLabel: actionsBadge,
          badgeIcon: shelterActive
            ? t("icon_lock", "lock")
            : t("icon_lock_open", "lock_open"),
          badgeColorVar: shelterActive ? "var(--warning)" : "var(--accent)",
          icon: shelterActive
            ? t("icon_lock", "lock")
            : t("icon_lock_open", "lock_open"),
          keywords:
            "lockdown vault reclaim shelter remove all symlinks clean game folder unequip defensive process bunker safe mode",
          isActive: Boolean(shelterActive),
          onSelect: () => {
            if (onTriggerShelter) {
              onTriggerShelter(!shelterActive);
            }
            closePalette();
          },
        },
        {
          id: "action_defcon_alert",
          category: "actions",
          title: t("cmd_palette_defcon_alert_title", "Emergency Lockdown & Malware Shield (DEFCON)"),
          subtitle: t(
            "cmd_palette_defcon_alert_sub",
            "Inspect Active Security Alerts, Patch Lockdown & Quarantine Shield"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_gpp_maybe", "gpp_maybe"),
          badgeColorVar: "var(--danger)",
          icon: t("icon_gpp_maybe", "gpp_maybe"),
          iconColorClass: "text-[var(--danger)]",
          keywords: "defcon lockdown alert malware security emergency patch shield quarantine",
          onSelect: () => {
            if (onOpenDefcon) {
              onOpenDefcon();
            } else {
              useModalStore.getState().setShowDefconAlert(true);
            }
            closePalette();
          },
        },
        {
          id: "action_version_history_drawer",
          category: "actions",
          title: t("cmd_palette_version_history_title", "{Mod} Version History"),
          subtitle: t(
            "cmd_palette_version_history_sub",
            "Manage Stored {Mod} Versions, Rollbacks & Automatic Version Routing"
          ),
          badgeLabel: actionsBadge,
          badgeIcon: t("icon_history", "history"),
          icon: t("icon_history", "history"),
          keywords: "mod version history rollback archive legacy versions auto swap revisions",
          onSelect: () => {
            setView("vault");
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent("sanctuary-open-version-pool"));
            }, 50);
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
          keywords: "pre-patch snapshot backup update emergency defcon",
          onSelect: () => {
            onTriggerPrePatchSnapshot();
            closePalette();
          },
        }
      );
    }

    const panelBadge = t("cmd_palette_panel_badge", "Side Panel");
    const openCcPanel = (panelName: string) => {
      setView("dashboard");
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("sanctuary-open-cc-panel", { detail: { panel: panelName } })
        );
      }, 45);
      closePalette();
    };

    items.push(
      {
        id: "panel_critical_failures",
        category: "actions",
        title: cleanNavLabel(t("crit_fail", "Critical Failures"), "Critical Failures"),
        subtitle: t(
          "cmd_palette_panel_critical_sub",
          "Open Critical Failures & Fatal Conflicts Diagnostic Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_gpp_bad", "gpp_bad"),
        badgeColorVar: "var(--danger)",
        icon: t("icon_gpp_bad", "gpp_bad"),
        iconColorClass: "text-[var(--danger)]",
        keywords: "critical failures fatal conflicts broken mods command center panel drawer",
        onSelect: () => openCcPanel("critical"),
      },
      {
        id: "panel_system_alerts",
        category: "actions",
        title: t("system_alerts_title", "System Alerts"),
        subtitle: t(
          "cmd_palette_panel_alerts_sub",
          "Open System Alerts & Tuning Overlaps Diagnostic Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_warning_amber", "warning_amber"),
        badgeColorVar: "var(--warning)",
        icon: t("icon_warning_amber", "warning_amber"),
        iconColorClass: "text-[var(--warning)]",
        keywords: "system alerts tuning conflicts unstable mods command center panel drawer",
        onSelect: () => openCcPanel("alert"),
      },
      {
        id: "panel_updates_available",
        category: "actions",
        title: t("updates_avail", "Updates Available"),
        subtitle: t(
          "cmd_palette_panel_updates_sub",
          "Open Available {Mod} Updates & Guided Batch Updater Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_update", "update"),
        badgeColorVar: "var(--accent)",
        icon: t("icon_update", "update"),
        keywords: "updates available mod updates guided batch updater panel drawer",
        onSelect: () => {
          useModalStore.getState().setShowUpdatesModal(true);
          closePalette();
        },
      },
      {
        id: "panel_conflict_radar",
        category: "actions",
        title: `${t("radar_title", "Conflict Radar")} — ${panelBadge}`,
        subtitle: t(
          "cmd_palette_panel_radar_sub",
          "Open Active {Blueprint} Conflict Radar Summary Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_track_changes", "track_changes"),
        icon: t("icon_track_changes", "track_changes"),
        keywords: "conflict radar panel summary collisions overlaps command center drawer",
        onSelect: () => {
          useModalStore.getState().setIsConflictRadarOpen(true);
          closePalette();
        },
      },
      {
        id: "panel_quarantine_malware",
        category: "actions",
        title: t("quarantine_title", "Malware & Quarantine"),
        subtitle: t(
          "cmd_palette_panel_quarantine_sub",
          "Open Malware Quarantine & Security Isolation Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_coronavirus", "coronavirus"),
        badgeColorVar: "var(--danger)",
        icon: t("icon_coronavirus", "coronavirus"),
        iconColorClass: "text-[var(--danger)]",
        keywords: "malware alert quarantine panel threats isolation security drawer",
        onSelect: () => {
          useModalStore.getState().setShowQuarantineModal(true);
          closePalette();
        },
      },
      {
        id: "panel_broken_mods",
        category: "actions",
        title: t("incompatible_mods", "Incompatible & Broken {Mods}"),
        subtitle: t(
          "cmd_palette_panel_broken_sub",
          "Open Broken, Corrupted & Incompatible {Mods} Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_broken_image", "broken_image"),
        badgeColorVar: "var(--danger)",
        icon: t("icon_broken_image", "broken_image"),
        keywords: "broken incompatible obsolete corrupted mods panel drawer",
        onSelect: () => {
          useModalStore.getState().setShowBrokenModal(true);
          closePalette();
        },
      },
      {
        id: "panel_blueprint_swap",
        category: "actions",
        title: `${t("playsets_title", "{Blueprints}")} — ${panelBadge}`,
        subtitle: t(
          "cmd_palette_panel_blueprints_sub",
          "Open Quick {Blueprint} Switcher & Deployment Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_map", "map"),
        icon: t("icon_map", "map"),
        keywords: "blueprints playsets swap switch quick selector panel drawer",
        onSelect: () => {
          useModalStore.getState().setIsBlueprintSwapOpen(true);
          closePalette();
        },
      },
      {
        id: "panel_active_workspaces",
        category: "actions",
        title: `${t("landing_workspaces", "Active Workspaces")} — ${panelBadge}`,
        subtitle: t(
          "cmd_palette_panel_workspaces_sub",
          "Open Active Game Workspaces & Spoke Switcher Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_public", "public"),
        icon: t("icon_public", "public"),
        keywords: "active workspaces game switcher spoke panel drawer",
        onSelect: () => {
          window.dispatchEvent(
            new CustomEvent("sanctuary-tour-workspace-panel", { detail: { open: true } })
          );
          closePalette();
        },
      },
      {
        id: "panel_sanctuary_broadcasts",
        category: "actions",
        title: t("title_sanctuary_alerts", "Sanctuary Alerts"),
        subtitle: t(
          "cmd_palette_panel_broadcasts_sub",
          "Open Official Sanctuary Broadcasts & Urgent Alerts Panel"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_campaign", "campaign"),
        badgeColorVar: "var(--warning)",
        icon: t("icon_campaign", "campaign"),
        keywords: "sanctuary alerts broadcasts urgent announcements command center panel drawer",
        onSelect: () => openCcPanel("broadcasts"),
      },
      {
        id: "panel_audit_logs",
        category: "actions",
        title: t("audit_logs", "Audit Logs"),
        subtitle: t("audit_logs_desc", "System modification history"),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_history", "history"),
        icon: t("icon_history", "history"),
        keywords: "audit logs history modification command center panel drawer",
        onSelect: () => openCcPanel("audit_logs"),
      },
      {
        id: "panel_support_perks",
        category: "actions",
        title: t("cmd_quick_support_title", "Support & Perks (0% Fee)"),
        subtitle: t(
          "cmd_quick_support_desc",
          "Support this community & unlock Global Daily Dev Builds"
        ),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_volunteer_activism", "volunteer_activism"),
        badgeColorVar: "var(--success)",
        icon: t("icon_volunteer_activism", "volunteer_activism"),
        keywords: "support perks donations dev builds panel drawer",
        onSelect: () => openCcPanel("support_perks"),
      },
      {
        id: "panel_submit_ticket",
        category: "actions",
        title: t("support_title", "Submit A Ticket"),
        subtitle: t("btn_submit_ticket_desc", "Open Sanctuary Support System"),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_local_activity", "local_activity"),
        icon: t("icon_local_activity", "local_activity"),
        keywords: "submit ticket support help report issue panel drawer",
        onSelect: () => {
          useModalStore.getState().setIsSupportPanelOpen(true);
          closePalette();
        },
      },
      {
        id: "panel_my_tickets",
        category: "actions",
        title: t("support_tickets", "Support Tickets"),
        subtitle: t("sidebar_support", "Sanctuary Support"),
        badgeLabel: panelBadge,
        badgeIcon: t("icon_confirmation_number", "confirmation_number"),
        icon: t("icon_confirmation_number", "confirmation_number"),
        keywords: "my support tickets inbox replies citizen tickets panel drawer",
        onSelect: () => {
          if (onOpenCitizenTickets) {
            onOpenCitizenTickets();
          } else {
            useModalStore.getState().setIsSupportPanelOpen(true);
          }
          closePalette();
        },
      },
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
      },
      {
        id: "action_screenshot_tour",
        category: "actions",
        title: t("landing_tour_btn", "Interactive Tour"),
        subtitle: t("landing_subtitle", "Sanctuary OS Hub Overview & Pinned Workspaces"),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_photo_camera", "photo_camera"),
        icon: t("icon_photo_camera", "photo_camera"),
        keywords: "tour screenshots walkthrough optical capture preview",
        onSelect: () => {
          navigateToLandingTab("overview");
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
      items.push({
        id: "action_cloud_sync_guard",
        category: "actions",
        title: t("cloud_guard_panel_title", "Cloud-Sync Folder Guard"),
        subtitle: t(
          "cloud_guard_cmd_subtitle",
          "Inspect OneDrive, iCloud, Dropbox & symlink safety or manage consent"
        ),
        badgeLabel: actionsBadge,
        badgeIcon: t("icon_cloud_sync", "cloud_sync"),
        icon: t("icon_cloud_sync", "cloud_sync"),
        keywords:
          "onedrive icloud dropbox google drive mega proton nextcloud cloud sync symlink hydration backup consent",
        onSelect: () => {
          useModalStore.getState().openCloudSyncGuard();
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
    masonsRegistry,
    workbenchPaths,
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
    navigateToVaultSubTab,
    openConfigInWorkbench,
    onEquipBlueprint,
    onInspectMod,
    onToggleModInBlueprint,
    onQuickLaunch,
    onRunRadarSweep,
    onOpenDropzone,
    onTriggerFullBackup,
    onTriggerPrePatchSnapshot,
    onOpenNotifications,
    onOpenMasonProfile,
    onOpenDefcon,
    onTriggerShelter,
    onOpenCitizenTickets,
    shelterActive,
    setView,
    closePalette,
  ]);

  return { allItems };
}

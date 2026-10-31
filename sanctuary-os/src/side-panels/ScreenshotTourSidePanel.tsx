import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../LexiconContext";
import { useTheme } from "../ThemeContext";
import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import {
  SidePanel,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  SidePanelHeroCard,
  UniversalGroup,
  StatBox,
} from "../shared";
import { notifyOS } from "../utils/notificationHelper";

export type HubKey =
  | "masonActiveTab"
  | "architectActiveTab"
  | "oversightActiveTab"
  | "wayfinderActiveTab"
  | "keepersActiveTab";

export type TourPanelId =
  | "workspaces"
  | "system_queues"
  | "notifications"
  | "command_palette"
  | "mod_dossier"
  | "blueprint_swap"
  | "blueprint_architect"
  | "sanctuary_alerts"
  | "conflicts_detected"
  | "incompatible_mods"
  | "mod_updates"
  | "radar_sweep"
  | "vault_dropzone"
  | "signature_queue"
  | "scout_queue"
  | "nexus_updates"
  | "time_capsule_inspector"
  | "release_notes"
  | "support_hub"
  | "citizen_tickets"
  | "system_status"
  | "system_logs";

export interface TourTargetStep {
  id: string;
  view: string;
  subTabKey?: HubKey;
  subTabValue?: string;
  hubLabelKey?: string;
  hubLabelFallback?: string;
  panelId?: TourPanelId;
  fileSlug: string;
  labelKey: string;
  labelFallback: string;
  iconKey: string;
  iconFallback: string;
  isSubTab?: boolean;
  isPanel?: boolean;
}

const CORE_TOUR_STEPS: TourTargetStep[] = [
  {
    id: "dashboard",
    view: "dashboard",
    fileSlug: "01_Command_Center",
    labelKey: "center_title",
    labelFallback: "Command Center",
    iconKey: "icon_desktop_windows",
    iconFallback: "desktop_windows",
  },
  {
    id: "vault",
    view: "vault",
    fileSlug: "02_Vault",
    labelKey: "vault_title",
    labelFallback: "Your {Vault}",
    iconKey: "icon_account_balance",
    iconFallback: "account_balance",
  },
  {
    id: "nexus",
    view: "nexus",
    fileSlug: "03_The_Nexus",
    labelKey: "market_title",
    labelFallback: "The Nexus",
    iconKey: "icon_hub",
    iconFallback: "hub",
  },
  {
    id: "playsets",
    view: "playsets",
    fileSlug: "04_Blueprints",
    labelKey: "playsets_title",
    labelFallback: "{Blueprints}",
    iconKey: "icon_map",
    iconFallback: "map",
  },
  {
    id: "GlobalFeed",
    view: "GlobalFeed",
    fileSlug: "05_Comm_Link_Feed",
    labelKey: "feed_title",
    labelFallback: "Comm-Link Feed",
    iconKey: "icon_satellite_alt",
    iconFallback: "satellite_alt",
  },
  {
    id: "DbpfScout",
    view: "DbpfScout",
    fileSlug: "06_Conflict_Radar",
    labelKey: "radar_title",
    labelFallback: "Conflict Radar",
    iconKey: "icon_track_changes",
    iconFallback: "track_changes",
  },
  {
    id: "lab",
    view: "lab",
    fileSlug: "07_Homestead_Lab",
    labelKey: "term_lab",
    labelFallback: "Homestead {Lab}",
    iconKey: "icon_science",
    iconFallback: "science",
  },
  {
    id: "CitizensWorkbench",
    view: "CitizensWorkbench",
    fileSlug: "08_Workbench",
    labelKey: "title_sidebar",
    labelFallback: "Workbench",
    iconKey: "icon_design_services",
    iconFallback: "design_services",
  },
  {
    id: "backups",
    view: "backups",
    fileSlug: "09_Time_Capsule",
    labelKey: "term_backups",
    labelFallback: "{Backups}",
    iconKey: "icon_history",
    iconFallback: "history",
  },
  {
    id: "MasonHub",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "command_center",
    fileSlug: "10_Mason_Workshop",
    labelKey: "sidebar_mason_hub",
    labelFallback: "{Mason} Workshop",
    iconKey: "icon_construction",
    iconFallback: "construction",
  },
  {
    id: "ArchitectHub",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "command_center",
    fileSlug: "11_Architect_Console",
    labelKey: "sidebar_architect_hub",
    labelFallback: "Architect Console",
    iconKey: "icon_analytics",
    iconFallback: "analytics",
  },
  {
    id: "Oversight",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "command_center",
    fileSlug: "12_Oversight_Command",
    labelKey: "stat_oversight",
    labelFallback: "Oversight Command",
    iconKey: "icon_security",
    iconFallback: "security",
  },
  {
    id: "WayfinderHub",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "command_center",
    fileSlug: "13_Wayfinder_Operations",
    labelKey: "sidebar_wayfinder_tools",
    labelFallback: "Wayfinder Operations",
    iconKey: "icon_terminal",
    iconFallback: "terminal",
  },
  {
    id: "KeepersCore",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "command_center",
    fileSlug: "14_Keepers_Core",
    labelKey: "sidebar_keepers_core",
    labelFallback: "Keepers Core",
    iconKey: "icon_admin_panel_settings",
    iconFallback: "admin_panel_settings",
  },
  {
    id: "settings",
    view: "settings",
    fileSlug: "15_System_Preferences",
    labelKey: "term_settings",
    labelFallback: "{Settings}",
    iconKey: "icon_settings",
    iconFallback: "settings",
  },
];

const HUB_SUBTAB_STEPS: TourTargetStep[] = [
  // 10. Mason Workshop (7 Subsections)
  {
    id: "MasonHub_command_center",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "command_center",
    hubLabelKey: "sidebar_mason_hub",
    hubLabelFallback: "{Mason} Workshop",
    fileSlug: "10_01_Mason_Command",
    labelKey: "tab_command_center",
    labelFallback: "Command",
    iconKey: "icon_desktop_windows",
    iconFallback: "desktop_windows",
    isSubTab: true,
  },
  {
    id: "MasonHub_sandbox",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "sandbox",
    hubLabelKey: "sidebar_mason_hub",
    hubLabelFallback: "{Mason} Workshop",
    fileSlug: "10_02_Mason_Artifacts",
    labelKey: "term_mods",
    labelFallback: "{Mods}",
    iconKey: "icon_deployed_code",
    iconFallback: "deployed_code",
    isSubTab: true,
  },
  {
    id: "MasonHub_nexus",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "nexus",
    hubLabelKey: "sidebar_mason_hub",
    hubLabelFallback: "{Mason} Workshop",
    fileSlug: "10_03_Mason_Nexus",
    labelKey: "term_nexus",
    labelFallback: "{Nexus}",
    iconKey: "icon_hub",
    iconFallback: "hub",
    isSubTab: true,
  },
  {
    id: "MasonHub_chameleons",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "chameleons",
    hubLabelKey: "sidebar_mason_hub",
    hubLabelFallback: "{Mason} Workshop",
    fileSlug: "10_04_Mason_Aesthetics",
    labelKey: "tab_aesthetics",
    labelFallback: "Aesthetics",
    iconKey: "icon_palette",
    iconFallback: "palette",
    isSubTab: true,
  },
  {
    id: "MasonHub_collections",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "collections",
    hubLabelKey: "sidebar_mason_hub",
    hubLabelFallback: "{Mason} Workshop",
    fileSlug: "10_05_Mason_Collections",
    labelKey: "tab_collections",
    labelFallback: "Collections",
    iconKey: "icon_collections_bookmark",
    iconFallback: "collections_bookmark",
    isSubTab: true,
  },
  {
    id: "MasonHub_posts",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "posts",
    hubLabelKey: "sidebar_mason_hub",
    hubLabelFallback: "{Mason} Workshop",
    fileSlug: "10_06_Mason_Dispatches",
    labelKey: "term_dispatches",
    labelFallback: "{Dispatches}",
    iconKey: "icon_satellite_alt",
    iconFallback: "satellite_alt",
    isSubTab: true,
  },
  {
    id: "MasonHub_bug_reports",
    view: "MasonHub",
    subTabKey: "masonActiveTab",
    subTabValue: "bug_reports",
    hubLabelKey: "sidebar_mason_hub",
    hubLabelFallback: "{Mason} Workshop",
    fileSlug: "10_07_Mason_Reports",
    labelKey: "tab_bug_reports",
    labelFallback: "Reports",
    iconKey: "icon_flag",
    iconFallback: "flag",
    isSubTab: true,
  },

  // 11. Architect Console (9 Subsections)
  {
    id: "ArchitectHub_command_center",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "command_center",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_01_Architect_Command",
    labelKey: "tab_command_center",
    labelFallback: "Command",
    iconKey: "icon_desktop_windows",
    iconFallback: "desktop_windows",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_registry",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "registry",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_02_Architect_Registry",
    labelKey: "term_mods",
    labelFallback: "{Mods}",
    iconKey: "icon_inventory_2",
    iconFallback: "inventory_2",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_queue",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "queue",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_03_Architect_Scanner",
    labelKey: "arch_tab_scanner",
    labelFallback: "Scanner",
    iconKey: "icon_radar",
    iconFallback: "radar",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_lab",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "lab",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_04_Architect_Diagnostics",
    labelKey: "tab_diagnostics",
    labelFallback: "Diagnostics",
    iconKey: "icon_monitor_heart",
    iconFallback: "monitor_heart",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_collections",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "collections",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_05_Architect_Collections",
    labelKey: "tab_collections",
    labelFallback: "Collections",
    iconKey: "icon_collections_bookmark",
    iconFallback: "collections_bookmark",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_mason_queue",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "mason_queue",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_06_Architect_Mason_Queue",
    labelKey: "term_mason",
    labelFallback: "{Mason}",
    iconKey: "icon_badge",
    iconFallback: "badge",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_template_oversight",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "template_oversight",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_07_Architect_Templates",
    labelKey: "tab_templates",
    labelFallback: "Templates",
    iconKey: "icon_description",
    iconFallback: "description",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_nexus_reports",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "nexus_reports",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_08_Architect_Reports",
    labelKey: "tab_reports",
    labelFallback: "Reports",
    iconKey: "icon_flag",
    iconFallback: "flag",
    isSubTab: true,
  },
  {
    id: "ArchitectHub_support_tickets",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "support_tickets",
    hubLabelKey: "sidebar_architect_hub",
    hubLabelFallback: "Architect Console",
    fileSlug: "11_09_Architect_Support",
    labelKey: "tab_support_tickets",
    labelFallback: "Support",
    iconKey: "icon_support_agent",
    iconFallback: "support_agent",
    isSubTab: true,
  },

  // 12. Oversight Command (10 Subsections)
  {
    id: "Oversight_command_center",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "command_center",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_01_Oversight_Command",
    labelKey: "tab_command_center",
    labelFallback: "Command",
    iconKey: "icon_desktop_windows",
    iconFallback: "desktop_windows",
    isSubTab: true,
  },
  {
    id: "Oversight_comms",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "oversight_comms",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_02_Oversight_Dispatch",
    labelKey: "term_dispatch",
    labelFallback: "{Dispatch}",
    iconKey: "icon_satellite_alt",
    iconFallback: "satellite_alt",
    isSubTab: true,
  },
  {
    id: "Oversight_identities",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "identities",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_03_Oversight_Identities",
    labelKey: "tab_identities",
    labelFallback: "Identity",
    iconKey: "icon_group",
    iconFallback: "group",
    isSubTab: true,
  },
  {
    id: "Oversight_compliance",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "compliance",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_04_Oversight_Compliance",
    labelKey: "tab_compliance",
    labelFallback: "Compliance",
    iconKey: "icon_gavel",
    iconFallback: "gavel",
    isSubTab: true,
  },
  {
    id: "Oversight_malware",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "malware_oversight",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_05_Oversight_Malware",
    labelKey: "rating_malware",
    labelFallback: "Malware",
    iconKey: "icon_coronavirus",
    iconFallback: "coronavirus",
    isSubTab: true,
  },
  {
    id: "Oversight_reports",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "reports",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_06_Oversight_Reports",
    labelKey: "tab_reports",
    labelFallback: "Reports",
    iconKey: "icon_flag",
    iconFallback: "flag",
    isSubTab: true,
  },
  {
    id: "Oversight_tickets",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "sanctuary_tickets",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_07_Oversight_Support",
    labelKey: "tab_support_tickets",
    labelFallback: "Support",
    iconKey: "icon_support_agent",
    iconFallback: "support_agent",
    isSubTab: true,
  },
  {
    id: "Oversight_mass_update",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "mass_update",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_08_Oversight_Mass_Update",
    labelKey: "tab_mass_update",
    labelFallback: "Mass Update",
    iconKey: "icon_bolt",
    iconFallback: "bolt",
    isSubTab: true,
  },
  {
    id: "Oversight_game_versions",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "game_versions",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_09_Oversight_Management",
    labelKey: "tab_management",
    labelFallback: "Management",
    iconKey: "icon_tune",
    iconFallback: "tune",
    isSubTab: true,
  },
  {
    id: "Oversight_audit_logs",
    view: "Oversight",
    subTabKey: "oversightActiveTab",
    subTabValue: "audit_logs",
    hubLabelKey: "stat_oversight",
    hubLabelFallback: "Oversight Command",
    fileSlug: "12_10_Oversight_Audit_Logs",
    labelKey: "tab_audit_logs",
    labelFallback: "Audit Logs",
    iconKey: "icon_history",
    iconFallback: "history",
    isSubTab: true,
  },

  // 13. Wayfinder Operations (9 Subsections)
  {
    id: "Wayfinder_command_center",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "command_center",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_01_Wayfinder_Command",
    labelKey: "tab_command_center",
    labelFallback: "Command",
    iconKey: "icon_desktop_windows",
    iconFallback: "desktop_windows",
    isSubTab: true,
  },
  {
    id: "Wayfinder_comms",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "wf_comms_title",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_02_Wayfinder_Dispatch",
    labelKey: "term_dispatch",
    labelFallback: "{Dispatch}",
    iconKey: "icon_satellite_alt",
    iconFallback: "satellite_alt",
    isSubTab: true,
  },
  {
    id: "Wayfinder_tickets",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "sanctuary_tickets",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_03_Wayfinder_Support",
    labelKey: "tab_support_tickets",
    labelFallback: "Support",
    iconKey: "icon_support_agent",
    iconFallback: "support_agent",
    isSubTab: true,
  },
  {
    id: "Wayfinder_identities",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "identities",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_04_Wayfinder_Identities",
    labelKey: "tab_identities",
    labelFallback: "Identity",
    iconKey: "icon_group",
    iconFallback: "group",
    isSubTab: true,
  },
  {
    id: "Wayfinder_compliance",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "compliance",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_05_Wayfinder_Compliance",
    labelKey: "tab_compliance",
    labelFallback: "Compliance",
    iconKey: "icon_gavel",
    iconFallback: "gavel",
    isSubTab: true,
  },
  {
    id: "Wayfinder_malware",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "malware_oversight",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_06_Wayfinder_Malware",
    labelKey: "rating_malware",
    labelFallback: "Malware",
    iconKey: "icon_coronavirus",
    iconFallback: "coronavirus",
    isSubTab: true,
  },
  {
    id: "Wayfinder_reports",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "reports",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_07_Wayfinder_Reports",
    labelKey: "tab_reports",
    labelFallback: "Reports",
    iconKey: "icon_flag",
    iconFallback: "flag",
    isSubTab: true,
  },
  {
    id: "Wayfinder_ide",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "ide",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_08_Wayfinder_Spoke_Control",
    labelKey: "wf_tab_spoke_control",
    labelFallback: "Spoke Control",
    iconKey: "icon_data_object",
    iconFallback: "data_object",
    isSubTab: true,
  },
  {
    id: "Wayfinder_chameleons",
    view: "WayfinderHub",
    subTabKey: "wayfinderActiveTab",
    subTabValue: "chameleons",
    hubLabelKey: "sidebar_wayfinder_tools",
    hubLabelFallback: "Wayfinder Operations",
    fileSlug: "13_09_Wayfinder_Spoke_Aesthetics",
    labelKey: "wf_tab_spoke_aesthetics",
    labelFallback: "Spoke Aesthetics",
    iconKey: "icon_palette",
    iconFallback: "palette",
    isSubTab: true,
  },

  // 14. Keepers Core (8 Subsections)
  {
    id: "Keepers_command_center",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "command_center",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_01_Keepers_Command",
    labelKey: "tab_command_center",
    labelFallback: "Command",
    iconKey: "icon_desktop_windows",
    iconFallback: "desktop_windows",
    isSubTab: true,
  },
  {
    id: "Keepers_comms",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "keepers_comms",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_02_Keepers_Dispatch",
    labelKey: "term_dispatch",
    labelFallback: "{Dispatch}",
    iconKey: "icon_satellite_alt",
    iconFallback: "satellite_alt",
    isSubTab: true,
  },
  {
    id: "Keepers_web_directives",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "web_directives",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_03_Keepers_Web_Landing",
    labelKey: "keepers_tab_web_directives",
    labelFallback: "Web Landing",
    iconKey: "icon_language",
    iconFallback: "language",
    isSubTab: true,
  },
  {
    id: "Keepers_spokes",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "active_games",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_04_Keepers_Partner_Spokes",
    labelKey: "keepers_tab_partner_spokes",
    labelFallback: "Partner Spokes",
    iconKey: "icon_dns",
    iconFallback: "dns",
    isSubTab: true,
  },
  {
    id: "Keepers_identities",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "identities",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_05_Keepers_Citizen_Oversight",
    labelKey: "keepers_tab_citizen_oversight",
    labelFallback: "{Citizen} Oversight",
    iconKey: "icon_group",
    iconFallback: "group",
    isSubTab: true,
  },
  {
    id: "Keepers_heuristics",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "heuristics",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_06_Keepers_Core_Heuristics",
    labelKey: "keepers_tab_core_heuristics",
    labelFallback: "Core Heuristics",
    iconKey: "icon_shield_lock",
    iconFallback: "shield_lock",
    isSubTab: true,
  },
  {
    id: "Keepers_support",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "support",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_07_Keepers_Support",
    labelKey: "tab_support_tickets",
    labelFallback: "Support",
    iconKey: "icon_support_agent",
    iconFallback: "support_agent",
    isSubTab: true,
  },
  {
    id: "Keepers_chameleons",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "chameleons",
    hubLabelKey: "sidebar_keepers_core",
    hubLabelFallback: "Keepers Core",
    fileSlug: "14_08_Keepers_Core_Aesthetics",
    labelKey: "keepers_tab_core_aesthetics",
    labelFallback: "Core Aesthetics",
    iconKey: "icon_palette",
    iconFallback: "palette",
    isSubTab: true,
  },
];

const PANEL_TOUR_STEPS: TourTargetStep[] = [
  {
    id: "panel_workspaces",
    view: "dashboard",
    panelId: "workspaces",
    fileSlug: "20_Panel_Active_Workspaces",
    labelKey: "workspace_switcher_title",
    labelFallback: "Active Workspaces",
    iconKey: "icon_public",
    iconFallback: "public",
    isPanel: true,
  },
  {
    id: "panel_system_queues",
    view: "dashboard",
    panelId: "system_queues",
    fileSlug: "21_Panel_System_Queues",
    labelKey: "system_queues_title",
    labelFallback: "System Queues & Updates",
    iconKey: "icon_checklist",
    iconFallback: "checklist",
    isPanel: true,
  },
  {
    id: "panel_notifications",
    view: "dashboard",
    panelId: "notifications",
    fileSlug: "22_Panel_Notifications",
    labelKey: "tab_notifs",
    labelFallback: "Notifications",
    iconKey: "icon_notifications",
    iconFallback: "notifications",
    isPanel: true,
  },
  {
    id: "panel_command_palette",
    view: "dashboard",
    panelId: "command_palette",
    fileSlug: "23_Panel_Command_Palette",
    labelKey: "cmd_palette_title",
    labelFallback: "Command Palette",
    iconKey: "icon_search",
    iconFallback: "search",
    isPanel: true,
  },
  {
    id: "panel_mod_dossier",
    view: "vault",
    panelId: "mod_dossier",
    fileSlug: "24_Panel_Mod_Dossier",
    labelKey: "cmd_palette_inspect_dossier",
    labelFallback: "{Mod} Dossier",
    iconKey: "icon_deployed_code",
    iconFallback: "deployed_code",
    isPanel: true,
  },
  {
    id: "panel_blueprint_swap",
    view: "dashboard",
    panelId: "blueprint_swap",
    fileSlug: "25_Panel_Quick_Swap_Blueprints",
    labelKey: "swap_blueprint",
    labelFallback: "Quick Swap {Blueprints}",
    iconKey: "icon_swap_horiz",
    iconFallback: "swap_horiz",
    isPanel: true,
  },
  {
    id: "panel_blueprint_architect",
    view: "BlueprintArchitect",
    panelId: "blueprint_architect",
    fileSlug: "26_Panel_Blueprint_Architect",
    labelKey: "architect_sync_title",
    labelFallback: "{Blueprint} Architect",
    iconKey: "icon_map",
    iconFallback: "map",
    isPanel: true,
  },
  {
    id: "panel_sanctuary_alerts",
    view: "dashboard",
    panelId: "sanctuary_alerts",
    fileSlug: "27_Panel_Sanctuary_Alerts",
    labelKey: "alert_intervention_title",
    labelFallback: "Sanctuary Alerts",
    iconKey: "icon_warning",
    iconFallback: "warning",
    isPanel: true,
  },
  {
    id: "panel_conflicts_detected",
    view: "dashboard",
    panelId: "conflicts_detected",
    fileSlug: "28_Panel_Conflicts_Detected",
    labelKey: "conflicts_detected_title",
    labelFallback: "Conflicts Detected",
    iconKey: "icon_track_changes",
    iconFallback: "track_changes",
    isPanel: true,
  },
  {
    id: "panel_incompatible_mods",
    view: "dashboard",
    panelId: "incompatible_mods",
    fileSlug: "29_Panel_Incompatible_Mods",
    labelKey: "incompatible_mods_title",
    labelFallback: "Incompatible {Mods}",
    iconKey: "icon_report_problem",
    iconFallback: "report_problem",
    isPanel: true,
  },
  {
    id: "panel_mod_updates",
    view: "dashboard",
    panelId: "mod_updates",
    fileSlug: "30_Panel_Mod_Updates",
    labelKey: "updates_detected_title",
    labelFallback: "{Mod} Updates Detected",
    iconKey: "icon_system_update_alt",
    iconFallback: "system_update_alt",
    isPanel: true,
  },
  {
    id: "panel_radar_sweep",
    view: "dashboard",
    panelId: "radar_sweep",
    fileSlug: "31_Panel_Radar_Sweep",
    labelKey: "radar_sweep_title",
    labelFallback: "Conflict Radar Sweep",
    iconKey: "icon_radar",
    iconFallback: "radar",
    isPanel: true,
  },
  {
    id: "panel_vault_dropzone",
    view: "vault",
    panelId: "vault_dropzone",
    fileSlug: "32_Panel_Vault_Dropzone",
    labelKey: "cmd_palette_open_dropzone_title",
    labelFallback: "{Vault} Dropzone",
    iconKey: "icon_Move_to_Inbox",
    iconFallback: "Move_to_Inbox",
    isPanel: true,
  },
  {
    id: "panel_signature_queue",
    view: "playsets",
    panelId: "signature_queue",
    fileSlug: "33_Panel_Signature_Queue",
    labelKey: "sig_queue_title",
    labelFallback: "{Blueprint} Signature Queue",
    iconKey: "icon_fingerprint",
    iconFallback: "fingerprint",
    isPanel: true,
  },
  {
    id: "panel_scout_queue",
    view: "ArchitectHub",
    subTabKey: "architectActiveTab",
    subTabValue: "queue",
    panelId: "scout_queue",
    fileSlug: "34_Panel_Scout_Queue",
    labelKey: "scout_queue_title",
    labelFallback: "Scout Queue",
    iconKey: "icon_travel_explore",
    iconFallback: "travel_explore",
    isPanel: true,
  },
  {
    id: "panel_nexus_updates",
    view: "nexus",
    panelId: "nexus_updates",
    fileSlug: "35_Panel_Nexus_Updates",
    labelKey: "nexus_updates_title",
    labelFallback: "{Nexus} Updates",
    iconKey: "icon_cloud_download",
    iconFallback: "cloud_download",
    isPanel: true,
  },
  {
    id: "panel_time_capsule",
    view: "backups",
    panelId: "time_capsule_inspector",
    fileSlug: "36_Panel_Time_Capsule_Inspector",
    labelKey: "world_state",
    labelFallback: "{Backups} Snapshot Inspector",
    iconKey: "icon_history",
    iconFallback: "history",
    isPanel: true,
  },
  {
    id: "panel_release_notes",
    view: "KeepersCore",
    subTabKey: "keepersActiveTab",
    subTabValue: "command_center",
    panelId: "release_notes",
    fileSlug: "37_Panel_Release_Notes",
    labelKey: "release_notes_title",
    labelFallback: "Release Notes & Changelog",
    iconKey: "icon_new_releases",
    iconFallback: "new_releases",
    isPanel: true,
  },
  {
    id: "panel_support_hub",
    view: "dashboard",
    panelId: "support_hub",
    fileSlug: "38_Panel_Support_Hub",
    labelKey: "support_hub_title",
    labelFallback: "Support Hub",
    iconKey: "icon_support_agent",
    iconFallback: "support_agent",
    isPanel: true,
  },
  {
    id: "panel_citizen_tickets",
    view: "dashboard",
    panelId: "citizen_tickets",
    fileSlug: "39_Panel_Citizen_Tickets",
    labelKey: "my_support_tickets",
    labelFallback: "My Support Tickets",
    iconKey: "icon_confirmation_number",
    iconFallback: "confirmation_number",
    isPanel: true,
  },
  {
    id: "panel_system_status",
    view: "dashboard",
    panelId: "system_status",
    fileSlug: "40_Panel_System_Status",
    labelKey: "system_status_title",
    labelFallback: "System Status",
    iconKey: "icon_dns",
    iconFallback: "dns",
    isPanel: true,
  },
  {
    id: "panel_system_logs",
    view: "dashboard",
    panelId: "system_logs",
    fileSlug: "41_Panel_System_Logs",
    labelKey: "system_log_history",
    labelFallback: "System Log History",
    iconKey: "icon_terminal",
    iconFallback: "terminal",
    isPanel: true,
  },
];

const HUB_GROUPS: {
  key: HubKey;
  labelKey: string;
  labelFallback: string;
  iconKey: string;
  iconFallback: string;
}[] = [
  {
    key: "masonActiveTab",
    labelKey: "sidebar_mason_hub",
    labelFallback: "{Mason} Workshop",
    iconKey: "icon_construction",
    iconFallback: "construction",
  },
  {
    key: "architectActiveTab",
    labelKey: "sidebar_architect_hub",
    labelFallback: "Architect Console",
    iconKey: "icon_analytics",
    iconFallback: "analytics",
  },
  {
    key: "oversightActiveTab",
    labelKey: "stat_oversight",
    labelFallback: "Oversight Command",
    iconKey: "icon_security",
    iconFallback: "security",
  },
  {
    key: "wayfinderActiveTab",
    labelKey: "sidebar_wayfinder_tools",
    labelFallback: "Wayfinder Operations",
    iconKey: "icon_terminal",
    iconFallback: "terminal",
  },
  {
    key: "keepersActiveTab",
    labelKey: "sidebar_keepers_core",
    labelFallback: "Keepers Core",
    iconKey: "icon_admin_panel_settings",
    iconFallback: "admin_panel_settings",
  },
];

export function openSanctuaryScreenshotTour() {
  window.dispatchEvent(new CustomEvent("sanctuary-open-screenshot-tour"));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

export function ScreenshotTourSidePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const {
    activeThemeId,
    setActiveThemeId,
    CORE_THEMES,
    customThemes,
    devThemes,
    gameThemes,
  } = useTheme();
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const allThemes = useMemo(() => {
    const merged: Record<string, any> = {
      ...(CORE_THEMES || {}),
      ...(gameThemes || {}),
      ...(customThemes || {}),
      ...(devThemes || {}),
    };
    return Object.entries(merged).map(([id, data]) => ({
      id,
      name: data?.name || id,
      bg: data?.bg || "#000000",
      accent: data?.accent || "#38bdf8",
    }));
  }, [CORE_THEMES, gameThemes, customThemes, devThemes]);

  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>(() => [
    activeThemeId || "architect",
  ]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>(() =>
    CORE_TOUR_STEPS.map((s) => s.id)
  );
  const [selectedSubTabIds, setSelectedSubTabIds] = useState<string[]>([]);
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [settleDelayMs, setSettleDelayMs] = useState<number>(750);
  const [outputDir, setOutputDir] = useState<string>("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState<number>(0);
  const abortRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      invoke<string>("get_screenshots_root_dir")
        .then((dir) => setOutputDir(dir))
        .catch(() => {});
    }
  }, [isOpen]);

  // Global Esc listener to abort an in-progress tour
  useEffect(() => {
    if (!isCapturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        abortRef.current = true;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCapturing]);

  const activeSteps = useMemo(() => {
    const base = CORE_TOUR_STEPS.filter((s) => selectedStepIds.includes(s.id));
    const subTabs = HUB_SUBTAB_STEPS.filter((s) =>
      selectedSubTabIds.includes(s.id)
    );
    const panels = PANEL_TOUR_STEPS.filter((s) =>
      selectedPanelIds.includes(s.id)
    );
    return [...base, ...subTabs, ...panels];
  }, [selectedStepIds, selectedSubTabIds, selectedPanelIds]);

  const totalPlannedShots = selectedThemeIds.length * activeSteps.length;

  const toggleTheme = (id: string) => {
    setSelectedThemeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleStep = (id: string) => {
    setSelectedStepIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSubTab = (id: string) => {
    setSelectedSubTabIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleHubSubTabs = (hubKey: HubKey) => {
    const hubIds = HUB_SUBTAB_STEPS.filter((s) => s.subTabKey === hubKey).map(
      (s) => s.id
    );
    setSelectedSubTabIds((prev) => {
      const allSelected = hubIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !hubIds.includes(id));
      }
      return Array.from(new Set([...prev, ...hubIds]));
    });
  };

  const togglePanel = (id: string) => {
    setSelectedPanelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleOpenFolder = async () => {
    try {
      const dir = await invoke<string>("open_screenshots_dir");
      if (dir) setOutputDir(dir);
    } catch (err) {
      console.error("Failed to open screenshots folder:", err);
    }
  };

  const handleSnapCurrentScreen = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      await waitForNextPaint();
      await sleep(320);
      window.dispatchEvent(new Event("resize"));
      await waitForNextPaint();
      await sleep(160);

      const themeObj = allThemes.find((th) => th.id === activeThemeId);
      const themeFolder = themeObj?.name || activeThemeId || "Sanctuary";
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const fileSlug = `${view || "Screen"}_${timestamp}`;
      const savedPath = await invoke<string>("capture_window_screenshot", {
        themeFolder,
        fileName: fileSlug,
      });
      setLastSavedCount((c) => c + 1);
      notifyOS(
        t("screenshot_tour_title", "Screenshot Tour"),
        `${t("screenshot_tour_snapped_toast", "Saved Screenshot")}: ${savedPath}`,
        "SYSTEM"
      ).catch(() => {});
    } catch (err) {
      console.error("Failed to snap screen:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDelayedSnapCurrentScreen = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    useStore
      .getState()
      .pushStatus(
        t(
          "screenshot_tour_delayed_snap_toast",
          "Capturing screen in 3 seconds — open any panel or menu now..."
        ),
        "info"
      );
    try {
      await waitForNextPaint();
      await sleep(3000);
      window.dispatchEvent(new Event("resize"));
      await waitForNextPaint();
      await sleep(180);

      const themeObj = allThemes.find((th) => th.id === activeThemeId);
      const themeFolder = themeObj?.name || activeThemeId || "Sanctuary";
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const fileSlug = `${useStore.getState().view || "Screen"}_Panel_${timestamp}`;
      const savedPath = await invoke<string>("capture_window_screenshot", {
        themeFolder,
        fileName: fileSlug,
      });
      setLastSavedCount((c) => c + 1);
      notifyOS(
        t("screenshot_tour_title", "Screenshot Tour"),
        `${t("screenshot_tour_snapped_toast", "Saved Screenshot")}: ${savedPath}`,
        "SYSTEM"
      ).catch(() => {});
    } catch (err) {
      console.error("Failed delayed snap:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  const setPanelState = (panelId: TourPanelId, open: boolean) => {
    const modal = useModalStore.getState();
    const store = useStore.getState();

    switch (panelId) {
      case "workspaces":
        window.dispatchEvent(
          new CustomEvent("sanctuary-tour-workspace-panel", {
            detail: { open },
          })
        );
        break;
      case "system_queues":
        modal.setIsQueuesPanelOpen(open);
        break;
      case "notifications":
        window.dispatchEvent(
          new CustomEvent("sanctuary-tour-panel-control", {
            detail: { panel: "notifications", open },
          })
        );
        break;
      case "command_palette":
        if (open) {
          window.dispatchEvent(new CustomEvent("sanctuary-open-command-palette"));
        } else {
          window.dispatchEvent(new CustomEvent("sanctuary-close-command-palette"));
        }
        break;
      case "mod_dossier":
        window.dispatchEvent(
          new CustomEvent("sanctuary-tour-panel-control", {
            detail: { panel: "mod_dossier", open },
          })
        );
        break;
      case "blueprint_swap":
        modal.setIsBlueprintSwapOpen(open);
        break;
      case "blueprint_architect":
        if (!open) {
          setView("dashboard");
        }
        break;
      case "sanctuary_alerts":
        store.setIsAlertsOpen(open);
        break;
      case "conflicts_detected":
        modal.setShowConflictsPanel(open);
        break;
      case "incompatible_mods":
        modal.setShowIncompatiblePanel(open);
        break;
      case "mod_updates":
        modal.setShowUpdatesModal(open);
        break;
      case "radar_sweep":
        modal.setIsConflictRadarOpen(open);
        break;
      case "vault_dropzone":
        modal.setIsDropzoneOpen(open);
        break;
      case "signature_queue":
        modal.setIsSignatureQueueOpen(open);
        break;
      case "scout_queue":
        modal.setIsScoutPanelOpen(open);
        break;
      case "nexus_updates":
        modal.setIsNexusUpdatesPanelOpen(open);
        break;
      case "time_capsule_inspector":
        window.dispatchEvent(
          new CustomEvent("sanctuary-tour-time-capsule-panel", {
            detail: { open },
          })
        );
        break;
      case "release_notes":
        window.dispatchEvent(
          new CustomEvent("sanctuary-tour-release-notes-panel", {
            detail: { open, channel: "stable", view: "post" },
          })
        );
        break;
      case "support_hub":
        modal.setIsSupportPanelOpen(open);
        break;
      case "citizen_tickets":
        window.dispatchEvent(
          new CustomEvent("sanctuary-tour-panel-control", {
            detail: { panel: "citizen_tickets", open },
          })
        );
        break;
      case "system_status":
        modal.setIsSystemStatusOpen(open);
        break;
      case "system_logs":
        modal.setIsLogExpanded(open);
        break;
    }
  };

  const closeAllTourPanels = () => {
    for (const p of PANEL_TOUR_STEPS) {
      if (p.panelId) {
        setPanelState(p.panelId, false);
      }
    }
  };

  const applyStepNavigation = (step: TourTargetStep) => {
    const storeState = useStore.getState();
    if (step.subTabKey && step.subTabValue) {
      if (step.subTabKey === "masonActiveTab" && storeState.setMasonActiveTab) {
        storeState.setMasonActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "architectActiveTab" &&
        storeState.setArchitectActiveTab
      ) {
        storeState.setArchitectActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "oversightActiveTab" &&
        storeState.setOversightActiveTab
      ) {
        storeState.setOversightActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "wayfinderActiveTab" &&
        storeState.setWayfinderActiveTab
      ) {
        storeState.setWayfinderActiveTab(step.subTabValue);
      } else if (
        step.subTabKey === "keepersActiveTab" &&
        storeState.setKeepersActiveTab
      ) {
        storeState.setKeepersActiveTab(step.subTabValue);
      }
    }
    setView(step.view);
  };

  const handleRunTour = async () => {
    if (isCapturing || selectedThemeIds.length === 0 || activeSteps.length === 0)
      return;

    const originalThemeId = activeThemeId;
    const originalView = view;
    const storeSnap = useStore.getState();
    const origMasonTab = storeSnap.masonActiveTab;
    const origArchitectTab = storeSnap.architectActiveTab;
    const origOversightTab = storeSnap.oversightActiveTab;
    const origWayfinderTab = storeSnap.wayfinderActiveTab;
    const origKeepersTab = storeSnap.keepersActiveTab;

    abortRef.current = false;
    setIsCapturing(true);
    let capturedCount = 0;

    try {
      // Wait for SidePanel to unmount completely before starting captures
      await waitForNextPaint();
      await sleep(350);

      for (const themeId of selectedThemeIds) {
        if (abortRef.current) break;
        const themeObj = allThemes.find((th) => th.id === themeId);
        const themeFolder = themeObj?.name || themeId;

        setActiveThemeId(themeId);
        await waitForNextPaint();
        await sleep(Math.max(450, settleDelayMs));

        for (const step of activeSteps) {
          if (abortRef.current) break;
          closeAllTourPanels();
          applyStepNavigation(step);

          const mainScroll = document.getElementById("sanctuary-main-scroll");
          if (mainScroll) mainScroll.scrollTop = 0;

          if (step.panelId) {
            await waitForNextPaint();
            await sleep(220);
            setPanelState(step.panelId, true);
          }

          await waitForNextPaint();
          await sleep(settleDelayMs);
          window.dispatchEvent(new Event("resize"));
          await waitForNextPaint();
          await sleep(180);

          try {
            await invoke<string>("capture_window_screenshot", {
              themeFolder,
              fileName: step.fileSlug,
            });
            capturedCount++;
          } catch (err) {
            console.error(`Failed screenshot for ${themeFolder}/${step.fileSlug}:`, err);
          }

          if (step.panelId) {
            setPanelState(step.panelId, false);
            await waitForNextPaint();
            await sleep(120);
          }
        }
      }
    } finally {
      closeAllTourPanels();
      // Restore original state
      setActiveThemeId(originalThemeId);
      const restoreStore = useStore.getState();
      if (restoreStore.setMasonActiveTab && origMasonTab)
        restoreStore.setMasonActiveTab(origMasonTab);
      if (restoreStore.setArchitectActiveTab && origArchitectTab)
        restoreStore.setArchitectActiveTab(origArchitectTab);
      if (restoreStore.setOversightActiveTab && origOversightTab)
        restoreStore.setOversightActiveTab(origOversightTab);
      if (restoreStore.setWayfinderActiveTab && origWayfinderTab)
        restoreStore.setWayfinderActiveTab(origWayfinderTab);
      if (restoreStore.setKeepersActiveTab && origKeepersTab)
        restoreStore.setKeepersActiveTab(origKeepersTab);
      setView(originalView);

      await waitForNextPaint();
      await sleep(250);
      setLastSavedCount(capturedCount);
      setIsCapturing(false);

      if (capturedCount > 0) {
        notifyOS(
          t("screenshot_tour_title", "Screenshot Tour"),
          `${t("screenshot_tour_complete_toast", "Screenshot Tour Completed")} (${capturedCount})`,
          "SYSTEM"
        ).catch(() => {});
      }
    }
  };

  // Hide panel completely while capturing so it never appears in screenshots
  if (isCapturing) {
    return null;
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("screenshot_tour_title", "Screenshot Tour")}
      subtitle={t(
        "screenshot_tour_subtitle",
        "Automated Multi-Theme & Full-OS Capture"
      )}
      icon={t("icon_photo_camera", "photo_camera")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[760px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_folder_open", "folder_open")}
            tooltip={t("screenshot_tour_open_folder", "Open Folder")}
            onClick={handleOpenFolder}
          />
          <PanelHeaderButton
            icon={t("icon_timer", "timer")}
            tooltip={t("screenshot_tour_delayed_snap", "Delayed Snap (3s)")}
            onClick={handleDelayedSnapCurrentScreen}
          />
          <PanelHeaderButton
            icon={t("icon_add_a_photo", "add_a_photo")}
            tooltip={t("screenshot_tour_snap_current", "Snap Current Screen")}
            onClick={handleSnapCurrentScreen}
          />
          <PanelHeaderButton
            icon={t("icon_play_arrow", "play_arrow")}
            variant="accent"
            disabled={totalPlannedShots === 0}
            tooltip={t("screenshot_tour_run", "Run Screenshot Tour")}
            onClick={handleRunTour}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_photo_camera", "photo_camera")}
          overline={t("screenshot_tour_subtitle", "Automated Multi-Theme & Full-OS Capture")}
          title={t("screenshot_tour_title", "Screenshot Tour")}
          description={t(
            "screenshot_tour_desc",
            "Automatically step through selected themes and screens across Sanctuary OS and export lossless native PNG captures into organized folders."
          )}
          badge={`${totalPlannedShots}`}
          variant="accent"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
            <ActionButton
              variant="glass"
              icon={t("icon_add_a_photo", "add_a_photo")}
              label={t("screenshot_tour_snap_current", "Snap Current Screen")}
              onClick={handleSnapCurrentScreen}
              className="w-full justify-center"
            />
            <ActionButton
              variant="glass"
              icon={t("icon_timer", "timer")}
              label={t("screenshot_tour_delayed_snap", "Delayed Snap (3s)")}
              onClick={handleDelayedSnapCurrentScreen}
              className="w-full justify-center"
            />
            <ActionButton
              variant="primary"
              icon={t("icon_play_arrow", "play_arrow")}
              label={`${t("screenshot_tour_run", "Run Screenshot Tour")} (${totalPlannedShots})`}
              disabled={totalPlannedShots === 0}
              onClick={handleRunTour}
              className="w-full justify-center"
            />
            <ActionButton
              variant="glass"
              icon={t("icon_folder_open", "folder_open")}
              label={t("screenshot_tour_open_folder", "Open Folder")}
              onClick={handleOpenFolder}
              className="w-full justify-center"
            />
          </div>
        </SidePanelHeroCard>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
          <StatBox
            label={t("screenshot_tour_themes", "Themes to Capture")}
            value={`${selectedThemeIds.length} / ${allThemes.length}`}
            icon={t("icon_palette", "palette")}
          />
          <StatBox
            label={t("screenshot_tour_screens", "Screens & Views")}
            value={`${selectedStepIds.length + selectedSubTabIds.length}`}
            icon={t("icon_desktop_windows", "desktop_windows")}
          />
          <StatBox
            label={t("screenshot_tour_panels", "Panels & Drawers")}
            value={`${selectedPanelIds.length}`}
            icon={t("icon_side_navigation", "side_navigation")}
          />
          <StatBox
            label={t("screenshot_tour_total_shots", "Total Captures")}
            value={`${totalPlannedShots}${lastSavedCount > 0 ? ` (${lastSavedCount})` : ""}`}
            icon={t("icon_photo_library", "photo_library")}
          />
        </div>

        <div className="glass-surface rounded-2xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-wrap items-center justify-between gap-3">
          {outputDir ? (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80">
                {t("screenshot_tour_output_dir", "Output Directory")}
              </span>
              <span className="text-xs font-mono font-bold text-[var(--text)] truncate mt-0.5">
                {outputDir}
              </span>
            </div>
          ) : (
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtext)]">
              {t("screenshot_tour_settle_delay", "Render Settle Delay")}
            </span>
          )}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 glass-surface rounded-xl px-2.5 py-1 border border-[color-mix(in_srgb,var(--text)_12%,transparent)]">
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)] mr-1">
                {t("screenshot_tour_settle_delay", "Render Settle Delay")}
              </span>
              {[500, 750, 1100].map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => setSettleDelayMs(ms)}
                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-black transition-all cursor-pointer ${
                    settleDelayMs === ms
                      ? "bg-transparent border-[var(--accent)] text-[var(--accent)]"
                      : "bg-transparent border-transparent text-[var(--subtext)] hover:text-[var(--text)]"
                  }`}
                >
                  {`${ms}ms`}
                </button>
              ))}
            </div>
            {outputDir && (
              <ActionButton
                variant="glass"
                icon={t("icon_folder_open", "folder_open")}
                label={t("screenshot_tour_open_folder", "Open Folder")}
                onClick={handleOpenFolder}
              />
            )}
          </div>
        </div>

        {/* THEMES SELECTION */}
        <UniversalGroup
          title={t("screenshot_tour_themes", "Themes to Capture")}
          icon={t("icon_palette", "palette")}
          count={`${selectedThemeIds.length}`}
          actions={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedThemeIds([activeThemeId])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("screenshot_tour_current_only", "Current Only")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedThemeIds(allThemes.map((th) => th.id))}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("all", "All")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedThemeIds([])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {allThemes.map((th) => {
              const isSelected = selectedThemeIds.includes(th.id);
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => toggleTheme(th.id)}
                  className={`glass-surface rounded-xl px-3 py-2.5 border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-md border border-white/25 shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${th.bg} 45%, ${th.accent} 100%)`,
                    }}
                  />
                  <span className="text-xs font-black tracking-tight truncate flex-1">
                    {th.name}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "opacity-30"
                    }`}
                  >
                    {isSelected
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                </button>
              );
            })}
          </div>
        </UniversalGroup>

        {/* SCREENS & VIEWS SELECTION */}
        <UniversalGroup
          title={t("screenshot_tour_screens", "Screens & Views")}
          icon={t("icon_desktop_windows", "desktop_windows")}
          count={`${selectedStepIds.length}`}
          actions={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSelectedStepIds(CORE_TOUR_STEPS.map((s) => s.id))
                }
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("all", "All")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedStepIds([])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CORE_TOUR_STEPS.map((step) => {
              const isSelected = selectedStepIds.includes(step.id);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => toggleStep(step.id)}
                  className={`glass-surface rounded-xl px-3 py-2.5 border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined !text-[17px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                    }`}
                  >
                    {t(step.iconKey, step.iconFallback)}
                  </span>
                  <span className="text-xs font-black tracking-tight truncate flex-1">
                    {t(step.labelKey, step.labelFallback)}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "opacity-30"
                    }`}
                  >
                    {isSelected
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                </button>
              );
            })}
          </div>
        </UniversalGroup>

        {/* ELEVATED HUB SUBSECTIONS (ALL 43 SUB-TABS ACROSS 5 HUBS) */}
        <UniversalGroup
          title={t("screenshot_tour_hub_subsections", "Elevated Hub Subsections")}
          icon={t("icon_account_tree", "account_tree")}
          count={`${selectedSubTabIds.length} / ${HUB_SUBTAB_STEPS.length}`}
          actions={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSelectedSubTabIds(HUB_SUBTAB_STEPS.map((s) => s.id))
                }
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("all", "All")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedSubTabIds([])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-3.5">
            {HUB_GROUPS.map((hub) => {
              const hubSteps = HUB_SUBTAB_STEPS.filter(
                (s) => s.subTabKey === hub.key
              );
              const selectedInHub = hubSteps.filter((s) =>
                selectedSubTabIds.includes(s.id)
              ).length;
              const allInHubSelected =
                hubSteps.length > 0 && selectedInHub === hubSteps.length;

              return (
                <div
                  key={hub.key}
                  className="glass-surface rounded-2xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined !text-[16px] text-[var(--accent)] shrink-0">
                        {t(hub.iconKey, hub.iconFallback)}
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text)] truncate">
                        {t(hub.labelKey, hub.labelFallback)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[9px] font-black text-[var(--subtext)]">
                        {`${selectedInHub}/${hubSteps.length}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleHubSubTabs(hub.key)}
                      className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        allInHubSelected
                          ? "bg-transparent border-[var(--accent)] text-[var(--accent)]"
                          : "glass-surface border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {allInHubSelected ? t("clear", "Clear") : t("all", "All")}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {hubSteps.map((step) => {
                      const isSelected = selectedSubTabIds.includes(step.id);
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => toggleSubTab(step.id)}
                          className={`glass-surface rounded-xl px-2.5 py-2 border text-left flex items-center gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? "border-[var(--accent)] text-[var(--text)]"
                              : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-70 hover:opacity-100"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[15px] shrink-0 ${
                              isSelected
                                ? "text-[var(--accent)]"
                                : "text-[var(--subtext)]"
                            }`}
                          >
                            {t(step.iconKey, step.iconFallback)}
                          </span>
                          <span className="text-[11px] font-black tracking-tight truncate flex-1">
                            {t(step.labelKey, step.labelFallback)}
                          </span>
                          <span
                            className={`material-symbols-outlined !text-[15px] shrink-0 ${
                              isSelected ? "text-[var(--accent)]" : "opacity-30"
                            }`}
                          >
                            {isSelected
                              ? t("icon_check_circle", "check_circle")
                              : t(
                                  "icon_radio_button_unchecked",
                                  "radio_button_unchecked"
                                )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </UniversalGroup>

        {/* PANELS & DRAWERS SELECTION */}
        <UniversalGroup
          title={t("screenshot_tour_panels", "Panels & Drawers")}
          icon={t("icon_side_navigation", "side_navigation")}
          count={`${selectedPanelIds.length} / ${PANEL_TOUR_STEPS.length}`}
          actions={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setSelectedPanelIds(PANEL_TOUR_STEPS.map((s) => s.id))
                }
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("all", "All")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPanelIds([])}
                className="px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-[10px] font-black uppercase tracking-wider text-[var(--subtext)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {t("clear", "Clear")}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PANEL_TOUR_STEPS.map((step) => {
              const isSelected = selectedPanelIds.includes(step.id);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => togglePanel(step.id)}
                  className={`glass-surface rounded-xl px-3 py-2.5 border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] opacity-70 hover:opacity-100"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined !text-[17px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "text-[var(--subtext)]"
                    }`}
                  >
                    {t(step.iconKey, step.iconFallback)}
                  </span>
                  <span className="text-xs font-black tracking-tight truncate flex-1">
                    {t(step.labelKey, step.labelFallback)}
                  </span>
                  <span
                    className={`material-symbols-outlined !text-[16px] shrink-0 ${
                      isSelected ? "text-[var(--accent)]" : "opacity-30"
                    }`}
                  >
                    {isSelected
                      ? t("icon_check_circle", "check_circle")
                      : t("icon_radio_button_unchecked", "radio_button_unchecked")}
                  </span>
                </button>
              );
            })}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}

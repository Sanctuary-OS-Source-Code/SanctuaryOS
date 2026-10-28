import React, { useEffect, useState } from "react";
import { useLexicon } from "../LexiconContext";
import {
  SidePanel,
  SidePanelHeroCard,
  DashboardStatTile,
  UniversalGroup,
  ActionButton,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "../shared";

export type StudioGuideMode = "schema" | "lexicon";

interface SchemaLexiconGuideSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: StudioGuideMode;
}

type SchemaGuideTab = "identity_paths" | "routing_ext" | "load_lab" | "rules_capsule";
type LexiconGuideTab = "tokens" | "fields" | "tools" | "cheatsheet";

interface FieldDocItem {
  label: string;
  jsonKey: string;
  desc: string;
  example?: string;
}

function FieldReferenceGrid({ items }: { items: FieldDocItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
      {items.map((item, idx) => (
        <div
          key={`${item.jsonKey}-${idx}`}
          className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col justify-between gap-2 min-w-0"
        >
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
              <span className="text-xs font-black text-[var(--text)] tracking-wide">
                {item.label}
              </span>
              <span className={`${VAULT_CHIP_CLASS} font-mono !text-[10px]`}>
                {item.jsonKey}
              </span>
            </div>
            <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed">
              {item.desc}
            </p>
          </div>
          {item.example && (
            <div className="glass-panel rounded-xl px-3 py-1.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[10px] font-mono font-bold text-[var(--accent)] truncate">
              {item.example}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const GLOSSARY_TOKEN_REFERENCE: Array<{
  token: string;
  keyId: string;
  casingHint: string;
  standard: string;
  sanctuary: string;
  sims: string;
}> = [
  { token: "{Mod} / {Mods}", keyId: "term_mod / term_mods", casingHint: "{mod}, {MOD}", standard: "Mod / Mods", sanctuary: "Artifact / Artifacts", sims: "Mod / Mods" },
  { token: "{Vault}", keyId: "term_vault", casingHint: "{vault}, {VAULT}", standard: "Library", sanctuary: "Vault", sims: "Mod Library" },
  { token: "{Blueprint} / {Blueprints}", keyId: "term_blueprint / term_blueprints", casingHint: "{blueprint}", standard: "Play Set / Play Sets", sanctuary: "Blueprint / Blueprints", sims: "Play Set / Play Sets" },
  { token: "{Mason} / {Masons}", keyId: "term_mason / term_masons", casingHint: "{mason}", standard: "Creator / Creators", sanctuary: "Mason / Masons", sims: "CC Creator / Creators" },
  { token: "{Citizen} / {Citizens}", keyId: "term_citizen / term_citizens", casingHint: "{citizen}", standard: "Player / Players", sanctuary: "Citizen / Citizens", sims: "Simmer / Simmers" },
  { token: "{Backups}", keyId: "term_backups", casingHint: "{backups}", standard: "Backups", sanctuary: "Time Capsule", sims: "Save Backups" },
  { token: "{Lab}", keyId: "term_lab", casingHint: "{lab}", standard: "Sandbox", sanctuary: "Homestead", sims: "Mod Sandbox" },
  { token: "{Settings}", keyId: "term_settings", casingHint: "{settings}", standard: "Settings", sanctuary: "System Preferences", sims: "Settings" },
  { token: "{Nexus}", keyId: "term_nexus", casingHint: "{nexus}", standard: "Catalog", sanctuary: "The Nexus", sims: "Mod Catalog" },
  { token: "{Chameleon} / {Chameleons}", keyId: "term_chameleon / term_chameleons", casingHint: "{chameleon}", standard: "Theme / Themes", sanctuary: "Chameleon / Chameleons", sims: "Theme / Themes" },
  { token: "{Lexicon} / {Lexicons}", keyId: "term_lexicon / term_lexicons", casingHint: "{lexicon}", standard: "Language Pack / Packs", sanctuary: "Lexicon / Lexicons", sims: "Word Pack / Packs" },
  { token: "{Dispatch} / {Dispatches}", keyId: "term_dispatch / term_dispatches", casingHint: "{dispatch}", standard: "Broadcast / Broadcasts", sanctuary: "Dispatch / Dispatches", sims: "News Post / Posts" },
  { token: "{Delete}", keyId: "term_delete", casingHint: "{delete}", standard: "Delete", sanctuary: "Purge", sims: "Delete" },
  { token: "{Remove}", keyId: "term_remove", casingHint: "{remove}", standard: "Remove", sanctuary: "Yeet", sims: "Remove" },
];

export const SchemaLexiconGuideSidePanel: React.FC<SchemaLexiconGuideSidePanelProps> = ({
  isOpen,
  onClose,
  initialMode = "schema",
}) => {
  const { t } = useLexicon();
  const [mode, setMode] = useState<StudioGuideMode>(initialMode);
  const [schemaTab, setSchemaTab] = useState<SchemaGuideTab>("identity_paths");
  const [lexiconTab, setLexiconTab] = useState<LexiconGuideTab>("tokens");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isSchema = mode === "schema";

  // ===========================================================================
  // MASTER SCHEMA FIELD DICTIONARIES (MATCHING ALL 4 STUDIO TABS)
  // ===========================================================================
  const schemaIdentityFields: FieldDocItem[] = [
    {
      label: t("schema_studio_id", "Schema ID"),
      jsonKey: "id",
      desc: t(
        "schema_doc_id_desc",
        "Unique identifier for this schema profile used internally by Sanctuary OS."
      ),
      example: '"id": "sims4"',
    },
    {
      label: t("schema_studio_game_id", "Game Identifier / Engine ID"),
      jsonKey: "game_id",
      desc: t(
        "schema_doc_game_id_desc",
        "Database and Spoke identifier linking this schema to community registries and cloud profiles."
      ),
      example: '"game_id": "the-sims-4"',
    },
    {
      label: t("schema_studio_display_name", "Display Title"),
      jsonKey: "display_name / name",
      desc: t(
        "schema_doc_display_name_desc",
        "Human-readable game title shown in workspace headers, cards, and launch banners."
      ),
      example: '"display_name": "The Sims 4"',
    },
    {
      label: t("schema_studio_default_lexicon", "Default {Lexicon} Pack"),
      jsonKey: "default_lexicon",
      desc: t(
        "schema_doc_default_lex_desc",
        "Vocabulary pack loaded automatically when this game workspace activates."
      ),
      example: '"default_lexicon": "en-default"',
    },
    {
      label: t("schema_studio_version", "Schema Version"),
      jsonKey: "schema_version",
      desc: t(
        "schema_doc_version_desc",
        "Integer revision number. Incrementing this prompts connected Spoke clients to sync the updated schema."
      ),
      example: '"schema_version": 10',
    },
    {
      label: t("schema_studio_min_scout", "Min Scout Submissions"),
      jsonKey: "min_scout_submissions",
      desc: t(
        "schema_doc_min_scout_desc",
        "Number of crowd-sourced {Citizen} Scout reports required before an unverified {Mod} is promoted."
      ),
      example: '"min_scout_submissions": 5',
    },
  ];

  const schemaPathsFields: FieldDocItem[] = [
    {
      label: t("schema_studio_exe_list", "Game Executable Binaries"),
      jsonKey: "executable_names",
      desc: t(
        "schema_doc_exe_list_desc",
        "All valid Windows (.exe) and macOS (.app) binary names Sanctuary OS scans for and launches."
      ),
      example: '["TS4_x64.exe", "TS4_DX9_x64.exe", "The Sims 4.app"]',
    },
    {
      label: t("schema_studio_exe_subdir", "Executable Subfolder"),
      jsonKey: "paths.executable_subdir",
      desc: t(
        "schema_doc_exe_subdir_desc",
        "Subfolder inside the game installation root where the binary lives. Leave blank if the binary sits in the root folder."
      ),
      example: '"executable_subdir": "Game/Bin" | "bin/x64"',
    },
    {
      label: t("schema_studio_manifest_file", "Engine Manifest File"),
      jsonKey: "paths.manifest_file",
      desc: t(
        "schema_doc_manifest_file_desc",
        "Optional resource or plugin manifest file generated inside the {Mods} or user data directory."
      ),
      example: '"manifest_file": "Resource.cfg" | "plugins.txt"',
    },
    {
      label: t("schema_studio_win_mod_dir", "Default Windows {Mods} Directory"),
      jsonKey: "paths.default_mod_dir_windows",
      desc: t(
        "schema_doc_win_mod_dir_desc",
        "Default path where {Mods} are deployed on Windows (relative to Documents, user profile, or game root)."
      ),
      example: '"Documents/Electronic Arts/The Sims 4/Mods"',
    },
    {
      label: t("schema_studio_mac_mod_dir", "Default MacOS {Mods} Directory"),
      jsonKey: "paths.default_mod_dir_mac",
      desc: t(
        "schema_doc_mac_mod_dir_desc",
        "Default path where {Mods} are deployed on macOS."
      ),
      example: '"Documents/Electronic Arts/The Sims 4/Mods"',
    },
    {
      label: t("schema_studio_win_user_dir", "Windows Telemetry & Saves Root"),
      jsonKey: "paths.user_data_dir_windows",
      desc: t(
        "schema_doc_win_user_dir_desc",
        "Windows directory containing saves, crash logs, and user settings. Supports %USERPROFILE%, %LOCALAPPDATA%, and %APPDATA%."
      ),
      example: '"%USERPROFILE%/Documents/Electronic Arts/The Sims 4"',
    },
    {
      label: t("schema_studio_mac_user_dir", "MacOS Telemetry & Saves Root"),
      jsonKey: "paths.user_data_dir_mac",
      desc: t(
        "schema_doc_mac_user_dir_desc",
        "macOS directory containing saves, crash logs, and user settings. Supports ~/Documents and ~/Library/Application Support."
      ),
      example: '"~/Documents/Electronic Arts/The Sims 4"',
    },
    {
      label: t("schema_studio_win_scan_paths", "Windows & MacOS Auto-Recon Paths"),
      jsonKey: "paths.auto_scan_paths_*",
      desc: t(
        "schema_doc_scan_paths_desc",
        "Default Steam, EA App, Origin, Epic, GOG, and macOS /Applications paths checked automatically during workspace setup."
      ),
      example: '"/Applications/The Sims 4.app", "C:\\Program Files\\EA Games\\..."',
    },
  ];

  const schemaSafeguardsVersionFields: FieldDocItem[] = [
    {
      label: t("schema_studio_shared_vanilla", "Shared Vanilla Directory"),
      jsonKey: "constraints.shared_vanilla_dir",
      desc: t(
        "schema_guide_safe_shared_desc",
        "Enable when {Mods} deploy directly into a folder that already contains vanilla game files (such as GTA V root or Game/Bin). Sanctuary OS tracks deployed links in .sanctuary_deployed_links.json and never deletes vanilla files."
      ),
      example: "true (GTA V / root folders) • false (dedicated Mods folder)",
    },
    {
      label: t("schema_studio_preserve_structure", "Preserve Archive Subfolders"),
      jsonKey: "constraints.preserve_archive_structure",
      desc: t(
        "schema_guide_safe_preserve_desc",
        "Keep internal folder hierarchies intact when importing multi-folder archives (required for Cyberpunk 2077 archive/pc/mod, Skyrim Data/, and Stardew Valley SMAPI {Mods})."
      ),
      example: "true (Cyberpunk / Skyrim / SMAPI) • false (Sims 4)",
    },
    {
      label: t("schema_studio_wrap_subfolder", "Wrap Loose Files in Subfolders"),
      jsonKey: "constraints.wrap_in_subfolder",
      desc: t(
        "schema_guide_safe_wrap_desc",
        "Automatically wraps loose package/script files inside a clean named subfolder inside your {Vault} and {Mods} directory."
      ),
      example: '"wrap_in_subfolder": true',
    },
    {
      label: t("schema_studio_script_depth", "Script & Package Max Depth"),
      jsonKey: "constraints.script_max_depth / package_max_depth",
      desc: t(
        "schema_doc_depth_desc",
        "Maximum subfolder recursion depth the engine can read for script archives (e.g. 1 folder deep for .ts4script) vs. regular packages (5 folders deep)."
      ),
      example: '"script_max_depth": 1, "package_max_depth": 5',
    },
    {
      label: t("schema_studio_ver_file", "Version File & Extraction Regex"),
      jsonKey: "version_detection.version_file_rel_path",
      desc: t(
        "schema_doc_ver_file_desc",
        "Relative path to the file storing the installed game patch string and the regex pattern used to extract it, with Windows Registry and macOS Plist fallbacks."
      ),
      example: '"GameVersion.txt" • "(\\d+\\.\\d+\\.\\d+\\.\\d+)"',
    },
    {
      label: t("schema_studio_dlc_subdirs", "DLC Subdirectories, Regex & Launch Mask"),
      jsonKey: "dlc_detection.*",
      desc: t(
        "schema_doc_dlc_desc",
        "Subfolders and folder regex used to detect installed DLC packs on Windows/macOS, plus the command-line template for disabling packs during {Lab} testing."
      ),
      example: '"^(EP|GP|SP|FP|KP)\\d{2}$" • "-disablepacks:{packs}"',
    },
  ];

  const schemaExtensionsFields: FieldDocItem[] = [
    {
      label: t("schema_studio_ext_supported", "Supported Engine Extensions"),
      jsonKey: "extensions.supported",
      desc: t(
        "schema_doc_ext_supported_desc",
        "All deployable {Mod} extensions that Sanctuary OS links into the live game folders during ignition."
      ),
      example: '[".package", ".ts4script", ".world", ".cfg", ".ini"]',
    },
    {
      label: t("schema_studio_ext_vault", "{Vault} Visible Extensions"),
      jsonKey: "extensions.vault_visible",
      desc: t(
        "schema_doc_ext_vault_desc",
        "All file extensions shown inside the {Vault} browser, including supported {Mod} files plus .zip, .rar, and .7z archives."
      ),
      example: '[".package", ".ts4script", ".zip", ".rar", ".7z"]',
    },
    {
      label: t("schema_studio_ext_primary", "Primary Package Extensions"),
      jsonKey: "extensions.primary_package",
      desc: t(
        "schema_doc_ext_primary_desc",
        "Binary package formats indexed by the Conflict Radar for resource and tuning collisions."
      ),
      example: '[".package", ".archive", ".pak", ".rpf"]',
    },
    {
      label: t("schema_studio_ext_script", "Script / Executable {Mod} Extensions"),
      jsonKey: "extensions.script_Archive",
      desc: t(
        "schema_doc_ext_script_desc",
        "Executable or script formats governed by Script Max Depth and deep heuristic malware scanning."
      ),
      example: '[".ts4script", ".asi", ".dll", ".lua", ".pyc"]',
    },
    {
      label: t("schema_studio_ext_config", "Editable Directive Extensions"),
      jsonKey: "extensions.config_extensions",
      desc: t(
        "schema_guide_ext_config_desc",
        "Extensions listed here (.cfg, .ini, .json, .toml, .yaml) are monitored by the Dynamic Config Watcher. When a {Mod} generates or updates a settings file in the live game folder, Sanctuary OS syncs it back into the {Mod}'s {Vault} folder and deduplicates root stray copies."
      ),
      example: '[".cfg", ".ini", ".json", ".toml", ".yaml"]',
    },
    {
      label: t("schema_studio_ext_ignore", "Bypass Unidentified Extensions"),
      jsonKey: "extensions.ignore_unidentified",
      desc: t(
        "schema_doc_ext_ignore_desc",
        "Harmless companion or documentation files ignored by the Unidentified File scanner."
      ),
      example: '[".txt", ".md", ".log", ".xml", ".dat"]',
    },
    {
      label: t("schema_studio_cache_files", "Volatile Engine Cache Targets"),
      jsonKey: "extensions.cache_files",
      desc: t(
        "schema_doc_cache_files_desc",
        "Engine cache files automatically purged when switching {Blueprints} or {Mods} so stale data never persists."
      ),
      example: '["localthumbcache.package", "avatarcache.package"]',
    },
    {
      label: t("schema_studio_binary_parsers", "Binary Extension Parsers & Badges"),
      jsonKey: "extensions.binary_parsers / badge_labels",
      desc: t(
        "schema_doc_parsers_desc",
        "Maps file extensions to native Rust binary parsers (dbpf, ts4script, rage_rpf) and UI card badge labels (PACKAGE, SCRIPT, CONFIG)."
      ),
      example: '".package": "dbpf" • ".package": "PACKAGE"',
    },
  ];

  const schemaInstallRouteFields: FieldDocItem[] = [
    {
      label: t("schema_studio_route_id", "Route ID & Route Label"),
      jsonKey: "install_routes[].id / label",
      desc: t(
        "schema_doc_route_id_desc",
        "Unique identifier and display label for a custom deployment rule that routes specific file types outside the main {Mods} folder."
      ),
      example: '"id": "worlds", "label": "Custom Worlds (.world)"',
    },
    {
      label: t("schema_studio_route_target", "Target Root & Relative Destination Path"),
      jsonKey: "target_root / relative_path",
      desc: t(
        "schema_doc_route_target_desc",
        "Selects the base root (game_dir / live_path, user_data_dir, or mod_dir) and the exact subfolder where matching files deploy."
      ),
      example: '"target_root": "game_dir", "relative_path": "Data/Shared/Worlds/Areas"',
    },
    {
      label: t("schema_studio_route_exts", "Matched Extensions & Max Depth"),
      jsonKey: "extensions / max_depth",
      desc: t(
        "schema_doc_route_exts_desc",
        "File extensions routed by this rule (.world, .asi, .dll) and the maximum subfolder recursion allowed at the destination (0 = flat)."
      ),
      example: '"extensions": [".world"], "max_depth": 0',
    },
    {
      label: t("schema_studio_route_flatten", "Flatten Subfolders & Shared With Vanilla"),
      jsonKey: "flatten / shared_with_vanilla",
      desc: t(
        "schema_doc_route_flags_desc",
        "Flatten strips nested archive folders on deploy; Shared With Vanilla tracks links in .sanctuary_deployed_links.json so vanilla files in that destination folder are never deleted."
      ),
      example: '"flatten": true, "shared_with_vanilla": true',
    },
  ];

  const schemaLoadOrderFields: FieldDocItem[] = [
    {
      label: t("schema_studio_lo_strategy", "Load Order Strategy"),
      jsonKey: "load_order.strategy",
      desc: t(
        "schema_guide_lo_desc",
        "Choose Folder Priority (alphabetical tier folders like ZZ_Overrides), Numeric Prefix ({index:03}_ prepended to links), Manifest List (generates Resource.cfg, plugins.txt, or modsettings.lsx), or Modified Timestamp Order."
      ),
      example: '"folder_priority" | "manifest_list" | "numeric_prefix" | "timestamp"',
    },
    {
      label: t("schema_studio_lo_prefix_fmt", "Numeric Prefix & Manifest Line Templates"),
      jsonKey: "prefix_format / manifest_line_template",
      desc: t(
        "schema_doc_lo_templates_desc",
        "Formatting patterns used when Strategy is set to Numeric Prefix ({index:03}_) or Manifest List (*{filename})."
      ),
      example: '"{index:03}_" • "*{filename}"',
    },
    {
      label: t("schema_studio_manifest_content", "Manifest Header Template"),
      jsonKey: "paths.manifest_content_template",
      desc: t(
        "schema_doc_manifest_header_desc",
        "Complete Resource.cfg or manifest file content written when compiling Folder Priority override tiers."
      ),
      example: '"Priority 500\\nPackedFile *.package\\nPackedFile *\\*.package..."',
    },
    {
      label: t("schema_studio_sec_tiers", "Priority Tiers (ID, Label, Folder Prefix, Weight)"),
      jsonKey: "priority_tiers[]",
      desc: t(
        "schema_doc_tiers_desc",
        "Defines the load order tiers available to {Citizens}. Higher Priority Weight tiers win resource conflicts over lower tiers."
      ),
      example: 'Tier 0 (Standard, 500) → Tier 3 (Sanctuary3, 800)',
    },
    {
      label: t("schema_studio_lab_stabilize_sec", "{Lab} Boot Stabilization & RAM Steps"),
      jsonKey: "lab_verification.*",
      desc: t(
        "schema_doc_lab_ram_desc",
        "Seconds the game must run steadily before {Lab} marks boot stable, plus Min RAM Step (%) and Warm Cache RAM Step (%) thresholds."
      ),
      example: '"boot_stabilization_seconds": 12, "min_ram_step_percent": 20',
    },
    {
      label: t("schema_studio_lab_save_exts", "{Lab} Save File Extensions"),
      jsonKey: "lab_verification.save_extensions",
      desc: t(
        "schema_doc_lab_saves_desc",
        "Save file extensions monitored during {Lab} verification runs."
      ),
      example: '[".save", ".ver0", ".ver1"]',
    },
  ];

  const schemaLogsBackupsFields: FieldDocItem[] = [
    {
      label: t("schema_studio_sec_log_matchers", "Exception Log Matchers (Rule Type)"),
      jsonKey: "exception_logs[]",
      desc: t(
        "schema_guide_logs_matcher_desc",
        "Use Prefix + Extension (e.g. Starts With: lastexception, Ends With: .txt) to catch timestamped crash logs, or switch the Rule Type dropdown to Exact Filename (e.g. ScriptHookV.log, red4ext.log) for fixed log files."
      ),
      example: 'Starts With: "lastexception" + Ends With: ".txt" | Exact: "lastCrash.txt"',
    },
    {
      label: t("schema_studio_sec_exc_rules", "Exception Rules (ID, File Hint & Threat Level)"),
      jsonKey: "exception_rules[].id / file_hint / severity",
      desc: t(
        "schema_doc_exc_meta_desc",
        "Unique rule ID, target log filename hint, and severity badge (Critical, Warning, or Info) displayed when a log matches."
      ),
      example: '"id": "ts4_python_attr", "severity": "critical"',
    },
    {
      label: t("schema_doc_exc_kw_title", "Pipe-Separated Keywords, Analysis & Countermeasure"),
      jsonKey: "keywords / explanation / recommendation",
      desc: t(
        "schema_guide_logs_rules_desc",
        "Each rule scans matched logs for Pipe-Separated Keywords (e.g. AttributeError | ImportError), assigns a Threat Level (Critical, Warning, Info), and surfaces a human-readable Diagnostic Analysis and Countermeasure Protocol."
      ),
      example: '"AttributeError | ModuleNotFoundError | ImportError"',
    },
    {
      label: t("schema_studio_tc_world_targets", "World State {Backups} Targets"),
      jsonKey: "time_capsule.world_state_targets",
      desc: t(
        "schema_doc_tc_world_desc",
        "User data folders and settings files (relative to user_data_dir) archived during World State {Backups} snapshots."
      ),
      example: '["saves", "Tray", "Options.ini", "UserSetting.ini"]',
    },
    {
      label: t("schema_studio_tc_engine_targets", "Engine State {Backups} Targets"),
      jsonKey: "time_capsule.engine_state_targets",
      desc: t(
        "schema_doc_tc_engine_desc",
        "Core game binary folders (relative to the game installation root) archived during Engine State {Backups} snapshots."
      ),
      example: '["Game", "Data"]',
    },
    {
      label: t("schema_studio_sec_airgap", "{Lab} Save Airgap Targets"),
      jsonKey: "save_airgap_targets",
      desc: t(
        "schema_guide_backups_airgap_desc",
        "Folders listed in Save Airgap Targets are automatically snapshotted before a {Lab} sandbox test begins and restored the moment verification finishes, guaranteeing zero save corruption during {Mod} testing."
      ),
      example: '["saves", "Tray"]',
    },
  ];

  // ===========================================================================
  // LEXICON STUDIO FIELD DICTIONARIES (MATCHING ALL 4 LEXICON STUDIO TABS)
  // ===========================================================================
  const lexiconCoreTabFields: FieldDocItem[] = [
    {
      label: t("lex_studio_load_preset_dropdown", "Apply Terms From {Lexicon}..."),
      jsonKey: "Header Preset Selector",
      desc: t(
        "lex_doc_preset_dropdown_desc",
        "1-click dropdown in the top header that populates all 21 Core {Glossary} Terms from Standard English, Sanctuary Sci-Fi, Sims Friendly, or any installed community {Lexicon}."
      ),
      example: "Standard (Mod) • Sanctuary (Artifact) • Sims (CC / Mod)",
    },
    {
      label: t("lex_studio_group_assets", "Core Assets & Locations (6 Fields)"),
      jsonKey: "term_mod / term_vault / term_blueprint / term_nexus",
      desc: t(
        "lex_doc_group_assets_desc",
        "Controls the global nouns for singular/plural {Mod}/{Mods}, {Vault} (Library), singular/plural {Blueprint}/{Blueprints} (Play Sets), and {Nexus} (Catalog)."
      ),
      example: '"{Mod}" → "Artifact", "{Vault}" → "Vault"',
    },
    {
      label: t("lex_studio_group_roles", "Community Roles & Broadcasts (6 Fields)"),
      jsonKey: "term_citizen / term_mason / term_dispatch",
      desc: t(
        "lex_doc_group_roles_desc",
        "Controls the singular/plural nouns for {Citizen}/{Citizens} (Players), {Mason}/{Masons} (Creators), and {Dispatch}/{Dispatches} (News Broadcasts)."
      ),
      example: '"{Citizen}" → "Simmer", "{Mason}" → "CC Creator"',
    },
    {
      label: t("lex_studio_group_system", "System Modules, Themes & Actions (9 Fields)"),
      jsonKey: "term_lab / term_backups / term_chameleon / term_lexicon / term_delete / term_remove",
      desc: t(
        "lex_doc_group_system_desc",
        "Controls the nouns for {Lab} (Sandbox), {Backups} (Time Capsule), {Settings}, {Chameleon}/{Chameleons} (Themes), {Lexicon}/{Lexicons}, {Delete} (Purge), and {Remove} (Yeet)."
      ),
      example: '"{Backups}" → "Time Capsule", "{Remove}" → "Yeet"',
    },
    {
      label: t("lexicon_guide_t2_title", "Automatic Casing & Indefinite Article Grammar"),
      jsonKey: "{Mod} / {mod} / {MOD}",
      desc: t(
        "lexicon_guide_t2_desc",
        "The {Lexicon} Engine automatically respects token casing: {Mod} renders Title Case (\"Artifact\"), {mod} renders lowercase (\"artifact\"), and {MOD} renders UPPERCASE (\"ARTIFACT\"). It even fixes English articles automatically (\"a {mod}\" → \"an Artifact\")."
      ),
      example: '"Select a {mod}" → "Select an Artifact"',
    },
    {
      label: t("lex_doc_core_reset_title", "Token Chip & Per-Term Reset Button"),
      jsonKey: "{Token} + restart_alt",
      desc: t(
        "lex_doc_core_reset_desc",
        "Each Core Term card shows its exact token syntax ({Mod}) in the top-right corner and displays a Reset icon button whenever the term differs from the baseline pack."
      ),
      example: "{Mod} • Click Reset to restore baseline noun",
    },
  ];

  const lexiconModuleFieldAnatomy: FieldDocItem[] = [
    {
      label: t("lex_doc_field_header_title", "Humanized Field Label & Raw JSON Key"),
      jsonKey: "Label + key_id",
      desc: t(
        "lex_doc_field_header_desc",
        "The top-left of every string card displays a readable label alongside the exact JSON key in monospace font so you can search by either name."
      ),
      example: "Asset Desc  asset_desc",
    },
    {
      label: t("lex_doc_field_placeholder_title", "Baseline Fallback Placeholder"),
      jsonKey: "en-default.json Baseline",
      desc: t(
        "lexicon_guide_parity_fallback_desc",
        "Every {Lexicon} pack inherits automatically from en-default.json. If a key is left blank or missing in your custom pack, Sanctuary OS seamlessly falls back to the standard English baseline — and still interpolates your custom Core {Glossary} Terms into that fallback string!"
      ),
      example: "Blank input = Uses en-default.json automatically",
    },
    {
      label: t("lexicon_guide_t3_title", "Live Interpolation Readout (→ ...)"),
      jsonKey: "→ Live Preview",
      desc: t(
        "lexicon_guide_t3_desc",
        "Whenever a string contains a {Glossary} token such as {Vault} or {Blueprint}, the Visual Studio displays a live cyan/emerald preview badge (→ ...) underneath the input field showing how the final sentence will read with your current Core Terms."
      ),
      example: '"No {blueprints} available" → "No modpacks available"',
    },
    {
      label: t("lex_doc_field_actions_title", "Sanctuary Preset Chip & Reset Chip"),
      jsonKey: "Sanctuary / Reset",
      desc: t(
        "lex_doc_field_actions_desc",
        "Click the Sanctuary chip on any field card to load the sci-fi phrasing from en-sanctuary.json for that single line, or click Reset on any customized field to revert it to default."
      ),
      example: "1-click per-field Sanctuary phrasing or Reset",
    },
    {
      label: t("lex_doc_search_filter_title", "Search Bar & Customized Filter Toggle"),
      jsonKey: "Search + Customized",
      desc: t(
        "lex_doc_search_filter_desc",
        "Filter all 1,700+ OS strings in real time by key ID, English text, or translated text, or toggle Customized to view only the strings you have modified."
      ),
      example: "Section badge shows Customized / Total (e.g. 4 / 26)",
    },
    {
      label: t("lexicon_guide_parity_brand_title", "Protected Brand Identity Keys"),
      jsonKey: "Keepers Core → Title Area",
      desc: t(
        "lexicon_guide_parity_brand_desc",
        "To prevent language packs from accidentally overwriting your OS branding, the 3 core brand identity keys (Two-Tone OS Title, Rotating Subtitles, and OS Logo) are managed exclusively in Keepers Core → Core Aesthetics → Title Area."
      ),
      example: "brand_title_primary • brand_subtitles_list • icon_logo",
    },
  ];

  const lexiconToolsTabFields: FieldDocItem[] = [
    {
      label: t("lex_studio_meta_btn", "Pack Metadata (Name, Language, Author, Version)"),
      jsonKey: "_meta_name / _meta_lang / _meta_author / _meta_version",
      desc: t(
        "lex_doc_meta_desc",
        "Defines your {Lexicon} pack's display title, ISO language code (e.g. en, es, fr, de), creator attribution, and version number shown in {Nexus} and {Settings}."
      ),
      example: '"_meta_name": "English: Sanctuary", "_meta_lang": "en"',
    },
    {
      label: t("lex_studio_batch_btn", "Batch Find & Replace (Whole Word & Match Case)"),
      jsonKey: "Find / Replace / Toggles",
      desc: t(
        "lex_doc_batch_desc",
        "Search for any word or phrase across all 1,700+ strings and replace every occurrence in one click. Toggle Whole Word or Match Case using the Liquid Glass switches, and preview the exact match count on the Replace (N) button before applying."
      ),
      example: 'Find: "Player" → Replace: "{Citizen}"',
    },
    {
      label: t("lex_studio_icon_builder_title", "Guided OS Icon Override Builder"),
      jsonKey: "icon_<glyph> → replacement",
      desc: t(
        "lex_doc_icon_builder_desc",
        "No need to guess icon keys: 1) Pick any OS icon from the 'Select OS Icon to Override' dropdown, 2) Click 'Choose Replacement Icon' to open the visual Material Symbol picker, and 3) Click Apply."
      ),
      example: '"icon_delete": "delete_forever"',
    },
    {
      label: t("lex_doc_icon_browser_title", "Category Icon Browser & Custom Text Keys"),
      jsonKey: "Category Filter + Custom Key ID",
      desc: t(
        "lex_doc_icon_browser_desc",
        "Browse OS icons by category (Core OS, UI Navigation, Files & Storage, etc.) or filter by name, click Edit on any card to swap its glyph visually, or add custom text keys at the bottom."
      ),
      example: "Filter by 'shield' or 'folder' → Click Edit",
    },
  ];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        isSchema
          ? t("schema_guide_title", "Master Schema Studio Guide")
          : t("lexicon_guide_title", "{Lexicon} & Terminology Studio Guide")
      }
      subtitle={
        isSchema
          ? t("schema_guide_subtitle", "Multi-Game Engine Blueprint & Field-by-Field Reference")
          : t("lexicon_guide_subtitle", "Dynamic {Glossary} Tokens, Field Reference & Pack Authoring")
      }
      icon={t(isSchema ? "icon_schema" : "icon_translate", isSchema ? "schema" : "translate")}
      widthClass="w-[92vw] max-w-[1040px]"
      backdropZ="z-[70000]"
      panelZ="z-[70001]"
      headerActions={
        <div className="flex items-center gap-1">
          <PanelHeaderButton
            icon={t("icon_data_object", "data_object")}
            onClick={() => setMode("schema")}
            isActive={isSchema}
            tooltip={t("schema_guide_btn", "Schema Guide")}
          />
          <PanelHeaderButton
            icon={t("icon_translate", "translate")}
            onClick={() => setMode("lexicon")}
            isActive={!isSchema}
            tooltip={t("lexicon_guide_btn", "{Lexicon} Guide")}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-10">
        {/* Hero Card */}
        <SidePanelHeroCard
          icon={t(isSchema ? "icon_hub" : "icon_auto_awesome", isSchema ? "hub" : "auto_awesome")}
          overline={
            isSchema
              ? t("schema_guide_title", "Master Schema Studio Guide")
              : t("lexicon_guide_title", "{Lexicon} & Terminology Studio Guide")
          }
          title={
            isSchema
              ? t("schema_guide_hero_title", "100% Game-Agnostic Engine Architecture")
              : t("lexicon_guide_hero_title", "Total OS Vocabulary & Thematic Transformation")
          }
          description={
            isSchema
              ? t(
                  "schema_guide_hero_desc",
                  "Complete field-by-field reference for every setting across all 4 Master Schema Studio tabs — covering Windows & macOS paths, Vanilla Isolation safeguards, Dynamic Config Watcher extensions, custom Install Routes, Load Order compilation, and Homestead Save Airgap."
                )
              : t(
                  "lexicon_guide_hero_desc",
                  "Complete field-by-field reference for the {Lexicon} Visual Studio — covering the 21 Core {Glossary} Terms, OS Module field cards, automatic en-default.json fallback, Batch Find & Replace, and the Guided OS Icon Override Builder."
                )
          }
          badge={
            isSchema
              ? t("schema_guide_tab_paths_val", "Win & Mac")
              : t("lexicon_guide_tab_tokens_val", "21 Tokens")
          }
          badgeIcon={t(isSchema ? "icon_devices" : "icon_auto_awesome", isSchema ? "devices" : "auto_awesome")}
          variant={isSchema ? "accent" : "success"}
        />

        {/* 4-Tile Navigation Grid (Matches the exact 4 tabs of each Studio) */}
        {isSchema ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_badge", "badge")}
              label={t("schema_studio_tab_identity", "Identity & Paths")}
              value={`20 ${t("fields", "Fields")}`}
              isActive={schemaTab === "identity_paths"}
              onClick={() => setSchemaTab("identity_paths")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_alt_route", "alt_route")}
              label={t("schema_studio_tab_routes", "Extensions & Routes")}
              value={`12 ${t("fields", "Fields")}`}
              isActive={schemaTab === "routing_ext"}
              onClick={() => setSchemaTab("routing_ext")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_low_priority", "low_priority")}
              label={t("schema_studio_tab_load_order", "Load Order & Tiers")}
              value={`06 ${t("fields", "Fields")}`}
              isActive={schemaTab === "load_lab"}
              onClick={() => setSchemaTab("load_lab")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_history", "history")}
              label={t("schema_studio_tab_logs_backups", "Logs & {Backups}")}
              value={`06 ${t("fields", "Fields")}`}
              isActive={schemaTab === "rules_capsule"}
              onClick={() => setSchemaTab("rules_capsule")}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_auto_awesome", "auto_awesome")}
              label={t("lex_studio_cat_glossary", "Core Terms")}
              value={t("lexicon_guide_tab_tokens_val", "21 Tokens")}
              isActive={lexiconTab === "tokens"}
              onClick={() => setLexiconTab("tokens")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_dashboard", "dashboard")}
              label={t("lex_studio_tab_modules", "OS Modules")}
              value={`06 ${t("fields", "Fields")}`}
              isActive={lexiconTab === "fields"}
              onClick={() => setLexiconTab("fields")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_handyman", "handyman")}
              label={t("lex_studio_tab_tools", "Pack & Tools")}
              value={`04 ${t("fields", "Fields")}`}
              isActive={lexiconTab === "tools"}
              onClick={() => setLexiconTab("tools")}
            />
            <DashboardStatTile
              variant="filter"
              className="!w-full"
              icon={t("icon_data_array", "data_array")}
              label={t("lexicon_guide_tab_cheatsheet", "Token Cheat Sheet")}
              value={t("lexicon_guide_tab_cheatsheet_val", "Reference")}
              isActive={lexiconTab === "cheatsheet"}
              onClick={() => setLexiconTab("cheatsheet")}
            />
          </div>
        )}

        {/* ================================================================= */}
        {/* MASTER SCHEMA FIELD-BY-FIELD REFERENCE TABS                       */}
        {/* ================================================================= */}
        {isSchema && schemaTab === "identity_paths" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("schema_studio_sec_identity", "Identity & Core")}
              icon={t("icon_badge", "badge")}
            >
              <FieldReferenceGrid items={schemaIdentityFields} />
            </UniversalGroup>

            <UniversalGroup
              title={t("schema_studio_sec_paths", "Executables & Paths")}
              icon={t("icon_folder_open", "folder_open")}
            >
              <FieldReferenceGrid items={schemaPathsFields} />
            </UniversalGroup>

            <UniversalGroup
              title={t("schema_studio_sec_constraints", "Engine Safeguards, Version & DLC Telemetry")}
              icon={t("icon_shield", "shield")}
            >
              <FieldReferenceGrid items={schemaSafeguardsVersionFields} />
            </UniversalGroup>
          </div>
        )}

        {isSchema && schemaTab === "routing_ext" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("schema_studio_sec_extensions", "Extension Classification & Dynamic Config Watcher")}
              icon={t("icon_extension", "extension")}
            >
              <FieldReferenceGrid items={schemaExtensionsFields} />
            </UniversalGroup>

            <UniversalGroup
              title={t("schema_studio_sec_routes", "Custom Install Routes (install_routes)")}
              icon={t("icon_alt_route", "alt_route")}
            >
              <FieldReferenceGrid items={schemaInstallRouteFields} />
            </UniversalGroup>
          </div>
        )}

        {isSchema && schemaTab === "load_lab" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("schema_studio_tab_load_order", "Load Order Strategy, Priority Tiers & {Lab} Verification")}
              icon={t("icon_low_priority", "low_priority")}
            >
              <FieldReferenceGrid items={schemaLoadOrderFields} />
            </UniversalGroup>
          </div>
        )}

        {isSchema && schemaTab === "rules_capsule" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("schema_studio_tab_logs_backups", "Exception Log Matchers, Diagnostic Rules & {Backups} Airgap")}
              icon={t("icon_bug_report", "bug_report")}
            >
              <FieldReferenceGrid items={schemaLogsBackupsFields} />
            </UniversalGroup>
          </div>
        )}

        {/* ================================================================= */}
        {/* LEXICON STUDIO FIELD-BY-FIELD REFERENCE TABS                      */}
        {/* ================================================================= */}
        {!isSchema && lexiconTab === "tokens" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("lexicon_guide_tab1_card_title", "Tab 1 — Core Terms (21 Master Nouns)")}
              icon={t("icon_auto_awesome", "auto_awesome")}
            >
              <FieldReferenceGrid items={lexiconCoreTabFields} />
            </UniversalGroup>
          </div>
        )}

        {!isSchema && lexiconTab === "fields" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("lexicon_guide_tab2_card_title", "Tab 2 & Tab 3 — OS Modules & Sidebar Field Cards")}
              icon={t("icon_dashboard", "dashboard")}
            >
              <FieldReferenceGrid items={lexiconModuleFieldAnatomy} />
            </UniversalGroup>
          </div>
        )}

        {!isSchema && lexiconTab === "tools" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("lexicon_guide_tab4_card_title", "Tab 4 — Pack Metadata, Batch Find & Replace & Icon Overrides")}
              icon={t("icon_handyman", "handyman")}
            >
              <FieldReferenceGrid items={lexiconToolsTabFields} />
            </UniversalGroup>
          </div>
        )}

        {!isSchema && lexiconTab === "cheatsheet" && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-200">
            <UniversalGroup
              title={t("lexicon_guide_cheat_group", "21 Dynamic {Glossary} Tokens Cheat Sheet")}
              icon={t("icon_data_array", "data_array")}
              headerAction={
                <ActionButton
                  variant="glass"
                  icon={t(
                    copiedKey === "tokens" ? "icon_check" : "icon_content_copy",
                    copiedKey === "tokens" ? "check" : "content_copy"
                  )}
                  onClick={() =>
                    handleCopy(
                      GLOSSARY_TOKEN_REFERENCE.map((r) => `${r.token} (${r.keyId})`).join("\n"),
                      "tokens"
                    )
                  }
                  className="!h-8 !px-3 !text-[10px] !rounded-xl"
                >
                  {copiedKey === "tokens"
                    ? t("copied_clipboard", "Copied to Clipboard")
                    : t("lexicon_guide_copy_tokens", "Copy {Glossary} Tokens")}
                </ActionButton>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {GLOSSARY_TOKEN_REFERENCE.map((row, idx) => (
                  <div
                    key={idx}
                    className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-black text-[var(--accent)]">
                        {row.token}
                      </span>
                      <span className={`${VAULT_CHIP_CLASS} font-mono !text-[10px]`}>
                        {row.keyId}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="glass-panel rounded-xl px-2.5 py-1.5 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)]">
                          {t("lex_studio_preset_std", "Standard")}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {row.standard}
                        </span>
                      </div>
                      <div className="glass-panel rounded-xl px-2.5 py-1.5 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--accent)]">
                          {t("lex_studio_preset_sanctuary", "Sanctuary")}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {row.sanctuary}
                        </span>
                      </div>
                      <div className="glass-panel rounded-xl px-2.5 py-1.5 border border-[color-mix(in_srgb,var(--text)_8%,transparent)] flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--subtext)]">
                          {t("lex_studio_preset_sims", "Sims")}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text)] truncate">
                          {row.sims}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </UniversalGroup>
          </div>
        )}
      </div>
    </SidePanel>
  );
};

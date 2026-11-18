import enDefaultRaw from "../../lexicons/en-default.json";

export const enDefault = enDefaultRaw as Record<string, any>;

export type StudioMainTab = "glossary" | "strings" | "translate" | "settings";
export type AutoTranslateScope = "untranslated" | "essential" | "all";
export type StringStatusFilter = "all" | "customized" | "untranslated";

export type StringSectionId =
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

export function isDynamicDomainKey(k: string): boolean {
  return (
    k.startsWith("icon_") ||
    k.startsWith("term_") ||
    k.startsWith("class_dd_") ||
    k.startsWith("vault_sub_") ||
    k.startsWith("dlc_type_")
  );
}

export const NAV_VIEW_TITLE_KEYS = new Set<string>([
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

export function classifyStringSection(key: string): Exclude<StringSectionId, "all"> {
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

export function humanizeKey(key: string): string {
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

export const GLOSSARY_EXAMPLE_PHRASES: Record<string, string> = {
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

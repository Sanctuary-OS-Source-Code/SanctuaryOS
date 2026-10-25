import { DirectiveSlug } from "./directivesSync";

export interface DirectiveBuilderSubCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
  pending?: boolean;
}

export interface DirectiveBuilderCard {
  id: string;
  icon: string;
  overline: string;
  badge: string;
  title: string;
  footerMeta: string;
  desc: string;
  tip?: string;
  codeSnippet?: string;
  status?: "active" | "completed" | "passkey" | "citizen" | "warning" | "danger" | "info";
  subCards: DirectiveBuilderSubCard[];
}

export interface DirectiveBuilderTab {
  id: string;
  icon: string;
  label: string;
  value: string;
  cards: DirectiveBuilderCard[];
}

export interface DirectiveBuilderSchema {
  slug: DirectiveSlug;
  title: string;
  summary: string;
  isActive?: boolean;
  tabs: DirectiveBuilderTab[];
}

const BUILDER_COMMENT_PREFIX = "<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:";
const BUILDER_COMMENT_REGEX =
  /\n*<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:\s*([\s\S]*?)\s*-->\s*$/;

export function stripDirectiveMarkdownClutter(content: string): string {
  if (!content) return "";
  return content
    // Remove shields.io badge images (markdown or HTML)
    .replace(/^[ \t]*!\[[^\]]*\]\(https?:\/\/img\.shields\.io\/[^)]+\)[ \t]*\r?\n?/gm, "")
    .replace(/<img[^>]+src=["']https?:\/\/img\.shields\.io\/[^"']+["'][^>]*>\s*/gi, "")
    // Remove Table of Contents block up to the next horizontal rule or major heading
    .replace(/(\n---\s*\n)?##+\s*Table of Contents[\s\S]*?\n---\s*\n/gi, "\n")
    .replace(/##+\s*Table of Contents[\s\S]*?(?=\n# |\n## (?!Table of Contents))/gi, "")
    // Remove legacy sync metadata blockquotes and version lines
    .replace(/^[ \t]*>[ \t]*\*\*Official Citizen Guide[^\r\n]*\r?\n[ \t]*>[ \t]*Synced bidirectionally[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>[ \t]*\*\*Live Directive Synchronization:\*\*[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Document Version:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Last Updated:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*>?[ \t]*\*\*Sync Pipeline:?\*\*:?[^\r\n]*\r?\n?/gim, "")
    .replace(/^[ \t]*\*\*Version:\*\*[^\r\n]*\|\s*\*\*Last Updated:\*\*[^\r\n]*\r?\n?/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripDirectiveBuilderComment(content: string): string {
  if (!content) return "";
  return stripDirectiveMarkdownClutter(
    content.replace(BUILDER_COMMENT_REGEX, "").trim()
  );
}

export function extractDirectiveBuilderSchema(
  content?: string | null
): DirectiveBuilderSchema | null {
  if (!content) return null;
  const match = content.match(BUILDER_COMMENT_REGEX);
  if (!match || !match[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && Array.isArray(parsed.tabs)) {
      return parsed as DirectiveBuilderSchema;
    }
  } catch {
    // Ignore malformed comment payload
  }
  return null;
}

export function embedDirectiveBuilderSchema(
  cleanMarkdown: string,
  schema: DirectiveBuilderSchema | null
): string {
  const base = stripDirectiveBuilderComment(cleanMarkdown);
  if (!schema) return base;
  return `${base}\n\n${BUILDER_COMMENT_PREFIX}\n${JSON.stringify(schema, null, 2)}\n-->\n`;
}

export function compileDirectiveSchemaToMarkdown(
  schema: DirectiveBuilderSchema
): string {
  const lines: string[] = [];
  lines.push(`# ${schema.title}`);
  if (schema.summary) {
    lines.push("");
    lines.push(`> ${schema.summary}`);
  }
  lines.push("");

  for (const tab of schema.tabs) {
    lines.push("---");
    lines.push("");
    lines.push(`## ${tab.label} — ${tab.value}`);
    lines.push("");

    for (const card of tab.cards) {
      lines.push(`### ${card.overline ? `${card.overline}: ` : ""}${card.title}`);
      if (card.badge || card.footerMeta) {
        const metaParts = [card.badge, card.footerMeta].filter(Boolean);
        if (metaParts.length > 0) {
          lines.push(`*${metaParts.join(" • ")}*`);
        }
      }
      if (card.desc) {
        lines.push("");
        lines.push(card.desc);
      }
      if (card.subCards && card.subCards.length > 0) {
        lines.push("");
        for (const sub of card.subCards) {
          lines.push(`- **${sub.title}:** ${sub.desc}`);
        }
      }
      if (card.tip) {
        lines.push("");
        lines.push(`> **Tip:** ${card.tip}`);
      }
      if (card.codeSnippet) {
        lines.push("");
        lines.push("```ts");
        lines.push(card.codeSnippet);
        lines.push("```");
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

export function getDefaultDirectiveBuilderSchema(
  slug: DirectiveSlug,
  t: (key: string, fallback?: string) => string
): DirectiveBuilderSchema {
  const elevatedRolesCards: DirectiveBuilderCard[] = [
    {
      id: "role_citizen",
      icon: t("icon_person", "person"),
      overline: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      badge: t("role_citizen", "{Citizen}"),
      title: t("role_citizen", "{Citizen}"),
      footerMeta: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      desc: t("dir_proto_r1_scope", "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions."),
      status: "citizen",
      subCards: [],
    },
    {
      id: "role_mason",
      icon: t("icon_construction", "construction"),
      overline: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("dir_proto_r2_role", "Verified {Mason}"),
      footerMeta: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      desc: t("dir_proto_r2_scope", "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge."),
      status: "passkey",
      subCards: [],
    },
    {
      id: "role_architect",
      icon: t("icon_architecture", "architecture"),
      overline: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("architect", "Architect"),
      footerMeta: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      desc: t("dir_proto_r3_scope", "Unlocks Architect Console: Global Registry curation (3-Tile {Mod} Studio), Verified {Mason} & Scout Queue triage (min_scout_submissions), Global Conflict Matrix directives, Check Hash deep scan, Template Oversight, and claimable {Citizen} Support Desk tickets."),
      status: "passkey",
      subCards: [],
    },
    {
      id: "role_oversight",
      icon: t("icon_admin_panel_settings", "admin_panel_settings"),
      overline: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("role_oversight", "Oversight"),
      footerMeta: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      desc: t("dir_proto_r4_scope", "Unlocks Oversight Command: Spoke Heuristic Signatures authoring, Compliance Tier 5 Malware flagging, Emergency DEFCON 1 Lockdown override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect)."),
      status: "passkey",
      subCards: [],
    },
    {
      id: "role_wayfinder",
      icon: t("icon_explore", "explore"),
      overline: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("role_wayfinder", "Wayfinder"),
      footerMeta: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
      desc: t(
        "dir_proto_r5_scope",
        "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), SANCTUARY-UPLINK:// bundle export & live key rotation, unilateral Cut the Cord severance (secure_sever_spoke_cord), The Dispatch (2x2 telemetry headers + polls), and Game Audit Logs."
      ),
      status: "passkey",
      subCards: [],
    },
    {
      id: "role_keeper",
      icon: t("icon_memory", "memory"),
      overline: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("dir_proto_r6_role", "Keeper"),
      footerMeta: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
      desc: t(
        "dir_proto_r6_scope",
        "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Turnkey Spoke Onboarding, Core Heuristics (keeper_heuristic_signatures), Master Game Schemas, Global Lexicons/Chameleons, Bilateral Codebase-to-Keepers-Core Directives Sync, and Global Audit Logs."
      ),
      status: "passkey",
      subCards: [],
    },
  ];

  if (slug === "citizen_guide") {
    return {
      slug: "citizen_guide",
      title: t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough"),
      summary: t("sd_card_guide_desc", "Step-by-step interactive walkthrough of Sanctuary OS—from Cartographer setup, Symlink {Vault} & Load Order compilation, to Homestead Lab testing, {Backups} snapshots, and Elevated Clearances."),
      tabs: [
        {
          id: "walkthrough",
          icon: t("icon_play_circle", "play_circle"),
          label: t("dir_guide_mode_walk_lbl", "7 STAGES"),
          value: t("dir_guide_mode_walk_val", "OS Walkthrough"),
          cards: [
            {
              id: "walk_1",
              icon: t("icon_space_dashboard", "space_dashboard"),
              overline: "STAGE 1 OF 7",
              badge: t("dir_walk_s1_short", "1. Shell & Bars"),
              title: t("dir_walk_s1_title", "Global Shell: Sidebar, Top Pill & Dock"),
              footerMeta: t("dir_walk_s1_sub", "Persistent Glass Frame & Context-Aware Navigation"),
              desc: t(
                "dir_walk_s1_desc",
                "Sanctuary OS is framed by three persistent Liquid Glass bars that adapt automatically between the Foundry Landing Page and your mounted Game Workspaces."
              ),
              subCards: [
                {
                  id: "walk_1_c1",
                  icon: t("icon_menu", "menu"),
                  title: t("dir_walk_s1_c1_name", "Left Sidebar (Context-Aware)"),
                  desc: t("dir_walk_s1_c1_desc", "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 {Citizen} modules, unlocked Command Hubs, and the Quick Launch button."),
                },
                {
                  id: "walk_1_c2",
                  icon: t("icon_sports_esports", "sports_esports"),
                  title: t("dir_walk_s1_c2_name", "Top Center Workspace Pill"),
                  desc: t(
                    "dir_walk_s1_c2_desc",
                    "Click the game pill in the top TitleBar to switch active games, mount a new workspace, or return to the Sanctuary Foundry Landing Page."
                  ),
                },
                {
                  id: "walk_1_c3",
                  icon: t("icon_dock_to_bottom", "dock_to_bottom"),
                  title: t("dir_walk_s1_c3_name", "Bottom Morphing Status Pill"),
                  desc: t("dir_walk_s1_c3_desc", "Houses 1-Click Radar Sweep, {Vault} Lockdown, {Blueprint} Quick-Swap, Side Browser, Notifications, and live alert counters. Auto-tucks when SidePanels open."),
                },
              ],
            },
            {
              id: "walk_2",
              icon: t("icon_explore", "explore"),
              overline: "STAGE 2 OF 7",
              badge: t("dir_walk_s2_short", "2. Cartographer"),
              title: t("dir_walk_s2_title", "Mounting a Workspace & Cartographer"),
              footerMeta: t("dir_walk_s2_sub", "First-Boot Coordinate Mapping & Native PE Ripper"),
              desc: t("dir_walk_s2_desc", "Selecting a workspace on the Landing Page launches The Cartographer to link your game binary, live {Mods} directory, and airgapped {Vault} storage."),
              subCards: [
                {
                  id: "walk_2_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: t("dir_walk_s2_c1_name", "Bin Folder (Executable Path)"),
                  desc: t(
                    "dir_walk_s2_c1_desc",
                    "Points to your game binary (e.g. TS4_x64.exe). Sanctuary extracts the genuine patch version in-process via Rust pelite without spawning background processes."
                  ),
                },
                {
                  id: "walk_2_c2",
                  icon: t("icon_folder_open", "folder_open"),
                  title: t("dir_walk_s2_c2_name", "{Mods} Folder (Symlink Target)"),
                  desc: t("dir_walk_s2_c2_desc", "Your live game {Mods} folder. Keep this untouched—Sanctuary projects active {mods} here via zero-copy OS symlinks."),
                },
                {
                  id: "walk_2_c3",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: t("dir_walk_s2_c3_name", "{Vault} Folder (Deep Archive)"),
                  desc: t("dir_walk_s2_c3_desc", "Your isolated storage directory where Sanctuary builds {Mods}/, {Blueprints}/, Backups/World/, Backups/Engine/, Quarantine/, and Data/Cache/."),
                },
              ],
            },
            {
              id: "walk_3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: "STAGE 3 OF 7",
              badge: t("dir_walk_s3_short", "3. {Vault} & Cards"),
              title: t("dir_walk_s3_title", "Your {Vault}, {Mod} Cards & ActionPill"),
              footerMeta: t("dir_walk_s3_sub", "Drag-and-Drop Ingestion, Suite Grouping & Dossiers"),
              desc: t("dir_walk_s3_desc", "Every {mod} you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Dual-Tier Heuristic Engine, and indexed in Your {Vault}."),
              subCards: [
                {
                  id: "walk_3_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s3_c1_name", "ActionPill & Filters Popover"),
                  desc: t(
                    "dir_walk_s3_c1_desc",
                    "Instant search bar, Filters (tune) popover for Game Version / Eligible-Only filtering, sort order, and bulk selection actions."
                  ),
                },
                {
                  id: "walk_3_c2",
                  icon: t("icon_toggle_on", "toggle_on"),
                  title: t("dir_walk_s3_c2_name", "Parent Suite Card & Equip Toggle"),
                  desc: t("dir_walk_s3_c2_desc", "Toggles symlinks in milliseconds. Multi-part {mod} suites (like MC Command Center) group into one Parent Card with an expandable Linked Modules drawer."),
                },
                {
                  id: "walk_3_c3",
                  icon: t("icon_menu_book", "menu_book"),
                  title: t("dir_walk_s3_c3_name", "{Mod} Dossier SidePanel"),
                  desc: t(
                    "dir_walk_s3_c3_desc",
                    "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static manifest.json URL, or inspect package files."
                  ),
                },
              ],
            },
            {
              id: "walk_4",
              icon: t("icon_map", "map"),
              overline: "STAGE 4 OF 7",
              badge: t("sd_guide_s4_short", "4. {Blueprints}"),
              title: t("dir_walk_s4_title", "{Blueprints} & Loadout Hot-Swapping"),
              footerMeta: t("dir_walk_s4_sub", "Zero-Copy Profile Switching & SNCXXX Cloud Uplinks"),
              desc: t(
                "dir_walk_s4_desc",
                "Replace manual folder dragging with saved tactical loadouts that swap thousands of symlinks in under a second."
              ),
              subCards: [
                {
                  id: "walk_4_c1",
                  icon: t("icon_swap_horiz", "swap_horiz"),
                  title: t("dir_walk_s4_c1_name", "{Blueprint} Hot-Swap Dropdown"),
                  desc: t("dir_walk_s4_c1_desc", "Switch between playstyles (e.g. Realism Save, Occult Save, Patch Testing) directly from the {Vault} header or Bottom Dock."),
                },
                {
                  id: "walk_4_c2",
                  icon: t("icon_data_object", "data_object"),
                  title: t("dir_walk_s4_c2_name", "Portable Offline JSON Export"),
                  desc: t(
                    "dir_walk_s4_c2_desc",
                    "Exports your loadout to a self-contained .json file that preserves custom local modMeta URLs and workspace identity offline."
                  ),
                },
                {
                  id: "walk_4_c3",
                  icon: t("icon_tag", "tag"),
                  title: t("dir_walk_s4_c3_name", "6-Digit Cloud Uplink (SNCXXX)"),
                  desc: t("dir_walk_s4_c3_desc", "Generates a 6-character share code (SNCXXX) or publishes your {Blueprint} to The Nexus while auto-stripping flagged Tier 1–4 hashes."),
                },
              ],
            },
            {
              id: "walk_5",
              icon: t("icon_radar", "radar"),
              overline: "STAGE 5 OF 7",
              badge: t("dir_walk_s5_short", "5. Radar & Lab"),
              title: t("dir_walk_s5_title", "Conflict Radar & Homestead Lab"),
              footerMeta: t("dir_walk_s5_sub", "Pick-a-Winner Load Order & 100% Nuke Proving Grounds"),
              desc: t("dir_walk_s5_desc", "Resolve tuning overlaps before launching the game, or isolate suspect {mods} in a sterile crash-monitored sandbox."),
              subCards: [
                {
                  id: "walk_5_c1",
                  icon: t("icon_emoji_events", "emoji_events"),
                  title: t("dir_walk_s5_c1_name", "Casual Mode (Pick a Winner)"),
                  desc: t("dir_walk_s5_c1_desc", "Click 'Pick a Winner' on any Severity 3 Tuning Overlap to automatically route the winning {mod} into a higher priority tier and dynamic Resource.cfg."),
                },
                {
                  id: "walk_5_c2",
                  icon: t("icon_rule", "rule"),
                  title: t("dir_walk_s5_c2_name", "Advanced Load Order & Break Loop"),
                  desc: t(
                    "dir_walk_s5_c2_desc",
                    "Build directional Must Load After / Before rules with topological sorting and 1-click circular dependency loop breaking."
                  ),
                },
                {
                  id: "walk_5_c3",
                  icon: t("icon_science", "science"),
                  title: t("dir_walk_s5_c3_name", "Homestead 100% Nuke & 1v1 Test"),
                  desc: t("dir_walk_s5_c3_desc", "Strips your main loadout and boots the game with only the test {mod} (or 2 conflicting {mods}) while harvesting lastException.txt logs."),
                },
              ],
            },
            {
              id: "walk_6",
              icon: t("icon_construction", "construction"),
              overline: "STAGE 6 OF 7",
              badge: t("dir_walk_s6_short", "6. IDE & Backups"),
              title: t("dir_walk_s6_title", "Workbench, Timeline Diff & {Backups}"),
              footerMeta: t("dir_walk_s6_sub", "2-Column Visual Config Studio & Hardlink Backups"),
              desc: t("dir_walk_s6_desc", "Edit 430+ setting {mod} config files visually at 60 FPS and safeguard your saves and game binaries with zero-bloat snapshots."),
              subCards: [
                {
                  id: "walk_6_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s6_c1_name", "2-Column Visual Config Editor"),
                  desc: t(
                    "dir_walk_s6_c1_desc",
                    "Category Pill Bar, dual Min/Max range steppers, Undo to Saved, Reset to Default, and a No-Code Visual Template Builder."
                  ),
                },
                {
                  id: "walk_6_c2",
                  icon: t("icon_compare_arrows", "compare_arrows"),
                  title: t("dir_walk_s6_c2_name", "2-Column Timeline & Diff Panel"),
                  desc: t(
                    "dir_walk_s6_c2_desc",
                    "Compare live unsaved edits or historical snapshots side-by-side in Visual Diff cards or Raw Monaco Code Diff."
                  ),
                },
                {
                  id: "walk_6_c3",
                  icon: t("icon_history", "history"),
                  title: t("dir_walk_s6_c3_name", "{Backups} (World & Engine)"),
                  desc: t(
                    "dir_walk_s6_c3_desc",
                    "Uses OS hardlinks so unchanged files consume 0 extra bytes, paired with differential rollback restoration."
                  ),
                },
              ],
            },
            {
              id: "walk_7",
              icon: t("icon_shield", "shield"),
              overline: "STAGE 7 OF 7",
              badge: t("dir_walk_s7_short", "7. Hubs & Security"),
              title: t("dir_walk_s7_title", "Open Workshop, Passkeys & Lockdown"),
              footerMeta: t("dir_walk_s7_sub", "{Citizen} Creator Inheritance & Full-OS Security Gates"),
              desc: t("dir_walk_s7_desc", "Every {Citizen} inherits the local {Mason} Workshop, while hardware FIDO2 Passkeys and full-OS Quarantine Lockdowns protect the ecosystem."),
              subCards: [
                {
                  id: "walk_7_c1",
                  icon: t("icon_handyman", "handyman"),
                  title: t("dir_walk_s7_c1_name", "Open {Mason} Workshop ({Citizen} Tier)"),
                  desc: t("dir_walk_s7_c1_desc", "All {Citizens} can use Dev Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge (6 Liquid Glass sliders), and Static Edge Release Packaging."),
                },
                {
                  id: "walk_7_c2",
                  icon: t("icon_passkey", "passkey"),
                  title: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP {Vault}"),
                  desc: t("dir_walk_s7_c2_desc", "Elevated clearances (Verified {Mason} through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security {Vault} SidePanel."),
                },
                {
                  id: "walk_7_c3",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: t("dir_walk_s7_c3_name", "Quarantine SidePanel OS Lockdown"),
                  desc: t(
                    "dir_walk_s7_c3_desc",
                    "Tier 5 Malware locks the entire OS shell and opens the Quarantine SidePanel with Triggered By diagnostics, Detection Source, and Secure Shred."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "modules",
          icon: t("icon_explore", "explore"),
          label: t("dir_guide_mode_mod_lbl", "9 MODULES"),
          value: t("dir_guide_mode_mod_val", "Citizen Tools"),
          cards: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
            id: `mod_${n}`,
            icon:
              n === 1
                ? t("icon_explore", "explore")
                : n === 2
                  ? t("icon_space_dashboard", "space_dashboard")
                  : n === 3
                    ? t("icon_inventory_2", "inventory_2")
                    : n === 4
                      ? t("icon_map", "map")
                      : n === 5
                        ? t("icon_hub", "hub")
                        : n === 6
                          ? t("icon_radar", "radar")
                          : n === 7
                            ? t("icon_science", "science")
                            : n === 8
                              ? t("icon_history", "history")
                              : t("icon_shield", "shield"),
            overline: `MODULE ${n} OF 9`,
            badge: t(`sd_guide_s${n}_short`, `${n}. Module`),
            title: t(`sd_guide_s${n}_title`, `Module ${n}`),
            footerMeta: t(`sd_guide_s${n}_badge`, ""),
            desc: t(`sd_guide_s${n}_desc`, ""),
            tip: t(`sd_guide_s${n}_tip`, ""),
            subCards: [1, 2, 3, 4].map((c) => ({
              id: `mod_${n}_c${c}`,
              icon: t("icon_check_circle", "check_circle"),
              title: t(`sd_guide_s${n}_c${c}_title`, `Feature ${c}`),
              desc: t(`sd_guide_s${n}_c${c}_desc`, ""),
            })),
          })),
        },
        {
          id: "roles",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          label: t("dir_pr_t1_lbl", "6 TIERS"),
          value: t("dir_wt_t8_val", "Role Tiers"),
          cards: elevatedRolesCards,
        },
      ],
    };
  }

  if (slug === "phase_roadmap") {
    const phaseMeta: Array<{
      num: number;
      status: "active" | "completed";
      icon: string;
      milestoneNums: number[];
    }> = [
      { num: 12, status: "active", icon: t("icon_rocket_launch", "rocket_launch"), milestoneNums: [5, 6, 7, 8, 10, 9, 11, 12] },
      { num: 11, status: "completed", icon: t("icon_public", "public"), milestoneNums: [5, 6, 7, 8, 9, 10] },
      { num: 10, status: "completed", icon: t("icon_palette", "palette"), milestoneNums: [5, 6, 7, 8, 9, 10] },
      { num: 9, status: "completed", icon: t("icon_admin_panel_settings", "admin_panel_settings"), milestoneNums: [5, 6, 7, 8] },
      { num: 8, status: "completed", icon: t("icon_cell_tower", "cell_tower"), milestoneNums: [5, 6, 7, 8] },
      { num: 7, status: "completed", icon: t("icon_construction", "construction"), milestoneNums: [5, 6, 7, 8] },
      { num: 6, status: "completed", icon: t("icon_science", "science"), milestoneNums: [5, 6, 7, 8] },
      { num: 5, status: "completed", icon: t("icon_history", "history"), milestoneNums: [5, 6, 7, 8] },
      { num: 4, status: "completed", icon: t("icon_radar", "radar"), milestoneNums: [5, 6, 7, 8] },
      { num: 3, status: "completed", icon: t("icon_hub", "hub"), milestoneNums: [5, 6, 7, 8] },
      { num: 2, status: "completed", icon: t("icon_map", "map"), milestoneNums: [5, 6, 7, 8] },
      { num: 1, status: "completed", icon: t("icon_inventory_2", "inventory_2"), milestoneNums: [5, 6, 7, 8] },
    ];

    return {
      slug: "phase_roadmap",
      title: t("sd_card_roadmap_title", "Sanctuary OS Phase Roadmap"),
      summary: t(
        "sd_card_roadmap_desc",
        "Interactive milestone timeline tracking Sanctuary OS from Phase 1 (Local Symlink Core) through Phase 11 (Liquid Glass & FIDO2 Security) into Phase 12 (Game-Agnostic Multi-Spoke Future)."
      ),
      tabs: [
        {
          id: "phases",
          icon: t("icon_timeline", "timeline"),
          label: t("dir_roadmap_tile_all", "12 Phases"),
          value: t("sd_roadmap_filter_all_val", "Full Timeline"),
          cards: phaseMeta.map((p) => ({
            id: `phase_${p.num}`,
            icon: p.icon,
            overline: t(`sd_roadmap_p${p.num}_period`, `PHASE ${p.num}`),
            badge:
              p.status === "active"
                ? t("sd_roadmap_status_active", "ACTIVE PHASE")
                : t("status_completed", "COMPLETED"),
            title: t(`sd_roadmap_p${p.num}_title`, `Phase ${p.num}`),
            footerMeta: t(`sd_roadmap_p${p.num}_focus`, ""),
            desc: t(`sd_roadmap_p${p.num}_summary`, ""),
            status: p.status,
            subCards: p.milestoneNums.map((m) => ({
              id: `phase_${p.num}_m${m}`,
              icon:
                p.num === 12 && [7, 8, 9, 10].includes(m)
                  ? t("icon_rocket_launch", "rocket_launch")
                  : t("icon_check_circle", "check_circle"),
              title: t(`sd_roadmap_p${p.num}_m${m}_title`, ""),
              desc: t(`sd_roadmap_p${p.num}_m${m}_desc`, ""),
              pending: p.num === 12 && [7, 8, 9, 10].includes(m),
            })),
          })),
        },
      ],
    };
  }

  if (slug === "forking_guide") {
    return {
      slug: "forking_guide",
      title: t("sd_card_fork_title", "Forking & Spoke Provisioning Guide"),
      summary: t("sd_card_fork_desc", "Interactive {blueprint} for launching a Sovereign Community Spoke (SANCTUARY-UPLINK://) or a 1-file Standalone Codebase Fork (src/supabase.ts), plus Dynamic Game Schemas and Cut the Cord."),
      tabs: [
        {
          id: "spoke",
          icon: t("icon_hub", "hub"),
          label: t("dir_fk_t1_lbl", "STEP 1"),
          value: t("dir_fk_t1_val", "Spoke Setup"),
          cards: [
            {
              id: "fork_spoke_setup",
              icon: t("icon_hub", "hub"),
              overline: t(
                "sd_fork_spoke_hero_badge",
                "OFFICIAL PARTNER NETWORK • ZERO CODE EDITS"
              ),
              badge: t("active", "Active"),
              title: t(
                "sd_fork_spoke_hero_title",
                "Connect a Sovereign Community Spoke in 3 Steps"
              ),
              footerMeta: "SANCTUARY-UPLINK:// • schema.sql",
              desc: t(
                "sd_fork_spoke_hero_desc",
                "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
              ),
              subCards: [
                {
                  id: "fork_spoke_s1",
                  icon: t("icon_database", "database"),
                  title: t(
                    "sd_fork_spoke_step1_title",
                    "Step 1: Initialize Your Supabase Spoke (schema.sql)"
                  ),
                  desc: t(
                    "sd_fork_spoke_step1_desc",
                    "Create a free Supabase project, open the SQL Editor, and run schema.sql. This single script provisions all 36 community tables, RLS policies, immutable audit triggers, and role functions."
                  ),
                },
                {
                  id: "fork_spoke_s2",
                  icon: t("icon_key", "key"),
                  title: t(
                    "sd_fork_spoke_step2_title",
                    "Step 2: Generate Your SANCTUARY-UPLINK:// Bundle"
                  ),
                  desc: t(
                    "sd_fork_spoke_step2_desc",
                    "In Keepers Core -> Active Workspaces (or Wayfinder Hub), paste your Supabase URL, Anon Key, and Service Role Key to generate an encrypted SANCTUARY-UPLINK:// handshake bundle."
                  ),
                },
                {
                  id: "fork_spoke_s3",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: t(
                    "sd_fork_spoke_step3_title",
                    "Step 3: Verify Handshake & Provision Founding Wayfinder"
                  ),
                  desc: t(
                    "sd_fork_spoke_step3_desc",
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  ),
                },
                {
                  id: "fork_spoke_s4",
                  icon: t("icon_link_off", "link_off"),
                  title: t(
                    "sd_fork_cord_community_title",
                    "Community-Initiated Severance (Wayfinder Hub)"
                  ),
                  desc: t(
                    "sd_fork_cord_community_desc",
                    "A Wayfinder can double-click 'Cut the Cord' in Wayfinder Hub -> Spoke Uplink & Sovereignty at any time. This writes an immutable audit log, sets is_active = false on the Hub, and permanently scrubs (NULLs) the Spoke's supabase_service_key from the Hub while leaving 100% of the community's database intact."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "standalone",
          icon: t("icon_call_split", "call_split"),
          label: t("dir_fk_t2_lbl", "FORK MODES"),
          value: t("dir_fk_t2_val", "Standalone & Hub"),
          cards: [
            {
              id: "fork_mode_standalone",
              icon: t("icon_call_split", "call_split"),
              overline: t(
                "sd_fork_mode_standalone_badge",
                "MODE 1 • 1-DATABASE STANDALONE"
              ),
              badge: t("dir_fk_t2_val", "1-File Fork"),
              title: t(
                "sd_fork_mode_standalone_title",
                "1-File Standalone Fork (Single Database)"
              ),
              footerMeta: "schema.sql • src/supabase.ts",
              desc: t(
                "sd_fork_mode_standalone_desc",
                "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions."
              ),
              subCards: [
                {
                  id: "fork_m1_s1",
                  icon: t("icon_bolt", "bolt"),
                  title: t(
                    "sd_fork_standalone_s1_title",
                    "1. Unified Auth & Direct RPC Engine"
                  ),
                  desc: t(
                    "sd_fork_standalone_s1_desc",
                    "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
                  ),
                },
                {
                  id: "fork_m1_s2",
                  icon: t("icon_verified", "verified"),
                  title: t(
                    "sd_fork_standalone_s2_title",
                    "2. Automatic Founding Wayfinder Promotion"
                  ),
                  desc: t(
                    "sd_fork_standalone_s2_desc",
                    "The on_auth_user_created_spoke trigger in schema.sql detects when your standalone database has 0 Wayfinders and automatically promotes the very first registered user to Founding Wayfinder."
                  ),
                },
                {
                  id: "fork_m1_s3",
                  icon: t("icon_storage", "storage"),
                  title: t(
                    "sd_fork_standalone_s3_title",
                    "3. Transparent OS-to-Spoke Table Mapping"
                  ),
                  desc: t(
                    "sd_fork_standalone_s3_desc",
                    "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_hub",
              icon: t("icon_hub", "hub"),
              overline: t(
                "sd_fork_mode_hub_badge",
                "MODE 2 • FULL HUB & SPOKE FEDERATION"
              ),
              badge: t("dir_ar_t2_val", "Hub & Spokes"),
              title: t(
                "sd_fork_mode_hub_title",
                "Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)"
              ),
              footerMeta: "schema_os.sql + schema.sql • game-gateway",
              desc: t(
                "sd_fork_mode_hub_desc",
                "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql)."
              ),
              subCards: [
                {
                  id: "fork_m2_s1",
                  icon: t("icon_memory", "memory"),
                  title: t(
                    "sd_fork_hub_s1_title",
                    "1. Provision Core Hub Database (schema_os.sql)"
                  ),
                  desc: t(
                    "sd_fork_hub_s1_desc",
                    "Create your central Hub Supabase project and run schema_os.sql in the SQL Editor. This provisions global SSO profiles, FIDO2 user_passkeys, sanctuary_games, sanctuary_schemas, system_directives, and keeper_heuristic_signatures."
                  ),
                },
                {
                  id: "fork_m2_s2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: t(
                    "sd_fork_hub_s2_title",
                    "2. Deploy game-gateway Edge Function"
                  ),
                  desc: t(
                    "sd_fork_hub_s2_desc",
                    "Deploy supabase/functions/game-gateway to your Hub project (supabase functions deploy game-gateway). It validates Hub JWTs, checks roles, and executes cross-database mutations against each Spoke."
                  ),
                },
                {
                  id: "fork_m2_s3",
                  icon: t("icon_code", "code"),
                  title: t(
                    "sd_fork_hub_s3_title",
                    "3. Point src/supabase.ts at Your Core Hub"
                  ),
                  desc: t(
                    "sd_fork_hub_s3_desc",
                    "Keep mode set to 'hub_and_spoke' in src/supabase.ts (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env) pointing to your central Hub project's URL and Anon Key."
                  ),
                },
                {
                  id: "fork_m2_s4",
                  icon: t("icon_storage", "storage"),
                  title: t(
                    "sd_fork_hub_s4_title",
                    "4. Provision & Link Child Spoke Databases (schema.sql)"
                  ),
                  desc: t(
                    "sd_fork_hub_s4_desc",
                    "For each game community, create a separate Supabase project, run schema.sql, and register its URL, Anon Key, and Service Role Key (or SANCTUARY-UPLINK:// bundle) in Keepers Core -> Active Workspaces."
                  ),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  if (slug === "master_architecture") {
    return {
      slug: "master_architecture",
      title: t("sd_card_arch_title", "Master Architecture & Engine Systems"),
      summary: t(
        "sd_card_arch_desc",
        "Deep-dive interactive explorer into the Tauri v2 Rust core, Hub-and-Spoke database federation, Symlink Airgap 2.5, Decentralized Static Edge Manifests, and Atomic Logic."
      ),
      tabs: [
        {
          id: "p1",
          icon: t("icon_memory", "memory"),
          label: t("dir_ar_t1_lbl", "PILLAR 1"),
          value: t("dir_ar_t1_val", "Core & Glass"),
          cards: [
            {
              id: "arch_p1",
              icon: t("icon_memory", "memory"),
              overline: t(
                "dir_arch_p1_badge",
                "ARCHITECTURE PILLAR 1 • CORE ENGINE & OPTICS"
              ),
              badge: t("active", "Active"),
              title: t(
                "dir_arch_p1_heading",
                "Tauri v2 Rust Kernel, Liquid Glass V3 & Lexicon Engine"
              ),
              footerMeta: "Tauri v2 • React 18 • Liquid Glass V3",
              desc: t(
                "dir_arch_p1_summary",
                "Sanctuary OS combines a zero-overhead native Rust backend with a GPU-pinned 3D refractive Liquid Glass interface and a 4-theme localization engine."
              ),
              subCards: [
                {
                  id: "arch_p1_c1",
                  icon: t("icon_auto_awesome", "auto_awesome"),
                  title: t("sd_arch_stack_c1_title", "Frontend & Liquid Glass V3 UI"),
                  desc: t(
                    "dir_arch_p1_b1",
                    "Zero-Tearing Liquid Glass Engine (.glass-panel / .glass-surface) with 6 live Theme Forge optical sliders (Opacity, Blur, Saturation, Rim Light, Glare, Depth)"
                  ),
                },
                {
                  id: "arch_p1_c2",
                  icon: t("icon_memory", "memory"),
                  title: t("sd_arch_stack_c2_title", "Tauri v2 Native Rust Core"),
                  desc: t(
                    "dir_arch_p1_b2",
                    "Native Tauri v2 Rust core: pelite PE executable version ripper, SQLite .sanctuary_cache.db mtime delta scanner, WebAuthn FIDO2 bridge & silent updater"
                  ),
                },
                {
                  id: "arch_p1_c3",
                  icon: t("icon_view_sidebar", "view_sidebar"),
                  title: t("dir_walk_s1_title", "Global Shell: Sidebar, Top Pill & Dock"),
                  desc: t(
                    "dir_arch_p1_b3",
                    "Single Morphing Status Pill & context-aware Sidebar that switches cleanly between Foundry Landing Page quick links and Game Workspace tools"
                  ),
                },
                {
                  id: "arch_p1_c4",
                  icon: t("icon_translate", "translate"),
                  title: t("sd_roadmap_p6_title", "Chameleon & Lexicon Protocols"),
                  desc: t(
                    "dir_arch_p1_b4",
                    "Quota-protected Zustand state engine + strict 4-dictionary Lexicon Protocol (en-default, en-sanctuary, en-sims, Simlish)"
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p2",
          icon: t("icon_hub", "hub"),
          label: t("dir_ar_t2_lbl", "PILLAR 2"),
          value: t("dir_ar_t2_val", "Hub & Spokes"),
          cards: [
            {
              id: "arch_p2",
              icon: t("icon_hub", "hub"),
              overline: t(
                "dir_arch_p2_badge",
                "ARCHITECTURE PILLAR 2 • FEDERATION & STATIC EDGE"
              ),
              badge: t("active", "Active"),
              title: t(
                "dir_arch_p2_heading",
                "Decoupled Hub-and-Spoke Cloud, Static Edge & Standalone Mode"
              ),
              footerMeta: "schema_os.sql • schema.sql • Static Edge",
              desc: t(
                "dir_arch_p2_summary",
                "Separates global SSO and baseline security on the Core Hub from community-owned Spoke databases, serverless creator manifest polling, and 1-file standalone forks."
              ),
              subCards: [
                {
                  id: "arch_p2_c1",
                  icon: t("icon_hub", "hub"),
                  title: t(
                    "sd_arch_stack_c3_title",
                    "Core OS Hub vs. Community Spoke DBs"
                  ),
                  desc: t(
                    "dir_arch_p2_b1",
                    "Core OS Hub (schema_os.sql) governs global SSO auth, FIDO2 passkeys, hardware_bans, sanctuary_schemas, keeper_heuristic_signatures & system_directives"
                  ),
                },
                {
                  id: "arch_p2_c2",
                  icon: t("icon_storage", "storage"),
                  title: t(
                    "sd_fork_arch_spoke_title",
                    "Community Spoke DB (schema.sql — Wayfinder)"
                  ),
                  desc: t(
                    "dir_arch_p2_b2",
                    "Community Game Spokes (schema.sql — 36 tables) are 100% owned by each game's Wayfinder with zero email/credential bleed and unilateral Cut the Cord severance"
                  ),
                },
                {
                  id: "arch_p2_c3",
                  icon: t("icon_call_split", "call_split"),
                  title: t(
                    "sd_fork_standalone_hero_title",
                    "Launch an Independent Standalone Fork with 1 Database"
                  ),
                  desc: t(
                    "dir_arch_p2_b3",
                    "Single-File Standalone Fork mode (src/supabase.ts) runs the entire OS against a single schema.sql database with zero Edge Functions"
                  ),
                },
                {
                  id: "arch_p2_c4",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: t(
                    "sd_arch_vault_c3_title",
                    "Decentralized Static Edge Polling (manifest.json)"
                  ),
                  desc: t(
                    "dir_arch_p2_b4",
                    "Decentralized Static Edge Polling (manifest.json & override.json) delivers creator updates and atomic_logic via direct HTTP GET without central DB lock-in"
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p3",
          icon: t("icon_shield", "shield"),
          label: t("dir_ar_t3_lbl", "PILLAR 3"),
          value: t("dir_ar_t3_val", "{Vault} & Lab"),
          cards: [
            {
              id: "arch_p3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: t("dir_arch_p3_badge", "ARCHITECTURE PILLAR 3 • {VAULT}, AIRGAP & DEFENSE"),
              badge: t("active", "Active"),
              title: t(
                "dir_arch_p3_heading",
                "Symlink Airgap 2.5, Topological Compiler, FIDO2 & Malware Lockdown"
              ),
              footerMeta: "Symlink Airgap • Homestead Lab • FIDO2",
              desc: t(
                "dir_arch_p3_summary",
                "Protects your game installation and accounts via zero-copy symlink projection, hardlink Time Capsules, FIDO2 WebAuthn passkeys, and full-OS malware quarantine."
              ),
              subCards: [
                {
                  id: "arch_p3_c1",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: t(
                    "sd_arch_vault_c2_title",
                    "Symlink Airgap 2.5 & Dynamic Config Watcher"
                  ),
                  desc: t("dir_arch_p3_b1", "Symlink Airgap 2.5 projects {mods} from {Vault}/{Mods}/ into the live game folder, grouping multi-file {mod} suites into expandable Parent Cards"),
                },
                {
                  id: "arch_p3_c2",
                  icon: t("icon_layers", "layers"),
                  title: t(
                    "sd_arch_vault_c4_title",
                    "Topological Load Order Compiler (compileLoadOrder)"
                  ),
                  desc: t(
                    "dir_arch_p3_b2",
                    "Schema-Driven Load Order Compiler (folder_priority + dynamic Resource.cfg, manifest_list, numeric_prefix, timestamp) with topological cycle breaking"
                  ),
                },
                {
                  id: "arch_p3_c3",
                  icon: t("icon_construction", "construction"),
                  title: t("sd_roadmap_p7_title", "Core Architecture, {Backups} Compression & Windows MSI Pipeline"),
                  desc: t("dir_arch_p3_b3", "Reimagined 2-Column {Citizen}'s Workbench (430+ settings at 60 FPS), No-Code Visual Template Builder, 2-Column Timeline Diff & Unified 3-Tile {Mod} Studio"),
                },
                {
                  id: "arch_p3_c4",
                  icon: t("icon_science", "science"),
                  title: t(
                    "sd_arch_logic_c3_title",
                    "Homestead Lab 100% Nuke & 1v1 Stability"
                  ),
                  desc: t("dir_arch_p3_b4", "Homestead 100% Nuke & 1v1 Stability Lab + {Backups} incremental NTFS/POSIX hardlink snapshots (.tar.zst) with differential rollback"),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  // Default: master_protocols
  return {
    slug: "master_protocols",
    title: t("sd_card_proto_title", "Master Protocol & Clearance Matrix"),
    summary: t(
      "sd_card_proto_desc",
      "Interactive directory of all 32 Sanctuary OS operational protocols, Florida Compliance Tiers 0–5, Dual-Tier Heuristic Antivirus rules, and the 6-Tier Role Clearance Hierarchy."
    ),
    tabs: [
      {
        id: "roles",
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        label: t("dir_pr_t1_lbl", "6 TIERS"),
        value: t("dir_pr_t1_val", "Role Matrix"),
        cards: elevatedRolesCards,
      },
      {
        id: "compliance",
        icon: t("icon_shield", "shield"),
        label: t("dir_pr_t2_lbl", "TIERS 0–5"),
        value: t("dir_pr_t2_val", "Safety & AV"),
        cards: [
          {
            id: "comp_t0",
            icon: t("icon_check_circle", "check_circle"),
            overline: t("sd_proto_tier0_badge", "TIER 0 • PUBLIC SAFE"),
            badge: "TIER 0",
            title: t("sd_proto_tier0_title", "Standard Verified & General Audience"),
            footerMeta: t("sd_proto_tier0_badge", "TIER 0 • PUBLIC SAFE"),
            desc: t("sd_proto_tier0_desc", "Eligible for full public indexing across The Nexus, shared Cloud {Blueprints} (SNCXXX), and public {Mason} Profiles. Full {Citizen} Support Desk access."),
            subCards: [],
          },
          {
            id: "comp_t12",
            icon: t("icon_visibility_off", "visibility_off"),
            overline: t("sd_proto_tier12_badge", "TIERS 1–2 • EXPLICIT / ILLICIT"),
            badge: "TIERS 1–2",
            title: t(
              "sd_proto_tier12_title",
              "Adult (NSFW) & Illicit Themes — Local Allowed, Public Scrubbed"
            ),
            footerMeta: t("sd_proto_tier12_badge", "TIERS 1–2 • EXPLICIT / ILLICIT"),
            desc: t("sd_proto_tier12_desc", "Permitted in local Vaults and decentralized Static Edge manifests. Automatically scrubbed from public Nexus feeds and stripped from public Cloud {Blueprints} (trg_purge_flagged_hash_from_blueprints). Eligible for Support Desk with automated 'Dirty Log' sanitization."),
            subCards: [],
          },
          {
            id: "comp_t34",
            icon: t("icon_lock", "lock"),
            overline: t("sd_proto_tier34_badge", "TIERS 3–4 • SEVERE / RESTRICTED"),
            badge: "TIERS 3–4",
            title: t("sd_proto_tier34_title", "Extreme Violence & Taboo Content — Triggers {Vault} Lock"),
            footerMeta: t("sd_proto_tier34_badge", "TIERS 3–4 • SEVERE / RESTRICTED"),
            desc: t("sd_proto_tier34_desc", "Permitted strictly within isolated local Vaults. Scrubbed from all public feeds and Cloud {Blueprints}. Equipping or storing Tier 3–4 {mods} engages a {Vault} Lock that restricts {Citizen} Support Desk ticket submissions until removed."),
            subCards: [],
          },
          {
            id: "comp_t5",
            icon: t("icon_gpp_bad", "gpp_bad"),
            overline: t("sd_proto_tier5_badge", "TIER 5 • CONFIRMED MALWARE"),
            badge: "TIER 5",
            title: t(
              "sd_proto_tier5_title",
              "Zero-Choice OS Lockdown & Destructive Secure Shred"
            ),
            footerMeta: t("sd_proto_tier5_badge", "TIER 5 • CONFIRMED MALWARE"),
            desc: t(
              "sd_proto_tier5_desc",
              "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables detected via SHA-256 DNA or Dual-Tier Rust Heuristics. Immediately halts game launch, isolates the file in Quarantine, locks the OS shell, and requires a Secure Shred signature."
            ),
            subCards: [],
          },
          {
            id: "comp_av",
            icon: t("icon_security", "security"),
            overline: t(
              "sd_proto_heuristics_badge",
              "DUAL-TIER RUST AV • BYTECODE & ARCHIVE SCAN"
            ),
            badge: "RUST AV",
            title: t(
              "sd_proto_heuristics_title",
              "Multi-Format Heuristic & Bytecode Scanner"
            ),
            footerMeta: "keeper_heuristic_signatures + heuristic_signatures",
            desc: t(
              "sd_proto_heuristics_desc",
              "Combines global Core Heuristics (keeper_heuristic_signatures) and community Spoke Heuristics (heuristic_signatures) to inspect .zip, .package, .ts4script, .dll, .exe, and compiled Python .pyc bytecode before execution."
            ),
            subCards: [],
          },
          {
            id: "comp_nuclear",
            icon: t("icon_policy", "policy"),
            overline: t(
              "sd_proto_nuclear_badge",
              "NUCLEAR OVERRIDE • PRIVACY-FIRST BAN LEDGER"
            ),
            badge: "NUCLEAR OVERRIDE",
            title: t(
              "sd_proto_nuclear_title",
              "Decoupled Hardware Ban Ledger (hardware_bans)"
            ),
            footerMeta: "hardware_bans",
            desc: t(
              "sd_proto_nuclear_desc",
              "Sanctuary OS never tracks Hardware IDs on normal users. Clicking the System Preferences subtitle 5 times reveals the Nuclear Override for isolated local sandbox testing—engaging it records a one-way hardware hash in hardware_bans and permanently severs cloud network access."
            ),
            subCards: [],
          },
        ],
      },
      {
        id: "list",
        icon: t("icon_policy", "policy"),
        label: t("dir_pr_t3_lbl", "32 RULES"),
        value: t("dir_pr_t3_val", "OS Protocols"),
        cards: [1, 2, 3, 4].map((d) => ({
          id: `proto_d${d}`,
          icon:
            d === 1
              ? t("icon_hub", "hub")
              : d === 2
                ? t("icon_inventory_2", "inventory_2")
                : d === 3
                  ? t("icon_radar", "radar")
                  : t("icon_shield", "shield"),
          overline: t(`sd_proto_d${d}_badge`, `DOMAIN ${d}`),
          badge: `DOMAIN ${d}`,
          title: t(`sd_proto_d${d}_title`, `Domain ${d}`),
          footerMeta: t(`sd_proto_d${d}_badge`, `DOMAIN ${d}`),
          desc: t(`sd_proto_d${d}_desc`, ""),
          subCards: [1, 2, 3, 4, 5, 6].map((r) => ({
            id: `proto_d${d}_r${r}`,
            icon: t("icon_check_circle", "check_circle"),
            title: t(`sd_proto_d${d}_r${r}_title`, ""),
            desc: t(`sd_proto_d${d}_r${r}_desc`, ""),
          })),
        })),
      },
    ],
  };
}

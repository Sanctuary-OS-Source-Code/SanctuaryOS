import { DirectiveSlug } from "../directivesSync";
import type { DirectiveBuilderSchema, DirectiveBuilderCard } from "./types";
import { CURRENT_DIRECTIVE_SCHEMA_VERSION, defaultT, interpolateDynamicText } from "./types";

export function getDefaultDirectiveBuilderSchema(
  slug: DirectiveSlug,
  t: (key: string, fallback?: string) => string = defaultT
): DirectiveBuilderSchema {
  const g = (txt: string) => interpolateDynamicText(t, txt);
  const elevatedRolesCards: DirectiveBuilderCard[] = [
    {
      id: "role_citizen",
      icon: t("icon_person", "person"),
      overline: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      badge: t("role_citizen", "{Citizen}"),
      title: t("role_citizen", "{Citizen}"),
      footerMeta: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
      desc: t(
        "dir_proto_r1_scope",
        "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions & unrestricted OS Bug Reports."
      ),
      status: "citizen",
      subCards: [
        {
          id: "role_cit_s1",
          icon: t("icon_inventory_2", "inventory_2"),
          title: t("dir_role_cit_s1_title", "9 Core {Citizen} Sectors & Symlink Airgap"),
          desc: t(
            "dir_role_cit_s1_desc",
            "Full offline and online access to Command Center, Your {Vault}, The Nexus, {Blueprints}, Comm-Link, Conflict Radar, Homestead {Lab}, {Citizen}'s Workbench, and {Backups}."
          ),
        },
        {
          id: "role_cit_s2",
          icon: t("icon_handyman", "handyman"),
          title: t("dir_role_cit_s2_title", "Inherited Open {Mason} Workshop & Static Edge Push"),
          desc: t(
            "dir_role_cit_s2_desc",
            "Build {mods} in Dev Sandbox, package .sanctuary.manifest.json / catalog.json releases, and 1-click Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, or WebDAV."
          ),
        },
        {
          id: "role_cit_s3",
          icon: t("icon_travel_explore", "travel_explore"),
          title: t("dir_role_cit_s3_title", "Scout Queue Discovery Submissions"),
          desc: t(
            "dir_role_cit_s3_desc",
            "Scan local Tier-0 {mods}, complete local {Lab} verification proof, and submit verified SHA-256 metadata to the crowd-sourced Scout Queue."
          ),
        },
        {
          id: "role_cit_s4",
          icon: t("icon_support_agent", "support_agent"),
          title: t("dir_role_cit_s4_title", "Tier-0 {Blueprint} Support & OS Bug Reports"),
          desc: t(
            "dir_role_cit_s4_desc",
            "Submit Community {Mod} Support when your active {Blueprint} holds only verified Tier-0 {mods} (no {Vault} file deletion), or file an OS Bug Report directly to Keepers with zero {mod} telemetry."
          ),
        },
      ],
    },
    {
      id: "role_mason",
      icon: t("icon_construction", "construction"),
      overline: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("dir_proto_r2_role", "Verified {Mason}"),
      footerMeta: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
      desc: t(
        "dir_proto_r2_scope",
        "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_mas_s1",
          icon: t("icon_rocket_launch", "rocket_launch"),
          title: t("dir_role_mas_s1_title", "Verified Fast-Lane & Direct Nexus Publishing"),
          desc: t(
            "dir_role_mas_s1_desc",
            "Bypass crowd Scout vote thresholds to submit verified Tier-0 {mods}, Lexicons, Chameleons, and Workbench Templates straight to Architect triage."
          ),
        },
        {
          id: "role_mas_s2",
          icon: t("icon_storefront", "storefront"),
          title: t("dir_role_mas_s2_title", "Public {Mason} Profile & Suite Showcases"),
          desc: t(
            "dir_role_mas_s2_desc",
            "Curate your creator banner, featured {mod} suites, Highlander Exclusive Slots, dependency trees, and multi-range version rules on your public profile."
          ),
        },
        {
          id: "role_mas_s3",
          icon: t("icon_campaign", "campaign"),
          title: t("dir_role_mas_s3_title", "Creator Comm-Link {Dispatches} & Changelogs"),
          desc: t(
            "dir_role_mas_s3_desc",
            "Broadcast Markdown release notes, polling updates, and update alerts directly to subscribed {Citizens} on Comm-Link."
          ),
        },
        {
          id: "role_mas_s4",
          icon: t("icon_volunteer_activism", "volunteer_activism"),
          title: t("dir_role_mas_s4_title", "0%-Cut Supporter Bridge & Static Manifests"),
          desc: t(
            "dir_role_mas_s4_desc",
            "Connect Patreon, Ko-fi, or custom supporter links with 0% Sanctuary cut, and publish Tier 1–4 {mods} responsibly via decentralized Static Edge manifests."
          ),
        },
      ],
    },
    {
      id: "role_architect",
      icon: t("icon_architecture", "architecture"),
      overline: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("architect", "Architect"),
      footerMeta: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
      desc: t(
        "dir_proto_r3_scope",
        "Unlocks Architect Console (strictly isolated to Compliance Tier 0 Stable records): Registry curation, Verified {Mason} & Scout Queue triage, Conflict Matrix, Known Exception Rules, Template Oversight, and Claimable {Citizen} Support Desk tickets."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_arc_s1",
          icon: t("icon_fact_check", "fact_check"),
          title: t("dir_role_arc_s1_title", "Tier-0 Global Registry & 3-Tile Studio Curation"),
          desc: t(
            "dir_role_arc_s1_desc",
            "Maintain verified Tier-0 Nexus records, configure Parent/Child suite trees, Highlander Exclusive Slots, and multi-range game compatibility."
          ),
        },
        {
          id: "role_arc_s2",
          icon: t("icon_dynamic_feed", "dynamic_feed"),
          title: t("dir_role_arc_s2_title", "Verified {Mason} & Scout Queue Triage"),
          desc: t(
            "dir_role_arc_s2_desc",
            "Review unknown/unverified community submissions in Dedicated Queues, run Check Hash verification, and escalate Tier 1–4 flags cleanly to Oversight."
          ),
        },
        {
          id: "role_arc_s3",
          icon: t("icon_warning_amber", "warning_amber"),
          title: t("dir_role_arc_s3_title", "Conflict Matrix & Known Exception Rules"),
          desc: t(
            "dir_role_arc_s3_desc",
            "Author Severity 1–4 conflict directives, review Workbench Templates, and publish database-driven exception diagnosis rules linked to Homestead {Lab} verdicts."
          ),
        },
        {
          id: "role_arc_s4",
          icon: t("icon_support_agent", "support_agent"),
          title: t("dir_role_arc_s4_title", "Claimable {Citizen} Support Desk & Escalation"),
          desc: t(
            "dir_role_arc_s4_desc",
            "Claim and resolve Tier-0 {Citizen} support tickets with PII-scrubbed crash logs and Active {Blueprint} snapshots, escalating sensitive reports to Oversight."
          ),
        },
      ],
    },
    {
      id: "role_oversight",
      icon: t("icon_admin_panel_settings", "admin_panel_settings"),
      overline: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      badge: t("auth_passkey_badge_fido", "FIDO2 PASSKEY"),
      title: t("role_oversight", "Oversight"),
      footerMeta: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
      desc: t(
        "dir_proto_r4_scope",
        "Unlocks Oversight Command: Tier 1–4 & Pending Flag Confirmation, Spoke Heuristic Signatures, Tier 5 Malware blacklisting, DEFCON 1 override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect)."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_ovr_s1",
          icon: t("icon_security", "security"),
          title: t("dir_role_ovr_s1_title", "Tier 1–4 Compliance & Pending Flag Review"),
          desc: t(
            "dir_role_ovr_s1_desc",
            "Exclusive reviewer for escalated Tier 1–4 records and Pending community flags—auto-hidden publicly until confirmed or cleared."
          ),
        },
        {
          id: "role_ovr_s2",
          icon: t("icon_gpp_bad", "gpp_bad"),
          title: t("dir_role_ovr_s2_title", "Spoke Heuristics, Tier 5 Blacklists & DEFCON 1"),
          desc: t(
            "dir_role_ovr_s2_desc",
            "Author game-specific antivirus signatures, blacklist Tier 5 Malware SHA-256 hashes, and engage DEFCON 1 pre-patch shields."
          ),
        },
        {
          id: "role_ovr_s3",
          icon: t("icon_published_with_changes", "published_with_changes"),
          title: t("dir_role_ovr_s3_title", "Game/DLC Patches, Mass Triage & {Mason} Linker"),
          desc: t(
            "dir_role_ovr_s3_desc",
            "Register upstream engine versions and DLC catalogs, run multi-range compatibility mass updates, and claim-link creator registries."
          ),
        },
        {
          id: "role_ovr_s4",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          title: t("dir_role_ovr_s4_title", "Spoke Identity Governance & Audit Logs"),
          desc: t(
            "dir_role_ovr_s4_desc",
            "Promote/demote roles up to Architect, handle escalated security tickets, and inspect read/export-only Spoke audit trails."
          ),
        },
      ],
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
        "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), secret-free SANCTUARY-UPLINK:// bundle export & 1-click Gateway Token rotation, unilateral Cut the Cord severance, Master Schema & Lexicon Studios, 0%-Cut Donations, and The Dispatch."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_way_s1",
          icon: t("icon_hub", "hub"),
          title: t("dir_role_way_s1_title", "Spoke Sovereignty, Covenants & Cut the Cord"),
          desc: t(
            "dir_role_way_s1_desc",
            "Rotate Spoke Gateway Tokens in 1 click, export secret-free SANCTUARY-UPLINK:// bundles, inspect Partner Covenants, or trigger irreversible high-friction severance from the Core Hub."
          ),
        },
        {
          id: "role_way_s2",
          icon: t("icon_schema", "schema"),
          title: t("dir_role_way_s2_title", "Master Schema Studio & Fork Branding"),
          desc: t(
            "dir_role_way_s2_desc",
            "Configure paths, binary headers, install routes, default Chameleon themes, Title Area headers (Standalone mode), and Spoke Lexicon packs."
          ),
        },
        {
          id: "role_way_s3",
          icon: t("icon_manage_accounts", "manage_accounts"),
          title: t("dir_role_way_s3_title", "Full Identity Matrix & Tier 1–4 Authority"),
          desc: t(
            "dir_role_way_s3_desc",
            "Appoint Oversight admins and peer Wayfinders, confirm or dismiss compliance flags, and run in-hub Mass Update compatibility sweeps."
          ),
        },
        {
          id: "role_way_s4",
          icon: t("icon_volunteer_activism", "volunteer_activism"),
          title: t("dir_role_way_s4_title", "0%-Cut Donations, Cost Ledgers & The Dispatch"),
          desc: t(
            "dir_role_way_s4_desc",
            "Publish transparent monthly infrastructure cost ledgers, collect 100% Wayfinder-owned donations, and broadcast top-banner polls."
          ),
        },
        {
          id: "role_way_s5",
          icon: t("icon_support", "support"),
          title: t("dir_role_way_s5_title", "Wayfinder Audit Trails & Keepers Uplink"),
          desc: t(
            "dir_role_way_s5_desc",
            "Audit every Spoke moderation action chronologically and communicate directly with Core Keepers via Wayfinder Support."
          ),
        },
      ],
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
        "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Turnkey Spoke Onboarding, Core Heuristics, Threat Manifests, Master Game Schemas, Global Lexicons/Chameleons, Bilateral Directives Sync, OS Bug Reports, and Global Audit Logs."
      ),
      status: "passkey",
      subCards: [
        {
          id: "role_kpr_s1",
          icon: t("icon_dns", "dns"),
          title: t("dir_role_kpr_s1_title", "Partner Spoke Onboarding & Dev Cloaking"),
          desc: t(
            "dir_role_kpr_s1_desc",
            "Review Partner Spoke Applications, validate schema readiness, toggle Keepers-Only dev workspaces, and oversee Federation uptime."
          ),
        },
        {
          id: "role_kpr_s2",
          icon: t("icon_verified_user", "verified_user"),
          title: t("dir_role_kpr_s2_title", "Core Heuristics & Threat Manifests"),
          desc: t(
            "dir_role_kpr_s2_desc",
            "Maintain global malware regex signatures (keeper_heuristic_signatures) and triage Zero-PII Threat Manifest submissions from quarantined files."
          ),
        },
        {
          id: "role_kpr_s3",
          icon: t("icon_sync", "sync"),
          title: t("dir_role_kpr_s3_title", "Bilateral Directives, Schemas & Lexicons"),
          desc: t(
            "dir_role_kpr_s3_desc",
            "Author and sync System Directives, Legal Covenants, Default Schemas, Core Aesthetics, and Global Lexicon baselines without app rebuilds."
          ),
        },
        {
          id: "role_kpr_s4",
          icon: t("icon_bug_report", "bug_report"),
          title: t("dir_role_kpr_s4_title", "OS Bug Reports (`keeper_tickets`) & Releases"),
          desc: t(
            "dir_role_kpr_s4_desc",
            "Triage cross-platform OS bug reports (100% free of Spoke mod data/locks), publish Foundry News, and inspect immutable Global Audit Logs."
          ),
        },
      ],
    },
  ];

  if (slug === "citizen_guide") {
    return {
      slug: "citizen_guide",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: t("sd_card_guide_title", "Interactive {Citizen} Guide & OS Walkthrough"),
      summary: t(
        "sd_card_guide_desc",
        "10-stage interactive walkthrough of Sanctuary OS, 12 operational & creator modules (including Static Edge Direct Push, Master Schema & Lexicon Studios, and Spoke Covenants), and the 6-Tier Clearance Hierarchy."
      ),
      tabs: [
        {
          id: "walkthrough",
          icon: t("icon_play_circle", "play_circle"),
          label: t("dir_guide_mode_walk_v58_lbl", "10 STAGES"),
          value: t("dir_guide_mode_walk_val", "OS Walkthrough"),
          cards: [
            {
              id: "walk_1",
              icon: t("icon_space_dashboard", "space_dashboard"),
              overline: "STAGE 1 OF 10",
              badge: t("dir_walk_s1_short", "1. Shell & Bars"),
              title: t("dir_walk_s1_title", "Global Shell: Sidebar, Top Control Capsule & Telemetry Toast"),
              footerMeta: t("dir_walk_s1_sub", "Persistent Glass Frame & Context-Aware Navigation"),
              desc: t(
                "dir_walk_s1_desc",
                "Sanctuary OS is framed by persistent Liquid Glass regions that adapt automatically between the Foundry Landing Page and your mounted Game Workspaces."
              ),
              subCards: [
                {
                  id: "walk_1_c1",
                  icon: t("icon_menu", "menu"),
                  title: t("dir_walk_s1_c1_name", "Left Navigation Sidebar"),
                  desc: t(
                    "dir_walk_s1_c1_desc",
                    "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 {Citizen} modules, unlocked Command Hubs, and the Quick Launch button."
                  ),
                },
                {
                  id: "walk_1_c2",
                  icon: t("icon_sports_esports", "sports_esports"),
                  title: t("dir_walk_s1_c2_name", "Top-Right Control Capsule, Jump Gate & Deck Overdrive"),
                  desc: t(
                    "dir_walk_s1_c2_desc",
                    "Houses the Active Workspace Selector, System Queues & Utilities, Notification Center, Jump Gate (Ctrl+K / Cmd+K), and 7-Domain {Settings} inside one unified glass capsule—paired with the Deck Overdrive controller engine."
                  ),
                },
                {
                  id: "walk_1_c3",
                  icon: t("icon_monitoring", "monitoring"),
                  title: t("dir_walk_s1_c3_name", "Live Telemetry Toast & System Log History"),
                  desc: t(
                    "dir_walk_s1_c3_desc",
                    "Surfaces a transient bottom-right telemetry toast during active scans or alerts—opening System Log History on click—alongside Command Center quick actions for Radar Sweep and {Vault} Lockdown."
                  ),
                },
              ],
            },
            {
              id: "walk_2",
              icon: t("icon_explore", "explore"),
              overline: "STAGE 2 OF 10",
              badge: t("dir_walk_s2_short", "2. Cartographer"),
              title: t("dir_walk_s2_title", "Mounting a Workspace & Cartographer (Win, Mac & Linux / SteamOS)"),
              footerMeta: t("dir_walk_s2_sub", "First-Boot Coordinate Mapping & Native PE/Plist/Proton Ripper"),
              desc: t(
                "dir_walk_s2_desc",
                "Selecting a workspace on the Landing Page launches The Cartographer to link your Windows (.exe), macOS (.app), or Linux / SteamOS (Proton compatdata) game binary, live {Mods} directory, and airgapped {Vault} storage."
              ),
              subCards: [
                {
                  id: "walk_2_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: t("dir_walk_s2_c1_name", "Bin Folder (Windows .exe, macOS .app & Linux / Proton)"),
                  desc: t(
                    "dir_walk_s2_c1_desc",
                    "Points to your game binary (.exe or .app). Sanctuary extracts the genuine patch version in-process via Rust pelite or macOS Info.plist across native and Proton prefixes."
                  ),
                },
                {
                  id: "walk_2_c2",
                  icon: t("icon_folder_open", "folder_open"),
                  title: t("dir_walk_s2_c2_name", "{Mods} Folder (Symlink Target)"),
                  desc: t(
                    "dir_walk_s2_c2_desc",
                    "Your live game {Mods} folder. Keep this untouched—Sanctuary projects active {mods} here via zero-copy OS symlinks and custom install_routes."
                  ),
                },
                {
                  id: "walk_2_c3",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: t("dir_walk_s2_c3_name", "{Vault} Folder (Deep Archive)"),
                  desc: t(
                    "dir_walk_s2_c3_desc",
                    "Your isolated storage directory where Sanctuary builds {Mods}/, {Blueprints}/, Backups/World/, Backups/Engine/, Backups/Mods/, Quarantine/, and Data/Cache/."
                  ),
                },
              ],
            },
            {
              id: "walk_3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: "STAGE 3 OF 10",
              badge: t("dir_walk_s3_short", "3. {Vault} & Cards"),
              title: t("dir_walk_s3_title", "Your {Vault}, {Mod} Cards & Unified Filter Bar"),
              footerMeta: t("dir_walk_s3_sub", "Drag-and-Drop Ingestion, Suite Grouping & Dossiers"),
              desc: t(
                "dir_walk_s3_desc",
                "Every {mod} you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Bytecode Hound Core + Spoke Heuristic Engine, and indexed in Your {Vault}."
              ),
              subCards: [
                {
                  id: "walk_3_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s3_c1_name", "Unified Search & Filters Bar"),
                  desc: t(
                    "dir_walk_s3_c1_desc",
                    "Instant search bar, Filters popover for Game Version and Eligible-Only filtering, sort order, and bulk selection actions."
                  ),
                },
                {
                  id: "walk_3_c2",
                  icon: t("icon_toggle_on", "toggle_on"),
                  title: t("dir_walk_s3_c2_name", "Parent Suite Card & Equip Toggle"),
                  desc: t(
                    "dir_walk_s3_c2_desc",
                    "Toggles symlinks in milliseconds. Multi-part {mod} suites group into one Parent Card with an expandable Linked Modules drawer."
                  ),
                },
                {
                  id: "walk_3_c3",
                  icon: t("icon_menu_book", "menu_book"),
                  title: t("dir_walk_s3_c3_name", "{Mod} Dossier Drawer"),
                  desc: t(
                    "dir_walk_s3_c3_desc",
                    "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static .sanctuary.manifest.json / catalog.json URL, or inspect module files."
                  ),
                },
              ],
            },
            {
              id: "walk_4",
              icon: t("icon_map", "map"),
              overline: "STAGE 4 OF 10",
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
                  desc: t(
                    "dir_walk_s4_c1_desc",
                    "Switch between playstyles (e.g. Realism Run, Overhaul Profile, Patch Testing) directly from the {Vault} header, {Blueprints} view, or Top-Right Control Capsule."
                  ),
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
                  desc: t(
                    "dir_walk_s4_c3_desc",
                    "Generates a 6-character share code (SNCXXX) or publishes your {Blueprint} to The Nexus while auto-stripping flagged Tier 1–4 hashes."
                  ),
                },
              ],
            },
            {
              id: "walk_5",
              icon: t("icon_radar", "radar"),
              overline: "STAGE 5 OF 10",
              badge: t("dir_walk_s5_short", "5. Radar & Lab"),
              title: t("dir_walk_s5_title", "Conflict Radar 2.0 & Groundhog Sandbox"),
              footerMeta: t("dir_walk_s5_sub", "5-Tier Severity Matrix, Priority Compiler & Isolated Sandbox"),
              desc: t(
                "dir_walk_s5_desc",
                "Resolve mod collisions across a 5-Tier Severity Matrix, set load order winners in one click via Priority Compiler, or isolate suspect {mods} inside Groundhog Sandbox."
              ),
              subCards: [
                {
                  id: "walk_5_c1",
                  icon: t("icon_emoji_events", "emoji_events"),
                  title: t("dir_walk_s5_c1_name", "5-Tier Severity Radar & 1-Click Winner"),
                  desc: t(
                    "dir_walk_s5_c1_desc",
                    "Classifies collisions across Severity 1–5 and lets you click 'Set Winner' in one click to promote your chosen {mod} into an elevated Priority Tier."
                  ),
                },
                {
                  id: "walk_5_c2",
                  icon: t("icon_rule", "rule"),
                  title: t("dir_walk_s5_c2_name", "Priority Compiler & Loop Breaker"),
                  desc: t(
                    "dir_walk_s5_c2_desc",
                    "Assign game-agnostic Priority Tiers (Standard Load to Final Override), build Must Load After/Before rules with 1-click Break Loop, and adapt automatically between folder-tier and sequential load order engines."
                  ),
                },
                {
                  id: "walk_5_c3",
                  icon: t("icon_science", "science"),
                  title: t("dir_walk_s5_c3_name", "Groundhog Sandbox & Save Airgap"),
                  desc: t(
                    "dir_walk_s5_c3_desc",
                    "Snapshots save_airgap_targets (saves & user profiles), boots with only the test {mod} (or 1v1 pair), harvests crash logs, and restores your saves."
                  ),
                },
              ],
            },
            {
              id: "walk_6",
              icon: t("icon_construction", "construction"),
              overline: "STAGE 6 OF 10",
              badge: t("dir_walk_s6_short", "6. IDE & Backups"),
              title: t("dir_walk_s6_title", "Live-Wire Workbench & {Backups}"),
              footerMeta: t("dir_walk_s6_sub", "Visual Config Sync, Live-Wire Diff & Hardlink Snapshots"),
              desc: t(
                "dir_walk_s6_desc",
                "Edit 430+ setting {mod} config files visually at 60 FPS, sync live in-game config writes back to the {Vault}, and safeguard saves with hardlink snapshots."
              ),
              subCards: [
                {
                  id: "walk_6_c1",
                  icon: t("icon_tune", "tune"),
                  title: t("dir_walk_s6_c1_name", "Live-Wire Config Watcher"),
                  desc: t(
                    "dir_walk_s6_c1_desc",
                    "Category Pill Bar, dual Min/Max range steppers, Undo/Reset, plus the Dynamic Config Watcher that syncs in-game .cfg/.ini/.json edits back to your {Vault}."
                  ),
                },
                {
                  id: "walk_6_c2",
                  icon: t("icon_compare_arrows", "compare_arrows"),
                  title: t("dir_walk_s6_c2_name", "Timeline & Live-Wire Diff"),
                  desc: t(
                    "dir_walk_s6_c2_desc",
                    "Compare live unsaved edits or historical snapshots side-by-side in Visual Diff cards or Raw Monaco Code Diff."
                  ),
                },
                {
                  id: "walk_6_c3",
                  icon: t("icon_history", "history"),
                  title: t("dir_walk_s6_c3_name", "{Backups} (World State & Engine Core)"),
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
              overline: "STAGE 7 OF 10",
              badge: t("dir_walk_s7_short", "7. Hubs & Security"),
              title: t("dir_walk_s7_title", "Zero-Knowledge Seal & Bytecode Hound"),
              footerMeta: t("dir_walk_s7_sub", "Bytecode Hound, FIDO2 Passkeys & Zero-Choice Lockdown"),
              desc: t(
                "dir_walk_s7_desc",
                "Every {Citizen} inherits the local Creator Airlock, while hardware FIDO2 Passkeys and the Bytecode Hound Heuristic Scanner protect the OS."
              ),
              subCards: [
                {
                  id: "walk_7_c1",
                  icon: t("icon_handyman", "handyman"),
                  title: t("dir_walk_s7_c1_name", "Creator Airlock ({Citizen} Tier)"),
                  desc: t(
                    "dir_walk_s7_c1_desc",
                    "All {Citizens} can use Dev Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge (6 Liquid Glass sliders), and Static Edge Release Packaging."
                  ),
                },
                {
                  id: "walk_7_c2",
                  icon: t("icon_passkey", "passkey"),
                  title: t("dir_walk_s7_c2_name", "Gatekeeper Clearance & FIDO2 {Vault}"),
                  desc: t(
                    "dir_walk_s7_c2_desc",
                    "Elevated clearances (Verified {Mason} through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security {Vault} drawer."
                  ),
                },
                {
                  id: "walk_7_c3",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: t("dir_walk_s7_c3_name", "Bytecode Hound & Zero-Choice Lockdown"),
                  desc: t(
                    "dir_walk_s7_c3_desc",
                    "Decompresses Zlib/Zstd binary module streams and Base64/Hex strings against Core + Spoke rules, locking the OS with Move-mode source disposition and Secure Shred."
                  ),
                },
              ],
            },
            {
              id: "walk_8",
              icon: t("icon_cloud_upload", "cloud_upload"),
              overline: "STAGE 8 OF 10",
              badge: t("dir_walk_s8_short", "8. Static Edge"),
              title: t("dir_walk_s8_title", "Edge Pulse & Static Manifest Engine"),
              footerMeta: t("dir_walk_s8_sub", ".sanctuary.manifest.json • catalog.json • Lineage Hash Rollover"),
              desc: t(
                "dir_walk_s8_desc",
                "Publish {mod} updates without a central server using static .sanctuary.manifest.json or multi-{mod} catalog.json endpoints with 1-click Edge Direct Push and automatic SHA-256 lineage rollover."
              ),
              subCards: [
                {
                  id: "walk_8_c1",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: t("dir_walk_s8_c1_name", "Edge Direct Push (6 Providers)"),
                  desc: t(
                    "dir_walk_s8_c1_desc",
                    "Push .sanctuary.manifest.json or catalog.json directly from your PC to GitHub Repo/Cloudflare Pages, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
                  ),
                },
                {
                  id: "walk_8_c2",
                  icon: t("icon_history", "history"),
                  title: t("dir_walk_s8_c2_name", "Automatic Lineage Hash Rollover"),
                  desc: t(
                    "dir_walk_s8_c2_desc",
                    "Exporting a new version automatically rolls prior v1.0 hashes into previous_hashes so {Citizens} get instant Update Available alerts and in-place file replacement."
                  ),
                },
                {
                  id: "walk_8_c3",
                  icon: t("icon_library_books", "library_books"),
                  title: t("dir_walk_s8_c3_name", "Single Master catalog.json Support"),
                  desc: t(
                    "dir_walk_s8_c3_desc",
                    "Point all of your {mods} to one shared catalog.json URL—Sanctuary OS matches each installed {mod} by artifact ID, current_hashes, or previous_hashes."
                  ),
                },
              ],
            },
            {
              id: "walk_9",
              icon: t("icon_schema", "schema"),
              overline: "STAGE 9 OF 10",
              badge: t("dir_walk_s9_short", "9. Schema & Lexicon"),
              title: t("dir_walk_s9_title", "Universal Master Schema & Code-Switch"),
              footerMeta: t("dir_walk_s9_sub", "7 Engine Presets • 21 {Glossary} Tokens • Guided Icon Builder"),
              desc: t(
                "dir_walk_s9_desc",
                "Configure any game engine across Windows, macOS, and Linux / SteamOS with Schema Forge, and hot-swap all 1,700+ OS strings and icons with Code-Switch."
              ),
              subCards: [
                {
                  id: "walk_9_c1",
                  icon: t("icon_schema", "schema"),
                  title: t("dir_walk_s9_c1_name", "7 Engine Presets & Schema Forge"),
                  desc: t(
                    "dir_walk_s9_c1_desc",
                    "Load built-in engine architecture presets—complete with declarative install_routes, load-order strategies, and mod_categories—or author a custom Universal schema."
                  ),
                },
                {
                  id: "walk_9_c2",
                  icon: t("icon_translate", "translate"),
                  title: t("dir_walk_s9_c2_name", "21 Dynamic {Glossary} Tokens & Parity Alert"),
                  desc: t(
                    "dir_walk_s9_c2_desc",
                    "Editing {Mod}, {Vault}, or {Blueprint} updates 1,700+ strings with automatic Title/lower/UPPER casing, a/an grammar, and live cloud updates without rebuilding the app."
                  ),
                },
                {
                  id: "walk_9_c3",
                  icon: t("icon_Apps", "apps"),
                  title: t("dir_walk_s9_c3_name", "Lexicon Codex & Icon Override Studio"),
                  desc: t(
                    "dir_walk_s9_c3_desc",
                    "Search and remap any OS Material Symbol icon visually with side-by-side Default → New glyph previews, or open the interactive Schema & Lexicon Codex."
                  ),
                },
              ],
            },
            {
              id: "walk_10",
              icon: t("icon_handshake", "handshake"),
              overline: "STAGE 10 OF 10",
              badge: t("dir_walk_s10_short", "10. Support & Partners"),
              title: t("dir_walk_s10_title", "Sovereign Covenants & Partner Spokes"),
              footerMeta: t("dir_walk_s10_sub", "$5 = +30 Days Dev Builds • 0% Partner Cut • Sovereign Covenants"),
              desc: t(
                "dir_walk_s10_desc",
                "Submit Core OS feedback or bug reports from the Landing Page, unlock Dev Builds via the Supporter Pipeline, or apply to launch a Sovereign Partner Spoke."
              ),
              subCards: [
                {
                  id: "walk_10_c1",
                  icon: t("icon_Favorite", "favorite"),
                  title: t("dir_walk_s10_c1_name", "Supporter Pipeline ($5 = +30 Days Dev Builds)"),
                  desc: t(
                    "dir_walk_s10_c1_desc",
                    "Every $5 contribution adds +30 days of automated Dev Build access (Windows .msi, macOS .dmg & Linux / SteamOS .AppImage/.deb) verified via Stripe Receipt / Order ID."
                  ),
                },
                {
                  id: "walk_10_c2",
                  icon: t("icon_gavel", "gavel"),
                  title: t("dir_walk_s10_c2_name", "Readiness-Gated Partner Spoke Application"),
                  desc: t(
                    "dir_walk_s10_c2_desc",
                    "Review the Sanctuary Partners Agreement and Compliance Protocol in an interactive overlay drawer, verify your schema.sql Spoke readiness, and retain 100% of community donations."
                  ),
                },
                {
                  id: "walk_10_c3",
                  icon: t("icon_cloud_sync", "cloud_sync"),
                  title: t("dir_walk_s10_c3_name", "Offline Codebase Baseline + Live Cloud Updates"),
                  desc: t(
                    "dir_walk_s10_c3_desc",
                    "Bundled .md, schema, and lexicon files power instant first-launch & offline use, while connected desktops receive live cloud updates without reinstalling."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "modules",
          icon: t("icon_explore", "explore"),
          label: g("12 MODULES"),
          value: g("{Citizen} Tools"),
          cards: [
            {
              id: "mod_1",
              icon: t("icon_explore", "explore"),
              overline: "MODULE 1 OF 12",
              badge: g("1. Cartographer"),
              title: g("Cartographer Initialization & System Coordinates"),
              footerMeta: g("INITIAL SETUP • 3 COORDINATES"),
              desc: g(
                "On first boot, the Cartographer maps your machine's file system and extracts your genuine game engine version directly from the binary executable (.exe / .app) using an in-process Rust PE/plist parser."
              ),
              tip: g(
                "Click the Cloud Auto-Detect icon during setup to automatically locate your Game Bin and {Mods} directories for the active workspace."
              ),
              subCards: [
                {
                  id: "mod_1_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: g("Game Bin Folder (Live Engine)"),
                  desc: g(
                    "Where your game executable lives. Sanctuary reads PE headers directly from the .exe (or macOS .app Info.plist) to guarantee 100% patch version accuracy with zero antivirus false positives."
                  ),
                },
                {
                  id: "mod_1_c2",
                  icon: t("icon_folder_open", "folder_open"),
                  title: g("Active {Mods} Folder (Symlink Target)"),
                  desc: g(
                    "Your game's live {Mods} folder. Never drop files here manually—Sanctuary projects high-speed symlinks into this directory from your isolated {Vault}."
                  ),
                },
                {
                  id: "mod_1_c3",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: g("Isolated {Vault} Folder (Deep Storage)"),
                  desc: g(
                    "Your airgapped archive containing {Mods}/, {Blueprints}/, Backups/World, Backups/Engine, Backups/Mods, Quarantine/, and Data/Cache (.sanctuary_cache.db)."
                  ),
                },
                {
                  id: "mod_1_c4",
                  icon: t("icon_verified_user", "verified_user"),
                  title: g("Windows, macOS & Linux / SteamOS Symlink Permissions"),
                  desc: g(
                    "Enable Windows Developer Mode (or macOS Full Disk Access; native POSIX symlinks on Linux & SteamOS) so the Airgap engine can project zero-byte symlinks and manage com.apple.quarantine attributes cleanly."
                  ),
                },
              ],
            },
            {
              id: "mod_2",
              icon: t("icon_space_dashboard", "space_dashboard"),
              overline: "MODULE 2 OF 12",
              badge: g("2. Command Center"),
              title: g("The Command Center & Live Telemetry"),
              footerMeta: g("SYSTEM DASHBOARD • 4 HEALTH STATES"),
              desc: g(
                "Your high-level glassmorphic mission control. Monitors the health of your active {Blueprint}, surfaces {mason} updates and system dispatches, and provides 1-click access to Radar Sweeps and {Vault} Lockdown."
              ),
              tip: g(
                "Use Command Center quick actions or the Top-Right Control Capsule to trigger a Radar Sweep, inspect System Queues, or engage instant {Vault} Lockdown."
              ),
              subCards: [
                {
                  id: "mod_2_c1",
                  icon: t("icon_check_circle", "check_circle"),
                  title: g("System Stable (Green State)"),
                  desc: g(
                    "All equipped {mods} match your active game version, all required DLCs and dependencies are satisfied, and zero unmitigated collisions exist."
                  ),
                },
                {
                  id: "mod_2_c2",
                  icon: t("icon_system_update_alt", "system_update_alt"),
                  title: g("{Mod} Updates Available (Blue State)"),
                  desc: g(
                    "Newer SHA-256 versions have been detected either via the Spoke Cloud Registry or decentralized {mason} .sanctuary.manifest.json / catalog.json endpoints."
                  ),
                },
                {
                  id: "mod_2_c3",
                  icon: t("icon_warning", "warning"),
                  title: g("{Citizen} Action Recommended (Amber State)"),
                  desc: g(
                    "An equipped {mod} is flagged as Unstable or has an unresolved Severity 3 Tuning Overlap awaiting a Load Order winner."
                  ),
                },
                {
                  id: "mod_2_c4",
                  icon: t("icon_error", "error"),
                  title: g("Critical Failure Detected (Red State)"),
                  desc: g(
                    "An equipped {mod} is Corrupted, incompatible with your Game Patch, missing a mandatory dependency/DLC, or locked in a Severity 4 Fatal Clash."
                  ),
                },
              ],
            },
            {
              id: "mod_3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: "MODULE 3 OF 12",
              badge: g("3. Your {Vault}"),
              title: g("Symlink Airgap & Your {Vault}"),
              footerMeta: g("ISOLATED STORAGE • SHA-256 DNA"),
              desc: g(
                "Your local {vault} and secured asset bunker. The game engine never touches your {Vault} directly—files are ingested, hashed via SHA-256, scanned by Bytecode Hound, and projected via symlinks."
              ),
              tip: g(
                "Your Local {Mod} Dossier is decoupled from the cloud—you can freely customize {mod} titles, creator URLs, cover images, and tags locally."
              ),
              subCards: [
                {
                  id: "mod_3_c1",
                  icon: t("icon_fingerprint", "fingerprint"),
                  title: g("Global Drop-Zone & DNA Match"),
                  desc: g(
                    "Drag and drop supported {mod} binaries, .zip, .rar, .7z, .tar.zst, or .sanctuary.override.json files anywhere into Sanctuary OS. Duplicate SHA-256 hashes are automatically intercepted."
                  ),
                },
                {
                  id: "mod_3_c2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("Edge Pulse (.sanctuary.override.json)"),
                  desc: g(
                    "When a {mod} archive includes a {mason}'s .sanctuary.override.json, Sanctuary binds its SHA-256 lineage to the {mason}'s static .sanctuary.manifest.json or catalog.json URL for serverless update alerts."
                  ),
                },
                {
                  id: "mod_3_c3",
                  icon: t("icon_delete_sweep", "delete_sweep"),
                  title: g("Deep Yeet"),
                  desc: g(
                    "Removing a core master library (such as a shared framework) automatically alerts you and queues all dependent add-ons so your loadout never breaks."
                  ),
                },
                {
                  id: "mod_3_c4",
                  icon: t("icon_visibility_off", "visibility_off"),
                  title: g("Ghosted Diagnostic States"),
                  desc: g(
                    "Incompatible or broken {mods} automatically enter a translucent Ghosted state with hover tooltips detailing Missing DLC, Version Mismatches, or Collisions."
                  ),
                },
              ],
            },
            {
              id: "mod_4",
              icon: t("icon_map", "map"),
              overline: "MODULE 4 OF 12",
              badge: g("4. {Blueprints}"),
              title: g("{Blueprints} & Tactical Loadouts"),
              footerMeta: g("INSTANT HOT-SWAP • CLOUD & OFFLINE"),
              desc: g(
                "Replace manual folder shuffling with {Blueprints}. Switch between completely different {mod} loadouts in seconds without duplicating files on your hard drive."
              ),
              tip: g(
                "Use 'Snapshot Active {Blueprint}' anytime to clone your currently deployed loadout into an experimental profile before adding new {mods}."
              ),
              subCards: [
                {
                  id: "mod_4_c1",
                  icon: t("icon_swap_horiz", "swap_horiz"),
                  title: g("1-Click {Blueprint} Hot-Swap"),
                  desc: g(
                    "Switch active loadouts directly from the {Vault} header or {Blueprints} view. Sanctuary instantly re-projects the exact symlinks and load order for that profile."
                  ),
                },
                {
                  id: "mod_4_c2",
                  icon: t("icon_tag", "tag"),
                  title: g("6-Digit Cloud Uplink (SNCXXX)"),
                  desc: g(
                    "Share your loadout with the community or across devices using a compact 6-character alphanumeric coordinate code."
                  ),
                },
                {
                  id: "mod_4_c3",
                  icon: t("icon_data_object", "data_object"),
                  title: g("Offline JSON Import/Export with modMeta"),
                  desc: g(
                    "Export portable JSON {blueprints} that embed your custom Local Dossier metadata (author links, custom names) and workspace ID for 100% offline preservation."
                  ),
                },
                {
                  id: "mod_4_c4",
                  icon: t("icon_install_mobile", "install_mobile"),
                  title: g("Remote Mobile/Web Queue Staging"),
                  desc: g(
                    "Browse The Nexus on your phone or tablet, stage a {blueprint} queue encrypted in the cloud, and approve it in one click when you sit down at your PC."
                  ),
                },
              ],
            },
            {
              id: "mod_5",
              icon: t("icon_hub", "hub"),
              overline: "MODULE 5 OF 12",
              badge: g("5. Nexus & Browser"),
              title: g("The Nexus & Integrated Side Browser"),
              footerMeta: g("METADATA REGISTRY • ZERO-TAX DISCOVERY"),
              desc: g(
                "Discover verified {Mods}, {Blueprints}, Lexicons, Chameleons, and Workbench Templates—and download directly from creator pages using the built-in Side Browser."
              ),
              tip: g(
                "You can toggle the Integrated Side Browser on or off anytime in System Preferences -> Network depending on whether you prefer in-app or external browsing."
              ),
              subCards: [
                {
                  id: "mod_5_c1",
                  icon: t("icon_tune", "tune"),
                  title: g("Smart Compatibility Filtering"),
                  desc: g(
                    "The Nexus automatically cross-references your installed Game Patch and owned DLCs, highlighting compatible releases and enforcing Tier-0 public safety."
                  ),
                },
                {
                  id: "mod_5_c2",
                  icon: t("icon_download", "download"),
                  title: g("Automatic Download Interception"),
                  desc: g(
                    "Clicking download on a creator's page inside the Integrated Side Browser automatically intercepts the archive and routes it straight into your {Vault}."
                  ),
                },
                {
                  id: "mod_5_c3",
                  icon: t("icon_verified", "verified"),
                  title: g("{Mason} Profiles & Direct Attribution"),
                  desc: g(
                    "Follow your favorite {Masons} to see their posts in your Comm-Link feed. Sanctuary takes 0% platform tax and links directly to {mason} Patreon, Ko-fi, and websites."
                  ),
                },
                {
                  id: "mod_5_c4",
                  icon: t("icon_radar", "radar"),
                  title: g("Crowd-Sourced Scout Queue"),
                  desc: g(
                    "Unidentified local {mods} can be submitted via the Scout Dossier or marked 'Flag as Local' to permanently exclude private files from cloud lookups."
                  ),
                },
              ],
            },
            {
              id: "mod_6",
              icon: t("icon_radar", "radar"),
              overline: "MODULE 6 OF 12",
              badge: g("6. Conflict Radar 2.0"),
              title: g("Conflict Radar 2.0 & Game-Agnostic Load Order Engine"),
              footerMeta: g("5-TIER SEVERITY MATRIX • STRATEGY-AWARE LOAD ORDER"),
              desc: g(
                "Sanctuary combines global Architect Directives, creator Static Edge rules, and a strategy-aware topological Load Order compiler to resolve overlaps and prevent crashes before launch."
              ),
              tip: g(
                "Click 'Inspect & Resolve' on any conflict card to select which {mod} wins in-game and assign it to an elevated Priority Tier."
              ),
              subCards: [
                {
                  id: "mod_6_c1",
                  icon: t("icon_emoji_events", "emoji_events"),
                  title: g("1-Click 'Set Winner' & Priority Override Tiers"),
                  desc: g(
                    "Click 'Set Winner' on any conflict or assign {mods} across 4 game-agnostic Priority Tiers (Standard Load, Late Load Tier 1, High Priority Tier 2, Final Override Tier 3)."
                  ),
                },
                {
                  id: "mod_6_c2",
                  icon: t("icon_rule", "rule"),
                  title: g("Directional Load Order Rules & Loop Breaker"),
                  desc: g(
                    "Lock Must Load After (Wins) or Must Load Before (Yields) dependencies between any two {mods}, with automatic DFS circular-loop detection and 1-click Break Loop resolution."
                  ),
                },
                {
                  id: "mod_6_c3",
                  icon: t("icon_warning", "warning"),
                  title: g("5-Tier Severity Matrix (Severity 1–5)"),
                  desc: g(
                    "Classifies overlaps across Severity 5 (Circular Loop), Severity 4 (Fatal Core/Script Clash), Severity 3 (Gameplay Tuning Overlap), Severity 2 (Duplicate Clone), and Severity 1 (Visual/Texture Override)."
                  ),
                },
                {
                  id: "mod_6_c4",
                  icon: t("icon_layers", "layers"),
                  title: g("Searchable Scan Scope & 4 Load Order Engines"),
                  desc: g(
                    "Switch Scan Scope across 100+ {Blueprints} via a searchable selector and compile load order via Priority Override Tiers (dynamic manifest), Manifest List (loadorder.txt), Numeric Prefix (001_), or Timestamp Order."
                  ),
                },
              ],
            },
            {
              id: "mod_7",
              icon: t("icon_science", "science"),
              overline: "MODULE 7 OF 12",
              badge: g("7. Sandbox"),
              title: g("Groundhog Sandbox"),
              footerMeta: g("AIRGAPPED SANDBOX • LIVE CRASH AUTOPSY"),
              desc: g(
                "Test unverified {mods} or pit two conflicting {mods} against each other inside an airgapped sandbox without risking your real save files or main loadout."
              ),
              tip: g(
                "Passing a timed Groundhog Sandbox playtest and saving in-game automatically verifies your Sandbox {mod} for publishing!"
              ),
              subCards: [
                {
                  id: "mod_7_c1",
                  icon: t("icon_bolt", "bolt"),
                  title: g("100% Nuke Symlink Injection"),
                  desc: g(
                    "Temporarily strips your active loadout symlinks and injects only the isolated test subject plus its mandatory dependencies."
                  ),
                },
                {
                  id: "mod_7_c2",
                  icon: t("icon_shield", "shield"),
                  title: g("Homestead Save Airgap"),
                  desc: g(
                    "Swaps your live user saves directories with a dedicated Lab Test Save slot during testing so your primary save slots can never be corrupted."
                  ),
                },
                {
                  id: "mod_7_c3",
                  icon: t("icon_bug_report", "bug_report"),
                  title: g("Crash Autopsy Monitor"),
                  desc: g(
                    "Purges stale logs before launch and watches for engine exception and crash output in real time, matching against community diagnostic signatures."
                  ),
                },
                {
                  id: "mod_7_c4",
                  icon: t("icon_compare_arrows", "compare_arrows"),
                  title: g("1v1 Conflict Stability Protocol"),
                  desc: g(
                    "Pit two suspected conflicting {mods} together in isolation to verify compatibility and submit telemetry directly to Architects."
                  ),
                },
              ],
            },
            {
              id: "mod_8",
              icon: t("icon_history", "history"),
              overline: "MODULE 8 OF 12",
              badge: g("8. {Backups} & IDE"),
              title: g("{Backups} & Live-Wire Workbench"),
              footerMeta: g("HARDLINK SNAPSHOTS • LIVE-WIRE DIFF"),
              desc: g(
                "Protect your saves and game binaries with zero-duplication hardlink backups, and fine-tune {mod} configuration files using visual sliders or the built-in Monaco IDE."
              ),
              tip: g(
                "When DEFCON 1 is declared for an incoming game patch, Sanctuary automatically prompts to seal a Pre-Patch {Backups} before launching."
              ),
              subCards: [
                {
                  id: "mod_8_c1",
                  icon: t("icon_archive", "archive"),
                  title: g("World State (Purple) & Engine Core (Pink)"),
                  desc: g(
                    "Independently snapshot your user saves, profiles, and configs (World State) and your actual Game Installation Binaries (Engine Core) before patches hit."
                  ),
                },
                {
                  id: "mod_8_c2",
                  icon: t("icon_home_storage", "home_storage"),
                  title: g("0 MB Delta Hardlink Deduplication"),
                  desc: g(
                    "Unchanged files are linked via native OS hardlinks rather than copied—making snapshots near-instant and consuming disk space only for changed bytes."
                  ),
                },
                {
                  id: "mod_8_c3",
                  icon: t("icon_settings_backup_restore", "settings_backup_restore"),
                  title: g("Differential Rollback & Surgical Extraction"),
                  desc: g(
                    "Restore an entire snapshot via fast differential sync, or browse inside any {Backups} to surgically extract an individual save slot."
                  ),
                },
                {
                  id: "mod_8_c4",
                  icon: t("icon_construction", "construction"),
                  title: g("Live-Wire Workbench & Creator Airlock"),
                  desc: g(
                    "Edit {mod} .json/.ini/.cfg files with safe visual toggles and sliders synced live with a Monaco Raw Code Diff editor—plus full local Sandbox & Export Release tools for all {Citizens}."
                  ),
                },
              ],
            },
            {
              id: "mod_9",
              icon: t("icon_shield", "shield"),
              overline: "MODULE 9 OF 12",
              badge: g("9. Themes & Security"),
              title: g("Chameleons, Lexicons & Malware Defense"),
              footerMeta: g("LIQUID GLASS V3 • CORE + SPOKE HEURISTICS"),
              desc: g(
                "Personalize every pixel and word of Sanctuary OS while staying protected by cryptographic SHA-256 DNA blacklists and the multi-format Rust Heuristic Scanner."
              ),
              tip: g(
                "Sanctuary OS works 100% offline without an account—and if you sign in, elevated roles are protected by hardware/biometric FIDO2 Passkeys."
              ),
              subCards: [
                {
                  id: "mod_9_c1",
                  icon: t("icon_palette", "palette"),
                  title: g("Liquid Glass Optics"),
                  desc: g(
                    "Switch between Dark and Light presets, download community Chameleons, or build your own in Theme Forge with live refractive saturation, rim light, and specular glare sliders."
                  ),
                },
                {
                  id: "mod_9_c2",
                  icon: t("icon_translate", "translate"),
                  title: g("Code-Switch"),
                  desc: g(
                    "Hot-swap the entire OS vocabulary between Standard Technical English, Sanctuary Sci-Fi Cyberpunk, Community Casual, or Spoke Dialect Packs."
                  ),
                },
                {
                  id: "mod_9_c3",
                  icon: t("icon_security", "security"),
                  title: g("Bytecode Hound"),
                  desc: g(
                    "Combines Core Heuristics and Spoke Heuristics with Zlib/Zstd binary stream decompression to inspect .zip, .mod, .bin, .dll, .exe, and compiled script bytecode."
                  ),
                },
                {
                  id: "mod_9_c4",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: g("Zero-Choice Lockdown"),
                  desc: g(
                    "If Tier 5 Malware is detected, Sanctuary isolates the file in Quarantine, locks the workspace shell, displays the exact trigger & source in the side panel, and overwrites the file with zeros upon your Secure Shred signature."
                  ),
                },
              ],
            },
            {
              id: "mod_10",
              icon: t("icon_cloud_upload", "cloud_upload"),
              overline: "MODULE 10 OF 12",
              badge: g("10. Edge Pulse"),
              title: g("Edge Pulse & Catalog Distribution"),
              footerMeta: g(".SANCTUARY.MANIFEST.JSON • CATALOG.JSON • EDGE DIRECT PUSH"),
              desc: g(
                "Zero-server update distribution for independent {Masons} and Tier 1–4 creators—supporting 1-click Edge Direct Push, automatic SHA-256 lineage rollover, and in-place {Vault} upgrades."
              ),
              tip: g(
                "Use a single catalog.json URL across your entire {mod} portfolio so {Citizens} receive update pings for every {mod} from one static file."
              ),
              subCards: [
                {
                  id: "mod_10_c1",
                  icon: t("icon_cloud_upload", "cloud_upload"),
                  title: g("Edge Direct Push (6 Providers)"),
                  desc: g(
                    "Push .sanctuary.manifest.json or catalog.json directly from the Rust backend to GitHub, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
                  ),
                },
                {
                  id: "mod_10_c2",
                  icon: t("icon_history", "history"),
                  title: g("Automatic previous_hashes Lineage Rollover"),
                  desc: g(
                    "Absorbs historical SHA-256 hashes from your Sandbox and remote manifest so existing {Citizens} are notified immediately when v1.1+ ships."
                  ),
                },
                {
                  id: "mod_10_c3",
                  icon: t("icon_find_replace", "find_replace"),
                  title: g("In-Place Lineage File Replacement"),
                  desc: g(
                    "Dropping an updated .zip automatically locates the older file by its previous_hashes lineage and replaces it in-place without leaving duplicate {mods}."
                  ),
                },
                {
                  id: "mod_10_c4",
                  icon: t("icon_lock", "lock"),
                  title: g("100% Local API Token Isolation"),
                  desc: g(
                    "Personal Access Tokens stay strictly on your local machine and are never transmitted to Sanctuary servers or bundled into exported .zip archives."
                  ),
                },
              ],
            },
            {
              id: "mod_11",
              icon: t("icon_schema", "schema"),
              overline: "MODULE 11 OF 12",
              badge: g("11. Schema & Lexicon"),
              title: g("Universal Master Schema & Code-Switch"),
              footerMeta: g("7 ENGINE PRESETS • 21 {GLOSSARY} TOKENS • ICON OVERRIDES"),
              desc: g(
                "Schema Forge & Lexicon Studio for engineering cross-platform game schemas (Windows, macOS & Linux / SteamOS) and hot-swapping all 1,700+ OS localization strings, dynamic glossary tokens, and Material icons."
              ),
              tip: g(
                "Click the book icon (Schema Codex / Lexicon Codex) in the studio header at any time for an interactive field-by-field reference."
              ),
              subCards: [
                {
                  id: "mod_11_c1",
                  icon: t("icon_terminal", "terminal"),
                  title: g("Schema Forge (Routes & Config Watcher)"),
                  desc: g(
                    "Map Windows (.exe), macOS (.app), and Linux / SteamOS (Proton compatdata) paths, custom secondary install_routes (.dll, .asi, .lua), and config_extensions for live in-game config syncing."
                  ),
                },
                {
                  id: "mod_11_c2",
                  icon: t("icon_category", "category"),
                  title: g("Game-Agnostic {Mod} Categories & Exception Rules"),
                  desc: g(
                    "Define custom per-game {mod} categories and regex/keyword exception log diagnostic matchers directly inside the Master Schema JSON."
                  ),
                },
                {
                  id: "mod_11_c3",
                  icon: t("icon_translate", "translate"),
                  title: g("21 Dynamic {Glossary} Tokens & Smart Grammar"),
                  desc: g(
                    "Change {Mod}, {Vault}, or {Blueprint} once in Tab 1 to interpolate across 1,700+ strings with automatic casing and indefinite article ('a'/'an') grammar."
                  ),
                },
                {
                  id: "mod_11_c4",
                  icon: t("icon_apps", "apps"),
                  title: g("Guided Searchable Icon Override Builder"),
                  desc: g(
                    "Select any target OS icon from a searchable dropdown and pick a replacement Material Symbol with live Default → New glyph previews."
                  ),
                },
              ],
            },
            {
              id: "mod_12",
              icon: t("icon_handshake", "handshake"),
              overline: "MODULE 12 OF 12",
              badge: g("12. Spoke & Covenants"),
              title: g("Wayfinder Spoke Control, Covenants & Supporter Bridge"),
              footerMeta: g("PARTNERS AGREEMENT • CUT THE CORD • 0%-CUT DONATIONS"),
              desc: g(
                "Full community database sovereignty for Partner Spokes, transparent legal covenants, non-custodial 0%-cut community donations, and the $5 = +30 Days Dev Build pipeline."
              ),
              tip: g(
                "All Directives, Legal Covenants, Schemas, and Lexicons use local codebase files for offline backup while syncing live updates from the Hub database."
              ),
              subCards: [
                {
                  id: "mod_12_c1",
                  icon: t("icon_gavel", "gavel"),
                  title: g("Partners Agreement & Compliance Protocol"),
                  desc: g(
                    "Accessible anytime in Wayfinder Spoke Maintenance and required before submitting a Partner Spoke application on the Landing Page."
                  ),
                },
                {
                  id: "mod_12_c2",
                  icon: t("icon_link_off", "link_off"),
                  title: g("Unilateral 'Cut the Cord' Severance"),
                  desc: g(
                    "Complete the phrase-locked Cut the Cord safeguard in Wayfinder Operations to revoke all Spoke Gateway Tokens and purge your sealed Vault credential from the Hub while keeping 100% of your community's 52-table Supabase database."
                  ),
                },
                {
                  id: "mod_12_c3",
                  icon: t("icon_volunteer_activism", "volunteer_activism"),
                  title: g("0%-Cut Non-Custodial Community Donations"),
                  desc: g(
                    "Bind your community's own Stripe, Ko-fi, or OpenCollective checkout link in Spoke Control—Sanctuary OS takes 0% platform cut."
                  ),
                },
                {
                  id: "mod_12_c4",
                  icon: t("icon_system_update_alt", "system_update_alt"),
                  title: g("Dev Builds & Cross-Platform Auto-Updater"),
                  desc: g(
                    "Supporters ($5 = +30 Days) and Partner team members receive automated Windows (.msi/.exe), macOS (.dmg/.app.tar.gz), and Linux / SteamOS (.AppImage/.deb) Dev Build updates."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "roles",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          label: g("6 TIERS"),
          value: g("Role Tiers"),
          cards: elevatedRolesCards,
        },
      ],
    };
  }

  if (slug === "phase_roadmap") {
    const roadmapCards: DirectiveBuilderCard[] = [
      {
        id: "phase_14",
        icon: t("icon_science", "science"),
        overline: g("PHASE 14 (V0.6.0) • NOVEMBER 2026 — ACTIVE ERA"),
        badge: g("ACTIVE PHASE"),
        title: g(
          "Universal Multi-Engine Expansion, Patch Fire Drill & Deck Overdrive"
        ),
        footerMeta: g(
          "Creator Airlock • Zero-Copy Exodus • The Rosetta Protocol • Patch Fire Drill • Groundhog Sandbox • Deck Overdrive • Jump Gate"
        ),
        desc: g(
          "Full multi-engine expansion featuring Creator Airlock external tool save isolation, The Quartermaster guided package wizard, Zero-Copy Exodus out-of-tree setup migration, The Rosetta Protocol modlist translation, Save Doctor lockouts, Patch Fire Drill simulations, Groundhog Sandbox verification, Deck Overdrive Steam Deck controls, Code-Switch auto-translation, Echo Suppressor alert sync, Crash Autopsy, Pocket Radar, Browser Autoloader, Jump Gate palette, Live-Wire Diff, and the Ironclad Gauntlet test suite."
        ),
        status: "active",
        subCards: [
          {
            id: "phase_14_m1",
            icon: t("icon_handyman", "handyman"),
            title: g("Creator Airlock"),
            desc: g(
              "Launch external authoring, asset-editing, and world-building tools inside a Save-Airgapped {Lab} session—physically isolating primary saves while developing assets or testing {mods} and restoring saves automatically on exit."
            ),
            pending: true,
          },
          {
            id: "phase_14_m2",
            icon: t("icon_inventory_2", "inventory_2"),
            title: g("The Quartermaster"),
            desc: g(
              "Intercepts multi-variant archives on drop or download with a Guided Package Installer drawer that parses multi-option installer manifests and {Mason} Dossier Flavors with auto-checked compatibility patches."
            ),
            pending: true,
          },
          {
            id: "phase_14_m3",
            icon: t("icon_drive_file_move", "drive_file_move"),
            title: g("Zero-Copy Exodus"),
            desc: g(
              "Zero-reinstall out-of-tree migration via Cartographer & {Vault}: ingests external staging directories, safely unlinks legacy deployment links, translates XML/JSON/text profile manifests and load orders into ready {Blueprints}, preserves source URLs and notes as Local Dossiers, and supports hardlink, move, or copy Vault absorption."
            ),
            pending: true,
          },
          {
            id: "phase_14_m4",
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: g("The Rosetta Protocol"),
            desc: g(
              "Cross-platform curated modlist and collection translator: compiles third-party collection manifests, profile archives, and XML/JSON load lists into native Sanctuary {Blueprints}, binds local {Vault} matches via SHA-256 / MD5 DNA, and routes missing items into Browser Autoloader (with two-way standard load list export)."
            ),
            pending: true,
          },
          {
            id: "phase_14_m5",
            icon: t("icon_health_and_safety", "health_and_safety"),
            title: g("Save Doctor"),
            desc: g(
              "Pairs save states with the deployed {Blueprint} DNA manifest (.sanctuary-save-manifest.json) and warns before launch if switching {Blueprints} removed {mods} required by the latest save."
            ),
            pending: true,
          },
          {
            id: "phase_14_m6",
            icon: t("icon_science", "science"),
            title: g("Patch Fire Drill"),
            desc: g(
              "Simulates any upstream game patch across all {Blueprints} with 1:1 deduplicated {mod} counts, transitive Atomic Logic dependency cascades, local Echo Archive Auto-Swap detection, 1-click dependency acquisition, and 1-click Clone Ready {Blueprint} generation."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m7",
            icon: t("icon_science", "science"),
            title: g("Groundhog Sandbox"),
            desc: g(
              "Immortal save-verify-and-rewind {Lab} airgap featuring an externalized save mirror, read-only Golden Baseline test saves with disposable working copies, Stage 4 magic-byte save corruption auditing, 100% passive anti-cheat-safe 4-stage timers, pause-menu suspension, and native fullscreen PCM audio chimes."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m8",
            icon: t("icon_extension", "extension"),
            title: g("Universal Master Schema"),
            desc: g(
              "100% engine-agnostic Master Schema v2 powering ordered XML/JSON/text manifest compilers, multi-folder asset tree preservation, Copy-on-Write staging, and declarative virtual_fs_path, archive_member, binary_chunk_index, and json_xml_key conflict analyzers."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m9",
            icon: t("icon_sports_esports", "sports_esports"),
            title: g("Deck Overdrive"),
            desc: g(
              "Full-OS Steam Deck controller engine and Proton prefix auto-resolver: unifies Gamescope XWayland surface binding, decodes 64-byte hidraw packets into a 60 FPS {Chameleon} Virtual Pointer + 2D Spatial Focus engine, and translates Steam libraryfolders.vdf / compatdata prefixes across internal drives and SD cards."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m10",
            icon: t("icon_translate", "translate"),
            title: g("Code-Switch"),
            desc: g(
              "Lexicon Engine V2 with an automated Standard English source scanner, lightweight Sparse Delta Override packs, a Source-First 4-tab Visual Studio, Guided Icon Overrides, and 1-click neural auto-translation across 28+ languages with {Glossary} placeholder masking."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m11",
            icon: t("icon_filter_1", "filter_1"),
            title: g("The Highlander Rule"),
            desc: g(
              "Enforces single-winner exclusive slots (highlander_group_id) with explicit Swap, Keep Both, or Cancel alerts on {Vault} cards and Dossiers so rival {mods} never vanish silently."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m12",
            icon: t("icon_notifications_off", "notifications_off"),
            title: g("Echo Suppressor"),
            desc: g(
              "Zero-PII AES-256-GCM cross-device notification deduplication and per-Spoke alert muting across Windows, Steam Deck, and Mobile PWA, paired with 7-Domain {Settings} and the Per-Space {Chameleons} & {Lexicons} Matrix."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m13",
            icon: t("icon_troubleshoot", "troubleshoot"),
            title: g("Crash Autopsy"),
            desc: g(
              "Citizen-facing {Lab} Known Error showcase (Corrupted / Unstable / Unrelated) with Architect-pinned diagnostic rules, schema-driven log matchers, and instant crash-log paste decoding across Desktop and Web."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m14",
            icon: t("icon_install_mobile", "install_mobile"),
            title: g("Pocket Radar"),
            desc: g(
              "Mobile PWA and Web Vault Companion with optional encrypted sync of active {Blueprint} DNA hashes so {Citizens} spot broken {mods} remotely, pair with Beam to Rig transfers, and browse with responsive mobile filter pills."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m15",
            icon: t("icon_cloud_download", "cloud_download"),
            title: g("Browser Autoloader"),
            desc: g(
              "Adds a Guided Update Queue (1 of N) stepper bar to the Side Panel Browser that opens each {Mason}'s official download page sequentially and auto-advances the instant the Rust download interceptor verifies the archive."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m16",
            icon: t("icon_bolt", "bolt"),
            title: g("Jump Gate"),
            desc: g(
              "Global Ctrl+K / Cmd+K Liquid Glass command palette across Desktop, Web, and Mobile PWA for jumping to installed {Vault} {mods}, toggling {Blueprint} items, navigating all 18 OS views, switching {Chameleons} & {Lexicons}, and firing quick actions."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m17",
            icon: t("icon_radar", "radar"),
            title: g("Conflict Radar 2.0"),
            desc: g(
              "5-Tier Severity Matrix (S1–S5), strategy-aware Load Order & Priority Tier inspector with searchable {Blueprint} Scan Scope, 1-click 'Set Winner' resolution, and directional Must Load After/Before rules."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m18",
            icon: t("icon_difference", "difference"),
            title: g("Live-Wire Diff"),
            desc: g(
              "Automatically captures live in-game .cfg/.ini/.json/.toml modifications intercepted by the Rust Config Watcher as timestamped [In-Game Engine Edit] snapshots inside the {Citizen}'s Workbench Diff Timeline."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m19",
            icon: t("icon_verified", "verified"),
            title: g("Ironclad Gauntlet"),
            desc: g(
              "Automated Vitest + Cargo Test regression suite covering the Topological Load Order Engine, Bytecode Hound heuristic scanner (including Zlib/Zstd streams), Dynamic {Glossary} Token interpolation, and System Directive parsing."
            ),
            pending: true,
          },
        ],
      },
      {
        id: "phase_13",
        icon: t("icon_auto_awesome", "auto_awesome"),
        overline: g("PHASE 13 (V5.8) • OCTOBER 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Schema Forge, Bytecode Hound & Sovereign Covenants"
        ),
        footerMeta: g(
          "Schema Forge • Lexicon Codex • Bytecode Hound • Edge Direct Push • Sovereign Covenants"
        ),
        desc: g(
          "Delivered the 4-Tab Master Schema Studio & Lexicon Terminology Studio with Guided Icon Overrides and Interactive Codex Guides, upgraded the Bytecode Hound heuristic scanner, added 6-provider Edge Direct Push, Readiness-Gated Partner Applications with mandatory Covenants, and Bilateral Codebase ↔ Cloud Sync."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_13_m1",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Schema Forge"),
            desc: g(
              "7 multi-game architecture presets, Windows (.exe) & macOS (.app) coordinate mapping, secondary install_routes, game-agnostic mod_categories, and live config_extensions syncing."
            ),
            pending: false,
          },
          {
            id: "phase_13_m2",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Lexicon Codex"),
            desc: g(
              "Searchable Material Symbol override builder with Default → New glyph previews, themed checkboxes, parity validation bar, and interactive Schema & Lexicon Codex drawers."
            ),
            pending: false,
          },
          {
            id: "phase_13_m3",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Bytecode Hound"),
            desc: g(
              "In-memory Zlib/Zstd binary stream decompression, Base64/Hex deobfuscation, Move-mode source disposition tracking, and Zero-PII Threat Manifest reporting across Core and Spoke rules."
            ),
            pending: false,
          },
          {
            id: "phase_13_m4",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Edge Direct Push"),
            desc: g(
              "1-click OS Auto-Push for .sanctuary.manifest.json and multi-mod catalog.json files to GitHub, Gist, GitLab/Codeberg, Neocities, WebDAV, and Local Folders with automatic previous_hashes lineage rollover."
            ),
            pending: false,
          },
          {
            id: "phase_13_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Sovereign Covenants"),
            desc: g(
              "Mandatory Partners Agreement & Compliance Protocol review before Partner Spoke application, 0%-cut community donations, $5 = +30 Days Dev Builds, and Mirror Uplink bilateral sync."
            ),
            pending: false,
          },
        ],
      },
      {
        id: "phase_12",
        icon: t("icon_rocket_launch", "rocket_launch"),
        overline: g("PHASE 12 • JULY 15 – OCTOBER 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Agnostic Future — Multi-Workspace, Sanctuary V6 Liquid Glass & Web PWA"
        ),
        footerMeta: g(
          "{Citizens} Workbench / {Mason} IDE, Lexicon Revamp, Sanctuary Partners, V6 Liquid Glass & Website V2"
        ),
        desc: g(
          "Dual-Vision {Mason} IDE & Cloud Lexicons, Multi-Workspace Master Schemas & the 0%-cut Sanctuary Partners Agreement, the Sanctuary V6 3D Liquid Glass Engine & 18-Section Revamp, and Website V2 / Mobile PWA."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_12_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Citizens} Workbench & {Mason} IDE 2.0"),
            desc: g(
              "Named Version Timeline entries, simultaneous Dual-Vision (Visual + Raw Monaco) split editing, Author Mode scaffolding, and the side-by-side Lexicon Builder."
            ),
          },
          {
            id: "phase_12_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Lexicon Revamp & Cloud Schemas"),
            desc: g(
              "Deduplicated all localization dictionaries, moved default Lexicon JSONs to the cloud database, and added official Sanctuary & Community badges."
            ),
          },
          {
            id: "phase_12_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Multi-Workspace & Sanctuary Partners"),
            desc: g(
              "Shared Core App and SSO with per-game Master Schemas, 100% Partner DB ownership ('Cut the Cord'), 0%-cut Partner Donations, and 1-File Standalone Forking."
            ),
          },
          {
            id: "phase_12_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Sanctuary V6 & Liquid Glass Engine"),
            desc: g(
              "4-layer 3D Refractive Liquid Glass Engine, revamped Default Themes + 'Plumbob Crystal' Partner Chameleon, and Chameleon Theme Forge 2.0."
            ),
          },
          {
            id: "phase_12_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Dynamic Alert Tiles & 18-Section Revamp"),
            desc: g(
              "Floating 2-Pill Title Bar, Hover Dock, 5 Dynamic Alert Stat Tiles (Permissions, Global, Critical, System, Updates), and a full 18-section UI overhaul."
            ),
          },
          {
            id: "phase_12_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Website V2, Mobile PWA & Remote Queuing"),
            desc: g(
              "Unified single-codebase Web OS & PWA (sanctuaryos.net/<spoke>) with live Comm-Link, Nexus, Support Desk, Command Hubs, and Web-to-PC {Blueprint} queuing."
            ),
          },
          {
            id: "phase_12_m11",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Schema-Driven Load Order Compiler"),
            desc: g(
              "Declarative Master Game Schemas powering multi-strategy topological compilation across folder priority, manifest lists, numeric prefixes, and timestamps."
            ),
          },
          {
            id: "phase_12_m12",
            icon: t("icon_check_circle", "check_circle"),
            title: g("FIDO2 Passkey {Vault} & Quarantine Lockdown"),
            desc: g(
              "Hardware WebAuthn Passkey gates for Elevated Hubs, Full-OS Malware Quarantine Lockdown, Silent Updater, and Bilateral Directives Sync."
            ),
          },
        ],
      },
      {
        id: "phase_11",
        icon: t("icon_public", "public"),
        overline: g("PHASE 11 • MAY 17 – JULY 13, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Technical Debt Repayment, {Citizens} Workbench & The Agnostic Sprint"
        ),
        footerMeta: g(
          "Native Intake & Support Desk, {Citizens} Workbench 1.0 & Game-Agnostic Kernel"
        ),
        desc: g(
          "Integrated {Mason} & Architect intake forms, native Bug Reports & Support Ticket Dossiers, {Citizens} Workbench 1.0 (.cfg/.ini/.json + Monaco IDE + Sanctuary Templates), full 11-section Lexicon/UI sweep, and the Agnostic Sprint."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_11_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Native Intake Forms & Support Desk"),
            desc: g(
              "Integrated {Mason} UUID registration, Architect intake forms, Bug Reports, and encrypted Support Ticket dossiers directly into the Desktop App."
            ),
          },
          {
            id: "phase_11_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Citizens} Workbench 1.0 & Sanctuary Templates"),
            desc: g(
              "Automatic .cfg, .ini, and .json detection in the {Vault} with an embedded Monaco IDE and visual slider/toggle Schema Mapping."
            ),
          },
          {
            id: "phase_11_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Agnostic Sprint & Master Schemas"),
            desc: g(
              "Extracted all hardcoded single-game extension and path checks across 17 frontend modules and the Rust backend into dynamic Master JSON Schemas."
            ),
          },
          {
            id: "phase_11_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Integrated Side Browser & {Vault} Intercept"),
            desc: g(
              "Embedded multi-tab Side Browser that automatically intercepts .zip, .rar, .7z, and schema-supported {mod} downloads straight into the {Vault}."
            ),
          },
          {
            id: "phase_11_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Full-Stack Security & Forensic Audit"),
            desc: g(
              "Hardened Rust path-traversal guards (is_safe_user_file_path), Supabase Row-Level Security (RLS) policies, and immutable append-only audit logs."
            ),
          },
          {
            id: "phase_11_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Oversight {Mason} Linker & Lexicon Sweep"),
            desc: g(
              "Deployed the Oversight {Mason} Linker, automatic Unregistered {Vault} syncing on Nexus verification, and a full 11-section Lexicon/UI sweep."
            ),
          },
        ],
      },
      {
        id: "phase_10",
        icon: t("icon_palette", "palette"),
        overline: g("PHASE 10 • MAY 10 – MAY 16, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Post-Alpha Revamp, Visual Protocol Manager & Senior Architect Mass Update"
        ),
        footerMeta: g(
          "Dev Sandbox, Visual Protocol Schema, Theme Forge & Mass Triage"
        ),
        desc: g(
          "Launched the isolated Dev Sandbox & 'Sync to Network' creator pipeline, visual database-schema Protocol Manager, Folder Structure builder, Senior Architect Mass Update console, The Nexus registry, and Chameleon Theme Forge."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_10_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Isolated Dev Sandbox & Sync to Network"),
            desc: g(
              "Dedicated local Dev Sandbox folder bypassing radar hash churn for WIP {mods}, paired with 1-click 'Sync to Network' release promotion."
            ),
          },
          {
            id: "phase_10_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Visual Protocol & Folder Structure Builder"),
            desc: g(
              "Database-schema visual Protocol Manager (Core & Addons, Flavors, Dependencies, DLC) and visual Folder Structure builder enforced by Sanitize {Vault}."
            ),
          },
          {
            id: "phase_10_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Senior Architect Mass Update & Filters"),
            desc: g(
              "Bulk post-patch triage console for Senior Architects alongside 'Game Version', 'Currently Eligible', and 'Exclude Unowned DLC' filters."
            ),
          },
          {
            id: "phase_10_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Nexus Discovery Registry"),
            desc: g(
              "Global metadata catalog for {Mods}, {Blueprints}, Lexicons, Chameleons, and Templates with automatic game patch and DLC compatibility filtering."
            ),
          },
          {
            id: "phase_10_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Chameleon Theme Forge & Holo Sandbox"),
            desc: g(
              "Interactive Theme Forge suite featuring a multi-stop atmospheric Background Builder, Dark/Light adaptation, and live Holo Sandbox previewing."
            ),
          },
          {
            id: "phase_10_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Hot-Swappable Lexicon Protocol"),
            desc: g(
              "Word-as-a-Service localization engine routing 100% of UI labels and icons through hot-swappable JSON dictionaries."
            ),
          },
        ],
      },
      {
        id: "phase_9",
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        overline: g("PHASE 9 • MAY 8 – MAY 9, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Infrastructure Finalization, Laboratory Diagnostics & Command Hubs"
        ),
        footerMeta: g(
          "Proving Grounds Simulation, macOS Universal Pipeline & Command Hubs"
        ),
        desc: g(
          "Transitioned Homestead Proving Grounds into a live simulation laboratory with real-time log monitoring, deployed the Senior Architect & Wayfinder Command Hubs, automated signed macOS Universal (.dmg) builds, and enforced Florida Compliance Tiers 1–4."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_9_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Live Proving Grounds & macOS Pipeline"),
            desc: g(
              "Real-time crash log monitoring with 1-click conflict rule pushing in the Homestead Lab, plus signed macOS Universal (.dmg) GitHub Actions builds."
            ),
          },
          {
            id: "phase_9_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Five Elevated Command Hubs"),
            desc: g(
              "Dedicated ElevatedHubLayout command centers for {Mason} Workshop, Architect Console, Oversight Command, Wayfinder Operations, and Keepers Core."
            ),
          },
          {
            id: "phase_9_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Claimable Support Desk Ticket Dossiers"),
            desc: g(
              "Interactive ticket dossiers equipped with PII-scrubbed crash logs, response macros, and cross-tier escalation between Architects and Oversight."
            ),
          },
          {
            id: "phase_9_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Florida Compliance Tiers 1–4"),
            desc: g(
              "Automated public feed scrubbing and Cloud {Blueprint} hash purge triggers protecting public discovery while preserving local {Vault} freedom."
            ),
          },
        ],
      },
      {
        id: "phase_8",
        icon: t("icon_cell_tower", "cell_tower"),
        overline: g("PHASE 8 • MAY 7 – MAY 8, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Standardized Lexicons, Dynamic Engine Recognition & DEFCON Shield"
        ),
        footerMeta: g(
          "Rust Rip Protocol, Auto-Sanitization Launch & DEFCON 1 Shield"
        ),
        desc: g(
          "Engineered the Rust 'Rip Protocol' for dynamic engine version recognition, Auto-Sanitization Launch purging stale crash logs & caches, Global Lexicon Extraction, the {Blueprint} Architect Load Order UI, and the real-time DEFCON 1 patch shield."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_8_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Rust 'Rip Protocol' & Auto-Sanitization"),
            desc: g(
              "Dynamic engine version recognition parsing config files and PE headers in Rust, plus pre-launch purging of stale crash logs and volatile cache files."
            ),
          },
          {
            id: "phase_8_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Global Comm-Link Broadcast Feed"),
            desc: g(
              "Real-time community feed supporting WYSIWYG/Markdown dispatches, multi-level threaded replies, and dedicated Discover & Following tabs."
            ),
          },
          {
            id: "phase_8_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("DEFCON 1 Pre-Patch Network Shield"),
            desc: g(
              "Real-time network listener that intercepts game launches during breaking engine patches to prompt an emergency {Backups} backup."
            ),
          },
          {
            id: "phase_8_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Tier 5 Malware Scanner & Secure Shred"),
            desc: g(
              "Byte-level heuristic malware scanner, {Citizen}-signed 3-pass Secure Shredding, and the privacy-first hardware_bans Nuclear Override."
            ),
          },
        ],
      },
      {
        id: "phase_7",
        icon: t("icon_construction", "construction"),
        overline: g("PHASE 7 • MAY 6, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Core Architecture, {Backups} Compression & Windows MSI Pipeline"
        ),
        footerMeta: g(
          "Nested {Vault} Taxonomy, 78 GB → 24 GB Engine Compression & Automated MSI Builds"
        ),
        desc: g(
          "Deployed the nested {Vault} directory hierarchy, optimized {Backups} Engine Core compression (78 GB → 24 GB) with <50s rollbacks, automated Windows .msi GitHub Actions builds, and integrated Scout Dossiers into Conflict Radar."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_7_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Nested {Vault} Taxonomy & 24 GB Compression"),
            desc: g(
              "Self-healing {Vault} hierarchy (Backups/World, Backups/Engine, Data/cache, Quarantine) and 78 GB → 24 GB Engine Core compression with <50s rollbacks."
            ),
          },
          {
            id: "phase_7_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Schema-Driven Visual Config Workbench"),
            desc: g(
              "Visual configuration studio rendering raw {mod} settings as interactive sliders and toggles synchronized live with a Monaco Raw Editor."
            ),
          },
          {
            id: "phase_7_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("{Mason} Workshop & Collections Orchestrator"),
            desc: g(
              "Creator suite featuring an isolated Dev Sandbox, Collections Builder, and relational Protocol Orchestrator for Twins, Flavors, and Dependencies."
            ),
          },
          {
            id: "phase_7_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("In-Process Rust PE Executable Parser"),
            desc: g(
              "Native Rust pelite binary parser extracting genuine patch versions directly from .exe headers with zero antivirus false positives."
            ),
          },
        ],
      },
      {
        id: "phase_6",
        icon: t("icon_science", "science"),
        overline: g("PHASE 6 • MAY 3 – MAY 5, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Codebase Modularization, Comm-Link Ledger & Homestead Proving Grounds"
        ),
        footerMeta: g(
          "Creator Following Feed, Domain View Modularization & Nuke Sandbox"
        ),
        desc: g(
          "Launched the Creator Following system and real-time Comm-Link discovery ledger, modularized the core shell into dedicated domain views, extracted Yeet Cascade casualty tracking, and built the 100% Nuke Isolation Proving Grounds."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_6_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Creator Following & Domain Modularization"),
            desc: g(
              "Added the Creator Following feed to Comm-Link, modularized the core shell into dedicated domain views, and extracted Yeet Cascade casualty tracking."
            ),
          },
          {
            id: "phase_6_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("100% Nuke Injection Sandbox"),
            desc: g(
              "Temporarily strips active {Vault} symlinks during Proving Grounds runs to inject only the isolated test subject and its mandatory dependencies."
            ),
          },
          {
            id: "phase_6_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("1v1 Conflict Stability Arena"),
            desc: g(
              "Pits two suspected colliding {mods} head-to-head in an airgapped test environment while monitoring real-time engine stability."
            ),
          },
          {
            id: "phase_6_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Automated Crash Log Harvester & Scrubber"),
            desc: g(
              "Captures engine exception and crash logs automatically and scrubs local filesystem paths and PII (scrub_user_data_from_log) before sharing."
            ),
          },
        ],
      },
      {
        id: "phase_5",
        icon: t("icon_history", "history"),
        overline: g("PHASE 5 • MAY 1 – MAY 3, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Defensive Protocols, Symlink Airgap 2.1 & {Mason} Protocol Manager"
        ),
        footerMeta: g(
          "Real-Time Airgap Watcher, DNA Duplicate Intercept & Time Capsule"
        ),
        desc: g(
          "Implemented Symlink Airgap 2.1 real-time .cfg/.ini file watching in Rust, SHA-256 DNA duplicate interception, {Mason} Protocol Manager 1.0, intelligent Google Search fallback, and hardlink {Backups} snapshots."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_5_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Real-Time Airgap Watcher & DNA Intercept"),
            desc: g(
              "Non-blocking Rust notify thread syncing live in-game .cfg/.ini edits back to the {Vault}, plus SHA-256 duplicate interception on drop."
            ),
          },
          {
            id: "phase_5_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Dual-State {Backups} Architecture"),
            desc: g(
              "Independently snapshots World State (User Saves, Profiles & Settings) and Engine Core (Game Installation Binaries) before patches or {mod} tests."
            ),
          },
          {
            id: "phase_5_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Zero-Bloat OS Hardlink Snapshot Engine"),
            desc: g(
              "Pairs native NTFS/POSIX hardlink deduplication with .tar.zst Zstandard compression so unchanged files consume zero extra disk space."
            ),
          },
          {
            id: "phase_5_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Differential Rollback Comparator"),
            desc: g(
              "High-speed diff_backup engine that restores only modified bytes and purges rogue files without re-copying the entire installation."
            ),
          },
        ],
      },
      {
        id: "phase_4",
        icon: t("icon_radar", "radar"),
        overline: g("PHASE 4 • APRIL 28 – MAY 1, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "The Global Network, Radiant Light Mode & Cloud {Blueprints}"
        ),
        footerMeta: g(
          "Radiant ThemeProvider, SNC-XXXXX Cloud Codes & Conflict Radar"
        ),
        desc: g(
          "Expanded beyond dark-only Bunker to Radiant Light Mode with real-time ThemeProvider switching, launched 6-digit Cloud {Blueprint} transmissions (SNC-XXXXX), added the Architect Signature gate, and established Conflict Radar Severity 1–4."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_4_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Radiant Mode, ThemeProvider & Signature Gate"),
            desc: g(
              "Introduced Radiant (Light Mode) and real-time ThemeProvider profile switching, 6-digit Cloud {Blueprint} codes, and the Architect Signature gate."
            ),
          },
          {
            id: "phase_4_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Severity 1–4 Collision Matrix"),
            desc: g(
              "Proactive conflict classifier distinguishing minor overlaps from Severity 3 Tuning Overlaps and Severity 4 Fatal Clashes."
            ),
          },
          {
            id: "phase_4_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Priority Tier Folders & Dynamic Load Manifests"),
            desc: g(
              "Multi-tier override directories (Sanctuary1–Sanctuary3) paired with automated load-order manifest priority depth compilation."
            ),
          },
          {
            id: "phase_4_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Architect Console & Crowd-Sourced Scout Queue"),
            desc: g(
              "Dedicated moderation console for verifying community Scout Dossier submissions behind Copilot confirmation gates."
            ),
          },
        ],
      },
      {
        id: "phase_3",
        icon: t("icon_hub", "hub"),
        overline: g("PHASE 3 • APRIL 15 – APRIL 28, 2026"),
        badge: g("COMPLETED"),
        title: g("System Rip, Deep Yeet 2.0 & Logic Intelligence"),
        footerMeta: g(
          "Deep Yeet 2.0, UTF-16 Version Ripper, Twin Bonds & Copilot"
        ),
        desc: g(
          "Engineered Deep Yeet 2.0 recursive dependency cascade scanning, the Rust UTF-16 byte-filter System Version Ripper, Twin Bond synchronized script/package links, and the Copilot Philosophy halting for manual {Citizen} signature."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_3_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Deep Yeet 2.0 & UTF-16 Version Ripper"),
            desc: g(
              "Recursive dependency cascade scanner queuing orphaned addons on master removal, paired with the Rust UTF-16 binary version ripper."
            ),
          },
          {
            id: "phase_3_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Atomic Logic Triumvirate"),
            desc: g(
              "Relational {mod} rules enforcing Highlander Flavor eviction, bidirectional binary/script Twin bonds, and Recursive Chain-Link Dependencies."
            ),
          },
          {
            id: "phase_3_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Orphaned Addon Cascade Protection"),
            desc: g(
              "Intercepts master library removal and halts for the {Citizen}'s manual signature before cleanly unequipping or removing dependent child add-ons."
            ),
          },
          {
            id: "phase_3_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("SNCXXX Cloud {Blueprints} & Ghosted States"),
            desc: g(
              "6-character alphanumeric Cloud {Blueprint} share codes, portable offline JSON exports, and automatic Missing DLC Ghosting diagnostics."
            ),
          },
        ],
      },
      {
        id: "phase_2",
        icon: t("icon_map", "map"),
        overline: g("PHASE 2 • APRIL 10 – APRIL 15, 2026"),
        badge: g("COMPLETED"),
        title: g("Visual Uplink, Glassmorphism 1.0 & The Quarantine Zone"),
        footerMeta: g(
          "Glassmorphism 1.0, Quarantine Bio-Hazard Sector & Symlink Airgap"
        ),
        desc: g(
          "Introduced the Glassmorphism 1.0 backdrop-blur engine, constructed the dedicated bio-hazard Quarantine Zone for isolating malicious files, and unified the app into a layered desktop OS experience backed by Symlink Airgap and SQLite caching."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_2_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Glassmorphism 1.0 & Bio-Hazard Quarantine"),
            desc: g(
              "Translucent backdrop-blur glass containers with deep elevation shadows and a dedicated Quarantine Zone for isolating and shredding threats."
            ),
          },
          {
            id: "phase_2_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Symlink Airgap 2.5 Projection Engine"),
            desc: g(
              "Projects active {mods} from the isolated {Vault} into the live game directory via zero-copy OS symlinks in milliseconds."
            ),
          },
          {
            id: "phase_2_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Sub-Second SQLite Delta Scanner"),
            desc: g(
              "Local .sanctuary_cache.db SQLite engine using mtime-first delta checks to index 5,000+ {mod} Vaults in sub-second sweeps."
            ),
          },
          {
            id: "phase_2_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Self-Healing {Vault} Sanitizer & Profiles"),
            desc: g(
              "Automatically maintains the isolated {Vault} directory structure and powers instant local {Blueprint} loadout switching."
            ),
          },
        ],
      },
      {
        id: "phase_1",
        icon: t("icon_inventory_2", "inventory_2"),
        overline: g("PHASE 1 • APRIL 1 – APRIL 10, 2026"),
        badge: g("COMPLETED"),
        title: g(
          "Bunker Initialization, Cartographer Protocol & SHA-256 DNA Pathing"
        ),
        footerMeta: g(
          "First-Boot Cartographer Recon & Millisecond Delta Caching"
        ),
        desc: g(
          "Initialized the Tauri v2 + Rust + React 18 architecture, built The Cartographer automated first-boot reconnaissance scanner for Game Bin & {Mods} directories, and engineered SHA-256 DNA delta caching."
        ),
        status: "completed",
        subCards: [
          {
            id: "phase_1_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Cartographer Recon & Millisecond Delta Cache"),
            desc: g(
              "Automated first-boot drive reconnaissance locating Game Bin & {Mods} folders, paired with SHA-256 delta caching for instant startup."
            ),
          },
          {
            id: "phase_1_m6",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Tauri v2 + Rust + React 18 Kernel"),
            desc: g(
              "Foundational desktop OS architecture combining a native multi-threaded Rust backend with React 18, TypeScript, and Zustand."
            ),
          },
          {
            id: "phase_1_m7",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Automated Coordinate Discovery Wizard"),
            desc: g(
              "Guided first-launch Cartographer setup linking Game Binaries, live {Mods} folders, and airgapped Bunker {Vault} coordinates."
            ),
          },
          {
            id: "phase_1_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Streaming SHA-256 DNA & Archive Inspector"),
            desc: g(
              "Multi-threaded Rust cryptographic hashing and in-memory binary chunk/ZIP header inspection without extracting archives to disk."
            ),
          },
        ],
      },
    ];

    return {
      slug: "phase_roadmap",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Engineering Phase Roadmap (Phase 14 → Phase 1)"),
      summary: g(
        "Interactive reverse-chronological engineering timeline tracking Sanctuary OS from Phase 14 (V0.6.0 Agnostic Multi-Engine Expansion) and Phase 13 (V5.8 Multi-Engine Studios & Bilateral Cloud Sync) down to Phase 1."
      ),
      tabs: [
        {
          id: "all",
          icon: t("icon_timeline", "timeline"),
          label: g("14 Phases"),
          value: g("Full Timeline"),
          cards: roadmapCards,
        },
      ],
    };
  }

  if (slug === "forking_guide") {
    return {
      slug: "forking_guide",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Forking & Spoke Provisioning Matrix"),
      summary: g(
        "Interactive schematic for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), reviewing Partner Covenants, launching a 1-file Standalone Codebase Fork (src/supabase.ts), or building cross-platform Master Schemas."
      ),
      tabs: [
        {
          id: "spoke",
          icon: t("icon_hub", "hub"),
          label: g("STEP 1"),
          value: g("Spoke Setup"),
          cards: [
            {
              id: "fork_spoke_setup",
              icon: t("icon_hub", "hub"),
              overline: g("OFFICIAL PARTNER NETWORK • ZERO CODE EDITS"),
              badge: t("active", "Active"),
              title: g("Connect a Sovereign Community Spoke in 3 Steps"),
              footerMeta: "SANCTUARY-UPLINK:// • schema.sql",
              desc: g(
                "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required."
              ),
              subCards: [
                {
                  id: "fork_spoke_s1",
                  icon: t("icon_database", "database"),
                  title: g("Step 1: Initialize Your Supabase Spoke (schema.sql) & Mint Token"),
                  desc: g(
                    "Create a free Supabase project, open the SQL Editor, run schema.sql (52 tables, RLS, and gateway auth), then run SELECT public.mint_spoke_gateway_token(); to mint your one-time spk_gw_... token."
                  ),
                },
                {
                  id: "fork_spoke_s2",
                  icon: t("icon_key", "key"),
                  title: g("Step 2: Configure Uplink Bundle & Scoped Gateway Token"),
                  desc: g(
                    "In Keepers Core -> Partner Spokes (or Wayfinder Operations -> Spoke Control), paste your secret-free SANCTUARY-UPLINK:// bundle (Supabase URL + Anon Key) and your spk_gw_... token to seal it inside the Split-Custody Hub Vault. Rotate anytime later in 1 click."
                  ),
                },
                {
                  id: "fork_spoke_s3",
                  icon: t("icon_rocket_launch", "rocket_launch"),
                  title: g("Step 3: Verify Handshake & Provision Founding Wayfinder"),
                  desc: g(
                    "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
                  ),
                },
              ],
            },
            {
              id: "fork_spoke_covenants",
              icon: t("icon_gavel", "gavel"),
              overline: g("PARTNER APPLICATION • SOVEREIGN COVENANTS"),
              badge: t("verified", "Verified"),
              title: g("Readiness-Gated Partner Application & Sovereign Covenants"),
              footerMeta: "Partners Agreement • Compliance Protocol",
              desc: g(
                "Prospective community leaders can apply directly from the Landing Page after inspecting and accepting the Sanctuary Partners Agreement and Compliance Protocol."
              ),
              subCards: [
                {
                  id: "fork_cov_s1",
                  icon: t("icon_handshake", "handshake"),
                  title: g("Mandatory Partners Agreement & Compliance Review"),
                  desc: g(
                    "Both covenants open in an interactive overlay drawer during Step 1 of the Partner Application and remain permanently accessible inside Wayfinder Hub -> Spoke Maintenance."
                  ),
                },
                {
                  id: "fork_cov_s2",
                  icon: t("icon_link_off", "link_off"),
                  title: g("Community-Initiated Severance ('Cut the Cord')"),
                  desc: g(
                    "A Wayfinder can execute the phrase-locked 'Cut the Cord' safeguard in Wayfinder Operations at any time—writing an immutable audit log, setting is_active = false, revoking all Spoke Gateway Tokens, and purging the Spoke's sealed Vault credential from the Hub."
                  ),
                },
                {
                  id: "fork_cov_s3",
                  icon: t("icon_volunteer_activism", "volunteer_activism"),
                  title: g("0% Platform Tax & Non-Custodial Community Donations"),
                  desc: g(
                    "Sanctuary OS takes 0% of {mason} Patreon/Ko-fi revenue and 0% of Partner community donations. Export your SANCTUARY-UPLINK:// bundle at any time."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "standalone",
          icon: t("icon_call_split", "call_split"),
          label: g("FORK MODES"),
          value: g("Standalone & Hub"),
          cards: [
            {
              id: "fork_mode_standalone",
              icon: t("icon_call_split", "call_split"),
              overline: g("MODE 1 • 1-DATABASE STANDALONE"),
              badge: g("1-File Fork"),
              title: g("1-File Standalone Fork (Single Database)"),
              footerMeta: "schema.sql • src/supabase.ts",
              desc: g(
                "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions."
              ),
              subCards: [
                {
                  id: "fork_m1_s1",
                  icon: t("icon_bolt", "bolt"),
                  title: g("1. Unified Auth & Direct RPC Engine"),
                  desc: g(
                    "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
                  ),
                },
                {
                  id: "fork_m1_s2",
                  icon: t("icon_verified", "verified"),
                  title: g("2. Founding Wayfinder & Cryptographic Spoke Profile Relinking"),
                  desc: g(
                    "In federated mode, auth.users lives on the Hub while Spokes store public.profiles and zero-PII SHA-256 relink commitments. When transitioning a severed Spoke to a Standalone Fork, on_auth_user_created_spoke promotes the first local auth.users signup to Wayfinder, and {Citizens} or {Masons} verify their Spoke Relink Token (SRK1.<uuid>.<secret>) at sign-up or in {Settings} -> System ID to cryptographically reclaim their legacy Spoke profile, {Mason} studio, and {Blueprints} without username hijacking."
                  ),
                },
                {
                  id: "fork_m1_s3",
                  icon: t("icon_storage", "storage"),
                  title: g("3. Transparent OS-to-Spoke Table Mapping"),
                  desc: g(
                    "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_hub",
              icon: t("icon_hub", "hub"),
              overline: g("MODE 2 • FULL HUB & SPOKE FEDERATION"),
              badge: g("Hub & Spokes"),
              title: g("Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)"),
              footerMeta: "schema_os.sql + schema.sql • game-gateway",
              desc: g(
                "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql)."
              ),
              subCards: [
                {
                  id: "fork_m2_s1",
                  icon: t("icon_memory", "memory"),
                  title: g("1. Provision Core Hub Database (schema_os.sql)"),
                  desc: g(
                    "Create your central Hub Supabase project and run schema_os.sql in the SQL Editor. This provisions global SSO profiles, FIDO2 user_passkeys, sanctuary_games, sanctuary_schemas, system_directives, and keeper_heuristic_signatures."
                  ),
                },
                {
                  id: "fork_m2_s2",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("2. Set SPOKE_VAULT_MASTER_KEY & Deploy game-gateway"),
                  desc: g(
                    "Generate a 256-bit Split-Custody key (supabase secrets set SPOKE_VAULT_MASTER_KEY=<64-hex-chars>) and deploy supabase/functions/game-gateway to your Hub project to proxy verified cross-database Spoke RPCs."
                  ),
                },
                {
                  id: "fork_m2_s3",
                  icon: t("icon_code", "code"),
                  title: g("3. Point src/supabase.ts at Your Core Hub"),
                  desc: g(
                    "Keep mode set to 'hub_and_spoke' in src/supabase.ts (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env) pointing to your central Hub project's URL and Anon Key."
                  ),
                },
                {
                  id: "fork_m2_s4",
                  icon: t("icon_storage", "storage"),
                  title: g("4. Provision & Link Child Spoke Databases (schema.sql)"),
                  desc: g(
                    "For each game community, create a separate Supabase project, run schema.sql, execute SELECT public.mint_spoke_gateway_token(); in the SQL Editor, and register its URL, Anon Key, and spk_gw_... token in Keepers Core -> Partner Spokes."
                  ),
                },
              ],
            },
            {
              id: "fork_mode_schema",
              icon: t("icon_schema", "schema"),
              overline: g("MODE 3 • MASTER GAME SCHEMAS & CROSS-PLATFORM"),
              badge: g("7 Engine Presets"),
              title: g("Master Schema Studio & Windows/macOS/Linux Build Pipeline"),
              footerMeta: "schema.json • Windows .msi, Darwin .dmg & Linux / SteamOS .AppImage/.deb",
              desc: g(
                "Adapt Sanctuary OS to any game engine without touching Rust or React code by configuring a declarative Master Schema JSON in Wayfinder or Keepers IDE."
              ),
              subCards: [
                {
                  id: "fork_m3_s1",
                  icon: t("icon_schema", "schema"),
                  title: g("7 Built-In Engine Architecture Presets"),
                  desc: g(
                    "1-click templates for Binary Chunk + Script, Multi-Folder Asset Tree, Ordered Load List, Virtual Archive Container, XML Load Manifest, JSON Mod Loader, and Universal engines."
                  ),
                },
                {
                  id: "fork_m3_s2",
                  icon: t("icon_laptop_mac", "laptop_mac"),
                  title: g("Windows (.exe), macOS (.app) & Linux / SteamOS Parity"),
                  desc: g(
                    "Supports Windows %USERPROFILE%, macOS ~/Documents & /Applications/*.app bundles, and Linux / SteamOS Proton compatdata prefixes, plus Windows .msi, universal-apple-darwin .dmg, and Linux .AppImage/.deb builds."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "deploy",
          icon: t("icon_language", "language"),
          label: g("STEP 3"),
          value: g("Deploy & Domains"),
          cards: [
            {
              id: "fork_deploy_branding",
              icon: t("icon_palette", "palette"),
              overline: g("WHITE-LABEL BRANDING • ZERO SCATTERED EDITS"),
              badge: g("Title Area Studio"),
              title: g("Centralized Brand Identity (SANCTUARY_CONFIG.branding & Database Title Area)"),
              footerMeta: "src/supabase.ts • VITE_APP_TITLE • sanctuary_themes",
              desc: g(
                "Customize every app title, organization name, logo, support email, WebAuthn Relying Party ID, and rotating subtitle from SANCTUARY_CONFIG.branding / VITE_* env vars—or edit them live from the database in Wayfinder / Keepers -> Chameleons -> Title Area Studio."
              ),
              subCards: [
                {
                  id: "fork_deploy_b1",
                  icon: t("icon_tune", "tune"),
                  title: g("Compile-Time Env Vars & Uplink Bundles"),
                  desc: g(
                    "Set VITE_APP_TITLE, VITE_ORG_NAME, VITE_LOGO_URL, VITE_SUPPORT_EMAIL, and VITE_WEBAUTHN_RP_ID in .env (or embed branding in SANCTUARY-UPLINK://), and LexiconContext automatically updates copy and document.title."
                  ),
                },
                {
                  id: "fork_deploy_b2",
                  icon: t("icon_auto_awesome", "auto_awesome"),
                  title: g("Database-Driven Title Area Studio"),
                  desc: g(
                    "Both Core Hubs and Standalone Forks unlock Title Area Studio inside Chameleons to push live logos, app names, and subtitles via sanctuary_themes without rebuilding binaries."
                  ),
                },
              ],
            },
            {
              id: "fork_deploy_targets",
              icon: t("icon_devices", "devices"),
              overline: g("SHARED CODEBASE • DESKTOP, PWA & WEB"),
              badge: g("Single Repo"),
              title: g("Build Desktop App, Installable PWA & Web Portal From One Codebase"),
              footerMeta: "package.json • dist/ • src-tauri/target/",
              desc: g(
                "One React + Vite + Tauri codebase deploys everywhere: static web portal, offline-capable PWA, and native desktop builds sharing identical SANCTUARY_CONFIG and environment variables."
              ),
              subCards: [
                {
                  id: "fork_deploy_t1",
                  icon: t("icon_public", "public"),
                  title: g("Web Portal & PWA (npm run build:web:public)"),
                  desc: g(
                    "Run npm run build:web:public (or build:web:beta) inside sanctuary-os/ to output dist/ with public/sw.js and public/manifest.webmanifest ready for Cloudflare Pages, Vercel, or Netlify."
                  ),
                },
                {
                  id: "fork_deploy_t2",
                  icon: t("icon_desktop_windows", "desktop_windows"),
                  title: g("Native Desktop Binaries & Brand Icons"),
                  desc: g(
                    "Replace public/icon.png, run npx tauri icon path/to/icon.png to regenerate Windows/macOS/Linux assets, and compile installers with npm run tauri build."
                  ),
                },
              ],
            },
            {
              id: "fork_deploy_domains",
              icon: t("icon_dns", "dns"),
              overline: g("CUSTOM DOMAINS • AUTH & PASSKEYS"),
              badge: g("HTTPS + WebAuthn"),
              title: g("Domain DNS, Supabase Auth Redirects & Cross-Platform Passkeys"),
              footerMeta: "CNAME / ALIAS • Auth Redirects • rp_id",
              desc: g(
                "Link your custom domain cleanly across web, mobile PWA, and native desktop deep links without breaking OAuth callbacks or FIDO2 passkeys."
              ),
              subCards: [
                {
                  id: "fork_deploy_d1",
                  icon: t("icon_link", "link"),
                  title: g("DNS Records & Supabase Redirect Allowlist"),
                  desc: g(
                    "Point CNAME/ALIAS records to your static host with SPA fallback to /index.html, then set Site URL and add https://your-domain.com/**, http://localhost:1420/**, and sanctuary://** in Supabase Auth URL Configuration."
                  ),
                },
                {
                  id: "fork_deploy_d2",
                  icon: t("icon_fingerprint", "fingerprint"),
                  title: g("Matching WebAuthn rp_id Across Web & Desktop"),
                  desc: g(
                    "Set VITE_WEBAUTHN_RP_ID to your apex/host domain (such as example-mods.org) so passkeys enrolled in the browser validate inside desktop builds too."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "sql",
          icon: t("icon_database", "database"),
          label: g("STEP 4"),
          value: g("SQL Schemas"),
          cards: [
            {
              id: "fork_sql_spoke",
              icon: t("icon_storage", "storage"),
              overline: g("Spoke & Standalone DB • 52 Tables"),
              badge: "schema.sql",
              title: g("schema.sql (52 Tables)"),
              footerMeta: "Community Spoke & Standalone Fork SQL",
              desc: g(
                "Idempotent copy-paste community registry schema (mods, blueprints, citizen_staging_queue, masons, conflicts, tickets, heuristics, pending-flag triggers, RLS policies, and Founding Wayfinder trigger)."
              ),
              subCards: [],
            },
            {
              id: "fork_sql_hub",
              icon: t("icon_dns", "dns"),
              overline: g("Core Hub Federation DB • 22 Tables"),
              badge: "schema_os.sql",
              title: g("schema_os.sql (Core Hub DB)"),
              footerMeta: "Central Multi-Game Federation SQL",
              desc: g(
                "Central multi-game federation schema (global SSO profiles, FIDO2 passkeys, sanctuary_games directory, master schemas, global lexicons/themes, and core heuristics)."
              ),
              subCards: [],
            },
          ],
        },
      ],
    };
  }

  if (slug === "master_architecture") {
    return {
      slug: "master_architecture",
      _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
      title: g("Master Architecture & Feature Blueprint"),
      summary: g(
        "Deep-dive interactive explorer into the Tauri v2 Rust core, Universal Master Schema, Code-Switch, Mirror Uplink, Symlink Airgap, Edge Pulse, Groundhog Sandbox, and Bytecode Hound."
      ),
      tabs: [
        {
          id: "p1",
          icon: t("icon_memory", "memory"),
          label: g("PILLAR 1"),
          value: g("Core & Glass"),
          cards: [
            {
              id: "arch_p1",
              icon: t("icon_memory", "memory"),
              overline: g("ARCHITECTURE PILLAR 1 • CORE ENGINE, OPTICS & STUDIOS"),
              badge: t("active", "Active"),
              title: g(
                "Tauri v2 Kernel, Liquid Glass Optics, Schema Forge & Code-Switch"
              ),
              footerMeta: "Tauri v2 • React 18 • Liquid Glass Optics • Win, Mac & Linux / SteamOS",
              desc: g(
                "Sanctuary OS combines a zero-overhead native Rust backend across Windows, macOS, and Linux / SteamOS (Deck Overdrive) with GPU-pinned Liquid Glass Optics, Universal Master Schema tooling, and the Code-Switch."
              ),
              subCards: [
                {
                  id: "arch_p1_c1",
                  icon: t("icon_auto_awesome", "auto_awesome"),
                  title: g("Liquid Glass Optics"),
                  desc: g(
                    "Zero-Tearing WebGL2 Liquid Glass Engine (.glass-panel / .glass-surface) with 6 live Theme Forge optical sliders (Opacity, Blur, Saturation, Rim Light, Glare, Depth), Per-Space Aesthetics, and responsive mobile selector pills."
                  ),
                },
                {
                  id: "arch_p1_c2",
                  icon: t("icon_memory", "memory"),
                  title: g("Deck Overdrive & Native Kernel"),
                  desc: g(
                    "Native Tauri v2 Rust core: Binary Version Ripper (PE & Info.plist), Deck Overdrive Steam Deck controller + Proton compatdata resolver, SQLite .sanctuary_cache.db delta scanner, WebAuthn FIDO2 bridge, and cross-platform auto-updater."
                  ),
                },
                {
                  id: "arch_p1_c3",
                  icon: t("icon_schema", "schema"),
                  title: g("Universal Master Schema"),
                  desc: g(
                    "Declarative Schema Forge JSON editor governing binaries, secondary install_routes, config_extensions watcher, topological load order strategies, mod_categories, and exception matchers."
                  ),
                },
                {
                  id: "arch_p1_c4",
                  icon: t("icon_translate", "translate"),
                  title: g("Code-Switch"),
                  desc: g(
                    "21 Dynamic {Glossary} Tokens interpolated across 6,166+ keys with smart article grammar, Sparse Delta Override packs, Guided Icon Overrides, and 1-click auto-translation across 28+ languages."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p2",
          icon: t("icon_hub", "hub"),
          label: g("PILLAR 2"),
          value: g("Hub & Spokes"),
          cards: [
            {
              id: "arch_p2",
              icon: t("icon_hub", "hub"),
              overline: g("ARCHITECTURE PILLAR 2 • FEDERATION, SYNC & STATIC EDGE"),
              badge: t("active", "Active"),
              title: g(
                "Hub Federation, Mirror Uplink & Edge Pulse"
              ),
              footerMeta: "schema_os.sql • schema.sql • Edge Pulse • Mirror Uplink",
              desc: g(
                "Uses bundled codebase files as an offline baseline paired with Mirror Uplink cloud synchronization, community-owned Spoke DBs (Cut the Cord & SRK1 Relink), Echo Suppressor sync, and 6-provider Edge Pulse polling."
              ),
              subCards: [
                {
                  id: "arch_p2_c1",
                  icon: t("icon_hub", "hub"),
                  title: g("Core Hub & Spoke Sovereignty"),
                  desc: g(
                    "Core OS Hub (schema_os.sql) governs global SSO, FIDO2 passkeys, sanctuary_schemas, keeper_heuristic_signatures & system_directives; Spokes (schema.sql) own 100% of their 52 community tables."
                  ),
                },
                {
                  id: "arch_p2_c2",
                  icon: t("icon_sync", "sync"),
                  title: g("Mirror Uplink"),
                  desc: g(
                    "First-time launch and offline sessions boot from bundled .md, schema, and lexicon files; connected clients pull live updates via Mirror Uplink without requiring an app update."
                  ),
                },
                {
                  id: "arch_p2_c3",
                  icon: t("icon_cloud_done", "cloud_done"),
                  title: g("Edge Pulse & Direct Push"),
                  desc: g(
                    "6-provider 1-click OS Auto-Push (.sanctuary.manifest.json & catalog.json) and concurrent Rust HTTP GET polling with ETag/304 caching and automatic previous_hashes lineage rollover."
                  ),
                },
                {
                  id: "arch_p2_c4",
                  icon: t("icon_favorite", "favorite"),
                  title: g("Sovereign Covenants & Cut the Cord"),
                  desc: g(
                    "Readiness-gated Partner Spoke onboarding with mandatory Covenants, 0%-cut community donations, Stripe-verified Dev Builds, phrase-locked Cut the Cord severance, and SRK1 relink commitments."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p3",
          icon: t("icon_shield", "shield"),
          label: g("PILLAR 3"),
          value: g("{Vault} & Lab"),
          cards: [
            {
              id: "arch_p3",
              icon: t("icon_inventory_2", "inventory_2"),
              overline: g("ARCHITECTURE PILLAR 3 • {VAULT}, COMPILER & WORKBENCH"),
              badge: t("active", "Active"),
              title: g(
                "Symlink Airgap, Priority Compiler & Groundhog Sandbox"
              ),
              footerMeta: "Symlink Airgap • Priority Compiler • Groundhog Sandbox",
              desc: g(
                "Protects your game installation via Symlink Airgap, Priority Compiler & Conflict Radar 2.0, Live-Wire Workbench config editing, Groundhog Sandbox save-verified testing, and Time Capsule snapshots."
              ),
              subCards: [
                {
                  id: "arch_p3_c1",
                  icon: t("icon_inventory_2", "inventory_2"),
                  title: g("Symlink Airgap & Config Watcher"),
                  desc: g(
                    "Projects {mods} from {Vault}/{Mods}/ into live game folders and secondary install_routes while deduplicating stray root configs and syncing in-game config_extensions writes back to the {Vault}."
                  ),
                },
                {
                  id: "arch_p3_c2",
                  icon: t("icon_layers", "layers"),
                  title: g("Priority Compiler & Conflict Radar 2.0"),
                  desc: g(
                    "5-Tier Severity Matrix, 1-click 'Set Winner' priority tier assignment, The Highlander Rule swap prompts, and Schema-Driven Load Order compilation with topological cycle breaking."
                  ),
                },
                {
                  id: "arch_p3_c3",
                  icon: t("icon_tune", "tune"),
                  title: g("Live-Wire Workbench & Live-Wire Diff"),
                  desc: g(
                    "60 FPS 2-column Visual Config Editor with Category Pill Bar, Min/Max range steppers, No-Code Template Builder, and side-by-side [In-Game Engine Edit] Visual/Raw Diff."
                  ),
                },
                {
                  id: "arch_p3_c4",
                  icon: t("icon_science", "science"),
                  title: g("Groundhog Sandbox & Time Capsule"),
                  desc: g(
                    "Immortal Save-Verify-and-Rewind {Lab} isolation, Crash Autopsy log decoding, fullscreen PCM audio chimes, and zero-bloat Copy-on-Write OS hardlink snapshots with additive save restores."
                  ),
                },
              ],
            },
          ],
        },
        {
          id: "p4",
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          label: g("PILLAR 4"),
          value: g("6-Tier & AV"),
          cards: [
            {
              id: "arch_p4",
              icon: t("icon_admin_panel_settings", "admin_panel_settings"),
              overline: g("ARCHITECTURE PILLAR 4 • GOVERNANCE, PASSKEYS & MALWARE LOCKDOWN"),
              badge: t("active", "Active"),
              title: g(
                "Zero-Knowledge Seal, Echo Suppressor & Zero-Choice Lockdown"
              ),
              footerMeta: "6 Role Tiers • Zero-Knowledge Seal • Bytecode Hound",
              desc: g(
                "Enforces strict separation between Spoke and Core Hub clearances, hardware-backed Zero-Knowledge Seal passkey gates, Echo Suppressor alert sync, and Zero-Choice Lockdown quarantine."
              ),
              subCards: [
                {
                  id: "arch_p4_c1",
                  icon: t("icon_admin_panel_settings", "admin_panel_settings"),
                  title: g("6-Tier Clearance Hierarchy"),
                  desc: g(
                    "Decouples Game Spoke roles ({Citizen}, Verified {Mason}, Architect, Oversight, Wayfinder) from Global Core OS Hub roles (Keeper) with Pending Tier 1–4 compliance gating."
                  ),
                },
                {
                  id: "arch_p4_c2",
                  icon: t("icon_space_dashboard", "space_dashboard"),
                  title: g("Sub-Second Command Hubs & Echo Suppressor"),
                  desc: g(
                    "Every Elevated Hub loads sub-second into a 2-column Recent and Anomalies overview, while Echo Suppressor deduplicates dismissed alerts across all devices via Zero-PII AES-256-GCM sync."
                  ),
                },
                {
                  id: "arch_p4_c3",
                  icon: t("icon_passkey", "passkey"),
                  title: g("Zero-Knowledge Seal & Companion Handshake"),
                  desc: g(
                    "Hardware-bound WebAuthn Passkeys (Windows Hello, Touch ID, YubiKey), OWASP 600k auth, and live Web Push Companion Handshakes guard Elevated Hubs inside a right-hand Security {Vault}."
                  ),
                },
                {
                  id: "arch_p4_c4",
                  icon: t("icon_gpp_bad", "gpp_bad"),
                  title: g("Zero-Choice Lockdown & Bytecode Hound"),
                  desc: g(
                    "Merges Core + Spoke heuristics with Zlib/Zstd decompression to halt launches on Tier 5 Malware and lock the OS shell until a {Citizen}-signed Secure Shred."
                  ),
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
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    title: g("Master Protocol List & 6-Tier Clearance Matrix"),
    summary: g(
      "Interactive directory of all 30 Sanctuary OS operational protocols across 4 Domains, Florida Compliance Tiers 0–5, Bytecode Hound heuristics, and the 6-Tier Role Clearance Hierarchy."
    ),
    tabs: [
      {
        id: "roles",
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        label: g("6 TIERS"),
        value: g("Role Matrix"),
        cards: elevatedRolesCards,
      },
      {
        id: "compliance",
        icon: t("icon_shield", "shield"),
        label: g("TIERS 0–5"),
        value: g("Safety & AV"),
        cards: [
          {
            id: "comp_t0",
            icon: t("icon_check_circle", "check_circle"),
            overline: g("TIER 0 • PUBLIC SAFE"),
            badge: "TIER 0",
            title: g("Public Verified"),
            footerMeta: g("TIER 0 • PUBLIC SAFE"),
            desc: g(
              "Only Tier 0 verified content is permitted across The Nexus, Comm-Link, Architect Console, public {Mason} Profiles, Shared {Blueprints} (SNCXXX), and Community {Mod} Support tickets."
            ),
            subCards: [],
          },
          {
            id: "comp_t12",
            icon: t("icon_visibility_off", "visibility_off"),
            overline: g("TIERS 1–2 • EXPLICIT / ILLICIT"),
            badge: "TIERS 1–2",
            title: g("Public Scrubbed"),
            footerMeta: g("TIERS 1–2 • EXPLICIT / ILLICIT"),
            desc: g(
              "Adult (NSFW) and illicit themes permitted in isolated local {Vaults} and Static Edge manifests (.sanctuary.manifest.json / catalog.json), hidden from public Nexus/Comm-Link/Architect views, visible solely to Oversight & Wayfinder hubs, and triggering the Active {Blueprint} Support Lock if equipped."
            ),
            subCards: [],
          },
          {
            id: "comp_t34",
            icon: t("icon_lock", "lock"),
            overline: g("TIERS 3–4 • SEVERE / RESTRICTED"),
            badge: "TIERS 3–4",
            title: g("Active {Blueprint} Support Lock"),
            footerMeta: g("TIERS 3–4 • OVERSIGHT / WAYFINDER ONLY"),
            desc: g(
              "Restricted content isolated strictly to local {Vaults}, Static Edge manifests, and Oversight/Wayfinder hubs (hidden publicly). Equipping Tier 1–4 or Unknown {mods} locks Community {Mod} Support via non-destructive 1-click active {Blueprint} unequip without deleting files; Keeper OS Bug Reports stay open."
            ),
            subCards: [],
          },
          {
            id: "comp_t5",
            icon: t("icon_gpp_bad", "gpp_bad"),
            overline: g("TIER 5 • CONFIRMED MALWARE"),
            badge: "TIER 5",
            title: g("Zero-Choice Lockdown"),
            footerMeta: g("TIER 5 • CONFIRMED MALWARE"),
            desc: g(
              "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables caught by SHA-256 DNA or Bytecode Hound—halting launch, isolating in Quarantine via Move-mode, locking the OS shell, and demanding a {Citizen}-signed Secure Shred."
            ),
            subCards: [],
          },
          {
            id: "comp_av",
            icon: t("icon_security", "security"),
            overline: g("CORE + SPOKE RUST AV • STREAM & BYTECODE INSPECTOR"),
            badge: "CORE + SPOKE",
            title: g("Bytecode Hound"),
            footerMeta: "Core + Spoke Signatures • Zlib/Zstd/Base64",
            desc: g(
              "Combines Core Heuristics (keeper_heuristic_signatures) and Spoke Heuristics (heuristic_signatures) with in-memory Zlib/Zstd binary stream decompression and Base64/Hex deobfuscation to inspect archives, raw binaries, scripts, and compiled bytecode."
            ),
            subCards: [],
          },
          {
            id: "comp_nuclear",
            icon: t("icon_policy", "policy"),
            overline: g("PRIVACY-FIRST • THREAT MANIFEST"),
            badge: "NUCLEAR OVERRIDE",
            title: g("Nuclear Override"),
            footerMeta: "hardware_bans • Zero-PII Threat Manifest",
            desc: g(
              "Sanctuary OS never tracks Hardware IDs on normal users. Quarantined payloads offer an optional Zero-PII Threat Manifest report (SHA-256 + matched rule IDs only), while invoking the 5-click Nuclear Override records a one-way salted hash in hardware_bans and permanently severs cloud access."
            ),
            subCards: [],
          },
        ],
      },
      {
        id: "list",
        icon: t("icon_policy", "policy"),
        label: g("30 RULES"),
        value: g("OS Protocols"),
        cards: [
          {
            id: "proto_d1",
            icon: t("icon_hub", "hub"),
            overline: g("DOMAIN 1 • 9 PROTOCOLS"),
            badge: "DOMAIN 1",
            title: g("Foundation & Sovereignty Protocols"),
            footerMeta: g("DOMAIN 1 • 9 PROTOCOLS"),
            desc: g(
              "Cross-platform binary reconnaissance, Steam Deck controller & Proton resolution, macOS security clearance, Liquid Glass Optics, Universal Master Schema, Code-Switch, Cut the Cord, and Mirror Uplink."
            ),
            subCards: [
              {
                id: "proto_d1_r1",
                icon: t("icon_explore", "explore"),
                title: g("The Cartographer"),
                desc: g(
                  "Automated cross-platform reconnaissance locating Game Bin (executable_subdir), Active {Mods} (mods_path), and auto-resolved Saves/Logs/Cache (docs_path) across Windows, macOS, and Linux / SteamOS—strictly decoupled from the OS-wide Master {Vault} path."
                ),
              },
              {
                id: "proto_d1_r2",
                icon: t("icon_memory", "memory"),
                title: g("Binary Version Ripper"),
                desc: g(
                  "In-process Rust inspector extracting genuine patch versions directly from Windows/Proton executable PE headers, macOS Info.plist bundles, Steam .acf manifests, and declarative json_key probes with zero external process spawns."
                ),
              },
              {
                id: "proto_d1_r3",
                icon: t("icon_sports_esports", "sports_esports"),
                title: g("Deck Overdrive"),
                desc: g(
                  "Unifies Gamescope XWayland surface binding, decodes 64-byte hidraw + evdev controller telemetry into a 60 FPS {Chameleon} Virtual Pointer, 2D Spatial Focus, and auto-summoned Steam OSK, and auto-resolves Proton compatdata prefixes across internal drives and SD cards."
                ),
              },
              {
                id: "proto_d1_r4",
                icon: t("icon_laptop_mac", "laptop_mac"),
                title: g("Gatekeeper Clearance"),
                desc: g(
                  "Delivers native Apple Touch ID WebAuthn Passkeys, macOS TCC Full Disk Access diagnostics, System Settings deep-linking, and automatic com.apple.quarantine attribute stripping on verified {Vault} projections."
                ),
              },
              {
                id: "proto_d1_r5",
                icon: t("icon_auto_awesome", "auto_awesome"),
                title: g("Liquid Glass Optics"),
                desc: g(
                  "1:1 physical-pixel WebGL2 refraction with dedicated layer2 floating glass, SHA-256 deduplicated <= 250 KB WebP {Chameleon} wallpapers, Per-Space {Chameleons} & {Lexicons}, and responsive mobile Liquid Glass filter pills."
                ),
              },
              {
                id: "proto_d1_r6",
                icon: t("icon_schema", "schema"),
                title: g("Universal Master Schema"),
                desc: g(
                  "100% engine-agnostic sanctuary_schemas (v12) with 7 Engine Architecture Presets, multi-folder tree preservation, archive_containers, secondary install_routes, ordered load_order templates, and declarative conflict_analyzers."
                ),
              },
              {
                id: "proto_d1_r7",
                icon: t("icon_translate", "translate"),
                title: g("Code-Switch"),
                desc: g(
                  "Auto-synced 6,166-key Standard English baseline, lightweight Sparse Delta Override packs with 21 Dynamic {Glossary} Tokens and smart article grammar, Guided Icon Overrides, and 1-click auto-translation across 28+ languages."
                ),
              },
              {
                id: "proto_d1_r8",
                icon: t("icon_link_off", "link_off"),
                title: g("Cut the Cord"),
                desc: g(
                  "Seals Spoke Gateway Tokens (spk_gw_*) via Split-Custody HKDF-SHA256 + AES-256-GCM AAD double-envelope encryption in sanctuary_internal.spoke_credentials + Supabase Vault, revokes tokens and purges credentials on 'CUT THE CORD' severance, supports 1-file Standalone Forking (src/supabase.ts), and binds returning users via cryptographic SRK1 relink tokens."
                ),
              },
              {
                id: "proto_d1_r9",
                icon: t("icon_sync", "sync"),
                title: g("Mirror Uplink"),
                desc: g(
                  "Bidirectionally synchronizes Core Schemas, {Lexicons}, {Chameleons}, system_directives, and canonical legal covenants between local repository files and Keepers Core without requiring app rebuilds."
                ),
              },
            ],
          },
          {
            id: "proto_d2",
            icon: t("icon_inventory_2", "inventory_2"),
            overline: g("DOMAIN 2 • 7 PROTOCOLS"),
            badge: "DOMAIN 2",
            title: g("{Vault} Airgap & {Mason} Pipeline Protocols"),
            footerMeta: g("DOMAIN 2 • 7 PROTOCOLS"),
            desc: g(
              "Zero-copy symlink projection, pre-launch patch simulations, zero-byte version history, cross-rig transfers, Static Edge polling, guided batch downloading, and visual config tuning."
            ),
            subCards: [
              {
                id: "proto_d2_r1",
                icon: t("icon_inventory_2", "inventory_2"),
                title: g("Symlink Airgap"),
                desc: g(
                  "Projects active {mods} from {Vault}/{Mods}/ via zero-copy OS symlinks and secondary install_routes, rescues untracked rogue files dropped into live game folders, and deduplicates stray root configs back into {mod} subfolders."
                ),
              },
              {
                id: "proto_d2_r2",
                icon: t("icon_science", "science"),
                title: g("Patch Fire Drill"),
                desc: g(
                  "Evaluates every {Blueprint} against any upstream game patch with 1:1 deduplicated {mod} parity, transitive dependency cascades, local Echo Archive Auto-Swap detection, 1-click dependency links, and 1-click Clone Ready {Blueprints}."
                ),
              },
              {
                id: "proto_d2_r3",
                icon: t("icon_history", "history"),
                title: g("Echo Archive"),
                desc: g(
                  "Archives every installed {mod} binary from Version #1 using zero-extra-byte OS hardlinks (Backups/Mods/), supporting multi-revision Suite Revision Matrix rollbacks, Auto-Swap recovery, and parent suite card grouping."
                ),
              },
              {
                id: "proto_d2_r4",
                icon: t("icon_devices", "devices"),
                title: g("Beam to Rig"),
                desc: g(
                  "Unifies Public/Unlisted/Private Cloud {Blueprint} modes, settled post-scan SHA-256 self-healing, concurrent GZIP + AES-256-GCM Personal Rig transfers between Desktop and Steam Deck, and the Mobile Pocket Radar companion."
                ),
              },
              {
                id: "proto_d2_r5",
                icon: t("icon_cloud_done", "cloud_done"),
                title: g("Edge Pulse"),
                desc: g(
                  "Concurrently polls .sanctuary.manifest.json, .sanctuary.override.json, and catalog.json endpoints in Rust with ETag/304 caching and SSRF guards, paired with 6-provider 1-click Direct Push and automatic previous_hashes rollover."
                ),
              },
              {
                id: "proto_d2_r6",
                icon: t("icon_cloud_download", "cloud_download"),
                title: g("Browser Autoloader"),
                desc: g(
                  "Orchestrates Guided Update Queues (1 of N) inside the embedded Side Browser, stepping through each {Mason}'s official download page and auto-advancing the instant the Rust download interceptor verifies the archive."
                ),
              },
              {
                id: "proto_d2_r7",
                icon: t("icon_tune", "tune"),
                title: g("Live-Wire Workbench"),
                desc: g(
                  "60 FPS 2-column Visual Config Studio (.sanctuary.template.json + INI/TOML/YAML/XML/JSON) with Live-Wire Diff capturing real-time [In-Game Engine Edit] snapshots alongside Monaco diffs and the 3-Tile {Mod} Studio."
                ),
              },
            ],
          },
          {
            id: "proto_d3",
            icon: t("icon_radar", "radar"),
            overline: g("DOMAIN 3 • 7 PROTOCOLS"),
            badge: "DOMAIN 3",
            title: g("Load Order, Atomic Logic & Sandbox Protocols"),
            footerMeta: g("DOMAIN 3 • 7 PROTOCOLS"),
            desc: g(
              "Topological priority compilation, pluggable conflict analysis, exclusive slot alerts, twin cohesion, dependency cascades, save-airgapped testing, and hardlink snapshots."
            ),
            subCards: [
              {
                id: "proto_d3_r1",
                icon: t("icon_layers", "layers"),
                title: g("Priority Compiler"),
                desc: g(
                  "Compiles topological deployment priority across folder_priority, manifest_list (XML/JSON/text templates), numeric_prefix, and timestamp with strategy-aware tiers, searchable {Blueprint} Scan Scopes, and 1-click DFS loop breaking."
                ),
              },
              {
                id: "proto_d3_r2",
                icon: t("icon_radar", "radar"),
                title: g("Conflict Radar 2.0"),
                desc: g(
                  "Executes declarative virtual_fs_path, archive_member, binary_chunk_index, and json_xml_key collision analyzers across a unified 5-Tier Severity Matrix (S1–S5) with 1-click Set Winner overrides and directional load rules."
                ),
              },
              {
                id: "proto_d3_r3",
                icon: t("icon_filter_1", "filter_1"),
                title: g("The Highlander Rule"),
                desc: g(
                  "Guards single-winner exclusive slots (highlander_group_id) with explicit Swap, Keep Both, or Cancel prompts directly on {Vault} cards and Dossiers—never silently removing an equipped {mod}."
                ),
              },
              {
                id: "proto_d3_r4",
                icon: t("icon_join_inner", "join_inner"),
                title: g("Nuclear Family Cohesion"),
                desc: g(
                  "Bidirectionally links companion binary modules and script plugins so related twins equip, unequip, stage, and patch-check together as one atomic unit."
                ),
              },
              {
                id: "proto_d3_r5",
                icon: t("icon_delete_sweep", "delete_sweep"),
                title: g("Deep Yeet"),
                desc: g(
                  "Auto-equips mandatory prerequisite frameworks via Chain-Link Dependencies on enable, and intercepts master {mod} removal to sweep all orphaned dependent add-ons only after explicit {Citizen} confirmation."
                ),
              },
              {
                id: "proto_d3_r6",
                icon: t("icon_science", "science"),
                title: g("Groundhog Sandbox"),
                desc: g(
                  "Immortal Save-Verify-and-Rewind {Lab} airgap featuring an untouched Vault save mirror, disposable Golden Baseline test saves, Stage 4 magic-byte save auditing, 100% anti-cheat-safe 4-stage timers, Crash Autopsy decoding, and fullscreen PCM audio chimes."
                ),
              },
              {
                id: "proto_d3_r7",
                icon: t("icon_history", "history"),
                title: g("Time Capsule"),
                desc: g(
                  "Multi-threaded rayon Copy-on-Write OS hardlink snapshots for World State and Engine Core so unchanged files consume zero extra bytes, pairing storage-cap pruning with strictly additive save restoration."
                ),
              },
            ],
          },
          {
            id: "proto_d4",
            icon: t("icon_shield", "shield"),
            overline: g("DOMAIN 4 • 7 PROTOCOLS"),
            badge: "DOMAIN 4",
            title: g("Zero-Knowledge Security & Shield Protocols"),
            footerMeta: g("DOMAIN 4 • 7 PROTOCOLS"),
            desc: g(
              "Zero-knowledge cryptography, cross-device alert deduplication, PII scrubbing, multi-format malware lockdown, compliance confirmation gates, patch shields, and Sovereign override ledgering."
            ),
            subCards: [
              {
                id: "proto_d4_r1",
                icon: t("icon_passkey", "passkey"),
                title: g("Zero-Knowledge Seal"),
                desc: g(
                  "Combines OWASP 600k PBKDF2-SHA256 password/email blinding with a 12-hour hardware-bound FIDO2 Passkey & TOTP device seal, macOS Touch ID, 1-click Passkey recovery, and Web Push Companion Handshakes."
                ),
              },
              {
                id: "proto_d4_r2",
                icon: t("icon_notifications_off", "notifications_off"),
                title: g("Echo Suppressor"),
                desc: g(
                  "Synchronizes encrypted alert dismissal tokens via notification_state_sync so OS warnings, DEFCON notices, and Command Center alerts fire once per account across all rigs, with per-category Spoke muting."
                ),
              },
              {
                id: "proto_d4_r3",
                icon: t("icon_cleaning_services", "cleaning_services"),
                title: g("Ghost Scrubber"),
                desc: g(
                  "Proactively scrubs OS paths, local usernames ([USER_REDACTED]), IPs, MACs, SIDs, and HWIDs before diagnostics leave the rig while gating Architect telemetry strictly to verified Tier 0 hashes."
                ),
              },
              {
                id: "proto_d4_r4",
                icon: t("icon_gpp_bad", "gpp_bad"),
                title: g("Zero-Choice Lockdown"),
                desc: g(
                  "Executes Bytecode Hound heuristics (decompressing Zlib/Zstd streams, archives, and bytecode) to halt game launches on Tier 5 Malware, isolate payloads in Quarantine, and require {Citizen}-signed Secure Shred."
                ),
              },
              {
                id: "proto_d4_r5",
                icon: t("icon_visibility_off", "visibility_off"),
                title: g("Tiered Surface Isolation & {Blueprint} Support Lock"),
                desc: g(
                  "Restricts The Nexus, Comm-Link, Architect Console, and Community {Mod} Support to Tier 0 (Unknown in Scout/Mason queues only, Tiers 1–4 & Pending flags hidden in Oversight/Wayfinder hubs only). Equipping Tier 1–4 or Unknown {mods} engages a non-destructive Active {Blueprint} Support Lock while Keeper OS Bug Reports stay open."
                ),
              },
              {
                id: "proto_d4_r6",
                icon: t("icon_warning", "warning"),
                title: g("DEFCON 1 Shield"),
                desc: g(
                  "Monitors live global_network_status events plus Next-Desktop-Open and offline game updates on startup (Auto Backup, Alert, or Lone Wolf) to seal saves before breaking patches launch."
                ),
              },
              {
                id: "proto_d4_r7",
                icon: t("icon_policy", "policy"),
                title: g("Nuclear Override"),
                desc: g(
                  "Hidden 5-click {Settings} subtitle override permitting local quarantine bypass only by recording a privacy-first domain-salted one-way SHA-256 hardware hash in hardware_bans and severing cloud access."
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}


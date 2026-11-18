import type { DirectiveBuilderSchema, DirectiveBuilderCard } from "../types";
import { CURRENT_DIRECTIVE_SCHEMA_VERSION } from "../types";

export function buildCitizenGuideSchema(
  t: (key: string, fallback?: string) => string,
  g: (txt: string) => string,
  elevatedRolesCards: DirectiveBuilderCard[]
): DirectiveBuilderSchema {
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

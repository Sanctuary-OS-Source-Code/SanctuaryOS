import { useMemo } from "react";

export function useWebDirectiveCatalogs(t: (key: string, fallback: string) => string) {
  const citizenSteps = useMemo(
    () => [
      {
        short: t("sd_guide_s1_short", "1. Cartographer"),
        title: t(
          "sd_guide_s1_title",
          "Cartographer Initialization & System Coordinates"
        ),
        badge: t("sd_guide_s1_badge", "INITIAL SETUP • 3 COORDINATES"),
        icon: t("icon_explore", "explore"),
        desc: t(
          "sd_guide_s1_desc",
          "On first boot, the Cartographer maps your machine's file system and extracts your genuine game engine version directly from the binary executable (.exe) using an in-process Rust PE parser (pelite)."
        ),
        tip: t("sd_guide_s1_tip", "Click the Cloud Auto-Detect icon during setup to automatically locate your Game Bin and {Mods} directories for the active workspace."),
        cards: [
          {
            icon: t("icon_terminal", "terminal"),
            title: t("sd_guide_s1_c1_title", "Game Bin Folder (Live Engine)"),
            desc: t(
              "sd_guide_s1_c1_desc",
              "Where your game executable lives. Sanctuary reads PE headers directly from the .exe (with .ini manifest fallback) to guarantee 100% patch version accuracy with zero antivirus false positives."
            ),
          },
          {
            icon: t("icon_folder_open", "folder_open"),
            title: t("sd_guide_s1_c2_title", "Active {Mods} Folder (Symlink Target)"),
            desc: t("sd_guide_s1_c2_desc", "Your game's live {Mods} folder. Never drop files here manually—Sanctuary projects high-speed symlinks into this directory from your isolated {Vault}."),
          },
          {
            icon: t("icon_inventory_2", "inventory_2"),
            title: t("sd_guide_s1_c3_title", "Isolated {Vault} Folder (Deep Storage)"),
            desc: t("sd_guide_s1_c3_desc", "Your airgapped archive containing {Mods}/, {Blueprints}/, Backups/World, Backups/Engine, Quarantine/, and Data/Cache (.sanctuary_cache.db)."),
          },
          {
            icon: t("icon_verified_user", "verified_user"),
            title: t("sd_guide_s1_c4_title", "Windows Symlink Permissions"),
            desc: t(
              "sd_guide_s1_c4_desc",
              "Enable Windows Developer Mode or run Sanctuary OS as Administrator so the Airgap engine can project zero-byte symlinks instead of falling back to hardlinks."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s2_short", "2. Command Center"),
        title: t("sd_guide_s2_title", "The Command Center & Live Telemetry"),
        badge: t("sd_guide_s2_badge", "SYSTEM DASHBOARD • 4 HEALTH STATES"),
        icon: t("icon_space_dashboard", "space_dashboard"),
        desc: t("sd_guide_s2_desc", "Your high-level glassmorphic mission control. Monitors the health of your active {Blueprint}, surfaces {mason} updates and system dispatches, and provides 1-click access to Radar Sweeps and {Vault} Lockdown."),
        tip: t(
          "sd_guide_s2_tip",
          "Use Command Center quick actions or the Top-Right Control Capsule to trigger a Radar Sweep, inspect System Queues, or engage instant {Vault} Lockdown."
        ),
        cards: [
          {
            icon: t("icon_check_circle", "check_circle"),
            colorClass: "text-[var(--success)]",
            title: t("sd_guide_s2_c1_title", "System Stable (Green State)"),
            desc: t("sd_guide_s2_c1_desc", "All equipped {mods} match your active game version, all required DLCs and dependencies are satisfied, and zero unmitigated collisions exist."),
          },
          {
            icon: t("icon_system_update_alt", "system_update_alt"),
            colorClass: "text-[var(--info)]",
            title: t("sd_guide_s2_c2_title", "{Mod} Updates Available (Blue State)"),
            desc: t("sd_guide_s2_c2_desc", "Newer SHA-256 versions have been detected either via the Spoke Cloud Registry or decentralized {mason} .sanctuary.manifest.json endpoints."),
          },
          {
            icon: t("icon_warning", "warning"),
            colorClass: "text-[var(--warning)]",
            title: t("sd_guide_s2_c3_title", "{Citizen} Action Recommended (Amber State)"),
            desc: t("sd_guide_s2_c3_desc", "An equipped {mod} is flagged as Unstable or has an unresolved Severity 3 Tuning Overlap awaiting a Load Order winner."),
          },
          {
            icon: t("icon_error", "error"),
            colorClass: "text-[var(--danger)]",
            title: t("sd_guide_s2_c4_title", "Critical Failure Detected (Red State)"),
            desc: t("sd_guide_s2_c4_desc", "An equipped {mod} is Corrupted, incompatible with your Game Patch, missing a mandatory dependency/DLC, or locked in a Severity 4 Fatal Clash."),
          },
        ],
      },
      {
        short: t("sd_guide_s3_short", "3. Your {Vault}"),
        title: t("sd_guide_s3_title", "Your {Vault} & Symlink Airgap 2.5"),
        badge: t("sd_guide_s3_badge", "ISOLATED STORAGE • SHA-256 DNA"),
        icon: t("icon_inventory_2", "inventory_2"),
        desc: t("sd_guide_s3_desc", "Your local {vault} and secured asset bunker. The game engine never touches your {Vault} directly—files are ingested, hashed via SHA-256, sanitized, and projected via symlinks."),
        tip: t("sd_guide_s3_tip", "Your Local {Mod} Dossier is decoupled from the cloud—you can freely customize {mod} titles, creator URLs, cover images, and tags locally."),
        cards: [
          {
            icon: t("icon_fingerprint", "fingerprint"),
            title: t("sd_guide_s3_c1_title", "Global Drop-Zone & DNA Match"),
            desc: t(
              "sd_guide_s3_c1_desc",
              "Drag and drop {mod} modules, .zip, .rar, .7z, .mrpack, .wabbajack, or .sanctuary.override.json files anywhere into Sanctuary OS. Duplicate SHA-256 hashes are automatically intercepted."
            ),
          },
          {
            icon: t("icon_cloud_done", "cloud_done"),
            title: t(
              "sd_guide_s3_c2_title",
              "Decentralized Static Edge (.sanctuary.override.json)"
            ),
            desc: t("sd_guide_s3_c2_desc", "When a {mod} archive includes a {mason}'s .sanctuary.override.json, Sanctuary binds its SHA-256 lineage to the {mason}'s static .sanctuary.manifest.json URL for serverless update alerts and atomic rules."),
          },
          {
            icon: t("icon_delete_sweep", "delete_sweep"),
            title: t("sd_guide_s3_c3_title", "Delete Cascade (Deep Yeet 2.0)"),
            desc: t(
              "sd_guide_s3_c3_desc",
              "Removing a core master library (such as a shared framework) automatically alerts you and queues all dependent add-ons so your loadout never breaks."
            ),
          },
          {
            icon: t("icon_visibility_off", "visibility_off"),
            title: t("sd_guide_s3_c4_title", "Ghosted Diagnostic States"),
            desc: t("sd_guide_s3_c4_desc", "Incompatible or broken {mods} automatically enter a translucent Ghosted state with hover tooltips detailing Missing DLC, Version Mismatches, or Collisions."),
          },
        ],
      },
      {
        short: t("sd_guide_s4_short", "4. {Blueprints}"),
        title: t("sd_guide_s4_title", "{Blueprints} & Tactical Loadouts"),
        badge: t("sd_guide_s4_badge", "INSTANT HOT-SWAP • CLOUD & OFFLINE"),
        icon: t("icon_map", "map"),
        desc: t("sd_guide_s4_desc", "Replace manual folder shuffling with {Blueprints}. Switch between completely different {mod} loadouts in seconds without duplicating files on your hard drive."),
        tip: t("sd_guide_s4_tip", "Use 'Snapshot Active {Blueprint}' anytime to clone your currently deployed loadout into an experimental profile before adding new {mods}."),
        cards: [
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            title: t("sd_guide_s4_c1_title", "1-Click {Blueprint} Hot-Swap"),
            desc: t("sd_guide_s4_c1_desc", "Switch active loadouts directly from the {Vault} header or {Blueprints} view. Sanctuary instantly re-projects the exact symlinks and load order for that profile."),
          },
          {
            icon: t("icon_tag", "tag"),
            title: t("sd_guide_s4_c2_title", "6-Digit Cloud Uplink (SNCXXX)"),
            desc: t(
              "sd_guide_s4_c2_desc",
              "Share your loadout with the community or across devices using a compact 6-character alphanumeric coordinate code."
            ),
          },
          {
            icon: t("icon_data_object", "data_object"),
            title: t("sd_guide_s4_c3_title", "Offline JSON Import/Export with modMeta"),
            desc: t("sd_guide_s4_c3_desc", "Export portable JSON {blueprints} that embed your custom Local Dossier metadata (author links, custom names) and workspace ID for 100% offline preservation."),
          },
          {
            icon: t("icon_install_mobile", "install_mobile"),
            title: t("sd_guide_s4_c4_title", "Remote Mobile/Web Queue Staging"),
            desc: t("sd_guide_s4_c4_desc", "Browse The Nexus on your phone or tablet, stage a {blueprint} queue encrypted in the cloud, and approve it in one click when you sit down at your PC."),
          },
        ],
      },
      {
        short: t("sd_guide_s5_short", "5. Nexus & Browser"),
        title: t("sd_guide_s5_title", "The Nexus & Integrated Side Browser"),
        badge: t("sd_guide_s5_badge", "METADATA REGISTRY • ZERO-TAX DISCOVERY"),
        icon: t("icon_hub", "hub"),
        desc: t("sd_guide_s5_desc", "Discover verified {Mods}, {Blueprints}, Lexicons, Chameleons, and Workbench Templates—and download directly from creator pages using the built-in Side Browser."),
        tip: t(
          "sd_guide_s5_tip",
          "You can toggle the Integrated Side Browser on or off anytime in System Preferences -> Network depending on whether you prefer in-app or external browsing."
        ),
        cards: [
          {
            icon: t("icon_tune", "tune"),
            title: t("sd_guide_s5_c1_title", "Smart Compatibility Filtering"),
            desc: t(
              "sd_guide_s5_c1_desc",
              "The Nexus automatically cross-references your installed Game Patch and owned DLCs, highlighting compatible releases and enforcing Tier-0 public safety."
            ),
          },
          {
            icon: t("icon_download", "download"),
            title: t("sd_guide_s5_c2_title", "Automatic Download Interception"),
            desc: t("sd_guide_s5_c2_desc", "Clicking download on a creator's page inside the Integrated Side Browser automatically intercepts the archive and routes it straight into your {Vault}."),
          },
          {
            icon: t("icon_verified", "verified"),
            title: t("sd_guide_s5_c3_title", "{Mason} Profiles & Direct Attribution"),
            desc: t("sd_guide_s5_c3_desc", "Follow your favorite {Masons} to see their posts in your Comm-Link feed. Sanctuary takes 0% platform tax and links directly to {mason} Patreon, Ko-fi, and websites."),
          },
          {
            icon: t("icon_radar", "radar"),
            title: t("sd_guide_s5_c4_title", "Crowd-Sourced Scout Queue"),
            desc: t("sd_guide_s5_c4_desc", "Unidentified local {mods} can be submitted via the Scout Dossier or marked 'Flag as Local' to permanently exclude private files from cloud lookups."),
          },
        ],
      },
      {
        short: t("sd_guide_s6_short", "6. Conflict Radar"),
        title: t("sd_guide_s6_title", "Conflict Radar & Schema Load Order Engine"),
        badge: t("sd_guide_s6_badge", "TOPOLOGICAL COMPILER • SEVERITY 1–4"),
        icon: t("icon_radar", "radar"),
        desc: t(
          "sd_guide_s6_desc",
          "Sanctuary combines global Architect Directives, creator Static Edge rules, and a topological Load Order compiler to resolve tuning overlaps and prevent crashes before launch."
        ),
        tip: t(
          "sd_guide_s6_tip",
          "Switch between Casual Mode and Advanced Mode anytime using the toggle inside Conflict Radar."
        ),
        cards: [
          {
            icon: t("icon_emoji_events", "emoji_events"),
            title: t("sd_guide_s6_c1_title", "Casual Mode: 1-Click 'Pick a Winner'"),
            desc: t("sd_guide_s6_c1_desc", "For Severity 3 Tuning Overlaps, simply click the {mod} you want to win. Sanctuary automatically compiles the priority rules and routes the winner into the top override tier."),
          },
          {
            icon: t("icon_rule", "rule"),
            title: t(
              "sd_guide_s6_c2_title",
              "Advanced Mode: Directional Rules & Cycle Breaker"
            ),
            desc: t(
              "sd_guide_s6_c2_desc",
              "Author custom 'Must Load After / Before' rules, assign explicit Priority Tiers (Base to Sanctuary3), and resolve circular dependency loops with 1-click Break Loop."
            ),
          },
          {
            icon: t("icon_warning", "warning"),
            title: t(
              "sd_guide_s6_c3_title",
              "Severity 4 (Fatal) vs. Severity 3 (Tuning)"
            ),
            desc: t("sd_guide_s6_c3_desc", "Severity 4 indicates a hard binary/script clash where only one {mod} can remain enabled. Severity 3 indicates a tuning overlap solvable via Load Order priority."),
          },
          {
            icon: t("icon_layers", "layers"),
            title: t("sd_guide_s6_c4_title", "Schema-Driven Deployment Strategies"),
            desc: t(
              "sd_guide_s6_c4_desc",
              "Adapts per game schema: dynamic manifest multi-tier folders, ordered manifest lists (loadorder.txt), numeric prefixes (001_), or timestamps."
            ),
          },
        ],
      },
      {
        short: t("sd_guide_s7_short", "7. Homestead Lab"),
        title: t("sd_guide_s7_title", "Homestead Lab & 100% Nuke Isolation"),
        badge: t("sd_guide_s7_badge", "AIRGAPPED SANDBOX • LIVE CRASH CAPTURE"),
        icon: t("icon_science", "science"),
        desc: t("sd_guide_s7_desc", "Test unverified {mods} or pit two conflicting {mods} against each other in an airgapped sandbox without risking your real save files or main loadout."),
        tip: t("sd_guide_s7_tip", "Passing a timed Homestead Lab playtest and saving in-game automatically verifies your Sandbox {mod} for publishing!"),
        cards: [
          {
            icon: t("icon_bolt", "bolt"),
            title: t("sd_guide_s7_c1_title", "100% Nuke Symlink Injection"),
            desc: t(
              "sd_guide_s7_c1_desc",
              "Temporarily strips your active loadout symlinks and injects only the isolated test subject plus its mandatory dependencies."
            ),
          },
          {
            icon: t("icon_shield", "shield"),
            title: t("sd_guide_s7_c2_title", "Hardware-Airgapped Lab Test Save"),
            desc: t(
              "sd_guide_s7_c2_desc",
              "Swaps your live user saves directories with a dedicated Lab Test Save slot during testing so your primary save slots can never be corrupted."
            ),
          },
          {
            icon: t("icon_bug_report", "bug_report"),
            title: t("sd_guide_s7_c3_title", "Real-Time Exception & Crash Monitor"),
            desc: t(
              "sd_guide_s7_c3_desc",
              "Purges stale logs before launch and watches for engine exception and crash output in real time, matching against community diagnostic signatures."
            ),
          },
          {
            icon: t("icon_compare_arrows", "compare_arrows"),
            title: t("sd_guide_s7_c4_title", "1v1 Conflict Stability Protocol"),
            desc: t("sd_guide_s7_c4_desc", "Pit two suspected conflicting {mods} together in isolation to verify compatibility and submit telemetry directly to Architects."),
          },
        ],
      },
      {
        short: t("sd_guide_s8_short", "8. {Backups} & IDE"),
        title: t("sd_guide_s8_title", "{Backups} & {Citizen}'s Workbench"),
        badge: t("sd_guide_s8_badge", "HARDLINK SNAPSHOTS • VISUAL CONFIG IDE"),
        icon: t("icon_history", "history"),
        desc: t("sd_guide_s8_desc", "Protect your saves and game binaries with zero-duplication hardlink backups, and fine-tune {mod} configuration files using visual sliders or the built-in Monaco IDE."),
        tip: t("sd_guide_s8_tip", "When DEFCON 1 is declared for an incoming game patch, Sanctuary automatically prompts to seal a Pre-Patch {Backups} before launching."),
        cards: [
          {
            icon: t("icon_archive", "archive"),
            title: t(
              "sd_guide_s8_c1_title",
              "World State (Purple) & Engine Core (Pink)"
            ),
            desc: t(
              "sd_guide_s8_c1_desc",
              "Independently snapshot your user saves, profiles, and configs (World State) and your actual Game Installation Binaries (Engine Core) before patches hit."
            ),
          },
          {
            icon: t("icon_home_storage", "home_storage"),
            title: t("sd_guide_s8_c2_title", "0 MB Delta Hardlink Deduplication"),
            desc: t(
              "sd_guide_s8_c2_desc",
              "Unchanged files are linked via native OS hardlinks rather than copied—making snapshots near-instant and consuming disk space only for changed bytes."
            ),
          },
          {
            icon: t("icon_settings_backup_restore", "settings_backup_restore"),
            title: t(
              "sd_guide_s8_c3_title",
              "Differential Rollback & Surgical Extraction"
            ),
            desc: t("sd_guide_s8_c3_desc", "Restore an entire snapshot via fast differential sync, or browse inside any {Backups} to surgically extract a single household save slot."),
          },
          {
            icon: t("icon_construction", "construction"),
            title: t("sd_guide_s8_c4_title", "{Citizen}'s Workbench & Open {Mason} Workshop"),
            desc: t("sd_guide_s8_c4_desc", "Edit {mod} .json/.ini/.cfg files with safe visual toggles and sliders synced live with a Monaco Raw Code Diff editor—plus full local Sandbox & Export Release tools for all {Citizens}."),
          },
        ],
      },
      {
        short: t("sd_guide_s9_short", "9. Themes & Security"),
        title: t("sd_guide_s9_title", "Chameleons, Lexicons & Malware Defense"),
        badge: t("sd_guide_s9_badge", "LIQUID GLASS V3 • DUAL-TIER HEURISTICS"),
        icon: t("icon_shield", "shield"),
        desc: t(
          "sd_guide_s9_desc",
          "Personalize every pixel and word of Sanctuary OS while staying protected by cryptographic SHA-256 DNA blacklists and the multi-format Rust Heuristic Scanner."
        ),
        tip: t(
          "sd_guide_s9_tip",
          "Sanctuary OS works 100% offline without an account—and if you sign in, elevated roles are protected by hardware/biometric FIDO2 Passkeys."
        ),
        cards: [
          {
            icon: t("icon_palette", "palette"),
            title: t("sd_guide_s9_c1_title", "Chameleon Theme Forge & Liquid Glass"),
            desc: t(
              "sd_guide_s9_c1_desc",
              "Switch between Dark and Light presets, download community Chameleons, or build your own in Theme Forge with live refractive saturation, rim light, and specular glare sliders."
            ),
          },
          {
            icon: t("icon_translate", "translate"),
            title: t("sd_guide_s9_c2_title", "Lexicon Protocol (Word-as-a-Service)"),
            desc: t(
              "sd_guide_s9_c2_desc",
              "Hot-swap the entire OS vocabulary between Standard Technical English, Sanctuary Sci-Fi Cyberpunk, or custom community {Lexicon} override packs."
            ),
          },
          {
            icon: t("icon_security", "security"),
            title: t(
              "sd_guide_s9_c3_title",
              "Dual-Tier Multi-Format Heuristic Scanner"
            ),
            desc: t(
              "sd_guide_s9_c3_desc",
              "Combines Sanctuary Foundry Core Heuristics and Game Spoke Heuristics to inspect archives, native {mod} modules, script bundles, .dll, .exe, and compiled Python .pyc bytecode before execution."
            ),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            title: t("sd_guide_s9_c4_title", "Full-OS Malware Lockdown & Secure Shred"),
            desc: t(
              "sd_guide_s9_c4_desc",
              "If Tier 5 Malware is detected, Sanctuary isolates the file in Quarantine, locks the workspace shell, displays the exact trigger & source in the side panel, and overwrites the file with zeros upon your Secure Shred signature."
            ),
          },
        ],
      },
    ],
    [t]
  );

  // 7-Stage Step-by-Step OS Walkthrough (What Everything Does)
  const walkthroughStages = useMemo(
    () => [
      {
        num: 1,
        short: t("dir_walk_s1_short", "1. Shell & Bars"),
        icon: t("icon_space_dashboard", "space_dashboard"),
        title: t(
          "dir_walk_s1_title",
          "Global Shell: Sidebar, Top Control Capsule & Telemetry Toast"
        ),
        sub: t("dir_walk_s1_sub", "Persistent Glass Frame & Context-Aware Navigation"),
        desc: t(
          "dir_walk_s1_desc",
          "Sanctuary OS is framed by persistent Liquid Glass regions that adapt automatically between the Foundry Landing Page and your mounted Game Workspaces."
        ),
        controls: [
          {
            icon: t("icon_menu", "menu"),
            name: t("dir_walk_s1_c1_name", "Left Navigation Sidebar"),
            desc: t("dir_walk_s1_c1_desc", "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 {Citizen} modules, unlocked Command Hubs, and the Quick Launch button."),
          },
          {
            icon: t("icon_sports_esports", "sports_esports"),
            name: t("dir_walk_s1_c2_name", "Top-Right Control Capsule & Command Matrix"),
            desc: t(
              "dir_walk_s1_c2_desc",
              "Houses the Active Workspace Selector, System Queues & Utilities, Notification Center, Ctrl+K / Cmd+K Command Matrix, and 7-Domain {Settings} inside one unified glass capsule."
            ),
          },
          {
            icon: t("icon_monitoring", "monitoring"),
            name: t("dir_walk_s1_c3_name", "Live Telemetry Toast & System Log History"),
            desc: t(
              "dir_walk_s1_c3_desc",
              "Surfaces a transient bottom-right telemetry toast during active scans or alerts—opening System Log History on click—alongside Command Center quick actions for Radar Sweep and {Vault} Lockdown."
            ),
          },
        ],
      },
      {
        num: 2,
        short: t("dir_walk_s2_short", "2. Cartographer"),
        icon: t("icon_explore", "explore"),
        title: t("dir_walk_s2_title", "Mounting a Workspace & Cartographer"),
        sub: t("dir_walk_s2_sub", "First-Boot Coordinate Mapping & Native PE/Plist/Proton Ripper"),
        desc: t("dir_walk_s2_desc", "Selecting a workspace on the Landing Page launches The Cartographer to link your game binary, live {Mods} directory, and airgapped {Vault} storage."),
        controls: [
          {
            icon: t("icon_terminal", "terminal"),
            name: t("dir_walk_s2_c1_name", "Bin Folder (Executable Path)"),
            desc: t(
              "dir_walk_s2_c1_desc",
              "Points to your game binary (.exe or .app). Sanctuary extracts the genuine patch version in-process via Rust pelite or macOS Info.plist across native and Proton prefixes."
            ),
          },
          {
            icon: t("icon_folder_open", "folder_open"),
            name: t("dir_walk_s2_c2_name", "{Mods} Folder (Symlink Target)"),
            desc: t("dir_walk_s2_c2_desc", "Your live game {Mods} folder. Keep this untouched—Sanctuary projects active {mods} here via zero-copy OS symlinks."),
          },
          {
            icon: t("icon_inventory_2", "inventory_2"),
            name: t("dir_walk_s2_c3_name", "{Vault} Folder (Deep Archive)"),
            desc: t("dir_walk_s2_c3_desc", "Your isolated storage directory where Sanctuary builds {Mods}/, {Blueprints}/, Backups/World/, Backups/Engine/, Quarantine/, and Data/Cache/."),
          },
        ],
      },
      {
        num: 3,
        short: t("dir_walk_s3_short", "3. {Vault} & Cards"),
        icon: t("icon_inventory_2", "inventory_2"),
        title: t("dir_walk_s3_title", "Your {Vault}, {Mod} Cards & Unified Filter Bar"),
        sub: t("dir_walk_s3_sub", "Drag-and-Drop Ingestion, Suite Grouping & Dossiers"),
        desc: t("dir_walk_s3_desc", "Every {mod} you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Dual-Tier Heuristic Engine, and indexed in Your {Vault}."),
        controls: [
          {
            icon: t("icon_tune", "tune"),
            name: t("dir_walk_s3_c1_name", "Unified Search & Filters Bar"),
            desc: t(
              "dir_walk_s3_c1_desc",
              "Instant search bar, Filters popover for Game Version and Eligible-Only filtering, sort order, and bulk selection actions."
            ),
          },
          {
            icon: t("icon_toggle_on", "toggle_on"),
            name: t("dir_walk_s3_c2_name", "Parent Suite Card & Equip Toggle"),
            desc: t("dir_walk_s3_c2_desc", "Toggles symlinks in milliseconds. Multi-part {mod} suites group into one Parent Card with an expandable Linked Modules drawer."),
          },
          {
            icon: t("icon_menu_book", "menu_book"),
            name: t("dir_walk_s3_c3_name", "{Mod} Dossier Drawer"),
            desc: t(
              "dir_walk_s3_c3_desc",
              "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static .sanctuary.manifest.json URL, or inspect {mod} modules."
            ),
          },
        ],
      },
      {
        num: 4,
        short: t("sd_guide_s4_short", "4. {Blueprints}"),
        icon: t("icon_map", "map"),
        title: t("dir_walk_s4_title", "{Blueprints} & Loadout Hot-Swapping"),
        sub: t("dir_walk_s4_sub", "Zero-Copy Profile Switching & SNCXXX Cloud Uplinks"),
        desc: t(
          "dir_walk_s4_desc",
          "Replace manual folder dragging with saved tactical loadouts that swap thousands of symlinks in under a second."
        ),
        controls: [
          {
            icon: t("icon_swap_horiz", "swap_horiz"),
            name: t("dir_walk_s4_c1_name", "{Blueprint} Hot-Swap Dropdown"),
            desc: t(
              "dir_walk_s4_c1_desc",
              "Switch between playstyles (e.g. Realism Run, Overhaul Profile, Patch Testing) directly from the {Vault} header, {Blueprints} view, or Top-Right Control Capsule."
            ),
          },
          {
            icon: t("icon_data_object", "data_object"),
            name: t("dir_walk_s4_c2_name", "Portable Offline JSON Export"),
            desc: t(
              "dir_walk_s4_c2_desc",
              "Exports your loadout to a self-contained .json file that preserves custom local modMeta URLs and workspace identity offline."
            ),
          },
          {
            icon: t("icon_tag", "tag"),
            name: t("dir_walk_s4_c3_name", "6-Digit Cloud Uplink (SNCXXX)"),
            desc: t("dir_walk_s4_c3_desc", "Generates a 6-character share code (SNCXXX) or publishes your {Blueprint} to The Nexus while auto-stripping flagged Tier 1–4 hashes."),
          },
        ],
      },
      {
        num: 5,
        short: t("dir_walk_s5_short", "5. Radar & Lab"),
        icon: t("icon_radar", "radar"),
        title: t("dir_walk_s5_title", "Conflict Radar & Homestead Lab"),
        sub: t("dir_walk_s5_sub", "Pick-a-Winner Load Order & 100% Nuke Proving Grounds"),
        desc: t("dir_walk_s5_desc", "Resolve tuning overlaps before launching the game, or isolate suspect {mods} in a sterile crash-monitored sandbox."),
        controls: [
          {
            icon: t("icon_emoji_events", "emoji_events"),
            name: t("dir_walk_s5_c1_name", "Casual Mode (Pick a Winner)"),
            desc: t("dir_walk_s5_c1_desc", "Click 'Pick a Winner' on any Severity 3 Tuning Overlap to automatically route the winning {mod} into a higher priority tier and dynamic load-order manifest."),
          },
          {
            icon: t("icon_rule", "rule"),
            name: t("dir_walk_s5_c2_name", "Advanced Load Order & Break Loop"),
            desc: t(
              "dir_walk_s5_c2_desc",
              "Build directional Must Load After / Before rules with topological sorting and 1-click circular dependency loop breaking."
            ),
          },
          {
            icon: t("icon_science", "science"),
            name: t("dir_walk_s5_c3_name", "Homestead 100% Nuke & 1v1 Test"),
            desc: t("dir_walk_s5_c3_desc", "Strips your main loadout and boots the game with only the test {mod} (or 2 conflicting {mods}) while harvesting engine crash and exception logs."),
          },
        ],
      },
      {
        num: 6,
        short: t("dir_walk_s6_short", "6. IDE & Backups"),
        icon: t("icon_construction", "construction"),
        title: t("dir_walk_s6_title", "Workbench, Timeline Diff & {Backups}"),
        sub: t("dir_walk_s6_sub", "2-Column Visual Config Studio & Hardlink Backups"),
        desc: t("dir_walk_s6_desc", "Edit 430+ setting {mod} config files visually at 60 FPS and safeguard your saves and game binaries with zero-bloat snapshots."),
        controls: [
          {
            icon: t("icon_tune", "tune"),
            name: t("dir_walk_s6_c1_name", "2-Column Visual Config Editor"),
            desc: t(
              "dir_walk_s6_c1_desc",
              "Category Pill Bar, dual Min/Max range steppers, Undo to Saved, Reset to Default, and a No-Code Visual Template Builder."
            ),
          },
          {
            icon: t("icon_compare_arrows", "compare_arrows"),
            name: t("dir_walk_s6_c2_name", "2-Column Timeline & Diff Panel"),
            desc: t(
              "dir_walk_s6_c2_desc",
              "Compare live unsaved edits or historical snapshots side-by-side in Visual Diff cards or Raw Monaco Code Diff."
            ),
          },
          {
            icon: t("icon_history", "history"),
            name: t("dir_walk_s6_c3_name", "{Backups} (World & Engine)"),
            desc: t(
              "dir_walk_s6_c3_desc",
              "Uses OS hardlinks so unchanged files consume 0 extra bytes, paired with differential rollback restoration."
            ),
          },
        ],
      },
      {
        num: 7,
        short: t("dir_walk_s7_short", "7. Hubs & Security"),
        icon: t("icon_shield", "shield"),
        title: t("dir_walk_s7_title", "Open Workshop, Passkeys & Lockdown"),
        sub: t("dir_walk_s7_sub", "{Citizen} Creator Inheritance & Full-OS Security Gates"),
        desc: t("dir_walk_s7_desc", "Every {Citizen} inherits the local {Mason} Workshop, while hardware FIDO2 Passkeys and full-OS Quarantine Lockdowns protect the ecosystem."),
        controls: [
          {
            icon: t("icon_handyman", "handyman"),
            name: t("dir_walk_s7_c1_name", "Open {Mason} Workshop ({Citizen} Tier)"),
            desc: t("dir_walk_s7_c1_desc", "All {Citizens} can use Dev Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge (6 Liquid Glass sliders), and Static Edge Release Packaging."),
          },
          {
            icon: t("icon_passkey", "passkey"),
            name: t("dir_walk_s7_c2_name", "FIDO2 Passkey & TOTP {Vault}"),
            desc: t("dir_walk_s7_c2_desc", "Elevated clearances (Verified {Mason} through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security {Vault} drawer."),
          },
          {
            icon: t("icon_gpp_bad", "gpp_bad"),
            name: t("dir_walk_s7_c3_name", "Universal AV Quarantine & Threat Manifest"),
            desc: t(
              "dir_walk_s7_c3_desc",
              "Tier 5 Malware locks the entire OS shell and opens the Quarantine Lockdown drawer with Triggered By diagnostics, Detection Source, and Secure Shred."
            ),
          },
        ],
      },
    ],
    [t]
  );

  // 6 Clearance Tiers (Tier 1 Citizen inheriting Open Workshop + Tier 2 Verified Mason through Tier 6 Keeper)
  const elevatedRoles = useMemo(
    () => [
      {
        short: t("role_citizen", "{Citizen}"),
        icon: t("icon_person", "person"),
        title: t("role_citizen", "{Citizen}"),
        badge: t("dir_proto_r1_tier", "Tier 1 • Base + Open Workshop"),
        desc: t(
          "dir_proto_r1_scope",
          "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions & unrestricted OS Bug Reports."
        ),
        requiresPasskey: false,
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
        short: t("dir_proto_r2_role", "Verified {Mason}"),
        icon: t("icon_construction", "construction"),
        title: t("dir_proto_r2_role", "Verified {Mason}"),
        badge: t("dir_proto_r2_tier", "Tier 2 • Verified Creator"),
        desc: t(
          "dir_proto_r2_scope",
          "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge."
        ),
        requiresPasskey: true,
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
        short: t("architect", "Architect"),
        icon: t("icon_architecture", "architecture"),
        title: t("architect", "Architect"),
        badge: t("dir_proto_r3_tier", "Tier 3 • Spoke Moderator"),
        desc: t(
          "dir_proto_r3_scope",
          "Unlocks Architect Console (strictly isolated to Compliance Tier 0 Stable records): Registry curation, Verified {Mason} & Scout Queue triage, Conflict Matrix, Known Exception Rules, Template Oversight, and Claimable {Citizen} Support Desk tickets."
        ),
        requiresPasskey: true,
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
        short: t("role_oversight", "Oversight"),
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        title: t("role_oversight", "Oversight"),
        badge: t("dir_proto_r4_tier", "Tier 4 • Spoke Security Admin"),
        desc: t(
          "dir_proto_r4_scope",
          "Unlocks Oversight Command: Tier 1–4 & Pending Flag Confirmation, Spoke Heuristic Signatures, Tier 5 Malware blacklisting, DEFCON 1 override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect)."
        ),
        requiresPasskey: true,
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
        short: t("role_wayfinder", "Wayfinder"),
        icon: t("icon_explore", "explore"),
        title: t("role_wayfinder", "Wayfinder"),
        badge: t("dir_proto_r5_tier", "Tier 5 • Spoke Sovereign"),
        desc: t(
          "dir_proto_r5_scope",
          "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), secret-free SANCTUARY-UPLINK:// bundle export & 1-click Gateway Token rotation, unilateral Cut the Cord severance, Master Schema & Lexicon Studios, 0%-Cut Donations, and The Dispatch."
        ),
        requiresPasskey: true,
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
        short: t("dir_proto_r6_role", "Keeper"),
        icon: t("icon_memory", "memory"),
        title: t("dir_proto_r6_role", "Keeper"),
        badge: t("dir_proto_r6_tier", "Tier 6 • Core OS Hub"),
        desc: t(
          "dir_proto_r6_scope",
          "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Turnkey Spoke Onboarding, Core Heuristics, Threat Manifests, Master Game Schemas, Global Lexicons/Chameleons, Bilateral Directives Sync, OS Bug Reports, and Global Audit Logs."
        ),
        requiresPasskey: true,
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
    ],
    [t]
  );

  // 12 Phases for the Interactive Roadmap Timeline (Reverse Chronological: Phase 12 -> Phase 1, enriched from Phase Roadmaps.txt & Foundry Comm-Logs)
  const roadmapPhases = useMemo(
    () => [
      {
        num: 12,
        status: "active" as const,
        icon: t("icon_rocket_launch", "rocket_launch"),
        code: t("sd_roadmap_p12_period", "PHASE 12 • JULY 15, 2026 — IN PROGRESS"),
        title: t(
          "sd_roadmap_p12_title",
          "Agnostic Future — Multi-Workspace, Sanctuary V6 Liquid Glass & Web PWA"
        ),
        sub: t("sd_roadmap_p12_focus", "{Citizens} Workbench / {Mason} IDE, Lexicon Revamp, Sanctuary Partners, V6 Liquid Glass & Website V2"),
        desc: t("sd_roadmap_p12_summary", "Dual-Vision {Mason} IDE & Cloud Lexicons (Completed), Multi-Workspace Master Schemas & the 0%-cut Sanctuary Partners Agreement, the Sanctuary V6 3D Liquid Glass Engine & 18-Section Revamp, and Website V2 / Mobile PWA."),
        milestones: [
          {
            title: t("sd_roadmap_p12_m5_title", "{Citizens} Workbench & {Mason} IDE 2.0"),
            desc: t("sd_roadmap_p12_m5_desc", "Named Version Timeline entries, simultaneous Dual-Vision (Visual + Raw Monaco) split editing, Author Mode scaffolding, and the side-by-side Lexicon Builder."),
            pending: false,
          },
          {
            title: t("sd_roadmap_p12_m6_title", "Lexicon Revamp & Cloud Schemas"),
            desc: t("sd_roadmap_p12_m6_desc", "Deduplicated all localization dictionaries, moved default Lexicon JSONs to the cloud database, and added official Sanctuary & Community badges."),
            pending: false,
          },
          {
            title: t("sd_roadmap_p12_m7_title", "Multi-Workspace & Sanctuary Partners"),
            desc: t("sd_roadmap_p12_m7_desc", "Shared Core App and SSO with per-game Master Schemas, 100% Partner DB ownership ('Cut the Cord'), 0%-cut Partner Donations, and 1-File Standalone Forking."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m8_title", "Sanctuary V6 & Liquid Glass Engine"),
            desc: t("sd_roadmap_p12_m8_desc", "4-layer 3D Refractive Liquid Glass Engine, revamped Default Themes + Partner Spoke {Chameleon} themes, and Chameleon {Chameleon} Forge 2.0."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m10_title", "Dynamic Alert Tiles & 18-Section Revamp"),
            desc: t("sd_roadmap_p12_m10_desc", "Floating 2-Pill Title Bar, Hover Dock, 5 Dynamic Alert Stat Tiles (Permissions, Global, Critical, System, Updates), and a full 18-section UI overhaul."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m9_title", "Website V2, Mobile PWA & Remote Queuing"),
            desc: t("sd_roadmap_p12_m9_desc", "Unified single-codebase Web OS & PWA across game workspaces with live Comm-Link, Nexus, Support Desk, Command Hubs, and Web-to-PC {Blueprint} queuing."),
            pending: true,
          },
          {
            title: t("sd_roadmap_p12_m11_title", "Schema-Driven Load Order Compiler"),
            desc: t("sd_roadmap_p12_m11_desc", "Declarative Master Game Schemas powering multi-strategy topological compilation across folder priority, manifest lists, numeric prefixes, and timestamps."),
            pending: false,
          },
          {
            title: t("sd_roadmap_p12_m12_title", "FIDO2 Passkey {Vault} & Quarantine Lockdown"),
            desc: t("sd_roadmap_p12_m12_desc", "Hardware WebAuthn Passkey gates for Elevated Hubs, Full-OS Malware Quarantine Lockdown, Silent Updater, and Bilateral Directives Sync."),
            pending: false,
          },
        ],
      },
      {
        num: 11,
        status: "completed" as const,
        icon: t("icon_public", "public"),
        code: t("sd_roadmap_p11_period", "PHASE 11 • MAY 17 – JULY 13, 2026"),
        title: t("sd_roadmap_p11_title", "Technical Debt Repayment, {Citizens} Workbench & The Agnostic Sprint"),
        sub: t("sd_roadmap_p11_focus", "Native Intake & Support Desk, {Citizens} Workbench 1.0 & Game-Agnostic Kernel"),
        desc: t("sd_roadmap_p11_summary", "Integrated {Mason} & Architect intake forms, native Bug Reports & Support Ticket Dossiers, {Citizens} Workbench 1.0 (.cfg/.ini/.json + Monaco IDE + Sanctuary Templates), full 11-section Lexicon/UI sweep, and the Agnostic Sprint."),
        milestones: [
          {
            title: t("sd_roadmap_p11_m5_title", "Native Intake Forms & Support Desk"),
            desc: t("sd_roadmap_p11_m5_desc", "Integrated {Mason} UUID registration, Architect intake forms, Bug Reports, and encrypted Support Ticket dossiers directly into the Desktop App."),
          },
          {
            title: t("sd_roadmap_p11_m6_title", "{Citizens} Workbench 1.0 & Sanctuary Templates"),
            desc: t("sd_roadmap_p11_m6_desc", "Automatic .cfg, .ini, and .json detection in the {Vault} with an embedded Monaco IDE and visual slider/toggle Schema Mapping."),
          },
          {
            title: t("sd_roadmap_p11_m7_title", "The Agnostic Sprint & Master Schemas"),
            desc: t("sd_roadmap_p11_m7_desc", "Extracted all hardcoded game-specific extension and path checks across frontend modules and the Rust backend into dynamic Master JSON Schemas."),
          },
          {
            title: t("sd_roadmap_p11_m8_title", "Integrated Side Browser & {Vault} Intercept"),
            desc: t("sd_roadmap_p11_m8_desc", "Embedded multi-tab Side Browser that automatically intercepts archive containers and schema-supported {mod} downloads straight into the {Vault}."),
          },
          {
            title: t("sd_roadmap_p11_m9_title", "Full-Stack Security & Forensic Audit"),
            desc: t("sd_roadmap_p11_m9_desc", "Hardened Rust path-traversal guards (is_safe_user_file_path), Supabase Row-Level Security (RLS) policies, and immutable append-only audit logs."),
          },
          {
            title: t("sd_roadmap_p11_m10_title", "Oversight {Mason} Linker & Lexicon Sweep"),
            desc: t("sd_roadmap_p11_m10_desc", "Deployed the Oversight {Mason} Linker, automatic Unregistered {Vault} syncing on Nexus verification, and a full 11-section Lexicon/UI sweep."),
          },
        ],
      },
      {
        num: 10,
        status: "completed" as const,
        icon: t("icon_palette", "palette"),
        code: t("sd_roadmap_p10_period", "PHASE 10 • MAY 10 – MAY 16, 2026"),
        title: t(
          "sd_roadmap_p10_title",
          "Post-Alpha Revamp, Visual Protocol Manager & Senior Architect Mass Update"
        ),
        sub: t("sd_roadmap_p10_focus", "Dev Sandbox, Visual Protocol Schema, Theme Forge & Mass Triage"),
        desc: t("sd_roadmap_p10_summary", "Launched the isolated Dev Sandbox & 'Sync to Network' creator pipeline, visual database-schema Protocol Manager, Folder Structure builder, Senior Architect Mass Update console, The Nexus registry, and Chameleon {Chameleon} Forge."),
        milestones: [
          {
            title: t("sd_roadmap_p10_m5_title", "Isolated Dev Sandbox & Sync to Network"),
            desc: t("sd_roadmap_p10_m5_desc", "Dedicated local Dev Sandbox folder bypassing radar hash churn for WIP {mods}, paired with 1-click 'Sync to Network' release promotion."),
          },
          {
            title: t("sd_roadmap_p10_m6_title", "Visual Protocol & Folder Structure Builder"),
            desc: t("sd_roadmap_p10_m6_desc", "Database-schema visual Protocol Manager (Core & Addons, Flavors, Dependencies, DLC) and visual Folder Structure builder enforced by Sanitize {Vault}."),
          },
          {
            title: t("sd_roadmap_p10_m7_title", "Senior Architect Mass Update & Filters"),
            desc: t("sd_roadmap_p10_m7_desc", "Bulk post-patch triage console for Senior Architects alongside 'Game Version', 'Currently Eligible', and 'Exclude Unowned DLC' filters."),
          },
          {
            title: t("sd_roadmap_p10_m8_title", "The Nexus Discovery Registry"),
            desc: t("sd_roadmap_p10_m8_desc", "Global metadata catalog for {Mods}, {Blueprints}, Lexicons, Chameleons, and Templates with automatic game patch and DLC compatibility filtering."),
          },
          {
            title: t("sd_roadmap_p10_m9_title", "Chameleon Theme Forge & Holo Sandbox"),
            desc: t("sd_roadmap_p10_m9_desc", "Interactive Theme Forge suite featuring a multi-stop atmospheric Background Builder, Dark/Light adaptation, and live Holo Sandbox previewing."),
          },
          {
            title: t("sd_roadmap_p10_m10_title", "Hot-Swappable Lexicon Protocol"),
            desc: t("sd_roadmap_p10_m10_desc", "Word-as-a-Service localization engine routing 100% of UI labels and icons through hot-swappable JSON dictionaries."),
          },
        ],
      },
      {
        num: 9,
        status: "completed" as const,
        icon: t("icon_admin_panel_settings", "admin_panel_settings"),
        code: t("sd_roadmap_p9_period", "PHASE 9 • MAY 8 – MAY 9, 2026"),
        title: t(
          "sd_roadmap_p9_title",
          "Infrastructure Finalization, Laboratory Diagnostics & Command Hubs"
        ),
        sub: t("sd_roadmap_p9_focus", "Proving Grounds Simulation, macOS Universal Pipeline & Command Hubs"),
        desc: t(
          "sd_roadmap_p9_summary",
          "Transitioned Homestead Proving Grounds into a live simulation laboratory with real-time log monitoring, deployed the Senior Architect & Wayfinder Command Hubs, automated signed macOS Universal (.dmg) builds, and enforced Florida Compliance Tiers 1–4."
        ),
        milestones: [
          {
            title: t("sd_roadmap_p9_m5_title", "Live Proving Grounds & macOS Pipeline"),
            desc: t("sd_roadmap_p9_m5_desc", "Real-time crash log monitoring with 1-click conflict rule pushing in the Homestead Lab, plus signed macOS Universal (.dmg) GitHub Actions builds."),
          },
          {
            title: t("sd_roadmap_p9_m6_title", "Five Elevated Command Hubs"),
            desc: t("sd_roadmap_p9_m6_desc", "Dedicated ElevatedHubLayout command centers for {Mason} Workshop, Architect Console, Oversight Command, Wayfinder Operations, and Keepers Core."),
          },
          {
            title: t("sd_roadmap_p9_m7_title", "Claimable Support Desk Ticket Dossiers"),
            desc: t("sd_roadmap_p9_m7_desc", "Interactive ticket dossiers equipped with PII-scrubbed crash logs, response macros, and cross-tier escalation between Architects and Oversight."),
          },
          {
            title: t("sd_roadmap_p9_m8_title", "Florida Compliance Tiers 1–4"),
            desc: t("sd_roadmap_p9_m8_desc", "Automated public feed scrubbing and Cloud {Blueprint} hash purge triggers protecting public discovery while preserving local {Vault} freedom."),
          },
        ],
      },
      {
        num: 8,
        status: "completed" as const,
        icon: t("icon_cell_tower", "cell_tower"),
        code: t("sd_roadmap_p8_period", "PHASE 8 • MAY 7 – MAY 8, 2026"),
        title: t(
          "sd_roadmap_p8_title",
          "Standardized Lexicons, Dynamic Engine Recognition & DEFCON Shield"
        ),
        sub: t("sd_roadmap_p8_focus", "Rust Rip Protocol, Auto-Sanitization Launch & DEFCON 1 Shield"),
        desc: t("sd_roadmap_p8_summary", "Engineered the Rust 'Rip Protocol' for dynamic engine version recognition, Auto-Sanitization Launch purging stale crash logs & caches, Global Lexicon Extraction, the {Blueprint} Architect Load Order UI, and the real-time DEFCON 1 patch shield."),
        milestones: [
          {
            title: t("sd_roadmap_p8_m5_title", "Rust 'Rip Protocol' & Auto-Sanitization"),
            desc: t("sd_roadmap_p8_m5_desc", "Dynamic engine version recognition parsing config files and PE headers in Rust, plus pre-launch purging of stale crash logs and volatile cache files."),
          },
          {
            title: t("sd_roadmap_p8_m6_title", "Global Comm-Link Broadcast Feed"),
            desc: t("sd_roadmap_p8_m6_desc", "Real-time community feed supporting WYSIWYG/Markdown dispatches, multi-level threaded replies, and dedicated Discover & Following tabs."),
          },
          {
            title: t("sd_roadmap_p8_m7_title", "DEFCON 1 Pre-Patch Network Shield"),
            desc: t("sd_roadmap_p8_m7_desc", "Real-time network listener that intercepts game launches during breaking engine patches to prompt an emergency {Backups} backup."),
          },
          {
            title: t("sd_roadmap_p8_m8_title", "Tier 5 Malware Scanner & Secure Shred"),
            desc: t("sd_roadmap_p8_m8_desc", "Byte-level heuristic malware scanner, {Citizen}-signed zero-fill Secure Shredding, and the privacy-first hardware_bans Nuclear Override."),
          },
        ],
      },
      {
        num: 7,
        status: "completed" as const,
        icon: t("icon_construction", "construction"),
        code: t("sd_roadmap_p7_period", "PHASE 7 • MAY 6, 2026"),
        title: t("sd_roadmap_p7_title", "Core Architecture, {Backups} Compression & Windows MSI Pipeline"),
        sub: t("sd_roadmap_p7_focus", "Nested {Vault} Taxonomy, 78 GB → 24 GB Engine Compression & Automated MSI Builds"),
        desc: t("sd_roadmap_p7_summary", "Deployed the nested {Vault} directory hierarchy, optimized {Backups} Engine Core compression (78 GB → 24 GB) with <50s rollbacks, automated Windows .msi GitHub Actions builds, and integrated Scout Dossiers into Conflict Radar."),
        milestones: [
          {
            title: t("sd_roadmap_p7_m5_title", "Nested {Vault} Taxonomy & 24 GB Compression"),
            desc: t("sd_roadmap_p7_m5_desc", "Self-healing {Vault} hierarchy (Backups/World, Backups/Engine, Data/cache, Quarantine) and 78 GB → 24 GB Engine Core compression with <50s rollbacks."),
          },
          {
            title: t("sd_roadmap_p7_m6_title", "Schema-Driven Visual Config Workbench"),
            desc: t("sd_roadmap_p7_m6_desc", "Visual configuration studio rendering raw {mod} settings as interactive sliders and toggles synchronized live with a Monaco Raw Editor."),
          },
          {
            title: t("sd_roadmap_p7_m7_title", "{Mason} Workshop & Collections Orchestrator"),
            desc: t("sd_roadmap_p7_m7_desc", "Creator suite featuring an isolated Dev Sandbox, Collections Builder, and relational Protocol Orchestrator for Twins, Flavors, and Dependencies."),
          },
          {
            title: t("sd_roadmap_p7_m8_title", "In-Process Rust PE Executable Parser"),
            desc: t("sd_roadmap_p7_m8_desc", "Native Rust pelite binary parser extracting genuine patch versions directly from .exe headers with zero antivirus false positives."),
          },
        ],
      },
      {
        num: 6,
        status: "completed" as const,
        icon: t("icon_science", "science"),
        code: t("sd_roadmap_p6_period", "PHASE 6 • MAY 3 – MAY 5, 2026"),
        title: t(
          "sd_roadmap_p6_title",
          "Codebase Modularization, Comm-Link Ledger & Homestead Proving Grounds"
        ),
        sub: t("sd_roadmap_p6_focus", "{Mason} Following Feed, Domain View Modularization & Nuke Sandbox"),
        desc: t(
          "sd_roadmap_p6_summary",
          "Launched the {Mason} Following system and real-time Comm-Link discovery ledger, modularized the core shell into dedicated domain views, extracted Yeet Cascade casualty tracking, and built the 100% Nuke Isolation Proving Grounds."
        ),
        milestones: [
          {
            title: t("sd_roadmap_p6_m5_title", "{Mason} Following & Domain Modularization"),
            desc: t("sd_roadmap_p6_m5_desc", "Added the {Mason} Following feed to Comm-Link, modularized the core shell into dedicated domain views, and extracted Yeet Cascade casualty tracking."),
          },
          {
            title: t("sd_roadmap_p6_m6_title", "100% Nuke Injection Sandbox"),
            desc: t("sd_roadmap_p6_m6_desc", "Temporarily strips active {Vault} symlinks during Proving Grounds runs to inject only the isolated test subject and its mandatory dependencies."),
          },
          {
            title: t("sd_roadmap_p6_m7_title", "1v1 Conflict Stability Arena"),
            desc: t("sd_roadmap_p6_m7_desc", "Pits two suspected colliding {mods} head-to-head in an airgapped test environment while monitoring real-time engine stability."),
          },
          {
            title: t("sd_roadmap_p6_m8_title", "Automated Crash Log Harvester & Scrubber"),
            desc: t("sd_roadmap_p6_m8_desc", "Captures engine exception and crash logs automatically and scrubs local filesystem paths and PII (scrub_user_data_from_log) before sharing."),
          },
        ],
      },
      {
        num: 5,
        status: "completed" as const,
        icon: t("icon_history", "history"),
        code: t("sd_roadmap_p5_period", "PHASE 5 • MAY 1 – MAY 3, 2026"),
        title: t("sd_roadmap_p5_title", "Defensive Protocols, Symlink Airgap 2.1 & {Mason} Protocol Manager"),
        sub: t("sd_roadmap_p5_focus", "Real-Time Airgap Watcher, DNA Duplicate Intercept & Time Capsule"),
        desc: t("sd_roadmap_p5_summary", "Implemented Symlink Airgap 2.1 real-time .cfg/.ini file watching in Rust, SHA-256 DNA duplicate interception, {Mason} Protocol Manager 1.0, intelligent Google Search fallback, and hardlink {Backups} snapshots."),
        milestones: [
          {
            title: t("sd_roadmap_p5_m5_title", "Real-Time Airgap Watcher & DNA Intercept"),
            desc: t("sd_roadmap_p5_m5_desc", "Non-blocking Rust notify thread syncing live in-game .cfg/.ini edits back to the {Vault}, plus SHA-256 duplicate interception on drop."),
          },
          {
            title: t("sd_roadmap_p5_m6_title", "Dual-State {Backups} Architecture"),
            desc: t("sd_roadmap_p5_m6_desc", "Independently snapshots World State (User Saves, Profiles & Settings) and Engine Core (Game Installation Binaries) before patches or {mod} tests."),
          },
          {
            title: t("sd_roadmap_p5_m7_title", "Zero-Bloat OS Hardlink Snapshot Engine"),
            desc: t("sd_roadmap_p5_m7_desc", "Uses parallel native NTFS/POSIX Copy-on-Write (CoW) hardlink deduplication so unchanged files consume zero extra disk space."),
          },
          {
            title: t("sd_roadmap_p5_m8_title", "Differential Rollback Comparator"),
            desc: t("sd_roadmap_p5_m8_desc", "High-speed diff_backup engine that restores only modified bytes and purges rogue files without re-copying the entire installation."),
          },
        ],
      },
      {
        num: 4,
        status: "completed" as const,
        icon: t("icon_radar", "radar"),
        code: t("sd_roadmap_p4_period", "PHASE 4 • APRIL 28 – MAY 1, 2026"),
        title: t("sd_roadmap_p4_title", "The Global Network, Radiant Light Mode & Cloud {Blueprints}"),
        sub: t("sd_roadmap_p4_focus", "Radiant ThemeProvider, SNC-XXXXX Cloud Codes & Conflict Radar"),
        desc: t("sd_roadmap_p4_summary", "Expanded beyond dark-only Bunker to Radiant Light Mode with real-time ThemeProvider switching, launched 6-digit Cloud {Blueprint} transmissions (SNC-XXXXX), added the Architect Signature gate, and established Conflict Radar Severity 1–4."),
        milestones: [
          {
            title: t("sd_roadmap_p4_m5_title", "Radiant Mode, ThemeProvider & Signature Gate"),
            desc: t("sd_roadmap_p4_m5_desc", "Introduced Radiant (Light Mode) and real-time ThemeProvider profile switching, 6-digit Cloud {Blueprint} codes, and the Architect Signature gate."),
          },
          {
            title: t("sd_roadmap_p4_m6_title", "Severity 1–4 Collision Matrix"),
            desc: t("sd_roadmap_p4_m6_desc", "Proactive conflict classifier distinguishing minor overlaps from Severity 3 Tuning Overlaps and Severity 4 Fatal Clashes."),
          },
          {
            title: t("sd_roadmap_p4_m7_title", "Priority Tier Folders & Dynamic Load Manifests"),
            desc: t("sd_roadmap_p4_m7_desc", "Multi-tier override directories (Sanctuary1–Sanctuary3) paired with automated load-order manifest priority depth compilation."),
          },
          {
            title: t("sd_roadmap_p4_m8_title", "Architect Console & Crowd-Sourced Scout Queue"),
            desc: t("sd_roadmap_p4_m8_desc", "Dedicated moderation console for verifying community Scout Dossier submissions behind Copilot confirmation gates."),
          },
        ],
      },
      {
        num: 3,
        status: "completed" as const,
        icon: t("icon_hub", "hub"),
        code: t("sd_roadmap_p3_period", "PHASE 3 • APRIL 15 – APRIL 28, 2026"),
        title: t(
          "sd_roadmap_p3_title",
          "System Rip, Deep Yeet 2.0 & Logic Intelligence"
        ),
        sub: t("sd_roadmap_p3_focus", "Deep Yeet 2.0, UTF-16 Version Ripper, Twin Bonds & Copilot"),
        desc: t("sd_roadmap_p3_summary", "Engineered Deep Yeet 2.0 recursive dependency cascade scanning, the Rust UTF-16 byte-filter System Version Ripper, Twin Bond synchronized script/package links, and the Copilot Philosophy halting for manual {Citizen} signature."),
        milestones: [
          {
            title: t("sd_roadmap_p3_m5_title", "Deep Yeet 2.0 & UTF-16 Version Ripper"),
            desc: t("sd_roadmap_p3_m5_desc", "Recursive dependency cascade scanner queuing orphaned addons on master removal, paired with the Rust UTF-16 binary version ripper."),
          },
          {
            title: t("sd_roadmap_p3_m6_title", "Atomic Logic Triumvirate"),
            desc: t("sd_roadmap_p3_m6_desc", "Relational {mod} rules enforcing Highlander Flavor eviction, bidirectional companion module/script Twin bonds, and Recursive Chain-Link Dependencies."),
          },
          {
            title: t("sd_roadmap_p3_m7_title", "Orphaned Addon Cascade Protection"),
            desc: t("sd_roadmap_p3_m7_desc", "Intercepts master library removal and halts for the {Citizen}'s manual signature before cleanly unequipping or removing dependent child add-ons."),
          },
          {
            title: t("sd_roadmap_p3_m8_title", "SNCXXX Cloud {Blueprints} & Ghosted States"),
            desc: t("sd_roadmap_p3_m8_desc", "6-character alphanumeric Cloud {Blueprint} share codes, portable offline JSON exports, and automatic Missing DLC Ghosting diagnostics."),
          },
        ],
      },
      {
        num: 2,
        status: "completed" as const,
        icon: t("icon_map", "map"),
        code: t("sd_roadmap_p2_period", "PHASE 2 • APRIL 10 – APRIL 15, 2026"),
        title: t(
          "sd_roadmap_p2_title",
          "Visual Uplink, Glassmorphism 1.0 & The Quarantine Zone"
        ),
        sub: t("sd_roadmap_p2_focus", "Glassmorphism 1.0, Quarantine Bio-Hazard Sector & Symlink Airgap"),
        desc: t(
          "sd_roadmap_p2_summary",
          "Introduced the Glassmorphism 1.0 backdrop-blur engine, constructed the dedicated bio-hazard Quarantine Zone for isolating malicious files, and unified the app into a layered desktop OS experience backed by Symlink Airgap and SQLite caching."
        ),
        milestones: [
          {
            title: t("sd_roadmap_p2_m5_title", "Glassmorphism 1.0 & Bio-Hazard Quarantine"),
            desc: t("sd_roadmap_p2_m5_desc", "Translucent backdrop-blur glass containers with deep elevation shadows and a dedicated Quarantine Zone for isolating and shredding threats."),
          },
          {
            title: t("sd_roadmap_p2_m6_title", "Symlink Airgap 2.5 Projection Engine"),
            desc: t("sd_roadmap_p2_m6_desc", "Projects active {mods} from the isolated {Vault} into the live game directory via zero-copy OS symlinks in milliseconds."),
          },
          {
            title: t("sd_roadmap_p2_m7_title", "Sub-Second SQLite Delta Scanner"),
            desc: t("sd_roadmap_p2_m7_desc", "Local .sanctuary_cache.db SQLite engine using mtime-first delta checks to index 5,000+ {mod} Vaults in sub-second sweeps."),
          },
          {
            title: t("sd_roadmap_p2_m8_title", "Self-Healing {Vault} Sanitizer & Profiles"),
            desc: t("sd_roadmap_p2_m8_desc", "Automatically maintains the isolated {Vault} directory structure and powers instant local {Blueprint} loadout switching."),
          },
        ],
      },
      {
        num: 1,
        status: "completed" as const,
        icon: t("icon_inventory_2", "inventory_2"),
        code: t("sd_roadmap_p1_period", "PHASE 1 • APRIL 1 – APRIL 10, 2026"),
        title: t(
          "sd_roadmap_p1_title",
          "Bunker Initialization, Cartographer Protocol & SHA-256 DNA Pathing"
        ),
        sub: t("sd_roadmap_p1_focus", "First-Boot Cartographer Recon & Millisecond Delta Caching"),
        desc: t("sd_roadmap_p1_summary", "Initialized the Tauri v2 + Rust + React 19 architecture, built The Cartographer automated first-boot reconnaissance scanner for Game Bin & {Mods} directories, and engineered SHA-256 DNA delta caching."),
        milestones: [
          {
            title: t("sd_roadmap_p1_m5_title", "Cartographer Recon & Millisecond Delta Cache"),
            desc: t("sd_roadmap_p1_m5_desc", "Automated first-boot drive reconnaissance locating Game Bin & {Mods} folders, paired with SHA-256 delta caching for instant startup."),
          },
          {
            title: t("sd_roadmap_p1_m6_title", "Tauri v2 + Rust + React 19 Kernel"),
            desc: t("sd_roadmap_p1_m6_desc", "Foundational desktop OS architecture combining a native multi-threaded Rust backend with React 19, TypeScript, and Zustand."),
          },
          {
            title: t("sd_roadmap_p1_m7_title", "Automated Coordinate Discovery Wizard"),
            desc: t("sd_roadmap_p1_m7_desc", "Guided first-launch Cartographer setup linking Game Binaries, live {Mods} folders, and airgapped Bunker {Vault} coordinates."),
          },
          {
            title: t("sd_roadmap_p1_m8_title", "Streaming SHA-256 DNA & Archive Inspector"),
            desc: t("sd_roadmap_p1_m8_desc", "Multi-threaded Rust cryptographic hashing and in-memory binary chunk/ZIP header inspection without extracting archives to disk."),
          },
        ],
      },
    ],
    [t]
  );

  return { citizenSteps, walkthroughStages, elevatedRoles, roadmapPhases };
}

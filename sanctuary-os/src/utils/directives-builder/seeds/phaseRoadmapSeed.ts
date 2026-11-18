import type { DirectiveBuilderSchema, DirectiveBuilderCard } from "../types";
import { CURRENT_DIRECTIVE_SCHEMA_VERSION } from "../types";

export function buildPhaseRoadmapSchema(
  t: (key: string, fallback?: string) => string,
  g: (txt: string) => string,
  elevatedRolesCards: DirectiveBuilderCard[]
): DirectiveBuilderSchema {
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
            icon: t("icon_check_circle", "check_circle"),
            title: g("Creator Airlock"),
            desc: g(
              "Launches external authoring, asset-editing, and modding tools inside a Save-Airgapped {Lab} session with automatic post-exit save restoration—physically isolating primary saves during edits."
            ),
            pending: false,
          },
          {
            id: "phase_14_m2",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Quartermaster"),
            desc: g(
              "Intercepts multi-variant .fomod (ModuleConfig.xml UTF-8/UTF-16LE) and BAIN archives on drop or download via a Guided Package Installer drawer with conditional flag evaluation."
            ),
            pending: false,
          },
          {
            id: "phase_14_m3",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Zero-Copy Exodus"),
            desc: g(
              "Zero-reinstall out-of-tree migration via {Blueprints} -> Migrate External Manager: auto-detects MO2, Vortex, and staging directories, screens with ByteHound, absorbs files via OS hardlinks, reconstructs {Blueprint} profiles, and relocates Master {Vault} roots."
            ),
            pending: false,
          },
          {
            id: "phase_14_m4",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Rosetta Protocol"),
            desc: g(
              "Cross-platform curated modlist and collection translator compiling .mrpack, CurseForge manifest.json, Nexus collection.json (with modRules), and .wabbajack archives across Drag & Drop and {Blueprint} import, binding local SHA-256 matches and queuing missing items cleanly."
            ),
            pending: false,
          },
          {
            id: "phase_14_m5",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Save Doctor"),
            desc: g(
              "Pairs save activity with the deployed {Blueprint} DNA manifest ({Vault}/.sanctuary_save_doctor/<ws>.sanctuary-save-manifest.json) and warns before launch if switching {Blueprints} removed {mods} required by existing saves."
            ),
            pending: false,
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
            pending: false,
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
              "7 multi-game architecture presets, Windows (.exe) & macOS (.app) coordinate mapping, secondary install_routes, database-driven public.taxonomy Categories, and live config_extensions syncing."
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
              "Byte-level heuristic malware scanner, {Citizen}-signed zero-fill Secure Shredding, and the privacy-first hardware_bans Nuclear Override."
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
              "Uses parallel native NTFS/POSIX Copy-on-Write (CoW) hardlink deduplication so unchanged files consume zero extra disk space."
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
          "Initialized the Tauri v2 + Rust + React 19 architecture, built The Cartographer automated first-boot reconnaissance scanner for Game Bin & {Mods} directories, and engineered SHA-256 DNA delta caching."
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
            title: g("Tauri v2 + Rust + React 19 Kernel"),
            desc: g(
              "Foundational desktop OS architecture combining a native multi-threaded Rust backend with React 19, TypeScript, and Zustand."
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

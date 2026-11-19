import type { DirectiveBuilderSchema, DirectiveBuilderCard } from "../types";
import { CURRENT_DIRECTIVE_SCHEMA_VERSION } from "../types";

export function buildPhaseRoadmapSchema(
  t: (key: string, fallback: string) => string,
  g: (txt: string) => string,
  elevatedRolesCards: DirectiveBuilderCard[]
): DirectiveBuilderSchema {
    const roadmapCards: DirectiveBuilderCard[] = [
      {
        id: "phase_16",
        icon: t("icon_verified", "verified"),
        overline: g("PHASE 16 (V1.0.0 GA) • PLANNED"),
        badge: g("PLANNED"),
        title: g("Global GA — Reproducible Signed Builds & Sovereign Ecosystem"),
        footerMeta: g(
          "Notarized Multi-OS Signing • Audited Crypto • Spoke SLA & Abandonment Automation • V1.0 Spec Freeze"
        ),
        desc: g(
          "General Availability release delivering reproducible Authenticode EV / notarized Apple / GPG-signed desktop binaries, third-party cryptographic and VFS security audits, automated Keepers Core Spoke DMCA/abandonment tooling, and the frozen v1.0 Master Schema specification."
        ),
        status: "planned",
        subCards: [
          {
            id: "phase_16_m1",
            icon: t("icon_verified_user", "verified_user"),
            roadmapStatus: "planned",
            title: g("Reproducible Multi-OS Code Signing & Notarization"),
            desc: g(
              "Production Windows Authenticode EV / Azure Trusted Signing, notarized Apple Universal .dmg binaries, and GPG-signed Linux AppImage/DEB releases with build provenance attestations."
            ),
          },
          {
            id: "phase_16_m2",
            icon: t("icon_security", "security"),
            roadmapStatus: "planned",
            title: g("External Cryptography & VFS Security Audit"),
            desc: g(
              "Independent third-party verification of Split-Custody HKDF-SHA256 / AES-256-GCM envelopes, Ed25519 manifests, WebAuthn FIDO2 gates, and Rust extraction/path-traversal sandboxing."
            ),
          },
          {
            id: "phase_16_m3",
            icon: t("icon_gavel", "gavel"),
            roadmapStatus: "planned",
            title: g("Partner Spoke SLA & Succession Automation"),
            desc: g(
              "In-hub UI tooling for 48h Spoke DMCA compliance logs, automated Abandoned Spoke / Wayfinder Succession handoffs, and zero-downtime spoke schema migrations."
            ),
          },
          {
            id: "phase_16_m4",
            icon: t("icon_public", "public"),
            roadmapStatus: "planned",
            title: g("Global Lexicon Registry & V1.0 Stability Freeze"),
            desc: g(
              "Public community translation pack index, frozen v1.0 sanctuary_schemas contract, and production multi-region Core Hub Federation SLA guarantees."
            ),
          },
        ],
      },
      {
        id: "phase_15",
        icon: t("icon_upcoming", "upcoming"),
        overline: g("PHASE 15 (V0.7.0 BETA) • PLANNED"),
        badge: g("PLANNED"),
        title: g("Beta Stabilization — 27-Preset Soak, Fire Drill & Opt-In Controls"),
        footerMeta: g(
          "Real-Game E2E Soak • Automated Patch Fire Drill • Opt-In Telemetry Granularity • 50k-Mod Performance Budgets"
        ),
        desc: g(
          "Pre-GA public beta stabilization delivering real-game end-to-end soak verification across all 27 engine presets, automated Patch Fire Drill & Groundhog bisect orchestration, granular opt-in cloud mirroring controls, and in-hub Spoke SQL migration runners."
        ),
        status: "planned",
        subCards: [
          {
            id: "phase_15_m1",
            icon: t("icon_sports_esports", "sports_esports"),
            roadmapStatus: "planned",
            title: g("27-Preset Real-Game End-to-End Soak Suite"),
            desc: g(
              "Cross-platform storefront verification (Steam, GOG, Epic, Xbox Store, Proton) testing real binary version ripping, hardlink/junction deployment, and runtime Overwrite capture."
            ),
          },
          {
            id: "phase_15_m2",
            icon: t("icon_local_fire_department", "local_fire_department"),
            roadmapStatus: "planned",
            title: g("Patch Fire Drill & Groundhog Bisect Polish"),
            desc: g(
              "Automated pre-patch dry-run staging simulation and interactive 1-click binary search mod isolation sweeps inside Homestead Lab."
            ),
          },
          {
            id: "phase_15_m3",
            icon: t("icon_tune", "tune"),
            roadmapStatus: "planned",
            title: g("Granular Opt-In Cloud Mirroring Controls"),
            desc: g(
              "Unified per-device consent dashboard governing opt-in Lab verification certificates, Pocket Radar encrypted staging queues, and optional Zero-PII Threat Manifest uploads."
            ),
          },
          {
            id: "phase_15_m4",
            icon: t("icon_speed", "speed"),
            roadmapStatus: "planned",
            title: g("In-Hub Spoke Migrator & 60 FPS Scale Budgets"),
            desc: g(
              "Interactive Wayfinder migrations/spoke/ version upgrader (v1 -> v3+), WebGL2 Low-Power / Reduced-Motion presets, and 50,000+-mod UI frame budgets."
            ),
          },
        ],
      },
      {
        id: "phase_14",
        icon: t("icon_science", "science"),
        overline: g("PHASE 14 (V0.6.0-DEV.15) • NOVEMBER 2026 — ACTIVE ERA"),
        badge: g("ACTIVE PHASE"),
        title: g(
          "Universal Multi-Engine Expansion, Patch Fire Drill & Deck Overdrive"
        ),
        footerMeta: g(
          "Creator Airlock • Quartermaster • Zero-Copy Exodus • Rosetta Protocol • Save Doctor • 27 Presets • Differential VFS"
        ),
        desc: g(
          "Major v0.6.0 expansion shipping Creator Airlock external tool save isolation, The Quartermaster guided package wizard, Zero-Copy Exodus MO2/Vortex migration, The Rosetta Protocol modlist translation + lockfile hydration, Save Doctor, Cloud-Sync Folder Sentinel, Deck Overdrive, Code-Switch (7,300+ strings), Crash Autopsy, Conflict Radar 2.0 (multi-engine binary TOCs + LOOT), Differential Rayon VFS, Million-Citizen Cloud Scale, and the Ironclad Gauntlet test suite—while Patch Fire Drill & Groundhog Sandbox finalize for v0.7.0."
        ),
        status: "active",
        subCards: [
          {
            id: "phase_14_m1",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Creator Airlock"),
            desc: g(
              "Launches external authoring, asset-editing, and modding tools inside a Save-Airgapped {Lab} session with automatic post-exit save restoration—physically isolating primary saves during edits (distinct from the in-app Open {Mason} Workshop)."
            ),
            pending: false,
          },
          {
            id: "phase_14_m2",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Quartermaster"),
            desc: g(
              "Intercepts multi-variant .fomod (ModuleConfig.xml UTF-8/UTF-16LE, <gameDependency>/<fommDependency>) and BAIN archives on drop or download via a Guided Package Installer drawer with 1-click reconfiguration."
            ),
            pending: false,
          },
          {
            id: "phase_14_m3",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Zero-Copy Exodus"),
            desc: g(
              "Zero-reinstall out-of-tree migration via {Blueprints} -> Migrate External Manager or Cartographer setup: auto-detects MO2, Vortex, and staging directories, screens with ByteHound, absorbs files via OS hardlinks, and reconstructs {Blueprint} profiles."
            ),
            pending: false,
          },
          {
            id: "phase_14_m4",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Rosetta Protocol & Lockfile Hydration"),
            desc: g(
              "Cross-platform modlist translator compiling .mrpack, CurseForge manifest.json, Nexus collection.json, and .wabbajack archives alongside 1-click parallel .sanctuary-blueprint.lock.json hydration and BSDiff/xdelta binary patching."
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
              "Simulates any upstream game patch across all {Blueprints} with 1:1 deduplicated {mod} counts, transitive Atomic Logic dependency cascades, local Echo Archive Auto-Swap detection, and Clone Ready {Blueprint} generation (full headless soak finalizing in v0.7.0)."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m7",
            icon: t("icon_science", "science"),
            title: g("Groundhog Sandbox"),
            desc: g(
              "Save-verify-and-rewind {Lab} airgap featuring an externalized save mirror, read-only Golden Baseline test saves, strict opt-in OFF cloud verification certificates, anti-cheat-safe timers, and fullscreen PCM chimes (full automated bisect finalizing in v0.7.0)."
            ),
            pending: false,
            roadmapStatus: "in_testing",
          },
          {
            id: "phase_14_m8",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Universal Master Schema (27 Presets)"),
            desc: g(
              "100% engine-agnostic sanctuary_schemas across 27 built-in presets, Overwrite runtime capture, ini_mutations, profile_isolated_dirs, post_deploy_hooks, and declarative virtual_fs_path, archive_member, binary_chunk_index (TES4/BSA/BA2/LSPK/PAK/UTOC/RDAR/RPF7), and json_xml_key analyzers."
            ),
            pending: false,
          },
          {
            id: "phase_14_m9",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Deck Overdrive"),
            desc: g(
              "Full-OS Steam Deck controller engine and Proton prefix auto-resolver: unifies Gamescope XWayland surface binding, decodes 64-byte hidraw packets into a 60 FPS {Chameleon} Virtual Pointer + 2D Spatial Focus engine, and launches Windows tools/script extenders inside Proton prefixes."
            ),
            pending: false,
          },
          {
            id: "phase_14_m10",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Code-Switch (7,400+ Keys)"),
            desc: g(
              "Lexicon Engine V2 with automated 7,400+-key Standard English extraction (7,409 keys), Sparse Delta Override packs, Source-First 4-tab Visual Studio, Guided Icon Overrides, and 1-click neural auto-translation with {Glossary} placeholder masking."
            ),
            pending: false,
          },
          {
            id: "phase_14_m11",
            icon: t("icon_check_circle", "check_circle"),
            title: g("The Highlander Rule"),
            desc: g(
              "Enforces single-winner exclusive slots (highlander_group_id) with explicit Swap, Keep Both, or Cancel alerts on {Vault} cards and Dossiers so rival {mods} never vanish silently."
            ),
            pending: false,
          },
          {
            id: "phase_14_m12",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Echo Suppressor"),
            desc: g(
              "Zero-PII AES-256-GCM cross-device notification deduplication and per-Spoke alert muting across Windows, Steam Deck, and Mobile PWA, paired with 7-Domain {Settings} and the Per-Space {Chameleons} & {Lexicons} Matrix."
            ),
            pending: false,
          },
          {
            id: "phase_14_m13",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Crash Autopsy"),
            desc: g(
              "Citizen-facing {Lab} Known Error showcase (Corrupted / Unstable / Unrelated) backed by SQLite <10ms exception correlation, Architect-pinned public.known_exception_rules, and instant crash-log paste decoding."
            ),
            pending: false,
          },
          {
            id: "phase_14_m14",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Pocket Radar (Opt-In Companion)"),
            desc: g(
              "Mobile PWA and Web Vault Companion with strict opt-in OFF by default for encrypted active-{Blueprint} DNA sync, pairing with Beam to Rig transfers and responsive mobile filter pills."
            ),
            pending: false,
          },
          {
            id: "phase_14_m15",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Browser Autoloader, Direct HTTPS & Deep Links"),
            desc: g(
              "Guided Update Queue (1 of N) in Side Panel Browser alongside direct SHA-256 HTTPS streaming, tri-OS Deep Links (sanctuary://, nxm://, ror2mm://, curseforge://), and optional local DPAPI BYO-API-Key Broker."
            ),
            pending: false,
          },
          {
            id: "phase_14_m16",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Jump Gate"),
            desc: g(
              "Global Ctrl+K / Cmd+K Liquid Glass command palette across Desktop, Web, and Mobile PWA for jumping to installed {Vault} {mods}, toggling {Blueprint} items, navigating all OS views, switching {Chameleons} & {Lexicons}, and firing quick actions."
            ),
            pending: false,
          },
          {
            id: "phase_14_m17",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Conflict Radar 2.0 & LOOT Compiler"),
            desc: g(
              "5-Tier Severity Matrix (S1–S5), external LOOT YAML/CRC32 rules, bidirectional DAG load ordering with 1-click 'Set Winner' resolution, and SQLite Conflict Radar key caching."
            ),
            pending: false,
          },
          {
            id: "phase_14_m18",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Live-Wire Diff"),
            desc: g(
              "Lossless TOML/YAML/JSONC round-trip config preservation capturing live in-game .cfg/.ini/.json/.toml/.yaml/.xml edits intercepted by the Rust Config Watcher as [In-Game Engine Edit] snapshots."
            ),
            pending: false,
          },
          {
            id: "phase_14_m19",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Ironclad Gauntlet"),
            desc: g(
              "CI-enforced Vitest + Cargo Test regression gauntlet (15+ Vitest suites & 87+ Rust tests across Load Order, Rosetta, Anarchy, Crypto/Uplink, 27 Presets/Lexicons, Differential VFS, Binary TOCs, FOMOD, Time Capsule Lanes, and Doc/Directive Parity)."
            ),
            pending: false,
          },
          {
            id: "phase_14_m20",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Cloud-Sync Folder Sentinel"),
            desc: g(
              "Detects active OneDrive, Dropbox, iCloud Drive, and Google Drive sync locks on {Vault}, Staging, and target game directories before symlink/hardlink projection can corrupt data."
            ),
            pending: false,
          },
          {
            id: "phase_14_m21",
            icon: t("icon_check_circle", "check_circle"),
            title: g("Differential VFS, Scale Architecture & Compliance Tiers 0–6"),
            desc: g(
              "Differential Rayon VFS deployment with WAL safety for 50k-mod libraries, batched statement-level pwa-web-push & counter_shards for million-citizen scale, 61 Spoke / 28 Hub tables with versioned migrations, Spoke-routed Tier 1 DMCA Hold + Tiers 2–5 Restricted + Tier 6 Malware, and 7 Governance SOPs."
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
              "27 multi-game architecture presets, Windows (.exe) & macOS (.app) coordinate mapping, secondary install_routes, database-driven public.taxonomy Categories, and live config_extensions syncing."
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
              "4-layer 3D Refractive Liquid Glass Engine, revamped Default {Chameleons}, Partner Spoke {Chameleon} packs, and Chameleon Theme Forge 2.0."
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
          "Post-Alpha Revamp, Visual Protocol Manager & Oversight Mass Update"
        ),
        footerMeta: g(
          "Dev Sandbox, Visual Protocol Schema, Theme Forge & Mass Triage"
        ),
        desc: g(
          "Launched the isolated Dev Sandbox & 'Sync to Network' creator pipeline, visual database-schema Protocol Manager, Folder Structure builder, Oversight Mass Update console, The Nexus registry, and Chameleon Theme Forge."
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
            title: g("Oversight Mass Update & Filters"),
            desc: g(
              "Bulk post-patch triage console for Oversight Command alongside 'Game Version', 'Currently Eligible', and 'Exclude Unowned DLC' filters."
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
          "Transitioned Homestead Proving Grounds into a live simulation laboratory with real-time log monitoring, deployed the Oversight & Wayfinder Command Hubs, automated signed macOS Universal (.dmg) builds, and enforced Compliance Tiers 0–6."
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
            title: g("Compliance Tiers 0–6 Matrix"),
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
            title: g("Tier 6 Malware Scanner & Secure Shred"),
            desc: g(
              "Byte-level heuristic malware scanner, {Citizen}-signed zero-fill Secure Shredding, and the offline-toggleable Nuclear Override."
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
              "Multi-tier override directories (schema priority folders Tiers 1–3) paired with automated load-order manifest priority depth compilation."
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
      title: g("Engineering Phase Roadmap (Phase 16 → Phase 1)"),
      summary: g(
        "Interactive reverse-chronological engineering timeline tracking Sanctuary OS from planned Phase 16 (V1.0.0 GA) & Phase 15 (V0.7.0 Beta), through active Phase 14 (V0.6.0-Dev.15 Multi-Engine Expansion, Differential VFS & Scale Architecture), down to Phase 1."
      ),
      tabs: [
        {
          id: "all",
          icon: t("icon_timeline", "timeline"),
          label: g("16 Phases"),
          value: g("Full Timeline"),
          cards: roadmapCards,
        },
      ],
    };
}

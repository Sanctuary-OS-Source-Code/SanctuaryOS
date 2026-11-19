import type { DirectiveBuilderSchema, DirectiveBuilderCard } from "../types";
import { CURRENT_DIRECTIVE_SCHEMA_VERSION } from "../types";

export function buildMasterProtocolsSchema(
  t: (key: string, fallback: string) => string,
  g: (txt: string) => string,
  elevatedRolesCards: DirectiveBuilderCard[]
): DirectiveBuilderSchema {
  return {
    slug: "master_protocols",
    _schemaVersion: CURRENT_DIRECTIVE_SCHEMA_VERSION,
    title: g("Master Protocol List & 6-Tier Clearance Matrix"),
    summary: g(
      "Interactive directory of all 37 Sanctuary OS operational protocols across 4 Domains, Compliance Tiers 0–6 (including Spoke-routed Legal/DMCA Tier 1 & Tier 6 Malware), Bytecode Hound heuristics, and the 6-Tier Role Clearance Hierarchy."
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
        label: g("TIERS 0–6"),
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
            id: "comp_t1",
            icon: t("icon_gavel", "gavel"),
            overline: g("TIER 1 • LEGAL / DMCA HOLD"),
            badge: "TIER 1",
            title: g("Spoke-Routed DMCA & IP Hold"),
            footerMeta: g("TIER 1 • LEGAL / DMCA HOLD"),
            desc: g(
              "Applied upon valid 17 U.S.C. § 512 takedown notices or verified ownership disputes. Immediately suppresses public Nexus visibility and routes notice fulfillment directly to the sovereign Partner Spoke Hub (48h SLA) while Keepers Core appends a minimal compliance audit record (public.dmca_compliance_notices). Never deletes files from {Citizen} drives; counter-notices follow the 10–14 business day § 512(g)(3) restoration window."
            ),
            subCards: [],
          },
          {
            id: "comp_t23",
            icon: t("icon_visibility_off", "visibility_off"),
            overline: g("TIERS 2–3 • EXPLICIT / ILLICIT"),
            badge: "TIERS 2–3",
            title: g("Public Scrubbed"),
            footerMeta: g("TIERS 2–3 • EXPLICIT / ILLICIT"),
            desc: g(
              "Tier 2 Explicit and Tier 3 Illicit themes permitted in isolated local {Vaults} and Static Edge manifests (.sanctuary.manifest.json / catalog.json), hidden from public Nexus/Comm-Link/Architect views, visible solely to Oversight & Wayfinder hubs, and triggering the Active {Blueprint} Support Lock if equipped."
            ),
            subCards: [],
          },
          {
            id: "comp_t45",
            icon: t("icon_lock", "lock"),
            overline: g("TIERS 4–5 • SEVERE / PROHIBITED"),
            badge: "TIERS 4–5",
            title: g("Active {Blueprint} Support Lock"),
            footerMeta: g("TIERS 4–5 • OVERSIGHT / WAYFINDER ONLY"),
            desc: g(
              "Extreme Violence (Tier 4) and Taboo / Prohibited non-malware content (Tier 5) isolated strictly to local {Vaults}, Static Edge manifests, and Oversight/Wayfinder hubs (hidden publicly via BETWEEN 1 AND 5). Equipping Tier 1–5 or Unknown {mods} locks Community {Mod} Support via non-destructive 1-click active {Blueprint} unequip without deleting files; Keeper OS Bug Reports stay open."
            ),
            subCards: [],
          },
          {
            id: "comp_t6",
            icon: t("icon_gpp_bad", "gpp_bad"),
            overline: g("TIER 6 • CONFIRMED MALWARE"),
            badge: "TIER 6",
            title: g("Zero-Choice Lockdown"),
            footerMeta: g("TIER 6 • CONFIRMED MALWARE"),
            desc: g(
              "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables (compliance_tier = 6) caught by SHA-256 DNA or Bytecode Hound—halting launch, isolating in Quarantine via Move-mode, locking the OS shell, and demanding a {Citizen}-signed Secure Shred."
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
              "Sanctuary OS never tracks Hardware IDs on normal users. Quarantined payloads offer an opt-in Zero-PII Threat Manifest report (SHA-256 + matched rule IDs only), while invoking the 5-click Nuclear Override in Settings toggles offline airgap mode bidirectionally (writing or clearing local airgap state cleanly offline without permanent cloud lockouts unless explicitly reported)."
            ),
            subCards: [],
          },
        ],
      },
      {
        id: "list",
        icon: t("icon_policy", "policy"),
        label: g("37 RULES"),
        value: g("OS Protocols"),
        cards: [
          {
            id: "proto_d1",
            icon: t("icon_hub", "hub"),
            overline: g("DOMAIN 1 • 10 PROTOCOLS"),
            badge: "DOMAIN 1",
            title: g("Foundation & Sovereignty Protocols"),
            footerMeta: g("DOMAIN 1 • 10 PROTOCOLS"),
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
                  "100% engine-agnostic sanctuary_schemas with 27 Engine Architecture Presets, multi-folder tree preservation, archive_containers, secondary install_routes, ordered load_order templates, and declarative conflict_analyzers backed by Spoke public.taxonomy."
                ),
              },
              {
                id: "proto_d1_r7",
                icon: t("icon_translate", "translate"),
                title: g("Code-Switch"),
                desc: g(
                  "Auto-synced 7,300+-key Standard English baseline, lightweight Sparse Delta Override packs with 21 Dynamic {Glossary} Tokens and smart article grammar, Guided Icon Overrides, and 1-click auto-translation across 28+ languages."
                ),
              },
              {
                id: "proto_d1_r8",
                icon: t("icon_link_off", "link_off"),
                title: g("Cut the Cord"),
                desc: g(
                  "Seals Spoke Gateway Tokens (spk_gw_*) via Split-Custody HKDF-SHA256 + AES-256-GCM AAD double-envelope encryption in sanctuary_internal.spoke_credentials + Supabase Vault, revokes tokens and purges credentials on 'CUT THE CORD' severance, supports 1-file Standalone Forking (sanctuary.fork.json + npm run fork:configure), and binds returning users via cryptographic SRK1 relink tokens."
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
              {
                id: "proto_d1_r10",
                icon: t("icon_move_to_inbox", "move_to_inbox"),
                title: g("Zero-Copy Exodus"),
                desc: g(
                  "Migrates external MO2, Vortex, and staging mod setups into the Sanctuary {Vault} via ByteHound screening, zero-copy hardlinks, and automatic {Blueprint} reconstruction during first-boot or {Blueprints} import."
                ),
              },
            ],
          },
          {
            id: "proto_d2",
            icon: t("icon_inventory_2", "inventory_2"),
            overline: g("DOMAIN 2 • 10 PROTOCOLS"),
            badge: "DOMAIN 2",
            title: g("{Vault} Airgap & {Mason} Pipeline Protocols"),
            footerMeta: g("DOMAIN 2 • 10 PROTOCOLS"),
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
              {
                id: "proto_d2_r8",
                icon: t("icon_rule_folder", "rule_folder"),
                title: g("The Quartermaster"),
                desc: g(
                  "Guided FOMOD (ModuleConfig.xml) & BAIN installer wizard supporting version/flag conditions, nested roots, and non-destructive reconfiguration without re-downloading."
                ),
              },
              {
                id: "proto_d2_r9",
                icon: t("icon_swap_horiz", "swap_horiz"),
                title: g("The Rosetta Protocol"),
                desc: g(
                  "Translates external Modrinth .mrpack, CurseForge manifest.json, Nexus collections, and .wabbajack modlists into deterministic .sanctuary-blueprint.lock.json hydration plans."
                ),
              },
              {
                id: "proto_d2_r10",
                icon: t("icon_cloud_off", "cloud_off"),
                title: g("Cloud-Sync Folder Sentinel"),
                desc: g(
                  "Monitors {Vault}, Staging, and target save/mod roots for active OneDrive, Dropbox, iCloud Drive, or Google Drive reparse locks and warns before symlink/hardlink corruption occurs."
                ),
              },
            ],
          },
          {
            id: "proto_d3",
            icon: t("icon_radar", "radar"),
            overline: g("DOMAIN 3 • 9 PROTOCOLS"),
            badge: "DOMAIN 3",
            title: g("Load Order, Atomic Logic & Sandbox Protocols"),
            footerMeta: g("DOMAIN 3 • 9 PROTOCOLS"),
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
                  "Multi-threaded rayon Copy-on-Write OS hardlink snapshots for World State and Engine Core with explicit .delta_manifest.json lane guards, storage-cap pruning, and strictly additive save restoration."
                ),
              },
              {
                id: "proto_d3_r8",
                icon: t("icon_vpn_key", "vpn_key"),
                title: g("Creator Airlock"),
                desc: g(
                  "Save-airgapped external modding tool runner inside Homestead Lab allowing creation suites (xEdit, BodySlide, Sims Studio, etc.) to launch via Wine/Proton or native host without risking live player saves."
                ),
              },
              {
                id: "proto_d3_r9",
                icon: t("icon_medical_services", "medical_services"),
                title: g("Save Doctor"),
                desc: g(
                  "Records per-save loaded mod manifests (.sanctuary-save-manifest.json) and performs sub-second pre-launch checks + Crash Autopsy SQLite correlation to prevent orphaned-script save corruption."
                ),
              },
            ],
          },
          {
            id: "proto_d4",
            icon: t("icon_shield", "shield"),
            overline: g("DOMAIN 4 • 8 PROTOCOLS"),
            badge: "DOMAIN 4",
            title: g("Zero-Knowledge Security & Shield Protocols"),
            footerMeta: g("DOMAIN 4 • 8 PROTOCOLS"),
            desc: g(
              "Zero-knowledge cryptography, cross-device alert deduplication, PII scrubbing, Tier 6 malware lockdown, Spoke-routed Tier 1 DMCA Safe Harbor, Tiers 2–5 compliance gates, patch shields, and bidirectional Nuclear Override."
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
                  "Proactively scrubs OS paths, local usernames, IPs, MACs, SIDs, emails, and HWIDs ([REDACTED BY SANCTUARY]) before diagnostics leave the rig while gating Architect telemetry strictly to verified Tier 0 hashes."
                ),
              },
              {
                id: "proto_d4_r4",
                icon: t("icon_gpp_bad", "gpp_bad"),
                title: g("Zero-Choice Lockdown"),
                desc: g(
                  "Executes Bytecode Hound heuristics (decompressing Zlib/Zstd streams, archives, and bytecode) to halt game launches on Tier 6 Malware, isolate payloads in Quarantine, and require {Citizen}-signed Secure Shred."
                ),
              },
              {
                id: "proto_d4_r5",
                icon: t("icon_visibility_off", "visibility_off"),
                title: g("Tiered Surface Isolation & {Blueprint} Support Lock"),
                desc: g(
                  "Restricts The Nexus, Comm-Link, Architect Console, and Community {Mod} Support to Tier 0 (Unknown in Scout/Mason queues only, Tier 1 DMCA / Tiers 2–5 & Pending flags hidden in Oversight/Wayfinder hubs only). Equipping Tier 1–5 or Unknown {mods} engages a non-destructive Active {Blueprint} Support Lock while Keeper OS Bug Reports stay open."
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
                  "Hidden 5-click {Settings} subtitle override permitting offline quarantine airgap toggling bidirectionally (writing or clearing local airgap state without locking citizens out permanently unless submitted)."
                ),
              },
              {
                id: "proto_d4_r8",
                icon: t("icon_gavel", "gavel"),
                title: g("Spoke-Routed DMCA Safe Harbor"),
                desc: g(
                  "Routes Tier 1 Legal/DMCA takedowns (17 U.S.C. § 512) to the sovereign Partner Spoke Hub under a 48h SLA while logging minimal statutory metadata to Keepers Core (public.dmca_compliance_notices), supporting 10–14 business day § 512(g)(3) counter-notices without local file deletion."
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}

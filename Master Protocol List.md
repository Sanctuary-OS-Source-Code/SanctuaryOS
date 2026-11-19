# Sanctuary OS — Master Protocol List & 6-Tier Clearance Matrix

---

## 1. The 6-Tier Clearance & Role Inheritance Matrix

Sanctuary OS decouples **Core OS Hub Clearances (`osRole`)** from **Game Spoke Clearances (`userRole`)** across 6 distinct operational tiers with sub-second landing-page Command Hubs:

* **Tier 1 — Citizen (`userRole = 'citizen'` • Inherits Creator Airlock):**
  * **9 Core Citizen Sectors & Symlink Airgap:** Full access to `Command Center`, `Your Vault`, `The Nexus` (Tier-0 catalog), `Blueprints` + **Patch Fire Drill**, `Comm-Link Feed`, `Conflict Radar 2.0`, **Groundhog Sandbox**, **Live-Wire Workbench**, `Time Capsule`, and 7-domain `Settings`.
  * **Inherited Creator Airlock & Edge Direct Push:** Full local access to `Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Theme Forge`, `Lexicon Visual Studio`, `Notepad`, local JSON export/import, and **Edge Direct Push** (`.sanctuary.manifest.json`, `.sanctuary.override.json` & `catalog.json` across 6 providers).
  * **Scout Queue Discoveries:** Share Blueprints (`Public`, `Unlisted`, or `Private`) and submit passing Tier-0 discoveries (`_lab_cert_proof`) to the crowd-sourced **Scout Queue**.
  * **Tier-0 Blueprint Support & Unrestricted OS Bug Reports:** Submit Community Mod Support when the **active Blueprint** contains only verified Tier-0 mods (never deleting Vault files), or file **OS Bug Reports** (`keeper_tickets`) directly to Keepers with zero mod telemetry.
* **Tier 2 — Verified Mason (`userRole = 'mason'` / `isVerifiedMason = true` • Verified Creator Tier):**
  * Protected by the **Zero-Knowledge Seal (`12-Hour Device Seal`, FIDO2 Passkeys, Touch ID & Companion Handshake)**.
  * **Verified Fast-Lane & Nexus Publishing:** Direct Nexus publishing for Tier-0 **Mods**, **Lexicons**, **Chameleons** (`<= 250 KB` WebP or external HTTPS URL), and **Workbench Templates**, bypassing crowd Scout vote thresholds.
  * **Public Mason Profile & Suite Showcases:** Manage verified creator banners, featured downloads, **The Highlander Rule** Exclusive Slots, dependency trees, and multi-range game compatibility rules.
  * **Creator Comm-Link Dispatches & 0%-Cut Supporter Bridge:** Publish release dispatches/polls, file creator bug dossiers, link Patreon/Ko-fi memberships with **0% OS cut** + Zero-PII E2EE Multi-Rig perk sync, and publish Tier 2–5 or self-hosted Tier 0 creations via **Edge Pulse** static manifests.
* **Tier 3 — Architect (`userRole = 'architect'` • Tier-0 Registry & Conflict Moderator):**
  * Protected by the **Zero-Knowledge Seal (`12-Hour Device Seal`)**.
  * **Strict Tier-0 Registry & Studio Curation:** Unlocks the **Architect Console** (strictly isolated to **Public Verified** Tier 0 `Stable`, unflagged records) across 3-Tile Studio curation, suite/dependency trees, **The Highlander Rule** Exclusive Slots, and multi-range compatibility.
  * **Verified Mason & Scout Queue Triage:** Process `unverified` / `under_review` community submissions, run deep **Check Hash** verification, and route suspicious or Tier 1–5 items into **Oversight > Compliance**.
  * **Conflict Matrix & Known Exception Rules:** Author Severity 1–4 conflict directives, oversee Workbench Templates, and manage DB-driven `known_exception_rules` linked to **Crash Autopsy** failure causes.
  * **Claimable Citizen Support Desk:** Claim and resolve encrypted **Tier-0 Citizen Support** queues (`Claimed` exclusive ownership) using PII-scrubbed **Ghost Scrubber** crash logs and Active Blueprint telemetry without ban or active compliance-lock powers.
* **Tier 4 — Oversight (`userRole = 'oversight'` • Spoke Security & Systems Administrator):**
  * Protected by the **Zero-Knowledge Seal (`12-Hour Device Seal`)**.
  * **Tier 1–5 Compliance, DMCA & Pending Flag Review:** Unlocks **Oversight Command** as the exclusive reviewer of **Tier 1 Legal/DMCA** notices forwarded to the Spoke, escalated **Tiers 2–5** records, and **`Pending` community flags** (`has_pending_flag` hides flagged public items until confirmed or cleared).
  * **Spoke Heuristics, Zero-Choice Lockdown & DEFCON 1:** Author game-specific heuristic signatures, blacklist **Tier 6 Malware** hashes under **Zero-Choice Lockdown**, and engage **DEFCON 1 Shield** pre-patch lockdowns.
  * **Game/DLC Patches, Mass Update & Mason Linker:** Register upstream engine patch versions, `dlc_registry` catalogs & DB `public.taxonomy` categories, execute multi-range **Mass Update** sweeps, and claim-link orphaned creator entries.
  * **Spoke Identity & Audit Governance:** Manage `user_roles` up to `architect`, resolve escalated security tickets, and inspect read/export-only `Audit Log` trails without log pruning.
* **Tier 5 — Wayfinder (`userRole = 'wayfinder'` • Community Manager & Spoke Sovereign):**
  * Protected by the **Zero-Knowledge Seal (`12-Hour Device Seal`)**.
  * **Spoke Sovereignty, Sovereign Covenants & Cut the Cord:** Rotate Spoke Gateway Tokens (`spk_gw_*`) in 1 click, export secret-free `SANCTUARY-UPLINK://` bundles, review Partners Agreement & **Sovereign Covenants**, and trigger irreversible high-friction **Cut the Cord** severance without losing community data.
  * **Schema Forge & Fork Branding:** Customize declarative **Universal Master Schema** JSON, publish Spoke **Lexicons**/**Chameleons**, and configure DB-driven **Title Area** branding in Standalone forks (`sanctuary.fork.json`).
  * **Full Spoke Identity Matrix & Tier 1–5 SLA Authority:** Manage roles up to `oversight` and peer `wayfinder`, confirm/dismiss compliance flags, and fulfill the `48h` Partner Spoke DMCA compliance SLA.
  * **0%-Cut Donations, Cost Ledgers & The Dispatch:** Publish transparent monthly Server Cost vs. Donation receipts in the non-custodial Spoke Donation Hub and issue top-banner polls/dispatches.
  * **Audit Trails & Keepers Uplink:** Review full Spoke audit trails and coordinate directly with Core Keepers via **Keepers Support**.
* **Tier 6 — Keeper (`osRole = 'keeper'` • Core OS Hub & Sanctuary Foundry Developer):**
  * Protected by the **Zero-Knowledge Seal (`12-Hour Device Seal`)**.
  * **Partner Spoke Onboarding & Dev Cloaking:** Unlocks **Keepers Core** on the Landing Page and all workspaces for turnkey `SANCTUARY-UPLINK://` onboarding, `Keepers-Only` dev-spoke cloaking, and compliance Hub severance.
  * **Core Heuristics & Threat Manifests:** Govern global antivirus signatures (`keeper_heuristic_signatures`) under **Bytecode Hound** and triage Zero-PII **Threat Manifests** submitted from quarantined drops.
  * **Mirror Uplink, Schemas & Global Aesthetics:** Maintain `default.json`, Core Title Area & subtitles, global **Chameleons** & **Lexicons**, and **Mirror Uplink** bilateral codebase-to-Keepers-Core Markdown/DB sync without app rebuilds.
  * **OS Bug Reports (`keeper_tickets`), News & Global Audit Logs:** Resolve Core OS bug reports completely decoupled from Spoke mod telemetry, publish Foundry Release Notes, and inspect immutable Global Audit Logs.

---

## 2. Foundation & Sovereignty Protocols (10 Protocols)

* **The Cartographer:** Automated cross-platform reconnaissance locating Game Bin (`executable_subdir`), Active Mods (`mods_path`), and auto-resolved Saves, Logs & Cache (`docs_path`) across Windows (with 1-click cross-drive UAC symlink unlock), macOS, and Linux / SteamOS—strictly separated from the Master Vault Location.
* **Binary Version Ripper:** In-process Rust binary inspector extracting genuine patch versions from Windows/Proton `.exe` PE headers (`pelite`), macOS `.app/Contents/Info.plist`, Steam `appmanifest_*.acf`, and declarative `json_key` manifests.
* **Deck Overdrive:** Unifies Gamescope XWayland surface binding (`GDK_BACKEND=x11`), decodes `SteamDeckStatePacket_t` `hidraw` + `evdev` inputs into a **60 FPS Chameleon Virtual Pointer**, 2D Spatial Focus, `L1`/`R1` tab cycling, Trackpad scroll, and Steam OSK auto-summon while auto-resolving Valve Proton `compatdata/<AppID>/pfx/` prefixes across internal storage and SD cards.
* **Gatekeeper Clearance:** Native Apple Touch ID WebAuthn Passkeys, macOS Full Disk Access TCC diagnostics, System Settings deep-linking, and `com.apple.quarantine` stripping on verified Vault projections.
* **Liquid Glass Optics:** 1:1 physical-pixel WebGL2 refraction (`layer2` floating menus & hovertips), `SHA-256` content-addressed `<= 250 KB` WebP Chameleon wallpapers (`{Vault}/Data/Themes/` offline cache + external HTTPS URLs), 6 live Theme Forge sliders, Per-Space Aesthetics Matrix, and responsive mobile filter drawers.
* **Universal Master Schema:** 100% game-agnostic declarative engine (`sanctuary_schemas`) with **27 Engine Presets**, multi-folder asset trees, `archive_containers`, secondary `install_routes`, structured `load_order` templates, and declarative `conflict_analyzers` paired with DB-driven Spoke `public.taxonomy` categories.
* **Code-Switch:** Auto-extracts `7,400+` Standard English keys into `en-default.json`, stores non-default packs as lightweight Sparse Delta Overrides with 21 Dynamic `{Glossary}` Tokens, and translates packs across 28+ languages in 1 click.
* **Cut the Cord:** Seals Scoped Spoke Gateway Tokens (`spk_gw_*`, verified via per-token HMAC-SHA256 hashes inside `sanctuary_internal.spoke_gateway_tokens`) using Split-Custody Double-Envelope encryption (`HKDF-SHA256` + `AES-256-GCM` bound AAD + Supabase Vault) inside `sanctuary_internal.spoke_credentials`, guards irreversible Hub/Spoke severance behind `"CUT THE CORD"` phrase verification (revoking tokens & purging Vault credentials atomically), and binds returning Spin-Off Spoke Citizens via `SRK1.<hub_uuid>.<relink_secret>` commitments alongside zero-conflict Standalone Forking (`sanctuary.fork.json` + `npm run fork:configure`).
* **Mirror Uplink:** Bilateral codebase-to-Keepers-Core asset, directive, schema, and legal sync between repository Markdown/JSON files and Keepers Core—enabling zero-rebuild OS updates while guaranteeing full offline resilience.
* **Zero-Copy Exodus:** Zero-reinstall out-of-tree migration from external mod managers (MO2, Vortex, staging folders) via **ByteHound** screening, OS hardlink absorption, and automatic Blueprint reconstruction.

---

## 3. Vault Airgap & Mason Pipeline Protocols (10 Protocols)

* **Symlink Airgap:** Projects active modules from `Vault/Mods/` via zero-copy OS symlinks and secondary `install_routes`, rescues untracked files dropped into live `Mods/` directories before deployment, and deduplicates stray root config copies back into their owning mod subfolders.
* **Patch Fire Drill:** Evaluates Saved Blueprints against any game version with 1-to-1 deduplicated `{Mod}` parity, multi-pass Atomic Logic & dependency checks, family/twin coupling, local `Auto-Swap Ready` matching, 1-click Get Dependency links, and 1-click **Clone Ready**.
* **Echo Archive:** Archives every installed module binary from Version #1 using zero-extra-byte OS hardlinks inside `Backups/Mods/`, supporting `Keep Multiple` vs. `Keep One`, automatic game-version Auto-Swap, and whole-family Suite Revision Matrix rollbacks.
* **Beam to Rig:** Concurrent GZIP + AES-256-GCM Zero-PII Personal Rig transfers (`10 MB` `citizen_staging_queue`), paired with `Public`/`Unlisted`/`Private` Blueprint Sync, settled SHA-256 self-healing, **Pocket Radar** mobile monitoring, and **Jump Gate** command navigation.
* **Edge Pulse:** Polls creator `.sanctuary.manifest.json`, `.sanctuary.override.json`, and multi-mod `catalog.json` endpoints concurrently in Rust with `ETag` / `If-Modified-Since` `304` caching, `previous_hashes` lineage rollover, 6-provider **Edge Direct Push**, and HTTPS SSRF protection.
* **Browser Autoloader:** Automates multi-part mod updates through an embedded side browser (`1 of N` Guided Batch Updater) alongside direct SHA-256 HTTPS streaming, tri-OS Deep Links (`sanctuary://`, `nxm://`, `ror2mm://`, `curseforge://`), and an optional hardware-sealed local DPAPI **BYO-API-Key Broker**.
* **Live-Wire Workbench:** 2-column 60 FPS Visual Config Editor (`.sanctuary.template.json` + lossless INI/TOML/YAML/XML/JSONC round-trips) with bidirectional `[In-Game Engine Edit]` Live-Wire Diff timelines and Unified 3-Tile Artifact Studio workflows (`Stable`/`Beta`/`Alpha` channels + Ed25519 signing).
* **The Quartermaster:** Guided `.fomod` (`ModuleConfig.xml` UTF-8/UTF-16LE, `<gameDependency>`/`<fommDependency>`) & BAIN subpackage wizard supporting nested roots and non-destructive reconfiguration without re-downloading.
* **The Rosetta Protocol:** Cross-platform modlist translator compiling Modrinth `.mrpack`, CurseForge `manifest.json`, Nexus `collection.json`, and `.wabbajack` archives into deterministic `.sanctuary-blueprint.lock.json` 1-click parallel hydration plans with BSDiff/xdelta binary patching.
* **Cloud-Sync Folder Sentinel:** Monitors `Vault`, Staging, and target save/mod roots for active OneDrive, Dropbox, iCloud Drive, or Google Drive reparse locks and warns before symlink/hardlink projection can corrupt data.

---

## 4. Load Order, Atomic Logic & Sandbox Protocols (9 Protocols)

* **Priority Compiler:** Compiles deployment priority across `folder_priority`, `manifest_list`, `numeric_prefix`, and `timestamp` strategies with topological sorting, strategy-aware tiers, scoped scans, and 1-click DFS cycle resolution.
* **Conflict Radar 2.0:** Executes declarative `virtual_fs_path`, `archive_member`, `binary_chunk_index`, and `json_xml_key` analyzers across a 5-Tier Severity Matrix (`S1–S5`), unified 1:1 across Command Center tiles and resolution drawers.
* **The Highlander Rule:** Enforces mutually exclusive slots (`highlander_group_id` & `atomic_logic.highlander_group`) with explicit **Swap / Keep Both / Cancel** prompts—never silently evicting equipped `{Mods}`—and routes intentional co-equips to Conflict Radar at Severity 3.
* **Nuclear Family Cohesion:** Automatically couples multi-module sibling files across the same suite folder so enabling, disabling, hot-swapping, or cloning never splits critical frameworks from their runtime companions.
* **Deep Yeet:** Performs complete lifecycle teardown across active symlinks, secondary `install_routes`, isolated `Vault/Mods/` archives, override rules, and active Blueprints without stranding orphaned files.
* **Groundhog Sandbox:** Pairs `SanctuarySaveVault` externalized **Save Doctor** Golden Baselines with **Homestead Save Airgap** isolation, Stage 4 magic-byte corruption auditing, 1v1 conflict pairing, passive 4-stage launch timing, **Crash Autopsy** log matching, and automatic post-test save rewind.
* **Time Capsule:** Multi-threaded `rayon` Copy-on-Write OS hardlink snapshots across World State (purple) and Engine Core (pink) with explicit `.delta_manifest.json` lane isolation, delta-aware cap pruning, and strictly additive World-lane save slot restoration.
* **Creator Airlock:** Save-airgapped external modding tool runner inside **Homestead Lab** launching authoring suites (via host or Steam Proton) without risking live player saves (distinct from the in-app **Open Mason Workshop**).
* **Save Doctor:** Records per-save mod DNA manifests (`.sanctuary-save-manifest.json`) and performs sub-second pre-launch checks paired with SQLite `<10ms` **Crash Autopsy** exception correlation.

---

## 5. Zero-Knowledge Security, DMCA & Shield Protocols (8 Protocols)

* **Zero-Knowledge Seal:** Hardware-bound FIDO2 Passkey & TOTP Vault (`12-Hour Device Seal`, Apple Touch ID, Windows Hello, and Live Companion Passkey Handshake via W3C Web Push) paired with `600,000`-iteration PBKDF2-SHA256 password/email blinding and per-tier RBAC without storing biometric PII on remote servers.
* **Echo Suppressor:** Suppresses repetitive startup banners, already-read announcement popups, and redundant system alerts across multi-rig desktop and PWA sessions via Zero-PII AES-256-GCM state sync (`notification_state_sync`) with per-Spoke muting (`Pocket Radar` sync defaults strict opt-in OFF).
* **Ghost Scrubber:** Multi-OS Zero-PII sanitizer stripping usernames, filesystem home paths, hardware IDs, IP addresses, and machine tokens strictly in-memory on read (never mutating live open game logs) before diagnostics leave your rig.
* **Bytecode Hound Dual-Tier Heuristics:** Merges Keepers Core (`keeper_heuristic_signatures`) and community Spoke (`heuristic_signatures`) regexes with Zlib/Zstd decompression and terminal extension anti-masquerading to inspect archives, scripts, `.pyc` bytecode, and native plugins.
* **Zero-Choice Lockdown (`Tier 6 Malware`):** Enforces instant OS workspace lock and isolated Move-mode Quarantine whenever **Tier 6 Malware** triggers **Bytecode Hound** or SHA-256 blacklists (`compliance_tier = 6`), requiring explicit Citizen confirmation for zero-fill Secure Shred.
* **Tiered Surface Isolation & Active Blueprint Support Lock (`Compliance Tiers 0–5`):** Restricts **The Nexus**, **Comm-Link**, **Architect Console**, and **Community Mod Support** to **Tier 0 Clean**, while isolating **Tier 1 (Legal / DMCA)**, **Tier 2 (Explicit)**, **Tier 3 (Illicit)**, **Tier 4 (Extreme Violence)**, and **Tier 5 (Taboo / Prohibited)** (`BETWEEN 1 AND 5` / `Pending` flags via `has_pending_flag`) exclusively to local Vaults, Static Edge manifests, and **Oversight / Wayfinder** hubs (`trg_purge_flagged_hash_from_blueprints` auto-strips confirmed Tiers 1–5 from Cloud Blueprints). Equipping Tiers 1–5 or Unknown engages a non-destructive **Active Blueprint Support Lock** (1-click unequip without deleting Vault files; Keeper OS Bug Reports stay open).
* **DEFCON 1 Shield & Bidirectional Nuclear Override:** Evaluates active Spoke lockdowns, `audit_logs` DEFCON 1 alerts, and 100% offline game updates on startup (`Auto Backup`, `Alert`, or `Lone Wolf`), alongside the hidden 5-click System Preferences **Nuclear Override** that toggles offline airgap mode bidirectionally (writing or clearing local airgap state without permanently locking Citizens out unless explicitly submitted).
* **Spoke-Routed DMCA Safe Harbor (`Tier 1 Legal / DMCA`):** Upon a valid `17 U.S.C. § 512` takedown notice or verified creator ownership dispute, sets `compliance_tier = 1` to suppress public Nexus visibility and routes notice resolution to the sovereign Partner Spoke Hub under a `48h` SLA (`AWAITING_AUTHORITY` pause + `10–14` business day `§ 512(g)(3)` counter-notice restoration + 3-strike policy), while Keepers Core appends a minimal immutable compliance log (`public.dmca_compliance_notices`). Zero local files are ever deleted from Citizen drives.

<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:
{
  "slug": "master_protocols",
  "_schemaVersion": 88,
  "title": "Master Protocol List & 6-Tier Clearance Matrix",
  "summary": "Interactive directory of all 37 Sanctuary OS operational protocols across 4 Domains, Compliance Tiers 0–6 (including Spoke-routed Legal/DMCA Tier 1 & Tier 6 Malware), Bytecode Hound heuristics, and the 6-Tier Role Clearance Hierarchy.",
  "tabs": [
    {
      "id": "roles",
      "icon": "admin_panel_settings",
      "label": "6 TIERS",
      "value": "Role Matrix",
      "cards": [
        {
          "id": "role_citizen",
          "icon": "person",
          "overline": "Tier 1 • Base + Open Workshop",
          "badge": "{Citizen}",
          "title": "{Citizen}",
          "footerMeta": "Tier 1 • Base + Open Workshop",
          "desc": "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions & unrestricted OS Bug Reports.",
          "status": "citizen",
          "subCards": [
            {
              "id": "role_cit_s1",
              "icon": "inventory_2",
              "title": "9 Core {Citizen} Sectors & Symlink Airgap",
              "desc": "Full offline and online access to Command Center, Your {Vault}, The Nexus, {Blueprints}, Comm-Link, Conflict Radar, Homestead {Lab}, {Citizen}'s Workbench, and {Backups}."
            },
            {
              "id": "role_cit_s2",
              "icon": "handyman",
              "title": "Inherited Open {Mason} Workshop & Static Edge Push",
              "desc": "Build {mods} in Dev Sandbox, package .sanctuary.manifest.json / catalog.json releases, and 1-click Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, or WebDAV."
            },
            {
              "id": "role_cit_s3",
              "icon": "travel_explore",
              "title": "Scout Queue Discovery Submissions",
              "desc": "Scan local Tier-0 {mods}, complete local {Lab} verification proof, and submit verified SHA-256 metadata to the crowd-sourced Scout Queue."
            },
            {
              "id": "role_cit_s4",
              "icon": "support_agent",
              "title": "Tier-0 {Blueprint} Support & OS Bug Reports",
              "desc": "Submit Community {Mod} Support when your active {Blueprint} holds only verified Tier-0 {mods} (no {Vault} file deletion), or file an OS Bug Report directly to Keepers with zero {mod} telemetry."
            }
          ]
        },
        {
          "id": "role_mason",
          "icon": "construction",
          "overline": "Tier 2 • Verified Creator",
          "badge": "FIDO2 PASSKEY",
          "title": "Verified {Mason}",
          "footerMeta": "Tier 2 • Verified Creator",
          "desc": "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_mas_s1",
              "icon": "rocket_launch",
              "title": "Verified Fast-Lane & Direct Nexus Publishing",
              "desc": "Bypass crowd Scout vote thresholds to submit verified Tier-0 {mods}, Lexicons, Chameleons, and Workbench Templates straight to Architect triage."
            },
            {
              "id": "role_mas_s2",
              "icon": "storefront",
              "title": "Public {Mason} Profile & Suite Showcases",
              "desc": "Curate your creator banner, featured {mod} suites, Highlander Exclusive Slots, dependency trees, and multi-range version rules on your public profile."
            },
            {
              "id": "role_mas_s3",
              "icon": "campaign",
              "title": "Creator Comm-Link {Dispatches} & Changelogs",
              "desc": "Broadcast Markdown release notes, polling updates, and update alerts directly to subscribed {Citizens} on Comm-Link."
            },
            {
              "id": "role_mas_s4",
              "icon": "volunteer_activism",
              "title": "0%-Cut Supporter Bridge & Static Manifests",
              "desc": "Connect Patreon, Ko-fi, or custom supporter links with 0% Sanctuary cut, and publish Tier 2–5 or self-hosted Tier 0 {mods} cleanly via decentralized Static Edge manifests."
            }
          ]
        },
        {
          "id": "role_architect",
          "icon": "architecture",
          "overline": "Tier 3 • Spoke Moderator",
          "badge": "FIDO2 PASSKEY",
          "title": "Architect",
          "footerMeta": "Tier 3 • Spoke Moderator",
          "desc": "Unlocks Architect Console (strictly isolated to Compliance Tier 0 Stable records): Registry curation, Verified {Mason} & Scout Queue triage, Conflict Matrix, Known Exception Rules, Template Oversight, and Claimable {Citizen} Support Desk tickets.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_arc_s1",
              "icon": "fact_check",
              "title": "Tier-0 Global Registry & 3-Tile Studio Curation",
              "desc": "Maintain verified Tier-0 Nexus records, configure Parent/Child suite trees, Highlander Exclusive Slots, and multi-range game compatibility."
            },
            {
              "id": "role_arc_s2",
              "icon": "dynamic_feed",
              "title": "Verified {Mason} & Scout Queue Triage",
              "desc": "Review unknown/unverified community submissions in Dedicated Queues, run Check Hash verification, and escalate Tier 1–5 flags cleanly to Oversight."
            },
            {
              "id": "role_arc_s3",
              "icon": "warning_amber",
              "title": "Conflict Matrix & Known Exception Rules",
              "desc": "Author Severity 1–4 conflict directives, review Workbench Templates, and publish database-driven exception diagnosis rules linked to Homestead {Lab} verdicts."
            },
            {
              "id": "role_arc_s4",
              "icon": "support_agent",
              "title": "Claimable {Citizen} Support Desk & Escalation",
              "desc": "Claim and resolve Tier-0 {Citizen} support tickets with PII-scrubbed crash logs and Active {Blueprint} snapshots, escalating sensitive reports to Oversight."
            }
          ]
        },
        {
          "id": "role_oversight",
          "icon": "admin_panel_settings",
          "overline": "Tier 4 • Spoke Security Admin",
          "badge": "FIDO2 PASSKEY",
          "title": "Oversight",
          "footerMeta": "Tier 4 • Spoke Security Admin",
          "desc": "Unlocks Oversight Command: Tier 1 DMCA / Tiers 2–5 & Pending Flag Confirmation, Spoke Heuristic Signatures, Tier 6 Malware blacklisting, DEFCON 1 override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect).",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_ovr_s1",
              "icon": "security",
              "title": "Tier 1–5 Compliance, DMCA & Pending Flag Review",
              "desc": "Exclusive reviewer for Tier 1 Legal/DMCA notices forwarded to the Spoke, escalated Tiers 2–5 records, and Pending community flags—auto-hidden publicly until confirmed or cleared."
            },
            {
              "id": "role_ovr_s2",
              "icon": "gpp_bad",
              "title": "Spoke Heuristics, Tier 6 Blacklists & DEFCON 1",
              "desc": "Author game-specific antivirus signatures, blacklist Tier 6 Malware SHA-256 hashes, and engage DEFCON 1 pre-patch shields."
            },
            {
              "id": "role_ovr_s3",
              "icon": "published_with_changes",
              "title": "Game/DLC Patches, Mass Triage & {Mason} Linker",
              "desc": "Register upstream engine versions and DLC catalogs, run multi-range compatibility mass updates, and claim-link creator registries."
            },
            {
              "id": "role_ovr_s4",
              "icon": "admin_panel_settings",
              "title": "Spoke Identity Governance & Audit Logs",
              "desc": "Promote/demote roles up to Architect, handle escalated security tickets, and inspect read/export-only Spoke audit trails."
            }
          ]
        },
        {
          "id": "role_wayfinder",
          "icon": "explore",
          "overline": "Tier 5 • Spoke Sovereign",
          "badge": "FIDO2 PASSKEY",
          "title": "Wayfinder",
          "footerMeta": "Tier 5 • Spoke Sovereign",
          "desc": "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), secret-free SANCTUARY-UPLINK:// bundle export & 1-click Gateway Token rotation, unilateral Cut the Cord severance, Master Schema & Lexicon Studios, 0%-Cut Donations, and The Dispatch.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_way_s1",
              "icon": "hub",
              "title": "Spoke Sovereignty, Covenants & Cut the Cord",
              "desc": "Rotate Spoke Gateway Tokens in 1 click, export secret-free SANCTUARY-UPLINK:// bundles, inspect Partner Covenants, or trigger irreversible high-friction severance from the Core Hub."
            },
            {
              "id": "role_way_s2",
              "icon": "schema",
              "title": "Master Schema Studio & Fork Branding",
              "desc": "Configure paths, binary headers, install routes, default Chameleon themes, Title Area headers (Standalone mode), and Spoke Lexicon packs."
            },
            {
              "id": "role_way_s3",
              "icon": "manage_accounts",
              "title": "Full Identity Matrix & Tier 1–5 Authority",
              "desc": "Appoint Oversight admins and peer Wayfinders, fulfill Tier 1 DMCA / Tiers 2–5 compliance governance within the Spoke SLA, and oversee Oversight compatibility operations."
            },
            {
              "id": "role_way_s4",
              "icon": "volunteer_activism",
              "title": "0%-Cut Donations, Cost Ledgers & The Dispatch",
              "desc": "Publish transparent monthly infrastructure cost ledgers, collect 100% Wayfinder-owned donations, and broadcast top-banner polls."
            },
            {
              "id": "role_way_s5",
              "icon": "support",
              "title": "Wayfinder Audit Trails & Keepers Uplink",
              "desc": "Audit every Spoke moderation action chronologically and communicate directly with Core Keepers via Wayfinder Support."
            }
          ]
        },
        {
          "id": "role_keeper",
          "icon": "memory",
          "overline": "Tier 6 • Core OS Hub",
          "badge": "FIDO2 PASSKEY",
          "title": "Keeper",
          "footerMeta": "Tier 6 • Core OS Hub",
          "desc": "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Turnkey Spoke Onboarding, Core Heuristics, Threat Manifests, Master Game Schemas, Global Lexicons/Chameleons, Bilateral Directives Sync, OS Bug Reports, and Global Audit Logs.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_kpr_s1",
              "icon": "dns",
              "title": "Partner Spoke Onboarding & Dev Cloaking",
              "desc": "Review Partner Spoke Applications, validate schema readiness, toggle Keepers-Only dev workspaces, and oversee Federation uptime."
            },
            {
              "id": "role_kpr_s2",
              "icon": "verified_user",
              "title": "Core Heuristics & Threat Manifests",
              "desc": "Maintain global malware regex signatures (keeper_heuristic_signatures) and triage Zero-PII Threat Manifest submissions from quarantined files."
            },
            {
              "id": "role_kpr_s3",
              "icon": "sync",
              "title": "Bilateral Directives, Schemas & Lexicons",
              "desc": "Author and sync System Directives, Legal Covenants, Default Schemas, Core Aesthetics, and Global Lexicon baselines without app rebuilds."
            },
            {
              "id": "role_kpr_s4",
              "icon": "bug_report",
              "title": "OS Bug Reports (`keeper_tickets`) & Releases",
              "desc": "Triage cross-platform OS bug reports (100% free of Spoke mod data/locks), publish Foundry News, and inspect immutable Global Audit Logs."
            }
          ]
        }
      ]
    },
    {
      "id": "compliance",
      "icon": "shield",
      "label": "TIERS 0–6",
      "value": "Safety & AV",
      "cards": [
        {
          "id": "comp_t0",
          "icon": "check_circle",
          "overline": "TIER 0 • PUBLIC SAFE",
          "badge": "TIER 0",
          "title": "Public Verified",
          "footerMeta": "TIER 0 • PUBLIC SAFE",
          "desc": "Only Tier 0 verified content is permitted across The Nexus, Comm-Link, Architect Console, public {Mason} Profiles, Shared {Blueprints} (SNCXXX), and Community {Mod} Support tickets.",
          "subCards": []
        },
        {
          "id": "comp_t1",
          "icon": "gavel",
          "overline": "TIER 1 • LEGAL / DMCA HOLD",
          "badge": "TIER 1",
          "title": "Spoke-Routed DMCA & IP Hold",
          "footerMeta": "TIER 1 • LEGAL / DMCA HOLD",
          "desc": "Applied upon valid 17 U.S.C. § 512 takedown notices or verified ownership disputes. Immediately suppresses public Nexus visibility and routes notice fulfillment directly to the sovereign Partner Spoke Hub (48h SLA) while Keepers Core appends a minimal compliance audit record (public.dmca_compliance_notices). Never deletes files from {Citizen} drives; counter-notices follow the 10–14 business day § 512(g)(3) restoration window.",
          "subCards": []
        },
        {
          "id": "comp_t23",
          "icon": "visibility_off",
          "overline": "TIERS 2–3 • EXPLICIT / ILLICIT",
          "badge": "TIERS 2–3",
          "title": "Public Scrubbed",
          "footerMeta": "TIERS 2–3 • EXPLICIT / ILLICIT",
          "desc": "Tier 2 Explicit and Tier 3 Illicit themes permitted in isolated local {Vaults} and Static Edge manifests (.sanctuary.manifest.json / catalog.json), hidden from public Nexus/Comm-Link/Architect views, visible solely to Oversight & Wayfinder hubs, and triggering the Active {Blueprint} Support Lock if equipped.",
          "subCards": []
        },
        {
          "id": "comp_t45",
          "icon": "lock",
          "overline": "TIERS 4–5 • SEVERE / PROHIBITED",
          "badge": "TIERS 4–5",
          "title": "Active {Blueprint} Support Lock",
          "footerMeta": "TIERS 4–5 • OVERSIGHT / WAYFINDER ONLY",
          "desc": "Extreme Violence (Tier 4) and Taboo / Prohibited non-malware content (Tier 5) isolated strictly to local {Vaults}, Static Edge manifests, and Oversight/Wayfinder hubs (hidden publicly via BETWEEN 1 AND 5). Equipping Tier 1–5 or Unknown {mods} locks Community {Mod} Support via non-destructive 1-click active {Blueprint} unequip without deleting files; Keeper OS Bug Reports stay open.",
          "subCards": []
        },
        {
          "id": "comp_t6",
          "icon": "gpp_bad",
          "overline": "TIER 6 • CONFIRMED MALWARE",
          "badge": "TIER 6",
          "title": "Zero-Choice Lockdown",
          "footerMeta": "TIER 6 • CONFIRMED MALWARE",
          "desc": "Malicious payloads, webhook exfiltrators, credential stealers, or unauthorized executables (compliance_tier = 6) caught by SHA-256 DNA or Bytecode Hound—halting launch, isolating in Quarantine via Move-mode, locking the OS shell, and demanding a {Citizen}-signed Secure Shred.",
          "subCards": []
        },
        {
          "id": "comp_av",
          "icon": "security",
          "overline": "CORE + SPOKE RUST AV • STREAM & BYTECODE INSPECTOR",
          "badge": "CORE + SPOKE",
          "title": "Bytecode Hound",
          "footerMeta": "Core + Spoke Signatures • Zlib/Zstd/Base64",
          "desc": "Combines Core Heuristics (keeper_heuristic_signatures) and Spoke Heuristics (heuristic_signatures) with in-memory Zlib/Zstd binary stream decompression and Base64/Hex deobfuscation to inspect archives, raw binaries, scripts, and compiled bytecode.",
          "subCards": []
        },
        {
          "id": "comp_nuclear",
          "icon": "policy",
          "overline": "PRIVACY-FIRST • THREAT MANIFEST",
          "badge": "NUCLEAR OVERRIDE",
          "title": "Nuclear Override",
          "footerMeta": "hardware_bans • Zero-PII Threat Manifest",
          "desc": "Sanctuary OS never tracks Hardware IDs on normal users. Quarantined payloads offer an opt-in Zero-PII Threat Manifest report (SHA-256 + matched rule IDs only), while invoking the 5-click Nuclear Override in Settings toggles offline airgap mode bidirectionally (writing or clearing local airgap state cleanly offline without permanent cloud lockouts unless explicitly reported).",
          "subCards": []
        }
      ]
    },
    {
      "id": "list",
      "icon": "policy",
      "label": "37 RULES",
      "value": "OS Protocols",
      "cards": [
        {
          "id": "proto_d1",
          "icon": "hub",
          "overline": "DOMAIN 1 • 10 PROTOCOLS",
          "badge": "DOMAIN 1",
          "title": "Foundation & Sovereignty Protocols",
          "footerMeta": "DOMAIN 1 • 10 PROTOCOLS",
          "desc": "Cross-platform binary reconnaissance, Steam Deck controller & Proton resolution, macOS security clearance, Liquid Glass Optics, Universal Master Schema, Code-Switch, Cut the Cord, and Mirror Uplink.",
          "subCards": [
            {
              "id": "proto_d1_r1",
              "icon": "explore",
              "title": "The Cartographer",
              "desc": "Automated cross-platform reconnaissance locating Game Bin (executable_subdir), Active {Mods} (mods_path), and auto-resolved Saves/Logs/Cache (docs_path) across Windows, macOS, and Linux / SteamOS—strictly decoupled from the OS-wide Master {Vault} path."
            },
            {
              "id": "proto_d1_r2",
              "icon": "memory",
              "title": "Binary Version Ripper",
              "desc": "In-process Rust inspector extracting genuine patch versions directly from Windows/Proton executable PE headers, macOS Info.plist bundles, Steam .acf manifests, and declarative json_key probes with zero external process spawns."
            },
            {
              "id": "proto_d1_r3",
              "icon": "sports_esports",
              "title": "Deck Overdrive",
              "desc": "Unifies Gamescope XWayland surface binding, decodes 64-byte hidraw + evdev controller telemetry into a 60 FPS {Chameleon} Virtual Pointer, 2D Spatial Focus, and auto-summoned Steam OSK, and auto-resolves Proton compatdata prefixes across internal drives and SD cards."
            },
            {
              "id": "proto_d1_r4",
              "icon": "laptop_mac",
              "title": "Gatekeeper Clearance",
              "desc": "Delivers native Apple Touch ID WebAuthn Passkeys, macOS TCC Full Disk Access diagnostics, System Settings deep-linking, and automatic com.apple.quarantine attribute stripping on verified {Vault} projections."
            },
            {
              "id": "proto_d1_r5",
              "icon": "auto_awesome",
              "title": "Liquid Glass Optics",
              "desc": "1:1 physical-pixel WebGL2 refraction with dedicated layer2 floating glass, SHA-256 deduplicated <= 250 KB WebP {Chameleon} wallpapers, Per-Space {Chameleons} & {Lexicons}, and responsive mobile Liquid Glass filter pills."
            },
            {
              "id": "proto_d1_r6",
              "icon": "schema",
              "title": "Universal Master Schema",
              "desc": "100% engine-agnostic sanctuary_schemas with 27 Engine Architecture Presets, multi-folder tree preservation, archive_containers, secondary install_routes, ordered load_order templates, and declarative conflict_analyzers backed by Spoke public.taxonomy."
            },
            {
              "id": "proto_d1_r7",
              "icon": "translate",
              "title": "Code-Switch",
              "desc": "Auto-synced 7,300+-key Standard English baseline, lightweight Sparse Delta Override packs with 21 Dynamic {Glossary} Tokens and smart article grammar, Guided Icon Overrides, and 1-click auto-translation across 28+ languages."
            },
            {
              "id": "proto_d1_r8",
              "icon": "link_off",
              "title": "Cut the Cord",
              "desc": "Seals Spoke Gateway Tokens (spk_gw_*) via Split-Custody HKDF-SHA256 + AES-256-GCM AAD double-envelope encryption in sanctuary_internal.spoke_credentials + Supabase Vault, revokes tokens and purges credentials on 'CUT THE CORD' severance, supports 1-file Standalone Forking (sanctuary.fork.json + npm run fork:configure), and binds returning users via cryptographic SRK1 relink tokens."
            },
            {
              "id": "proto_d1_r9",
              "icon": "sync",
              "title": "Mirror Uplink",
              "desc": "Bidirectionally synchronizes Core Schemas, {Lexicons}, {Chameleons}, system_directives, and canonical legal covenants between local repository files and Keepers Core without requiring app rebuilds."
            },
            {
              "id": "proto_d1_r10",
              "icon": "move_to_inbox",
              "title": "Zero-Copy Exodus",
              "desc": "Migrates external MO2, Vortex, and staging mod setups into the Sanctuary {Vault} via ByteHound screening, zero-copy hardlinks, and automatic {Blueprint} reconstruction during first-boot or {Blueprints} import."
            }
          ]
        },
        {
          "id": "proto_d2",
          "icon": "inventory_2",
          "overline": "DOMAIN 2 • 10 PROTOCOLS",
          "badge": "DOMAIN 2",
          "title": "{Vault} Airgap & {Mason} Pipeline Protocols",
          "footerMeta": "DOMAIN 2 • 10 PROTOCOLS",
          "desc": "Zero-copy symlink projection, pre-launch patch simulations, zero-byte version history, cross-rig transfers, Static Edge polling, guided batch downloading, and visual config tuning.",
          "subCards": [
            {
              "id": "proto_d2_r1",
              "icon": "inventory_2",
              "title": "Symlink Airgap",
              "desc": "Projects active {mods} from {Vault}/{Mods}/ via zero-copy OS symlinks and secondary install_routes, rescues untracked rogue files dropped into live game folders, and deduplicates stray root configs back into {mod} subfolders."
            },
            {
              "id": "proto_d2_r2",
              "icon": "science",
              "title": "Patch Fire Drill",
              "desc": "Evaluates every {Blueprint} against any upstream game patch with 1:1 deduplicated {mod} parity, transitive dependency cascades, local Echo Archive Auto-Swap detection, 1-click dependency links, and 1-click Clone Ready {Blueprints}."
            },
            {
              "id": "proto_d2_r3",
              "icon": "history",
              "title": "Echo Archive",
              "desc": "Archives every installed {mod} binary from Version #1 using zero-extra-byte OS hardlinks (Backups/Mods/), supporting multi-revision Suite Revision Matrix rollbacks, Auto-Swap recovery, and parent suite card grouping."
            },
            {
              "id": "proto_d2_r4",
              "icon": "devices",
              "title": "Beam to Rig",
              "desc": "Unifies Public/Unlisted/Private Cloud {Blueprint} modes, settled post-scan SHA-256 self-healing, concurrent GZIP + AES-256-GCM Personal Rig transfers between Desktop and Steam Deck, and the Mobile Pocket Radar companion."
            },
            {
              "id": "proto_d2_r5",
              "icon": "cloud_done",
              "title": "Edge Pulse",
              "desc": "Concurrently polls .sanctuary.manifest.json, .sanctuary.override.json, and catalog.json endpoints in Rust with ETag/304 caching and SSRF guards, paired with 6-provider 1-click Direct Push and automatic previous_hashes rollover."
            },
            {
              "id": "proto_d2_r6",
              "icon": "cloud_download",
              "title": "Browser Autoloader",
              "desc": "Orchestrates Guided Update Queues (1 of N) inside the embedded Side Browser, stepping through each {Mason}'s official download page and auto-advancing the instant the Rust download interceptor verifies the archive."
            },
            {
              "id": "proto_d2_r7",
              "icon": "tune",
              "title": "Live-Wire Workbench",
              "desc": "60 FPS 2-column Visual Config Studio (.sanctuary.template.json + INI/TOML/YAML/XML/JSON) with Live-Wire Diff capturing real-time [In-Game Engine Edit] snapshots alongside Monaco diffs and the 3-Tile {Mod} Studio."
            },
            {
              "id": "proto_d2_r8",
              "icon": "rule_folder",
              "title": "The Quartermaster",
              "desc": "Guided FOMOD (ModuleConfig.xml) & BAIN installer wizard supporting version/flag conditions, nested roots, and non-destructive reconfiguration without re-downloading."
            },
            {
              "id": "proto_d2_r9",
              "icon": "swap_horiz",
              "title": "The Rosetta Protocol",
              "desc": "Translates external Modrinth .mrpack, CurseForge manifest.json, Nexus collections, and .wabbajack modlists into deterministic .sanctuary-blueprint.lock.json hydration plans."
            },
            {
              "id": "proto_d2_r10",
              "icon": "cloud_off",
              "title": "Cloud-Sync Folder Sentinel",
              "desc": "Monitors {Vault}, Staging, and target save/mod roots for active OneDrive, Dropbox, iCloud Drive, or Google Drive reparse locks and warns before symlink/hardlink corruption occurs."
            }
          ]
        },
        {
          "id": "proto_d3",
          "icon": "radar",
          "overline": "DOMAIN 3 • 9 PROTOCOLS",
          "badge": "DOMAIN 3",
          "title": "Load Order, Atomic Logic & Sandbox Protocols",
          "footerMeta": "DOMAIN 3 • 9 PROTOCOLS",
          "desc": "Topological priority compilation, pluggable conflict analysis, exclusive slot alerts, twin cohesion, dependency cascades, save-airgapped testing, and hardlink snapshots.",
          "subCards": [
            {
              "id": "proto_d3_r1",
              "icon": "layers",
              "title": "Priority Compiler",
              "desc": "Compiles topological deployment priority across folder_priority, manifest_list (XML/JSON/text templates), numeric_prefix, and timestamp with strategy-aware tiers, searchable {Blueprint} Scan Scopes, and 1-click DFS loop breaking."
            },
            {
              "id": "proto_d3_r2",
              "icon": "radar",
              "title": "Conflict Radar 2.0",
              "desc": "Executes declarative virtual_fs_path, archive_member, binary_chunk_index, and json_xml_key collision analyzers across a unified 5-Tier Severity Matrix (S1–S5) with 1-click Set Winner overrides and directional load rules."
            },
            {
              "id": "proto_d3_r3",
              "icon": "filter_1",
              "title": "The Highlander Rule",
              "desc": "Guards single-winner exclusive slots (highlander_group_id) with explicit Swap, Keep Both, or Cancel prompts directly on {Vault} cards and Dossiers—never silently removing an equipped {mod}."
            },
            {
              "id": "proto_d3_r4",
              "icon": "join_inner",
              "title": "Nuclear Family Cohesion",
              "desc": "Bidirectionally links companion binary modules and script plugins so related twins equip, unequip, stage, and patch-check together as one atomic unit."
            },
            {
              "id": "proto_d3_r5",
              "icon": "delete_sweep",
              "title": "Deep Yeet",
              "desc": "Auto-equips mandatory prerequisite frameworks via Chain-Link Dependencies on enable, and intercepts master {mod} removal to sweep all orphaned dependent add-ons only after explicit {Citizen} confirmation."
            },
            {
              "id": "proto_d3_r6",
              "icon": "science",
              "title": "Groundhog Sandbox",
              "desc": "Immortal Save-Verify-and-Rewind {Lab} airgap featuring an untouched Vault save mirror, disposable Golden Baseline test saves, Stage 4 magic-byte save auditing, 100% anti-cheat-safe 4-stage timers, Crash Autopsy decoding, and fullscreen PCM audio chimes."
            },
            {
              "id": "proto_d3_r7",
              "icon": "history",
              "title": "Time Capsule",
              "desc": "Multi-threaded rayon Copy-on-Write OS hardlink snapshots for World State and Engine Core with explicit .delta_manifest.json lane guards, storage-cap pruning, and strictly additive save restoration."
            },
            {
              "id": "proto_d3_r8",
              "icon": "vpn_key",
              "title": "Creator Airlock",
              "desc": "Save-airgapped external modding tool runner inside Homestead Lab allowing creation suites (xEdit, BodySlide, Sims Studio, etc.) to launch via Wine/Proton or native host without risking live player saves."
            },
            {
              "id": "proto_d3_r9",
              "icon": "medical_services",
              "title": "Save Doctor",
              "desc": "Records per-save loaded mod manifests (.sanctuary-save-manifest.json) and performs sub-second pre-launch checks + Crash Autopsy SQLite correlation to prevent orphaned-script save corruption."
            }
          ]
        },
        {
          "id": "proto_d4",
          "icon": "shield",
          "overline": "DOMAIN 4 • 8 PROTOCOLS",
          "badge": "DOMAIN 4",
          "title": "Zero-Knowledge Security & Shield Protocols",
          "footerMeta": "DOMAIN 4 • 8 PROTOCOLS",
          "desc": "Zero-knowledge cryptography, cross-device alert deduplication, PII scrubbing, Tier 6 malware lockdown, Spoke-routed Tier 1 DMCA Safe Harbor, Tiers 2–5 compliance gates, patch shields, and bidirectional Nuclear Override.",
          "subCards": [
            {
              "id": "proto_d4_r1",
              "icon": "passkey",
              "title": "Zero-Knowledge Seal",
              "desc": "Combines OWASP 600k PBKDF2-SHA256 password/email blinding with a 12-hour hardware-bound FIDO2 Passkey & TOTP device seal, macOS Touch ID, 1-click Passkey recovery, and Web Push Companion Handshakes."
            },
            {
              "id": "proto_d4_r2",
              "icon": "notifications_off",
              "title": "Echo Suppressor",
              "desc": "Synchronizes encrypted alert dismissal tokens via notification_state_sync so OS warnings, DEFCON notices, and Command Center alerts fire once per account across all rigs, with per-category Spoke muting."
            },
            {
              "id": "proto_d4_r3",
              "icon": "cleaning_services",
              "title": "Ghost Scrubber",
              "desc": "Proactively scrubs OS paths, local usernames, IPs, MACs, SIDs, emails, and HWIDs ([REDACTED BY SANCTUARY]) before diagnostics leave the rig while gating Architect telemetry strictly to verified Tier 0 hashes."
            },
            {
              "id": "proto_d4_r4",
              "icon": "gpp_bad",
              "title": "Zero-Choice Lockdown",
              "desc": "Executes Bytecode Hound heuristics (decompressing Zlib/Zstd streams, archives, and bytecode) to halt game launches on Tier 6 Malware, isolate payloads in Quarantine, and require {Citizen}-signed Secure Shred."
            },
            {
              "id": "proto_d4_r5",
              "icon": "visibility_off",
              "title": "Tiered Surface Isolation & {Blueprint} Support Lock",
              "desc": "Restricts The Nexus, Comm-Link, Architect Console, and Community {Mod} Support to Tier 0 (Unknown in Scout/Mason queues only, Tier 1 DMCA / Tiers 2–5 & Pending flags hidden in Oversight/Wayfinder hubs only). Equipping Tier 1–5 or Unknown {mods} engages a non-destructive Active {Blueprint} Support Lock while Keeper OS Bug Reports stay open."
            },
            {
              "id": "proto_d4_r6",
              "icon": "warning",
              "title": "DEFCON 1 Shield",
              "desc": "Monitors live global_network_status events plus Next-Desktop-Open and offline game updates on startup (Auto Backup, Alert, or Lone Wolf) to seal saves before breaking patches launch."
            },
            {
              "id": "proto_d4_r7",
              "icon": "policy",
              "title": "Nuclear Override",
              "desc": "Hidden 5-click {Settings} subtitle override permitting offline quarantine airgap toggling bidirectionally (writing or clearing local airgap state without locking citizens out permanently unless submitted)."
            },
            {
              "id": "proto_d4_r8",
              "icon": "gavel",
              "title": "Spoke-Routed DMCA Safe Harbor",
              "desc": "Routes Tier 1 Legal/DMCA takedowns (17 U.S.C. § 512) to the sovereign Partner Spoke Hub under a 48h SLA while logging minimal statutory metadata to Keepers Core (public.dmca_compliance_notices), supporting 10–14 business day § 512(g)(3) counter-notices without local file deletion."
            }
          ]
        }
      ]
    }
  ],
  "_bodySig": 727533863,
  "isActive": true
}
-->

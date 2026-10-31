# Sanctuary OS — Master Architecture & Feature Document

**Document Version:** v0.6.0-Dev.1  
**Last Updated:** October 30, 2026  

Sanctuary OS is a cross-platform (Windows & macOS), local-first mod operations layer, desktop middleware, and decentralized Hub-and-Spoke ecosystem built on a strict **"no asset hosting / metadata-only / offline-first / 0% platform tax"** architecture.

---

## Pillar 1: Core Stack, Cross-Platform Rust Backend & Zero-Tearing Liquid Glass Engine

Sanctuary OS pairs a native multi-threaded Rust systems backend with a 60+ FPS reactive glassmorphic UI:

- **Frontend Runtime (`React 18 + TypeScript + Vite + Tailwind CSS v4`):**
  - **Zero-Tearing Liquid Glass Optics Engine (`v0.5.8-Dev.5`):** Continuous 3D wallpaper refraction across scrolling views (`Vault`, `Nexus`, `Command Center`, `Workbench`, and floating IDE Alert Cards) using `.glass-panel`, `.glass-surface`, and `.portal-glass-fix` with theme-engine color tinting (`color-mix(in srgb, var(--surface) ...)`) and zero dark slate rings across both Dark and Light themes.
  - **6 Live Theme Forge Optical Sliders:** Real-time control over **Glass Opacity**, **Refractive Blur**, **Refractive Saturation**, **Rim Light Intensity**, **Specular Glare**, and **Elevation Depth**, paired with an interactive multi-stop Background Builder and Holo Sandbox.
  - **Single Morphing Status Pill (`SystemStatusBar.tsx`):** Consolidates the Status Bar, Notification Dock, and Main Dock into a single centered, auto-tucking Liquid Glass pill that adapts dynamically between the **Foundry Landing Page** and **Mounted Game Workspaces** (Radar Sweep, Vault Lockdown, Blueprint Swap, and live alert counters).
- **State & Dynamic Glossary Lexicon Engine (`Zustand + LexiconContext.tsx`):**
  - Global state management with automatic `localStorage` quota protection (`safeLocalStorageSetItem` & `purgeBloatedLocalStorage`).
  - **Zero Hardcoded Text Strings & 1,253-Key Canonical Dictionary:** 100% of labels, Material Symbol icons (`icon_*`), and messages route through `useLexicon()` across **Standard English (`en-default.json`)**, **Sanctuary Sci-Fi (`en-sanctuary.json`)**, **The Sims 4 (`en-sims.json`)**, and **Simlish (`Simlish.json`)**.
  - **Dynamic Glossary Token Interpolation (`interpolateGlossaryTokens`):** Real-time runtime interpolation of 21 core domain tokens (`{Mod}`, `{Mods}`, `{Vault}`, `{Blueprint}`, `{Blueprints}`, `{Mason}`, `{Masons}`, `{Citizen}`, `{Citizens}`, `{Backups}`, `{Lab}`, `{Settings}`, `{Chameleon}`, `{Lexicon}`, `{Nexus}`, `{Dispatch}`) with automatic casing and indefinite article grammar (`a {mod}` -> `an Artifact`).
- **Cross-Platform Native Desktop Engine (`Tauri v2 + Rust` — Windows & macOS):**
  - **Windows & macOS Parity:** Native support for Windows (`.exe` / NSIS installer) and macOS (`.dmg` / `.app` Universal Binary with `Entitlements.plist`), including PE executable version extraction (`pelite`) on Windows and `.app/Contents/Info.plist` (`CFBundleShortVersionString`) parsing on macOS.
  - **macOS TCC & Gatekeeper Integration:** Built-in Full Disk Access permission diagnostics (`check_macos_permissions`), one-click macOS System Settings deep-linking (`open_macos_full_disk_access`), and Gatekeeper quarantine attribute clearing (`clear_macos_quarantine` via `xattr -dr com.apple.quarantine`).
  - **High-Throughput Rust I/O & SQLite WAL Pipeline:** Multi-threaded `rayon` + `walkdir` single-pass directory scanning, Blake3 / SHA-256 DNA hashing, persistent SQLite WAL connection pooling (`.sanctuary_cache.db` with `synchronous = NORMAL` and 64MB page cache), `OnceLock` pre-compiled heuristic regexes, incremental hardlink backups (`.tar.zst`), WebAuthn/FIDO2 native bridge, and bilateral codebase `.md` directive synchronization (`read_local_directives` / `write_local_directive`).

---

## Pillar 2: Hub, Spokes, Non-Custodial Supporter Bridge & Decentralized Static Edge

Sanctuary OS eliminates centralized lock-in by separating global identity from community-owned game databases and creator-owned static manifests:

- **Core OS Hub Database (`schema_os.sql` — Project `tpsbtaqxlczrysqqmanp`):**
  - Governed by **Keepers Core**. Hosts global SSO authentication (`auth.users`), privacy-first `profiles` (`citizen` | `keeper`), `user_passkeys` (FIDO2 hardware/biometric bindings), `hardware_bans` (decoupled Nuclear Override ledger), `sanctuary_games` (Spoke directory), `sanctuary_schemas` (including the `default` Keepers Core Default Schema baseline), `system_directives` (bidirectionally synced with repository `.md` files), `keeper_heuristic_signatures`, and `keeper_system_broadcasts` (including canonical `EULA`, `Privacy`, and `Terms` legal documents).
- **Community Game Spoke Databases (`schema.sql` — 36 Tables):**
  - 100% owned and hosted by each game community's **Wayfinder**. Stores game-specific `profiles` (storing only `id`, `username`, 5-tier Spoke `role`, and ban flags—zero email or password bleed), Spoke-branded `sanctuary_schemas` and `sanctuary_lexicons`, `mods`, `mod_versions`, `masons`, `blueprints`, `collections`, `conflicts`, `scout_suggestions`, `heuristic_signatures`, `system_broadcasts`, `dispatch_poll_votes`, `sanctuary_tickets`, and append-only `audit_logs`.
- **Edge Gateway (`game-gateway`) & Single-File Standalone Fork (`src/supabase.ts`):**
  - In **Hub-and-Spoke Mode**, cross-database mutations route through `game-gateway` so Spoke `supabase_service_key` secrets are never exposed to clients. Supports 1-click `SANCTUARY-UPLINK://` onboarding (`verify_and_bootstrap_spoke`) and unilateral **"Cut the Cord"** bilateral severance (`sever_spoke_cord`).
  - In **Standalone Fork Mode**, editing only `SANCTUARY_CONFIG` in `src/supabase.ts` routes all `secure_*` RPCs directly against a single `schema.sql` database with zero Edge Functions or Hub dependencies.
- **Non-Custodial Supporter Bridge & Community Donations (`0% Sanctuary Cut`):**
  - Partner communities configure their own direct checkout links (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`) in **Wayfinder Operations -> Spoke Control -> Non-Custodial Community Donations**.
  - Sanctuary OS takes a **0% platform cut** and never custodies funds. Every `$5` a Citizen donates to either Sanctuary Foundry or any Partner Community Spoke automatically grants `+30 days` of Global Dev Build access (`partner-donation-webhook`).
- **Decentralized Static Edge Polling (`manifest.json` & `override.json`):**
  - Creators can export self-contained releases (`export_edge_release`) containing `<mod>_v<version>.zip`, `manifest.json` (version, changelog, SHA-256 hash lineage, `atomic_logic`), and `override.json`. Sanctuary polls creator HTTP endpoints directly during Radar Sweeps—delivering update alerts and conflict/dependency rules with zero database dependency.

---

## Pillar 3: 100% Game-Agnostic Master Schema Studio, Lexicon Studio, Vault Airgap & Workbench

Sanctuary OS is 100% engine-agnostic across both its React frontend and Rust backend:

- **Master Schema Visual Studio (`SchemaVisualStudio.tsx`) & Interactive Architecture Codex (`SchemaLexiconGuideSidePanel.tsx`):**
  - **7 Engine Architecture Presets (`gameArchitecturePresets.ts`):** 1-click presets for **The Sims 4 (`DBPF + Python`)**, **Cyberpunk 2077 (`REDengine 4`)**, **GTA V (`RAGE / OpenIV`)**, **Skyrim SE (`Creation Engine`)**, **Baldur's Gate 3 (`Larian .pak`)**, **Stardew Valley (`SMAPI`)**, and **Universal Custom Engine**, plus **Populate Safe Defaults** to non-destructively fill empty fields.
  - **4-Tab Visual Schema Editor:**
    1. **Identity & Paths:** Schema ID, Engine ID, Designation Title, Default Lexicon Pack, Schema Version, Min Scout Submissions, Windows (`.exe`) & macOS (`.app`) Binaries, `executable_subdir` (`Game/Bin`), Engine Manifest File (`Resource.cfg` / `plugins.txt`), Windows & macOS Artifacts and Telemetry/Saves roots, Auto-Recon Paths, `dlc_subdirs`, `launch_args_dlc_mask_template` (`-disablepacks:{packs}`), and `save_airgap_targets`.
    2. **Extensions & Routes:** Deployable Artifact Extensions, Editable Directive Extensions (`config_extensions`), Unidentified Bypass Extensions, Volatile Engine Cache Targets, Binary Extension Parsers, Badge Labels, Magic Bytes, and **Secondary Install Routes (`install_routes`)** (routing specialized files like `.world` or `.asi`/`.dll` to secondary game folders via symlink or copy).
    3. **Load Order & Tiers:** 4 Load Order Strategies (`folder_priority`, `manifest_list`, `numeric_prefix`, `timestamp`), Override Winner Direction, Tier Folder Sequence, and Category Taxonomy Matrix.
    4. **Logs & Time Capsule:** Rule-type dropdown **Exception Log Matchers** (`Starts With + Ends With` or `Exact Filename`), regex **Exception Rules**, and **Time Capsule & Lab Save Extensions** (`lab_verification.save_extensions`).
  - **Floating Liquid Glass Schema Integrity Alert:** Real-time validation against the **Keepers Core Default Schema** with 1-click `+ Add Missing` and `Purge Deprecated` actions.
- **4-Tab Lexicon Visual Studio (`LexiconVisualStudio.tsx`):**
  - **Core Terminology (`21` Dynamic Glossary Tokens)**, **OS Modules**, **Sidebar & Landing**, and **Manifest & Tools** (featuring the **Guided OS Icon Override Builder** with searchable OS icon dropdown + visual Material Symbol picker, and `.sa-glass-toggle` switches for Batch Find & Replace).
  - Validated in real time against the canonical **`en-default.json` Baseline**.
- **Symlink Airgap 2.5 & Automatic Root Config Deduplication (`deduplicate_vault_root_configs`):**
  - Projects active mods from `Vault/Mods/` into the live game folder via OS symlinks while isolating vanilla saves and configs.
  - **Dynamic Config Watcher Deduplication:** When a mod's config file (`.cfg`, `.ini`, `.json`, `.toml`, `.yaml`) already exists inside a mod's subfolder (e.g., `Mods/MCCC/mc_settings.cfg`) and the game engine writes a duplicate copy to the live `Mods/` root, the Config Watcher syncs the newer data into the subfolder copy, deletes the root duplicate, and suppresses FSEvents/ReadDirectoryChangesW bounce loops so deleted duplicates never reappear.
- **Conflict Radar 2.0 & Schema-Driven Load Order Compiler (`compileLoadOrder`):**
  - **5-Tier Severity Matrix (`radar.rs` & `ConflictResolutionSidebar.tsx`):** Categorizes collisions across **Severity 1 (`Visual/Texture`)**, **Severity 2 (`Clone/Duplicate`)**, **Severity 3 (`Gameplay Tuning`)**, **Severity 4 (`Fatal Core/Script`)**, and **Severity 5 (`Circular Dependency Loop`)**, pairing 1-click **"Set Winner"** resolution with game-agnostic **Priority Override Tiers** (`Standard Load`, `Late Load (Tier 1)`, `High Priority (Tier 2)`, `Final Override`).
  - **Game-Agnostic Load Order Engine (`DbpfScout.tsx`):** Compiles deployment load order via topological sorting and DFS cycle detection across `folder_priority` (`Standard Load` through `Final Override` + dynamic `Resource.cfg`), `manifest_list` (`loadorder.txt` / `plugins.txt`), `numeric_prefix` (`001_`), and `timestamp`, adapting the UI to the active engine strategy with directional `Must Load After (Wins)` / `Must Load Before (Yields)` rules, elevated priority tiers, sequential queue controls (for manifest/prefix/timestamp engines), and a searchable **Scan Scope** Blueprint selector.
  - Enforces **The Highlander Rule** (Flavor eviction), **Nuclear Family Cohesion** (Twins), **Recursive Chain-Link Dependencies**, **Deep Yeet 2.0 Delete Cascades**, and **DLC/Version Ghosting**.
- **Citizen's Workbench, Homestead Lab & Time Capsule:**
  - **Citizen's Workbench:** 60 FPS 2-column Visual Config Editor, Category Pill Bar, dual `Min`/`Max` range steppers, No-Code Visual Template Builder, and **2-Column Interactive Timeline & Diff Workspace**.
  - **Homestead Lab & Time Capsule:** 100% Nuke symlink isolation and 1v1 Conflict Stability testing with schema-driven exception log diagnosis (`exception_rules`) and incremental hardlink snapshots (`World State` & `Engine Core`).

---

## Pillar 4: 6-Tier Governance, 2-Column Hub Overviews, FIDO2 Passkey Vault & Malware Lockdown

Security and operational governance are enforced across 6 clearance tiers and hardware-backed security gates:

- **6-Tier Clearance Hierarchy:**
  1. **Tier 1 — Citizen (`citizen`):** Full access to all 9 Citizen modules **plus inherited access to the local Open Mason Workshop** (`Sandbox`, `IDE`, `3-Tile Artifact Studio`, `Theme Forge`, `Notepad`, `Export Release`) and Scout Queue submissions.
  2. **Tier 2 — Verified Mason (`mason` / `isVerifiedMason`):** Direct Nexus artifact publishing, Verified Mason Queue fast-lane, Public Mason Profile showcase, and 0%-cut Supporter Bridge.
  3. **Tier 3 — Architect (`architect`):** Global Registry curation, Verified Mason & Scout Queue triage (`min_scout_submissions`), global Conflict Matrix directives, `Check Hash` deep scan utility, and Citizen Support Desk.
  4. **Tier 4 — Oversight (`oversight`):** Spoke Heuristic Signatures management, Tier 5 Malware flagging, Emergency DEFCON 1 triggers, Game/DLC patch registration, and Spoke Identity Matrix governance (up to Architect).
  5. **Tier 5 — Wayfinder (`wayfinder`):** Full Spoke Sovereignty (`Wayfinder Operations -> Spoke Control` & `Spoke Aesthetics`), Spoke Master Schema & Lexicon Studio, Identity Matrix governance (up to Wayfinder), `SANCTUARY-UPLINK://` management, Non-Custodial Community Donations, unilateral **"Cut the Cord"** severance, and **The Dispatch**.
  6. **Tier 6 — Keeper (`keeper` on Core Hub):** Global OS Hub governance, Turnkey Spoke Onboarding, Core Heuristics (`keeper_heuristic_signatures`), Keepers Core Default Schema, Global Lexicons/Chameleons, Bilateral System Directives & Legal Sync, and Global Audit Logs.
- **Standardized 2-Column `Recent` & `Anomalies` Hub Overviews:**
  - Every Elevated Hub (`Spoke Control`, `Spoke Aesthetics`, `Keepers Core`, `Oversight Command`, `Architect Console`) opens to a clean 2-column **Recent** (recently updated schemas, lexicons, themes, and active Spoke telemetry—free of raw audit log noise) and **Anomalies** (unsaved drafts, missing schema/lexicon keys, unconfigured donation/uplink endpoints, or security alerts) dashboard.
- **FIDO2 Passkey & TOTP Security Vault (`SecurityVaultSidePanel`):**
  - Elevated clearances (`Verified Mason` through `Keeper`) require a bound FIDO2 Passkey (Windows Hello, Touch ID, YubiKey) or TOTP authenticator. Unverified sessions lock only the Elevated Hub view behind the right-hand `SecurityVaultSidePanel` while keeping Citizen views accessible.
- **Dual-Tier Heuristic Scanner & Full-OS Quarantine SidePanel Lockdown (`MalwareAlertModal`):**
  - Merges **Core Heuristics** (Keepers) and **Spoke Heuristics** (Oversight) to inspect ZIP containers, raw binaries, UTF-16LE strings, and compiled `.pyc`/`.pyo` bytecode symbol chains.
  - Confirmed Tier 5 Malware locks the **entire OS shell** and opens the right-hand **Quarantine Lockdown SidePanel** displaying the exact **Triggered By** rule, **Detection Source**, optional **Anonymous Manifest Upload**, and a Citizen-signed **Secure Shred** button.

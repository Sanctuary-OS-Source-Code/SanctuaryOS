# Sanctuary OS — Master Protocol List & 6-Tier Clearance Matrix

**Document Version:** v0.6.0-Dev.2  
**Last Updated:** November 4, 2026  

---

## 1. The 6-Tier Clearance & Role Inheritance Matrix

Sanctuary OS decouples **Core OS Hub Clearances (`osRole`)** from **Game Spoke Clearances (`userRole`)** across 6 distinct operational tiers:

* **Tier 1 — Citizen (`userRole = 'citizen'` • Inherits Open Mason Workshop):**
  * Full access to all 9 Citizen modules (`Command Center`, `Your Vault`, `The Nexus`, `Blueprints`, `Comm-Link Feed`, `Conflict Radar`, `Homestead Lab`, `Citizen's Workbench`, `Time Capsule`).
  * **Inherited Open Mason Workshop:** Every Citizen inherits full local access to the **Mason Workshop** (`Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Chameleon Theme Forge`, `Notepad`, and `Static Edge Release Packaging` for generating `manifest.json`, `catalog.json` & `override.json` bundles).
  * Can publish Blueprints, Lexicons, Chameleons, and Workbench Templates to The Nexus, and submit new mod discoveries to the crowd-sourced **Scout Queue**.
* **Tier 2 — Verified Mason (`userRole = 'mason'` / `isVerifiedMason = true` • Separate Verified Creator Tier):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks **Direct Nexus Artifact Publishing**, the **Verified Mason Queue Fast-Lane** (bypassing the `min_scout_submissions` Scout firewall), **Public Mason Profile & Featured Showcase Assignment**, **Creator Comm-Link Dispatches**, **Direct Bug Report Dossiers**, and the **0%-Cut Supporter Bridge** (Patreon/Ko-fi/Stripe auto-stacking).
* **Tier 3 — Architect (`userRole = 'architect'` • Tier-0 Registry & Conflict Moderator):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks the **Architect Console** (strictly isolated to **Compliance Tier 0** public records)—including `Unified 3-Tile Artifact Studio` for Tier-0 registry entries, `Verified Mason Queue` & `Scout Queue` triage, global `Conflict Matrix` Severity 1–4 directive authoring, `Check Hash & Deep Heuristic Scanner`, `Template Oversight`, `Nexus Reports Queue`, and claimable `Citizen Support Desk` tickets.
* **Tier 4 — Oversight (`userRole = 'oversight'` • Spoke Security & Systems Administrator):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks **Oversight Command** (`Spoke Heuristic Signatures` authoring, `Compliance Tiers 1–5 Escalation & Malware Flagging`, `Emergency DEFCON 1 Lockdown Override`, `Spoke Identity Matrix` role governance up to Architect, `Game Patch & DLC Registration`, `Mass Registry Batch Updater`, and `Mason Profile Linker`).
* **Tier 5 — Wayfinder (`userRole = 'wayfinder'` • Community Manager & Spoke Sovereign):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks **Wayfinder Operations** (`Spoke Control` & `Spoke Aesthetics`, Spoke Master Schema Studio & Lexicon Visual Studio, full `Spoke Identity Matrix` authority up to Wayfinder, `SANCTUARY-UPLINK://` bundle export and live API key rotation, `Non-Custodial Community Donations`, unilateral **"Cut the Cord" Bilateral Severance**, `The Dispatch` community broadcasts with 2x2 telemetry headers and interactive polls, `System Audit Logs`, and `Keepers Support` escalation).
* **Tier 6 — Keeper (`osRole = 'keeper'` • Core OS Hub & Sanctuary Foundry Developer):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks **Keepers Core** on both the Foundry Landing Page and all workspaces (`Turnkey Spoke Onboarding`, `Core Heuristics Oversight`, `Keepers Core Default Schema` & `Master Game Schemas`, `Global Lexicon & Chameleon Registries`, `Foundry News, Legal & Release Notes`, **Bilateral Codebase-to-Keepers-Core Directives Sync**, and immutable `Global Audit Logs`).

---

## 2. System Foundation, Cross-Platform (Windows, macOS & Linux / SteamOS) & Bilateral Sync Protocols

* **The Cartographer:** Automated first-boot reconnaissance system that locates the Game Bin (`executable_subdir`), live Mods directory, and external Vault archive path across Windows, macOS, and Linux / SteamOS (Steam Deck).
* **Cross-Platform Version Ripper (`pelite` + macOS `Info.plist` + Steam `.acf`):** In-process Rust binary inspector that extracts genuine patch versions directly from Windows/Proton `.exe` PE headers (`pelite`), macOS `.app/Contents/Info.plist` (`CFBundleShortVersionString` / `CFBundleVersion`), and Steam `appmanifest_*.acf` manifests without spawning external processes.
* **Linux & SteamOS / Proton Prefix Auto-Resolver Protocol:** Parses `libraryfolders.vdf` and `appmanifest_*.acf` across native Steam, Flatpak, Snap, Heroic, Bottles, Lutris, and Steam Deck SD cards (`/run/media/mmcblk0p1` & `/run/media/deck`), mapping `%USERPROFILE%/Documents` and `%APPDATA%` Master Schema tokens directly into each game's `compatdata/<AppID>/pfx/drive_c/users/steamuser/` Proton prefix alongside `1280×800` handheld scaling and XWayland/EGL compositing guards.
* **macOS Full Disk Access & Gatekeeper Quarantine Protocol (`check_macos_permissions` / `clear_macos_quarantine`):** Detects macOS TCC permission blocks on `~/Documents` and `~/Library/Application Support`, deep-links to macOS System Settings, and strips `com.apple.quarantine` extended attributes on verified symlinks and game binaries.
* **WebGL2 3D Liquid Glass Optical Protocol (`webgl_glass_v61` / `rev_74`):** 1:1 physical-pixel background projection (`background-attachment: fixed` parity), crystal-clear interiors (`4px–6px` diffusion), `8px–13px` 3D Snell's Law refractive edge bevels, `layer2` WebGL2 overlay rendering for dropdowns and hovertips, concentric rounded-square geometry, and 8 `2560×1440` lossless atmospheric wallpapers.
* **`Ctrl+K` Command Matrix, Custom Hotkeys & Gamepad Protocol (`GlobalCommandPalette.tsx`):** OS-wide fuzzy command palette with user-remappable keyboard shortcuts (`sanctuary_cmd_hotkeys_v1`) and Web Gamepad API / Steam Deck controller button bindings (`sanctuary_cmd_gamepad_v1`), paired with universal `openSanctuaryContextMenu` right-click quick actions across all Citizen views and Elevated Hubs.
* **100% Agnostic Master Schema & Secondary Install Route Protocol (`sanctuary_schemas`):** Zero hardcoded file extensions, folder paths, or crash log names in Rust or React. Supports 7 pre-calibrated Engine Architecture Presets, secondary `install_routes` (routing `.world`, `.asi`, `.dll`, or `.pak` payloads to secondary game directories via symlink or copy), `dlc_subdirs`, `launch_args_dlc_mask_template`, `save_airgap_targets`, and `lab_verification.save_extensions`.
* **Master Schema & Lexicon Architecture Codex (`SchemaLexiconGuideSidePanel`):** Interactive in-app SidePanel manual with mode-switchable documentation and 2-column field reference grids explaining every schema and lexicon directive.
* **Dynamic Glossary Token & Guided Icon Override Protocol (`LexiconContext.tsx` & `LexiconVisualStudio.tsx`):** Interpolates 21 core domain tokens (`{Mod}`, `{Vault}`, `{Blueprint}`, `{Mason}`, `{Citizen}`, `{Backups}`, `{Lab}`, `{Settings}`, etc.) with automatic casing and article grammar, paired with a searchable **Guided OS Icon Override Builder** (`icon_*`).
* **Turnkey Spoke Uplink Handshake (`SANCTUARY-UPLINK://`):** 1-click onboarding protocol (`verify_and_bootstrap_spoke` on `game-gateway`) that validates all 38 tables in `schema.sql`, seeds `global_network_status`, and auto-provisions the community's **Founding Wayfinder**.
* **Bilateral Severance Protocol ("Cut the Cord"):** Self-service sovereignty protocol (`sever_spoke_cord`) executable by either a Keeper or a Spoke's Wayfinder. Writes an immutable severance record to both Hub and Spoke `audit_logs`, sets `is_active = false`, and permanently scrubs (`NULL`s) the Spoke's `supabase_service_key` from the Hub while leaving 100% of the community's database intact.
* **Single-File Standalone Fork Protocol (`src/supabase.ts`):** Allows any community to fork Sanctuary OS against a single `schema.sql` Supabase project by editing only `SANCTUARY_CONFIG` in `src/supabase.ts`, routing all `secure_*` RPCs directly without Edge Functions.
* **Bilateral Codebase-to-Keepers-Core Directive & Legal Sync (`public.system_directives` & `keeper_system_broadcasts`):** Automatically synchronizes core documentation directives and canonical legal documents (`EULA.md`, `Privacy Policy.md`, `Terms of Service.md`, `Compliance Protocol.md`, `Partners Agreement.md`) between the local repository `.md` files and **Keepers Core**.

---

## 3. Vault Airgap, Mod Version History, Multi-Rig Blueprint Queue & Mod Management Protocols

* **Symlink Airgap 2.5 & Single-Active Binary Deduplication:** Projects mods from the isolated `Vault/Mods/` archive into the live game directory via zero-copy OS symlinks (`symlink_file` / `symlink_dir`) and secondary `install_routes`, while enforcing single-active binary deduplication across subfolders.
* **Zero-Byte Hardlink Mod Version History & Family Rollback Protocol (`Backups/Mods/`):** Archives every installed mod from Version #1 into `<Vault>/Backups/Mods/<rel_dir>/<hash12>/<original_filename>` using OS hardlinks (0 extra bytes while active), supporting `Keep Multiple` vs. `Keep One` retention modes, automatic game-version `Auto-Swap`, multi-module `Suite Revision Matrix` family rollbacks, and non-destructive `Skip` vs. `Update & Archive` duplicate resolution.
* **Multi-Rig Blueprint Signature Queue, Mobile Companion Radar & Guided Batch Updater (`1 of N`):** Encrypts Blueprint diffs (`+Added` / `-Removing`) and Mobile/Web Vault Companion Radar telemetry client-side via AES-256-GCM (`citizen_staging_queue`), supporting `Leave in Cloud` (per-rig `Complete on This Rig`) vs. `Shred After Deploy` modes and stepping through missing/outdated downloads sequentially via the `1 of N` **Side Browser Guided Batch Updater**.
* **Automatic Root Config Deduplication Protocol (`deduplicate_vault_root_configs`):** Prevents duplicate config files (such as `mc_settings.cfg`) from accumulating or reappearing in the Vault root. When a config file already belongs to a mod subfolder (`Vault/Mods/MCCC/mc_settings.cfg`) and the game engine generates a duplicate in the root `Mods/` folder, Sanctuary syncs the newer timestamped data into the subfolder copy, removes the root duplicate, and suppresses watcher feedback loops.
* **Decentralized Static Edge Polling (`manifest.json`, `catalog.json` & `override.json`):** Binds a mod's SHA-256 hash lineage in `.sanctuary_cache.db` and polls creator HTTP endpoints directly during Radar Sweeps and Mobile Companion Radar syncs for decentralized updates and `atomic_logic`.
* **Mod Suite Parent Grouping:** Automatically groups multi-file mod suites (e.g., *MC Command Center* and its submodules, or `.package` + `.ts4script` twins) into a single clean Parent Card with an expandable `{N} Linked Modules` drawer.
* **Unified 3-Tile Artifact Studio:** Standardized 3-step workflow (`Details & Versions`, `Files & Folders`, `Rules & Upload`) across both the Mason Workshop and Architect Console.
* **Reimagined Citizen's Workbench & Visual Timeline Diff:** 2-column 60 FPS Visual Config Editor with category pills, themed glass number steppers, `Min`/`Max` range controls, a No-Code Visual Template Builder, and a **2-Column Interactive Timeline & Diff Workspace** (Visual Diff + Raw Monaco Diff + live `[In-Game Engine Edit]` snapshots).
* **Floating Liquid Glass Key Validator Alert (`MasonEditorPanel`):** Real-time floating alert card in the Master Schema and Lexicon IDEs that validates active files against the **Keepers Core Default Schema** (for schemas) or **`en-default.json` Baseline** (for lexicons).

---

## 4. Stability, Load Order & Atomic Logic Protocols

* **Schema-Driven Load Order Engine (`compileLoadOrder`):** Compiles deployment priority using `folder_priority` (dynamic `Resource.cfg` + 4 game-agnostic Priority Override Tiers from `Standard Load` to `Final Override`), `manifest_list` (`loadorder.txt`/`plugins.txt`), `numeric_prefix` (`001_`), or `timestamp`, complete with topological sorting, strategy-aware priority tier and queue controls, searchable Blueprint Scan Scope selection, and DFS circular-loop breaking.
* **Conflict Radar 2.0 & 5-Tier Severity Matrix (`radar.rs` & `ConflictResolutionSidebar.tsx`):** Classifies collisions across a 100% game-agnostic 5-Tier Severity Matrix (`S1 Visual`, `S2 Clone`, `S3 Tuning`, `S4 Core/Script`, `S5 Circular Loop`), pairing 1-click **"Set Winner"** resolution and game-agnostic Priority Override Tiers with a directional `Must Load After`/`Before` rule builder.
* **The Highlander Rule:** Automatically evicts rival Flavor files when equipping a chosen Flavor.
* **Nuclear Family Cohesion (Twins):** Bidirectionally links companion `.package` and `.ts4script` files so they equip and unequip together.
* **Recursive Dependencies (Chain-Link) & Deep Yeet 2.0 (Cascade Removal):** Automatically equips required master mods when enabling an add-on, and intercepts master mod deletion to queue all dependent child mods.
* **100% Nuke Injection & 1v1 Stability Arena (Homestead Lab):** Isolates vanilla saves via `save_airgap_targets`, strips active symlinks to test suspect mods or head-to-head conflicts in total isolation, and diagnoses crash logs using schema-driven `exception_rules` and `exception_logs` matchers.
* **Incremental Hardlink Time Capsule & Differential Rollback:** Snapshots `World State` (`lab_verification.save_extensions` & settings) and `Engine Core` (Game Binaries) using OS hardlinks and restores via differential byte comparison.

---

## 5. Security, FIDO2 Passkeys, Zero-PII Scrubber & Quarantine Protocols

* **FIDO2 Passkey Vault, 12-Hour Device Seal & Dev Build Clearance Gate (`SecurityVaultSidePanel` & `DevBuildClearanceGate`):** Requires hardware-bound WebAuthn/FIDO2 Passkeys or TOTP verification for all Elevated Clearances (`Verified Mason` through `Keeper`) and account credential updates, issuing a **12-hour Device-Bound Cryptographic Passkey Seal (`sanctuary_passkey_seal_v2`)** on trusted hardware and gating pre-release `-Dev` Web builds behind `DevBuildClearanceGate`.
* **Proactive Zero-PII Log & Path Scrubber Protocol (`scrubLogUserData` / `obscure_username`):** Redacts Windows (`C:\Users\<user>\`), macOS (`/Users/<user>/`), Linux (`/home/<user>/`, `/var/home/<user>/`, `/run/media/<user>/`, `/media/<user>/`), and Proton (`drive_c/users/<user>/`) paths, XML user/hostname tags, explicit HWID/Hostname/IP headers, MAC addresses, IPv4/IPv6 addresses, Windows SIDs, and email addresses across all crash logs and support tickets.
* **Non-Custodial Supporter Bridge & Community Donations (`partner-donation-webhook`):** Connects Partner Spoke communities and Verified Masons directly to their own payment processors (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`) with a **0% Sanctuary cut**, while crediting Citizens `+30 days` of Global Dev Build access per `$5` donated.
* **Dual-Tier Multi-Format Heuristic Scanner:** Merges global **Core Heuristics** (`keeper_heuristic_signatures`) and community **Spoke Heuristics** (`heuristic_signatures`) using pre-compiled `OnceLock` Rust regex sets to scan ZIP containers, Zlib/Zstd DBPF streams, raw binaries, UTF-16LE strings, and `.pyc`/`.pyo` bytecode symbol chains.
* **Full-OS Quarantine SidePanel Lockdown & External Secure Shred (`MalwareAlertModal`):** Confirmed Tier 5 Malware locks the entire OS shell, queues multiple drops asynchronously without UI freezing, displays the exact **Triggered By** rule and **Detection Source**, and requires a **Citizen's Signature** to execute a destructive multi-pass **Secure Shred** in Rust.
* **Florida Compliance Tiers 1–4, Strict Tier 0 Architect Isolation & Blueprint Auto-Purge:** Permits Tiers 1–4 in local Vaults and Static Edge manifests while scrubbing them from public Nexus feeds, strictly isolating Tier 3 Architects to Tier 0 records (escalating Tiers 1–4 to `Oversight Command -> Compliance`), and automatically stripping flagged hashes from Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`).
* **DEFCON 1 Network Shield:** Real-time Supabase listener on `global_network_status` that intercepts game launches during breaking game patches and forces a Pre-Patch Time Capsule snapshot.
* **The Nuclear Override & Domain-Salted SHA-256 `hardware_bans`:** Revealed by clicking the System Preferences subtitle 5 times; bypasses local quarantine at the cost of recording a domain-salted one-way SHA-256 hardware hash (`"sanctuary-os-zero-pii-hwid-v1:"`) in the decoupled `hardware_bans` ledger on the Core OS Hub, permanently revoking cloud access without tracking hardware IDs on standard users.
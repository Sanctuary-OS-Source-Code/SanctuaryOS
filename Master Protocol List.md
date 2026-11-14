# Sanctuary OS — Master Protocol List & 6-Tier Clearance Matrix

**Document Version:** v0.6.0-Dev.13  
**Last Updated:** November 14, 2026  

---

## 1. The 6-Tier Clearance & Role Inheritance Matrix

Sanctuary OS decouples **Core OS Hub Clearances (`osRole`)** from **Game Spoke Clearances (`userRole`)** across 6 distinct operational tiers with sub-second landing-page Command Hubs:

* **Tier 1 — Citizen (`userRole = 'citizen'` • Inherits Open Mason Workshop):**
  * Full access to all 9 Citizen modules (`Command Center`, `Your Vault`, `The Nexus`, `Blueprints` + `Patch Readiness Simulator`, `Comm-Link Feed`, `Conflict Radar`, `Homestead Lab`, `Citizen's Workbench`, `Time Capsule`) and the 7-domain `Settings` suite.
  * **Inherited Open Mason Workshop:** Full local access to `Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Chameleon Theme Forge`, `Lexicon Visual Studio`, `Notepad`, local JSON export/import, and `Static Edge Release Packaging` (`.sanctuary.manifest.json`, `.sanctuary.override.json` & `catalog.json` + 6-provider 1-click Auto-Push).
  * Can share Blueprints (`Public`, `Unlisted`, or `Private`) and submit passing Tier-0 discoveries (`_lab_cert_proof`) to the crowd-sourced **Scout Queue**.
* **Tier 2 — Verified Mason (`userRole = 'mason'` / `isVerifiedMason = true` • Verified Creator Tier):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`, Touch ID & Companion Handshake)**.
  * Unlocks **Direct Cloud Nexus Publishing** for **Mods**, **Lexicons**, **Chameleons** (`<= 250 KB` content-addressed WebP or external HTTPS URL), and **Workbench Templates**, the **Verified Mason Queue Fast-Lane**, **Public Mason Profiles & Showcases**, **Creator Comm-Link Dispatches**, **Direct Bug Report Dossiers**, and the **0%-Cut Supporter Bridge** (with Zero-PII E2EE Multi-Rig perk sync).
* **Tier 3 — Architect (`userRole = 'architect'` • Tier-0 Registry & Conflict Moderator):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks the **Architect Console** (strictly isolated to **Compliance Tier 0** `Stable` records)—including Tier-0 Registry & Collection curation, `Verified Mason Queue` & `Scout Queue` triage, global `Conflict Matrix` & **Highlander Exclusive Slots** authoring, pinned **Known Error Rules**, interactive `Workbench Template Oversight` (`TemplatePreviewer`), `Check Hash` verification, and exclusive **`Claimed`** `Citizen Support Desk` queues (escalating any Tier 1–4 flag to `Oversight > Compliance` as **`Pending`** without ban or active compliance lock powers).
* **Tier 4 — Oversight (`userRole = 'oversight'` • Spoke Security & Systems Administrator):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks **Oversight Command** (`Spoke Heuristic Signatures`, **`Pending` Tier 1–4 Compliance confirmation** & Tier 5 Malware blacklisting, `Emergency DEFCON 1 Lockdown Override`, `Spoke Identity Matrix` governance excluding Oversight/Wayfinders, `Game Patch & DLC Registration`, `Mass Registry Batch Updater`, `Mason Profile Linker`, and read/export-only `Audit Log` review without log pruning).
* **Tier 5 — Wayfinder (`userRole = 'wayfinder'` • Community Manager & Spoke Sovereign):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks **Wayfinder Operations** (`Spoke Control` & `Spoke Aesthetics`, Spoke Master Schema v2 & Lexicon V2 Studios, in-hub `Mass Update` & `Patch Management`, full `Spoke Identity Matrix` authority up to Wayfinder, `SANCTUARY-UPLINK://` bundle export & live key rotation, 100% Wayfinder-isolated `Non-Custodial Community Donations` & transparent monthly cost ledgers, high-friction **"Cut the Cord" Bilateral Severance**, `The Dispatch`, `System Audit Logs`, and `Keepers Support`).
* **Tier 6 — Keeper (`osRole = 'keeper'` • Core OS Hub & Sanctuary Foundry Developer):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault (`12-Hour Device Seal`)**.
  * Unlocks **Keepers Core** on both the Foundry Landing Page and all workspaces (`Turnkey Spoke Onboarding`, `Keepers-Only` dev-spoke cloaking, `Core Heuristics Oversight`, `Keepers Core Default Schema`, `Global Lexicon & Chameleon Registries`, `Foundry News, Legal & Release Notes`, **Bilateral Codebase-to-Keepers-Core Sync**, and immutable `Global Audit Logs`—strictly isolated from Partner Spoke control beyond compliance severance).

---

## 2. System Foundation, Steam Deck Controller Engine, Lexicon V2 & Sovereignty Protocols

* **The Cartographer & Game-Only Auto-Detect:** Automated cross-platform reconnaissance locating Game Bin (`executable_subdir`), Active Mods (`mods_path`), and auto-resolved **Saves, Logs & Cache (`docs_path`)** folders across Windows (including 1-click cross-drive UAC symlink unlock), macOS, and Linux / SteamOS—strictly separated from the OS-wide **Master Vault Location** (`Settings -> Vault & Blueprints`).
* **Cross-Platform Version Ripper (`pelite` + macOS `Info.plist` + Steam `.acf` + `json_key`):** In-process Rust inspector extracting genuine patch versions from Windows/Proton `.exe` PE headers, macOS `.app/Contents/Info.plist`, Steam `appmanifest_*.acf`, and declarative `json_key` manifests.
* **Full-OS Steam Deck Controller Engine & Proton Prefix Auto-Resolver (`main.rs` & `system.rs`):** Unifies Gamescope XWayland surface binding (`GDK_BACKEND=x11`), decodes 64-byte `SteamDeckStatePacket_t` `hidraw` + `evdev` inputs into a **60 FPS Chameleon Virtual Pointer** (`.sa-gamepad-cursor`), **2D Spatial Focus**, **`L1`/`R1` tab cycling**, **`Left Trackpad` scrolling**, and **Steam OSK auto-summon**, and maps Master Schema paths directly into Valve Proton `compatdata/<AppID>/pfx/` prefixes across internal storage and SD cards.
* **macOS Touch ID, Full Disk Access & Gatekeeper Protocol:** Native Apple Touch ID WebAuthn Passkeys, TCC permission diagnostics (`check_macos_permissions`), System Settings deep-linking, and `com.apple.quarantine` stripping on verified Vault projections.
* **WebGL2 Liquid Glass, Content-Addressed Wallpapers & Mobile `<SidePanelFilterBar>`:** 1:1 physical-pixel WebGL2 refraction (`layer2` dropdown/tooltip glass), `SHA-256` deduplicated `<= 250 KB` WebP Chameleon wallpapers (`1-year` CDN cache + `{Vault}/Data/Themes/` offline cache + external HTTPS URLs), Per-Space `{Chameleons}` & `{Lexicons}` matrix, and responsive mobile `<SidePanelFilterBar>` selector pills across 51+ drawers.
* **100% Agnostic Master Schema v2 Protocol (`sanctuary_schemas` v12):** Zero hardcoded extensions, paths, filenames, or AppIDs. Supports 7 Engine Architecture Presets, multi-folder tree preservation, `archive_containers`, secondary `install_routes`, structured `load_order` XML/manifest templates, and declarative `conflict_analyzers`.
* **Lexicon Engine V2, Sparse Delta Packs & 1-Click Auto-Translate (`sync-lexicons.mjs` & `LexiconVisualStudio.tsx`):** Auto-extracts `6,166` Standard English keys into `en-default.json`, stores non-default packs as lightweight **Sparse Delta Overrides** with **21 Dynamic `{Glossary}` Tokens**, and translates packs across **28+ languages in 1 click**.
* **High-Friction "Cut the Cord", Vaulted Secrets & Cryptographic `SRK1` Spoke Relink:** Vaults Spoke service keys in `service_role`-only `public.sanctuary_game_secrets`, guards bilateral severance behind a `"CUT THE CORD"` phrase lock, and binds returning Spin-Off Spoke users via **`SRK1.<hub_uuid>.<relink_secret>`** SHA-256 commitments (`spoke_relink_commitments`) alongside 1-file Standalone Forking in `src/supabase.ts`.
* **Bilateral Codebase-to-Keepers-Core Asset, Directive & Legal Sync:** Synchronizes Core Schemas, Lexicons, Themes, `system_directives`, and canonical legal covenants between repository files and **Keepers Core**.

---

## 3. Vault Airgap, Patch Readiness Simulator, Multi-Rig Sync & Mod Management Protocols

* **Symlink Airgap 2.5, Rogue Mod Rescue & Root Config Deduplication:** Projects active artifacts from `Vault/Mods/` via zero-copy OS symlinks and secondary `install_routes`, rescues untracked files dropped into live `Mods/` folders before deployment, and deduplicates stray root config copies back into their owning mod subfolders.
* **Blueprint Patch Readiness Simulator & 1-Click Clone Ready (`BlueprintPatchReadiness.tsx`):** Evaluates Play Sets against any game version with 1-to-1 deduplicated `{Mod}` parity (`isBlueprintModArtifact`), multi-pass Atomic Logic & transitive dependency checks, family/twin folder coupling, local `Auto-Swap Ready` matching, 1-click `Get Dependency` links, `Issue & Cause Details` (`status_reason`), and 1-click **`Clone Ready {Blueprint}`**.
* **Zero-Byte Hardlink Mod Version History & Suite Revision Matrix (`Backups/Mods/`):** Archives every installed binary from Version #1 using zero-extra-byte OS hardlinks, supporting `Keep Multiple` vs. `Keep One`, automatic game-version `Auto-Swap`, and whole-family `Suite Revision Matrix` rollbacks.
* **3-Mode Blueprint Sync, Autonomous Self-Healing & Zero-Deadlock `Beam to Rig`:** Provides `Public`, `Unlisted`, and `Private` Cloud Blueprint modes, settled post-scan SHA-256 ghost healing in `usePlaySetLogic.ts`, concurrent GZIP + AES-256-GCM Personal Rig transfers (`10 MB` `citizen_staging_queue`), Mobile Vault Companion Radar, and the `1 of N` **Side Browser Guided Batch Updater**.
* **Concurrent Rust Static Edge Polling (`poll_edge_manifests_batch`):** Polls `.sanctuary.manifest.json`, `.sanctuary.override.json`, and multi-mod `catalog.json` endpoints concurrently in Rust with `ETag` / `If-Modified-Since` `304` caching, `previous_hashes` lineage rollover, and HTTPS SSRF protection.
* **Citizen's Workbench v2.0 & Unified 3-Tile Artifact Studio:** 2-column 60 FPS Visual Config Editor (`.sanctuary.template.json` + native INI/TOML/YAML/XML/JSON) with interactive `[In-Game Engine Edit]` Timeline Diffs, paired with the standardized 3-Tile Artifact Studio across Mason Workshop and Architect Console.

---

## 4. Stability, Pluggable Conflict Radar, Highlander Swap Alerts & Homestead Airgap Protocols

* **Schema-Driven Load Order Engine (`ArtifactScout.tsx` & `compileLoadOrder`):** Compiles deployment priority across `folder_priority`, `manifest_list` (including structured XML like `modsettings.lsx`), `numeric_prefix`, and `timestamp` with topological sorting, strategy-aware priority tiers, searchable Blueprint Scan Scopes, and DFS cycle detection.
* **Pluggable Conflict Radar 2.0 (`radar.rs` & `ConflictResolutionSidebar.tsx`):** Executes declarative `virtual_fs_path`, `archive_member`, `binary_chunk_index` (`bitmask_constant_header`), and `json_xml_key` analyzers across a 5-Tier Severity Matrix (`S1–S5`), unified 1:1 across Command Center tiles and resolution drawers.
* **Highlander Exclusive Slots & Explicit Swap Alerts (`highlander_group_id`):** Prompts `{Citizens}` with explicit **`Swap {Mods}`**, **`Keep Both`** (routing co-equipped rivals to Conflict Radar at Severity 3), or **`Cancel`** alerts on cards and Dossiers whenever equipping a `{Mod}` into an occupied Exclusive Slot—never silently removing equipped `{Mods}`.
* **Nuclear Family Cohesion (Twins), Chain-Link Dependencies & Deep Yeet 2.0:** Bidirectionally pairs script and module twins, auto-equips required frameworks when armed in `Atomic Logic`, and halts master library deletion for cascade confirmation.
* **Immortal Save-Verify-and-Rewind Homestead `{Lab}` & Passive 4-Stage Gate (`deployment.rs`):** Seals live saves inside external `SanctuarySaveVault` + an immortal `{Vault}` Mirror, mounts a fresh **disposable working copy** of the read-only **Golden Baseline** Lab Test Save on every run to audit Stage 4 magic-byte save integrity (`audit_save_file_corruption`) before discarding test mutations on teardown, enforces a zero-anti-cheat passive 4-stage timer (4-tick world-load settle gate, `ESC`/pause suspension, native fullscreen PCM `.wav` chimes), and stages isolated single `{Mods}` without collection sibling bleed.
* **Parallel Copy-on-Write (`CoW`) Time Capsule & Additive Save Restore (`backups.rs`):** Multi-threaded `rayon` hardlink + byte-stream snapshots (`World State` & `Engine Core`), Copy-on-Write delta-aware `{Backups} Limit` pruning, and strictly **additive** `World_State` save restoration with Post-Restore / Error `<SidePanel>` summaries.

---

## 5. Security, Zero-Knowledge Auth, Cross-Device Alert Sync & Compliance Protocols

* **OWASP 600k Zero-Knowledge Auth, FIDO2 Passkey Seal & Companion Handshake:** Pairs `600,000`-iteration client-side `PBKDF2-HMAC-SHA256` + server-side `Bcrypt` and `600k` blinded email aliases with a **12-hour Device-Bound Passkey Seal**, macOS Touch ID, 1-click Passkey/Recovery-Key account recovery, and **Live Companion Passkey Handshakes** over W3C Background Web Push.
* **Zero-PII Cross-Device Notification Deduplication & Per-Spoke Muting (`notification_state_sync`):** Synchronizes encrypted alert dismissal tokens via `citizen_staging_queue` so OS notifications, broadcasts, DEFCON warnings, and the **Command Center Global Alert Tile** fire at most once per alert per account across all rigs, paired with per-category `Enabled Workspaces` Spoke muting.
* **Proactive Zero-PII Scrubber & Tier 0 Known-Hash Architect Gate:** Redacts OS paths, usernames, IPs, MACs, SIDs, HWIDs, and emails across Windows, macOS, Linux, and Proton logs, and restricts Architect diagnostic/support submissions strictly to verified Tier 0 catalog hashes (`enforceArchitectSubmissionCompliance`).
* **Dual-Tier 21+17 Multi-Format Heuristic Scanner & Quarantine Lockdown:** Scans archives, binary streams (Zlib/Zstd), scripts, and `.pyc` bytecode against Core and Spoke regex sets, locking the OS shell behind `MalwareAlertModal` until Citizen-signed **Secure Shred**.
* **Florida Compliance Tiers 1–4 & `Pending` Confirmation Guard (`SAComplianceOversight.tsx`):** Permits Tiers 1–4 in local Vaults and Static Edge manifests while routing all Citizen and Architect Tier 1–4 flags into **`Oversight > Compliance` as `Pending`**—guarding `trg_purge_flagged_hash_from_blueprints` so Cloud Blueprints are stripped only once confirmed by `Oversight` or `Wayfinder`.
* **Next-Desktop-Open & Offline DEFCON Network Shield (`useDefconRadar.ts`):** Evaluates active Spoke lockdowns, missed `audit_logs` DEFCON 1 alerts, and 100% offline local game updates via `ripGameVersion` immediately on Desktop startup (`Auto Backup`, `Alert`, or `Lone Wolf`), alongside the privacy-first domain-salted SHA-256 `hardware_bans` Nuclear Override ledger.

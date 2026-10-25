# Sanctuary OS — Master Protocol List & 6-Tier Clearance Matrix

---

## 1. The 6-Tier Clearance & Role Inheritance Matrix

Sanctuary OS decouples **Core OS Hub Clearances (`osRole`)** from **Game Spoke Clearances (`userRole`)** across 6 distinct operational tiers:

* **Tier 1 — Citizen (`userRole = 'citizen'` • Inherits Open Mason Workshop):**
  * Full access to all 9 Citizen modules (`Command Center`, `Your Vault`, `The Nexus`, `Blueprints`, `Comm-Link Feed`, `Conflict Radar`, `Homestead Lab`, `Citizen's Workbench`, `Time Capsule`).
  * **Inherited Open Mason Workshop:** Every Citizen inherits full local access to the **Mason Workshop** (`Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Chameleon Theme Forge`, `Notepad`, and `Static Edge Release Packaging` for generating `manifest.json` & `override.json` bundles).
  * Can publish Blueprints, Lexicons, Chameleons, and Workbench Templates to The Nexus, and submit new mod discoveries to the crowd-sourced **Scout Queue**.
* **Tier 2 — Verified Mason (`userRole = 'mason'` / `isVerifiedMason = true` • Separate Verified Creator Tier):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault**.
  * Unlocks **Direct Nexus Artifact Publishing**, the **Verified Mason Queue Fast-Lane** (bypassing the `min_scout_submissions` Scout firewall), **Public Mason Profile & Featured Showcase Assignment**, **Creator Comm-Link Dispatches**, **Direct Bug Report Dossiers**, and the **0%-Cut Supporter Bridge** (Patreon/Ko-fi auto-stacking).
* **Tier 3 — Architect (`userRole = 'architect'` • Registry & Conflict Moderator):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault**.
  * Unlocks the **Architect Console** (`Unified 3-Tile Artifact Studio` for global registry entries, `Verified Mason Queue` & `Scout Queue` triage, global `Conflict Matrix` Severity 1–4 directive authoring, `Check Hash & Deep Heuristic Scanner`, `Template Oversight`, `Nexus Reports Queue`, and claimable `Citizen Support Desk` tickets).
* **Tier 4 — Oversight (`userRole = 'oversight'` • Spoke Security & Systems Administrator):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault**.
  * Unlocks **Oversight Command** (`Spoke Heuristic Signatures` authoring, `Compliance Tier 5 Malware Flagging`, `Emergency DEFCON 1 Lockdown Override`, `Spoke Identity Matrix` role governance up to Architect, `Game Patch & DLC Registration`, `Mass Registry Batch Updater`, and `Mason Profile Linker`).
* **Tier 5 — Wayfinder (`userRole = 'wayfinder'` • Community Manager & Spoke Sovereign):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault**.
  * Unlocks **Wayfinder Operations** (full `Spoke Identity Matrix` authority up to Wayfinder, `Spoke Uplink & Sovereignty` with `SANCTUARY-UPLINK://` bundle export and live API key rotation, unilateral **"Cut the Cord" Bilateral Severance**, `The Dispatch` community broadcasts with 2x2 telemetry headers and interactive polls, `Game Audit Logs`, and `Keeper Support Escalation`).
* **Tier 6 — Keeper (`osRole = 'keeper'` • Core OS Hub & Sanctuary Foundry Developer):**
  * Protected by the **FIDO2 Passkey & TOTP Security Vault**.
  * Unlocks **Keepers Core** on both the Foundry Landing Page and all workspaces (`Turnkey Spoke Onboarding`, `Core Heuristics Oversight`, `Master Game Schemas`, `Global Lexicon & Chameleon Registries`, `Foundry News & Release Notes`, **Bilateral Codebase-to-Keepers-Core Directives Sync**, and immutable `Global Audit Logs`).

---

## 2. System Foundation, Hub-and-Spoke & Bilateral Sync Protocols

* **The Cartographer:** Automated first-boot reconnaissance system that locates the Game Bin, live Mods directory, and external Vault archive path.
* **Turnkey Spoke Uplink Handshake (`SANCTUARY-UPLINK://`):** 1-click onboarding protocol (`verify_and_bootstrap_spoke` on `game-gateway`) that validates all 36 tables in `schema.sql`, seeds `global_network_status`, and auto-provisions the community's **Founding Wayfinder**.
* **Bilateral Severance Protocol ("Cut the Cord"):** Self-service sovereignty protocol (`sever_spoke_cord`) executable by either a Keeper or a Spoke's Wayfinder. Writes an immutable severance record to both Hub and Spoke `audit_logs`, sets `is_active = false`, and permanently scrubs (`NULL`s) the Spoke's `supabase_service_key` from the Hub while leaving 100% of the community's database intact.
* **Single-File Standalone Fork Protocol (`src/supabase.ts`):** Allows any community to fork Sanctuary OS against a single `schema.sql` Supabase project by editing only `SANCTUARY_CONFIG` in `src/supabase.ts`, routing all `secure_*` RPCs directly without Edge Functions.
* **Bilateral Codebase-to-Keepers-Core Directive Sync (`public.system_directives`):** Automatically synchronizes all 5 core documentation directives (`Citizen Guide.md`, `Phase Roadmap.md`, `Sanctuary OS Forking & Architecture Guide.md`, `Master Architecture & Feature Document.md`, `Master Protocol List.md`) two ways between the local repository `.md` files and **Keepers Core -> System Directives**.
* **System Version Ripper (`pelite`):** In-process Rust PE parser that extracts genuine patch versions directly from `.exe` headers without spawning subprocesses.
* **Agnostic Schema Protocol (`sanctuary_schemas`):** Zero hardcoded file extensions or game paths in Rust; all rules, parsers, and load order strategies are driven by declarative JSON schemas.

---

## 3. Vault Airgap, Static Edge & Mod Management Protocols

* **Symlink Airgap 2.5:** Projects mods from the isolated `Vault/Mods/` archive into the live game directory via zero-copy OS symlinks.
* **Decentralized Static Edge Polling (`manifest.json` & `override.json`):** Binds a mod's SHA-256 hash lineage in `.sanctuary_cache.db` and polls creator HTTP endpoints directly during Radar Sweeps for decentralized updates and `atomic_logic`.
* **Mod Suite Parent Grouping:** Automatically groups multi-file mod suites (e.g., *MC Command Center* and its submodules, or `.package` + `.ts4script` twins) into a single clean Parent Card with an expandable `{N} Linked Modules` drawer.
* **Unified 3-Tile Artifact Studio:** Standardized 3-step workflow (`Details & Versions`, `Files & Folders`, `Rules & Upload`) across both the Mason Workshop and Architect Console.
* **Reimagined Citizen's Workbench & Visual Timeline Diff:** 2-column 60 FPS Visual Config Editor with category pills, `Min`/`Max` range steppers, a No-Code Visual Template Builder, and a **2-Column Interactive Timeline & Diff Workspace** (Visual Diff + Raw Monaco Diff).
* **Integrated Side Browser Interception:** Intercepts `.zip`, `.rar`, `.7z`, `.package`, `.ts4script`, and `override.json` downloads inside the built-in browser and routes them directly into the Vault scanner.

---

## 4. Stability, Load Order & Atomic Logic Protocols

* **Schema-Driven Load Order Engine (`compileLoadOrder`):** Compiles deployment priority using `folder_priority` (dynamic `Resource.cfg` + `Sanctuary1`–`Sanctuary3` override folders), `manifest_list` (`loadorder.txt`/`plugins.txt`), `numeric_prefix`, or `timestamp`, complete with topological sorting and DFS circular-loop breaking.
* **Conflict Radar Casual vs. Advanced Mode:** Casual Mode provides 1-click "Pick a Winner" resolution for Severity 3 Tuning Overlaps; Advanced Mode unlocks directional `Must Load After`/`Before` rules and Priority Tier pills.
* **The Highlander Rule:** Automatically evicts rival Flavor files when equipping a chosen Flavor.
* **Nuclear Family Cohesion (Twins):** Bidirectionally links companion `.package` and `.ts4script` files so they equip and unequip together.
* **Recursive Dependencies (Chain-Link) & Deep Yeet 2.0 (Cascade Removal):** Automatically equips required master mods when enabling an add-on, and intercepts master mod deletion to queue all dependent child mods.
* **100% Nuke Injection & 1v1 Stability Arena (Homestead Lab):** Strips active symlinks to test suspect mods or head-to-head conflicts in total isolation while monitoring live crash logs.
* **Incremental Hardlink Time Capsule & Differential Rollback:** Snapshots `World State` (Saves/Settings) and `Engine Core` (Game Binaries) using OS hardlinks and restores via differential byte comparison.

---

## 5. Security, FIDO2 Passkeys, Compliance & Quarantine Lockdown Protocols

* **FIDO2 Passkey & TOTP Security Vault (`SecurityVaultSidePanel`):** Requires hardware-bound WebAuthn/FIDO2 Passkeys or TOTP verification for all Elevated Clearances (`Verified Mason` through `Keeper`), locking Elevated Hubs inside a right-hand SidePanel until verified.
* **Dual-Tier Multi-Format Heuristic Scanner:** Merges global **Core Heuristics** (`keeper_heuristic_signatures`) and community **Spoke Heuristics** (`heuristic_signatures`) to scan ZIP containers, raw binaries, UTF-16LE strings, and `.pyc`/`.pyo` bytecode symbol chains.
* **Full-OS Quarantine SidePanel Lockdown & External Secure Shred (`MalwareAlertModal`):** Confirmed Tier 5 Malware locks the entire OS shell (Sidebar, Top Bar, and Dock), queues multiple drops asynchronously without UI freezing, displays the exact **Triggered By** rule (Known Hash or Heuristic Hit reason) and **Detection Source** (`Spoke Registry • <Game>` or `Sanctuary Foundry`), and requires a **Citizen's Signature** to execute a destructive multi-pass **Secure Shred** in Rust.
* **Florida Compliance Tiers 1–4 & Blueprint Auto-Purge:** Permits Tiers 1–4 in local Vaults while scrubbing them from public Nexus feeds and automatically stripping flagged hashes from Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`).
* **DEFCON 1 Network Shield:** Real-time Supabase listener on `global_network_status` that intercepts game launches during breaking game patches and forces a Pre-Patch Time Capsule snapshot.
* **The Nuclear Override & Decoupled `hardware_bans`:** Revealed by clicking the System Preferences subtitle 5 times; bypasses local quarantine at the cost of recording the machine's hardware hash in the decoupled `hardware_bans` ledger on the Core OS Hub, permanently revoking cloud access without tracking hardware IDs on standard users.

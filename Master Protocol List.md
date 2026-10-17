# Sanctuary OS
## Master Protocol List

**Document Version:** V5.7  
**Last Updated:** October 17, 2026  

### System Foundation, Hub-and-Spoke & Setup
* **The Cartographer:** An automated reconnaissance system that scans for the Game Bin and Mods directory on first boot.
* **Turnkey Spoke Uplink Handshake (`SANCTUARY-UPLINK://`):** A 1-click onboarding protocol (`verify_and_bootstrap_spoke` on `game-gateway`) that parses a community's Supabase URL, Anon Key, and Service Role Key, verifies that all required tables from `schema.sql` are present, seeds `global_network_status`, and automatically provisions the community's **Founding Wayfinder** on the Spoke database.
* **Bilateral Severance Protocol ("Cut the Cord"):** A self-service sovereignty protocol (`sever_spoke_cord` on `game-gateway`) executable by either a Core OS Keeper or a Spoke's Wayfinder. Logs an immutable severance record to both Hub and Spoke `audit_logs`, deactivates the workspace on the Hub (`is_active = false`), and permanently scrubs the Spoke's `supabase_service_key` from the Hub while preserving 100% of the community's Spoke database.
* **Hub-and-Spoke Identity Decoupling:** Enforces zero PII/credential bleeding between the Core OS Hub (`profiles` storing `id`, `username`, `email`, and global `citizen`/`keeper` role) and Game Spokes (`profiles` storing only `id`, `username`, game-specific `role`, and ban flags, synced via `secure_sync_spoke_profile`).
* **DNA & Delta Caching:** SHA-256 hashing for all artifacts in the Vault, paired with an mtime-first SQLite delta cache (`.sanctuary_cache.db`).
* **Nested Hierarchy:** The Vault automatically deploys and enforces a strict path hierarchy: `Backups/World` (Purple State), `Backups/Engine` (Pink State), `Data/Cache`, `Blueprints/`, `Quarantine/`, and `Mods/` (secure artifact storage).
* **System Version Ripper:** A schema-driven native Rust PE parser (`pelite`) that extracts genuine patch version metadata directly from the active game executable (`.exe` file properties) without subprocess overhead, falling back to schema-defined `.ini` manifests when needed.
* **Agnostic Protocol:** Zero game-specific file extensions or paths hardcoded in the source code; all game rules, paths, and load order strategies are driven by external Master Schema JSONs.

### Mod Management, Static Edge & Organization
* **Decentralized Static Edge Polling (`manifest.json` & `override.json`):** Allows creators to package mods with a static `manifest.json` and `override.json` (`export_edge_release`). Sanctuary binds the mod's SHA-256 hash lineage in SQLite and polls the creator's static HTTP endpoint during Radar Sweeps to deliver decentralized update alerts and inject `atomic_logic` without requiring centralized database entries.
* **Open Mason Workshop vs. Verified Mason Queue Firewall:** Opens local Workshop tools (`Sandbox`, `IDE`, `Chameleons`, `Notepad`, `Export Release`) to all Citizens while gating direct Nexus publishing and the **Verified Mason Queue** behind `isVerifiedMason`. Unverified network submissions route to `scout_suggestions` and must pass the Master Schema `min_scout_submissions` threshold before appearing in the Architect Scout Queue.
* **Vault Sanitization:** A self-healing directory sweeper that verifies core directories, vacuums stray `.zst` archives into `Backups/World`, and prunes empty dead directories without forcing a rigid "one mod, one folder" rule.
* **Filename Sanitization:** Automatically cleans raw filenames (e.g., `more_cas_columns_v4.package` becomes `More Cas Columns`).
* **Manual Download Assistant & Side Browser Interception:** The Integrated Side Browser automatically intercepts mod downloads (`.zip`, `.package`, `.ts4script`, `.rar`, `.7z`, `.tar.zst`, `override.json`) and routes them directly into the Vault.
* **Symlink Airgap 2.5:** Creates physical folder structures in the game’s live directory while projecting actual artifacts via high-speed symlinks.
* **100% Nuke Injection:** The Homestead Lab wipes all active symlinks and injects only the isolated test subjects and their mandatory dependencies.
* **Automated Exception Log Purge:** The `launch_game` Rust sequence automatically scans the game directory and purges stale exception logs right before ignition.
* **Duplicate & Override Intercept:** Intercepts duplicate SHA-256 hashes or bundled `override.json` manifests via the DNA Match Side Panel to allow instant replacement, ignoring, or static manifest binding.

### Stability, Load Order & Conflict Resolution
* **Schema-Driven Load Order Engine (`compileLoadOrder`):** Dynamically compiles mod deployment order using the active schema's strategy (`folder_priority` with dynamic `Resource.cfg` and multi-tier override folders, `manifest_list` for `loadorder.txt`/`plugins.txt`, `numeric_prefix`, or `timestamp`), complete with topological sorting and DFS circular-rule detection.
* **Conflict Radar Casual vs. Advanced Mode:** Casual Mode offers 1-click "Pick a Winner" conflict resolution, while Advanced Mode unlocks directional dependency rules (`Must Load After` / `Must Load Before`), 1-click **Break Loop** cycle resolution, and inline **Priority Tier** assignment.
* **Anti-Flip Protection:** Enhances requirement solvers to respect manual flavor selections (test/beta versions).
* **The Highlander Rule:** Automatically evicts rival mods when equipping a competing "Flavor."
* **Nuclear Family Cohesion (Twins):** Bidirectional logic ensures that equipping a script file automatically pulls in its companion package file.
* **Recursive Dependencies (Chain-Link):** Equipping an Addon auto-equips its Master record or prompts to locate it on The Nexus.
* **Deep Yeet 2.0 (Cascade Removal):** Removing a Master mod alerts the user and queues all downstream dependent artifacts for removal.
* **Conflict Severity 1–4 Collisions:** Categorizes overlaps from Severity 1 (Minor) and Severity 2 (Duplicate) to Severity 3 (Tuning Overlap with Load Order winner routing) and Severity 4 (Fatal Engine Clash).
* **Ghosted States:** Visually ghosts broken or incompatible mods with diagnostic hovertips (`MISSING DLC`, `VERSION MISMATCH`, `COLLISION SEVERITY 3/4`).
* **1v1 Stability Protocol:** Pits two conflicting mods against each other in the Homestead Lab while monitoring engine logs in real time.

### Security & Compliance
* **Dual-Role Authorization Protocols:** Elevated Hubs strictly evaluate `osRole` (Global OS Permissions for Keepers) and `userRole` (Game Workspace Permissions for Wayfinders, Oversight, Architects, and Masons).
* **Dual-Tier Multi-Format Heuristic Scanner:** Merges global **Core Heuristics** (`keeper_heuristic_signatures` managed by Keepers) and community **Spoke Heuristics** (`heuristic_signatures` managed by Oversight) to scan ZIP archives, raw binaries, UTF-16LE wide strings, and compiled Python `.pyc`/`.pyo` bytecode symbol chains across all file formats.
* **Citizen’s Signature:** High-stakes confirmation gate required for all permanent destructive file operations.
* **The Quarantine Zone:** A dedicated bio-hazard sector for isolated malicious artifacts.
* **Florida Compliance Layer & Blueprint Auto-Purge:** Compliance Tiers 1–4 (Explicit, Illicit, Extreme Violence, Taboo) are permitted for local Vault storage but scrubbed from public Nexus feeds and automatically stripped from public Cloud Blueprints via `trg_purge_flagged_hash_from_blueprints`. Tiers 3–5 trigger a **Vault Lock** restricting support submissions, while Tiers 1–2 allow support tickets with automated "Dirty Log" sanitization.
* **The DEFCON System:** A real-time `global_network_status` listener via Supabase that detects game patches (DEFCON 1) and triggers automated Pre-Patch Snapshots before game launch.
* **Zero-Choice Lockdown & External Secure Shred:** Confirmed Tier 5 Malware halts the OS and prompts for a Citizen's Signature to execute a destructive byte-level overwrite and removal via the Rust backend, routing an anonymous Quarantine Manifest to Oversight Command.
* **The Nuclear Override & Privacy-First `hardware_bans`:** Revealed by clicking the System Preferences subtitle 5 times. Engaging it records the user's hardware hash into the decoupled `hardware_bans` ledger on the Core OS Hub (and syncs bans to Spokes via `secure_sync_hub_ban_to_spokes`), permanently severing cloud access without tracking hardware IDs on standard user profiles.

### User Interface, Dispatches & Experience
* **Glassmorphism V3 & Portal Glass Fix:** Standardized `.glass-panel`, `.glass-surface`, and `.portal-glass-fix` material rules across all cards, TitleBar capsules, Notification Docks, and portaled popovers/dropdowns/tooltips so the active Chameleon theme wallpaper shines through with deep frosted blur and specular borders.
* **Built-In Dispatch Telemetry Header & Interactive Polls:** Automatically renders a 2x2 glassmorphic metadata header (`Alert Type`, `Affected Target` with hover list, `Severity`, `Action Required`) at the top of all Keeper and Wayfinder System Dispatches, paired with live single-choice and multi-choice community polls (`dispatch_poll_votes` / `keeper_dispatch_poll_votes`).
* **Top `StatTileCarousel` & Persistent `ActionPill` Hub Utilities:** Standardized top-row `StatTileCarousel` navigation across all views and hubs, paired with a unified `ActionPill` that houses search, `MobileFilterGroup` bottom-sheet filters, and persistent Hub utilities (`Notepad`, `Mason Settings`, `View Profile`, `Check Hash`).
* **Local Override Layer & Offline Metadata Persistence:** Decouples the Mod Dossier from the cloud for custom names, URLs, tags, and static `manifest.json` links, and embeds custom `modMeta` plus workspace `game_id`/`game_name` directly inside exported Blueprints.
* **The Side Panel Ecosystem:** Handles all complex editors, inspections, and diagnostics inside non-intrusive Side Panels using top-right `headerActions` (`PanelHeaderGroup` / `PanelHeaderButton`) with two-step confirmation for destructive actions.
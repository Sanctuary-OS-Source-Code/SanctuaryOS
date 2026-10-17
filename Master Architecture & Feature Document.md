**Sanctuary OS**
# Master Architecture & Feature Document

**Document Version:** V5.7  
**Last Updated:** October 17, 2026  

Welcome to Sanctuary OS,

Sanctuary OS is a local-first mod operations layer and desktop middleware for mod ecosystems. It relies on a "no asset hosting / metadata-only / offline-first" philosophy.

---

## **Technology Stack & Hub-and-Spoke Architecture**
Sanctuary OS is built on a highly modular, decoupled Hub-and-Spoke architecture:

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4 (`@layer base` / `@layer utilities` with Frosted Glassmorphism V3).
- **State Management:** Zustand (Global State, Persistent Hub Actions, & UI Overlays) with automatic `localStorage` quota recovery (`safeLocalStorageSetItem` & `purgeBloatedLocalStorage`).
- **Desktop Framework:** Tauri V2 (Handles native file-system operations, symlinking, hardlink incremental backups, and multi-format binary/archive scanning in Rust).
- **Backend / Hub-and-Spoke Databases:**
  - **Core OS Hub Database (`schema_os.sql`):** Hosts global authentication (`auth.users`), privacy-first user identity (`profiles` restricted to `citizen` and `keeper`), `sanctuary_games` Spoke registry, `keeper_heuristic_signatures`, `keeper_system_broadcasts`, `keeper_dispatch_poll_votes`, and the decoupled `hardware_bans` ledger.
  - **Game Spoke Databases (`schema.sql`):** Independent, community-owned PostgreSQL instances hosting game-specific `mods`, `masons`, `blueprints`, `conflicts`, `system_broadcasts`, `dispatch_poll_votes`, `heuristic_signatures`, and Spoke `profiles` (storing only `id`, `username`, `role`, and ban flags—zero email or auth credential bleed).
  - **Edge Gateway & Magic Proxy (`game-gateway` v7 & `src/supabase.ts`):** Secures cross-database mutations without exposing Spoke `supabase_service_key` secrets to the client. Supports turnkey `SANCTUARY-UPLINK://` onboarding (`verify_and_bootstrap_spoke`), live key rotation (`update_spoke_uplink`), and bilateral community severance (`sever_spoke_cord` / "Cut the Cord").
- **Rust Core Capabilities:** Ultra-fast hardlink snapshot pipelines, native PE executable version extraction (`pelite`), universal multi-format heuristic scanning, and decentralized Static Edge Manifest (`manifest.json` / `override.json`) packaging and polling.

---

## **Governance, Turnkey Onboarding & Workspace Roles**
Sanctuary OS enforces a strict architectural split between Global OS Permissions (`osRole`) and Game Workspace Permissions (`userRole`):
- **`osRole` (Core OS Hub):** Grants global permissions across the entire OS (`citizen`, `keeper`).
- **`userRole` (Game Spoke Workspace):** Grants game-specific permissions dynamically evaluated based on the active workspace (`citizen`, `mason`, `architect`, `oversight`, `wayfinder`).
- **Sanctuary Foundry & Keepers:** The core organization and developers maintaining the Sanctuary OS platform, global schemas, `keeper_heuristic_signatures`, and the `game-gateway` Edge infrastructure.
- **Wayfinders:** Community Managers with full administrative sovereignty over their Game Spoke. Wayfinders manage the full Spoke Identity Matrix, initiate DEFCON events, broadcast via The Dispatch (with built-in telemetry headers and interactive polls), rotate Spoke credentials, and hold unilateral authority to **Cut the Cord** (`secure_sever_spoke_cord`) to sever their Spoke database from the Hub at any time.
- **Oversight:** System Administrators who manage Spoke compliance, Spoke Heuristic Signatures, Game/DLC patch registration, and Spoke Identity Matrix roles up to `architect`.
- **Architects:** System moderators responsible for maintaining the Conflict Matrix, reviewing the **Verified Mason Queue** fast-lane and the **Scout Queue** (gated by the `min_scout_submissions` crowd-sourced threshold), and resolving Citizen Support Desk tickets.
- **Masons (Verified & Open Workshop Tiers):** Mod Creators. All authenticated Citizens can access the local **Open Mason Workshop** (`Sandbox`, `IDE`, `Chameleons`, `Notepad`, and `Export Release` for static `manifest.json`/`override.json` packaging), while **Verified Masons** unlock direct Nexus asset publishing and the Verified Mason Queue fast-lane.
- **Citizens:** The core population. Everyday players who curate Blueprints, vote in Dispatch Polls, perform field-testing, and provide crowdsourced telemetry.

---

## **Vault Storage, Sanitize 2.0 & Decentralized Static Edge Polling**
The Vault acts as a secure, containerized archive that is never touched directly by the game engine.
- **Nested Hierarchy:** The Vault automatically deploys and enforces a strict path hierarchy:
  - `Backups/World` (Purple State) & `Backups/Engine` (Pink State)
  - `Data/Cache` (`.sanctuary_cache.db` SQLite delta & edge lineage cache)
  - `Blueprints/`
  - `Quarantine/`
  - `Mods/` (The secure storage of artifacts)
- **Vault Sanitization:**
  - **Infrastructure Enforcement:** Instantly verifies and re-generates missing core directories.
  - **Backup Vacuuming:** Automatically detects stray `.zst` backup archives dropped in the root of the Vault and files them into `Backups/World`.
  - **Dead Folder Sweeping:** Recursively scans your active Library to prune empty directories left behind by uninstalls or file movements.
  - **Filename Sanitization:** Automatically cleans messy filenames into human-readable display titles.
- **Decentralized Static Edge Polling (`manifest.json` & `override.json`):**
  - Creators can export releases from `MasonSandbox` or `ModDossier` (`export_edge_release`), generating a `<mod>_v<version>.zip` bundle alongside a static `manifest.json` and `override.json`.
  - When a Citizen ingests a mod containing `override.json` (or manually links a `manifest_url` in the Local Dossier), Sanctuary binds the mod's SHA-256 lineage (`target_hash`, `archive_hashes`, `previous_hashes`) in `.sanctuary_cache.db`.
  - During Radar Sweeps and boot checks, Sanctuary polls registered `manifest_url` endpoints via HTTP `GET`, surfacing update alerts and injecting creator `atomic_logic` (`required_dlc`, `dependencies`, `addons`, `twins`, `flavors`, `conflicts`) directly into the local Conflict Radar with zero centralized database dependency.
- **Local Override Layer:** The Mod Dossier is completely decoupled from the Cloud for local customization. Users can natively edit Mod Names, Authors, URLs, Static Manifest URLs, Cover Images, and Custom Tags.
- **The Scout Dossier:** Unidentified artifacts can be submitted to the community Scout Queue or permanently marked `FLAG AS LOCAL` to opt out of global syncs.
- **Download Interception:** The Integrated Side Browser automatically intercepts mod downloads (`.zip`, `.package`, `.ts4script`, `.rar`, `.7z`, `.tar.zst`, `override.json`) and routes them directly into the Vault.

---

## **The Airgap, Cartographer & Dynamic Load Order Engine**
Sanctuary OS acts as a deeply integrated middleware operating system rather than a simple file manager.
- **The Cartographer:** Automated reconnaissance system that locates the Game Bin and Mods directory on first boot.
- **Symlink Air Gap 2.5:** Projects artifacts into the game's live directory via high-speed symlinks, ensuring zero data bloat in the game's live folder.
- **Schema-Driven Load Order Engine (`compileLoadOrder`):**
  - Declaratively configured per game via the Master Schema's `load_order` block (`strategy` and `priority_tiers`).
  - Supports `"folder_priority"` (generating dynamic `Resource.cfg` files and routing winners across multi-tier override directories), `"manifest_list"` (writing ordered `loadorder.txt` / `plugins.txt` manifests), `"numeric_prefix"` (`{index:03}_`), and `"timestamp"`.
  - Features a topological sort and DFS cycle-detection compiler that resolves directional dependency rules (`Must Load After` / `Must Load Before`) alongside **Casual Mode** (1-click "Pick a Winner") and **Advanced Mode** (interactive **Quick Rule Builder**, **Break Loop** cycle resolution, and **Priority Tier** pills).
- **Engine Version Recognition:** Natively extracts genuine patch version metadata directly from the active game executable (`.exe` PE headers) using an in-process Rust PE parser (`pelite`), falling back to schema-defined `.ini` manifests when needed.
- **Dynamic Config Watcher:** A non-blocking background watcher monitors the game path for changes to `.cfg`, `.ini`, and `.json` files, automatically syncing them back to the Vault.

---

## **Atomic Logic & Conflict Management**
The Nexus Database and Static Edge Manifests use SHA-256 DNA signatures to handle complex mod interactions through Atomic Logic:
- **The Highlander Rule:** Automatically evicts rival mods when equipping a specific "Flavor" of an artifact.
- **Nuclear Family Cohesion (Twins):** Bidirectional logic ensures that equipping a script file automatically pulls in its companion package file.
- **Recursive Dependencies (Chain-Link):** Equipping an Addon auto-equips its Master record or prompts the Citizen to locate missing dependencies on The Nexus.
- **Deep Yeet 2.0 (Cascade Removal):** Removing a Master mod alerts the user and queues all downstream dependent artifacts for removal.
- **Conflict Severity 1–4 Collisions:** Categorizes collisions from Severity 1 (Minor Overlap) and Severity 2 (Duplicate File) up to Severity 3 (Tuning Overlap resolved via Load Order winners) and Severity 4 (Fatal Engine Clash).
- **DLC Ghosting:** Mod cards automatically cross-reference owned/masked DLC and enter a "Ghosted" state with diagnostic hovertips if requirements are missing.
- **The Copilot Philosophy:** The system identifies cascades and conflicts, but always halts for a Citizen's Signature before executing destructive actions.

---

## **Testing, Diagnostics & Time Capsule**
- **Homestead Diagnostics:**
  - **100% Nuke Injection:** Wipes active symlinks and injects only the isolated test subjects and their mandatory dependencies.
  - **1v1 Stability Protocol:** Pits two conflicting mods against each other while monitoring engine crash logs in real time.
- **Time Capsule:**
  - **Dual Snapshots:** Independently snapshots Game Saves (`World State`) and Core Binaries (`Engine Core`).
  - **Hardlink-Based Incremental Backups:** Unchanged files are linked via native OS hardlinks rather than duplicated, yielding near-instant, minimal-footprint backups.
  - **Differential Rollback Safety:** Intelligently compares the live state to the backup snapshot, removing rogue files and restoring modified data with 100% timeline integrity.

---

## **Security, Dual-Tier Heuristics & The Nuclear Override**
- **Compliance Tiers 0–4:** Tier 0 artifacts are public-safe. Tiers 1–4 (Explicit, Illicit, Extreme Violence, Taboo) are permitted in local Vaults but scrubbed from public Nexus feeds and automatically purged from Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`). Tiers 3–5 trigger a **Vault Lock** restricting support ticket submissions, while Tiers 1–2 remain eligible for support with automated "Dirty Log" sanitization.
- **Dual-Tier Multi-Format Heuristic Scanner & Tier 5 Malware:**
  - Merges **Core Heuristics** (`keeper_heuristic_signatures`) and **Spoke Heuristics** (`heuristic_signatures`) to inspect ZIP containers (`.zip`, `.ts4script`, `.jar`, `.pak`), raw binary windows (`.package`, `.dll`, `.asi`, `.exe`), UTF-16LE wide strings, and compiled Python `.pyc`/`.pyo` bytecode symbol chains.
  - Confirmed Tier 5 Malware triggers a **Zero-Choice Lockdown** and prompts for an explicit Citizen's Signature to execute a **Secure Shred** (destructive byte-level overwrite and removal via Rust).
- **The Nuclear Override & `hardware_bans`:** Clicking the System Preferences subtitle 5 times reveals the Nuclear Override. Engaging it records the user's hardware signature hash into the decoupled `hardware_bans` table on the Core OS Hub (and syncs the ban across Spokes via `secure_sync_hub_ban_to_spokes`), permanently severing cloud access without tracking hardware IDs on normal users.

---

## **Interface, Glassmorphism V3 & Lexicon Framework**
- **Chameleon Protocol & Glassmorphism V3:** Authentic frosted glass material architecture (`.glass-panel`, `.glass-surface`, and `.portal-glass-fix` with directional specular borders, deep backdrop blur, and an interactive Background Builder + live Holo Sandbox).
- **Lexicon Protocol (Word-as-a-Service):** Zero hardcoded strings. All UI copy and icons route through dynamic JSON dictionaries (`en-default.json`, `en-sanctuary.json`, `en-sims.json`, `Simlish.json`) with automatic `localStorage` quota protection.
- **Built-In Dispatch Metadata Header & Interactive Polls:** System Dispatches from Keepers and Wayfinders automatically render a 2x2 glassmorphic telemetry header (`Alert Type`, `Affected Target` with hover list, `Severity`, and `Action Required`) and support live single-choice or multi-choice community polls (`dispatch_poll_votes` & `keeper_dispatch_poll_votes`).
- **Standardized Navigation & Side Panels:** All 7 primary views and 5 Elevated Hubs use `StatTileCarousel` + `DashboardStatTile` navigation, `ElevatedHubLayout`, `UniversalCard`, persistent `hubActions` in `ActionPill` (`Notepad`, `Mason Settings`, `View Profile`, `Check Hash`), and top-right `SidePanel` `headerActions`.
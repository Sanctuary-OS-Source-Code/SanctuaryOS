# Sanctuary OS — Master Architecture & Feature Document

Sanctuary OS is a local-first mod operations layer, desktop middleware, and decentralized Hub-and-Spoke ecosystem built on a strict **"no asset hosting / metadata-only / offline-first / 0% platform tax"** architecture.

---

## Pillar 1: Core Stack & Zero-Tearing Liquid Glass Engine

Sanctuary OS pairs a native Rust systems backend with a 60+ FPS reactive glassmorphic UI:
- **Frontend Runtime (`React 18 + TypeScript + Vite + Tailwind CSS v4`):**
  - **Zero-Tearing Liquid Glass Optics Engine (`v0.5.8-Dev.3`):** Continuous 3D wallpaper refraction across scrolling views (`Vault`, `Nexus`, `Command Center`, `Workbench`) using `.glass-panel`, `.glass-surface`, and `.portal-glass-fix` with zero tile seams or dark slate rings across both Dark and Light themes.
  - **6 Live Theme Forge Optical Sliders:** Real-time control over **Glass Opacity**, **Refractive Blur**, **Refractive Saturation**, **Rim Light Intensity**, **Specular Glare**, and **Elevation Depth**, paired with an interactive multi-stop Background Builder and Holo Sandbox.
  - **Single Morphing Status Pill (`SystemStatusBar.tsx`):** Consolidates the Status Bar, Notification Dock, and Main Dock into a single centered, auto-tucking Liquid Glass pill that adapts dynamically between the **Foundry Landing Page** (Web quick-scroll mode) and **Mounted Game Workspaces** (Radar Sweep, Vault Lockdown, Blueprint Swap, and live alert counters).
- **State & Lexicon Engine (`Zustand + Lexicon Protocol`):**
  - Global state management with automatic `localStorage` quota protection (`safeLocalStorageSetItem` & `purgeBloatedLocalStorage`).
  - Zero hardcoded text strings: 100% of labels, icons, and messages route through `useLexicon()` across **Standard English (`en-default.json`)**, **Sanctuary Sci-Fi (`en-sanctuary.json`)**, **Sims Friendly (`en-sims.json`)**, and **Simlish (`Simlish.json`)**.
- **Native Desktop Engine (`Tauri v2 + Rust`):**
  - Multi-threaded SHA-256 DNA hashing (`generate_full_dna_hash`), SQLite mtime-first delta caching (`.sanctuary_cache.db`), native PE executable version extraction (`pelite`), symlink projection, hardlink incremental backups (`.tar.zst`), multi-format heuristic scanning, WebAuthn/FIDO2 native bridge, silent in-app update streaming (`download_and_install_update`), and bilateral codebase `.md` directive synchronization (`read_local_directives` / `write_local_directive`).

---

## Pillar 2: Hub, Spokes & Decentralized Static Edge Architecture

Sanctuary OS eliminates centralized lock-in by separating global identity from community-owned game databases and creator-owned static manifests:
- **Core OS Hub Database (`schema_os.sql` — Project `tpsbtaqxlczrysqqmanp`):**
  - Governed by **Keepers Core**. Hosts global SSO authentication (`auth.users`), privacy-first `profiles` (`citizen` | `keeper`), `user_passkeys` (FIDO2 hardware/biometric bindings), `hardware_bans` (decoupled Nuclear Override ledger), `sanctuary_games` (Spoke directory), `sanctuary_schemas`, `system_directives` (bidirectionally synced with repository `.md` files), `keeper_heuristic_signatures`, and `keeper_system_broadcasts`.
- **Community Game Spoke Databases (`schema.sql` — 36 Tables):**
  - 100% owned and hosted by each game community's **Wayfinder**. Stores game-specific `profiles` (storing only `id`, `username`, 5-tier Spoke `role`, and ban flags—zero email or password bleed), `mods`, `mod_versions`, `masons`, `blueprints`, `collections`, `conflicts`, `scout_suggestions`, `heuristic_signatures`, `system_broadcasts`, `dispatch_poll_votes`, `sanctuary_tickets`, and append-only `audit_logs`.
- **Edge Gateway (`game-gateway`) & Single-File Standalone Fork (`src/supabase.ts`):**
  - In **Hub-and-Spoke Mode**, cross-database mutations route through `game-gateway` so Spoke `supabase_service_key` secrets are never exposed to clients. Supports 1-click `SANCTUARY-UPLINK://` onboarding (`verify_and_bootstrap_spoke`) and unilateral **"Cut the Cord"** bilateral severance (`sever_spoke_cord`).
  - In **Standalone Fork Mode**, editing only `SANCTUARY_CONFIG` in `src/supabase.ts` routes all `secure_*` RPCs directly against a single `schema.sql` database with zero Edge Functions or Hub dependencies.
- **Decentralized Static Edge Polling (`manifest.json` & `override.json`):**
  - Creators can export self-contained releases (`export_edge_release`) containing `<mod>_v<version>.zip`, `manifest.json` (version, changelog, SHA-256 hash lineage, `atomic_logic`), and `override.json`. Sanctuary polls creator HTTP endpoints directly during Radar Sweeps—delivering update alerts and conflict/dependency rules with zero database dependency.

---

## Pillar 3: Vault Airgap, Dynamic Load Order, Workbench & Homestead Lab

Sanctuary OS operates as an airgapped middleware layer between mod archives and the live game engine:
- **Symlink Airgap 2.5 & Vault Sanitizer:**
  - Enforces a sterile directory hierarchy inside the Vault (`Mods/`, `Blueprints/`, `Backups/World/`, `Backups/Engine/`, `Quarantine/`, `Data/Cache/`) and projects active mods into the game's live folder via high-speed symlinks.
  - Multi-part mod suites (such as *MC Command Center* and its submodules) coalesce automatically into a single parent card with an expandable `{N} Linked Modules` drawer.
- **Schema-Driven Load Order Compiler (`compileLoadOrder`):**
  - Driven declaratively by the active game's `sanctuary_schemas` definition (`folder_priority` with dynamic `Resource.cfg` and `Sanctuary1`–`Sanctuary3` override tiers, `manifest_list` for `loadorder.txt`/`plugins.txt`, `numeric_prefix`, or `timestamp`).
  - Combines topological sorting and DFS cycle detection with **Casual Mode** (1-click "Pick a Winner" for Severity 3 Tuning Overlaps) and **Advanced Mode** (directional `Must Load After`/`Before` rules and 1-click **Break Loop**).
- **Atomic Logic Engine:**
  - Enforces **The Highlander Rule** (Flavor eviction), **Nuclear Family Cohesion** (bidirectional `.package` + `.ts4script` Twins), **Recursive Chain-Link Dependencies**, **Deep Yeet 2.0 Delete Cascades**, and **DLC/Version Ghosting**.
- **Reimagined Citizen's Workbench & Unified 3-Tile Artifact Studio (`v0.5.8-Dev.3`):**
  - **Citizen's Workbench:** 60 FPS 2-column Visual Config Editor for 430+ setting `.cfg`/`.ini`/`.json` files, 1-click Category Pill Bar, dual `Min`/`Max` range steppers, No-Code Visual Template Builder, and a **2-Column Interactive Timeline & Diff Workspace** (Visual Diff + Raw Monaco Diff).
  - **Unified 3-Tile Artifact Studio:** Standardized across both the **Mason Workshop** and **Architect Console** (`Details & Versions`, `Files & Folders`, and `Rules & Upload`).
- **Homestead Lab & Time Capsule:**
  - **Homestead Lab:** 100% Nuke symlink isolation and 1v1 Conflict Stability testing with real-time exception log capture and PII scrubbing.
  - **Time Capsule:** Incremental hardlink snapshots for **World State** (Saves/Settings) and **Engine Core** (Game Binaries) with differential rollback restoration.

---

## Pillar 4: 6-Tier Governance, FIDO2 Passkey Vault & Malware Lockdown

Security and governance are enforced across 6 clearance tiers and hardware-backed security gates:
- **6-Tier Clearance Hierarchy:**
  1. **Tier 1 — Citizen (`citizen`):** Full access to all 9 Citizen modules **plus inherited access to the local Open Mason Workshop** (`Sandbox`, `IDE`, `3-Tile Artifact Studio`, `Theme Forge`, `Notepad`, `Export Release`) and Scout Queue submissions.
  2. **Tier 2 — Verified Mason (`mason` / `isVerifiedMason`):** Direct Nexus artifact publishing, Verified Mason Queue fast-lane, Public Mason Profile showcase, and 0%-cut Supporter Bridge.
  3. **Tier 3 — Architect (`architect`):** Global Registry curation, Verified Mason & Scout Queue triage (`min_scout_submissions`), global Conflict Matrix directives, `Check Hash` deep scan utility, and Citizen Support Desk.
  4. **Tier 4 — Oversight (`oversight`):** Spoke Heuristic Signatures management, Tier 5 Malware flagging, Emergency DEFCON 1 triggers, Game/DLC patch registration, and Spoke Identity Matrix governance (up to Architect).
  5. **Tier 5 — Wayfinder (`wayfinder`):** Full Spoke Sovereignty, Identity Matrix governance (up to Wayfinder), `SANCTUARY-UPLINK://` management, unilateral **"Cut the Cord"** severance, and **The Dispatch** (with 2x2 telemetry headers & community polls).
  6. **Tier 6 — Keeper (`keeper` on Core Hub):** Global OS Hub governance, Turnkey Spoke Onboarding, Core Heuristics (`keeper_heuristic_signatures`), Master Schemas, Global Lexicons/Chameleons, Bilateral System Directives Sync, and Global Audit Logs.
- **FIDO2 Passkey & TOTP Security Vault (`SecurityVaultSidePanel`):**
  - Elevated clearances (`Verified Mason` through `Keeper`) require a bound FIDO2 Passkey (Windows Hello, Touch ID, YubiKey) or TOTP authenticator. Unverified sessions lock only the Elevated Hub view behind the right-hand `SecurityVaultSidePanel` while keeping Citizen views accessible.
- **Dual-Tier Heuristic Scanner & Full-OS Quarantine SidePanel Lockdown (`MalwareAlertModal`):**
  - Merges **Core Heuristics** (Keepers) and **Spoke Heuristics** (Oversight) to inspect ZIP containers, raw binaries, UTF-16LE strings, and compiled `.pyc`/`.pyo` bytecode symbol chains, with an asynchronous queue so back-to-back malware drops never freeze the UI.
  - Confirmed Tier 5 Malware locks the **entire OS shell** (Sidebar, Top Bar, and Dock) and opens the right-hand **Quarantine Lockdown SidePanel** displaying the exact **Triggered By** rule (Known Hash vs. Heuristic Hit reason), **Detection Source** (`Spoke Registry • <Game>` or `Sanctuary Foundry`), optional **Anonymous Manifest Upload**, and a Citizen-signed glass-red **Secure Shred** button.

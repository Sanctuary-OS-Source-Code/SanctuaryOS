# Sanctuary OS — Master Phase Roadmap

> **Live Directive Synchronization:** This master roadmap reflects the complete architectural evolution of Sanctuary OS from its initial airgapped symlink prototype (Phase 1) through the current multi-workspace, game-agnostic Liquid Glass OS & Web PWA era (Phase 12). Changes to this document synchronize bidirectionally with the `public.system_directives` cloud table (`directive_key = 'phase_roadmap'`) via the Keepers Core Directive Engine.

---

## Phase 12: Agnostic Future (July 15, 2026 — In Progress)
**Status:** `IN PROGRESS` | **Start Date:** `July 15, 2026` | **Focus:** `Citizens Workbench / Mason IDE, Lexicon Revamp, Multi-Workspace & Sanctuary Partners, Sanctuary V6 Liquid Glass Overhaul, Website V2 / PWA`

### Citizens Workbench / Mason IDE (Completed: July 17, 2026)
- **Version Timeline:** Added support for named versions alongside semantic version numbers across the Version Timeline.
- **Dual Vision Editor:** Visual and Raw Monaco Editor modes now display simultaneously in a synchronized split-screen layout for `.cfg`, `.ini`, `.json`, and `.xml` artifacts.
- **Author Mode — Blank Mapping Strings:** Enabled blank mapping strings in Author Mode for rapid template scaffolding.
- **Author Mode — Target File Selector:** Added a dedicated Target File selector in Author Mode to bind schemas directly to specific configuration payloads.
- **Author Mode — Auto-Populate Template Code:** Automatically populates base template code when initializing a new file in Author Mode.
- **Nexus Uploads — Version Auto-Match & 1-Click Publish:** Automatically matches version numbers from the active Workbench build and adds a 1-click "Publish Current Upload" action with localized Language Dropdowns.
- **Mason IDE — "Create Lexicon" Template:** Added a dedicated "Create Lexicon" template in the Mason IDE with a side-by-side reference dictionary view for translators and community scribes.

### Lexicon Revamp & Simplification (Completed: August 10, 2026)
- **String Deduplication & Consolidation:** Audited and removed duplicate localization strings across all dictionaries (`en-default.json`, `en-sanctuary.json`, `en-sims.json`, `Simlish.json`).
- **Cloud Database Lexicon Schemas:** Migrated default Lexicon JSON payloads into the cloud database alongside Master Schemas for instant over-the-air terminology updates.
- **Sanctuary & Community Badges:** Added official `Sanctuary` and Partner `Community` badges to identify verified core vs. community-authored lexicons.
- **Cartographer & Preferences Integration:** Integrated Lexicon selection directly into the first-boot Cartographer onboarding wizard and System Preferences.

### Multi-Workspace Support & Sanctuary Partners (In Progress — October 20, 2026)
- **Multiple Workspaces (Master Schemas):** Full multi-instance workspace isolation allowing Citizens to mount and switch between any supported game ecosystem on the fly.
- **Sanctuary Partners Agreement:**
  - Every Partner Community shares the unified Sanctuary OS Core App while maintaining sovereign control over their own ecosystem.
  - Each Partner Community provisions its own game-specific file parsers, Lexicons, and Chameleon themes.
  - Shared global User Identity Matrix with granular per-game clearance roles (`Citizen`, `Scout`, `Mason`, `Architect`, `Senior Architect`, `Wayfinder`).
  - **100% Data Sovereignty ("Cut the Cord"):** All community data resides in the Partner's own database and connects to the Sanctuary Hub via Foreign Data Wrapper (FDW) or direct Spoke federation—if a community ever chooses to leave, they retain 100% of their data with a single click.
  - **Zero-Cut Partner Donations:** Integrated in-app Partner Donation links where Sanctuary Foundry takes **0%** of community donations.
  - **Cross-Community Supporter Dev Builds:** Citizens who donate to *any* Partner Community automatically unlock access to the monthly Sanctuary OS Supporter Development Builds.
  - **1-File Standalone Fork:** Any community can fork the open-source codebase into a completely independent terminal by editing a single configuration file (`src/supabase.ts`).

### Sanctuary V6 — Liquid Glass & 18-Section OS Revamp (In Progress — October 20, 2026)
- **3D Refractive Liquid Glass Theme Engine:**
  - Eliminated hardcoded colors and layouts across all 18 OS sections in favor of the unified 4-layer CSS optical glass pipeline (`--glass-base-fill`, `--glass-sheen`, `--glass-refracted-wallpaper`, and 3-sided specular bevels).
  - Revamped all Default Core Themes (`Sanctuary Dark`, `Sanctuary Light`, `Midnight Aurora`, `Cyberpunk Neon`, `Vampire Nocturne`, `Tactical Stealth`, `True Glass`) and debuted **The Sims 4 ("Plumbob Crystal")** as the first official Partner Community Theme.
  - **Chameleon Theme Forge 2.0:** Rebuilt the Chameleon Theme Forge with 1-Click Optical Material Presets, Curated Color Harmony Palettes, unlocked Semantic Status Chromatics, a Built-in Wallpaper Gallery + Custom Upload, Multi-Stop Atmospheric Gradient Forge, and live refractive OS previewing.
  - **Dynamic Theme Preview Cards:** Added live procedural Theme Preview Cards across System Preferences, Mason Workshop, and The Nexus that dynamically render each theme's wallpaper, glass optics, border radius, and color hierarchy directly from its JSON payload (or custom preview banner).
  - **Floating 2-Pill Title Bar & Hover Dock:** Replaced the legacy full-width top bar with two floating Liquid Glass pills (Workspace Switcher + Window Controls) and an auto-collapsing Hover Dock.
- **Dynamic Alert Stat Tiles:**
  - **Permissions Alert Tile:** Dynamically surfaces on the Command Center when OS filesystem or symlink elevation is required.
  - **Global Alert Tile:** Real-time broadcast tile for network-wide DEFCON or patch events.
  - **Critical Failures Tile:** Instant telemetry counter and drawer trigger for broken or incompatible vault artifacts.
  - **System Alerts Tile:** Tracks unstable or conflicted packages requiring Citizen attention.
  - **Artifact Updates Tile:** Live counter of installed mods with newer versions available on The Nexus.
- **Full 18-Section OS Revamp:** Unified typography, `.glass-panel` / `.glass-surface` hierarchy, single-row `SidePanel` headers, and responsive mobile drawers across Command Center, Vault, Nexus, Blueprints, Comm-Link, Conflict Radar, Homestead Lab, Workbench, Time Capsule, Preferences, Help Desk, Mason Workshop, Architect Console, Oversight Command, Wayfinder Operations, Keepers Core, Side Browser, and Cartographer.

### Website V2 & Progressive Web App (In Progress — October 20, 2026)
- **Unified Single-Codebase Web OS & PWA:** Deployed the full Sanctuary OS experience to the web (`sanctuaryos.net` and workspace routes like `sanctuaryos.net/sims4`) with installable Mobile & Desktop PWA support.
- **Hardware-Boundary Guardrails:** Automatically disables local filesystem/symlink features (`Vault`, `Conflict Radar`, `Homestead Lab`, `Workbench`, `Time Capsule`) on Web while keeping `Comm-Link`, `The Nexus`, `Support Desk`, and all `Command Hubs` 100% live and interactive.
- **Sanctuary Foundry Main Hub:** Public landing hub featuring System Directives, Interactive Citizen Guide, Phase Chronology, Forking Matrix, Legal/EULA Codex, Partner Community Portals, and Desktop Installer Downloads.
- **Remote Blueprint & Download Queuing:** Allows Citizens browsing The Nexus on Web or Mobile to queue mods and Blueprints (`SNC-XXXXX`) for automatic deployment the next time their Desktop App boots.

---

## Phase 11: Technical Debt Repayment & Agnostic Sprint (May 17 – July 13, 2026)
**Status:** `COMPLETED` | **Date Range:** `May 17 – July 13, 2026` | **Focus:** `Native Intake & Support Systems, Citizens Workbench, Lexicon Sweep & Game-Agnostic Kernel`

- **Native Intake Forms (June 5, 2026):** Integrated Mason UUID registration and Architect clearance intake forms directly into the Sanctuary OS application, discontinuing external website forms.
- **Integrated Bug Reports, Support Tickets & Side Browser (June 5, 2026):** Replaced external Discord support bots with the native encrypted Support Desk Ticket Dossier system, embedded multi-tab Side Browser with automatic download interception, and Mason Linker.
- **Citizens Workbench 1.0 (June 26, 2026):**
  - Automatic detection of `.cfg`, `.ini`, and `.json` configuration files inside the active Vault.
  - Embedded Monaco IDE for syntax-highlighted local configuration editing.
  - Introduced **Sanctuary Templates** (Schema Mapping) so raw text configs automatically render as user-friendly visual sliders, toggles, and dropdowns.
- **Comprehensive Maintenance & Lexicon Sweep (June 27, 2026):** Replaced legacy prototype code, migrated all static UI text and icons into the thematic Lexicon dictionaries, re-themed legacy views, and completed a full UI/UX bug sweep across all 11 core sections.
- **The Agnostic Sprint (July 13, 2026):** Extracted every hardcoded Sims 4 check (`.package`, `.ts4script`, folder depth rules, and executable paths) across 17 frontend modules and the Rust backend into dynamic **Master JSON Schemas**, transforming Sanctuary OS into a truly game-agnostic engine.

---

## Phase 10: Post-Alpha Revamp, Protocols & Mass Tooling (May 10 – May 16, 2026)
**Status:** `COMPLETED` | **Date Range:** `May 10 – May 16, 2026` | **Focus:** `Dev Sandbox, Visual Protocol Manager, Folder Structure Enforcer & Senior Architect Mass Update`

- **Developmental / Local Mods Sandbox (May 11, 2026):** Created an isolated `Dev` Sandbox directory for creators to test work-in-progress packages without triggering constant SHA-256 hash churn in the primary Vault.
- **Mason Dev Mode & "Sync to Network" (May 11, 2026):** Added a streamlined release pipeline in the Mason Workshop allowing creators to promote a tested local Dev mod directly into a published Nexus release.
- **Enhanced Mod Telemetry (May 11, 2026):** Added "Last Updated" timestamps, interactive status-reason hover tooltips, and a multi-select Compatible Game Versions matrix to every mod dossier.
- **Visual Protocol Schema Manager (May 12, 2026):** Built an interactive, database-schema-style Protocol Manager across the Mason and Architect Hubs supporting **Core & Addons**, **Flavors** (mutually exclusive sub-options), **Flavor Groups** (invisible rival rules across separate files), **Dependencies**, **Lineage**, and **DLC Folder Requirements**.
- **Mason Mod Structure Builder (May 12, 2026):** Added a visual folder-tree builder for Masons that integrates directly with Conflict Radar's "Sanitize Vault" engine and Symlink deployment to guarantee exact subfolder placement.
- **Advanced Vault & Nexus Filters (May 12, 2026):** Added "Game Version", "Currently Eligible" (hiding mods with missing dependencies), and "Exclude Unowned DLC" ghost-filtering across the Vault and Nexus.
- **Monaco IDE & Senior Architect Mass Update (May 13 – May 16, 2026):** Integrated the Monaco IDE into Mason/Architect Hubs, built the Senior Architect Mass Update console (bulk-updating Status, Game Version, Safety Rating, Category, and Conflicts after major game patches), added Backup Retention Policies, and added Lexicon selection to first-boot setup.

---

## Phase 9: Infrastructure Finalization & Laboratory Diagnostics (May 8 – May 9, 2026)
**Status:** `COMPLETED` | **Date Range:** `May 8 – May 9, 2026` | **Focus:** `Proving Grounds Simulation, Senior Architect Hub, macOS Universal Pipeline & Wayfinder Comms`

- **Homestead Proving Grounds Simulation (May 9, 2026):** Transitioned the Homestead Lab from a conceptual UI into a live simulation laboratory with real-time `LastException` / crash log monitoring and 1-click conflict rule pushing to the global database.
- **Senior Architect Command Hub (May 9, 2026):** Deployed the high-clearance Senior Architect console featuring Global DEFCON metrics, the Identity Matrix (live user role management), and Nuclear Protocol Tracking.
- **macOS Universal Build Pipeline (May 9, 2026):** Engineered automated GitHub Actions workflows to compile and sign native `.dmg` installers for both Apple Silicon (`aarch64`) and Intel (`x86_64`) Macs.
- **Wayfinder Comms & Florida Compliance (May 8, 2026):** Established high-clearance Wayfinder transmission channels with dynamic SQL alerting, Row-Level Security (RLS) hardening, and automated Florida Compliance Tiers 1–4.

---

## Phase 8: Standardized Lexicons & Dynamic Engine Recognition (May 7 – May 8, 2026)
**Status:** `COMPLETED` | **Date Range:** `May 7 – May 8, 2026` | **Focus:** `Rust Binary Version Ripper, Auto-Sanitization Launch, Global Lexicon Extraction & Blueprint Architect`

- **Dynamic Engine Recognition ("Rip Protocol") (May 7, 2026):** Replaced brittle `GameVersion.txt` parsing with a native Rust binary inspection engine that extracts exact engine version signatures directly from `Default.ini` and PE executable headers.
- **Auto-Sanitization Launch Sequence (May 7, 2026):** Engineered the Quick Launch sequence to automatically purge stale `LastException` logs and `localthumbcache.package` files across both the user Documents directory and the Airgap container prior to engine ignition.
- **Global Lexicon Extraction (May 7, 2026):** Executed the first mass migration of hardcoded UI labels and system alerts into `en-sanctuary.json` for centralized thematic routing.
- **Blueprint Architect Load Order UI (May 7, 2026):** Built the full-width Load Order Manager allowing Citizens to visually prioritize folder tiers (`!_Core` through `Z_Overrides`) and listen for real-time DEFCON 1 patch shields.

---

## Phase 7: Core Architecture & Time Capsule Restoration (May 6, 2026)
**Status:** `COMPLETED` | **Date Range:** `May 6, 2026` | **Focus:** `Nested Vault Taxonomy, High-Speed Time Capsule Compression, Windows MSI Pipeline & Scout Dossiers`

- **Nested Vault Hierarchy Deployment (May 6, 2026):** Restructured the local Sanctuary Vault into a strict, self-healing directory taxonomy (`Backups/World`, `Backups/Engine`, `Data/cache`, `Quarantine`, and `Profiles`).
- **Time Capsule Compression Rework (May 6, 2026):** Optimized the Rust archive engine to compress full 78 GB Engine Cores down to 24 GB, complete World Save snapshots in ~60 seconds, and execute full state rollbacks in under 50 seconds.
- **Automated Windows `.msi` Release Pipeline (May 6, 2026):** Configured GitHub Actions for automated, reproducible Windows `.msi` installer compilation and release signing.
- **Scout Dossier Radar Integration (May 6, 2026):** Integrated "Unidentified Artifact" Scout Dossier submissions directly into the Conflict Radar sweep workflow.

---

## Phase 6: Modularization & The Comm-Link (May 3 – May 5, 2026)
**Status:** `COMPLETED` | **Date Range:** `May 3 – May 5, 2026` | **Focus:** `Creator Following Feed, Comm-Link Ledger, App.tsx Modularization & Yeet Cascade Isolation`

- **Creator Following System (May 5, 2026):** Added a dedicated "Following" filter to the Comm-Link Feed so Citizens can subscribe to dispatches from their favorite Masons.
- **Comm-Link Real-Time Ledger (May 5, 2026):** Overhauled the Comm-Link into a real-time broadcast feed with inline dispatch pop-up viewers and 1-click Mason Dossier profile routing.
- **Core Codebase Modularization (May 4, 2026):** Deconstructed the monolithic `App.tsx` into dedicated, lazy-loadable domain modules (`CommandCenter.tsx`, `Lab.tsx`, `Collection.tsx`, and `Marketplace.tsx`).
- **Yeet Cascade & Nuke Isolation (May 4, 2026):** Extracted recursive dependency casualty tracking into `YeetConfirmAlert.tsx` and enforced 100% Nuke Isolation inside the Proving Grounds.

---

## Phase 5: Defensive Protocols & Symlink Airgap 2.1 (May 1 – May 3, 2026)
**Status:** `COMPLETED` | **Date Range:** `May 1 – May 3, 2026` | **Focus:** `Real-Time Airgap File Watcher, DNA Duplicate Intercept, Mason Protocol UI & Smart Search Fallback`

- **Symlink Airgap 2.1 (`initialize_airgap_watch`) (May 3, 2026):** Implemented a non-blocking Rust `notify` filesystem watcher thread that intercepts in-game `.cfg` and `.ini` modifications in real time and mirrors them safely back to the Vault.
- **DNA Radar Duplicate Intercept (May 3, 2026):** Added real-time SHA-256 signature interception during artifact ingestion, immediately halting duplicate files and prompting the Citizen to "Replace" or "Ignore".
- **Mason Protocol Manager 1.0 (May 2, 2026):** Introduced the first relational UI for Masons to declare Addon, Twin, Rival, and Beta mod relationships.
- **Intelligent Search Fallback (May 2, 2026):** Added dynamic search fallback by Display Name for local mods lacking an explicit Nexus URL.

---

## Phase 4: The Global Network & Radiant Pivot (April 28 – May 1, 2026)
**Status:** `COMPLETED` | **Date Range:** `April 28 – May 1, 2026` | **Focus:** `Radiant Light Mode & ThemeProvider, Cloud Blueprint Codes, Architect Signature Gate & Read/Write Airgap`

- **Radiant Mode & Real-Time `ThemeProvider` (May 1, 2026):** Expanded Sanctuary OS beyond its original dark "Bunker" aesthetic by introducing **Radiant** (Light Mode) and the real-time `ThemeProvider` engine supporting instant profile switching (`Architect`, `Radiant`, `Dracula`, `Synthwave`).
- **Cloud Blueprint Transmissions (`SNC-XXXXX`) (May 1, 2026):** Launched cloud-based 6-character alphanumeric Blueprint share codes for instant load-order transmission between Citizens.
- **Architect Signature Protocol (May 1, 2026):** Added a high-stakes confirmation gate before destructive operations, allowing Citizens to Overwrite, Backup to Time Capsule, or Abort.
- **Auto-Deployment Intercept & Airgap Lock (April 30, 2026):** Added recursive dependency halt gates during Blueprint deployment and strict Read/Write permission toggles on core engine data files.

---

## Phase 3: System Rip & Logic Intelligence (April 15 – April 28, 2026)
**Status:** `COMPLETED` | **Date Range:** `April 15 – April 28, 2026` | **Focus:** `Deep Yeet 2.0 Cascade Scanner, UTF-16 Version Ripper, Twin Bond Protocol & Copilot Philosophy`

- **Deep Yeet 2.0 (April 28, 2026):** Engineered deep-recursive dependency scanning that automatically identifies and queues orphaned downstream addons when a master core package is removed.
- **UTF-16 System Version Ripper (April 28, 2026):** Built a native Rust byte-filter that strips UTF-16 encoding artifacts from game binaries to extract clean version strings.
- **Twin Bond Protocol (April 25, 2026):** Created synchronized deployment links between paired `.package` and `.ts4script` files so neither half can be deployed or disabled without its twin.
- **The Copilot Philosophy (April 25, 2026):** Established Sanctuary OS's foundational safety doctrine: the system autonomously detects cascades, conflicts, and broken dependencies, then halts and presents clear options for the Citizen's manual signature.

---

## Phase 2: Visual Uplink & The Quarantine Zone (April 10 – April 15, 2026)
**Status:** `COMPLETED` | **Date Range:** `April 10 – April 15, 2026` | **Focus:** `Glassmorphism 1.0, Bio-Hazard Quarantine Sector, Layered OS Immersion & Symlink Airgap`

- **Glassmorphism Engine 1.0 (April 15, 2026):** Introduced the first generation of backdrop-blur containers, dynamic translucent borders, and deep elevation shadow layers.
- **The Quarantine Zone (April 15, 2026):** Constructed a dedicated bio-hazard isolation sector that strips execution permissions from suspicious or corrupted artifacts and prepares them for 3-pass Secure Shredding.
- **Layered Desktop OS Immersion (April 15, 2026):** Refactored standalone utility screens into a cohesive, single-window desktop operating system experience backed by the local SQLite cache and Symlink Airgap.

---

## Phase 1: Bunker Initialization & DNA Pathing (April 1 – April 10, 2026)
**Status:** `COMPLETED` | **Date Range:** `April 1 – April 10, 2026` | **Focus:** `The Cartographer Protocol, SHA-256 DNA & Delta Caching, and Primary Bunker Pathing`

- **The Cartographer Protocol (April 10, 2026):** Engineered automated first-boot reconnaissance that scans drives to locate Game Binary installations and user Mods directories without manual path entry.
- **SHA-256 DNA & Delta Caching (April 10, 2026):** Implemented cryptographic SHA-256 artifact hashing paired with `mtime`-first delta scanning, dropping Vault boot and scan times on multi-thousand-mod libraries from minutes to milliseconds.
- **Core Bunker Pathing & Integrity Checks (April 10, 2026):** Established primary "Bunker" Vault deployment pathing and local registry change tracking to eliminate CPU bottlenecks on massive mod collections.

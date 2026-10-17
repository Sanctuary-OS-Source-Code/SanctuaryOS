# Sanctuary OS 

![Version](https://img.shields.io/badge/version-0.5.7-blue)
![Last Updated](https://img.shields.io/badge/last_updated-October_17,_2026-brightgreen)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Alpha](https://img.shields.io/badge/Alpha-Early_Access-red)

> **Official Citizen Guide**

This repository contains the official guides for Sanctuary OS, covering both standard Citizen operations and Elevated Clearances.

---

## Table of Contents
- [Part 1: Official Citizen Guide](#official-citizen-guide)
  - [Cartographer Initialization (Initial Setup)](#cartographer-initialization-initial-setup)
  - [The Command Center](#the-command-center)
  - [Your Vault](#your-vault)
  - [The Nexus](#the-nexus)
  - [Integrated Side Browser](#integrated-side-browser)
  - [The Side Panel Ecosystem](#the-side-panel-ecosystem)
  - [Blueprints](#blueprints)
  - [Homestead Lab](#homestead-lab)
  - [Conflict Radar & Load Order Engine](#conflict-radar--load-order-engine)
  - [Citizen’s Workbench & Open Mason Workshop](#citizens-workbench--open-mason-workshop)
  - [Time Capsule](#time-capsule)
  - [Compliance, DEFCON & Malware Security](#compliance-defcon--malware-security)
  - [System Preferences](#system-preferences)
  - [Quick Tips for Citizens](#quick-tips-for-citizens)
- [Part 2: Elevated Clearances](#elevated-clearances)
  - [Masons (Mod Creators)](#masons-mod-creators)
  - [Architects (Moderators)](#architects-moderators)
  - [Oversight (System Administrators)](#oversight-system-administrators)
  - [Wayfinders (Community Managers)](#wayfinders-community-managers)
  - [Keepers (Core Infrastructure)](#keepers-core-app-team--sanctuary-developers)
  - [Role Protocols](#role-protocols)

---

# Official Citizen Guide

**Version:** 5.7 (V0.5.7) | **Last Updated:** October 17, 2026

> **Welcome to Sanctuary OS,**  
> Sanctuary OS is a local-first mod operations layer and desktop middleware for mod ecosystems. It relies on a "no asset hosting / metadata-only / offline-first" philosophy.  
> 
> Here is your complete User Guide to mastering this entirely new way of managing your environment.

## Cartographer Initialization (Initial Setup)
Upon your first launch, the Workspace Switcher (located globally in the central Title Bar) allows you to choose your active game environment (e.g., The Sims 4 vs Cyberpunk 2077). The Cartographer then maps your machine’s layout and links your identity to the central OS Hub via Privacy-First Single Sign-On (SSO).

- **Auto-Detect Paths:** Click the Cloud icon to automatically locate your game and document folders for your active workspace.
  - **Bin Folder (Live Path):** The directory where your game executable lives. Sanctuary natively extracts the genuine patch version directly from your active game executable (e.g., `TS4_x64.exe`) using an in-process Rust PE parser (`pelite`). This ensures AV compliance by avoiding subprocess overhead. If the target executable is unspecified, the parser dynamically scans the directory while strictly filtering out crash-handlers, redistributables, and anti-cheat binaries. If the OS metadata isn't available, it falls back to the schema-defined `.ini` manifest to guarantee 100% engine version accuracy.
  - **Mods Folder:** Your active game Mods folder.
  - **Vault Folder:** Select a safe, external directory to act as your isolated "Deep-Storage Archive."
- **Lexicon & Chameleon:** Customize your language (Lexicon Protocol—supporting Standard English, Sanctuary Sci-Fi, Sims Friendly English, Simlish, and community language packs) and UI theme (Chameleon Protocol with authentic Frosted Glassmorphism) during setup.
- **OS Permissions Alert (Windows):** Sanctuary OS heavily relies on symlinking. The Cartographer will alert you if your OS lacks permissions. You must either run Sanctuary OS in Administrator Mode or enable Developer Mode in your Windows System Settings to prevent the OS from falling back to hard links.
- **DNA Hashes & Static Overrides:** c

## The Command Center
The Command Center provides a high-level, glassmorphic dashboard view of your active loadout and network feeds.

- **Dynamic System Status:** This tile is actively tied to your selected Blueprint.
  - 🟢 **System Stable:** No Actions Required.
  - 🔵 **Artifact Updates Available:** Artifact Updates are available (via Cloud Registry or Decentralized Static Edge Manifests).
  - 🟡 **Citizen Action Recommended:** An artifact is flagged as Unstable or Conflict Severity 3 Collisions detected.
  - 🔴 **Critical Failure Detected:** An artifact is flagged as Corrupted, Game Version Unsupported, Missing DLC/Dependencies, or Severity 4 Collisions detected.
- **Vault Integrity:** View your total Artifact count and see a breakdown of Verified vs. Unverified mods, as well as your active UI Extensions (Lexicons & Chameleons).
- **Quick Actions:** Instantly run a Radar Sweep, Lockdown the Vault (strip mods instantly), or Submit a Support Ticket.
- **Global Comm-Link & Interactive System Dispatches:** A live feed of updates, patch notes, and transmissions directly from Masons, Wayfinders, and Keepers. Features threaded multi-level replies, WYSIWYG/Markdown text formatting, dedicated "Discover" vs "Following" tabs, pinned posts, a built-in 2x2 glassmorphic **Dispatch Telemetry Header** (`Alert Type`, `Affected Target`, `Severity`, and `Action Required`), and live **Interactive Community Polls** (single-choice and multi-choice voting).
- **Sanctuary Support:** A dynamic in-house Support System designed from the ground up to streamline all support operations.
- **Status Bar Integration:** Critical OS functions (Radar Sweep, Lockdown Vault, Translucent Notification Dock) are housed in the global, edge-to-edge `SystemStatusBar` at the bottom of the OS, preventing intrusive screen takeovers and making them available across every screen.

## Your Vault
Your Vault is your local library and secured asset storage. The game never touches these files directly; they are projected into the game via symlinks.

- **Global Drop-Zone:** Drag and drop artifacts, `.zip`, `.tar.zst`, or `override.json` files anywhere into the OS window to ingest them.
- **Blueprint Hot-Swap:** Use the dropdown directly in the Vault Header to switch your active mod profile without ever leaving the screen.
- **Select Assets Bar:** A floating, pill-shaped bar at the bottom of the screen allows for bulk actions: Draft a Blueprint, Group into a Virtual Folder, or Purge Archives.
- **Safety Protocol Filters:** Use the filter popovers inside the `ActionPill` to instantly hide mods incompatible with your game version, or select "Only Show Eligible" to hide artifacts that are currently relied upon by other mods (preventing accidental breakage).
- **Delete Cascade:** If you attempt to delete a core mod (e.g., XML Injector), Sanctuary OS will intercept the action and display a "Delete Cascade" inline alert/side panel, automatically queuing all dependent add-ons for removal to keep your bunker sterile.
- **Ghosted States:** Visually, broken or missing mods will be "Ghosted" with dynamic tooltips explaining exactly what is wrong (e.g., Game Version Unsupported, Missing DLC, Conflict Collision Severity 3/4).
- **Duplicate & Edge Override Intercept:** If you ingest a mod with a SHA-256 hash identical to one you already own, a DNA Match Side Panel will intercept you, allowing you to instantly replace/overwrite or ignore the clone. If an archive includes a creator's `override.json`, Sanctuary prompts you to bind that mod's hash lineage directly to the creator's static `manifest.json` endpoint for decentralized update polling and atomic logic.

## The Nexus
The global registry for community index, artifact discovery, and metadata links.

- **Artifacts:** Browse The Nexus for any Artifacts that are not currently in Your Vault. Automatically filters based on your installed Game Version, installed DLC, and strict Tier-0 public safety visibility.
- **Blueprints:** Browse The Nexus for premade Blueprints. Any citizen is free to share their Blueprints with the Nexus.
- **Lexicons:** Browse The Nexus for custom Lexicons (Language Packs). Filter by Default Languages/Theme Packs and by Language. Any Citizen is free to share their Lexicon with The Nexus.
- **Chameleons:** Browse The Nexus for custom Chameleons (Theme Packs). Filter by Dark or Light modes. Any Citizen is free to share their Chameleon with The Nexus.
- **Templates:** Browse The Nexus for custom Templates (Config Files). Any Citizen is free to share their Template with The Nexus.
- **Mason Profiles:** View any creator's profile featuring a `StatTileCarousel` showcase of their **Artifacts**, **Blueprints**, **Lexicons**, **Chameleons**, and **Templates**, plus pinned highlights and 1-click Follow/Notification controls.
- **Nexus Reports:** If you spot a broken mod, inaccurate data, or malware, use the Flag tool to instantly alert the Architects via Nexus Reports.

## Integrated Side Browser
Sanctuary OS includes a fully featured web browser directly integrated into the environment.

- **Download Interception:** The Side Browser automatically detects mod downloads (artifact files, `.zip`, `.rar`, `.7z`, `.tar.zst`, `override.json`) and routes them directly into your Vault without ever opening an external window or clogging up your PC's standard Downloads folder.
- **Immersive Media:** Fullscreen video support, hidden UI elements (like ad banners or footers), and picture-in-picture capabilities are built-in for an uninterrupted experience.
- **Built-in Context Menus:** Customized right-click context menus are injected into the browser natively, allowing you to copy, paste, or open links in new tabs while remaining within the Sanctuary OS framework.

## The Side Panel Ecosystem
Across the entire operating system, complex tasks are handled via non-intrusive Side Panels with top-right `headerActions` (`PanelHeaderGroup` & `PanelHeaderButton`), so you never lose your context.

- **Ticket Dossiers & Log Viewers:** Support staff and Masons can view active support tickets alongside code exceptions directly in the Ticket Dossier and Ticket Log Side Panels.
- **Conflict Resolution Sidebar:** Manage your Severity 3 Tuning Overlaps and Load Order Rules directly from the side panel, declaring winners on the fly.
- **Blueprint Swaps:** Instantly hot-swap entire loadouts using the Blueprint Swap panel without leaving your current view.
- **Check Hash & Deep Scan (`FileVerificationSidePanel`):** Elevated Clearances can launch the `Check Hash` utility from any hub header to verify SHA-256 signatures and run instant multi-format heuristic antivirus scans.
- **Audit Logs & Diagnostics:** Elevated Clearances have access to side panels like the Audit Log Viewer (with inline full-width search and filter bars) to monitor real-time system changes.

## Blueprints
Sanctuary OS replaces manual file moving with Blueprints (tactical loadouts).

- **Drafting:** Create profiles to swap between different sets of mods instantly.
- **Blueprint Alerts:** A dynamic Button/Side Panel that shows current known issues with the blueprint's loadout.
- **Import/Export:** A JSON-based system. Blueprints can be imported/exported and shared without the cloud or internet connection. Blueprint exports securely carry your custom Local Dossier metadata (`modMeta`, such as custom author URLs for missing mods) and workspace `game_id`/`game_name` to guarantee perfect identity persistence offline.
- **Blueprint Uplink:** A cloud-based coordinate system. Blueprints can be shared via 6-digit alphanumeric hashes (`SNCXXX`).
- **Snapshot Active Blueprint:** Clone the deployed Blueprint into an editable local copy.

## Homestead Lab
The Homestead Lab allows you to test unknown mods in a "Nuke" environment.

- **Conduct Experiment:** Sanctuary isolates your game, injecting only the specific mod you want to test and its mandatory requirements.
- **Conflict Experiments:** Citizens can select two conflicting artifacts. If it crashes, the UI immediately displays the Exception Log output and allows Architects to map a new conflict rule to the Registry Database.
- **Real-time Monitoring:** The Lab monitors for any error and game crash logs. If the game crashes, the Lab catches the log snippet immediately, halts the test, and fails the mod, keeping your main save entirely safe.

## Conflict Radar & Load Order Engine
Sanctuary cross-references global Directives, creator Static Edge Manifests, and declarative Load Order rules to prevent game-breaking issues before they happen.

- **Casual Mode vs. Advanced Mode:** Switch between **Casual Mode** (1-click "Pick a Winner" conflict resolution) and **Advanced Mode** (unlocking the full **Load Order** `StatTileCarousel` tab with an interactive **Quick Rule Builder**, directional `Must Load After` / `Must Load Before` rules, **Circular Rule / Cycle Detection** with 1-click **Break Loop** resolution, and inline **Priority Tier** pills).
- **Schema-Driven Load Order Engine:** Adapts automatically to the active game's load order architecture (`folder_priority` with dynamic `Resource.cfg` & multi-tier override folders, `manifest_list` for `loadorder.txt`/`plugins.txt`, `numeric_prefix`, or `timestamp`).
- **Severity 4 Collisions (Fatal Engine Clash):** Core Python/Binary overlaps. Overrides are impossible; one mod must be removed.
- **Severity 3 Collisions (Tuning Overlap):** XML/SimData overlaps. You crown a "Winner" in the UI to determine which mod takes priority. Selecting a winner automatically compiles topological load order rules and routes the winner into the highest priority tier behind the scenes.
- **Severity 2 Collisions (Duplicate File):** Artifacts that share the same TGIs. These are mostly High-Quality and Standard Quality of the same Artifact being equipped at once.
- **Severity 1 Collisions (Minor Overlap):** Usually safe texture or low-impact overrides. Safe to ignore and are collapsed by default.

## Citizen’s Workbench & Open Mason Workshop
The Citizen’s Workbench allows you to configure Artifacts without manually editing raw files, while the **Open Mason Workshop** gives every authenticated Citizen local access to creator tools (`Sandbox`, `IDE`, `Chameleons`, `Notepad`, and `Export Release`).

- **The Workbench features two primary interfaces:**
  - **Visual Interface:** Generates interactive UI controls (toggles, sliders, dropdowns) based on a loaded Template (`.json`). This protects users from making syntax errors while editing advanced config files.
  - **Raw Editor (Template Architect):** This mode unlocks the raw underlying file in a full IDE environment powered by Monaco. It supports direct syntax editing, live error linting, and is fully integrated with the Sanctuary UI aesthetic.
- **Author Mode:** By selecting a `.json` file, the Workbench automatically enters Author Mode, allowing you to design and test custom Visual Interfaces for any configuration file.
- **Real-time Synchronization:** Changes made in the Visual Interface immediately update the underlying Raw Editor (and vice-versa).
- **Template Saving:** You can save your authored UI definitions locally. The Workbench stores these in your active data sets to override default mod configurations.

## Time Capsule
Sanctuary OS handles automated backups using an ultra-fast, hardlink-based incremental backup engine.

- **World State (Purple):** Snapshots of your Saves & Settings files.
- **Engine Core (Pink):** Backups of the actual game installation files.
- **Automated Version Tracking:** The OS automatically detects your active game version by scanning the executable manifest prior to executing backups and post-restore to guarantee timeline and version integrity.
- **True Rollback Safety:**
  - Restoring a backup utilizes a high-speed differential mirroring process. Rather than blindly wiping the entire installation, the OS intelligently compares the live state to the backup snapshot, instantly deleting rogue files and restoring changed data to guarantee 100% timeline integrity without the performance penalty of a full wipe.
- **Back-Ups & Rollbacks:**
  - Sanctuary OS uses an incremental hardlink backup engine designed for near-instant disaster recovery. Because only modified files are physically copied (while unchanged files are simply hardlinked), backup times and disk usage will dynamically scale based on the exact size of your changes rather than the total size of your game.

## Compliance, DEFCON & Malware Security
Security is handled through a tiered global compliance system and a Dual-Tier Multi-Format Rust Heuristic Scanner.

- **DEFCON 1:** When an official game patch is actively rolling out, Wayfinders or Oversight trigger a network-wide DEFCON 1 signal. Sanctuary intercepts the game launch and forces an Emergency Backup to prevent data corruption.
- **Compliance Tiers 1-4 (Explicit, Illicit, Extreme Violence, Taboo):** Content ranging from NSFW to sensitive themes is permitted for local use and Vault storage. However, these artifacts are scrubbed from the Global Nexus Feed and stripped from public Cloud Blueprints to maintain legal compliance.
  - **Tiers 1-2 (Explicit / Illicit):** Allowed to submit Support Tickets (any "Dirty Logs" referencing NSFW scripts are automatically routed/sanitized according to community rules).
  - **Tiers 3-4 (Extreme Violence, Taboo, Malware):** Trigger a strict **Vault Lock** which disables support ticket submissions until the flagged artifact is unequipped or purged.
- **Malware Interception (Compliance Tier 5) & Dual-Tier Heuristics:** Sanctuary merges global **Core Heuristics** (maintained by Keepers) and community **Spoke Heuristics** (maintained by Oversight) to scan every ingested or vaulted file—across ZIP containers (`.zip`, `.ts4script`, `.jar`, `.pak`), raw binaries (`.package`, `.dll`, `.asi`, `.exe`), UTF-16LE wide strings, and compiled `.pyc`/`.pyo` bytecode symbol chains. If Tier 5 malware DNA is confirmed, Sanctuary triggers a Zero-Choice Lockdown with an unclosable "Critical Danger" modal enforcing a **Secure Shred**—a destructive overwrite and removal of the malicious files via the Rust backend.
- **External Secure Shred:** The OS takes the absolute path of a file, removes any read-only constraints, and executes a destructive overwrite and removal of the malicious files via the Rust backend.
  - Files are not automatically deleted without authorization: **A Citizen’s Signature is required.**
  - This prompt occurs during the ingest process (Drag & Drop), where the original file's path is held in volatile memory.
- **Nuclear Override:** A hidden toggle exists in System Preferences. To reveal it, click the subtitle “Local configuration, identity, libraries, and security protocols” 5 times. This allows you to bypass quarantine, but doing so permanently records your hardware signature hash in the decoupled `hardware_bans` ledger on the Sanctuary Cloud, revoking all network privileges without requiring persistent hardware tracking on standard users.

## System Preferences
Your System. Your Sovereignty. Your Preferences.

- **System Coordinates:** 
  - Your Vault Path, Active Library (Mods Folder), and the Bin Folder.
- **Time Capsule:** 
  - Set your DEFCON Agency Level, DEFCON Backup Target, Engine Core Retention Policy, World State Retention Policy, and Vault Max Capacity.
- **Network Credentials:** 
  - System ID, Update Comms (Email), and Update Passcode (Password).
- **Network:** 
  - Local Network Only (Offline Mode), Show Artifact Images (All External Images), Open Artifact Links inside Sanctuary (In-App Web Browser) & Share Malware Manifests (Anonymous Reports for any Secure Shreds).
- **Notifications:** 
  - Replies, Support Replies, New Transmissions, Author-Only Replies, and Per-Mason Notifications.
- **Chameleon:** 
  - Preset Themes / Downloaded Themes / Theme Forge Suite (featuring an interactive Background Builder with color swatches, angle sliders, and a live Holo Sandbox).
- **Lexicon:** 
  - Preset Language Packs / Downloaded Language Packs.
- **Logic Integrity (Anarchy Protocols):** 
  - Highlander Enforcement (Flavors), Nuclear Family Cohesion (Twins), Dependency Chain-Link, and Conflict Intercept (Collision Severity 4).
- **Malware Protocol:** 
  - Malware Protocol: Preferences subtitle ×5. This permanently severs your profile from the global network, granting you unrestrained local sandbox authority.

## Quick Tips for Citizens:
1. **Trust the Airgap:** Never put files directly in your game's live Mods folder. Drop them into Sanctuary and let the OS handle the symlinks and load order tiers.
2. **Missing DLC/Versions:** Pay attention to the Addon Drawer. If a mod card has a red "Broken" icon instead of a plus sign, hover over it. The tooltip will dynamically tell you exactly what is wrong (e.g., `MISSING DLC: [Packs]`, `VERSION MISMATCH`, or `MISSING ARTIFACT`).
3. **Follow Masons:** Click a creator's name in The Nexus to view their Mason Profile and click Follow. Their updates will now securely appear in your "Following" tab inside the Comm-Link.
4. **Check your Status:** If your Command Center tile is Amber or Red, run a Radar Sweep and follow the Citizen Action Recommended Alert.
5. **Watch the Launch Button:** Green is all clear. If it’s Red, that means a Patch Update is currently rolling out.
6. **Account Not Required:** The offline version of Sanctuary OS does not require an account.
   - The Nexus, Comm-Link, Blueprint Uplinks, Delete Cascades, Ghosted States, DEFCON Alerts, and Cloud Malware Intercepts will be unavailable while offline/logged out (though local Static Edge Manifest polling and cached rules remain operational).

---

# Elevated Clearances

**Version:** 5.7 (V0.5.7) | **Last Updated:** October 17, 2026

> This section of the guide covers the elevated roles within Sanctuary OS. The system uses a decoupled Hub-and-Spoke architecture: game-specific roles (Masons, Architects, Oversight, Wayfinders) operate within their specific Game Spoke Database, while Keepers manage the central OS Hub.

## Masons (Mod Creators)
The Mason Workshop is the specialized environment for building, publishing, and maintaining artifacts. Basic Workshop tools (`Sandbox`, `IDE`, `Chameleons`, `Notepad`, and `Export Release`) are open to all Citizens via the **Open Mason Workshop Tier**, while Verified Masons unlock direct Nexus asset publishing and the **Verified Mason Queue** fast-lane.

- **Command:** A top-down view of your creative output. View live metrics for your collections, active followers, and total "Uplinks."
- **The Mason IDE:** A built-in, fully responsive Monaco editor for editing `.js`, `.ts`, `.json`, and `.xml` files directly within Sanctuary OS, linked to an isolated Dev Sandbox.
- **Export Release & Decentralized Static Edge Packaging:** Package any Sandbox or Vault mod into a clean `<mod>_v<version>.zip` archive alongside a generated `manifest.json` (version, changelog, SHA-256 hash, `previous_hashes` lineage, and `atomic_logic`) and `override.json` so your users can receive decentralized updates from any static web host (GitHub Releases, Cloudflare R2, Patreon, itch.io).
- **Protocol Orchestrator:** Map the logic of your mod. Define Twins & Addons (files that must deploy together), Alternative Versions (Betas or Flavors), and Recursive Dependencies.
- **Collections Builder:** Group multiple artifacts into curated Collections (CC Sets) for Citizens to equip.
- **Conflict Manager:** Empower Masons to map and author their own conflict Directives for the global Conflict Matrix.
- **Structure Builder:** Visually define the exact folder structure your mod must maintain when deployed.
- **Your Nexus Releases:** Manage your public-facing catalog. Includes 1:1 synchronization with Architect-level metadata and a 3-tab **Feature Assignment** selector (`Artifacts`, `Blueprints`, `Assets`) for your public Mason Profile.
- **Bug Reports & Support Dossier:** Respond directly to user-submitted bug reports and view attached error logs in the Code Snippet viewer.
- **Comm-Posts:** Publish network-wide broadcasts. Features a real-time Preview tab and sticky glassmorphic WYSIWYG editor.

## Architects (Moderators)
The Architect Console is the logic and data center used by the elite to maintain the Global Registry.

- **Check Hash (`Verify Hash`):** A persistent header utility to instantly check any file’s DNA against the database, run a heuristic deep scan, and pull up its Edit Artifact panel.
- **Verified Mason Queue vs. Scout Queue:** Verified Masons submit directly to the **Mason Queue** fast-lane. Unverified submissions and crowdsourced discoveries route into the **Scout Queue**, which enforces the Master Schema `min_scout_submissions` firewall threshold before surfacing pending items to Architects.
- **Conflict Matrix:** Forge global "Directives." When an Architect establishes that "Mod A" crashes "Mod B," that logic is beamed down to every Citizen’s Conflict Radar globally.
- **Template Oversight:** A dedicated hub for verifying, flagging, and approving community-submitted Config Templates for the Citizen's Workbench.
- **Structure Matrix:** Visually define the exact folder structure a mod must maintain when deployed to ensure maximum engine performance.
- **Nexus Reports Queue:** Review and triage user-flagged artifacts (e.g., Lexicons, Chameleons, Blueprints) directly from The Nexus.
- **Citizen Support Desk:** A complete support ticketing system for resolving user issues seamlessly. Features "Claim Ticket" functionality to allow elevated users to claim tickets, which will then only show for them until resolved, escalated, or manually released.

## Oversight (System Administrators)
Oversight Command holds the keys to a Spoke community's security, role governance (up to Architect), and advanced conflict escalations.

- **Global DEFCON Override:** Oversight can manually override/emergency-trigger game lockdowns and emergency backups ahead of unannounced game patches.
- **Identity Matrix (Spoke Scoped):** View and manage community identities across Citizen, Mason, and Architect clearances, or issue Comm-Link bans.
- **Compliance & Malware Oversight (Spoke Heuristics):** Flag dangerous DNA signatures as Compliance Tier 5 (Malware) to trigger global Secure Shreds, and manage game-specific **Spoke Heuristics** alongside read-only **Core Heuristics**.
- **Mass Update Utility:** Batch-update hundreds of registry entries at once.
- **Game Management:** The "Source of Truth" for game versions. Register new Game Patches and DLC IDs to the Spoke Registry.
- **Mason Linker:** Manually verify and link Citizen identities to claimed Nexus mod author profiles.
- **Support Infrastructure:** Manage support categories, global macro templates, and route escalated tickets for the Citizen Support Desk.

## Wayfinders (Community Managers)
Wayfinders are the highest level of game-specific administration, responsible for managing the community, maintaining Spoke database sovereignty, and broadcasting platform-wide announcements for their specific game Spoke.

- **Global DEFCON:** Wayfinders can initiate scheduled/operational DEFCON events for their game.
- **Spoke Uplink & Sovereignty (`ServerHealthSidePanel`):** View real-time database latency and connectivity, export a `SANCTUARY-UPLINK://` bundle, rotate Spoke API keys (`secure_update_spoke_uplink`), or unilaterally **Cut the Cord** (`secure_sever_spoke_cord`) to sever the community's Spoke database from the Sanctuary OS Hub at any time while retaining 100% of their community data.
- **Identity Matrix (Full Spoke Authority):** Wayfinders can promote or demote any Spoke role (`citizen`, `mason`, `architect`, `oversight`, `wayfinder`).
- **The Dispatch:** A specialized broadcast channel featuring built-in **Dispatch Telemetry Headers** (`Alert Type`, `Affected Target`, `Severity`, `Action Required`) and **Interactive Community Polls**.
- **Keeper Support System:** A dedicated ticketing pipeline for direct communication between Wayfinders and Core OS Keepers when OS-level issues arise.
- **Game Audit Logs:** A ledger of game-level database mutations and role changes. Wayfinders use this for accountability and forensics within their specific community.

## Keepers (Core App Team / Sanctuary Developers)
Keepers are the actual developers of Sanctuary OS. They operate entirely separate from the community management layers (Architects, Oversight, Wayfinders) and focus exclusively on the core application code, master infrastructure, and the central OS Hub.

- **Keepers Core:** The central command interface for managing OS-level infrastructure.
- **Active Game Workspaces & Turnkey Spoke Onboarding:** Connect new community Spoke databases in seconds using Quick-Paste `SANCTUARY-UPLINK://` bundles, run live **Schema Handshake Verification** (`secure_verify_and_bootstrap_spoke`), and auto-provision the community's **Founding Wayfinder**.
- **Core Heuristics Oversight (`KeepersHeuristicsOversight`):** Author and deploy cross-game **Core Heuristics** (`keeper_heuristic_signatures`) that protect every connected workspace against system-level exploits and malware payloads.
- **Master Schema & Lexicon Flows:** Manage the global, cross-game configuration schemas and localization dictionaries, deploying them instantly via the cloud.
- **Theme Forge & Chameleons:** Govern the global UI aesthetic systems that propagate down to all connected Game Spokes.
- **Global Audit Logs:** A permanent, undeletable ledger of every global database mutation and security flag executed across the entire OS. Features strict append-only security triggers and dual-redundancy (writes to both Spoke and Core OS DBs), with workspace-specific filtering in the Audit Log Viewer.

## Role Protocols:
1. **Dual-Role & Privacy-First Identity Architecture:** To maintain strict separation of concerns and zero data bleeding, Sanctuary OS evaluates your permissions using two decoupled roles: your `osRole` (`citizen` or `keeper` on the Core OS Hub) and your `userRole` (`citizen`, `mason`, `architect`, `oversight`, or `wayfinder` on the active Game Spoke). Email addresses and authentication secrets remain exclusively on the Core OS Hub and are never stored on Spoke databases.
2. **Workflow Consistency:** The Support Queue and Artifact Dossiers are 1:1 copies across all elevated roles. This ensures a moderator (Architect) and a community manager (Wayfinder) see the exact same data when troubleshooting a ticket.
3. **Bilateral Sovereignty ("Cut the Cord"):** Either a Core Keeper or a community's Wayfinder can sever the Spoke Uplink at any time (`secure_sever_spoke_cord`), immediately scrubbing the Spoke's Service Role Key from the Hub and deactivating routing while leaving the community's Spoke database 100% intact.
4. **Local vs. Global:** Architects and Oversight are reminded that edits to the Global Registry affect all users in that Spoke, while edits in the Local Override Layer affect only the user's personal installation.
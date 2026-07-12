# Sanctuary OS - Official Documentation

This repository contains the official guides for Sanctuary OS, covering both standard Citizen operations and Elevated Clearances.

---

## 📖 Table of Contents
- [Part 1: Official Citizen Guide](#part-1-official-citizen-guide)
  - [Cartographer Initialization (Initial Setup)](#cartographer-initialization-initial-setup)
  - [The Command Center](#the-command-center)
  - [Your Vault](#your-vault)
  - [The Nexus](#the-nexus)
  - [Integrated Side Browser](#integrated-side-browser)
  - [The Side Panel Ecosystem](#the-side-panel-ecosystem)
  - [Blueprints](#blueprints)
  - [Homestead Lab](#homestead-lab)
  - [Conflict Radar](#conflict-radar)
  - [Citizen’s Workbench](#citizens-workbench)
  - [Time Capsule](#time-capsule)
  - [Compliance, DEFCON & Malware Security](#compliance-defcon--malware-security)
  - [System Preferences](#system-preferences)
  - [Quick Tips for Citizens](#quick-tips-for-citizens)
- [Part 2: Elevated Clearances](#part-2-elevated-clearances)
  - [Masons (Mod Creators)](#masons-mod-creators)
  - [Architects (Moderators)](#architects-moderators)
  - [Oversight (System Administrators)](#oversight-system-administrators)
  - [Wayfinders (System Developers)](#wayfinders-system-developers)
  - [Role Protocols](#role-protocols)

---

# Part 1: Official Citizen Guide

**Version:** 0.4.6 | **Last Updated:** July 8, 2026

> **Welcome to Sanctuary OS,**  
> Sanctuary OS has evolved from a robust mod manager into a local-first mod operations layer and desktop middleware for mod ecosystems. It relies on a "no asset hosting / metadata-only / offline-first" philosophy. 
> 
> Here is your complete User Guide to mastering this entirely new way of managing your environment.

## Cartographer Initialization (Initial Setup)
Upon your first launch, the Cartographer maps your machine’s layout.

- **Auto-Detect Paths:** Click the Cloud icon to automatically locate your game and document folders.
  - **Bin Folder (Live Path):** The directory where your game executable lives. *V4 Update:* Sanctuary no longer relies on the notoriously unreliable `GameVersion.txt`. It now parses the `Default.ini` manifest directly to guarantee 100% engine version accuracy.
  - **Mods Folder:** Your active game Mods folder.
  - **Vault Folder:** Select a safe, external directory to act as your isolated "Deep-Storage Archive."
- **Lexicon & Chameleon:** Customize your language (Lexicon Protocol—now including native German support) and UI theme (Chameleon Protocol) during setup.
- **OS Permissions Alert (Windows):** Sanctuary OS heavily relies on symlinking. The Cartographer will alert you if your OS lacks permissions. You must either run Sanctuary OS in Administrator Mode or enable Developer Mode in your Windows System Settings to prevent the OS from falling back to hard links.
- **DNA Hashes:** Every file generates a unique SHA-256 hash, cross-referenced with the global Cloud Database.

## The Command Center
The Command Center has been entirely redesigned in V4 to provide a high-level, dashboard-style view of your loadout.

- **Dynamic System Status:** This new tile is actively tied to your selected Blueprint.
  - 🟢 **System Stable:** No Actions Required.
  - 🔵 **System Updates Available:** Artifact Updates are available.
  - 🟡 **Citizen Action Recommended:** An artifact is flagged as Unstable or Conflict Severity 3 Collisions detected.
  - 🔴 **Critical Failure Detected:** An artifact is flagged as Corrupted, Game Version Unsupported, Missing DLC/Dependencies, or Severity 4 Collisions detected.
- **Vault Integrity:** View your total Artifact count and see a breakdown of Verified vs. Unverified mods, as well as your active UI Extensions (Lexicons & Chameleons).
- **Quick Actions:** Instantly run a Radar Sweep, Lockdown the Vault (strip mods instantly), or Submit a Support Ticket.
- **Global Comm-Link:** A live feed of updates, patch notes, and transmissions directly from Masons. Features threaded multi-level replies, WYSIWYG/Markdown text formatting, dedicated "Discover" vs "Following" tabs, and pinned posts.
- **Sanctuary Support:** A dynamic in-house Support System designed from the ground up to streamline all support operations.

## Your Vault
Your Vault is your local library and secured asset storage. The game never touches these files directly; they are projected into the game via symlinks.

- **Global Drop-Zone:** Drag and drop `.package`, `.ts4script`, or `.zip` files anywhere into the OS window to ingest them.
- **Blueprint Hot-Swap:** Use the new dropdown directly in the Vault Header to switch your active mod profile without ever leaving the screen.
- **Select Assets Bar:** A floating, pill-shaped bar at the bottom of the screen allows for bulk actions: Draft a Blueprint, Group into a Virtual Folder, or Purge Archives.
- **Safety Protocol Filters:** Use the new filter dropdowns to instantly hide mods incompatible with your game version, or select "Only Show Eligible" to hide artifacts that are currently relied upon by other mods (preventing accidental breakage).
- **Deep Yeet 2.0:** If you attempt to delete a core mod (e.g., XML Injector), Sanctuary OS will intercept the action and display a "Yeet Cascade" inline alert/side panel, automatically queuing all dependent add-ons for removal to keep your bunker sterile.
- **Ghosted States:** Visually, broken or missing mods will be "Ghosted" with dynamic tooltips explaining exactly what is wrong (e.g., Game Version Unsupported, Missing DLC, Conflict Collision Severity 3/4).
- **Duplicate Intercept:** If you ingest a mod with a SHA-256 hash identical to one you already own, a DNA Match Side Panel will intercept you, allowing you to instantly replace/overwrite or ignore the clone.

## The Nexus
The global registry for community index, artifact discovery, and metadata links.

- **Artifacts:** Browse The Nexus for any Artifacts that are not currently in Your Vault. Automatically filters based on your installed Game Version and installed DLC.
- **Blueprints:** Browse The Nexus for premade Blueprints. Any citizen is free to share their Blueprints with the Nexus.
- **Lexicons:** Browse The Nexus for custom Lexicons (Language Packs). Filter by Default Languages/Theme Packs and by Language. Any Citizen is free to share their Lexicon with The Nexus.
- **Chameleons:** Browse The Nexus for custom Chameleons (Theme Packs). Filter by Dark or Light modes. Any Citizen is free to share their Chameleon with The Nexus.
- **Templates:** Browse The Nexus for custom Templates (Config Files). Any Citizen is free to share their Template with The Nexus.
- **Nexus Reports:** If you spot a broken mod, inaccurate data, or malware, use the Flag tool to instantly alert the Architects via Nexus Reports.

## Integrated Side Browser
Sanctuary OS includes a fully featured web browser directly integrated into the environment.

- **Download Interception:** The Side Browser automatically detects mod downloads (`.zip`, `.package`, `.rar`, `.7z`) and routes them directly into your Vault without ever opening an external window or clogging up your PC's standard Downloads folder.
- **Immersive Media:** Fullscreen video support, hidden UI elements (like ad banners or footers), and picture-in-picture capabilities are built-in for an uninterrupted experience.
- **Built-in Context Menus:** Customized right-click context menus are injected into the browser natively, allowing you to copy, paste, or open links in new tabs while remaining within the Sanctuary OS framework.

## The Side Panel Ecosystem
Across the entire operating system, complex tasks are handled via non-intrusive Side Panels, so you never lose your context.

- **Ticket Dossiers & Log Viewers:** Support staff and Masons can view active support tickets alongside code exceptions directly in the Ticket Dossier and Ticket Log Side Panels.
- **Conflict Resolution Sidebar:** Manage your Severity 3 Tuning Overlaps directly from the side panel, declaring winners on the fly.
- **Blueprint Swaps:** Instantly hot-swap entire loadouts using the Blueprint Swap panel without leaving your current view.
- **Audit Logs & Diagnostics:** Elevated Clearances have access to side panels like the Audit Log Viewer to monitor real-time system changes.

## Blueprints
Sanctuary OS replaces manual file moving with Blueprints (tactical loadouts).

- **Drafting:** Create profiles to swap between different sets of mods instantly.
- **Blueprint Alerts:** A dynamic Button/Side Panel that shows current known issues with the blueprints loadout.
- **Import/Export:** A JSON-based system. Blueprints can be imported/exported and shared without the cloud or internet connection.
- **Blueprint Uplink:** A cloud-based coordinate system. Blueprints can be shared via 6-digit alphanumeric hashes (`SNCXXX`).
- **Snapshot Active Blueprint:** Clone the deployed Blueprint into an editable local copy.

## Homestead Lab
The Homestead Lab allows you to test unknown mods in a "Nuke" environment.

- **Conduct Experiment:** Sanctuary isolates your game, injecting only the specific mod you want to test and its mandatory requirements.
- **Conflict Experiments:** Citizens can select two conflicting artifacts. If it crashes, the UI immediately displays the Exception Log output and allows Architects to map a new conflict rule to the Registry Database.
- **Real-time Monitoring:** The Lab monitors for any error and game crash logs. If the game crashes, the Lab catches the log snippet immediately, halts the test, and fails the mod, keeping your main save entirely safe.

## Conflict Radar
Sanctuary reads the code inside your files to prevent game-breaking issues before they happen.

- **Severity 4 Collisions (Fatal Engine Clash):** Core Python/Binary overlaps. Overrides are impossible; one mod must be removed.
- **Severity 3 Collisions (Tuning Overlap):** XML/SimData overlaps. You crown a "Winner" in the UI to determine which mod takes priority. Selecting a winner automatically handles the custom symlink routing (using a custom `Resource.cfg` and a custom priority folder) behind the scenes to enforce your choice in-game.
- **Severity 2 Collisions (Duplicate File):** Artifacts that share the same TGIs. These are mostly High-Quality and Standard Quality of the same Artifact being equipped at once.
- **Severity 1 Collisions (Minor Overlap):** Usually safe texture or low-impact overrides. Safe to ignore and are collapsed by default.

## Citizen’s Workbench
The Citizens Workbench allows you to configure Artifacts without manually editing raw files.

- **The Workbench features two primary interfaces:**
  - **Visual Interface:** Generates interactive UI controls (toggles, sliders, dropdowns) based on a loaded Template (`.json`). This protects users from making syntax errors while editing advanced config files.
  - **Raw Editor (Template Architect):** This mode unlocks the raw underlying file in a full IDE environment powered by Monaco. It supports direct syntax editing, live error linting, and is fully integrated with the Sanctuary UI aesthetic.
- **Author Mode:** By selecting a `.json` file, the Workbench automatically enters Author Mode, allowing you to design and test custom Visual Interfaces for any configuration file.
- **Real-time Synchronization:** Changes made in the Visual Interface immediately update the underlying Raw Editor (and vice-versa).
- **Template Saving:** You can save your authored UI definitions locally. The Workbench stores these in your active data sets to override default mod configurations.

## Time Capsule
Sanctuary OS handles automated backups using ultra-fast ZSTD compression.

- **World State (Purple):** Snapshots of your Saves, Tray, and `Options.ini`/`UserSettings.ini`.
- **Engine Core (Pink):** Backups of the actual game installation files (`Game/Bin`, `Data`).
- **True Rollback Safety:** Restoring a backup physically obliterates the live folders first, ensuring "future-state" contaminated data doesn't bleed into your rolled-back timeline.
- **Back-Ups & Rollbacks:**
  - Sanctuary OS uses local compression and restore pipelines designed for fast disaster recovery.

| Operation | Tested Data | Result |
| :--- | :--- | :--- |
| **World State Backup** | ~500 MB | ~4 seconds |
| **World State Restore** | ~500 MB | ~1 second |
| **Engine Core Backup** | ~78 GB → ~24 GB | ~80 seconds |
| **Engine Core Restore** | ~24 GB → ~78 GB | ~45 seconds |

> *Benchmarked on local test hardware. Results vary by drive speed, CPU, file count, compression level, and antivirus activity.*

## Compliance, DEFCON & Malware Security
Security is handled through a tiered global compliance system managed by Oversight.

- **DEFCON 1:** When an official game patch is actively rolling out, Wayfinders or Oversight trigger a network-wide DEFCON 1 signal. Sanctuary intercepts the game launch and forces an Emergency Backup to prevent data corruption.
- **Compliance Tier 1 (NSFW) & Tier 2 (Explicit):** Adult content is permitted for local use and Vault storage. However, these artifacts are scrubbed from the Global Nexus Feed and stripped from public Cloud Blueprints to maintain legal compliance.
- **Malware Interception (Compliance Tier 3):** If malware DNA is detected during a Radar Sweep, Sanctuary triggers a Zero-Choice Lockdown. You will be hit with an unclosable "Critical Danger" modal enforcing a **Secure Shred** - a destructive overwrite and removal of the malicious files via the Rust backend.
- **External Secure Shred:** The OS takes the absolute path of a file, removes any read-only constraints, executes a destructive overwrite and removal of the malicious files via the Rust backend.
  - Files are not automatically deleted.
    - A Citizen’s Signature is required.
  - This prompt will only occur during the ingest process (Drag & Drop)
  - The Original File’s path is stored in volatile memory during the install process
  - This process does not occur for retroactive alerts
- **Nuclear Override:** A hidden toggle exists in System Preferences. To reveal it, click the subtitle “Local configuration, identity, libraries, and security protocols” 5 times. This allows you to bypass quarantine, but doing so permanently blacklists your hardware ID from the Sanctuary Cloud, revoking all network privileges.

## System Preferences
Your System. Your Sovereignty. Your Preferences.

- **System Coordinates:** 
  - Your Vault Path, Active Library (Mods Folder), and the Bin Folder.
- **Time Capsule:** 
  - Set your DEFCON Agency Level, DEFCON Backup Target, Engine Core Retention Policy, World State Retention Policy, and Vault Max Capacity.
- **Network Credentials:** 
  - System ID, Update Comms (Email), and Update Passcode (Password).
- **Network:** 
  - Local Network Only (Offline Mode), Show Artifact Images (All External Images), Open Artifact Links inside Sanctuary (In App Web Browser) & Share Malware Manifests (Anonymous Reports for any Secure Shreds).
- **Notifications:** 
  - Replies, Support Replies, New Transmissions, Author-Only Replies, and Per-Mason Notifications.
- **Chameleon:** 
  - Preset Themes / Downloaded Themes / Theme Forge Suite.
- **Lexicon:** 
  - Preset Language Packs / Downloaded Language Packs.
- **Logic Integrity (Anarchy Protocols):** 
  - Highlander Enforcement (Flavors), Nuclear Family Cohesion (Twins), Dependency Chain-Link, and Conflict Intercept (Collision Severity 4).
- **Malware Protocol:** 
  - Malware Protocol: Preferences subtitle ×5. This permanently severs your profile from the global network, granting you unrestrained local sandbox authority.

## Quick Tips for Citizens:
1. **Trust the Airgap:** Never put files directly in your "Electronic Arts" Mods folder. Drop them into Sanctuary and let the OS handle the symlinks.
2. **Missing DLC/Versions:** Pay attention to the Addon Drawer. If a mod card has a red "Broken" icon instead of a plus sign, hover over it. The tooltip will dynamically tell you exactly what is wrong (e.g., `MISSING DLC: [Packs]`, `VERSION MISMATCH`, or `MISSING ARTIFACT`).
3. **Follow Masons:** Click a creator's name in The Nexus to view their new Mason Profile and click Follow. Their updates will now securely appear in your "Following" tab inside the Comm-Link.
4. **Check your Status:** If your Command Center tile is Amber or Red, run a Radar Sweep and follow the Citizen Action Recommended Alert.
5. **Watch the Launch Button:** Green is all clear. If it’s Red, that means a Patch Update is currently rolling out.
6. **Account Not Required:** The offline version of Sanctuary OS does not require an account.
   - The Nexus, Comm-Link, Blueprint Uplinks, Deep Yeet, Ghosted States, DEFCON Alerts, and Malware Intercepts will be unavailable while offline/logged out.

---

# Part 2: Elevated Clearances

**Version:** 0.4.5 | **Last Updated:** July 7, 2026

> This section of the guide covers the elevated roles within Sanctuary OS. All administrative hubs have been designed into specialized Workshop, Console, and Operations environments to ensure 1:1 workflow consistency between creators and staff.

## Masons (Mod Creators)
The Mason Workshop is the specialized environment for building, publishing, and maintaining artifacts.

- **Command:** A top-down view of your creative output. View live metrics for your collections, active followers, and total "Uplinks."
- **The Mason IDE:** A built-in, fully responsive Monaco editor for editing `.js`, `.ts`, `.json`, and `.xml` files directly within Sanctuary OS, linked to an isolated Dev Sandbox.
- **Protocol Orchestrator:** Map the logic of your mod. Define Twins & Addons (files that must deploy together), Alternative Versions (Betas or Flavors), and Recursive Dependencies.
- **Collections Builder:** Group multiple artifacts into curated Collections (CC Sets) for Citizens to equip.
- **Conflict Manager:** Empower Masons to map and author their own conflict Directives for the global Conflict Matrix.
- **Structure Builder:** Visually define the exact folder structure your mod must maintain when deployed.
- **Your Nexus Releases:** Manage your public-facing catalog. Includes 1:1 synchronization with Architect-level metadata.
- **Bug Reports & Support Dossier:** Respond directly to user-submitted bug reports and view attached error logs in the Code Snippet viewer.
- **Comm-Posts:** Publish network-wide broadcasts. Features a real-time Preview tab and WYSIWYG editor.

## Architects (Moderators)
The Architect Console is the logic and data center used by the elite to maintain the Global Registry.

- **Verify Hash:** A utility to instantly check any file’s DNA against the database and pull up its Edit Artifact panel.
- **The Scout Queue:** Process artifacts Sanctuary has never seen. Architects review crowdsourced DNA hashes and bind them to the official database.
- **Conflict Matrix:** Forge global "Directives." When an Architect establishes that "Mod A" crashes "Mod B," that logic is beamed down to every Citizen’s Conflict Radar globally.
- **Template Oversight:** A dedicated hub for verifying, flagging, and approving community-submitted Config Templates for the Citizen's Workbench.
- **Structure Matrix:** Visually define the exact folder structure a mod must maintain when deployed to ensure maximum engine performance.
- **Nexus Reports Queue:** Review and triage user-flagged artifacts (e.g., Lexicon, Chameleons) directly from The Nexus.
- **Citizen Support Desk:** A complete support ticketing system for resolving user issues seamlessly.

## Oversight (System Administrators)
Oversight Command holds the keys to Sanctuary OS’s infrastructure, focusing on security, role governance, and advanced conflict escalations. Oversight operates from this hub, wielding elevated privileges over the global network.

- **Global DEFCON Override:** Oversight can manually override/emergency-trigger network-wide game lockdowns and emergency backups ahead of unannounced game patches.
- **Identity Matrix:** The master ledger of all Citizens. Instantly view, promote, demote, or ban identities.
- **Compliance & Malware Oversight:** The master security dashboard. Oversight can manually flag dangerous DNA signatures as Compliance Tier 3 (Malware), triggering automatic SECURE SHREDS globally for any user with that file.
- **Mass Update Utility:** Batch-update hundreds of registry entries at once.
- **Game Management:** The "Source of Truth" for game versions. Register new EA Patches and DLC IDs to the Global Registry.
- **Mason Linker:** Manually verify and link Citizen identities to claimed Nexus mod author profiles.
- **Support Infrastructure:** Manage support categories, global macro templates, and route escalated tickets for the global Citizen Support Desk.

## Wayfinders (System Developers)
Wayfinder Operations is used for network-level maintenance and platform-wide broadcasts.

- **Global DEFCON:** Wayfinders can initiate scheduled/operational DEFCON events.
- **Registry Health Status:** A real-time telemetry tile showing current Database Latency (ms), CPU usage, memory allocation, and server connectivity status.
- **The Dispatch:** A specialized broadcast channel used exclusively for system maintenance alerts, new feature announcements, and policy updates.
- **Audit Logs:** A permanent, undeletable ledger of every database mutation, role change, and security flag executed by the administration is tracked in an append-only audit ledger intended to preserve administrative accountability. Wayfinders use this for accountability and system forensics.

## Role Protocols:
1. **Workflow Consistency:** The Support Queue and Artifact Dossiers are 1:1 copies across all elevated roles. This ensures a moderator (Architect) and a developer (Wayfinder) see the exact same data when troubleshooting a ticket.
2. **The "Sever Access" Rule:** Only Wayfinders and Oversight can engage the Nuclear Override for an account, which permanently severs a profile from the global network.
3. **Local vs. Global:** Architects and Oversight are reminded that edits to the Global Registry affect all users, while edits in the Local Override Layer affect only the user's personal installation.
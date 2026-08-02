**Sanctuary OS**
# Master Architecture & Feature Document

**Document Version: **V4
**Last Updated:** July 31, 2026

Welcome to Sanctuary OS,

Sanctuary OS has evolved from a robust mod manager into a local-first mod operations layer and desktop middleware for mod ecosystems. It relies on a "no asset hosting / metadata-only / offline-first" philosophy.


## **Technology Stack & Architecture**
Sanctuary OS is built on a highly modular, decoupled architecture:

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v3.
- State Management: Zustand (Global State & UI Overlays).
- **Desktop Framework:** Tauri v2 (Handles native file-system operations, avoiding JavaScript limitations).
- **Backend / Database:** Supabase (PostgreSQL, GoTrue Auth, Realtime WebSockets) for cloud synchronization and global DNA registry oversight.
- **Rust Core Capabilities:** ultra-fast compression pipelines for backups, serde, sha2 (hashing), and custom binary parsers for reading DBPF files (The Sims 4 .package format).

## **Governance & Workspace Roles**
The ecosystem is sustained through distinct roles managed via the Identity Matrix, ensuring consistent workflows across all administrative tiers.
- **Sanctuary Foundry:** The core organization maintaining the Sanctuary OS platform. The Foundry is responsible for ensuring the success of both the core Sanctuary OS platform & all Sanctuary Partners.
- **Keepers:** The core developers/maintainers working within the Foundry. This is the team responsible for the maintenance and evolution of the Sanctuary OS Platform.
- **Wayfinders:** Community Managers responsible for Community maintenance, managing the Registry Health Status, and broadcasting via The Dispatch. Wayfinders can initiate scheduled/operational DEFCON events.
- **Oversight:** System Administrators who manage global compliance. They possess the authority to manually flag artifacts as Compliance Tier 3 (Malware), oversee the Identity Matrix for promotions/demotions, and manage Game/DLC registration. Oversight can manually override/emergency-trigger network-wide game lockdowns and emergency backups ahead of unannounced game patches.
- **Architects:** System moderators responsible for maintaining the Conflict Matrix, establishing global "Directives," reviewing the Scout Queue, and verifying Homestead Lab reports.
- **Masons:** Mod Creators - The Builders. They utilize the Mason IDE and Protocol Orchestrator to define mod logic and dependencies. They manage creator-to-user relations via the Support Dossier.
- **Citizens:** The core population. Everyday players who curate Blueprints, perform field-testing, and provide the crowdsourced data that powers the Nexus database.

## **Vault Storage & Sanitize 2.0**
Sanctuary OS no longer utilizes a flat folder structure. The Vault acts as a secure, containerized archive that is never touched by the game engine.
- **Nested Hierarchy:** The Vault automatically deploys and enforces a strict path hierarchy:
- Backups/World (Purple State)
- Data/Cache
- Blueprints/
- Quarantine/
- Mods/ (The secure storage of artifacts)
- **Vault Sanitization**
- Rather than rigidly isolating every artifact into its own micro-folder, Sanctuary OS employs a self-healing **Sanitize Vault** protocol. It acts as an automated directory sweeper that enforces a healthy, clutter-free file structure without restricting how you organize your library.
- **Infrastructure Enforcement:** Instantly verifies and re-generates missing core directories (Backups, Quarantine, Themes, Blueprints, etc.) to ensure the Vault's foundation is always intact.
- **Backup Vacuuming:** Automatically detects stray <code>.zst</code> backup archives dropped in the root of the Vault and seamlessly files them into their proper <code>Backups/World</code> destination.
- **Dead Folder Sweeping:** Recursively scans your active Library to aggressively prune and delete empty, dead directories left behind by uninstalls or file movements, preventing clutter without forcing a strict "one mod, one folder" rule.
- **Filename Sanitization:** The OS automatically cleans messy filenames (e.g., more_cas_columns_v4.package becomes More Cas Columns).
- **Local Override Layer: **The Mod Dossier is completely decoupled from the Cloud for local customization. Users can natively edit Mod Names, Authors, URLs, Cover Images, and Custom Tags. 
- **The Scout Dossier: **During a Radar Sweep, any mod that lacks a global DNA match and isn't explicitly flagged as local is grouped into an "Unidentified Artifacts" queue. Citizens can quickly map them to the network via the Scout Dossier or permanently click "FLAG AS LOCAL" to opt them out of future global syncs.
- **Manual Download Assistant:** To preserve web traffic for creators, Sanctuary opens the browser to the Mason's URL and waits. Once the user drags and drops the downloaded .zip into the UI, Sanctuary automatically unzips and vaults the Artifacts.
- **Download Interception:** The Side Browser automatically detects mod downloads (.zip, .package, .ts4script, .rar, .7z) and routes them directly into your Vault without ever opening an external window or clogging up your PC's standard Downloads folder.

## **The Airgap & Cartographer Protocols**
Sanctuary OS acts as a deeply integrated middleware operating system rather than a simple file manager.
- **The Cartographer:** An automated reconnaissance system that scans for the Game Bin and Mods directory on first boot.
- **Symlink Air Gap 2.5:** The OS creates physical folder structures in the game’s live directory but projects the actual artifacts (.package/.ts4script) via high-speed symlinks. This ensures maximum engine performance with zero data bloat in the Documents folder.
- **Engine Version Recognition:** Sanctuary has deprecated GameVersion.txt. It now parses the Default.ini executable manifest in the Bin Folder to extract the genuine patch version, preventing "Update-Day Disasters."
- **Dynamic Config Watcher:** A non-blocking thread monitors the game path for changes to .cfg, .ini, and .json files (such as MCCC settings), automatically syncing them back to the Vault.

## **Atomic Logic & Conflict Management**
The Nexus Database uses SHA-256 DNA signatures to handle complex mod interactions through Atomic Logic.
- **The Highlander Rule:** Automatically evicts rival mods. Equipping a specific "Flavor" of a mod will seamlessly unequip its competing versions.
- **Nuclear Family Cohesion (Twins):** Bidirectional logic ensures that if a script file is equipped, its corresponding package file is pulled in automatically.
- **Recursive Dependencies (Chain-Link):** Equipping an Addon auto-equips its Master record. If a dependency is missing, the OS triggers a dynamic prompt to locate it on The Nexus.
- **Deep Yeet 2.0 (Cascade Removal):** Removing a Master mod automatically alerts the user and queues all downstream dependent artifacts for removal to prevent engine cascades.
- **Conflict Severity 4 Collisions (Fatal Override):** DBPF Index reading detects duplicate Instance IDs (Duplicate logic). The system grays out "Mortal Enemies" to prevent engine hard-crashes.
- **DLC Ghosting:** Mod cards automatically cross-reference owned/masked DLC. If a requirement is missing, the card goes into a "Ghosted" state with precise warning text.
- **The Copilot Philosophy:** The system identifies cascades, but halts for a Citizens signature. The OS suggests fixes, but the citizen maintains 100% control over the vault’s final state.

## **Testing, Diagnostics & Time Capsule**
Sanctuary provides a fully functional simulated boot environment for diagnostic triage.
- **Homestead Diagnostics:**
- **100% Nuke Injection:** The Lab wipes all active symlinks and injects only the test subjects.
- **1v1 Stability Protocol:** Users can pit two conflicting mods against each other while the OS monitors engine logs in real-time.
- **Time Capsule:**
- **Snapshots:** The system independently snapshots Game Saves (Universe) and Core Scripts (Engine).
- **Automated Version Tracking:** The OS automatically detects your active game version by scanning the executable manifest prior to executing backups and post-restore to guarantee timeline and version integrity.
- **Hardlink-Based Incremental Backups:** Replaced legacy compression with an ultra-fast hardlink engine. If a file hasn't changed since your last snapshot, the OS creates a native OS hardlink rather than duplicating it. This results in near-instant, zero-disk-footprint backups for unmodified files.
- **Rollback Safety:** Restoring a backup utilizes a high-speed differential mirroring process. Rather than blindly wiping the entire installation, the OS intelligently compares the live state to the backup snapshot, instantly deleting rogue files and restoring changed data to guarantee 100% timeline integrity without the performance penalty of a full wipe.

## **Security & The Nuclear Override**
A tiered compliance system maintains a balance between user sovereignty and network integrity.
- **Compliance Tier 1 (NSFW) & Compliance Tier 2 (Explicit):** Adult content is permitted for local use and Vault storage. However, these artifacts are scrubbed from the Global Nexus Feed and stripped from public Cloud Blueprints to maintain legal compliance.
- **Compliance Tier 3 (Malware):** Detected malware triggers a Zero-Choice Lockdown. The OS is halted, and the user has no option to continue normal operation, but destructive removal still requires explicit signature.
- **External Secure Shred:** The OS takes the absolute path of a file, removes any read-only constraints, executes a destructive overwrite and removal of the malicious files via the Rust backend.
- Files are not automatically deleted.
- A Citizen’s Signature is required.
- This prompt will only occur during the ingest process (Drag & Drop)
- The Original File’s path is stored in volatile memory during the install process
- This process does not occur for retroactive alerts
- **The Nuclear Override:** Located in System Preferences, this one-time toggle allows a user to bypass security lockouts. Engaging this tags the user as Blacklisted on the Identity Matrix, instantly and permanently severing all communication with the Sanctuary Cloud.

## **Interface & Lexicon Framework**
- **Chameleon Protocol:** A CSS theme injection engine allowing instant hot-swaps between themes (Dracula, Radiant, The Void) using Glassmorphism V2 (backdrop blurs and dynamic shadows).
- **Lexicon Protocol (Word-as-a-Service):** All UI strings are extracted to dynamic .json dictionaries. This enables Persona Packs (e.g., standard English vs. Lore-Friendly immersive terminology) and modular internationalization.
- **The Side Panel Ecosystem: **Across the entire operating system, complex tasks are handled via non-intrusive Side Panels, so you never lose your context.
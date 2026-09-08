# Sanctuary OS
## Master Protocol List

**Document Version:** V5
**Last Updated:** August 8, 2026

### System Foundation & Setup
* **The Cartographer:** An automated reconnaissance system that scans for the Game Bin and Mods directory on first boot.
* **DNA & Delta Caching:** SHA-256 hashing for all artifacts in the Vault, paired with an mtime-first delta cache.
* **Nested Hierarchy:** The Vault automatically deploys and enforces a strict path hierarchy: Backups/World (Purple State), Backups/Engine (Pink State), Data/Cache, Blueprints/, Quarantine/, Mods/ (The secure storage of artifacts)
* **System Version Ripper:** A custom parser that parses the Default.ini executable manifest in the Bin Folder to extract the genuine patch version, preventing "Update-Day Disasters."
* **Agnostic Protocol:** The OS will not be locked down to a single game. No game specific file extensions or paths in the Source Code (External JSON’s) and The Parser and Scanners will be modular.

### Mod Management & Organization
* **Vault Sanitization:** Rather than rigidly isolating every artifact into its own micro-folder, Sanctuary OS employs a self-healing Sanitize Vault protocol. It acts as an automated directory sweeper that enforces a healthy, clutter-free file structure without restricting how you organize your library.
* **Filename Sanitization:** The OS automatically cleans messy filenames (e.g., more_cas_columns_v4.package becomes More Cas Columns).
* **Manual Download Assistant:** To preserve web traffic for creators, Sanctuary opens the browser to the Mason's URL and waits. Once the user drags and drops the downloaded .zip into the UI, Sanctuary automatically unzips and vaults the Artifacts.
* **Download Interception:** The Side Browser automatically detects mod downloads (.zip, .package, .rar, .7z) and routes them directly into your Vault without ever opening an external window or clogging up your PC's standard Downloads folder.
* **Symlink Airgap 2.5:** The OS creates physical folder structures in the game’s live directory but projects the actual artifacts (.package/.ts4script) via high-speed symlinks. This ensures maximum engine performance with zero data bloat in the Documents folder. 
* **100% Nuke Injection:** The Lab wipes all active symlinks and injects only the test subjects.
* **Automated Exception Log Purge:** The `launch_game` Rust sequence automatically scans the `The Sims 4` directory and permanently deletes stale `lastException*.txt` and `BE-ExceptionReport*.html` / `mc_lastexception.html` logs right before ignition.
* **Duplicate Intercept:** If you ingest a mod with a SHA-256 hash identical to one you already own, a DNA Match Side Panel will intercept you, allowing you to instantly replace/overwrite or ignore the clone.

### Stability & Conflict Resolution
* **Anti-Flip Protection:** Enhanced requirement solvers to respect manual flavor selections (test/beta versions).
* **The Highlander Rule:** Automatically evicts rival mods. Equipping a specific "Flavor" of a mod will seamlessly unequip its competing versions.
* **Nuclear Family Cohesion (Twins):** Bidirectional logic ensures that if a script file is equipped, its corresponding package file is pulled in automatically.
* **Recursive Dependencies (Chain-Link):** Equipping an Addon auto-equips its Master record. If a dependency is missing, the OS triggers a dynamic prompt to locate it on The Nexus.
* **Deep Yeet 2.0 (Cascade Removal):** Removing a Master mod automatically alerts the user and queues all downstream dependent artifacts for removal to prevent engine cascades.
* **Conflict Severity 4 Collisions (Fatal Override):** DBPF Index reading detects duplicate Instance IDs (Duplicate logic). The system grays out "Mortal Enemies" to prevent engine hard-crashes.
* **Ghosted States:** Visually, broken or missing mods will be "Ghosted" with dynamic tooltips explaining exactly what is wrong (e.g., Game Version Unsupported, Missing DLC, Collision Severity 3/4 Conflicts).
* **1v1 Stability Protocol:** Users can pit two conflicting mods against each other while the OS monitors engine logs in real-time.

### Security & Compliance
* **Citizen’s Signature:** High-stakes confirmation gate for all permanent file operations.
* **The Quarantine Zone:** A dedicated bio-hazard sector for Malicious artifacts.
* **Florida Compliance Layer:** Compliance Tiers 1-4 (Explicit, Illicit, Extreme Violence, Taboo) content is permitted for local use and Vault storage. However, these artifacts are scrubbed from the Global Nexus Feed and stripped from public Cloud Blueprints to maintain legal compliance. Severe artifacts (Tiers 3-5) additionally trigger a Vault Lock restricting support operations.
* **The DEFCON System:** A real-time global_network_status listener via Supabase. The OS proactively detects game patches (Level 1) and triggers automated Pre-Patch Snapshots before user interaction. 
* **Zero-Choice Lockdown:** Detected malware (Tier 5) triggers a Zero-Choice Lockdown. The OS is halted, and the user has no option to continue normal operation, but destructive removal still requires explicit signature.
* **External Secure Shred:** The OS takes the absolute path of a file, removes any read-only constraints, executes a destructive overwrite and removal of the malicious files via the Rust backend.
  * Files are not automatically deleted.
    * A Citizen’s Signature is required.
  * This prompt will only occur during the ingest process (Drag & Drop)
  * The Original File’s path is stored in volatile memory during the install process
  * This process does not occur for retroactive alerts
* **The Nuclear Override:** Located in System Preferences, this one-time toggle allows a user to bypass security lockouts. Engaging this tags the user as Blacklisted on the Identity Matrix, instantly and permanently severing all communication with the Sanctuary Cloud.

### User Interface & Experience
* **Local Override Layer:** The Mod Dossier is completely decoupled from the Cloud for local customization. Users can natively edit Mod Names, Authors, URLs, Cover Images, and Custom Tags.
* **The Scout Dossier:** During a Radar Sweep, any mod that lacks a global DNA match and isn't explicitly flagged as local is grouped into an "Unidentified Artifacts" queue. Citizens can quickly map them to the network via the Scout Dossier or permanently click "FLAG AS LOCAL" to opt them out of future global syncs.
* **The Copilot Philosophy:** The system identifies cascades, but halts for a Citizens signature. The OS suggests fixes, but the citizen maintains 100% control over the vault’s final state.
* **Dynamic Config Watcher:** A non-blocking thread monitors the game path for changes to .cfg, .ini, and .json files (such as MCCC settings), automatically syncing them back to the Vault.
* **Blueprint Uplink:** In addition to the local JSON imports/exports, loadouts can be shared via 6-digit alphanumeric hashes (SNCXXX), enabling "Pull Uplink" that bypasses manual file handling.
* **Intelligent Google Fallback:** If a mod lacks a URL, the button transforms into Smart Search and dynamically throws the mod's Display Name into a Google Search to point the citizen in the right direction.
* **The Side Panel Ecosystem:** Across the entire operating system, complex tasks are handled via non-intrusive Side Panels, so you never lose your context.
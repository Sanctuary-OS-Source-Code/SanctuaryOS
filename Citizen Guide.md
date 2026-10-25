# Sanctuary OS — Official Citizen Guide & Interactive OS Walkthrough

New to Sanctuary OS? This 7-stage walkthrough explains every persistent bar, button, card, and drawer in the operating system so you always know what each control does before clicking it.

---

# Part 1: Step-by-Step OS Walkthrough (What Everything Does)

## Stage 1: Global Shell Anatomy (Sidebar, Top Workspace Pill & Morphing Dock)
Sanctuary OS is framed by three persistent glassmorphic regions that adapt dynamically to whether you are on the **Foundry Landing Page** or inside an active **Game Workspace**:
- **Left Navigation Sidebar (`Sidebar.tsx`):**
  - **On the Landing Page:** Displays Web/Foundry scrolling Quick Links (**Active Workspaces**, **Sanctuary Foundry News**, **System Directives**, **System EULA**, **Preferences**) and—exclusively for Keepers—the **Sanctuary Foundry -> Keepers Core** hub. Game workspace links and the **Quick Launch** button are cleanly hidden here.
  - **Inside a Mounted Game Workspace:** Displays the 9 Citizen Operational Sectors (**Command Center**, **Your Vault**, **The Nexus**, **Blueprints**, **Comm-Link Feed**, **Conflict Radar**, **Homestead Lab**, **Workbench**, **Time Capsule**), your unlocked Command Hubs (**Mason Workshop**, **Architect Console**, **Oversight Command**, **Wayfinder Operations**, **Keepers Core**), and the bottom **Quick Launch** ignition button.
- **Top Center Workspace Pill (`TitleBar.tsx`):**
  - Click the centered game pill (e.g., `The Sims 4 ▾`) at the top of the window to switch between mounted game workspaces, return to the **Sanctuary Foundry Landing Page**, or mount a new game instance.
- **Bottom Morphing Status Pill (`SystemStatusBar.tsx`):**
  - A single centered, auto-tucking Liquid Glass dock at the bottom of the screen.
  - Houses **1-Click Radar Sweep**, **Vault Lockdown** (strip all active symlinks immediately), **Blueprint Quick-Swap**, **Side Browser Toggle**, **Notification Center**, and live inline telemetry badges for **Incompatible Mods**, **Available Updates**, and **Active Conflicts**. Automatically tucks out of the way when a `SidePanel` opens or when you scroll to the bottom of a view.

## Stage 2: Mounting a Game Workspace & The Cartographer
When you select a game workspace from the Landing Page or the Top Workspace Pill for the first time, **The Cartographer** opens to map your local coordinates:
- **Bin Folder (Executable Path):** Point this to the folder containing your game executable (e.g., `TS4_x64.exe`). Sanctuary's in-process Rust PE parser (`pelite`) reads the genuine engine version directly from the binary headers without spawning background processes.
- **Mods Folder (Live Game Directory):** Point this to the folder where the game loads mods. Sanctuary keeps this folder 100% clean—never drop files directly here; Sanctuary projects your active mods here via high-speed symlinks.
- **Vault Folder (Deep-Storage Archive):** Choose a dedicated storage folder on your drive. Sanctuary automatically builds `Mods/`, `Blueprints/`, `Backups/World/`, `Backups/Engine/`, `Quarantine/`, and `Data/Cache/`.
- **Lexicon & Chameleon Selection:** Pick your terminology layer (**Standard English**, **Sanctuary Cyberpunk**, **Sims Friendly**, or **Simlish**) and your **Liquid Glass Chameleon Theme**.

## Stage 3: Your Vault, Mod Cards & ActionPill Toolbar
Inside **Your Vault**, every mod lives safely inside your isolated Vault archive:
- **Global Drag-and-Drop Ingest:** Drag `.package`, `.ts4script`, `.zip`, `.rar`, `.7z`, `.tar.zst`, or `override.json` files anywhere onto the Sanctuary OS window. Sanctuary hashes every file with SHA-256 (`DNA`), runs the Dual-Tier Rust Heuristic Scanner, and checks the Spoke Registry.
- **Top `StatTileCarousel` & `ActionPill`:**
  - The top row of `DashboardStatTile` cards switches primary sub-views and shows live counts.
  - Below it sits the unified **`ActionPill`** containing the instant Search Bar, the **`Filters` (`tune`)** popover, sort controls, and context actions.
- **Mod Card Anatomy & Suite Grouping:**
  - **Equip Toggle Switch:** Projects or unlinks the mod's symlink in your live game folder in milliseconds.
  - **Parent Suite Grouping:** Multi-part mod suites (like *MC Command Center* and its 13 `.package`/`.ts4script` modules) automatically coalesce into a single clean Parent Card with an expandable **`{N} Linked Modules ▾`** drawer.
  - **Status Badges & Ghosted Cards:** Transparent outlined badges show `Verified`, `Update Available`, `Missing DLC`, `Version Mismatch`, or `Conflict`. Hovering a Ghosted card reveals an instant diagnostic tooltip explaining why the mod is blocked.
  - **Clicking a Card (`ModDossier` SidePanel):** Opens the right-hand Dossier drawer where you can customize local names/tags/URLs, link a decentralized `manifest.json` URL, inspect included files, or view version history.

## Stage 4: Blueprints & 1-Click Loadout Hot-Swapping
**Blueprints** replace manual folder dragging with instant, saved mod loadouts:
- **Drafting & Hot-Swapping:** Create separate Blueprints for different saves or playstyles (e.g., *Realism Save*, *Occult Challenge*, *Vanilla Patch Test*) and hot-swap between them from the Vault header or the bottom Morphing Dock.
- **Offline JSON Export & Cloud Uplink Codes (`SNCXXX`):** Export any Blueprint to a portable `.json` file (which carries your custom local `modMeta` URLs and workspace identity offline) or generate a 6-character Cloud Uplink code (`SNCXXX`) to share with friends or publish to The Nexus.

## Stage 5: Conflict Radar, Load Order Engine & Homestead Lab
When two mods edit the same game tuning or scripts, Sanctuary catches the collision before you launch the game:
- **Conflict Radar (Casual vs. Advanced Mode):**
  - **Casual Mode:** Displays Severity 3 Tuning Overlaps side-by-side so you can click **"Pick a Winner"** in one click. Sanctuary automatically routes the winning mod into a higher priority tier (`Sanctuary1`–`Sanctuary3` and dynamic `Resource.cfg`).
  - **Advanced Mode:** Unlocks the full **Load Order** tab with the interactive **Quick Rule Builder** (`Must Load After` / `Must Load Before`), topological sort verification, and 1-click **Break Loop** circular dependency resolution.
- **Homestead Lab (Proving Grounds):**
  - **100% Nuke Isolation Test:** Temporarily unlinks your main loadout and injects *only* the suspect mod (and its required dependencies) or pits two conflicting mods against each other in a **1v1 Stability Test**, monitoring live game crash logs automatically.

## Stage 6: Citizen's Workbench, Timeline Diff & Time Capsule
Configure mod settings visually and protect your saves and game binaries with zero-bloat snapshots:
- **Citizen's Workbench (`CitizenWorkbench.tsx`):**
  - **2-Column Visual Config Editor:** Edit massive `.cfg`, `.ini`, and `.json` files (430+ settings at 60 FPS) using toggles, dual `Min`/`Max` range steppers, keybind recorders, and a 1-click Category Pill Bar—with per-setting **Undo to Saved** and **Reset to Default** buttons.
  - **No-Code Visual Template Builder:** Build custom visual config UIs without writing raw JSON, including 1-click key auto-mapping from `.cfg`/`.ini` files and an interactive Icon Picker.
  - **2-Column Timeline & Diff Workspace:** Compare your live unsaved edits against your last save or any historical snapshot in either **Visual Diff** (card-by-card `Saved → Current` comparison) or **Raw Code Diff** (side-by-side Monaco diff).
- **Time Capsule (`TimeCapsule.tsx`):**
  - **World State (Saves/Settings) & Engine Core (Game Binaries):** Uses an incremental Rust hardlink engine so unchanged files take zero extra disk space, paired with differential rollback restoration.

## Stage 7: Open Mason Workshop, FIDO2 Passkey Vault & Malware Lockdown
Every Citizen inherits local creator tooling, backed by hardware-grade security:
- **Open Mason Workshop (Inherited by All Citizens):** Every authenticated Citizen has access to the **Mason Workshop** in the sidebar—including the **Dev Sandbox**, **Mason IDE**, **Unified 3-Tile Artifact Studio** (`Details & Versions`, `Files & Folders`, `Rules & Upload`), **Chameleon Theme Forge** (with 6 Liquid Glass Optics sliders), **Notepad**, and **Static Edge Release Packaging** (`manifest.json` + `override.json`).
- **FIDO2 Passkey & TOTP Vault (`SecurityVaultSidePanel`):** Elevated clearances (`Verified Mason`, `Architect`, `Oversight`, `Wayfinder`, `Keeper`) bind hardware keys, Windows Hello biometrics, or TOTP authenticators via a dedicated right-hand SidePanel lock that gates Elevated Hubs while keeping Citizen sectors accessible.
- **Full-OS Quarantine SidePanel Lockdown (`MalwareAlertModal`):** If a Tier 5 Malware hash or heuristic payload is dropped into the OS, Sanctuary immediately locks the entire OS shell (Sidebar, Top Bar, and Dock) and slides open the **Quarantine Lockdown SidePanel** showing the exact **Triggered By** rule (Known Hash or Heuristic Hit reason), **Detection Source** (`Spoke Registry • <Game>` or `Sanctuary Foundry`), an optional **Upload Anonymous Manifest** toggle, and the glass-red **Secure Shred** button.

---

# Part 2: Citizen Module Reference

## Cartographer Initialization
- **Auto-Detect Paths:** Automatically locates your game executable (`Bin`), `Mods` directory, and `Vault` archive path.
- **Native PE Version Extraction (`pelite`):** Extracts the exact patch version directly from the game binary in Rust without subprocess overhead, falling back to schema-defined `.ini` manifests when needed.
- **Symlink Permissions Check:** Verifies Windows Developer Mode or Administrator privileges so Sanctuary can project zero-copy symlinks into the game folder.

## The Command Center
- **Dynamic System Status Tile:** Color-coded operational readiness (`System Stable`, `Artifact Updates Available`, `Citizen Action Recommended`, `Critical Failure Detected`, or `Malware Alert`).
- **2-Column Alert & Update Drawers:** Click any alert counter to inspect Incompatible Mods or Available Updates in a clean 2-column grid where multi-file mod suites group under a single parent card.
- **Global Comm-Link & Interactive Dispatches:** Live feed from Masons, Wayfinders, and Keepers featuring a 2x2 glassmorphic **Dispatch Telemetry Header** (`Alert Type`, `Affected Target`, `Severity`, `Action Required`) and live **Interactive Community Polls**.

## Your Vault
- **Airgapped Symlink Projection:** Files stay inside `Vault/Mods/` and are projected into the live game folder via symlinks according to your active Blueprint and compiled Load Order.
- **Delete Cascade Protection (`Deep Yeet 2.0`):** Attempting to remove a master dependency (such as *XML Injector*) intercepts the action and lists all dependent child mods so you never orphan add-ons.
- **Duplicate & Static Edge Override Intercept:** Intercepts duplicate SHA-256 files or bundled `override.json` manifests via the DNA Match SidePanel.

## The Nexus & Integrated Side Browser
- **The Nexus:** Discover verified **Artifacts**, **Blueprints**, **Lexicons**, **Chameleons**, and **Workbench Templates**, filtered automatically by your game version and installed DLC.
- **Integrated Side Browser:** Download mods from external creator sites directly inside Sanctuary OS; the browser intercepts `.zip`, `.rar`, `.7z`, `.package`, `.ts4script`, and `override.json` downloads and pipes them straight through the Vault scanner.

## Blueprints
- **Instant Profile Switching:** Swap entire mod loadouts in a single click without copying or moving gigabytes of files.
- **Portable Offline JSON & Cloud Codes (`SNCXXX`):** Share loadouts via 6-character cloud codes or self-contained JSON files that preserve local custom metadata (`modMeta`).

## Conflict Radar & Load Order Engine
- **Severity 1–4 Collision Matrix:** Distinguishes harmless texture overlaps (Severity 1) and duplicate files (Severity 2) from Tuning Overlaps (Severity 3, solved by picking a Load Order winner) and Fatal Engine Clashes (Severity 4).
- **Schema-Driven Load Order Compiler:** Supports `folder_priority` (dynamic `Resource.cfg` + `Sanctuary1`–`Sanctuary3` override folders), `manifest_list` (`loadorder.txt`/`plugins.txt`), `numeric_prefix`, and `timestamp`.

## Homestead Lab
- **100% Nuke Sandbox:** Wipes active symlinks and injects only the test target and its mandatory dependencies.
- **Real-Time Exception Capture:** Watches game crash and exception logs (`lastException.txt`) during test runs and links findings directly to Architect conflict reports.

## Citizen's Workbench & Visual Config Studio
- **2-Column Visual Config Editor:** High-speed windowed editor for `.cfg`, `.ini`, and `.json` mod configs with category pills, `Min`/`Max` range steppers, and **Undo to Saved** / **Reset to Default**.
- **Visual Template Builder:** Build and share `.json` Workbench templates visually with 1-click key extraction.
- **2-Column Timeline & Diff Panel:** Inspect live unsaved changes or historical snapshots in **Visual Diff** or **Raw Code Diff**.

## Time Capsule
- **Incremental Hardlink Snapshots:** Separate **World State** (Saves/Tray/Settings) and **Engine Core** (Game Binaries) snapshots that only copy modified bytes while hardlinking unchanged files.
- **Differential Rollback Engine:** Restores snapshots by comparing live file states against the snapshot manifest, removing rogue files and restoring modified files in seconds.

## Compliance, DEFCON & Malware Quarantine SidePanel
- **DEFCON 1 Patch Shield:** Intercepts game launches during breaking game patch rollouts and forces an emergency Time Capsule snapshot before ignition.
- **Compliance Tiers 0–4:** Tiers 1–4 are permitted in local Vaults but automatically scrubbed from public Nexus feeds and public Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`).
- **Tier 5 Quarantine SidePanel Lockdown:** Locks the entire OS shell when known malware hashes or heuristic hits are detected, displaying full trigger diagnostics and enforcing a Citizen-signed **Secure Shred**.

---

# Part 3: 6-Tier Clearance Hierarchy & Command Hubs

Sanctuary OS enforces a strict separation between **Game Spoke Roles (`userRole`)** and **Core OS Hub Roles (`osRole`)** across 6 distinct clearance tiers:

## Tier 1: Citizen (Base Clearance + Open Mason Workshop Inheritance)
- **Scope:** Local Machine + Active Game Spoke (`userRole = 'citizen'`).
- **Capabilities:** Full access to all 9 Citizen modules (**Command Center**, **Vault**, **Nexus**, **Blueprints**, **Comm-Link**, **Conflict Radar**, **Homestead Lab**, **Citizen's Workbench**, **Time Capsule**) **PLUS inherited access to the Open Mason Workshop** (`Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Chameleon Theme Forge`, `Notepad`, and local `Static Edge Release Packaging` via `manifest.json` & `override.json`).
- **Publishing Firewall:** Citizens can publish Blueprints, Lexicons, Chameleons, and Workbench Templates to The Nexus, and submit new mod discoveries to the crowd-sourced **Scout Queue**.

## Tier 2: Verified Mason (Verified Mod Creator)
- **Scope:** Active Game Spoke (`userRole = 'mason'` / `isVerifiedMason = true`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Inherits all Tier 1 Citizen & Open Workshop tools, and unlocks **Direct Nexus Artifact Publishing**, the **Verified Mason Queue Fast-Lane** (bypassing the `min_scout_submissions` crowd threshold), **Public Mason Profile & Featured Showcase Management**, **Supporter Bridge (`0% Platform Cut` Patreon/Ko-fi auto-stacking)**, **Creator Comm-Link Broadcasts**, and **Direct Bug Report Dossiers**.

## Tier 3: Architect (Registry & Conflict Moderator)
- **Scope:** Active Game Spoke (`userRole = 'architect'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks the **Architect Console**—including the **Unified 3-Tile Artifact Studio** for global registry curation, **Verified Mason Queue & Scout Queue Triage**, the global **Conflict Matrix** (authoring Severity 1–4 directives), **Check Hash & Deep Heuristic File Verification (`FileVerificationSidePanel`)**, **Template Oversight**, **Nexus Reports Triage**, and the **Citizen Support Desk** (with ticket claiming and log inspection).

## Tier 4: Oversight (Spoke Security & System Administrator)
- **Scope:** Active Game Spoke (`userRole = 'oversight'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks **Oversight Command**—including **Spoke Heuristic Signatures Management** (authoring game-specific antivirus bytecode/binary rules alongside Core Heuristics), **Tier 5 Malware Flagging**, **Emergency DEFCON 1 Lockdown Triggers**, **Spoke Identity Matrix Governance** (up to `architect`), **Game Version & DLC Patch Registration**, **Mass Registry Batch Updates**, and **Mason Profile Linking**.

## Tier 5: Wayfinder (Community Manager & Spoke Sovereign)
- **Scope:** Full Sovereign Authority over the Active Game Spoke (`userRole = 'wayfinder'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks **Wayfinder Operations**—including **Full Spoke Identity Matrix Authority** (promoting/demoting up to `wayfinder`), **Spoke Uplink & Sovereignty (`ServerHealthSidePanel`)** with `SANCTUARY-UPLINK://` export and live API key rotation, unilateral **"Cut the Cord" Bilateral Severance** (`secure_sever_spoke_cord`), **The Dispatch** (publishing community-wide dispatches with 2x2 telemetry headers and interactive polls), **Spoke Audit Logs**, and the **Keeper Support Escalation Pipeline**.

## Tier 6: Keeper (Core OS Hub & Sanctuary Foundry Developer)
- **Scope:** Global Sanctuary OS Hub (`osRole = 'keeper'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks **Keepers Core**—accessible from both the Foundry Landing Page and any workspace. Governs **Active Game Workspaces & Turnkey `SANCTUARY-UPLINK://` Spoke Onboarding**, **Core Heuristics Oversight (`keeper_heuristic_signatures`)**, **Master Game Schemas (`sanctuary_schemas`)**, **Global Lexicon & Chameleon Registries**, **Foundry News & Release Notes Publishing**, **Bilateral System Directives Editor** (auto-synced two-way with the codebase `.md` files), and the immutable **Global Audit Trail**.

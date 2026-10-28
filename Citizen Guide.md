# Sanctuary OS — Official Citizen Guide & Interactive OS Walkthrough

New to Sanctuary OS? This 10-stage interactive walkthrough, 12-module operational reference, and 6-tier clearance guide explains every persistent bar, button, card, and studio in the operating system—backed by an offline codebase baseline that automatically syncs live updates from the Sanctuary OS Hub database.

---

# Part 1: Step-by-Step OS Walkthrough (10 Stages — What Everything Does)

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

## Stage 2: Mounting a Game Workspace & The Cartographer (Windows & macOS)

When you select a game workspace from the Landing Page or the Top Workspace Pill for the first time, **The Cartographer** opens to map your local coordinates across Windows and macOS:

- **Bin Folder (Executable Path):** Point this to the folder containing your game executable (`TS4_x64.exe` on Windows or `The Sims 4.app` on macOS). Sanctuary's in-process Rust PE parser (`pelite`) and macOS `Info.plist` reader extract the genuine engine version directly from binary headers without spawning background processes.
- **Mods Folder (Live Game Directory):** Point this to the folder where the game loads mods. Sanctuary keeps this folder 100% clean—never drop files directly here; Sanctuary projects your active mods here via high-speed symlinks and custom `install_routes`.
- **Vault Folder (Deep-Storage Archive):** Choose a dedicated storage folder on your drive. Sanctuary automatically builds `Mods/`, `Blueprints/`, `Backups/World/`, `Backups/Engine/`, `Quarantine/`, and `Data/Cache/`.
- **Lexicon & Chameleon Selection:** Pick your terminology layer (**Standard English**, **Sanctuary Cyberpunk**, **Sims Friendly**, or **Simlish**) and your **Liquid Glass Chameleon Theme**.

## Stage 3: Your Vault, Mod Cards & ActionPill Toolbar

Inside **Your Vault**, every mod lives safely inside your isolated Vault archive:

- **Global Drag-and-Drop Ingest:** Drag `.package`, `.ts4script`, `.zip`, `.rar`, `.7z`, `.tar.zst`, `.asi`, `.dll`, or `override.json` files anywhere onto the Sanctuary OS window. Sanctuary hashes every file with SHA-256 (`DNA`), runs the **Universal Multi-Format Heuristic Scanner (21 Core + 17 Spoke rules)**, and checks the Spoke Registry.
- **Top `StatTileCarousel` & `ActionPill`:**
  - The top row of `DashboardStatTile` cards switches primary sub-views and shows live counts.
  - Below it sits the unified `ActionPill` containing the instant Search Bar, the `Filters` **(`tune`)** popover, sort controls, and context actions.
- **Mod Card Anatomy & Suite Grouping:**
  - **Equip Toggle Switch:** Projects or unlinks the mod's symlink in your live game folder in milliseconds.
  - **Parent Suite Grouping:** Multi-part mod suites (like *MC Command Center* and its 13 `.package`/`.ts4script` modules) automatically coalesce into a single clean Parent Card with an expandable `{N} Linked Modules ▾` drawer.
  - **Status Badges & Ghosted Cards:** Transparent outlined badges show `Verified`, `Update Available`, `Missing DLC`, `Version Mismatch`, or `Conflict`. Hovering a Ghosted card reveals an instant diagnostic tooltip explaining why the mod is blocked.
  - **Clicking a Card (`ModDossier` SidePanel):** Opens the right-hand Dossier drawer where you can customize local names/tags/URLs, link a decentralized `manifest.json` / `catalog.json` URL, inspect included files, or view version history.

## Stage 4: Blueprints & 1-Click Loadout Hot-Swapping

**Blueprints** replace manual folder dragging with instant, saved mod loadouts:

- **Drafting & Hot-Swapping:** Create separate Blueprints for different saves or playstyles (e.g., *Realism Save*, *Occult Challenge*, *Vanilla Patch Test*) and hot-swap between them from the Vault header or the bottom Morphing Dock.
- **Offline JSON Export & Cloud Uplink Codes (`SNCXXX`):** Export any Blueprint to a portable `.json` file (which carries your custom local `modMeta` URLs and workspace identity offline) or generate a 6-character Cloud Uplink code (`SNCXXX`) to share with friends or publish to The Nexus.

## Stage 5: Conflict Radar, Load Order Engine & Homestead Lab

When two mods edit the same game tuning or scripts, Sanctuary catches the collision before you launch the game:

- **Conflict Radar (Casual vs. Advanced Mode):**
  - **Casual Mode:** Displays Severity 3 Tuning Overlaps side-by-side so you can click **"Pick a Winner"** in one click. Sanctuary automatically routes the winning mod into a higher priority tier (`Sanctuary1`–`Sanctuary3` and dynamic `Resource.cfg`).
  - **Advanced Mode:** Unlocks the full **Load Order** tab with the interactive **Quick Rule Builder** (`Must Load After` / `Must Load Before`), topological sort verification, and 1-click **Break Loop** circular dependency resolution.
- **Homestead Lab (Proving Grounds & Save Airgap):**
  - **100% Nuke Isolation Test:** Snapshots your `save_airgap_targets` (`saves`, `Tray`), temporarily unlinks your main loadout, and injects *only* the suspect mod (or pits two conflicting mods against each other in a **1v1 Stability Test**), monitoring live game crash logs automatically and restoring your saves upon completion.

## Stage 6: Citizen's Workbench, Dynamic Config Watcher & Time Capsule

Configure mod settings visually, sync live in-game config changes, and protect your saves and game binaries with zero-bloat snapshots:

- **Citizen's Workbench (`CitizenWorkbench.tsx`) & Dynamic Config Watcher:**
  - **2-Column Visual Config Editor:** Edit massive `.cfg`, `.ini`, `.json`, `.toml`, and `.yaml` files (430+ settings at 60 FPS) using toggles, dual `Min`/`Max` range steppers, keybind recorders, and a 1-click Category Pill Bar—with per-setting **Undo to Saved** and **Reset to Default** buttons.
  - **Dynamic Config Watcher:** Monitors schema-defined `config_extensions` in your live game directory, syncing in-game setting changes back to the mod's Vault folder and automatically removing duplicate root strays.
  - **2-Column Timeline & Diff Workspace:** Compare your live unsaved edits against your last save or any historical snapshot in either **Visual Diff** or **Raw Code Diff** (side-by-side Monaco diff).
- **Time Capsule (`TimeCapsule.tsx`):**
  - **World State (Saves/Settings) & Engine Core (Game Binaries):** Uses an incremental Rust hardlink engine so unchanged files take zero extra disk space, paired with differential rollback restoration.

## Stage 7: Open Mason Workshop, FIDO2 Passkey Vault & Universal AV Lockdown

Every Citizen inherits local creator tooling, backed by hardware-grade security and multi-format bytecode inspection:

- **Open Mason Workshop (Inherited by All Citizens):** Every authenticated Citizen has access to the **Mason Workshop** in the sidebar—including the **Dev Sandbox**, **Mason IDE**, **Unified 3-Tile Artifact Studio** (`Details & Versions`, `Files & Folders`, `Rules & Upload`), **Chameleon Theme Forge** (with 6 Liquid Glass Optics sliders), **Notepad**, and **Static Edge Release Packaging** (`manifest.json` + `catalog.json` + `override.json`).
- **FIDO2 Passkey & TOTP Vault (`SecurityVaultSidePanel`):** Elevated clearances (`Verified Mason`, `Architect`, `Oversight`, `Wayfinder`, `Keeper`) bind hardware keys, Windows Hello / Touch ID biometrics, or TOTP authenticators via a dedicated right-hand SidePanel lock that gates Elevated Hubs while keeping Citizen sectors accessible.
- **Universal Multi-Format Heuristic Scanner & Quarantine Lockdown (`MalwareAlertModal`):** Inspects `.zip`, `.package` (with in-memory Zlib/Zstd DBPF stream decompression), `.ts4script`, `.pyc` bytecode, `.asi`, `.dll`, and `.exe` files against **21 Core Heuristics + 17 Spoke Heuristics** (including Base64/Hex deobfuscation). Confirmed Tier 5 Malware locks the entire OS shell, tracks Move-mode source disposition, offers optional **Zero-PII Threat Manifest** reporting, and enforces a Citizen-signed **Secure Shred**.

## Stage 8: Decentralized Static Edge Polling (`manifest.json` & `catalog.json`) & 1-Click Auto-Push

Independent Masons and Compliance Tier 1–4 creators can distribute live update alerts, dependency rules, and multi-file suite grouping with zero server costs:

- **6-Provider 1-Click OS Auto-Push:** Push `manifest.json` or a multi-mod `catalog.json` directly from your PC to **GitHub Repo / Cloudflare Pages**, **GitHub Gist**, **GitLab / Codeberg**, **Neocities**, **Personal WebDAV / HTTP PUT**, or a **Local Synced Folder**.
- **Automatic Lineage Hash Rollover (`previous_hashes`):** Exporting a new version automatically absorbs prior version SHA-256 hashes into `previous_hashes` so Citizens receive instant **Update Available** pings and seamless in-place file replacement.

## Stage 9: Master Schema Studio & Lexicon Terminology Studio

Configure any game engine and customize every word and icon in the operating system:

- **Master Schema Visual Studio (`sims4.json` & 7 Engine Presets):** 4-tab visual studio (`Identity & Paths`, `Extensions & Routes`, `Load Order & Tiers`, `Logs & Backups`) with presets for The Sims 4, Cyberpunk 2077, Skyrim SE, GTA V, Baldur's Gate 3, Stardew Valley, and Universal—plus game-agnostic `mod_categories` and an interactive **Master Schema Codex Guide**.
- **Lexicon Terminology Studio & Guided Icon Override Builder:** Customize all **21 Dynamic `{Glossary}` Tokens** (`{Mod}`, `{Vault}`, `{Blueprint}`, `{Mason}`, `{Citizen}`, etc.) to update 1,700+ strings at runtime with smart casing and `"a"`/`"an"` grammar, or remap any OS icon using the searchable **Guided Icon Override Builder** with live `Default → New` glyph previews.

## Stage 10: Official Support, Supporter Pipeline & Sovereign Partner Spoke Onboarding

Connect directly with Sanctuary Foundry or launch your own Sovereign Community Spoke:

- **Official Core Feedback, Bug Reports & Direct Human Contact:** Submit Core OS bug reports, feature requests, or direct human inquiries straight from the Landing Page (`app_feedback` pipeline).
- **Global Supporter Pipeline (`$5 = +30 Days` Daily Dev Builds):** Every `$5` contribution adds `+30 days` of automated Daily Dev Build access (Windows `.msi`/`.exe` & macOS `.dmg`/`.app.tar.gz`), verified via Stripe Receipt / Order ID.
- **Readiness-Gated Partner Spoke Application & Covenants:** Review and accept the **Sanctuary Partners Agreement** and **Compliance Protocol** in an interactive overlay drawer, verify your `schema.sql` Spoke database readiness, retain **100% of community donations (`0%` Sanctuary cut)**, and exercise unilateral **Cut the Cord** severance at any time.

---

# Part 2: 12 Citizen & Creator Operational Modules

1. **The Cartographer:** Automated cross-platform drive reconnaissance (Windows `.exe` & macOS `.app`), in-process Rust `pelite` / `Info.plist` version extraction, and symlink privilege verification.
2. **The Command Center:** Dynamic operational readiness tile, 2-column Incompatible & Update drawers, and the Global Comm-Link feed with interactive community polls.
3. **Your Vault:** Airgapped symlink projection, multi-file Parent Suite grouping, `Deep Yeet 2.0` cascade protection, and SHA-256 duplicate / Static Edge intercept.
4. **Blueprints:** Zero-copy loadout hot-swapping, portable offline `.json` exports, and 6-character `SNCXXX` cloud share codes.
5. **The Nexus & Integrated Side Browser:** Version-filtered discovery for Mods, Blueprints, Lexicons, Chameleons, and Workbench Templates, paired with a built-in download-intercepting Side Browser.
6. **Conflict Radar & Load Order Engine:** Casual `"Pick a Winner"` resolution for Severity 3 tuning overlaps and Advanced topological `Must Load After/Before` compilation (`folder_priority`, `manifest_list`, `numeric_prefix`, `timestamp`).
7. **Homestead Lab:** 100% Nuke sandbox isolation and 1v1 conflict arena with `save_airgap_targets` backup/restore and real-time exception log capture.
8. **Time Capsule & Citizen's Workbench:** Incremental OS hardlink snapshots (`World State` & `Engine Core`), differential rollback, 60 FPS 2-column visual config editing, Dynamic Config Watcher, and Timeline Diff.
9. **Chameleons, Lexicons & Universal Malware Defense:** 6-slider Liquid Glass V3 Theme Forge, 4-dictionary Lexicon hot-swapping, Universal 21+17 Heuristic Scanner, FIDO2 Passkey Vault, and Full-OS Quarantine Lockdown.
10. **Decentralized Static Edge Release & Catalog Engine:** Zero-server `manifest.json` and `catalog.json` packaging, 6-provider 1-click Auto-Push, and automatic `previous_hashes` lineage rollover.
11. **Master Schema Studio & Lexicon Terminology Studio:** 7 multi-game architecture presets, secondary `install_routes`, `mod_categories`, 21 `{Glossary}` tokens, Guided Icon Override Builder, and interactive Codex Guides.
12. **Wayfinder Spoke Control, Covenants & Supporter Bridge:** Spoke Setup & Maintenance, Partners Agreement & Compliance Protocol inspection, Unilateral `Cut the Cord` severance, 0%-cut non-custodial community donations, and `$5 = +30 Days` Daily Dev Builds.

---

# Part 3: 6-Tier Clearance Hierarchy & Command Hubs

Sanctuary OS enforces a strict separation between **Game Spoke Roles (`userRole`)** and **Core OS Hub Roles (`osRole`)** across 6 distinct clearance tiers:

## Tier 1: Citizen (Base Clearance + Open Mason Workshop Inheritance)

- **Scope:** Local Machine + Active Game Spoke (`userRole = 'citizen'`).
- **Capabilities:** Full access to all 9 Citizen modules (**Command Center**, **Vault**, **Nexus**, **Blueprints**, **Comm-Link**, **Conflict Radar**, **Homestead Lab**, **Citizen's Workbench**, **Time Capsule**) **PLUS inherited access to the Open Mason Workshop** (`Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Chameleon Theme Forge`, `Notepad`, and local `Static Edge Release Packaging` + 6-provider 1-click Auto-Push via `manifest.json` & `catalog.json`).
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
- **Capabilities:** Unlocks **Wayfinder Operations**—including **Full Spoke Identity Matrix Authority** (promoting/demoting up to `wayfinder`), **Spoke Setup & Maintenance (`ServerHealthSidePanel`)** with `SANCTUARY-UPLINK://` export, live API key rotation, and **Partners Agreement & Compliance Protocol** access, unilateral **"Cut the Cord" Bilateral Severance** (`secure_sever_spoke_cord`), **Non-Custodial 0%-Cut Community Donations**, **Master Schema & Lexicon Studios**, **The Dispatch** (2x2 telemetry headers + interactive polls), **Spoke Audit Logs**, and the **Keeper Support Escalation Pipeline**.

## Tier 6: Keeper (Core OS Hub & Sanctuary Foundry Developer)

- **Scope:** Global Sanctuary OS Hub (`osRole = 'keeper'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks **Keepers Core**—accessible from both the Foundry Landing Page and any workspace. Governs **Active Game Workspaces & Turnkey `SANCTUARY-UPLINK://` Spoke Onboarding**, **Partner Spoke Application Triage**, **Core Heuristics Oversight (`keeper_heuristic_signatures` — 21+ rules) & Zero-PII Threat Manifests**, **Master Game Schemas (`sanctuary_schemas`)**, **Global Lexicon & Chameleon Registries**, **Foundry News & Release Notes Publishing**, **Bilateral System Directives & Legal Covenants Editor** (auto-synced two-way between the codebase `.md` baseline and the Hub database), and the immutable **Global Audit Trail**.

---

# Part 4: Mason Guide — Decentralized Static Edge Polling (`manifest.json` / `catalog.json`) & Lineage Hash Rollover

For **Compliance Tier 1–4** creators and independent **Masons** who distribute outside the public Nexus catalog, Sanctuary OS includes a **$0-cost Decentralized Static Edge Polling & DNA Lineage Engine**. This allows any mod to behave like a fully synced mod—complete with `STABLE` status, automatic update notifications, multi-file family grouping, Required DLC / Dependency / Conflict checks, and in-place file replacement—from a **one-time drag-and-drop**.

*(You can also open this interactive walkthrough at any time inside Sanctuary OS by clicking **Static Polling Guide** in the **Mason Workshop → Sandbox** header or inside the **Rules & Upload** tab of any Sandbox artifact.)*

## Step 1: Stage Your Mod in the Sandbox

1. Drop your `.package`, `.ts4script`, and optional `.cfg`/`.ini` files into `Vault/Dev/Sandbox/` (or click **Import** inside **Mason Workshop → Sandbox**).
2. Click your mod card to open the **3-Tile Artifact Studio**:
   - **Tile 1 (`Details & Versions`):** Enter your mod's **Name**, **Mason Version** (e.g., `1.0.0`), **Safety Tier** (`0` through `4`), **Download URL**, and compatible **Game Versions**.
   - **Tile 2 (`Files & Folders`):** Link any companion `.ts4script` (**Twin**) or optional `.package` (**Add-on / Flavor**) modules, and attach any `.cfg`/`.ini` files you want preserved across updates.
   - **Tile 3 (`Rules & Upload`):** Select **Required EA Packs (DLC)**, **Required Mods (Dependencies)**, and **Incompatible Mods (Conflicts)** (by catalog search, SHA-256 hash, or plain mod name).

## Step 2: Choose Your $0 Static Host (`manifest.json` vs. `catalog.json`) & Optional 1-Click Auto-Push

Paste your raw static URL into **Static Polling Manifest URL (`manifest.json / catalog.json`)** at the bottom of the **Rules & Upload** tab—or select an **Auto-Push Provider** so Sanctuary OS pushes updates directly from your PC in 1 click without opening a browser:

- **1-Click OS Auto-Push (100% Client-Side, 6 Providers Supported):**
  - **GitHub Repo / Cloudflare Pages:** Enter `owner/repo` and a scoped GitHub Personal Access Token (`Contents: Read & Write` on 1 repo). Pushing to GitHub also automatically deploys connected Cloudflare Pages / Netlify / Vercel domains!
  - **GitHub Gist (Zero-Repo Setup):** Enter a GitHub token with `gist` scope and leave Gist ID blank—on your first click of **Export & Auto-Push (.zip)**, Sanctuary OS automatically creates the Gist, grabs its permanent `gist.githubusercontent.com/.../raw/...` URL, and stamps it into your release `.zip`.
  - **GitLab / Codeberg / Gitea:** Uses a Project Access Token to push directly to GitLab or Codeberg repositories.
  - **Neocities Site API:** Uploads `manifest.json` or `catalog.json` directly to `https://{sitename}.neocities.org/...` using your Neocities API key.
  - **Personal Domain (HTTP PUT / WebDAV):** Pushes JSON directly to any custom endpoint with optional Bearer or Basic auth.
  - **Local Synced Folder (Zero-Token):** Writes `manifest.json` or merges into `catalog.json` inside any local folder (such as a GitHub Desktop clone or synced cloud drive).
  - *Security Note:* Your API token stays strictly in local storage on your PC (never sent to Sanctuary servers, never included in Blueprints or `.zip` releases), and the Rust backend even absorbs any historical hashes from your existing remote `manifest.json` / `catalog.json` before pushing!
- **Manual Upload Options:**
  - **Option A — GitHub Raw (Free, 2-Minute Setup):** Create a public GitHub repo (e.g., `my-mod-manifests`), upload `manifest.json`, click **Raw**, and copy the `https://raw.githubusercontent.com/.../manifest.json` URL.
  - **Option B — Cloudflare Pages / Personal Domain (Free, Unlimited Bandwidth):** Host `manifest.json` on Cloudflare Pages or your own web server.
  - **Option C — Single Master `catalog.json` for All Your Mods:** Instead of creating a separate URL for every mod, point all of your mods to a single `https://.../catalog.json` file containing an `"artifacts": [...]` array. Sanctuary OS automatically matches each installed mod inside `catalog.json` by `artifact.id`, `artifact.name`, `current_hashes`, `modules[].sha256`, or `previous_hashes`.

## Step 3: Export Your First Release (`v1.0.0`)

Click **Export Static Manifest (.zip)** in **Rules & Upload** (or the top-right inbox icon in the Studio header):

- Sanctuary OS computes the SHA-256 DNA hash of your primary `.package` and every sibling `.package`/`.ts4script` module in the folder (`current_hashes` and `modules[]`).
- It writes both `manifest.json` and `override.json` (with your `manifest_url` embedded inside both) into your Sandbox folder and packages `{ModName}_v1.0.0_SanctuaryRelease.zip`.
- Upload the `.zip` to your normal download page (Patreon, Itch.io, CurseForge, SimsFileShare, or personal site) and upload `manifest.json` to your static URL.

## Step 4: Publishing Updates (`v1.1.0+`) & Automatic Lineage Hash Rollover

When you build a new version (`v1.1.0`):

1. Drop the updated `.package` / `.ts4script` files into the **same Sandbox folder** (replacing the `v1.0.0` files).
2. Update the **Mason Version** field to `1.1.0` and click **Export Static Manifest (.zip)**.
3. **Automatic Lineage Rollover:** Sanctuary OS automatically inspects your previous `manifest.json`, `override.json`, and SQLite `edge_manifests` table before writing the new manifest. Every prior `v1.0.0` SHA-256 hash that changed is automatically rolled into `previous_hashes` (`archive_hashes`), while the new `v1.1.0` file hashes become `current_hashes`.
4. Upload the newly generated `manifest.json` to your static URL (and post the new `.zip` on your download page).
5. **Instant Update Pings:** The next time any Citizen's Sanctuary OS polls your `manifest.json`, it sees their installed `v1.0.0` hash inside `previous_hashes` trailing remote version `1.1.0` and immediately lights up an **Update Available** alert in their Command Center and Vault!

## Step 5: What Citizens Experience (One-Time Drag & Drop Forever)

- **Zero-Popup Auto-Registration:** The Citizen drags your `.zip` into Sanctuary OS once. Because `manifest.json` / `override.json` is inside the `.zip`, Sanctuary OS registers your `manifest_url` and lineage hashes in SQLite with zero confirmation popups.
- **Full Synced Behavior:** Their mod displays as `STABLE`, multi-file suites coalesce under a single parent card (`edge_family_{id}`) while keeping individual module names inside the drawer, and all DLC/Dependency/Conflict rules are enforced automatically.
- **In-Place Lineage Upgrades:** When the Citizen downloads your `v1.1.0` `.zip` and drops it onto Sanctuary OS, the ingestion engine checks their Vault against `previous_hashes`. Even if you renamed `MyMod_v1.0.package` to `MyMod_v1.1.package`, Sanctuary OS locates the old `v1.0` file by its SHA-256 lineage hash and replaces it in-place inside the exact same subfolder—preventing duplicate mod files forever.

---

# Part 5: Master Schema Studio & Lexicon Terminology Studio Guide

*(You can open this interactive guide at any time inside Sanctuary OS by clicking **Schema Codex** or **Lexicon Codex** (`menu_book` icon) inside the **Master Schema Visual Studio**, **Lexicon Visual Studio**, or the **Wayfinder / Keepers / Mason IDE** header.)*

## 5.1 Master Schema Studio (`sims4.json` & Multi-Game Engine Blueprints)

A **Master Schema JSON** is the engine blueprint that makes Sanctuary OS 100% game-agnostic across Windows and macOS:

1. **7 Built-In Game Architecture Presets & Safe Defaults:**
   - Choose from **The Sims 4 (`DBPF + Python`)**, **Cyberpunk 2077 (`REDengine 4`)**, **Skyrim SE / Fallout 4 (`Creation Engine`)**, **Grand Theft Auto V (`RAGE / OpenIV`)**, **Baldur's Gate 3 (`Larian .pak`)**, **Stardew Valley (`SMAPI`)**, or **Universal**, or click **Populate Safe Defaults** to fill any missing keys without overwriting your customized fields.
2. **Cross-Platform Executables, Paths & Vanilla Isolation (`Tab 1 — Identity & Paths`):**
   - **Game Binaries & Binary Subfolder:** List Windows `.exe` and macOS `.app` bundles (e.g., `TS4_x64.exe`, `The Sims 4.app`) and optional `executable_subdir` (`Game/Bin`, `bin/x64`).
   - **Environment Variables:** Supports `%USERPROFILE%`, `%LOCALAPPDATA%`, `%APPDATA%` on Windows and `~/Documents`, `~/Library/Application Support`, `/Applications/*.app` on macOS.
   - **Engine Safeguards:**
     - `shared_vanilla_dir`: Tracks deployed links in `.sanctuary_deployed_links.json` when deploying directly into a directory that also contains vanilla game files, guaranteeing vanilla files are never deleted on un-deploy.
     - `preserve_archive_structure`: Preserves internal subfolder hierarchies when unpacking archives (required for Cyberpunk 2077, Skyrim `Data/`, and SMAPI).
     - `wrap_in_subfolder` & `max_folder_depth`: Controls folder encapsulation and recursion limits.
3. **Extensions, Dynamic Config Watcher, Custom Install Routes & Mod Categories (`Tab 2 — Extensions & Routes`):**
   - **Supported vs. Vault Visible Extensions:** `supported` extensions deploy on launch; `vault_visible` also includes `.zip`, `.rar`, and `.7z` archives for inspection inside the Vault.
   - **Editable Directive Extensions (`config_extensions`):** Extensions listed here (`.cfg`, `.ini`, `.json`, `.toml`, `.yaml`) are monitored by the **Dynamic Config Watcher**, which syncs live in-game config changes back to the mod's Vault folder and automatically removes duplicate root strays when a mod already owns that config file inside a subfolder.
   - **Custom Install Routes (`install_routes`):** Route specialized file extensions outside the primary Mods directory—relative to `live_path` (e.g., `Data/Shared/Worlds/Areas` for `.world` files or `bin/x64/plugins` for `.dll`/`.asi` plugins) or `user_data_dir`.
   - **Game-Agnostic Mod Categories (`mod_categories`):** Define custom per-game mod categories that populate Vault filters, Nexus tags, and the 3-Tile Artifact Studio.
4. **Load Order Strategies & Homestead Verification (`Tab 3 — Load Order & Tiers`):**
   - Choose `folder_priority` (alphabetical tier folders + `Resource.cfg`), `numeric_prefix` (`{index:03}_`), `manifest_list` (`plugins.txt` / `modsettings.lsx`), or `timestamp`, and configure Homestead RAM stabilization and save extensions.
5. **Exception Log Matchers, Time Capsule & Save Airgap (`Tab 4 — Logs & Backups`):**
   - **Exception Log Matchers:** Match crash logs via **Prefix + Extension** (`lastexception` + `.txt`) or **Exact Filename** (`ScriptHookV.log`, `mc_lastexception.html`) and attach keyword diagnostic rules.
   - **World State vs. Engine State Backups & Save Airgap (`save_airgap_targets`):** Protects live player saves (`saves`, `Tray`) by snapshotting them before Homestead sandbox verification and restoring them immediately upon completion.

## 5.2 Lexicon & Terminology Studio (Dynamic `{Glossary}` Tokens, Language Packs & Guided Icon Overrides)

Every string, button, tooltip, and icon in Sanctuary OS routes through the **Lexicon Engine**:

1. **21 Dynamic `{Glossary}` Tokens (`Tab 1 — Core Terms`):**
   - Changing any of the 21 master nouns (`{Mod}`, `{Mods}`, `{Vault}`, `{Blueprint}`, `{Blueprints}`, `{Mason}`, `{Masons}`, `{Citizen}`, `{Citizens}`, `{Backups}`, `{Lab}`, `{Settings}`, `{Nexus}`, `{Chameleon}`, `{Chameleons}`, `{Lexicon}`, `{Lexicons}`, `{Dispatch}`, `{Dispatches}`, `{Delete}`, `{Remove}`) in Tab 1 automatically updates **1,700+ strings** across the entire OS at runtime.
   - **Smart Casing & Article Grammar:** `{Mod}` renders Title Case (`"Artifact"`), `{mod}` renders lowercase (`"artifact"`), `{MOD}` renders UPPERCASE (`"ARTIFACT"`), and `"a {mod}"` automatically becomes `"an Artifact"`.
2. **OS Modules, Sidebar & Pack Tools (`Tabs 2–4`):**
   - **Tab 2 (`OS Modules`):** Browse all 1,700+ strings grouped by OS module with live cyan `{Token}` interpolation previews (`→ ...`), `Unmapped Only` / `Customized Only` filters, and 1-click `Sanctuary` / `Reset` buttons.
   - **Tab 3 (`Sidebar & Landing`):** Customize primary sidebar navigation labels, view headers, and landing text.
   - **Tab 4 (`Pack & Tools`) & Guided Icon Override Builder:** Edit pack metadata (`_meta_name`, `_meta_author`, `_meta_lang`, `_meta_version`), run **Batch Find & Replace**, or use the **Guided OS Icon Override Builder** to pick any target OS icon from a searchable dropdown and assign a replacement Material Symbol with live `Default → New` glyph previews.
3. **Automatic `en-default.json` Fallback & Parity Validation:**
   - Every custom Lexicon pack inherits automatically from `en-default.json`—untranslated keys never show blank or broken UI text, and your custom `{Glossary}` tokens still interpolate into fallback strings.
   - The floating **Lexicon Validation Alert** tracks coverage against `en-default.json` with 1-click **Next Empty**, **+ Add Missing**, and **Purge Keys** actions.
   - Core brand identity (`Two-Tone OS Title`, `Rotating Subtitles`, and `OS Logo`) is governed separately in **Keepers Core → Core Aesthetics → Title Area** so language packs never overwrite OS branding.

---

# Part 6: Supporter Pipeline, Partner Spoke Covenants & Offline/Cloud Sync Architecture

1. **Offline Codebase Baseline + Live Cloud Sync:**
   - Bundled `.md` Directives, Legal Covenants, Master Schemas (`sims4.json`), and Lexicons (`en-default.json`, `en-sanctuary.json`, `en-sims.json`, `Simlish.json`) serve as the zero-latency first-launch and 100% offline backup.
   - When connected to the network, Sanctuary OS automatically pulls live updates from the Hub database (`public.system_directives`, `public.keeper_system_broadcasts`, `public.sanctuary_schemas`) without requiring a desktop app reinstall.
2. **Global Supporter Pipeline (`$5 = +30 Days` Daily Dev Builds):**
   - Every `$5` contribution adds `+30 days` of automated Daily Dev Build access (`Windows .msi/.exe` and `macOS .dmg/.app.tar.gz`), redeemable via Stripe Receipt / Order ID on both the Web OS and Desktop OS.
3. **Readiness-Gated Partner Spoke Onboarding & Sovereign Covenants:**
   - Community leaders applying via **Apply to be a Partner** on the Landing Page can inspect both the **Sanctuary Partners Agreement** and **Compliance Protocol** in an interactive overlay drawer before testing their `schema.sql` Spoke handshake.
   - Once active, Wayfinders can review both covenants at any time inside **Wayfinder Operations → Spoke Control → Spoke Setup & Maintenance**, configure **0%-cut non-custodial community donations**, or execute unilateral **Cut the Cord** severance.

# Part 6: Supporter Pipeline, Partner Spoke Covenants & Offline/Cloud Sync Architecture

1. **Offline Codebase Baseline + Live Cloud Sync:**
   - Bundled `.md` Directives, Legal Covenants, Master Schemas (`sims4.json`), and Lexicons (`en-default.json`, `en-sanctuary.json`, `en-sims.json`, `Simlish.json`) serve as the zero-latency first-launch and 100% offline backup.
   - When connected to the network, Sanctuary OS automatically pulls live updates from the Hub database (`public.system_directives`, `public.keeper_system_broadcasts`, `public.sanctuary_schemas`) without requiring a desktop app reinstall.
2. **Global Supporter Pipeline (`$5 = +30 Days` Daily Dev Builds):**
   - Every `$5` contribution adds `+30 days` of automated Daily Dev Build access (`Windows .msi/.exe` and `macOS .dmg/.app.tar.gz`), redeemable via Stripe Receipt / Order ID on both the Web OS and Desktop OS.
3. **Readiness-Gated Partner Spoke Onboarding & Sovereign Covenants:**
   - Community leaders applying via **Apply to be a Partner** on the Landing Page can inspect both the **Sanctuary Partners Agreement** and **Compliance Protocol** in an interactive overlay drawer before testing their `schema.sql` Spoke handshake.
   - Once active, Wayfinders can review both covenants at any time inside **Wayfinder Operations → Spoke Control → Spoke Setup & Maintenance**, configure **0%-cut non-custodial community donations**, or execute unilateral **Cut the Cord** severance.


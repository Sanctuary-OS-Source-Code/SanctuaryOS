# Sanctuary OS — Official Citizen Guide & Interactive OS Walkthrough

New to Sanctuary OS? This 10-stage interactive walkthrough, 12-module operational reference, and 6-tier clearance guide explains every persistent bar, button, card, and studio in the operating system—backed by an offline codebase baseline that automatically syncs live updates from the Sanctuary OS Hub database.

---

# Part 1: Step-by-Step OS Walkthrough (10 Stages — What Everything Does)

## Stage 1: Global Shell Anatomy (Sidebar, Top Control Capsule, Controller Engine & Telemetry Toast)

Sanctuary OS is framed by persistent WebGL2 3D Liquid Glass regions that adapt dynamically to whether you are on the **Foundry Landing Page** or inside an active **Game Workspace**:

- **Left Navigation Sidebar:**
  - **On the Landing Page:** Displays Web/Foundry scrolling Quick Links (**Active Workspaces**, **Sanctuary Foundry News**, **System Directives**, **Partner Spokes**, **Legal**, **Donations**, **Preferences**) and—exclusively for Keepers—the **Sanctuary Foundry -> Keepers Core** hub. Game workspace links and the **Quick Launch** button are cleanly hidden here.
  - **Inside a Mounted Game Workspace:** Displays the 9 Citizen Operational Sectors (**Command Center**, **Your Vault**, **The Nexus**, **Blueprints**, **Comm-Link Feed**, **Conflict Radar**, **Homestead Lab**, **Workbench**, **Time Capsule**), your unlocked sub-second Command Hubs (**Mason Workshop**, **Architect Console**, **Oversight Command**, **Wayfinder Operations**, **Keepers Core**), and the bottom **Quick Launch** ignition button.
- **Top-Right Control Capsule, `Ctrl+K` Command Matrix & Steam Deck Controller Engine:**
  - Houses the **Active Workspace Selector**, **System Queues & Utilities** (`Blueprint Signature Queue`, `Duplicate & Update Resolver`, `Mobile Companion Radar`, `Side Browser`), **Notification Center** (with **Once-Per-Account Encrypted Cross-Device Sync**), **Command Matrix (`Ctrl+K` / `Cmd+K`)**, and **7-Domain System Preferences** inside a single unified glass capsule.
  - Press `Ctrl+K` / `Cmd+K` to fuzzy-search across all 18 OS views, installed Vault mods, Blueprints, Mason profiles, Workbench configs, Chameleon themes, and Lexicon packs—or use the **Full-OS Steam Deck & Gamepad Controller Engine** (`Left Stick` / `Right Trackpad` **60 FPS Chameleon Virtual Pointer**, `D-Pad` spatial focus & slider stepping, `A`/`R2` click + Steam OSK auto-summon, `L2`/`X` right-click menu, `B` layered back, `L1`/`R1` tab cycling, and `Right Stick` / `Left Trackpad` scrolling).
- **OS-Wide Right-Click Menus & Responsive Mobile Drawers:**
  - Right-click any card or row across every Citizen view and Elevated Hub for instant glassmorphic quick actions, while mobile screens automatically condense drawer filter bars into a sleek **Liquid Glass Selector Pill + Popover Menu** across 51+ panels.
- **Command Center Quick Actions & Live System Telemetry Toast:**
  - Instead of a permanent bottom status bar, Sanctuary OS surfaces a transient **Bottom-Right System Telemetry Toast** only when background scans, deployments, or system alerts are active (complete with a live scan progress bar and 1-click dismiss). Clicking the toast opens the **System Log History** drawer (`All`, `Vault`, `The Nexus`, and `Alerts` streams), while **1-Click Radar Sweep** and **Vault Lockdown** live directly in **Command Center** and System Queues.

## Stage 2: Mounting a Game Workspace, The Cartographer & 7-Domain Preferences

When you select a game workspace from the Landing Page or the Top Control Capsule for the first time, **The Cartographer** maps your local coordinates across **Windows**, **macOS**, and **Linux / SteamOS (Steam Deck)**:

- **Game Paths (`Settings -> Game & Backups` with Game-Only Auto Detect):**
  - **Game Executable Folder (`live_path`):** Point this to the folder containing your game binary (e.g., `.exe` on Windows/Proton or `.app` on macOS). Sanctuary's in-process Rust `pelite`, `Info.plist`, and Steam `.acf` inspector extracts the genuine engine version directly from binary headers.
  - **Active Mods Folder (`mods_path`):** Your game's live mod folder (automatically resolving Proton `compatdata/<AppID>/pfx/` prefixes and SD card libraries on Linux & Steam Deck, plus 1-click cross-drive UAC symlink unlocking on Windows and automatic rescue of untracked mods).
  - **Saves, Logs & Cache Folder (`docs_path`):** Auto-resolved from the active Master Schema so **Time Capsule**, **Homestead Lab** crash log scanning, and **Purge Stale Game Caches on Launch** locate your user-data directory immediately.
- **OS-Wide Master Vault Path (`Settings -> Vault & Blueprints`):** Choose a dedicated storage root that governs the entire Sanctuary OS—storing shared Chameleons (`Data/Themes/`) and Lexicons at the root while maintaining isolated per-game `Mods/`, `Blueprints/`, `Backups/Mods/`, `Backups/World/`, `Backups/Engine/`, `Quarantine/`, and `.sanctuary_cache.db` subfolders.
- **Per-Space Chameleons & Lexicons (`Settings -> Appearance`):** Assign independent **WebGL2 Liquid Glass Chameleon Themes** and **Lexicon Packs** for **Keepers Core** and each mounted **Game Workspace** from a single matrix—and mute secondary workspaces per alert category in **Settings -> Notifications**.

## Stage 3: Your Vault, Highlander Swap Alerts, Mod Version History & Unified Filter Bar

Inside **Your Vault**, every mod lives safely inside your isolated Vault archive:

- **Global Drag-and-Drop Ingest & Full-Tree Preservation:** Drag supported mod files, `.zip`/`.rar`/`.7z`/`.tar.zst` archives, or `.sanctuary.override.json` sidecars anywhere onto Sanctuary OS. Sanctuary hashes every file with SHA-256 (`DNA`), runs the **Bytecode Hound Core + Spoke Heuristic Scanner**, preserves multi-folder asset trees where required by the game schema, and lets you choose **Skip** or **Update & Archive** on duplicates.
- **Category Stat Tiles & Unified Search/Filter Bar:**
  - The top row of category stat tiles switches primary sub-views (`All`, `Enabled`, `Disabled`, `Version History`, `Unregistered`), paired with the unified search bar and `Filters` popover below.
- **Highlander Exclusive Slots & Explicit Swap Alerts (`Atomic Logic`):**
  - Mods that replace the same single-slot game feature (via Registry `highlander_group_id` or Static Edge `atomic_logic.highlander_group`) never collapse unrelated creators into one folder and **never silently auto-remove your equipped mod**. Equipping a rival throws an explicit **Swap Alert** on the card or inside **Mod Dossier**—letting you choose **Swap**, **Keep Both** (sending the pair to Conflict Radar), or **Cancel**.
- **Zero-Byte Mod Version History & Family Rollbacks (`Backups/Mods/`):**
  - Every installed mod is archived from **Version #1** using zero-extra-byte OS hardlinks. Open **Version History** (or click **Versions** inside any **Mod Dossier**) to roll back an entire multi-file suite via the **Suite Revision Matrix**, or let **Patch Readiness** detect `Auto-Swap Ready` local versions automatically.
- **Mod Card Anatomy, Suite Grouping & Mod Dossiers:**
  - Multi-part mod families and script+module twins coalesce into a single clean Parent Card with an expandable `{N} Linked Modules` drawer, `Stable` / `Unstable` / `Corrupted` outline badges (with rich hover diagnostics and creator **Issue & Cause Details**), 1-click Collection `Add All` / `Remove All`, and customizable Local Dossiers.

## Stage 4: Blueprints, Patch Readiness Simulator, 3-Mode Sync & Personal Rig Pipeline

**Blueprints** replace manual folder dragging with instant, self-healing mod loadouts that synchronize across all of your gaming rigs and mobile devices:

- **Blueprint Patch Readiness Simulator & 1-Click Clone Ready (`Blueprints -> Patch Readiness`):**
  - Simulate any game patch across all of your Blueprints with exact 1-to-1 mod count parity. Expandable family drawers group actionable items into **Needs Update**, **Needs Dependency Update**, **Auto-Swap Ready**, **Awaiting Patch**, and **Missing Dependency** (with 1-click **Get Dependency** / **Equip from Vault** actions and a `99%` cap whenever any mod is unready).
  - Click **Clone Ready Blueprint** to generate a sanitized, ready-to-play copy that strips unpatched mods and any transitive child addons while leaving your original Blueprint untouched.
- **Autonomous Self-Healing & 3-Mode Cloud Visibility:**
  - After every settled Vault scan, Blueprints automatically heal renamed or moved files via SHA-256 DNA matching and prune deleted ghosts without manual popups. When syncing to the cloud, pick from 3 clear visibility modes: **Public • Nexus Listing**, **Unlisted • Uplink Code (`SNCXXX`)**, or **Private • Account Only**.
- **Personal Rig Blueprint Pipeline (`Beam to Rig`) & Guided Batch Updater (`1 of N`):**
  - Beam complete, un-scrubbed Play Sets—including local/Tier 1–4 mods, priority tiers, and conflict waivers—between your Desktop PC and Steam Deck using concurrent **GZIP + Zero-PII AES-256-GCM** streaming (`Leave in Cloud` with per-rig `Complete on This Rig` vs. `Shred After Deploy`), routing any missing downloads straight into the **Side Browser Guided Batch Updater (`1 of N`)**.
- **Zero-PII Mobile & Web Vault Companion Radar:**
  - Open **My Vault Patch Radar** on your phone or browser to check your encrypted Desktop Vault, Critical Failure, System Alert, and Update counts—including Static Edge updates—and queue fixes remotely.

## Stage 5: Pluggable Conflict Radar 2.0, Load Order Engine & Cheat-Proof Homestead Lab

Catch collisions before launching and verify suspect mods inside an anti-cheat-safe, save-airgapped proving ground:

- **Pluggable Conflict Radar 2.0 & 5-Tier Severity Matrix:**
  - Runs schema-defined `virtual_fs_path`, `archive_member`, `binary_chunk_index`, and `json_xml_key` analyzers across **Severity 5 (`Circular Loop`)** down to **Severity 1 (`Visual Override`)**—unified 1-to-1 with **Command Center** alert tiles and offering 1-click **"Set Winner"** Priority Override Tiers.
- **Game-Agnostic Load Order Engine:**
  - Compiles topological load orders across `folder_priority`, `manifest_list` (including structured XML like `modsettings.lsx` and `plugins.txt`), `numeric_prefix`, and `timestamp`, complete with directional `Must Load After / Before` rules and a searchable **Scan Scope** Blueprint selector.
- **Cheat-Proof Homestead Lab & Immortal Save-Verify-and-Rewind Airgap:**
  - **2-Column Environment Builder & Pinned Known Errors:** Stage a **Primary Mod**, **Dependencies**, and **Conflict Check** on the sticky **Active Test Bench** (staging only the target mod + its twin without collection sibling bleed), or paste crash logs into the 3-section **Known Errors** showcase (`Corrupted`, `Unstable`, `Unrelated`).
  - **Immortal Save Airgap & Passive 4-Stage Verification:** Seals live saves in an external Vault mirror and mounts a **disposable copy** of your read-only **Golden Baseline Lab Test Save** on every run—waiting for loading screens to settle, suspending on `ESC` pause menus with **zero overlays or anti-cheat hooks**, playing **native fullscreen PCM audio chimes** when the timer finishes, auditing Stage 4 in-game saves for magic-byte corruption, and discarding the mutated test copy on 1-click teardown.

## Stage 6: Citizen's Workbench, Dynamic Config Watcher & Parallel CoW Time Capsule

Configure mod settings visually, sync live in-game config changes, and seal multi-gigabyte backups in seconds:

- **Citizen's Workbench & Dynamic Config Watcher:**
  - **2-Column Visual Config Editor:** Edit `.sanctuary.template.json` schemas and native `.cfg`, `.ini`, `.json`, `.toml`, `.yaml`, and `.xml` files at 60 FPS using toggles, `Min`/`Max` steppers, keybind recorders, and interactive **Workbench Template Previews**—paired with automatic root config deduplication and a **2-Column `[In-Game Engine Edit]` Diff Timeline**.
- **Parallel Copy-on-Write (`CoW`) Time Capsule:**
  - Streams **World State** and **Engine Core** snapshots across all CPU cores using zero-byte OS hardlinks (sealing a 78 GB game installation in ~9 seconds), enforces delta-aware **Time Capsule Storage Limits**, catches missed or offline game patches on next Desktop open (**DEFCON Shield**), and performs **strictly additive** World State save restores followed by a **Post-Restore Summary** drawer.

## Stage 7: Open Mason Workshop, Touch ID / Companion Passkeys & Universal AV Lockdown

Every Citizen inherits local creator tooling, backed by zero-knowledge auth, hardware passkeys, and multi-format bytecode inspection:

- **Open Mason Workshop (Inherited by All Citizens):** Access the **Dev Sandbox**, **Mason IDE**, **Unified 3-Tile Artifact Studio**, **Chameleon Theme Forge** (with Content-Addressed `<= 250 KB` WebP wallpapers and External HTTPS URLs), **Lexicon Visual Studio**, **Notepad**, and **Static Edge Release Packaging**—with Verified Mason clearance unlocking direct cloud publishing to **The Nexus**.
- **600k Zero-Knowledge Auth, macOS Touch ID & Companion Passkey Handshake:** Protects accounts with **600,000-iteration PBKDF2 + Bcrypt** stretching and **600k Blinded Email Aliases**, unlocking Elevated Hubs via Windows Hello, **macOS Touch ID**, a **12-hour Device-Bound Passkey Seal**, or a **Live Phone/PC Companion Passkey Handshake** delivered via W3C Background Web Push.
- **Bytecode Hound Heuristic Scanner & Quarantine Lockdown:** Inspects archives, Zlib/Zstd binary streams, scripts, `.pyc` bytecode, and native plugins against Core + Spoke heuristics, locking the OS shell on Tier 5 Malware until Citizen-signed **Secure Shred**.

## Stage 8: Decentralized Static Edge Polling, Manifest Catalogs & Auto-Push

Independent Masons and Compliance Tier 1–4 creators can distribute live update alerts, Highlander slot rules, and multi-file suite grouping with zero server costs:

- **Concurrent Rust Edge Poller & 6-Provider 1-Click Auto-Push:** Sanctuary's bounded concurrent Rust poller checks remote `.sanctuary.manifest.json` and multi-mod `catalog.json` endpoints with `ETag` / `304` caching, while creators can push releases in 1 click to **GitHub Repo / Cloudflare Pages**, **GitHub Gist**, **GitLab / Codeberg**, **Neocities**, **Personal WebDAV / HTTP PUT**, or a **Local Synced Folder** with automatic `previous_hashes` lineage rollover.

## Stage 9: Master Schema v2 Studio & Lexicon Visual Studio V2 (1-Click Auto-Translate)

Configure any game engine and translate or theme the entire operating system in minutes:

- **Master Schema v2 Visual Studio (7 Engine Presets):** 4-tab visual studio (`Identity & Paths`, `Extensions & Routes`, `Load Order & Tiers`, `Logs & Backups`) supporting multi-folder asset trees, secondary `install_routes`, structured XML/manifest compilers, declarative `conflict_analyzers`, and an interactive **Master Schema Codex**.
- **Lexicon Engine V2, Sparse Delta Packs & 1-Click Neural Auto-Translate:** Backed by an auto-extracted **`6,166`-key Standard English baseline**, custom packs store only lightweight **Sparse Delta Overrides**, update OS-wide nouns dynamically via **21 `{Glossary}` Tokens**, and include a **2-Step Creation Wizard**, Source-First UI String Browser, Guided Icon Overrides, and **1-Click Neural Auto-Translate across 28+ languages**.

## Stage 10: Command Center Support Desk, Transparent Ledgers & Sovereign Spoke Relinking

Track open support tickets, audit transparent monthly server ledgers, or launch a Sovereign Partner Spoke:

- **Command Center Support Desk & Scoped Tickets:** View and reply to your active **Spoke Support Tickets** right from **Command Center** (or switch cleanly between Spoke and Keepers Core tickets inside **Settings -> Support Tickets**).
- **Transparent Monthly Cost Ledgers & `$5 = +30 Days` Dev Builds:** Inspect itemized 2-column **Cost vs. Spending Reports** and live carryover ledgers in **Supporter & Perks**, stack `+30 days` of Global Dev Build access per `$5` donated (`0%` Sanctuary cut), and sync Verified Mason supporter perks across rigs with Zero-PII E2EE.
- **High-Friction `Cut the Cord` & Cryptographic `SRK1` Spoke Relink:** Partner communities retain 100% database and donation ownership, can sever bilaterally behind a `"CUT THE CORD"` phrase lock, and let returning users claim their legacy Spoke profiles safely using their **`SRK1` Spoke Relink Token** (`Settings -> Account & System -> System ID`).

---

# Part 2: 12 Citizen & Creator Operational Modules

1. **The Cartographer & 7-Domain Settings:** Cross-platform drive reconnaissance (Windows `.exe` + 1-click symlink unlock, macOS `.app`, and Linux / SteamOS Proton `compatdata` + SD cards), separated OS-wide **Master Vault Path** vs. **Game-Only Auto Detect**, auto-resolved **Saves, Logs & Cache (`docs_path`)**, Per-Space Chameleon/Lexicon assignments, and Per-Spoke Notification Muting.
2. **The Command Center:** Unified conflict/readiness stat tiles, border-tinted Liquid Glass **System Alert Cards** with `Ignore` / `Restore`, followed-creator **Comm-Link** tailoring, live **Spoke Support** Open Tickets, `2x3` **System Telemetry**, and the `Ctrl+K` / Steam Deck Controller Engine.
3. **Your Vault, Highlander Slots & Mod Version History:** Airgapped symlink projection, multi-file Parent Suite grouping, **Highlander Exclusive Slot Swap Alerts** (`Swap` / `Keep Both`), zero-byte hardlink **Mod Version History (`Backups/Mods/`)**, **Suite Revision Matrix**, 279-mod instant Collection equipping, and `Deep Yeet 2.0` cascades.
4. **Blueprints, Patch Readiness Simulator & Personal Rig Pipeline:** 1-to-1 **Patch Readiness Simulator** with **1-Click Clone Ready Blueprint**, 3-mode Cloud Blueprint visibility (`Public` / `Unlisted` / `Private`), autonomous SHA-256 self-healing, concurrent GZIP + AES-256-GCM **Personal Rig Transfers**, and the **Mobile Vault Companion Radar**.
5. **The Nexus & Guided Side Browser (`1 of N`):** Discovery for Mods, Blueprints, Sparse Delta Lexicons, Content-Addressed Chameleons, and interactive Workbench Templates, paired with the download-intercepting **Guided Batch Updater (`1 of N`)**.
6. **Pluggable Conflict Radar 2.0 & Load Order Engine:** 5-Tier Severity Matrix (`S1–S5`), declarative `virtual_fs_path` / `archive_member` / `binary_chunk_index` / `json_xml_key` analyzers, 1-click `"Set Winner"` Priority Tiers, directional load rules, and structured manifest compilation.
7. **Cheat-Proof Homestead Lab:** Externalized immortal Vault save mirror, read-only **Golden Baseline Lab Test Save** + disposable working copies with Stage 4 magic-byte corruption auditing, zero-anti-cheat passive 4-stage timer, native fullscreen PCM chimes, 2-column **Active Test Bench**, and pinned 3-section **Known Errors** showcase.
8. **Parallel CoW Time Capsule & Citizen's Workbench:** Multi-threaded Copy-on-Write snapshots (`World State` & `Engine Core`), additive save restoration, storage-cap pruning, Next-Desktop-Open DEFCON Shield, and 60 FPS 2-column visual config editing with `[In-Game Engine Edit]` Timeline Diffs.
9. **WebGL2 Liquid Glass Chameleons, Passkeys & Malware Defense:** 1:1 physical-pixel WebGL2 refraction, `<= 250 KB` content-addressed WebP wallpapers + external HTTPS URLs, OWASP 600k Zero-Knowledge Auth, macOS Touch ID & Companion Passkey Handshakes, and Bytecode Hound Quarantine Lockdown.
10. **Concurrent Static Edge Engine:** Bounded concurrent Rust polling (`ETag` / `304` cached `.sanctuary.manifest.json` & `catalog.json`), 6-provider 1-click Auto-Push, and automatic `previous_hashes` lineage rollover.
11. **Master Schema v2 & Lexicon Visual Studio V2:** 7 engine presets, multi-folder asset trees, secondary `install_routes`, `6,166`-key auto-extracted baseline, 21 `{Glossary}` tokens, Source-First Studio, and **1-Click Neural Auto-Translate (28+ languages)**.
12. **Wayfinder Sovereignty, `SRK1` Relink & Transparent Ledgers:** Sub-second Elevated Hubs, 100% Wayfinder-isolated community donations, itemized monthly Cost vs. Spending ledgers, high-friction `Cut the Cord`, and cryptographic **`SRK1` Spoke Relink Tokens**.

---

# Part 3: 6-Tier Clearance Hierarchy & Command Hubs

Sanctuary OS enforces a strict separation between **Game Spoke Roles (`userRole`)** and **Core OS Hub Roles (`osRole`)** across 6 distinct clearance tiers—with all 5 Elevated Command Hubs loading in **under a second** into full landing-page overviews:

## Tier 1: Citizen (Base Clearance + Open Mason Workshop Inheritance)

- **Scope:** Local Machine + Active Game Spoke (`userRole = 'citizen'`).
- **Capabilities:** Full access to all 9 Citizen modules (**Command Center**, **Vault**, **Nexus**, **Blueprints** + **Patch Readiness**, **Comm-Link**, **Conflict Radar**, **Homestead Lab**, **Citizen's Workbench**, **Time Capsule**) **PLUS inherited local access to the Open Mason Workshop** (`Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Chameleon Theme Forge`, `Lexicon Visual Studio`, `Notepad`, local JSON export/import, and `Static Edge Release Packaging` + 6-provider 1-click Auto-Push).
- **Publishing Firewall:** Citizens can share Blueprints (`Public`, `Unlisted`, or `Private`), export/import Themes, Lexicons, and Templates locally as JSON, and submit passing Tier-0 mod discoveries (`_lab_cert_proof`) to the crowd-sourced **Scout Queue**.

## Tier 2: Verified Mason (Verified Mod Creator)

- **Scope:** Active Game Spoke (`userRole = 'mason'` / `isVerifiedMason = true`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Inherits all Tier 1 Citizen & Open Workshop tools, and unlocks **Direct Cloud Nexus Publishing** for **Mods**, **Lexicons**, **Chameleons**, and **Workbench Templates**, the **Verified Mason Queue Fast-Lane**, **Public Mason Profile & Featured Showcase Management**, **Highlander Exclusive Slot Assignment**, **Supporter Bridge (`0% Platform Cut` + Multi-Rig Zero-PII E2EE perk sync)**, **Creator Comm-Link Broadcasts**, and **Direct Bug Report Dossiers**.

## Tier 3: Architect (Registry & Conflict Moderator — Strict Tier 0 Isolation)

- **Scope:** Active Game Spoke (`userRole = 'architect'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks the **Architect Console** (strictly isolated to **Compliance Tier 0** `Stable` records)—including Tier-0 Registry & Collection curation, **Verified Mason & Scout Queue Triage**, global **Conflict Matrix** & **Highlander Exclusive Slots**, pinned **Known Error Rules**, interactive **Workbench Template Oversight**, **Check Hash Verification**, and exclusive **`Claimed`** **Citizen Support Desk** queues. Architects cannot issue bans or active compliance locks; any Tier 1–4 flag routes into **Oversight Command -> Compliance** as **`Pending`**.

## Tier 4: Oversight (Spoke Security & System Administrator)

- **Scope:** Active Game Spoke (`userRole = 'oversight'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks **Oversight Command**—including **Spoke Heuristic Signatures Management**, **`Pending` Tier 1–4 Compliance Confirmation** (stripping Cloud Blueprints only once confirmed) & **Tier 5 Malware Blacklisting**, **Emergency DEFCON 1 Lockdown Triggers**, **Spoke Identity Matrix Governance** (up to `architect`), **Game Version & DLC Patch Registration**, **Mass Registry Batch Updates**, **Mason Profile Linking**, and read/export-only **Audit Log** review.

## Tier 5: Wayfinder (Community Manager & Spoke Sovereign)

- **Scope:** Full Sovereign Authority over the Active Game Spoke (`userRole = 'wayfinder'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks **Wayfinder Operations**—including **Full Spoke Identity Matrix Authority** (up to `wayfinder`), **Spoke Setup & Maintenance** (secret-free `SANCTUARY-UPLINK://` export, 1-click `spk_gw_*` Gateway Token rotation, and Covenants), high-friction **"Cut the Cord" Bilateral Severance**, **100% Wayfinder-Isolated Non-Custodial Community Donations** & Monthly Cost Ledgers, in-hub **Mass Update & Patch Management**, **Master Schema v2 & Lexicon V2 Studios**, **The Dispatch**, **Spoke Audit Logs**, and **Keepers Support**.

## Tier 6: Keeper (Core OS Hub & Sanctuary Foundry Developer)

- **Scope:** Global Sanctuary OS Hub (`osRole = 'keeper'`). Requires FIDO2 Passkey + TOTP Vault binding.
- **Capabilities:** Unlocks **Keepers Core** on both the Foundry Landing Page and all workspaces—governing **Partner Spoke Onboarding**, **`Keepers-Only` Dev-Test Spoke Cloaking**, **Core Heuristics & Threat Manifests**, **Keepers Core Default Schema (`default.json`)**, **Global Lexicon & Chameleon Registries**, **Foundry News & Release Notes**, **Bilateral Directives & Legal Sync**, and **Global Audit Logs** (strictly isolated from Partner Spoke control or Partner donations beyond compliance `Cut the Cord`).

---

# Part 4: Mason Guide — Decentralized Static Edge Polling (`.sanctuary.manifest.json` / `catalog.json`) & Lineage Hash Rollover

For **Compliance Tier 1–4** creators and independent **Masons** who distribute outside the public Nexus catalog, Sanctuary OS includes a **$0-cost Concurrent Decentralized Static Edge Polling & DNA Lineage Engine**. This allows any mod to behave like a fully synced mod—complete with `Stable` status, automatic update notifications, multi-file family grouping, Highlander Exclusive Slots, Required DLC / Dependency / Conflict checks, and in-place file replacement—from a **one-time drag-and-drop**.

*(You can also open this interactive walkthrough at any time inside Sanctuary OS by clicking **Static Polling Guide** in the **Mason Workshop → Sandbox** header or inside the **Rules & Upload** tab of any Sandbox artifact.)*

## Step 1: Stage Your Mod in the Sandbox

1. Drop your mod files, scripts, and optional config files into `Vault/Dev/Sandbox/` (or click **Import** inside **Mason Workshop → Sandbox**).
2. Click your mod card to open the **3-Tile Artifact Studio**:
   - **Tile 1 (`Details & Versions`):** Enter your mod's **Name**, **Mason Version** (e.g., `1.0.0`), **Safety Tier** (`0` through `4`), **Issue & Cause Details** (optional), **Download URL**, and compatible **Game Versions**.
   - **Tile 2 (`Files & Folders`):** Link any companion script/module (**Twin**) or optional (**Add-on / Flavor**) modules, and attach any config files you want preserved across updates.
   - **Tile 3 (`Rules & Upload`):** Configure optional **Highlander Exclusive Slot (`highlander_group`)**, **Required DLC**, **Required Mods (Dependencies)**, and **Incompatible Mods (Conflicts)**.

## Step 2: Choose Your $0 Static Host (`.sanctuary.manifest.json` vs. `catalog.json`) & Optional 1-Click Auto-Push

Paste your raw static URL into **Static Polling Manifest URL** at the bottom of **Rules & Upload**—or select an **Auto-Push Provider** so Sanctuary OS pushes updates directly from your PC in 1 click without opening a browser:

- **1-Click OS Auto-Push (100% Client-Side, 6 Providers Supported):**
  - **GitHub Repo / Cloudflare Pages:** Enter `owner/repo` and a scoped GitHub Personal Access Token (`Contents: Read & Write` on 1 repo). Pushing to GitHub also automatically deploys connected Cloudflare Pages / Netlify / Vercel domains!
  - **GitHub Gist (Zero-Repo Setup):** Enter a GitHub token with `gist` scope and leave Gist ID blank—on your first click of **Export & Auto-Push (.zip)**, Sanctuary OS automatically creates the Gist, grabs its permanent raw URL, and stamps it into your release `.zip`.
  - **GitLab / Codeberg / Gitea:** Uses a Project Access Token to push directly to GitLab or Codeberg repositories.
  - **Neocities Site API:** Uploads manifests or `catalog.json` directly to `https://{sitename}.neocities.org/...`.
  - **Personal Domain (HTTP PUT / WebDAV):** Pushes JSON directly to any custom HTTPS endpoint with optional Bearer or Basic auth.
  - **Local Synced Folder (Zero-Token):** Writes `.sanctuary.manifest.json` or merges into `catalog.json` inside any local GitHub Desktop or cloud-synced folder.
- **Manual Upload Options:**
  - **Option A — GitHub Raw / Cloudflare Pages:** Host `.sanctuary.manifest.json` (or `manifest.json`) on any public HTTPS static host.
  - **Option B — Single Master `catalog.json` for All Your Mods:** Point all of your mods to a single `https://.../catalog.json` file containing an `"artifacts": [...]` array. Sanctuary's concurrent Rust poller matches each installed mod by composite `(manifest_url, artifact_id)`, `current_hashes`, `modules[].sha256`, or `previous_hashes` with `ETag` / `304` caching.

## Step 3: Export Your First Release (`v1.0.0`)

Click **Export Static Manifest (.zip)** in **Rules & Upload**:

- Sanctuary OS computes the SHA-256 DNA hash of your primary artifact and every sibling module in the folder (`current_hashes` and `modules[]`).
- It writes namespaced `.sanctuary.manifest.json` and `.sanctuary.override.json` sidecars into your Sandbox folder and packages `{ModName}_v1.0.0_SanctuaryRelease.zip`.
- Upload the `.zip` to your normal download page and publish your manifest to your static URL.

## Step 4: Publishing Updates (`v1.1.0+`) & Automatic Lineage Hash Rollover

When you build a new version (`v1.1.0`):

1. Drop the updated files into the **same Sandbox folder** (replacing the `v1.0.0` files).
2. Update **Mason Version** to `v1.1.0` and click **Export Static Manifest (.zip)** (or **Export & Auto-Push**).
3. **Automatic Lineage Rollover:** Sanctuary OS inspects your previous manifest and SQLite `edge_manifests` table, rolling changed `v1.0.0` SHA-256 hashes into `previous_hashes` while promoting `v1.1.0` hashes to `current_hashes`.
4. **Instant Update Pings:** The next time any Citizen's Sanctuary OS sweeps your static URL, it detects their `v1.0.0` hash inside `previous_hashes` and lights up an **Update Available** alert across **Command Center**, **Your Vault**, and **Patch Readiness**!

## Step 5: What Citizens Experience (One-Time Drag & Drop Forever)

- **Zero-Popup Auto-Registration:** Dragging your `.zip` into Sanctuary OS once registers your `manifest_url` and lineage hashes automatically.
- **Full Synced Behavior:** Their mod displays as `Stable`, multi-file suites coalesce cleanly, Highlander Exclusive Slot swaps prompt cleanly, and all DLC/Dependency/Conflict rules enforce automatically.
- **In-Place Lineage Upgrades:** Dropping `v1.1.0` locates the old `v1.0.0` file by its SHA-256 lineage hash and replaces it in-place even if you changed the filename.

---

# Part 5: Master Schema v2 Studio & Lexicon Visual Studio V2 Guide

*(Open this interactive guide inside Sanctuary OS anytime by clicking **Schema Codex** or **Lexicon Codex** (`menu_book` icon) inside the **Master Schema Visual Studio**, **Lexicon Visual Studio**, or IDE header.)*

## 5.1 Master Schema v2 Studio (Multi-Game Engine Blueprints)

A **Master Schema JSON** (`v12`) is the engine blueprint that makes Sanctuary OS 100% game-agnostic across Windows, macOS, and Linux / SteamOS:

1. **7 Built-In Game Architecture Presets & Safe Defaults:**
   - Choose from **The Sims 4**, **Cyberpunk 2077**, **Skyrim SE / Fallout 4**, **Grand Theft Auto V**, **Baldur's Gate 3**, **Stardew Valley**, or **Universal**, or click **Populate Safe Defaults**—validated live against the **Keepers Core Default Schema (`default.json`)**.
2. **Cross-Platform Executables, Paths & Vanilla Isolation (`Tab 1 — Identity & Paths`):**
   - Supports Windows `.exe` (including DX11/x64 variants), macOS `.app` bundles, Proton `compatdata/<AppID>/pfx/` auto-mapping, `shared_vanilla_dir` link tracking, `preserve_archive_structure`, and `preserve_auxiliary_assets`.
3. **Extensions, Config Formats, Install Routes & Conflict Analyzers (`Tab 2 — Extensions & Routes`):**
   - Configure `supported` deployable extensions, `archive_containers`, `editable_config_formats` / `config_extensions` (monitored by the **Dynamic Config Watcher**), secondary `install_routes`, `mod_categories`, and declarative **`conflict_analyzers`** (`virtual_fs_path`, `archive_member`, `binary_chunk_index`, and `json_xml_key`).
4. **Load Order Strategies & Structured Compilers (`Tab 3 — Load Order & Tiers`):**
   - Choose `folder_priority`, `numeric_prefix`, `manifest_list` (with structured header/entry/footer XML or text templates such as `modsettings.lsx`), or `timestamp`.
5. **Exception Log Matchers, Time Capsule & Save Airgap (`Tab 4 — Logs & Backups`):**
   - Configure crash log matchers, pinned **Known Error Rules**, `time_capsule` folder/file targets, and `save_airgap_targets` protected by Homestead's externalized Save-Verify-and-Rewind airgap.

## 5.2 Lexicon Visual Studio V2 (Sparse Delta Packs, `{Glossary}` Tokens & 1-Click Auto-Translate)

Every string, button, tooltip, and icon in Sanctuary OS routes through **Lexicon Engine V2**:

1. **Guided 2-Step Creation & Sparse Delta Override Packs:**
   - Choose **Vocabulary / Theme** or **Language Translation** (28+ languages) in the 2-step creation drawer. Every custom pack stores only **Sparse Delta Overrides** that inherit automatically from the auto-extracted **`6,166`-key `en-default.json` baseline**—meaning zero bloat and zero missing-string placeholders.
2. **4-Tab Source-First Visual Studio:**
   - **Tab 1 (`Core Vocabulary`):** Edit all **21 Dynamic `{Glossary}` Tokens** (`{Mod}`, `{Vault}`, `{Blueprint}`, `{Mason}`, `{Citizen}`, `{Lab}`, `{Backups}`, `{Settings}`, etc.) with live real-sentence casing and `"a"`/`"an"` grammar previews.
   - **Tab 2 (`UI Strings`):** Browse strings by section with Default English source text always visible directly above every input, plus `All / Customized / Untranslated` status pills.
   - **Tab 3 (`Translate & Replace`):** Run **1-Click Neural Auto-Translate** across **28+ languages** (`Starter`, `Remaining`, or `All` scopes with automatic `{Glossary}` token masking) or preview live before-and-after **Batch Find & Replace** diffs.
   - **Tab 4 (`Pack Info & Icons`):** Manage pack metadata, prune identical redundant keys in 1 click, and remap OS Material Symbols visually with `Default → New` glyph previews.

---

# Part 6: Supporter Pipeline, Partner Spoke Covenants & Offline/Cloud Sync Architecture

1. **Cloud-First Live Delivery + Offline Codebase & Vault Baselines:**
   - Core Schemas, Lexicons, Chameleon Themes (cached locally to `{Vault}/Data/Themes/`), Directives, and Legal Covenants sync live from **Keepers Core** without requiring desktop reinstalls, while bundled JSON/Markdown files guarantee instant 100% offline operation.
2. **Global Supporter Pipeline (`$5 = +30 Days` Dev Builds) & Transparent Ledgers:**
   - Every `$5` contribution to Sanctuary Foundry or a Partner Spoke adds `+30 days` of automated Dev Build access across Windows, macOS, and Linux / SteamOS, backed by transparent monthly **Cost vs. Spending Reports** and Carryover Ledgers.
3. **Readiness-Gated Partner Spoke Onboarding, Donation Isolation & `SRK1` Sovereignty:**
   - Partner Communities review the **Sanctuary Partners Agreement** and **Compliance Protocol**, retain **100% exclusive control over their Spoke database and non-custodial community donations (`0%` Sanctuary cut)**, can execute high-friction **Cut the Cord** severance at any time, and support cryptographic **`SRK1` Spoke Relink** profile claiming for returning Citizens.

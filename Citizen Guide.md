# Sanctuary OS — Official Citizen Guide & Interactive OS Walkthrough

New to Sanctuary OS? This 10-stage interactive walkthrough, 12-module operational reference, and 6-tier clearance guide explains every persistent bar, button, card, and studio in the operating system—backed by an offline codebase baseline that automatically syncs live updates from the Sanctuary OS Hub database.

---

# Part 1: Step-by-Step OS Walkthrough (10 Stages — What Everything Does)

## Stage 1: Global Shell Anatomy (Sidebar, Control Capsule, Jump Gate & Deck Overdrive)

Sanctuary OS is framed by persistent WebGL2 3D **Liquid Glass Optics** regions that adapt dynamically to whether you are on the **Foundry Landing Page** or inside an active **Game Workspace**:

- **Left Navigation Sidebar:**
  - **On the Landing Page:** Displays Web/Foundry scrolling Quick Links (**Active Workspaces**, **Sanctuary Foundry News**, **System Directives**, **Partner Spokes**, **Legal**, **Donations**, **Preferences**) and—exclusively for Keepers—the **Sanctuary Foundry -> Keepers Core** hub. Game workspace links and the **Quick Launch** button are cleanly hidden here.
  - **Inside a Mounted Game Workspace:** Displays the 9 Citizen Operational Sectors (**Command Center**, **Your Vault**, **The Nexus**, **Blueprints**, **Comm-Link Feed**, **Conflict Radar 2.0**, **Groundhog Sandbox**, **Live-Wire Workbench**, **Time Capsule**), your unlocked sub-second Command Hubs (**Mason Workshop**, **Architect Console**, **Oversight Command**, **Wayfinder Operations**, **Keepers Core**), and the bottom **Quick Launch** ignition button.
- **Top-Right Control Capsule, Jump Gate (`Ctrl+K`) & Deck Overdrive:**
  - Houses the **Active Workspace Selector**, **System Queues & Utilities** (`Blueprint Signature Queue`, `Duplicate & Update Resolver`, **Pocket Radar**, **Browser Autoloader**), **Notification Center** (with **Echo Suppressor** Zero-PII Cross-Device Alert Sync), **Jump Gate (`Ctrl+K` / `Cmd+K`)**, and **7-Domain System Preferences** inside a single unified glass capsule.
  - Press `Ctrl+K` / `Cmd+K` to open **Jump Gate** and fuzzy-search across all 18 OS views, installed Vault mods, Blueprints, Mason profiles, Workbench configs, Chameleon themes, and Lexicon packs—or use **Deck Overdrive** (`Left Stick` / `Right Trackpad` **60 FPS Chameleon Virtual Pointer**, `D-Pad` spatial focus & slider stepping, `A`/`R2` click + Steam OSK auto-summon, `L2`/`X` right-click menu, `B` layered back, `L1`/`R1` tab cycling, and `Right Stick` / `Left Trackpad` scrolling).
- **OS-Wide Right-Click Menus & Responsive Mobile Drawers:**
  - Right-click any card or row across every Citizen view and Elevated Hub for instant glassmorphic quick actions, while mobile screens automatically condense drawer filter bars into a sleek **Liquid Glass Selector Pill + Popover Menu** across 51+ panels.
- **Command Center Quick Actions & Live System Telemetry Toast:**
  - Instead of a permanent bottom status bar, Sanctuary OS surfaces a transient **Bottom-Right System Telemetry Toast** only when background scans, deployments, or system alerts are active (complete with a live scan progress bar and 1-click dismiss). Clicking the toast opens the **System Log History** drawer (`All`, `Vault`, `The Nexus`, and `Alerts` streams), while **1-Click Radar Sweep** and **Vault Lockdown** live directly in **Command Center** and System Queues.

## Stage 2: The Cartographer, Binary Version Ripper & 7-Domain Preferences

When you select a game workspace from the Landing Page or the Top Control Capsule for the first time, **The Cartographer** maps your local coordinates across **Windows**, **macOS**, and **Linux / SteamOS (Steam Deck)**:

- **Game Paths (`Settings -> Game & Backups` with Game-Only Auto Detect):**
  - **Game Executable Folder (`live_path`):** Point this to the folder containing your game binary (e.g., `.exe` on Windows/Proton or `.app` on macOS). **Binary Version Ripper** (in-process Rust `pelite`, `Info.plist`, Steam `.acf`, and `json_key`) extracts the genuine engine version directly from binary headers.
  - **Active Mods Folder (`mods_path`):** Your game's live mod folder (**Deck Overdrive** auto-resolves Proton `compatdata/<AppID>/pfx/` prefixes and SD card libraries on Linux & Steam Deck, paired with 1-click cross-drive UAC symlink unlocking on Windows and automatic rescue of untracked mods).
  - **Saves, Logs & Cache Folder (`docs_path`):** Auto-resolved from the **Universal Master Schema** so **Time Capsule**, **Crash Autopsy** log scanning, and **Purge Stale Game Caches on Launch** locate your user-data directory immediately.
- **OS-Wide Master Vault Path (`Settings -> Vault & Blueprints`):** Choose a dedicated storage root that governs the entire Sanctuary OS (**Zero-Copy Exodus** safely migrates your Master Vault root as well as external MO2/Vortex/staging managers)—storing shared Chameleons (`Data/Themes/`) and Lexicons at the root while maintaining isolated per-game `Mods/`, `Blueprints/`, `Backups/Mods/`, `Backups/World/`, `Backups/Engine/`, `Quarantine/`, and `.sanctuary_cache.db` subfolders.
- **Per-Space Chameleons & Lexicons (`Settings -> Appearance`):** Assign independent **Liquid Glass Optics** Chameleon Themes and **Code-Switch** Lexicon Packs for **Keepers Core** and each mounted **Game Workspace** from a single matrix—and mute secondary workspaces per alert category in **Settings -> Notifications**.

## Stage 3: Symlink Airgap, The Highlander Rule & Echo Archive

Inside **Your Vault**, every mod lives safely inside your isolated Vault archive:

- **Global Drag-and-Drop Ingest, Quartermaster & Rosetta Protocol:** Drag supported mod files, `.zip`/`.rar`/`.7z`/`.mrpack`/`.wabbajack` archives, Blueprints/Lexicons/Chameleons/Templates/Schemas JSONs, or `.sanctuary.override.json` sidecars anywhere onto Sanctuary OS. Sanctuary hashes every file with SHA-256 (`DNA`), runs **Bytecode Hound**, walks **The Quartermaster** (`ModuleConfig.xml` FOMOD / BAIN) on multi-variant drops, translates third-party packs via **The Rosetta Protocol**, preserves multi-folder asset trees where required, and lets you choose **Skip** or **Update & Archive** on duplicates.
- **Category Stat Tiles & Unified Search/Filter Bar:**
  - The top row of category stat tiles switches primary sub-views (`All`, `Enabled`, `Disabled`, `Version History`, `Unregistered`), paired with the unified search bar and `Filters` popover below.
- **The Highlander Rule & Explicit Swap Alerts:**
  - Mods that replace the same single-slot game feature (via Registry `highlander_group_id` or Static Edge `atomic_logic.highlander_group`) never collapse unrelated creators into one folder and **never silently auto-remove your equipped mod**. Equipping a rival throws an explicit **Swap Alert** on the card or inside **Mod Dossier**—letting you choose **Swap**, **Keep Both** (sending the pair to Conflict Radar), or **Cancel**—while **Nuclear Family Cohesion** keeps multi-module suites and companions coupled automatically.
- **Echo Archive & Family Rollbacks (`Backups/Mods/`):**
  - Every installed mod is archived from **Version #1** using zero-extra-byte OS hardlinks via **Echo Archive**. Open **Version History** (or click **Versions** inside any **Mod Dossier**) to roll back an entire multi-file suite via the **Suite Revision Matrix**, or let **Patch Fire Drill** detect `Auto-Swap Ready` local versions automatically.
- **Mod Card Anatomy, Suite Grouping & Mod Dossiers:**
  - Multi-part mod families and script+module twins coalesce into a single clean Parent Card with an expandable `{N} Linked Modules` drawer, `Stable` / `Unstable` / `Corrupted` outline badges (with rich hover diagnostics and creator **Issue & Cause Details**), 1-click Collection `Add All` / `Remove All`, **Deep Yeet** full teardown, and customizable Local Dossiers.

## Stage 4: Blueprints, Patch Fire Drill, Beam to Rig & Pocket Radar

**Blueprints** replace manual folder dragging with instant, self-healing mod loadouts that synchronize across all of your gaming rigs and mobile devices:

- **Patch Fire Drill & 1-Click Clone Ready (`Blueprints -> Patch Readiness`):**
  - Simulate any game patch across all of your Blueprints with exact 1-to-1 mod count parity. Expandable family drawers group actionable items into **Needs Update**, **Needs Dependency Update**, **Auto-Swap Ready**, **Awaiting Patch**, and **Missing Dependency** (with 1-click **Get Dependency** / **Equip from Vault** actions and a `99%` cap whenever any mod is unready).
  - Click **Clone Ready Blueprint** to generate a sanitized, ready-to-play copy that strips unpatched mods and any transitive child addons while leaving your original Blueprint untouched.
- **Autonomous Self-Healing & 3-Mode Cloud Visibility:**
  - After every settled Vault scan, Blueprints automatically heal renamed or moved files via SHA-256 DNA matching and prune deleted ghosts without manual popups. When syncing to the cloud, pick from 3 clear visibility modes: **Public Verified** / **Nexus Listing**, **Unlisted • Uplink Code (`SNCXXX`)**, or **Private • Account Only**.
- **Beam to Rig & Browser Autoloader (`1 of N`):**
  - **Beam to Rig** transfers complete, un-scrubbed Blueprints—including local/Tier 1–4 mods, priority tiers, and conflict waivers—between your Desktop PC and Steam Deck using concurrent **GZIP + Zero-PII AES-256-GCM** streaming (`Leave in Cloud` with per-rig `Complete on This Rig` vs. `Shred After Deploy`), routing any missing downloads straight into **Browser Autoloader (`1 of N`)**.
- **Pocket Radar (Mobile & Web Companion):**
  - Open **Pocket Radar** on your phone or browser to check your encrypted Desktop Vault, Critical Failure, System Alert, and Update counts—including **Edge Pulse** static updates—and queue fixes remotely.

## Stage 5: Conflict Radar 2.0, Priority Compiler & Groundhog Sandbox

Catch collisions before launching and verify suspect mods inside an anti-cheat-safe, save-airgapped proving ground:

- **Conflict Radar 2.0 & 5-Tier Severity Matrix:**
  - Runs schema-defined `virtual_fs_path`, `archive_member`, `binary_chunk_index`, and `json_xml_key` analyzers across **Severity 5 (`Circular Loop`)** down to **Severity 1 (`Visual Override`)**—unified 1-to-1 with **Command Center** alert tiles and offering 1-click **"Set Winner"** Priority Override Tiers.
- **Priority Compiler (Game-Agnostic Load Order Engine):**
  - Compiles topological load orders across `folder_priority`, `manifest_list`, `numeric_prefix`, and `timestamp`, complete with directional `Must Load After / Before` rules, Loop Breaker resolution, and a searchable **Scan Scope** Blueprint selector.
- **Groundhog Sandbox, Save Doctor & Crash Autopsy:**
  - **2-Column Environment Builder & Crash Autopsy:** Stage a **Primary Mod**, **Dependencies**, and **Conflict Check** on the sticky **Active Test Bench** (staging only the target mod + its twin without collection sibling bleed), or paste crash logs into **Crash Autopsy** (`Corrupted`, `Unstable`, `Unrelated` pinned known errors).
  - **Save Doctor & Groundhog Sandbox Airgap (4-Stage Passive Timer):** **Save Doctor** pairs `{Vault}/.sanctuary_save_doctor/<ws>.sanctuary-save-manifest.json` with your save state to warn before launch if a Blueprint switch removes mods required by existing saves, while **Homestead Save Airgap** seals live saves in an external Vault mirror (`SanctuarySaveVault`) and mounts a **disposable copy** of your read-only **Golden Baseline Lab Test Save** on every run—waiting for loading screens to settle, suspending on `ESC` pause menus with **zero overlays or anti-cheat hooks**, playing **native fullscreen PCM audio chimes** when the timer finishes, auditing Stage 4 in-game saves for magic-byte corruption, and discarding the mutated test copy on 1-click teardown.

## Stage 6: Live-Wire Workbench & Time Capsule

Configure mod settings visually, sync live in-game config changes, and seal multi-gigabyte backups in seconds:

- **Live-Wire Workbench:**
  - **2-Column Visual Config Editor & Live-Wire Diff:** Edit `.sanctuary.template.json` schemas and native `.cfg`, `.ini`, `.json`, `.toml`, `.yaml`, and `.xml` files at 60 FPS using toggles, `Min`/`Max` steppers, keybind recorders, and interactive **Workbench Template Previews**—paired with automatic root config deduplication and a **2-Column `[In-Game Engine Edit]` Live-Wire Diff Timeline**.
- **Time Capsule (Parallel CoW Snapshots):**
  - Streams **World State** (purple) and **Engine Core** (pink) snapshots across all CPU cores using zero-byte OS hardlinks (sealing a 78 GB game installation in ~9 seconds), enforces delta-aware **Time Capsule Storage Limits**, catches missed or offline game patches on next Desktop open (**DEFCON 1 Shield**), and performs **strictly additive** World State save restores followed by a **Post-Restore Summary** drawer.

## Stage 7: Creator Airlock, Zero-Knowledge Seal & Zero-Choice Lockdown

Every Citizen inherits local creator tooling, backed by zero-knowledge auth, hardware passkeys, and multi-format bytecode inspection:

- **Open Mason Workshop & Creator Airlock (Inherited by All Citizens):** Access **Dev Sandbox**, **Mason IDE**, **Unified 3-Tile Artifact Studio**, **Theme Forge** (6 optical sliders + Content-Addressed `<= 250 KB` WebP / External HTTPS wallpapers), **Lexicon Visual Studio**, **Notepad**, DPAPI/AES-256-GCM sealed **Edge Direct Push**, and **Creator Airlock** (save-airgapped external tool sessions with automatic post-exit save restoration)—with Verified Mason clearance unlocking direct cloud publishing to **The Nexus**.
- **Zero-Knowledge Seal & Gatekeeper Clearance:** Protects accounts with **600,000-iteration PBKDF2 + Bcrypt** stretching and **600k Blinded Email Aliases**, unlocking Elevated Hubs via Windows Hello, **Gatekeeper Clearance** (macOS Touch ID + `com.apple.quarantine` stripping), a **12-hour Device-Bound Passkey Seal**, or a **Live Phone/PC Companion Passkey Handshake** via W3C Web Push, backed by **Ghost Scrubber** Zero-PII log sanitization.
- **Bytecode Hound & Zero-Choice Lockdown:** Inspects archives, Zlib/Zstd binary streams, scripts, `.pyc` bytecode, and native plugins against Core + Spoke heuristics, locking the OS shell under **Zero-Choice Lockdown** on Tier 5 Malware until Citizen-signed **Secure Shred**.

## Stage 8: Edge Pulse & Edge Direct Push (Static Hosting)

Independent Masons and Compliance Tier 1–4 creators can distribute live update alerts, Highlander slot rules, and multi-file suite grouping with zero server costs:

- **Edge Pulse & 6-Provider Edge Direct Push:** Sanctuary's bounded concurrent Rust poller checks remote `.sanctuary.manifest.json` and multi-mod `catalog.json` endpoints with `ETag` / `304` caching, while creators can push releases in 1 click via **Edge Direct Push** to **GitHub Repo / Cloudflare Pages**, **GitHub Gist**, **GitLab / Codeberg**, **Neocities**, **Personal WebDAV / HTTP PUT**, or a **Local Synced Folder** with automatic `previous_hashes` lineage rollover.

## Stage 9: Universal Master Schema, Schema Forge & Code-Switch

Configure any game engine and translate or theme the entire operating system in minutes:

- **Universal Master Schema & Schema Forge (7 Engine Presets):** 4-tab visual studio (`Identity & Paths`, `Extensions & Routes`, `Load Order & Tiers`, `Logs & Backups`) supporting multi-folder asset trees, secondary `install_routes`, structured XML/manifest compilers, declarative `conflict_analyzers`, and an interactive **Schema Codex**.
- **Code-Switch (Sparse Delta Packs & 1-Click Auto-Translate):** Backed by an auto-extracted **`6,800+`-key `en-default.json` baseline**, custom packs store only lightweight **Sparse Delta Overrides**, update OS-wide nouns dynamically via **21 `{Glossary}` Tokens**, and include a **2-Step Creation Wizard**, Source-First UI String Browser, Guided Icon Overrides, and **1-Click Neural Auto-Translate across 28+ languages**.

## Stage 10: Command Center Support Desk, Sovereign Covenants & Cut the Cord

Track open support tickets, audit transparent monthly server ledgers, or launch a Sovereign Partner Spoke:

- **Command Center Support Desk & Scoped Tickets:** View and reply to your active **Spoke Support Tickets** right from **Command Center** (or switch cleanly between Spoke and Keepers Core tickets inside **Settings -> Support Tickets**).
- **Transparent Monthly Cost Ledgers & `$5 = +30 Days` Dev Builds:** Inspect itemized 2-column **Cost vs. Spending Reports** and live carryover ledgers in **Supporter & Perks**, stack `+30 days` of Global Dev Build access per `$5` donated (`0%` Sanctuary cut), and sync Verified Mason supporter perks across rigs with Zero-PII E2EE.
- **Cut the Cord, `SRK1` Spoke Relink & Mirror Uplink:** Partner communities retain 100% database and donation ownership under **Sovereign Covenants**, can execute irreversible **Cut the Cord** severance behind a `"CUT THE CORD"` phrase lock, let returning users claim legacy Spoke profiles cleanly with **`SRK1` Spoke Relink Tokens**, and stay aligned via **Mirror Uplink** offline baselines + live cloud updates.

---

# Part 2: 12 Citizen & Creator Operational Modules

1. **The Cartographer & 7-Domain Settings:** Cross-platform drive reconnaissance (Windows `.exe` + 1-click symlink unlock, macOS `.app`, and **Deck Overdrive** Proton `compatdata` + SD cards), separated OS-wide **Master Vault Path** (**Zero-Copy Exodus**) vs. **Game-Only Auto Detect**, auto-resolved **Saves, Logs & Cache**, Per-Space Chameleon/Lexicon assignments, and Per-Spoke Notification Muting.
2. **The Command Center:** Unified conflict/readiness stat tiles, border-tinted Liquid Glass **System Alert Cards** with `Ignore` / `Restore`, followed-creator **Comm-Link** tailoring, live **Spoke Support** Open Tickets, `2x3` **System Telemetry**, **Jump Gate (`Ctrl+K`)**, and **Deck Overdrive**.
3. **Symlink Airgap, The Highlander Rule & Echo Archive:** Zero-copy symlink projection, multi-file **Nuclear Family Cohesion**, **The Highlander Rule** explicit swap alerts (`Swap` / `Keep Both`), zero-byte hardlink **Echo Archive (`Backups/Mods/`)**, **Suite Revision Matrix**, 279-mod instant Collection equipping, and **Deep Yeet** cascades.
4. **Blueprints, Patch Fire Drill & Beam to Rig:** 1-to-1 **Patch Fire Drill** with **1-Click Clone Ready Blueprint**, 3-mode Cloud Blueprint visibility (`Public` / `Unlisted` / `Private`), autonomous SHA-256 self-healing, concurrent GZIP + AES-256-GCM **Beam to Rig**, and **Pocket Radar**.
5. **The Nexus & Browser Autoloader (`1 of N`):** Discovery for Mods, Blueprints, Sparse Delta Lexicons, Content-Addressed Chameleons, and interactive Workbench Templates, paired with the download-intercepting **Browser Autoloader (`1 of N`)**.
6. **Conflict Radar 2.0 & Priority Compiler:** 5-Tier Severity Matrix (`S1–S5`), declarative `virtual_fs_path` / `archive_member` / `binary_chunk_index` / `json_xml_key` analyzers, 1-click `"Set Winner"` Priority Tiers, directional load rules, and structured manifest compilation.
7. **Groundhog Sandbox & Save Doctor:** Externalized immortal Vault save mirror, **Save Doctor** read-only Golden Baseline + disposable test copy with Stage 4 magic-byte corruption auditing, zero-anti-cheat passive 4-stage timer, native fullscreen PCM chimes, **Homestead Save Airgap**, and **Crash Autopsy** pinned diagnostics.
8. **Time Capsule & Live-Wire Workbench:** Multi-threaded `rayon` Copy-on-Write snapshots (`World State` & `Engine Core`), additive save slot extraction & restoration, storage-cap pruning, **DEFCON 1 Shield**, and 60 FPS 2-column visual config editing with **Live-Wire Diff** timelines.
9. **Liquid Glass Optics, Zero-Knowledge Seal & Zero-Choice Lockdown:** 1:1 physical-pixel WebGL2 refraction, `<= 250 KB` content-addressed WebP wallpapers + external HTTPS URLs, OWASP 600k Zero-Knowledge Auth, **Gatekeeper Clearance** Touch ID & Companion Handshakes, **Ghost Scrubber**, and **Bytecode Hound** **Zero-Choice Lockdown**.
10. **Edge Pulse & Edge Direct Push:** Bounded concurrent Rust polling (`ETag` / `304` cached `.sanctuary.manifest.json` & `catalog.json`), 6-provider 1-click **Edge Direct Push**, and automatic `previous_hashes` lineage rollover.
11. **Universal Master Schema & Code-Switch:** **Schema Forge** with 7 engine presets, multi-folder asset trees, secondary `install_routes`, `6,800+`-key auto-extracted baseline, 21 `{Glossary}` tokens, Source-First Studio, and **1-Click Neural Auto-Translate (28+ languages)**.
12. **Sovereign Covenants, Cut the Cord & Mirror Uplink:** Sub-second Elevated Hubs, 100% Wayfinder-isolated community donations, itemized monthly Cost vs. Spending ledgers, **Cut the Cord** severance, cryptographic **`SRK1` Spoke Relink Tokens**, and **Mirror Uplink** bilateral sync.

---

# Part 3: 6-Tier Clearance Hierarchy & Command Hubs

Sanctuary OS enforces a strict separation between **Game Spoke Roles (`userRole`)** and **Core OS Hub Roles (`osRole`)** across 6 distinct clearance tiers—with all 5 Elevated Command Hubs loading in **under a second** into full landing-page overviews:

## Tier 1: Citizen (Base Clearance + Creator Airlock Inheritance)

- **Scope:** Local Machine + Active Game Spoke (`userRole = 'citizen'`).
- **9 Core Sectors:** Full offline and online access to **Command Center**, **Vault**, **The Nexus** (Tier-0 catalog), **Blueprints** + **Patch Fire Drill**, **Comm-Link**, **Conflict Radar 2.0**, **Groundhog Sandbox**, **Live-Wire Workbench**, and **Time Capsule**.
- **Inherited Creator Airlock:** Local `Dev Sandbox`, `Mason IDE`, `Unified 3-Tile Artifact Studio`, `Theme Forge`, `Lexicon Visual Studio`, `Notepad`, local JSON export/import, and **Edge Direct Push** (`.sanctuary.manifest.json`, `.sanctuary.override.json` & `catalog.json` across 6 providers).
- **Scout Queue & Support:** Share Blueprints (`Public`, `Unlisted`, `Private`), submit passing Tier-0 mod discoveries (`_lab_cert_proof`) to the **Scout Queue**, open **Community Mod Support** whenever your **active Blueprint** contains only verified Tier-0 mods (never deleting local Vault files), or file unrestricted **OS Bug Reports** (`keeper_tickets`) directly to Foundry Keepers with zero mod telemetry.

## Tier 2: Verified Mason (Verified Mod Creator)

- **Scope:** Active Game Spoke (`userRole = 'mason'` / `isVerifiedMason = true`). Protected by **Zero-Knowledge Seal**.
- **Verified Fast-Lane & Nexus Publishing:** Bypasses crowd Scout thresholds to submit verified Tier-0 mods, Lexicons, Chameleons (`<= 250 KB` WebP or external HTTPS URLs), and Workbench Templates directly to Architect review.
- **Public Showcase & Creator Identity:** Manage your public Mason Profile, featured releases, **The Highlander Rule** Exclusive Slots, dependency trees, and multi-range game compatibility rules.
- **Comm-Link Broadcasts & Support:** Publish rich Markdown release announcements and polling dispatches to followers, and submit creator diagnostic dossiers.
- **0%-Cut Supporter Bridge & Edge Pulse:** Link Patreon, Ko-fi, or custom membership perks with **0% Sanctuary cut** (plus Zero-PII E2EE Multi-Rig perk sync) and ship Tier 1–4 creations responsibly via **Edge Pulse** static manifests.

## Tier 3: Architect (Tier-0 Registry & Conflict Moderator)

- **Scope:** Active Game Spoke (`userRole = 'architect'`). Protected by **Zero-Knowledge Seal**.
- **Strict Tier-0 Registry Curation:** Unlocks the **Architect Console** (strictly isolated to **Public Verified** Tier 0 `Stable`, unflagged records)—including 3-Tile Artifact Studio curation, suite/dependency trees, **The Highlander Rule** Exclusive Slots, and multi-range game version rules.
- **Verified Mason & Scout Queue Triage:** Review `unverified` / `under_review` community submissions inside the **Verified Mason Queue** and **Scout Queue**, run deep **Check Hash** verification, and approve clean Tier-0 records.
- **Conflict Matrix & Known Exception Rules:** Author global Severity 1–4 conflict directives, curate interactive **Workbench Templates**, and publish database-driven **Known Exception Rules** tied to **Crash Autopsy** failure diagnostics.
- **Claimable Support Desk & Escalation:** Claim and resolve encrypted **Tier-0 Citizen Support** tickets (`Claimed` exclusive ownership) using **Ghost Scrubber** PII-scrubbed crash logs and Active Blueprint snapshots. Architects cannot issue bans or confirm Tier 1–4 classifications; any Tier 1–4 or suspicious flag routes into **Oversight Command -> Compliance** as **`Pending`** and hides flagged public items until reviewed.

## Tier 4: Oversight (Spoke Security & System Administrator)

- **Scope:** Active Game Spoke (`userRole = 'oversight'`). Protected by **Zero-Knowledge Seal**.
- **Tier 1–4 & Pending Flag Confirmation:** Unlocks **Oversight Command** as the exclusive reviewer of escalated Tier 1–4 (**Public Scrubbed** / **Active Blueprint Support Lock**) entries, sensitive reports, and **`Pending`** community flags (`has_pending_flag` auto-hides public entries until Oversight/Wayfinder confirms or dismisses).
- **Bytecode Hound (Spoke Rules) & Zero-Choice Lockdown:** Author game-specific heuristic regex signatures (`heuristic_signatures`), blacklist Tier 5 Malware SHA-256 hashes under **Zero-Choice Lockdown**, and manage **DEFCON 1 Shield** pre-patch lockdowns.
- **Game Patches, DLC Catalogs & Mass Triage:** Register official engine patch versions and database-driven DLC catalogs (`dlc_registry`), run **Mass Update** multi-range compatibility sweeps, and link orphaned creator releases in **Mason Linker**.
- **Spoke Identity & Audit Governance:** Grant/revoke roles up to `architect` in the Identity Matrix and inspect read/export-only `audit_logs`.

## Tier 5: Wayfinder (Community Manager & Spoke Sovereign)

- **Scope:** Full Sovereign Authority over the Active Game Spoke (`userRole = 'wayfinder'`). Protected by **Zero-Knowledge Seal**.
- **Full Identity Matrix & Compliance Control:** Appoint and manage all Spoke roles up to `oversight` and peer `wayfinder`, and retain full compliance authority over community moderation.
- **Sovereign Uplink, Sovereign Covenants & Cut the Cord:** Rotate Spoke Gateway Tokens (`spk_gw_*`) in 1 click, export/re-import secret-free `SANCTUARY-UPLINK://` bundles, inspect **Sovereign Covenants**, or execute irreversible **Cut the Cord** severance cleanly with 100% database ownership intact.
- **Schema Forge & Spoke Branding/Lexicons:** Customize **Universal Master Schema** JSON (`sanctuary_schemas`), ship Spoke Chameleons & Lexicon delta packs, and customize DB-driven **Title Area** branding in Standalone forks.
- **0%-Cut Donations, Cost Ledgers & The Dispatch:** Publish transparent monthly Server Cost vs. Donation ledgers in the non-custodial Spoke Donation Hub and issue top-banner community polls.
- **Mass Update, Audit Trails & Keepers Uplink:** Execute in-hub Registry batch updates, audit Spoke moderation trails, and coordinate directly with Core Keepers.

## Tier 6: Keeper (Core OS Hub & Sanctuary Foundry Developer)

- **Scope:** Global Sanctuary OS Hub (`osRole = 'keeper'`). Protected by **Zero-Knowledge Seal**.
- **Partner Spoke Onboarding & Dev Cloaking:** Unlocks **Keepers Core** on both the Landing Page and mounted workspaces—evaluating Partner Spoke applications, validating `schema.sql`, toggling `Keepers-Only` dev workspaces, and managing extreme Hub severance or **Nuclear Override** HW bans.
- **Bytecode Hound (Core Rules) & Threat Manifests:** Maintain global antivirus rules (`keeper_heuristic_signatures`) and triage **Ghost Scrubber** Threat Manifests submitted from quarantined drops.
- **Master Default Schema, Aesthetics & Lexicons:** Govern `default.json`, Core Title Area & subtitles, global Chameleon themes, and official Keepers Lexicons (`en-default` / `en-sanctuary`).
- **OS Bug Reports (`keeper_tickets`), News & Mirror Uplink:** Resolve cross-platform **OS Bug Reports** (100% exempt from Spoke mod locks and mod telemetry), publish Foundry Release Notes, and run **Mirror Uplink** bilateral `system_directives` and legal covenant sync without app rebuilds.

---

# Part 4: Edge Pulse Guide (`.sanctuary.manifest.json` / `catalog.json` & Lineage Hash Rollover)

For **Compliance Tier 1–4** creators and independent **Masons** who distribute outside the public Nexus catalog, **Edge Pulse** includes a **$0-cost Concurrent Decentralized Poller & DNA Lineage Engine**. This allows any mod to behave like a fully synced mod—complete with `Stable` status, automatic update notifications, multi-file **Nuclear Family Cohesion** grouping, **The Highlander Rule** Exclusive Slots, Required DLC / Dependency / Conflict checks, and in-place file replacement—from a **one-time drag-and-drop**.

*(You can also open this interactive walkthrough at any time inside Sanctuary OS by clicking **Static Polling Guide** in the **Creator Airlock → Sandbox** header or inside the **Rules & Upload** tab of any Sandbox artifact.)*

## Step 1: Stage Your Mod in Creator Airlock

1. Drop your mod files, scripts, and optional config files into `Vault/Dev/Sandbox/` (or click **Import** inside **Creator Airlock → Sandbox**).
2. Click your mod card to open the **3-Tile Artifact Studio**:
   - **Tile 1 (`Details & Versions`):** Enter your mod's **Name**, **Mason Version** (e.g., `1.0.0`), **Safety Tier** (`0` through `4`), **Issue & Cause Details** (optional), **Download URL**, and compatible **Game Versions**.
   - **Tile 2 (`Files & Folders`):** Link any companion script/module (**Twin**) or optional (**Add-on / Flavor**) modules, and attach any config files you want preserved across updates.
   - **Tile 3 (`Rules & Upload`):** Configure optional **Highlander Exclusive Slot (`highlander_group`)**, **Required DLC**, **Required Mods (Dependencies)**, and **Incompatible Mods (Conflicts)**.

## Step 2: Choose Your $0 Static Host & Edge Direct Push

Paste your raw static URL into **Static Polling Manifest URL** at the bottom of **Rules & Upload**—or select an **Edge Direct Push** provider so Sanctuary OS pushes updates directly from your PC in 1 click without opening a browser:

- **Edge Direct Push (100% Client-Side, 6 Providers Supported):**
  - **GitHub Repo / Cloudflare Pages:** Enter `owner/repo` and a scoped GitHub Personal Access Token (`Contents: Read & Write` on 1 repo). Pushing to GitHub also automatically deploys connected Cloudflare Pages / Netlify / Vercel domains!
  - **GitHub Gist (Zero-Repo Setup):** Enter a GitHub token with `gist` scope and leave Gist ID blank—on your first click of **Export & Auto-Push (.zip)**, Sanctuary OS automatically creates the Gist, grabs its permanent raw URL, and stamps it into your release `.zip`.
  - **GitLab / Codeberg / Gitea:** Uses a Project Access Token to push directly to GitLab or Codeberg repositories.
  - **Neocities Site API:** Uploads manifests or `catalog.json` directly to `https://{sitename}.neocities.org/...`.
  - **Personal Domain (HTTP PUT / WebDAV):** Pushes JSON directly to any custom HTTPS endpoint with optional Bearer or Basic auth.
  - **Local Synced Folder (Zero-Token):** Writes `.sanctuary.manifest.json` or merges into `catalog.json` inside any local GitHub Desktop or cloud-synced folder.
- **Manual Upload Options:**
  - **Option A — GitHub Raw / Cloudflare Pages:** Host `.sanctuary.manifest.json` (or `manifest.json`) on any public HTTPS static host.
  - **Option B — Single Master `catalog.json` for All Your Mods:** Point all of your mods to a single `https://.../catalog.json` file containing an `"artifacts": [...]` array. **Edge Pulse** matches each installed mod by composite `(manifest_url, artifact_id)`, `current_hashes`, `modules[].sha256`, or `previous_hashes` with `ETag` / `304` caching.

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
4. **Instant Update Pings:** The next time any Citizen's **Edge Pulse** sweeps your static URL, it detects their `v1.0.0` hash inside `previous_hashes` and lights up an **Update Available** alert across **Command Center**, **Your Vault**, and **Patch Fire Drill**!

## Step 5: What Citizens Experience (One-Time Drag & Drop Forever)

- **Zero-Popup Auto-Registration:** Dragging your `.zip` into Sanctuary OS once registers your `manifest_url` and lineage hashes automatically.
- **Full Synced Behavior:** Their mod displays as `Stable`, multi-file suites coalesce cleanly, **The Highlander Rule** Exclusive Slot swaps prompt cleanly, and all DLC/Dependency/Conflict rules enforce automatically.
- **In-Place Lineage Upgrades:** Dropping `v1.1.0` locates the old `v1.0.0` file by its SHA-256 lineage hash and replaces it in-place even if you changed the filename.

---

# Part 5: Schema Forge & Code-Switch Guide

*(Open this interactive guide inside Sanctuary OS anytime by clicking **Schema Codex** or **Lexicon Codex** (`menu_book` icon) inside **Schema Forge**, **Code-Switch** Lexicon Studio, or IDE header.)*

## 5.1 Universal Master Schema & Schema Forge (Multi-Game Engine Blueprints)

A **Master Schema JSON** (`v12`) is the engine blueprint that makes Sanctuary OS 100% game-agnostic across Windows, macOS, and Linux / SteamOS:

1. **7 Built-In Game Architecture Presets & Safe Defaults:**
   - Choose from **The Sims 4**, **Cyberpunk 2077**, **Skyrim SE / Fallout 4**, **Grand Theft Auto V**, **Baldur's Gate 3**, **Stardew Valley**, or **Universal**, or click **Populate Safe Defaults**—validated live against the **Keepers Core Default Schema (`default.json`)**.
2. **Cross-Platform Executables, Paths & Vanilla Isolation (`Tab 1 — Identity & Paths`):**
   - Supports Windows `.exe` (including DX11/x64 variants), macOS `.app` bundles, **Deck Overdrive** Proton `compatdata/<AppID>/pfx/` auto-mapping, `shared_vanilla_dir` link tracking, `preserve_archive_structure`, and `preserve_auxiliary_assets`.
3. **Extensions, Config Formats, Install Routes & Conflict Analyzers (`Tab 2 — Extensions & Routes`):**
   - Configure `supported` deployable extensions, `archive_containers`, `editable_config_formats` / `config_extensions` (monitored by **Live-Wire Workbench**), secondary `install_routes`, topological `slot_buckets` / container TOC analyzers (while managing Categories dynamically via relational `public.taxonomy` in **Oversight -> Game Management -> Categories**).
4. **Priority Compiler & Structured Manifests (`Tab 3 — Load Order & Tiers`):**
   - Choose `folder_priority`, `numeric_prefix`, `manifest_list` (with structured header/entry/footer XML or text templates such as `modsettings.lsx`), or `timestamp`.
5. **Crash Autopsy Matchers, Time Capsule & Save Airgap (`Tab 4 — Logs & Backups`):**
   - Configure **Crash Autopsy** matchers, pinned **Known Error Rules**, `time_capsule` folder/file targets, and `save_airgap_targets` protected by **Save Doctor** and **Homestead Save Airgap**.

## 5.2 Code-Switch (Sparse Delta Packs, `{Glossary}` Tokens & 1-Click Auto-Translate)

Every string, button, tooltip, and icon in Sanctuary OS routes through **Code-Switch**:

1. **Guided 2-Step Creation & Sparse Delta Override Packs:**
   - Choose **Vocabulary / Theme** or **Language Translation** (28+ languages) in the 2-step creation drawer. Every custom pack stores only **Sparse Delta Overrides** that inherit automatically from the auto-extracted **`6,800+`-key `en-default.json` baseline**—meaning zero bloat and zero missing-string placeholders.
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

<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:
{
  "slug": "citizen_guide",
  "_schemaVersion": 88,
  "title": "Interactive {Citizen} Guide & OS Walkthrough",
  "summary": "10-stage interactive walkthrough of Sanctuary OS, 12 operational & creator modules (including Static Edge Direct Push, Master Schema & Lexicon Studios, and Spoke Covenants), and the 6-Tier Clearance Hierarchy.",
  "tabs": [
    {
      "id": "walkthrough",
      "icon": "play_circle",
      "label": "10 STAGES",
      "value": "OS Walkthrough",
      "cards": [
        {
          "id": "walk_1",
          "icon": "space_dashboard",
          "overline": "STAGE 1 OF 10",
          "badge": "1. Shell & Bars",
          "title": "Global Shell: Sidebar, Top Control Capsule & Telemetry Toast",
          "footerMeta": "Persistent Glass Frame & Context-Aware Navigation",
          "desc": "Sanctuary OS is framed by persistent Liquid Glass regions that adapt automatically between the Foundry Landing Page and your mounted Game Workspaces.",
          "subCards": [
            {
              "id": "walk_1_c1",
              "icon": "menu",
              "title": "Left Navigation Sidebar",
              "desc": "On the Landing Page, scrolls to Web sections and shows Keepers Core for Keepers. Inside a game workspace, switches between the 9 {Citizen} modules, unlocked Command Hubs, and the Quick Launch button."
            },
            {
              "id": "walk_1_c2",
              "icon": "sports_esports",
              "title": "Top-Right Control Capsule, Jump Gate & Deck Overdrive",
              "desc": "Houses the Active Workspace Selector, System Queues & Utilities, Notification Center, Jump Gate (Ctrl+K / Cmd+K), and 7-Domain {Settings} inside one unified glass capsule—paired with the Deck Overdrive controller engine."
            },
            {
              "id": "walk_1_c3",
              "icon": "monitoring",
              "title": "Live Telemetry Toast & System Log History",
              "desc": "Surfaces a transient bottom-right telemetry toast during active scans or alerts—opening System Log History on click—alongside Command Center quick actions for Radar Sweep and {Vault} Lockdown."
            }
          ]
        },
        {
          "id": "walk_2",
          "icon": "explore",
          "overline": "STAGE 2 OF 10",
          "badge": "2. Cartographer",
          "title": "Mounting a Workspace & Cartographer (Win, Mac & Linux / SteamOS)",
          "footerMeta": "First-Boot Coordinate Mapping & Native PE/Plist/Proton Ripper",
          "desc": "Selecting a workspace on the Landing Page launches The Cartographer to link your Windows (.exe), macOS (.app), or Linux / SteamOS (Proton compatdata) game binary, live {Mods} directory, and airgapped {Vault} storage.",
          "subCards": [
            {
              "id": "walk_2_c1",
              "icon": "terminal",
              "title": "Bin Folder (Windows .exe, macOS .app & Linux / Proton)",
              "desc": "Points to your game binary (.exe or .app). Sanctuary extracts the genuine patch version in-process via Rust pelite or macOS Info.plist across native and Proton prefixes."
            },
            {
              "id": "walk_2_c2",
              "icon": "folder_open",
              "title": "{Mods} Folder (Symlink Target)",
              "desc": "Your live game {Mods} folder. Keep this untouched—Sanctuary projects active {mods} here via zero-copy OS symlinks and custom install_routes."
            },
            {
              "id": "walk_2_c3",
              "icon": "inventory_2",
              "title": "{Vault} Folder (Deep Archive)",
              "desc": "Your isolated storage directory where Sanctuary builds {Mods}/, {Blueprints}/, Backups/World/, Backups/Engine/, Backups/Mods/, Quarantine/, and Data/Cache/."
            }
          ]
        },
        {
          "id": "walk_3",
          "icon": "inventory_2",
          "overline": "STAGE 3 OF 10",
          "badge": "3. {Vault} & Cards",
          "title": "Your {Vault}, {Mod} Cards & Unified Filter Bar",
          "footerMeta": "Drag-and-Drop Ingestion, Suite Grouping & Dossiers",
          "desc": "Every {mod} you drop into Sanctuary OS is fingerprinted with SHA-256, scanned by the Bytecode Hound Core + Spoke Heuristic Engine, and indexed in Your {Vault}.",
          "subCards": [
            {
              "id": "walk_3_c1",
              "icon": "tune",
              "title": "Unified Search & Filters Bar",
              "desc": "Instant search bar, Filters popover for Game Version and Eligible-Only filtering, sort order, and bulk selection actions."
            },
            {
              "id": "walk_3_c2",
              "icon": "toggle_on",
              "title": "Parent Suite Card & Equip Toggle",
              "desc": "Toggles symlinks in milliseconds. Multi-part {mod} suites group into one Parent Card with an expandable Linked Modules drawer."
            },
            {
              "id": "walk_3_c3",
              "icon": "menu_book",
              "title": "{Mod} Dossier Drawer",
              "desc": "Click any card to open its right-hand Dossier: edit custom local names/URLs/tags, bind a static .sanctuary.manifest.json / catalog.json URL, or inspect module files."
            }
          ]
        },
        {
          "id": "walk_4",
          "icon": "map",
          "overline": "STAGE 4 OF 10",
          "badge": "4. {Blueprints}",
          "title": "{Blueprints} & Loadout Hot-Swapping",
          "footerMeta": "Zero-Copy Profile Switching & SNCXXX Cloud Uplinks",
          "desc": "Replace manual folder dragging with saved tactical loadouts that swap thousands of symlinks in under a second.",
          "subCards": [
            {
              "id": "walk_4_c1",
              "icon": "swap_horiz",
              "title": "{Blueprint} Hot-Swap Dropdown",
              "desc": "Switch between playstyles (e.g. Realism Run, Overhaul Profile, Patch Testing) directly from the {Vault} header, {Blueprints} view, or Top-Right Control Capsule."
            },
            {
              "id": "walk_4_c2",
              "icon": "data_object",
              "title": "Portable Offline JSON Export",
              "desc": "Exports your loadout to a self-contained .json file that preserves custom local modMeta URLs and workspace identity offline."
            },
            {
              "id": "walk_4_c3",
              "icon": "tag",
              "title": "6-Digit Cloud Uplink (SNCXXX)",
              "desc": "Generates a 6-character share code (SNCXXX) or publishes your {Blueprint} to The Nexus while auto-stripping flagged Tier 1–4 hashes."
            }
          ]
        },
        {
          "id": "walk_5",
          "icon": "radar",
          "overline": "STAGE 5 OF 10",
          "badge": "5. Radar & Lab",
          "title": "Conflict Radar 2.0 & Groundhog Sandbox",
          "footerMeta": "5-Tier Severity Matrix, Priority Compiler & Isolated Sandbox",
          "desc": "Resolve mod collisions across a 5-Tier Severity Matrix, set load order winners in one click via Priority Compiler, or isolate suspect {mods} inside Groundhog Sandbox.",
          "subCards": [
            {
              "id": "walk_5_c1",
              "icon": "emoji_events",
              "title": "5-Tier Severity Radar & 1-Click Winner",
              "desc": "Classifies collisions across Severity 1–5 and lets you click 'Set Winner' in one click to promote your chosen {mod} into an elevated Priority Tier."
            },
            {
              "id": "walk_5_c2",
              "icon": "rule",
              "title": "Priority Compiler & Loop Breaker",
              "desc": "Assign game-agnostic Priority Tiers (Standard Load to Final Override), build Must Load After/Before rules with 1-click Break Loop, and adapt automatically between folder-tier and sequential load order engines."
            },
            {
              "id": "walk_5_c3",
              "icon": "science",
              "title": "Groundhog Sandbox & Save Airgap",
              "desc": "Snapshots save_airgap_targets (saves & user profiles), boots with only the test {mod} (or 1v1 pair), harvests crash logs, and restores your saves."
            }
          ]
        },
        {
          "id": "walk_6",
          "icon": "construction",
          "overline": "STAGE 6 OF 10",
          "badge": "6. IDE & Backups",
          "title": "Live-Wire Workbench & {Backups}",
          "footerMeta": "Visual Config Sync, Live-Wire Diff & Hardlink Snapshots",
          "desc": "Edit 430+ setting {mod} config files visually at 60 FPS, sync live in-game config writes back to the {Vault}, and safeguard saves with hardlink snapshots.",
          "subCards": [
            {
              "id": "walk_6_c1",
              "icon": "tune",
              "title": "Live-Wire Config Watcher",
              "desc": "Category Pill Bar, dual Min/Max range steppers, Undo/Reset, plus the Dynamic Config Watcher that syncs in-game .cfg/.ini/.json edits back to your {Vault}."
            },
            {
              "id": "walk_6_c2",
              "icon": "compare_arrows",
              "title": "Timeline & Live-Wire Diff",
              "desc": "Compare live unsaved edits or historical snapshots side-by-side in Visual Diff cards or Raw Monaco Code Diff."
            },
            {
              "id": "walk_6_c3",
              "icon": "history",
              "title": "{Backups} (World State & Engine Core)",
              "desc": "Uses OS hardlinks so unchanged files consume 0 extra bytes, paired with differential rollback restoration."
            }
          ]
        },
        {
          "id": "walk_7",
          "icon": "shield",
          "overline": "STAGE 7 OF 10",
          "badge": "7. Hubs & Security",
          "title": "Zero-Knowledge Seal & Bytecode Hound",
          "footerMeta": "Bytecode Hound, FIDO2 Passkeys & Zero-Choice Lockdown",
          "desc": "Every {Citizen} inherits the local Open {Mason} Workshop & Creator Airlock, while hardware FIDO2 Passkeys and the Bytecode Hound Heuristic Scanner protect the OS.",
          "subCards": [
            {
              "id": "walk_7_c1",
              "icon": "handyman",
              "title": "Open {Mason} Workshop & Creator Airlock",
              "desc": "All {Citizens} can use Dev Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, sealed Static Edge Push, and Save-Airgapped Creator Airlock external tool sessions with automatic post-exit save restoration."
            },
            {
              "id": "walk_7_c2",
              "icon": "passkey",
              "title": "Gatekeeper Clearance & FIDO2 {Vault}",
              "desc": "Elevated clearances (Verified {Mason} through Keeper) bind Windows Hello, Touch ID, or YubiKey tokens inside the right-hand Security {Vault} drawer."
            },
            {
              "id": "walk_7_c3",
              "icon": "gpp_bad",
              "title": "Bytecode Hound & Zero-Choice Lockdown",
              "desc": "Decompresses Zlib/Zstd binary module streams and Base64/Hex strings against Core + Spoke rules, locking the OS with Move-mode source disposition and Secure Shred."
            }
          ]
        },
        {
          "id": "walk_8",
          "icon": "cloud_upload",
          "overline": "STAGE 8 OF 10",
          "badge": "8. Static Edge",
          "title": "Edge Pulse & Static Manifest Engine",
          "footerMeta": ".sanctuary.manifest.json • catalog.json • Lineage Hash Rollover",
          "desc": "Publish {mod} updates without a central server using static .sanctuary.manifest.json or multi-{mod} catalog.json endpoints with 1-click Edge Direct Push and automatic SHA-256 lineage rollover.",
          "subCards": [
            {
              "id": "walk_8_c1",
              "icon": "rocket_launch",
              "title": "Edge Direct Push (6 Providers)",
              "desc": "Push .sanctuary.manifest.json or catalog.json directly from your PC to GitHub Repo/Cloudflare Pages, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
            },
            {
              "id": "walk_8_c2",
              "icon": "history",
              "title": "Automatic Lineage Hash Rollover",
              "desc": "Exporting a new version automatically rolls prior v1.0 hashes into previous_hashes so {Citizens} get instant Update Available alerts and in-place file replacement."
            },
            {
              "id": "walk_8_c3",
              "icon": "library_books",
              "title": "Single Master catalog.json Support",
              "desc": "Point all of your {mods} to one shared catalog.json URL—Sanctuary OS matches each installed {mod} by artifact ID, current_hashes, or previous_hashes."
            }
          ]
        },
        {
          "id": "walk_9",
          "icon": "schema",
          "overline": "STAGE 9 OF 10",
          "badge": "9. Schema & Lexicon",
          "title": "Universal Master Schema & Code-Switch",
          "footerMeta": "7 Engine Presets • 21 {Glossary} Tokens • Guided Icon Builder",
          "desc": "Configure any game engine across Windows, macOS, and Linux / SteamOS with Schema Forge, and hot-swap all 1,700+ OS strings and icons with Code-Switch.",
          "subCards": [
            {
              "id": "walk_9_c1",
              "icon": "schema",
              "title": "7 Engine Presets & Schema Forge",
              "desc": "Load built-in engine architecture presets—complete with declarative install_routes, DAG load-order & container TOC analyzers, and database-driven public.taxonomy Categories—or author a custom Universal schema."
            },
            {
              "id": "walk_9_c2",
              "icon": "translate",
              "title": "21 Dynamic {Glossary} Tokens & Parity Alert",
              "desc": "Editing {Mod}, {Vault}, or {Blueprint} updates 1,700+ strings with automatic Title/lower/UPPER casing, a/an grammar, and live cloud updates without rebuilding the app."
            },
            {
              "id": "walk_9_c3",
              "icon": "apps",
              "title": "Lexicon Codex & Icon Override Studio",
              "desc": "Search and remap any OS Material Symbol icon visually with side-by-side Default → New glyph previews, or open the interactive Schema & Lexicon Codex."
            }
          ]
        },
        {
          "id": "walk_10",
          "icon": "handshake",
          "overline": "STAGE 10 OF 10",
          "badge": "10. Support & Partners",
          "title": "Sovereign Covenants & Partner Spokes",
          "footerMeta": "$5 = +30 Days Dev Builds • 0% Partner Cut • Sovereign Covenants",
          "desc": "Submit Core OS feedback or bug reports from the Landing Page, unlock Dev Builds via the Supporter Pipeline, or apply to launch a Sovereign Partner Spoke.",
          "subCards": [
            {
              "id": "walk_10_c1",
              "icon": "favorite",
              "title": "Supporter Pipeline ($5 = +30 Days Dev Builds)",
              "desc": "Every $5 contribution adds +30 days of automated Dev Build access (Windows .msi, macOS .dmg & Linux / SteamOS .AppImage/.deb) verified via Stripe Receipt / Order ID."
            },
            {
              "id": "walk_10_c2",
              "icon": "gavel",
              "title": "Readiness-Gated Partner Spoke Application",
              "desc": "Review the Sanctuary Partners Agreement and Compliance Protocol in an interactive overlay drawer, verify your schema.sql Spoke readiness, and retain 100% of community donations."
            },
            {
              "id": "walk_10_c3",
              "icon": "cloud_sync",
              "title": "Offline Codebase Baseline + Live Cloud Updates",
              "desc": "Bundled .md, schema, and lexicon files power instant first-launch & offline use, while connected desktops receive live cloud updates without reinstalling."
            }
          ]
        }
      ]
    },
    {
      "id": "modules",
      "icon": "explore",
      "label": "12 MODULES",
      "value": "{Citizen} Tools",
      "cards": [
        {
          "id": "mod_1",
          "icon": "explore",
          "overline": "MODULE 1 OF 12",
          "badge": "1. Cartographer",
          "title": "Cartographer Initialization & System Coordinates",
          "footerMeta": "INITIAL SETUP • 3 COORDINATES",
          "desc": "On first boot, the Cartographer maps your machine's file system and extracts your genuine game engine version directly from the binary executable (.exe / .app) using an in-process Rust PE/plist parser.",
          "tip": "Click the Cloud Auto-Detect icon during setup to automatically locate your Game Bin and {Mods} directories for the active workspace.",
          "subCards": [
            {
              "id": "mod_1_c1",
              "icon": "terminal",
              "title": "Game Bin Folder (Live Engine)",
              "desc": "Where your game executable lives. Sanctuary reads PE headers directly from the .exe (or macOS .app Info.plist) to guarantee 100% patch version accuracy with zero antivirus false positives."
            },
            {
              "id": "mod_1_c2",
              "icon": "folder_open",
              "title": "Active {Mods} Folder (Symlink Target)",
              "desc": "Your game's live {Mods} folder. Never drop files here manually—Sanctuary projects high-speed symlinks into this directory from your isolated {Vault}."
            },
            {
              "id": "mod_1_c3",
              "icon": "inventory_2",
              "title": "Isolated {Vault} Folder (Deep Storage)",
              "desc": "Your airgapped archive containing {Mods}/, {Blueprints}/, Backups/World, Backups/Engine, Backups/Mods, Quarantine/, and Data/Cache (.sanctuary_cache.db)."
            },
            {
              "id": "mod_1_c4",
              "icon": "verified_user",
              "title": "Windows, macOS & Linux / SteamOS Symlink Permissions",
              "desc": "Enable Windows Developer Mode (or macOS Full Disk Access; native POSIX symlinks on Linux & SteamOS) so the Airgap engine can project zero-byte symlinks and manage com.apple.quarantine attributes cleanly."
            }
          ]
        },
        {
          "id": "mod_2",
          "icon": "space_dashboard",
          "overline": "MODULE 2 OF 12",
          "badge": "2. Command Center",
          "title": "The Command Center & Live Telemetry",
          "footerMeta": "SYSTEM DASHBOARD • 4 HEALTH STATES",
          "desc": "Your high-level glassmorphic mission control. Monitors the health of your active {Blueprint}, surfaces {mason} updates and system dispatches, and provides 1-click access to Radar Sweeps and {Vault} Lockdown.",
          "tip": "Use Command Center quick actions or the Top-Right Control Capsule to trigger a Radar Sweep, inspect System Queues, or engage instant {Vault} Lockdown.",
          "subCards": [
            {
              "id": "mod_2_c1",
              "icon": "check_circle",
              "title": "System Stable (Green State)",
              "desc": "All equipped {mods} match your active game version, all required DLCs and dependencies are satisfied, and zero unmitigated collisions exist."
            },
            {
              "id": "mod_2_c2",
              "icon": "system_update_alt",
              "title": "{Mod} Updates Available (Blue State)",
              "desc": "Newer SHA-256 versions have been detected either via the Spoke Cloud Registry or decentralized {mason} .sanctuary.manifest.json / catalog.json endpoints."
            },
            {
              "id": "mod_2_c3",
              "icon": "warning",
              "title": "{Citizen} Action Recommended (Amber State)",
              "desc": "An equipped {mod} is flagged as Unstable or has an unresolved Severity 3 Tuning Overlap awaiting a Load Order winner."
            },
            {
              "id": "mod_2_c4",
              "icon": "error",
              "title": "Critical Failure Detected (Red State)",
              "desc": "An equipped {mod} is Corrupted, incompatible with your Game Patch, missing a mandatory dependency/DLC, or locked in a Severity 4 Fatal Clash."
            }
          ]
        },
        {
          "id": "mod_3",
          "icon": "inventory_2",
          "overline": "MODULE 3 OF 12",
          "badge": "3. Your {Vault}",
          "title": "Symlink Airgap & Your {Vault}",
          "footerMeta": "ISOLATED STORAGE • SHA-256 DNA",
          "desc": "Your local {vault} and secured asset bunker. The game engine never touches your {Vault} directly—files are ingested, hashed via SHA-256, scanned by Bytecode Hound, and projected via symlinks.",
          "tip": "Your Local {Mod} Dossier is decoupled from the cloud—you can freely customize {mod} titles, creator URLs, cover images, and tags locally.",
          "subCards": [
            {
              "id": "mod_3_c1",
              "icon": "fingerprint",
              "title": "Global Drop-Zone & DNA Match",
              "desc": "Drag and drop supported {mod} binaries, .zip, .rar, .7z, .mrpack, .wabbajack, JSON bundles, or .sanctuary.override.json files anywhere into Sanctuary OS. Duplicate SHA-256 hashes are automatically intercepted."
            },
            {
              "id": "mod_3_c2",
              "icon": "cloud_done",
              "title": "Edge Pulse (.sanctuary.override.json)",
              "desc": "When a {mod} archive includes a {mason}'s .sanctuary.override.json, Sanctuary binds its SHA-256 lineage to the {mason}'s static .sanctuary.manifest.json or catalog.json URL for serverless update alerts."
            },
            {
              "id": "mod_3_c3",
              "icon": "delete_sweep",
              "title": "Deep Yeet",
              "desc": "Removing a core master library (such as a shared framework) automatically alerts you and queues all dependent add-ons so your loadout never breaks."
            },
            {
              "id": "mod_3_c4",
              "icon": "visibility_off",
              "title": "Ghosted Diagnostic States",
              "desc": "Incompatible or broken {mods} automatically enter a translucent Ghosted state with hover tooltips detailing Missing DLC, Version Mismatches, or Collisions."
            }
          ]
        },
        {
          "id": "mod_4",
          "icon": "map",
          "overline": "MODULE 4 OF 12",
          "badge": "4. {Blueprints}",
          "title": "{Blueprints} & Tactical Loadouts",
          "footerMeta": "INSTANT HOT-SWAP • CLOUD & OFFLINE",
          "desc": "Replace manual folder shuffling with {Blueprints}. Switch between completely different {mod} loadouts in seconds without duplicating files on your hard drive.",
          "tip": "Use 'Snapshot Active {Blueprint}' anytime to clone your currently deployed loadout into an experimental profile before adding new {mods}.",
          "subCards": [
            {
              "id": "mod_4_c1",
              "icon": "swap_horiz",
              "title": "1-Click {Blueprint} Hot-Swap",
              "desc": "Switch active loadouts directly from the {Vault} header or {Blueprints} view. Sanctuary instantly re-projects the exact symlinks and load order for that profile."
            },
            {
              "id": "mod_4_c2",
              "icon": "tag",
              "title": "6-Digit Cloud Uplink (SNCXXX)",
              "desc": "Share your loadout with the community or across devices using a compact 6-character alphanumeric coordinate code."
            },
            {
              "id": "mod_4_c3",
              "icon": "data_object",
              "title": "Offline JSON Import/Export with modMeta",
              "desc": "Export portable JSON {blueprints} that embed your custom Local Dossier metadata (author links, custom names) and workspace ID for 100% offline preservation."
            },
            {
              "id": "mod_4_c4",
              "icon": "install_mobile",
              "title": "Remote Mobile/Web Queue Staging",
              "desc": "Browse The Nexus on your phone or tablet, stage a {blueprint} queue encrypted in the cloud, and approve it in one click when you sit down at your PC."
            }
          ]
        },
        {
          "id": "mod_5",
          "icon": "hub",
          "overline": "MODULE 5 OF 12",
          "badge": "5. Nexus & Browser",
          "title": "The Nexus & Integrated Side Browser",
          "footerMeta": "METADATA REGISTRY • ZERO-TAX DISCOVERY",
          "desc": "Discover verified {Mods}, {Blueprints}, Lexicons, Chameleons, and Workbench Templates—and download directly from creator pages using the built-in Side Browser.",
          "tip": "You can toggle the Integrated Side Browser on or off anytime in System Preferences -> Network depending on whether you prefer in-app or external browsing.",
          "subCards": [
            {
              "id": "mod_5_c1",
              "icon": "tune",
              "title": "Smart Compatibility Filtering",
              "desc": "The Nexus automatically cross-references your installed Game Patch and owned DLCs, highlighting compatible releases and enforcing Tier-0 public safety."
            },
            {
              "id": "mod_5_c2",
              "icon": "download",
              "title": "Automatic Download Interception",
              "desc": "Clicking download on a creator's page inside the Integrated Side Browser automatically intercepts the archive and routes it straight into your {Vault}."
            },
            {
              "id": "mod_5_c3",
              "icon": "verified",
              "title": "{Mason} Profiles & Direct Attribution",
              "desc": "Follow your favorite {Masons} to see their posts in your Comm-Link feed. Sanctuary takes 0% platform tax and links directly to {mason} Patreon, Ko-fi, and websites."
            },
            {
              "id": "mod_5_c4",
              "icon": "radar",
              "title": "Crowd-Sourced Scout Queue",
              "desc": "Unidentified local {mods} can be submitted via the Scout Dossier or marked 'Flag as Local' to permanently exclude private files from cloud lookups."
            }
          ]
        },
        {
          "id": "mod_6",
          "icon": "radar",
          "overline": "MODULE 6 OF 12",
          "badge": "6. Conflict Radar 2.0",
          "title": "Conflict Radar 2.0 & Game-Agnostic Load Order Engine",
          "footerMeta": "5-TIER SEVERITY MATRIX • STRATEGY-AWARE LOAD ORDER",
          "desc": "Sanctuary combines global Architect Directives, creator Static Edge rules, and a strategy-aware topological Load Order compiler to resolve overlaps and prevent crashes before launch.",
          "tip": "Click 'Inspect & Resolve' on any conflict card to select which {mod} wins in-game and assign it to an elevated Priority Tier.",
          "subCards": [
            {
              "id": "mod_6_c1",
              "icon": "emoji_events",
              "title": "1-Click 'Set Winner' & Priority Override Tiers",
              "desc": "Click 'Set Winner' on any conflict or assign {mods} across 4 game-agnostic Priority Tiers (Standard Load, Late Load Tier 1, High Priority Tier 2, Final Override Tier 3)."
            },
            {
              "id": "mod_6_c2",
              "icon": "rule",
              "title": "Directional Load Order Rules & Loop Breaker",
              "desc": "Lock Must Load After (Wins) or Must Load Before (Yields) dependencies between any two {mods}, with automatic DFS circular-loop detection and 1-click Break Loop resolution."
            },
            {
              "id": "mod_6_c3",
              "icon": "warning",
              "title": "5-Tier Severity Matrix (Severity 1–5)",
              "desc": "Classifies overlaps across Severity 5 (Circular Loop), Severity 4 (Fatal Core/Script Clash), Severity 3 (Gameplay Tuning Overlap), Severity 2 (Duplicate Clone), and Severity 1 (Visual/Texture Override)."
            },
            {
              "id": "mod_6_c4",
              "icon": "layers",
              "title": "Searchable Scan Scope & 4 Load Order Engines",
              "desc": "Switch Scan Scope across 100+ {Blueprints} via a searchable selector and compile load order via Priority Override Tiers (dynamic manifest), Manifest List (loadorder.txt), Numeric Prefix (001_), or Timestamp Order."
            }
          ]
        },
        {
          "id": "mod_7",
          "icon": "science",
          "overline": "MODULE 7 OF 12",
          "badge": "7. Sandbox",
          "title": "Groundhog Sandbox",
          "footerMeta": "AIRGAPPED SANDBOX • LIVE CRASH AUTOPSY",
          "desc": "Test unverified {mods} or pit two conflicting {mods} against each other inside an airgapped sandbox without risking your real save files or main loadout.",
          "tip": "Passing a timed Groundhog Sandbox playtest and saving in-game automatically verifies your Sandbox {mod} for publishing!",
          "subCards": [
            {
              "id": "mod_7_c1",
              "icon": "bolt",
              "title": "100% Nuke Symlink Injection",
              "desc": "Temporarily strips your active loadout symlinks and injects only the isolated test subject plus its mandatory dependencies."
            },
            {
              "id": "mod_7_c2",
              "icon": "shield",
              "title": "Homestead Save Airgap",
              "desc": "Swaps your live user saves directories with a dedicated Lab Test Save slot during testing so your primary save slots can never be corrupted."
            },
            {
              "id": "mod_7_c3",
              "icon": "bug_report",
              "title": "Crash Autopsy Monitor",
              "desc": "Purges stale logs before launch and watches for engine exception and crash output in real time, matching against community diagnostic signatures."
            },
            {
              "id": "mod_7_c4",
              "icon": "compare_arrows",
              "title": "1v1 Conflict Stability Protocol",
              "desc": "Pit two suspected conflicting {mods} together in isolation to verify compatibility and submit telemetry directly to Architects."
            }
          ]
        },
        {
          "id": "mod_8",
          "icon": "history",
          "overline": "MODULE 8 OF 12",
          "badge": "8. {Backups} & IDE",
          "title": "{Backups} & Live-Wire Workbench",
          "footerMeta": "HARDLINK SNAPSHOTS • LIVE-WIRE DIFF",
          "desc": "Protect your saves and game binaries with zero-duplication hardlink backups, and fine-tune {mod} configuration files using visual sliders or the built-in Monaco IDE.",
          "tip": "When DEFCON 1 is declared for an incoming game patch, Sanctuary automatically prompts to seal a Pre-Patch {Backups} before launching.",
          "subCards": [
            {
              "id": "mod_8_c1",
              "icon": "archive",
              "title": "World State (Purple) & Engine Core (Pink)",
              "desc": "Independently snapshot your user saves, profiles, and configs (World State) and your actual Game Installation Binaries (Engine Core) before patches hit."
            },
            {
              "id": "mod_8_c2",
              "icon": "home_storage",
              "title": "0 MB Delta Hardlink Deduplication",
              "desc": "Unchanged files are linked via native OS hardlinks rather than copied—making snapshots near-instant and consuming disk space only for changed bytes."
            },
            {
              "id": "mod_8_c3",
              "icon": "settings_backup_restore",
              "title": "Differential Rollback & Surgical Extraction",
              "desc": "Restore an entire snapshot via fast differential sync, or browse inside any {Backups} to surgically extract an individual save slot."
            },
            {
              "id": "mod_8_c4",
              "icon": "construction",
              "title": "Live-Wire Workbench & Creator Airlock",
              "desc": "Edit {mod} .json/.ini/.cfg files with safe visual toggles and sliders synced live with a Monaco Raw Code Diff editor—plus full local Sandbox & Export Release tools for all {Citizens}."
            }
          ]
        },
        {
          "id": "mod_9",
          "icon": "shield",
          "overline": "MODULE 9 OF 12",
          "badge": "9. Themes & Security",
          "title": "Chameleons, Lexicons & Malware Defense",
          "footerMeta": "LIQUID GLASS V3 • CORE + SPOKE HEURISTICS",
          "desc": "Personalize every pixel and word of Sanctuary OS while staying protected by cryptographic SHA-256 DNA blacklists and the multi-format Rust Heuristic Scanner.",
          "tip": "Sanctuary OS works 100% offline without an account—and if you sign in, elevated roles are protected by hardware/biometric FIDO2 Passkeys.",
          "subCards": [
            {
              "id": "mod_9_c1",
              "icon": "palette",
              "title": "Liquid Glass Optics",
              "desc": "Switch between Dark and Light presets, download community Chameleons, or build your own in Theme Forge with live refractive saturation, rim light, and specular glare sliders."
            },
            {
              "id": "mod_9_c2",
              "icon": "translate",
              "title": "Code-Switch",
              "desc": "Hot-swap the entire OS vocabulary between Standard Technical English, Sanctuary Sci-Fi Cyberpunk, Community Casual, or Spoke Dialect Packs."
            },
            {
              "id": "mod_9_c3",
              "icon": "security",
              "title": "Bytecode Hound",
              "desc": "Combines Core Heuristics and Spoke Heuristics with Zlib/Zstd binary stream decompression to inspect .zip, .mod, .bin, .dll, .exe, and compiled script bytecode."
            },
            {
              "id": "mod_9_c4",
              "icon": "gpp_bad",
              "title": "Zero-Choice Lockdown",
              "desc": "If Tier 5 Malware is detected, Sanctuary isolates the file in Quarantine, locks the workspace shell, displays the exact trigger & source in the side panel, and overwrites the file with zeros upon your Secure Shred signature."
            }
          ]
        },
        {
          "id": "mod_10",
          "icon": "cloud_upload",
          "overline": "MODULE 10 OF 12",
          "badge": "10. Edge Pulse",
          "title": "Edge Pulse & Catalog Distribution",
          "footerMeta": ".SANCTUARY.MANIFEST.JSON • CATALOG.JSON • EDGE DIRECT PUSH",
          "desc": "Zero-server update distribution for independent {Masons} and Tier 1–4 creators—supporting 1-click Edge Direct Push, automatic SHA-256 lineage rollover, and in-place {Vault} upgrades.",
          "tip": "Use a single catalog.json URL across your entire {mod} portfolio so {Citizens} receive update pings for every {mod} from one static file.",
          "subCards": [
            {
              "id": "mod_10_c1",
              "icon": "cloud_upload",
              "title": "Edge Direct Push (6 Providers)",
              "desc": "Push .sanctuary.manifest.json or catalog.json directly from the Rust backend to GitHub, GitHub Gist, GitLab/Codeberg, Neocities, WebDAV, or a Local Synced Folder."
            },
            {
              "id": "mod_10_c2",
              "icon": "history",
              "title": "Automatic previous_hashes Lineage Rollover",
              "desc": "Absorbs historical SHA-256 hashes from your Sandbox and remote manifest so existing {Citizens} are notified immediately when v1.1+ ships."
            },
            {
              "id": "mod_10_c3",
              "icon": "find_replace",
              "title": "In-Place Lineage File Replacement",
              "desc": "Dropping an updated .zip automatically locates the older file by its previous_hashes lineage and replaces it in-place without leaving duplicate {mods}."
            },
            {
              "id": "mod_10_c4",
              "icon": "lock",
              "title": "100% Local API Token Isolation",
              "desc": "Personal Access Tokens stay strictly on your local machine and are never transmitted to Sanctuary servers or bundled into exported .zip archives."
            }
          ]
        },
        {
          "id": "mod_11",
          "icon": "schema",
          "overline": "MODULE 11 OF 12",
          "badge": "11. Schema & Lexicon",
          "title": "Universal Master Schema & Code-Switch",
          "footerMeta": "7 ENGINE PRESETS • 21 {GLOSSARY} TOKENS • ICON OVERRIDES",
          "desc": "Schema Forge & Lexicon Studio for engineering cross-platform game schemas (Windows, macOS & Linux / SteamOS) and hot-swapping all 1,700+ OS localization strings, dynamic glossary tokens, and Material icons.",
          "tip": "Click the book icon (Schema Codex / Lexicon Codex) in the studio header at any time for an interactive field-by-field reference.",
          "subCards": [
            {
              "id": "mod_11_c1",
              "icon": "terminal",
              "title": "Schema Forge (Routes & Config Watcher)",
              "desc": "Map Windows (.exe), macOS (.app), and Linux / SteamOS (Proton compatdata) paths, custom secondary install_routes (.dll, .asi, .lua), and config_extensions for live in-game config syncing."
            },
            {
              "id": "mod_11_c2",
              "icon": "category",
              "title": "Game-Agnostic {Mod} Categories & Exception Rules",
              "desc": "Define custom per-game {mod} categories and regex/keyword exception log diagnostic matchers directly inside the Master Schema JSON."
            },
            {
              "id": "mod_11_c3",
              "icon": "translate",
              "title": "21 Dynamic {Glossary} Tokens & Smart Grammar",
              "desc": "Change {Mod}, {Vault}, or {Blueprint} once in Tab 1 to interpolate across 1,700+ strings with automatic casing and indefinite article ('a'/'an') grammar."
            },
            {
              "id": "mod_11_c4",
              "icon": "apps",
              "title": "Guided Searchable Icon Override Builder",
              "desc": "Select any target OS icon from a searchable dropdown and pick a replacement Material Symbol with live Default → New glyph previews."
            }
          ]
        },
        {
          "id": "mod_12",
          "icon": "handshake",
          "overline": "MODULE 12 OF 12",
          "badge": "12. Spoke & Covenants",
          "title": "Wayfinder Spoke Control, Covenants & Supporter Bridge",
          "footerMeta": "PARTNERS AGREEMENT • CUT THE CORD • 0%-CUT DONATIONS",
          "desc": "Full community database sovereignty for Partner Spokes, transparent legal covenants, non-custodial 0%-cut community donations, and the $5 = +30 Days Dev Build pipeline.",
          "tip": "All Directives, Legal Covenants, Schemas, and Lexicons use local codebase files for offline backup while syncing live updates from the Hub database.",
          "subCards": [
            {
              "id": "mod_12_c1",
              "icon": "gavel",
              "title": "Partners Agreement & Compliance Protocol",
              "desc": "Accessible anytime in Wayfinder Spoke Maintenance and required before submitting a Partner Spoke application on the Landing Page."
            },
            {
              "id": "mod_12_c2",
              "icon": "link_off",
              "title": "Unilateral 'Cut the Cord' Severance",
              "desc": "Complete the phrase-locked Cut the Cord safeguard in Wayfinder Operations to revoke all Spoke Gateway Tokens and purge your sealed Vault credential from the Hub while keeping 100% of your community's 52-table Supabase database."
            },
            {
              "id": "mod_12_c3",
              "icon": "volunteer_activism",
              "title": "0%-Cut Non-Custodial Community Donations",
              "desc": "Bind your community's own Stripe, Ko-fi, or OpenCollective checkout link in Spoke Control—Sanctuary OS takes 0% platform cut."
            },
            {
              "id": "mod_12_c4",
              "icon": "system_update_alt",
              "title": "Dev Builds & Cross-Platform Auto-Updater",
              "desc": "Supporters ($5 = +30 Days) and Partner team members receive automated Windows (.msi/.exe), macOS (.dmg/.app.tar.gz), and Linux / SteamOS (.AppImage/.deb) Dev Build updates."
            }
          ]
        }
      ]
    },
    {
      "id": "roles",
      "icon": "admin_panel_settings",
      "label": "6 TIERS",
      "value": "Role Tiers",
      "cards": [
        {
          "id": "role_citizen",
          "icon": "person",
          "overline": "Tier 1 • Base + Open Workshop",
          "badge": "{Citizen}",
          "title": "{Citizen}",
          "footerMeta": "Tier 1 • Base + Open Workshop",
          "desc": "All 9 {Citizen} Modules ({Vault}, Nexus, {Blueprints}, Conflict Radar, Homestead Lab, Workbench, {Backups}) + Inherited Open {Mason} Workshop (Sandbox, {Mason} IDE, 3-Tile {Mod} Studio, Theme Forge, Notepad, Export Release static manifest packaging) + Scout Queue submissions & unrestricted OS Bug Reports.",
          "status": "citizen",
          "subCards": [
            {
              "id": "role_cit_s1",
              "icon": "inventory_2",
              "title": "9 Core {Citizen} Sectors & Symlink Airgap",
              "desc": "Full offline and online access to Command Center, Your {Vault}, The Nexus, {Blueprints}, Comm-Link, Conflict Radar, Homestead {Lab}, {Citizen}'s Workbench, and {Backups}."
            },
            {
              "id": "role_cit_s2",
              "icon": "handyman",
              "title": "Inherited Open {Mason} Workshop & Static Edge Push",
              "desc": "Build {mods} in Dev Sandbox, package .sanctuary.manifest.json / catalog.json releases, and 1-click Auto-Push to GitHub, Gist, GitLab/Codeberg, Neocities, or WebDAV."
            },
            {
              "id": "role_cit_s3",
              "icon": "travel_explore",
              "title": "Scout Queue Discovery Submissions",
              "desc": "Scan local Tier-0 {mods}, complete local {Lab} verification proof, and submit verified SHA-256 metadata to the crowd-sourced Scout Queue."
            },
            {
              "id": "role_cit_s4",
              "icon": "support_agent",
              "title": "Tier-0 {Blueprint} Support & OS Bug Reports",
              "desc": "Submit Community {Mod} Support when your active {Blueprint} holds only verified Tier-0 {mods} (no {Vault} file deletion), or file an OS Bug Report directly to Keepers with zero {mod} telemetry."
            }
          ]
        },
        {
          "id": "role_mason",
          "icon": "construction",
          "overline": "Tier 2 • Verified Creator",
          "badge": "FIDO2 PASSKEY",
          "title": "Verified {Mason}",
          "footerMeta": "Tier 2 • Verified Creator",
          "desc": "Inherits all {Citizen} & Open Workshop tools + FIDO2 Passkey {Vault} gate, Direct Nexus {Mod} Publishing, Verified {Mason} Queue Fast-Lane (bypasses Scout threshold), Public {Mason} Profile Showcase, {Mason} Comm-Link Broadcasts, and 0%-Cut Supporter Bridge.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_mas_s1",
              "icon": "rocket_launch",
              "title": "Verified Fast-Lane & Direct Nexus Publishing",
              "desc": "Bypass crowd Scout vote thresholds to submit verified Tier-0 {mods}, Lexicons, Chameleons, and Workbench Templates straight to Architect triage."
            },
            {
              "id": "role_mas_s2",
              "icon": "storefront",
              "title": "Public {Mason} Profile & Suite Showcases",
              "desc": "Curate your creator banner, featured {mod} suites, Highlander Exclusive Slots, dependency trees, and multi-range version rules on your public profile."
            },
            {
              "id": "role_mas_s3",
              "icon": "campaign",
              "title": "Creator Comm-Link {Dispatches} & Changelogs",
              "desc": "Broadcast Markdown release notes, polling updates, and update alerts directly to subscribed {Citizens} on Comm-Link."
            },
            {
              "id": "role_mas_s4",
              "icon": "volunteer_activism",
              "title": "0%-Cut Supporter Bridge & Static Manifests",
              "desc": "Connect Patreon, Ko-fi, or custom supporter links with 0% Sanctuary cut, and publish Tier 1–4 {mods} responsibly via decentralized Static Edge manifests."
            }
          ]
        },
        {
          "id": "role_architect",
          "icon": "architecture",
          "overline": "Tier 3 • Spoke Moderator",
          "badge": "FIDO2 PASSKEY",
          "title": "Architect",
          "footerMeta": "Tier 3 • Spoke Moderator",
          "desc": "Unlocks Architect Console (strictly isolated to Compliance Tier 0 Stable records): Registry curation, Verified {Mason} & Scout Queue triage, Conflict Matrix, Known Exception Rules, Template Oversight, and Claimable {Citizen} Support Desk tickets.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_arc_s1",
              "icon": "fact_check",
              "title": "Tier-0 Global Registry & 3-Tile Studio Curation",
              "desc": "Maintain verified Tier-0 Nexus records, configure Parent/Child suite trees, Highlander Exclusive Slots, and multi-range game compatibility."
            },
            {
              "id": "role_arc_s2",
              "icon": "dynamic_feed",
              "title": "Verified {Mason} & Scout Queue Triage",
              "desc": "Review unknown/unverified community submissions in Dedicated Queues, run Check Hash verification, and escalate Tier 1–4 flags cleanly to Oversight."
            },
            {
              "id": "role_arc_s3",
              "icon": "warning_amber",
              "title": "Conflict Matrix & Known Exception Rules",
              "desc": "Author Severity 1–4 conflict directives, review Workbench Templates, and publish database-driven exception diagnosis rules linked to Homestead {Lab} verdicts."
            },
            {
              "id": "role_arc_s4",
              "icon": "support_agent",
              "title": "Claimable {Citizen} Support Desk & Escalation",
              "desc": "Claim and resolve Tier-0 {Citizen} support tickets with PII-scrubbed crash logs and Active {Blueprint} snapshots, escalating sensitive reports to Oversight."
            }
          ]
        },
        {
          "id": "role_oversight",
          "icon": "admin_panel_settings",
          "overline": "Tier 4 • Spoke Security Admin",
          "badge": "FIDO2 PASSKEY",
          "title": "Oversight",
          "footerMeta": "Tier 4 • Spoke Security Admin",
          "desc": "Unlocks Oversight Command: Tier 1–4 & Pending Flag Confirmation, Spoke Heuristic Signatures, Tier 5 Malware blacklisting, DEFCON 1 override, Game/DLC patch registration, Mass Batch Updater, {Mason} Linker, and Spoke Identity Matrix (up to Architect).",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_ovr_s1",
              "icon": "security",
              "title": "Tier 1–4 Compliance & Pending Flag Review",
              "desc": "Exclusive reviewer for escalated Tier 1–4 records and Pending community flags—auto-hidden publicly until confirmed or cleared."
            },
            {
              "id": "role_ovr_s2",
              "icon": "gpp_bad",
              "title": "Spoke Heuristics, Tier 5 Blacklists & DEFCON 1",
              "desc": "Author game-specific antivirus signatures, blacklist Tier 5 Malware SHA-256 hashes, and engage DEFCON 1 pre-patch shields."
            },
            {
              "id": "role_ovr_s3",
              "icon": "published_with_changes",
              "title": "Game/DLC Patches, Mass Triage & {Mason} Linker",
              "desc": "Register upstream engine versions and DLC catalogs, run multi-range compatibility mass updates, and claim-link creator registries."
            },
            {
              "id": "role_ovr_s4",
              "icon": "admin_panel_settings",
              "title": "Spoke Identity Governance & Audit Logs",
              "desc": "Promote/demote roles up to Architect, handle escalated security tickets, and inspect read/export-only Spoke audit trails."
            }
          ]
        },
        {
          "id": "role_wayfinder",
          "icon": "explore",
          "overline": "Tier 5 • Spoke Sovereign",
          "badge": "FIDO2 PASSKEY",
          "title": "Wayfinder",
          "footerMeta": "Tier 5 • Spoke Sovereign",
          "desc": "Unlocks Wayfinder Operations: Full Spoke Identity Matrix (up to Wayfinder), secret-free SANCTUARY-UPLINK:// bundle export & 1-click Gateway Token rotation, unilateral Cut the Cord severance, Master Schema & Lexicon Studios, 0%-Cut Donations, and The Dispatch.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_way_s1",
              "icon": "hub",
              "title": "Spoke Sovereignty, Covenants & Cut the Cord",
              "desc": "Rotate Spoke Gateway Tokens in 1 click, export secret-free SANCTUARY-UPLINK:// bundles, inspect Partner Covenants, or trigger irreversible high-friction severance from the Core Hub."
            },
            {
              "id": "role_way_s2",
              "icon": "schema",
              "title": "Master Schema Studio & Fork Branding",
              "desc": "Configure paths, binary headers, install routes, default Chameleon themes, Title Area headers (Standalone mode), and Spoke Lexicon packs."
            },
            {
              "id": "role_way_s3",
              "icon": "manage_accounts",
              "title": "Full Identity Matrix & Tier 1–4 Authority",
              "desc": "Appoint Oversight admins and peer Wayfinders, confirm or dismiss compliance flags, and run in-hub Mass Update compatibility sweeps."
            },
            {
              "id": "role_way_s4",
              "icon": "volunteer_activism",
              "title": "0%-Cut Donations, Cost Ledgers & The Dispatch",
              "desc": "Publish transparent monthly infrastructure cost ledgers, collect 100% Wayfinder-owned donations, and broadcast top-banner polls."
            },
            {
              "id": "role_way_s5",
              "icon": "support",
              "title": "Wayfinder Audit Trails & Keepers Uplink",
              "desc": "Audit every Spoke moderation action chronologically and communicate directly with Core Keepers via Wayfinder Support."
            }
          ]
        },
        {
          "id": "role_keeper",
          "icon": "memory",
          "overline": "Tier 6 • Core OS Hub",
          "badge": "FIDO2 PASSKEY",
          "title": "Keeper",
          "footerMeta": "Tier 6 • Core OS Hub",
          "desc": "Unlocks Keepers Core (accessible on Landing Page & all workspaces): Turnkey Spoke Onboarding, Core Heuristics, Threat Manifests, Master Game Schemas, Global Lexicons/Chameleons, Bilateral Directives Sync, OS Bug Reports, and Global Audit Logs.",
          "status": "passkey",
          "subCards": [
            {
              "id": "role_kpr_s1",
              "icon": "dns",
              "title": "Partner Spoke Onboarding & Dev Cloaking",
              "desc": "Review Partner Spoke Applications, validate schema readiness, toggle Keepers-Only dev workspaces, and oversee Federation uptime."
            },
            {
              "id": "role_kpr_s2",
              "icon": "verified_user",
              "title": "Core Heuristics & Threat Manifests",
              "desc": "Maintain global malware regex signatures (keeper_heuristic_signatures) and triage Zero-PII Threat Manifest submissions from quarantined files."
            },
            {
              "id": "role_kpr_s3",
              "icon": "sync",
              "title": "Bilateral Directives, Schemas & Lexicons",
              "desc": "Author and sync System Directives, Legal Covenants, Default Schemas, Core Aesthetics, and Global Lexicon baselines without app rebuilds."
            },
            {
              "id": "role_kpr_s4",
              "icon": "bug_report",
              "title": "OS Bug Reports (`keeper_tickets`) & Releases",
              "desc": "Triage cross-platform OS bug reports (100% free of Spoke mod data/locks), publish Foundry News, and inspect immutable Global Audit Logs."
            }
          ]
        }
      ]
    }
  ],
  "_bodySig": 300999705
}
-->

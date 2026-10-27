# Sanctuary OS — Version 0.5.8-Dev.5 Update
## *"Universal Multi-Game Schema Engine, Chameleon Theme Forge & True Glass, 1-Click Static Edge Publishing, Native macOS Support & Full-Stack Speed Overhaul"*

**Release Date:** October 27, 2026 | **Version:** 0.5.8-5 (Dev Channel)

Welcome to **Sanctuary OS 0.5.8-5**! This release transforms Sanctuary OS into a **100% Game-Agnostic Mod & Operations Platform** capable of managing any game engine (from *The Sims 4* and *Grand Theft Auto V* to *Skyrim*, *Cyberpunk 2077*, *WWE 2K*, *Baldur's Gate 3*, and *Stardew Valley*), introduces **Native macOS Support (`.dmg` + `.app`)**, overhauls the **Chameleon Theme Engine** with **True Glass OS Desktop Passthrough** and **Wallpaper-Aware Auto-Harmonize**, adds a **6-Provider 1-Click Static Edge Auto-Push Engine** for independent creators, and cuts thousands of lines of legacy code while upgrading the entire stack to **$O(1)$ indexed lookups and SQLite WAL concurrency**. Here is everything new in plain English.

---

## ⚡ TL;DR — The 60-Second Summary

* **Universal Multi-Game Master Schema Engine (8 Built-In Engines):** Sanctuary OS is no longer hardcoded to a single game structure. Load 1-click architecture presets for **The Sims 4**, **GTA V**, **WWE 2K**, **Skyrim / Creation Engine**, **Cyberpunk 2077**, **Baldur's Gate 3**, **Stardew Valley**, or **Universal Custom Games**—complete with vanilla-safe shared `mods_dir` link tracking so games that deploy into `Data/` or the game root never touch vanilla files.
* **Chameleon Theme Engine, True Glass Desktop Passthrough & Zero-Flash Boot:** All 9 built-in themes have been remastered for 3D Liquid Glass contrast across Dark and Light modes. Enable **OS Desktop Passthrough** (`True Glass`) to let your real desktop wallpaper shine through the app, use **Auto-Harmonize / Auto-Tune Glass** to calibrate optics automatically from any wallpaper, and launch with zero white/black window flash.
* **6-Provider 1-Click Static Edge Auto-Push & Zero-Popup Mod Updates:** Creators can now push `manifest.json` or multi-mod `catalog.json` updates directly from the Sandbox to **GitHub**, **GitHub Gist**, **GitLab / Codeberg / Gitea**, **Neocities**, **WebDAV**, or **Local Synced Folders** with automatic version hash rollover—and players can drag-and-drop Edge-enabled archives with zero confirmation popups.
* **Anti-Duplicate Config Watcher (`mc_settings.cfg` Fix) & Copy vs. Move Imports:** Fixed a bug where mod config files (`mc_settings.cfg`) duplicated at the Vault root and reappeared after deletion, and added a **Copy Original vs. Move Original** drag-and-drop preference in System Preferences.
* **Native macOS Support & Full-Stack Anti-Freeze Overhaul:** Added full macOS `.app` bundle detection, macOS `~/Documents` & `/Applications` paths, Apple TCC permissions, and automated Universal `.dmg` builds—while eliminating **all 363 Rust compiler warnings**, removing **35+ unused frontend modules (~7,700+ lines)**, enabling **SQLite WAL**, and converting $O(N^2)$ Vault/Radar loops into instantaneous **$O(1)$ indexed lookups**.

---

## 🎮 For Players (Citizens)

### 1. Chameleon Theme Engine, True Glass Passthrough & 3D Liquid Glass Polish
* **9 Remastered Built-In Themes & True Glass Desktop Passthrough:** Upgraded all 9 core themes (**Architect**, **Radiant**, **Plumbob Crystal**, **Plumbob Nocturne**, **Aurora**, **Bunker**, **Miami Vice**, **Dracula**, and **True Glass**) with balanced Light/Dark surface borders, tinted quartz icon wells, and 3D meniscus refraction. Activating **True Glass** (or toggling **OS Desktop Passthrough** in Theme Forge) clears the window background so your real OS desktop wallpaper refracts directly through Sanctuary's 3D Liquid Glass cards and drawers.
* **Wallpaper-Aware Auto-Harmonize & Locked Status Spectrums:** Click **Auto-Harmonize** or **Auto-Tune Glass** in the Theme Forge to sample your active wallpaper's luminance, contrast, and dominant colors and automatically tune all 8 Liquid Glass sliders. Status colors (`Success`, `Warning`, `Danger`) are now locked to 16 curated Greens, Ambers, and Reds so alerts always stay unmistakable, and **Text Caps Case** lets you switch typography between `ALL CAPS`, `Title Case`, and `lowercase`.
* **Zero-Flash App Launch & Flush SidePanels:** A synchronous pre-paint wallpaper loader and native window reveal gate eliminate the brief white/black flash on startup. Right-anchored `SidePanel` drawers now sit 100% flush against the right edge of the window with theme-controlled left corners, while the Title Bar, System Status Dock, and Mobile Bottom Navigation use full 3D WebGL2 Liquid Glass optics.
* **3D Liquid Glass Mod Card Alerts & Bento Alert Drawers:** Mod card confirmation overlays (**Yeet Cascade!**, **Missing DLC**, **Flavor Swap**) and `Command Center` / `Blueprints` / `Notifications` drawers now use 2-column Bento card grids, sculpted `.glass-surface` badges, and custom portal `<HoverTooltip />` hovertips everywhere (with zero native browser tooltips).

### 2. Instant Startup, Anti-Freeze Performance & Smarter File Management
* **0ms Cached Boot Hydration & Parallel Radar Sweeps:** Command Center and the System Status Dock now remember your last-known mod alerts, conflict counts, and network updates the instant the app opens while running Vault, Sandbox, DLC, and update sweeps in parallel in the background.
* **Fixed Duplicate Config Files (`mc_settings.cfg`) Resurrecting in the Vault:** Our upgraded Dynamic Config Watcher now ignores deployed symlinks in your live `Mods` folder, routes newly generated `.cfg`/`.ini`/`.json` settings files directly into their matching mod subfolder (e.g., `Vault/Mods/MC Command Center/mc_settings.cfg`) instead of duplicating them at the Vault root, preserves your newest settings when cleaning up root duplicates, and automatically re-links live symlinks if a duplicate is deleted.
* **Drag-and-Drop Copy vs. Move Preference & External Malware Shredding:** Choose between **Copy Original (Keep Source File)** and **Move Original (Auto-Clean Source)** in **System Preferences → Preferences**. If a dropped archive is quarantined for malware, **Secure Shred** now remembers the original external file path in volatile RAM and offers to zero-fill shred the source file in your Downloads folder as well.
* **CSP-Proof SidePanel Browser & Dynamic Post Translation:** The built-in SidePanel Browser now themes strict websites (including Google) without flashing, features a recessed rounded viewport mask and custom Liquid Glass scrollbar, and fixes clickable **Bookmarks** and **Recent History** cards. Meanwhile, Dispatches and Release Notes now include a 1-click **Translate** toggle powered by our Dynamic Content Translation Engine.

---

## 🌍 Universal Multi-Game Architecture & Native macOS Support

### 1. Built for Any Game Engine
Sanctuary OS's **Master Schema Engine** now adapts its deployment, load-order, DLC, version-detection, and backup pipelines to any game architecture:
* **8 Ready-to-Use Engine Presets:** Switch or initialize schemas with 1-click presets for **The Sims 4** (`.package` / `.ts4script` / `.world`), **Grand Theft Auto V** (`.rpf` / `.asi` / `ScriptHookV`), **WWE 2K Series** (`.cak` / `.pac` / `{index:02}_` baked prefixes), **Skyrim / Creation Engine** (`.esp` / `.esm` / `.bsa` / `plugins.txt` `*{file}`), **Cyberpunk 2077** (`.archive` / REDmod / CET), **Baldur's Gate 3** (`.pak`), **Stardew Valley** (SMAPI folder manifests), and **Universal Custom Games**.
* **Vanilla-Safe Shared `mods_dir` Tracking:** For games where mods deploy directly into a folder containing vanilla game files (such as Skyrim's `Data/` folder or GTA V / WWE 2K's root directory), Sanctuary OS tracks every deployed link in `.sanctuary_deployed_links.json` and only removes its own deployed links during profile switches—leaving vanilla game files 100% untouched.
* **Subfolder Structure Preservation & Smart Manifest Guards:** Games with deep archive hierarchies (`archive/pc/mod`, `Data/meshes`, SMAPI mod folders) preserve their internal folder trees on import, and native mod `manifest.json` files (Stardew SMAPI, Cyberpunk REDmod) are never mistaken for Sanctuary Edge manifests.

### 2. Native macOS Support (`.dmg` & `.app`)
* **macOS `.app` Bundle & Path Support:** Added native macOS `.app` bundle execution (`Contents/MacOS/` binary resolution and `open -a` launch arguments), `Contents/Info.plist` version extraction (`CFBundleShortVersionString`), `~/` home directory expansion, Finder `open -R` integration, and complete macOS auto-discovery paths in `sims4.json` (`/Applications/The Sims 4.app`, `~/Applications/The Sims 4.app`, Origin, and Steam).
* **macOS Permissions & Automated Universal Builds:** Added `Info.plist` (`Documents`, `Downloads`, and `Desktop` TCC permission prompts), Hardened Runtime `entitlements.plist` for WebKit JIT, and a GitHub Actions workflow (`.github/workflows/build-desktop.yml`) that compiles Universal macOS (`.dmg` + `.app` for Apple Silicon & Intel) alongside Windows (`.exe` + `.msi`) installers.

---

## 🛠️ For Mod Creators, Scouts, Wayfinders & Keepers

### 1. Redesigned Master Schema Visual Studio & Frosted Key Validator
* **Streamlined 4-Tab Schema Visual Studio:** Manage every multi-game schema setting across **Identity & Paths (`Binaries`)**, **Extensions & Routes (`Extensions`)**, **Load Order & Tiers (`Tiers`)**, and **Logs & Time Capsule (`Log Rules`)**—featuring full-height file path pills, themed 3D `<GlassNumberInput />` steppers, container-responsive Split View grids, and single-row `<CustomDropdown>` **Exception Log Matchers** (`Prefix + Extension` vs. `Exact Filename`).
* **Floating Theme-Engine Liquid Glass Key Validator & Syntax Alert Card:** The IDE Key Validator now validates Master Schemas against the **Keepers Core Default Schema** and Lexicons against **`en-default.json`** inside a centered, floating **Theme-Engine Frosted Liquid Glass Alert Card** (`portal-glass-fix sa-dropdown-popover`) with clear titles, `VAULT_CHIP_CLASS` metadata badges, descriptive subtitles, and 1-click **Add Missing** / **Purge Keys** actions—plus generous bottom scroll padding so bottom sections are never covered in Single or Split View.

### 2. 6-Provider 1-Click Static Edge Auto-Push & Lineage Rollover
* **1-Click Client-Side Auto-Push (6 Providers):** Independent and Tier 1–4 creators can now push `manifest.json` updates or merge releases into a single multi-mod `catalog.json` directly from the Mason Sandbox to **GitHub Repos / Cloudflare Pages**, **GitHub Gist** (with automatic first-time Gist creation), **GitLab / Codeberg / Gitea**, **Neocities**, **Custom HTTP `PUT` / WebDAV**, or **Local Synced Folders**—100% client-side so your tokens never touch Sanctuary servers.
* **Automatic Lineage Hash Rollover & Interactive Guide:** Exporting a new release in the Mason Sandbox automatically moves your previous release hashes into `previous_hashes` so players' existing files are upgraded in-place on drop. Need help setting up $0 static hosting? Click the new **Static Polling & Lineage Guide** button in the Sandbox toolbar for a step-by-step walkthrough and 1-click copyable templates.

### 3. Tier 1–4 Compliance Isolation, Scout Consensus Matrix & Cross-Spoke Notifications
* **Strict Tier 1–4 Cloud Isolation & Local Dossier Priority:** Tier 1–4 and unverified mods are strictly isolated from cloud telemetry, Nexus queries, Cloud Blueprints, and Support ticket attachments while still supporting decentralized Static Edge update polling. User-edited **Local Dossiers** now hold #1 priority and are never overwritten by remote metadata, and local Blueprint `.json` exports bundle complete mod metadata for offline sharing.
* **Scout Queue Consensus Matrix:** The **Architect Scout Queue** now groups submissions by DNA hash and displays a **Most Likely True Metadata (Consensus Comparison)** matrix that tallies matching community submissions per field and auto-populates the top consensus values.
* **Cross-Workspace Notifications & Web Blueprint Portal:** Receive Global Alerts and notifications across multiple game workspaces (`NotificationsTab`), and organize cloud/local load orders on desktop or mobile web via the redesigned **Web Blueprint & Staging Portal** (`StagingPayloadEditor`).

---

## 🧹 Under-the-Hood Codebase Purge & SQLite WAL Speed Overhaul

* **Zero Compiler Warnings & ~7,700+ Lines of Dead Code Removed:** Eliminated all **363 Rust compiler warnings** down to **0 warnings**, removed **35 unreachable frontend files** and **27+ legacy components**, pruned 8 unused npm packages, and enabled strict `"noUnusedLocals": true` in TypeScript (**0 errors**).
* **SQLite WAL Mode, Async Background I/O & $O(1)$ Lookups:** Enabled SQLite `PRAGMA journal_mode = WAL` with cached prepared statements, moved all heavy disk/archive/hash commands onto background worker threads (`spawn_blocking`) so the UI never freezes during large imports, eliminated WebGL2 `getComputedStyle` layout thrashing during 60–144Hz render loops, debounced `localStorage` persistence on keystrokes, and replaced $O(N^2)$ Vault/Radar/Conflict loops with $O(1)$ pre-indexed maps.

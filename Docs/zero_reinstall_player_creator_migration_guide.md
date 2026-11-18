# Sanctuary OS: Zero-Reinstall Player & Creator Migration Guide

Switching mod managers has historically meant wiping your game folder, losing months of curated load-order rules, and re-downloading hundreds of gigabytes of archives—exemplified by Nexus Mods retiring the *Nexus Mods App* in January 2026 with zero automated migration path.

**Sanctuary OS** eliminates migration friction completely through **Zero-Copy Exodus** (1-click external mod manager hardlink import), **The Rosetta Protocol** (third-party modlist translation), **The Quartermaster** (FOMOD/BAIN guided installer), and the **Open Mason Workshop**.

---

## Quick Migration Path Reference Matrix

| Source Platform / Tool | What Sanctuary OS Imports Automatically | Disk Duplication | Clean Uninstall / Disarm Behavior |
| :--- | :--- | :--- | :--- |
| **Mod Organizer 2 (MO2)** | `mods/<Mod>/` folders, `meta.ini` (IDs, versions, URLs), `modlist.txt`, `plugins.txt`, `loadorder.txt` via **Zero-Copy Exodus** | **0 Extra Bytes** (OS Hardlink Vaulting) | Leaves vanilla game folder clean; converts MO2 profiles directly into hot-swappable Blueprints |
| **Vortex (Nexus Mods)** | Staging folders, `vortex.deployment.json` / `.vortex_deployment`, directional load rules & `collection.json` via **Zero-Copy Exodus** | **0 Extra Bytes** (OS Hardlink Vaulting) | Surgically unlinks Vortex deployment state without deleting shared root engine binaries |
| **Sims 4 Mod Manager (S4MM)** | Existing `Mods/` packages, `.ts4script` twins, subfolders & CurseForge/creator metadata | **0 Extra Bytes** (Airgap Evacuation) | Evacuates live `Mods/` into an airgapped Vault, groups suites, and compiles clean `Resource.cfg` tiers |
| **BG3 Mod Manager (BG3MM)** | `.pak` archives in `%LOCALAPPDATA%` + `modsettings.lsx` active load order profiles | **0 Extra Bytes** (OS Hardlink Vaulting) | Replaces brittle manual XML edits with declarative Master Schema manifest compilation |
| **Wabbajack / CurseForge / `.mrpack`** | `.wabbajack`, `collection.json`, CurseForge `manifest.json` & Modrinth `modrinth.index.json` | **0 Re-Downloads** for owned SHA-256 files | Binds owned local hashes instantly; queues only missing files in Guided Side Browser (`1 of N`) |

---

## Part A: Player ("Citizen") Zero-Reinstall Migration Workflow

### Step 1: Initialize Cartographer & Clear Cloud-Sync Traps
1. **Install & Map Coordinates:** Launch `SanctuaryOS.exe` (Windows), the universal `.dmg` (macOS, with automatic `com.apple.quarantine` handling), or the portable `.AppImage` / `.deb` (Linux & SteamOS). Use **Cloud Auto-Detect** in **The Cartographer** to map your **Game Bin Folder** (verified offline via Rust `pelite` PE headers or macOS `Info.plist`), **Active Mods Folder**, and isolated **Vault Folder** (across any SSD/NVMe drive with Windows Developer Mode or POSIX symlinks).
2. **Verify Cloud-Sync Safety:** Let **Cloud-Sync Folder Sentinel** inspect your `Documents` and user-data directories against OneDrive, iCloud Drive, Dropbox, Google Drive, and 5+ other sync clients so cloud "Files On-Demand" dehydration never breaks symlinks or locks save files.

### Step 2: Import Existing Manager Setups With Zero-Copy Exodus (Zero Duplication)
1. **1-Click External Manager Import (`Blueprints -> Migrate External Manager`):** Point **Zero-Copy Exodus** at your existing **MO2**, **Vortex** (`vortex.deployment.json`), **BG3MM**, or **S4MM** directories.
2. **Zero-Byte Vaulting & Suite Grouping:** Sanctuary computes SHA-256 fingerprints, runs **Bytecode Hound** heuristic scans, links files into `<Vault>/Mods/` and `<Vault>/Backups/Mods/` via OS hardlinks (`fs::hard_link`, consuming **0 extra bytes** on same-volume imports), safely disarms legacy deployment links, coalesces multi-file suites into single Parent Cards, and converts your old profiles into **Blueprints**.

### Step 3: Translate Third-Party Packs (Rosetta Protocol & Quartermaster)
1. **Instant Local DNA Binding (Rosetta Protocol):** Drop any Nexus `collection.json`, `.wabbajack`, CurseForge `manifest.json`, or Modrinth `.mrpack` archive onto Sanctuary OS or import in **Blueprints**. **The Rosetta Protocol** compiles external manifests into native Sanctuary **Blueprints**, binds owned Vault SHA-256 hashes immediately, and walks multi-option archives interactively with **The Quartermaster** (`fomod/ModuleConfig.xml` / BAIN wizard).
2. **Browser Autoloader Stepper (`1 of N`):** Missing files queue into the **Integrated Side Browser**, opening each creator's official page in sequence with target version chips, intercepting the `.zip`/`.7z`/`.rar` download in memory for Bytecode Hound scanning, hashing it into your Vault, and auto-advancing to `2 of N`—with zero speed caps or Premium API fees.

### Step 4: Seal Your Baseline, Protect Saves & Sync Across Rigs
1. **Save Doctor & Time Capsule Baselines:** Open **Time Capsule** to seal a near-instant 0 MB Parallel CoW snapshot of your **World State** and **Engine Core**, while **Save Doctor** automatically pairs `{Vault}/.sanctuary_save_doctor/<ws>.sanctuary-save-manifest.json` with your active save state and warns before launch if switching Blueprints removes required mods.
2. **Beam to Steam Deck or Secondary PC:** Export an offline Blueprint `.json` (preserving custom `modMeta` titles and URLs), share a 6-character `SNCXXX` uplink code, or stage an AES-256-GCM encrypted queue from the Mobile PWA / Desktop to your Steam Deck via **Beam to Rig**.

---

## Part B: Mod Creator ("Mason") Zero-Lock-In Publishing Workflow

Every Citizen account inherits the local **Open Mason Workshop** out of the box—no gatekeeping required to build, test, or package releases—plus **Creator Airlock** when running external authoring tools inside a save-airgapped Homestead session with automatic post-exit save restoration.

### Step 1: Stage Multi-File Suites & Visual Config UIs
1. **Configure Your Mod Dossier:** Drop your binaries, scripts, add-on modules, and `.json`/`.ini`/`.cfg` files into **Dev Sandbox**. Group core frameworks, required script twins, and optional Highlander flavor modules inside the **3-Tile Mod Studio**, and set game version ranges, DLC requirements, and Severity 3–4 conflict rules.
2. **Build Visual Sliders in Workbench:** Open any config file in **Live-Wire Workbench (Author Mode)** to map raw keys into safe visual sliders, toggles, and category pills that Citizens can tune at 60 FPS without syntax errors.

### Step 2: Validate Stability in Groundhog Sandbox
1. **Run Airgapped Ignition Proof:** Launch your staged mod inside **Groundhog Sandbox**. Sanctuary strips unrelated loadout symlinks (**100% Nuke Injection**), mounts a disposable **Homestead Save Airgap**, and monitors engine stability and exception logs via **Crash Autopsy**.
2. **Unlock Network Publishing:** Passing a clean, crash-free live sandbox run and in-game save automatically verifies your build for public submission (with **Verified Mason** FIDO2 Passkey accounts routing straight into the fast-lane queue).

### Step 3: Distribute Updates via $0 Static Edge Direct Push
1. **Bind One Endpoint (`manifest.json` or `catalog.json`):** Host a single-mod `.sanctuary.manifest.json` or a portfolio-wide `catalog.json` for free—and push updates in 1 click from Sanctuary's Rust backend via **Edge Direct Push** to **GitHub Repo / Cloudflare Pages**, **GitHub Gist**, **GitLab / Codeberg**, **Neocities**, **Personal WebDAV**, or a **Local Synced Folder** (while keeping Personal Access Tokens 100% local on your PC).
2. **Automatic Lineage Rollover & 0% Tax:** Whenever you export v1.1+, Sanctuary automatically rolls old v1.0 SHA-256 hashes into `previous_hashes` and bundles `.sanctuary.override.json` into your `.zip`—so whether players download your archive from Patreon, itch.io, Nexus, CurseForge, or your own site, **Edge Pulse** notifies them of updates, replaces outdated files in place, and routes **100% of supporter donations (0% Sanctuary cut)** directly to you.
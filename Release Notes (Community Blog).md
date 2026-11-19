# State of the Sanctuary — Version 0.6.0-Dev.15
### Universal Modding Parity, Zero-Copy Exodus, The Quartermaster, Rosetta Protocol, Save Doctor, DAG Load Order & Liquid Glass V6
**Release Date:** November 18, 2026 | **Version:** 0.6.0-Dev.15 | **Platform:** Windows, macOS, Linux & SteamOS

## Welcome to Sanctuary OS 0.6.0-Dev.15!

**Version 0.6.0-Dev.15** completes Sanctuary OS's transformation from a single-game manager into a **100% game-agnostic, multi-engine modding operating system** across **Desktop (Windows, macOS, Linux & SteamOS), Web, and Mobile PWA**. Whether you're switching over from Mod Organizer 2, Vortex, CurseForge, BG3MM, r2modman, or Sims 4 Mod Manager—or running a full community hub—here is everything new in plain English.

### TL;DR — The 60-Second Summary

- **Drop Almost Any Archive or Modlist Anywhere:** Native `.7z` and `.rar` support joins `.zip`, alongside **The Quartermaster** (`fomod/ModuleConfig.xml` & BAIN installer drawers), **The Rosetta Protocol** (`.mrpack`, CurseForge `manifest.json`, Nexus `collection.json`, and `.wabbajack` Blueprint translation), and drag-and-drop import for Blueprints, Themes, Languages, Workbench configs, and Game Schemas.
- **Zero-Copy Exodus (`0 Extra Bytes`) & Deep Links (`nxm://`, `curseforge://`, `ror2mm://`):** Move existing setups from **Mod Organizer 2**, **Vortex**, **BG3MM**, or **r2modman / Gale** into Sanctuary's airgapped Vault using OS hardlinks with zero duplicate disk space—plus direct manager-link interception and encrypted local API key storage for Nexus, CurseForge, and Modrinth.
- **Built for 27 Game Presets & Any Custom Engine:** Ready out of the box with **27 engine architecture presets** (including *The Sims 4*, *Skyrim SE*, *Fallout 4*, *Starfield*, *Baldur's Gate 3*, *Cyberpunk 2077*, *GTA V*, *Minecraft*, *Stardew Valley*, *Risk of Rain 2*, *Elden Ring*, *Witcher 3*, and more), database-driven categories (`public.taxonomy`), and streamlined **Cartographer** folder setup + **Cloud-Sync Folder Sentinel** alerts for OneDrive/iCloud/Dropbox traps.
- **Smarter Load Order, Save Doctor & Creator Airlock:** True **Master/Dependency DAG** sorting (supporting Starfield `0x0800` Medium Masters, LOOT `userlist.yaml`/JSON import, and per-file `.sanctuary_hidden.json` hiding), **Save Doctor** pre-launch save warnings, **Creator Airlock** automatic save protection when launching external modding tools, and **3D Liquid Glass** visuals + **True Glass** mode.
- **ByteHound v3 Security, Opt-In Privacy & Compliance Tiers 0–6:** Pre-ingest streaming scans for `> 8 MiB` files and `.7z`/`.rar`/Zlib/Zstd payloads, sealed local creator tokens (`DPAPI`/`AES-256-GCM`), strictly local-only opt-in defaults for Homestead lab certificates & Mobile Companion sync, and updated **Compliance Tiers 0–6** (`0` Clean, `1` Spoke-Routed Legal/DMCA, `2–5` Explicit..Taboo, `6` Malware).

---

### Switch Without Reinstalling: Zero-Copy Exodus, Quartermaster & Rosetta

- **Zero-Copy Exodus (`Blueprints -> Migrate External Manager`):** Point Sanctuary OS at an existing **Mod Organizer 2**, **Vortex**, **BG3 Mod Manager**, or **r2modman / Gale** install. Sanctuary hashes your files, scans them through **ByteHound v3**, hardlinks them into your isolated Vault with **0 extra bytes used**, safely clears legacy deployment links, and rebuilds your profiles as playable **Blueprints**.
- **The Quartermaster (Interactive FOMOD & BAIN Installer):** Multi-option archives containing `fomod/ModuleConfig.xml` or BAIN subpackages automatically open a clean step-by-step installer drawer with pre-checked dependency options—and remember your choices (`.sanctuary_fomod_choices.json`) whenever you install an upgrade.
- **The Rosetta Protocol & Guided Browser Autoloader (`1 of N`):** Drop a Nexus `collection.json`, CurseForge `manifest.json`, Modrinth `.mrpack`, or `.wabbajack` file to convert it into a Blueprint immediately, match every archive you already own via SHA-256, and step through missing downloads in the **Side Browser** with automatic interception.
- **Manager Deep Links & Local Encrypted BYO API Key Broker:** Opt in under **Settings -> Browser & Controls** to handle `nxm://`, `curseforge://`, and `ror2mm://` links directly in Sanctuary OS, with optional personal Nexus, CurseForge, and Modrinth tokens encrypted locally in hardware/OS custody (`DPAPI` / `AES-256-GCM`).

---

### Deeper Protection Against Broken Saves, Cloud Sync Traps & Malware

- **Save Doctor & Creator Airlock:** **Save Doctor** checks `.sanctuary-save-manifest.json` and save-file headers before game launch to warn you if switching Blueprints removed mods your save expects. Need to run an external modding tool (`xEdit`, `Sims 4 Studio`, `Bodyslide`, etc.)? **Creator Airlock** temporarily protects your real saves in an external airgap vault and restores them automatically when the tool exits.
- **Cloud-Sync Folder Sentinel:** **The Cartographer** detects Windows OneDrive, macOS iCloud Drive, Dropbox, and Google Drive reparse folders early so cloud "Files On-Demand" dehydration never snaps symlinks or locks save files mid-launch.
- **ByteHound v3 (`Tier 6 Malware`) & Rescue:** Pure-Rust scanning now inspects `.zip`, `.7z`, `.rar`, `overrides/` trees, Zlib/Zstd chunks, `.pyc` bytecode, and `> 8 MiB` assets via streaming sliding-window buffers—while safely rescuing any legacy heuristic false positives without touching confirmed threat hashes.
- **Topological DAG Load Order, Binary TOCs & Lossless Workbench:** Reads real `.esm`/`.esp`/`.esl` headers and binary containers (`BSA`/`BA2`, `LSPK`, Unreal `.utoc`/`.pak`, `RDAR`, `RPF7`), lets you hide noisy conflict files per mod without deleting anything, imports LOOT rules, and edits `.toml`, `.yaml`, and `.jsonc` configs in **Live-Wire Workbench** without stripping comments.

---

### 3D Liquid Glass, Cross-Platform Apps, Privacy & Community Sovereignty

- **Tri-Platform Native Apps & Instant Performance:** Native builds run smoothly across **Windows (`.exe`/`.msi`), macOS Universal (`.dmg`), Linux / SteamOS (`.AppImage`/`.deb` + Deck Overdrive gamepad pointer & Proton `compatdata` discovery)**, **Web**, and **Mobile PWA**—with asynchronous startup hydration, instant **Settings** & **Blueprints**, and smooth 60 FPS WebGL2 glass rendering.
- **Strict Opt-In Privacy & Zero-Identity Telemetry:** Homestead Lab verification certificates stay strictly on your device unless you choose to submit them, **Pocket Radar** mobile cloud sync defaults to **OFF (opt-in)**, reporter IDs are stripped across content flags and anonymous tickets, and **Nuclear Override** can now be toggled bidirectionally offline inside **System Preferences**.
- **Runtime Spoke Switching (`SANCTUARY-UPLINK://`) & Community Governance:** Connect to any Partner Game Spoke at runtime from **Login** or **Settings -> Core** without rebuilding, review updated legal & safety covenants (**GNU GPLv3 EULA**, **Privacy Policy** GDPR erasure/retention schedules, **Compliance Tiers 0–6** with Spoke-routed DMCA & Keepers Core compliance logs, and **7 Governance & Security SOPs**) directly in the app's **System Directives** and **Legal** drawers, and enjoy **0%-cut** direct support to creators and communities.

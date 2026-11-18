# Why Switch to Sanctuary OS?

## Your System. Your Sovereignty. Modding Without Gatekeepers.

For over a decade, PC modding has forced players and creators into an unfair compromise: tolerate **throttled ~3 MB/s corporate download portals**, **bloated ad-supported background launchers**, **anti-cheat-flagging Windows DLL hooks**, or **half a dozen disconnected single-game tools** just to keep a load order alive after a Tuesday game patch.

**Sanctuary OS** replaces that entire patchwork with a unified, local-first **Rust + 60 FPS WebGL2 Liquid Glass** modding operating system built natively for **Windows, macOS, Linux, SteamOS (Steam Deck), Web, and Mobile PWA**—100% offline-capable, zero-PII, and free of platform taxes or download speed caps.

---

## Feature-by-Feature Player Comparison

| Capability | Legacy Portals & Managers (Vortex, CurseForge, MO2, S4MM) | Sanctuary OS |
| :--- | :--- | :--- |
| **Disk & Drive Flexibility** | Vortex hardlinks fail across drives (`C:` to `D:`); S4MM & CurseForge overwrite live `Mods` folders directly | **Symlink Airgap 2.5:** Projects zero-byte OS symlinks across any SSD/NVMe partition while keeping game folders 100% clean |
| **Anti-Cheat & OS Compatibility** | MO2 injects `usvfs_x64.dll` into RAM (triggering EAC/BattlEye bans & Wine breaks); Nexus canceled its Linux app in Jan 2026 | **Zero Memory Hooks & Tri-Platform Parity:** 100% anti-cheat safe across Windows (`.exe`), macOS (`.dmg`), and Linux / SteamOS (`.AppImage` + Proton) |
| **Multi-Game Support** | Separate managers per game (MO2 for *Skyrim*, S4MM for *Sims 4*, BG3MM for *BG3*, Modrinth for *Minecraft*) | **Universal Schema Forge:** 7 built-in engine architecture presets + custom schemas manage your entire library in one app |
| **Modpack & Collection Installs** | Nexus throttles free users & caps Collection auto-downloads; Wabbajack practically requires paid Nexus Premium | **Zero-Paywall Blueprints:** Matches existing local Vault SHA-256 hashes instantly and steps through missing mods via **Guided Side Browser (`1 of N`)** |
| **Conflict Resolution** | Cryptic cyclic rule lockups in Vortex; manual 50/50 folder halving in S4MM and CurseForge | **Conflict Radar 2.0:** Severity 1–5 matrix with Casual 1-click **"Set Winner"** and Advanced DFS **Break Loop** compiler |
| **Patch-Day Survival** | Forced updates silently break script mods and corrupt saves overnight | **Cartographer PE Ripper + 0 MB Delta Backups:** Reads exact `.exe`/`.app` versions offline and snapshots World Saves & Engine Binaries via hardlinks in seconds |
| **Testing Unverified Mods** | Testing on live profiles bakes broken scripts into saves permanently | **Groundhog Sandbox:** 100% Nuke symlink isolation + disposable Save Airgap + live Crash Autopsy log decoding |
| **Editing Mod Settings** | Hunting through 400-line `.ini`, `.cfg`, or `.json` files in Notepad | **Live-Wire Workbench:** Safe 60 FPS visual sliders/toggles synced two-way with a built-in Monaco Raw Code Diff IDE |
| **Malware Defense** | Cloud scans miss Discord ZIPs, Patreon downloads, and obfuscated `.ts4script` / `.dll` trojans | **Bytecode Hound:** Local pre-ingest Rust scanner decompressing Zlib/Zstd DBPF streams and `.pyc`/Base64 bytecode before Vault entry |

---

## Seven Reasons Players & Creators Are Moving to Sanctuary OS

### 1. True Cross-Drive Symlink Airgap & Suite Cohesion
Never touch your live game folder again. Every archive you drop into Sanctuary OS is hashed with SHA-256, scanned, and stored inside your isolated **Vault** alongside a zero-byte hardlink version archive (`Backups/Mods/`). Multi-file mod suites coalesce automatically into a single **Parent Suite Card** so core frameworks and `.ts4script` / `.dll` twins never get separated or buried past engine subfolder limits.

### 2. One Operating Layer for Every Game Engine
Stop relearning a new UI every time you switch games. Sanctuary's declarative **Master Schema Engine** adapts automatically to dynamic multi-tier override folders (`Resource.cfg`), ordered load manifests (`plugins.txt`, `loadorder.txt`, `modsettings.lsx`), numeric prefixes (`001_`), virtual archive containers, and custom secondary binary routes (`.dll`, `.asi`, `.lua`).

### 3. Safe Mod Testing & Instant Hardlink Time Capsules
Want to test a brand-new overhaul or pit two conflicting mods 1v1? **Groundhog Sandbox** temporarily strips your main loadout symlinks, swaps in a disposable **Homestead Save Airgap**, monitors live exception logs via **Crash Autopsy**, and restores your real saves untouched the moment you close the game. Meanwhile, **Backups** snapshots gigabytes of saves and game binaries in seconds with **0 MB delta hardlink deduplication**.

### 4. Visual Config Editing Without Syntax Crashes
Forget broken commas in JSON files. **Live-Wire Workbench** pairs community-crafted visual UI templates (sliders, toggles, min/max steppers) with a real-time Monaco Raw Code Diff editor—and automatically syncs changes made inside the game's own settings menu right back into your Vault via the **Dynamic Config Watcher**.

### 5. First-Class Steam Deck, Linux, macOS & Mobile Companion Support
Sanctuary OS runs natively everywhere you play—complete with **Deck Overdrive** gamepad navigation on SteamOS, automatic Proton `compatdata` prefix mapping, macOS `com.apple.quarantine` stripping, and encrypted **Beam to Rig** staging so you can queue Blueprints from your phone's PWA and deploy them in one click at your PC.

### 6. Zero Bandwidth Taxes & 100% Creator Traffic
Because Sanctuary OS hosts **zero binary mod files**, we never throttle your download speeds, lock features behind monthly subscriptions, or inject adware overlays. Clicking download inside the **Integrated Side Browser** visits the creator's official page directly—preserving 100% of creator attribution, ad/supporter visibility, and 0%-cut Patreon/Ko-fi donations.

### 7. Offline-First & Zero-PII Privacy by Design
Sanctuary OS works 100% offline out of the box with no mandatory account. If you choose to connect to community Spokes, your identity is shielded by **600k-iteration PBKDF2 Blinded Email Aliases**, **FIDO2 Hardware/Biometric Passkeys**, and **AES-256-GCM Zero-PII** queue encryption—while your local Vault remains completely immune to external cloud censorship.
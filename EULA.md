# Sanctuary OS — End-User License Agreement (EULA)

**Document Version:** V6.2 (v0.6.0-Dev.14)  
**Effective Date:** November 14, 2026  

---

## 1. Grant of License & Scope
This End-User License Agreement ("EULA") is a legal agreement between you ("Citizen", "Mason", "Wayfinder", or "User") and **Sanctuary Foundry** governing your installation and use of the **Sanctuary OS** desktop software (Windows `SanctuaryOS.exe`/NSIS/`.msi`, macOS `.dmg`/`.app` Universal Binary, and Linux `.AppImage`/`.deb` including SteamOS / Steam Deck) and web application.

1. **Personal & Community License:** Sanctuary Foundry grants you a revocable, non-exclusive, worldwide license to install and run Sanctuary OS on your personal Windows, macOS, Linux, and SteamOS devices to manage local game mod archives, configure settings, and connect to Sanctuary OS Hub and Community Spoke databases.
2. **Standalone Codebase Forking Rights:** Subject to the repository's open-source/source-available terms and the [Sanctuary OS Forking & Architecture Guide](./Sanctuary%20OS%20Forking%20%26%20Architecture%20Guide.md), independent game communities may deploy standalone forks configured against their own `schema.sql` Supabase instance via `src/supabase.ts`.

---

## 2. Local-First Technical Middleware, Developer Tools & Platform Classification
Sanctuary OS operates strictly as **local-first technical software, developer tooling, heuristic security middleware, and a creator-to-subscriber release dispatch client**:
1. **No Proprietary Game or Mod Hosting (Not a Storefront or File Host):** Sanctuary OS does **not** host, redistribute, or bundle proprietary game binaries or third-party mod files, and does not sell digital products (**0% platform cut**). All mod archives are acquired by the Citizen directly from the creator's own distribution channels or Static Edge endpoints (`.sanctuary.manifest.json` / `catalog.json` / `.sanctuary.override.json`).
2. **Symlink Airgap 2.5 & File System Operations:** Sanctuary OS organizes your local files inside an isolated Vault directory and projects active mods into your game's live directory using operating-system symbolic links (`symlink_file` / `symlink_dir`), NTFS junction-safe Vault Lockdowns, secondary `install_routes`, automatic untracked mod rescue, single-active binary deduplication, and root config deduplication (`deduplicate_vault_root_configs`).
3. **Parallel CoW Time Capsule, Homestead Save Airgap & Version History Backups:** While Sanctuary OS provides parallel Copy-on-Write (`CoW`) snapshots (`World State`, `Engine Core`, and `Backups/Mods/` Version History archives), additive save restoration, and externalized Homestead Lab Save-Verify-and-Rewind mirrors (`SanctuarySaveVault` & `Backups/.lab_save_vault`), you remain solely responsible for maintaining independent backups of your save files and system data.
4. **Platform Classification, Minor Safety & Non-Overridable Verified Mason Hardgates:** Sanctuary OS is **not** a social media network, storefront, or open media host. **Comm-Link** operates strictly as a **Verified Creator Changelog & Release Dispatch Channel** (with zero general Citizen user profiles, zero peer-to-peer DMs, and zero open Citizen social posting), and all cloud **Nexus Asset uploads (minus non-media JSON hash Blueprints)** are strictly locked to `18+` FIDO2-authenticated **Verified Masons** and Spoke Staff—Core OS hardgates that **Partner Spokes cannot override**. Citizens (`13+` or jurisdictional digital-consent minimum) interact strictly within public **Compliance Tier 0** feeds and local-first Vault tooling.

---

## 3. Cross-Platform Permissions (Windows, macOS & Linux / SteamOS)
1. **Windows Operations:** On Windows, creating symbolic links across drives uses Windows Developer Mode or Sanctuary's optional 1-click UAC unprivileged symlink privilege unlock (`SeCreateSymbolicLinkPrivilege`), and game updates are verified via signed `tauri-plugin-updater` packages.
2. **macOS Operations (Touch ID, Full Disk Access & Gatekeeper):** On macOS, accessing `~/Documents` and `~/Library/Application Support` requires macOS Transparency, Consent, and Control (TCC) authorization, WebAuthn supports native **Touch ID**, and Sanctuary OS may clear `com.apple.quarantine` extended attributes (`xattr`) on verified Vault symlinks and game binaries when authorized by you.
3. **Linux & SteamOS / Steam Deck Operations:** On Linux distributions and SteamOS (Steam Deck Gaming Mode and Desktop Mode), Sanctuary OS runs natively via `.AppImage` or `.deb` packages with AMD RDNA2 hardware acceleration, Gamescope XWayland binding, and passive `/dev/input` + `/sys/class/hidraw` controller input decoding. When managing Windows game binaries running under Valve Proton or Wine (`compatdata/<AppID>/pfx/drive_c/users/steamuser/` across internal storage or SD card mounts under `/run/media/`), Sanctuary OS maps symlink projection and config watching directly into the corresponding Proton prefix.

---

## 4. Dual-Tier Malware Quarantine, Secure Shred & The Nuclear Override
1. **Automated Threat Quarantine (Tier 5):** Sanctuary OS includes a **Universal Multi-Format Rust Heuristic Scanner** and SHA-256 / Blake3 DNA verification engine. If a file matches a confirmed **Compliance Tier 5 (Malware)** signature or critical heuristic rule, Sanctuary OS will automatically halt game execution, isolate the file in `Quarantine/`, and lock the interface behind the **Quarantine Lockdown SidePanel** until neutralized.
2. **Citizen-Signed Secure Shred:** Executing the **Secure Shred** action permanently overwrites and deletes the quarantined file from your storage drive. This action is irreversible.
3. **The Nuclear Override & Hardware Ban Consequence:** Advanced users who intentionally unlock and trigger the **Nuclear Override** in System Preferences to bypass Tier 5 Malware security lockouts acknowledge and agree that:
   - You assume 100% of the risk of executing unverified or potentially malicious code on your machine; and
   - Triggering the Nuclear Override immediately records a domain-salted one-way SHA-256 cryptographic hardware hash in the Core OS `hardware_bans` ledger, permanently revoking cloud network access across the Sanctuary Hub and connected Spokes while leaving your offline local software functional.

---

## 5. Non-Affiliation with Game Publishers
Sanctuary OS is an independent, engine-agnostic middleware platform. Sanctuary Foundry is **not** affiliated with, endorsed by, or sponsored by Electronic Arts Inc., CD PROJEKT RED, Rockstar Games, Bethesda Softworks, Larian Studios, ConcernedApe, or any other game publisher referenced in community Master Schemas (`sanctuary_schemas`). All trademarks belong to their respective owners.

---

## 6. Disclaimer of Warranties & Limitation of Liability
SANCTUARY OS IS PROVIDED **"AS IS"** AND **"AS AVAILABLE"** WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

IN NO EVENT SHALL SANCTUARY FOUNDRY, ITS KEEPERS, OR COMMUNITY SPOKE OPERATORS (WAYFINDERS, OVERSIGHT, ARCHITECTS) BE LIABLE FOR ANY CORRUPTED SAVE FILES, DATA LOSS, SYSTEM INSTABILITY, THIRD-PARTY MOD PAYLOADS, OR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE SOFTWARE.
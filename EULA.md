# Sanctuary OS — End-User License Agreement (EULA)

**Document Version:** V5.8 (v0.5.8-Dev.5)  
**Effective Date:** October 28, 2026  

---

## 1. Grant of License & Scope
This End-User License Agreement ("EULA") is a legal agreement between you ("Citizen", "Mason", "Wayfinder", or "User") and **Sanctuary Foundry** governing your installation and use of the **Sanctuary OS** desktop software (Windows `.exe`/NSIS & macOS `.dmg`/`.app` Universal Binary) and web application.

1. **Personal & Community License:** Sanctuary Foundry grants you a revocable, non-exclusive, worldwide license to install and run Sanctuary OS on your personal Windows and macOS devices to manage local game mod archives, configure settings, and connect to Sanctuary OS Hub and Community Spoke databases.
2. **Standalone Codebase Forking Rights:** Subject to the repository's open-source/source-available terms and the [Sanctuary OS Forking & Architecture Guide](./Sanctuary%20OS%20Forking%20%26%20Architecture%20Guide.md), independent game communities may deploy standalone forks configured against their own `schema.sql` Supabase instance via `src/supabase.ts`.

---

## 2. Local-First Middleware, Symlink Airgap & No Asset Hosting
Sanctuary OS operates strictly as a **local-first, metadata-only middleware layer**:
1. **No Proprietary Game or Mod Hosting:** Sanctuary OS does **not** host, redistribute, or bundle proprietary game binaries or third-party `.package`, `.ts4script`, `.pak`, `.rpf`, `.dll`, or `.asi` mod files. All mod archives are acquired by the Citizen directly from the creator's own distribution channels or Static Edge endpoints (`manifest.json` / `override.json`).
2. **Symlink Airgap 2.5 & File System Operations:** Sanctuary OS organizes your local files inside an isolated Vault directory and projects active mods into your game's live directory using operating-system symbolic links (`symlink_file` / `symlink_dir`), secondary `install_routes`, and automatic root config deduplication (`deduplicate_vault_root_configs`).
3. **Time Capsule Backups:** While Sanctuary OS provides incremental hardlink snapshots (`World State` & `Engine Core`) and differential rollback utilities, you remain solely responsible for maintaining independent backups of your save files and system data.

---

## 3. Cross-Platform Permissions (Windows & macOS)
1. **Windows Operations:** On Windows, creating symbolic links and inspecting PE headers (`pelite`) may require standard user Developer Mode or elevated filesystem permissions.
2. **macOS Operations (Full Disk Access & Gatekeeper):** On macOS, accessing `~/Documents` and `~/Library/Application Support` requires macOS Transparency, Consent, and Control (TCC) authorization. When enabled by you, Sanctuary OS may clear `com.apple.quarantine` extended attributes (`xattr`) on verified Vault symlinks and game binaries so your game engine can load authorized local scripts.

---

## 4. Dual-Tier Malware Quarantine, Secure Shred & The Nuclear Override
1. **Automated Threat Quarantine (Tier 5):** Sanctuary OS includes a **Universal Multi-Format Rust Heuristic Scanner** and SHA-256 / Blake3 DNA verification engine. If a file matches a confirmed **Compliance Tier 5 (Malware)** signature or critical heuristic rule, Sanctuary OS will automatically halt game execution, isolate the file in `Quarantine/`, and lock the interface behind the **Quarantine Lockdown SidePanel** until neutralized.
2. **Citizen-Signed Secure Shred:** Executing the **Secure Shred** action permanently overwrites and deletes the quarantined file from your storage drive. This action is irreversible.
3. **The Nuclear Override & Hardware Ban Consequence:** Advanced users who intentionally unlock and trigger the **Nuclear Override** in System Preferences to bypass Tier 5 Malware security lockouts acknowledge and agree that:
   - You assume 100% of the risk of executing unverified or potentially malicious code on your machine; and
   - Triggering the Nuclear Override immediately records a one-way cryptographic hardware hash in the Core OS `hardware_bans` ledger, permanently revoking cloud network access across the Sanctuary Hub and connected Spokes while leaving your offline local software functional.

---

## 5. Non-Affiliation with Game Publishers
Sanctuary OS is an independent, engine-agnostic middleware platform. Sanctuary Foundry is **not** affiliated with, endorsed by, or sponsored by Electronic Arts Inc. (*Maxis / The Sims 4*), CD PROJEKT RED (*Cyberpunk 2077*), Rockstar Games (*Grand Theft Auto V*), Bethesda Softworks (*The Elder Scrolls V: Skyrim*), Larian Studios (*Baldur's Gate 3*), ConcernedApe (*Stardew Valley*), or any other game publisher referenced in community Master Schemas (`sanctuary_schemas`). All trademarks belong to their respective owners.

---

## 6. Disclaimer of Warranties & Limitation of Liability
SANCTUARY OS IS PROVIDED **"AS IS"** AND **"AS AVAILABLE"** WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

IN NO EVENT SHALL SANCTUARY FOUNDRY, ITS KEEPERS, OR COMMUNITY SPOKE OPERATORS (WAYFINDERS, OVERSIGHT, ARCHITECTS) BE LIABLE FOR ANY CORRUPTED SAVE FILES, DATA LOSS, SYSTEM INSTABILITY, THIRD-PARTY MOD PAYLOADS, OR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE SOFTWARE.


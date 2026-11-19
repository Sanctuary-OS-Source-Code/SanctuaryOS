# Sanctuary OS — End-User License Agreement (EULA) & Software Notice

**Document Version:** V6.4 (v0.6.0-Dev.15)  
**Effective Date:** November 18, 2026  

---

## 1. Open-Source Grant of License (GNU GPLv3) & Network Scope
This End-User License Agreement & Software Notice ("EULA") accompanies the **Sanctuary OS** software (`SanctuaryOS.exe`/NSIS/`.msi` on Windows, `.dmg`/`.app` Universal Binary on macOS, `.AppImage`/`.deb` on Linux and SteamOS / Steam Deck, and the Web / Mobile PWA interface) published by **Sanctuary Foundry**.

1. **Irrevocable GNU GPLv3 Software License:** The **Sanctuary OS** client, Rust backend, and repository source code are licensed to you under the **GNU General Public License v3.0 ([`LICENSE`](./LICENSE) — "GNU GPLv3")**. Consistent with Sections 2, 4, and 5 of GNU GPLv3, you hold a **perpetual, worldwide, royalty-free, non-exclusive, and irrevocable** right to run, study, modify, and redistribute Sanctuary OS source code and compiled binaries on Windows, macOS, Linux, and SteamOS—including deploying standalone community forks configured via `sanctuary.fork.json` / `npm run fork:configure` or `sanctuary-os/src/supabase.ts`—provided all distributed derivative works honor GNU GPLv3 copyleft obligations. Nothing in this EULA imposes any "further restriction" prohibited by Section 7 or Section 10 of GNU GPLv3.
2. **Distinction Between Software Code, Trademarks & Hosted Network Access:** While your license to copy, modify, and execute the GPLv3 software locally or on independent forks is irrevocable, **(a)** use of the **Sanctuary OS** name, Foundry insignia, and official brand marks in modified redistributions is governed by our [Trademark Policy](./Docs/spoke_schema_migration_and_trademark_policy.md), and **(b)** connectivity to hosted network services operated by Sanctuary Foundry (`Keepers Core`) or independent Community Partner Spokes (`Wayfinders`) is strictly optional and governed by the [Terms of Service](./Terms%20of%20Service.md), [Privacy Policy](./Privacy%20Policy.md), and [Global Compliance Protocol](./Compliance%20Protocol.md).

---

## 2. Local-First Technical Middleware, Developer Tools & Platform Classification
Sanctuary OS operates strictly as **local-first technical software, developer tooling, heuristic security middleware, and a creator-to-subscriber release dispatch client**:
1. **No Proprietary Game or Mod Hosting (Not a Storefront or File Host):** Sanctuary OS does **not** host, redistribute, or bundle proprietary game binaries or third-party mod files, and does not sell digital products (**0% platform cut**). All mod archives are acquired by the Citizen directly from the creator's own distribution channels or Static Edge endpoints (`.sanctuary.manifest.json` / `catalog.json` / `.sanctuary.override.json`).
2. **Symlink Airgap 2.5 & File System Operations:** Sanctuary OS organizes your local files inside an isolated Vault directory and projects active mods into your game's live directory using operating-system symbolic links (`symlink_file` / `symlink_dir`), NTFS junction-safe Vault Lockdowns, secondary `install_routes`, transactional `.sanctuary_deploy_journal.jsonl` / `.sanctuary_routed_links.jsonl` WAL crash recovery, automatic untracked mod rescue, single-active binary deduplication, and root config deduplication (`deduplicate_vault_root_configs`).
3. **Parallel CoW Time Capsule, Homestead Save Airgap, Save Doctor & Creator Airlock:** While Sanctuary OS provides parallel Copy-on-Write (`CoW`) snapshots (`World State`, `Engine Core`, and `Backups/Mods/` Version History archives), additive save restoration, **Save Doctor** pre-launch manifest checks, externalized Homestead Lab Save-Verify-and-Rewind mirrors (`SanctuarySaveVault` & `Backups/.lab_save_vault`), and **Creator Airlock** external tool save isolation, you remain solely responsible for maintaining independent backups of your save files and system data.
4. **Platform Classification, Minor Safety & Non-Overridable Verified Mason Hardgates:** Sanctuary OS is **not** a social media network, storefront, or open media host. **Comm-Link** operates strictly as a **Verified Creator Changelog & Release Dispatch Channel** (with zero general Citizen user profiles, zero peer-to-peer DMs, and zero open Citizen social posting), and all cloud **Nexus Asset uploads (minus non-media JSON hash Blueprints)** are strictly locked to `18+` FIDO2-authenticated **Verified Masons** and Spoke Staff—Core OS hardgates that **Partner Spokes cannot override**. Citizens (`13+` or jurisdictional digital-consent minimum) interact strictly within public **Compliance Tier 0** feeds and local-first Vault tooling.

---

## 3. Cross-Platform Permissions (Windows, macOS & Linux / SteamOS)
1. **Windows Operations:** On Windows, creating symbolic links across drives uses Windows Developer Mode or Sanctuary's optional 1-click UAC unprivileged symlink privilege unlock (`SeCreateSymbolicLinkPrivilege`), and game updates are verified via signed `tauri-plugin-updater` packages.
2. **macOS Operations (Touch ID, Full Disk Access & Gatekeeper):** On macOS, accessing `~/Documents` and `~/Library/Application Support` requires macOS Transparency, Consent, and Control (TCC) authorization, WebAuthn supports native **Touch ID**, and Sanctuary OS may clear `com.apple.quarantine` extended attributes (`xattr`) on verified Vault symlinks and game binaries when authorized by you.
3. **Linux & SteamOS / Steam Deck Operations:** On Linux distributions and SteamOS (Steam Deck Gaming Mode and Desktop Mode), Sanctuary OS runs natively via `.AppImage` or `.deb` packages with AMD RDNA2 hardware acceleration, Gamescope XWayland binding, and passive `/dev/input` + `/sys/class/hidraw` controller input decoding. When managing Windows game binaries running under Valve Proton or Wine (`compatdata/<AppID>/pfx/drive_c/users/steamuser/` across internal storage or SD card mounts under `/run/media/`), Sanctuary OS maps symlink projection and config watching directly into the corresponding Proton prefix.

---

## 4. Dual-Tier Malware Quarantine (Tier 6), Secure Shred & The Nuclear Override
1. **Automated Threat Quarantine (Compliance Tier 6):** Sanctuary OS includes **Bytecode Hound v3**, a **Universal Multi-Format Rust Heuristic Scanner** (`> 8 MiB` streaming inspection, `.zip`/`.7z`/`.rar` extraction, Zlib/Zstd decompression, and PE/ELF/Mach-O/LNK verification) and SHA-256 DNA engine. If a file matches a confirmed **Compliance Tier 6 (Malware)** signature or critical heuristic rule, Sanctuary OS halts game execution, isolates the file in `Quarantine/`, and locks the interface behind the **Quarantine Lockdown SidePanel** until neutralized.
2. **Citizen-Signed Secure Shred:** Executing the **Secure Shred** action performs an irreversible single-pass zero-fill overwrite, disk flush, and unlink of the quarantined file from your storage drive. This action is permanent.
3. **The Bidirectional Nuclear Override & Cloud Network Consequence:** Advanced users who intentionally unlock and toggle the **Nuclear Override** inside System Preferences to bypass local **Tier 6 Malware** lockouts acknowledge and agree that:
   - You assume 100% of the risk of executing unverified or potentially malicious code on your local machine;
   - Activating the Nuclear Override records a domain-salted one-way SHA-256 cryptographic hardware hash in the Core OS `hardware_bans` ledger, immediately severing access to the Official Sanctuary Hub and connected Partner Spokes while leaving your local GPLv3 client 100% functional offline; and
   - Starting in `v0.6.0-Dev.15`, Nuclear Override state toggling inside System Preferences is **bidirectional offline**—you may re-enable local Bytecode Hound protection at any time (and seek network appeal via our [Moderation Appeals & Remediation SOP](./Docs/moderation_appeals_and_remediation_sop.md)).

---

## 5. Non-Affiliation with Game Publishers
Sanctuary OS is an independent, engine-agnostic middleware platform. Sanctuary Foundry is **not** affiliated with, endorsed by, or sponsored by Electronic Arts Inc., CD PROJEKT RED, Rockstar Games, Bethesda Softworks, Larian Studios, ConcernedApe, or any other game publisher referenced in community Master Schemas (`sanctuary_schemas`). All trademarks belong to their respective owners.

---

## 6. Disclaimer of Warranties & Limitation of Liability
Consistent with Sections 15 and 16 of GNU GPLv3, SANCTUARY OS IS PROVIDED **"AS IS"** AND **"AS AVAILABLE"** WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

IN NO EVENT SHALL SANCTUARY FOUNDRY, ITS KEEPERS, CONTRIBUTORS, OR COMMUNITY SPOKE OPERATORS (WAYFINDERS, OVERSIGHT, ARCHITECTS) BE LIABLE FOR ANY CORRUPTED SAVE FILES, DATA LOSS, SYSTEM INSTABILITY, THIRD-PARTY MOD PAYLOADS, OR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE SOFTWARE, UNLESS REQUIRED BY APPLICABLE LAW.

---

## 7. Governing Law, Severability & Contact
* **Governing Law:** To the extent permitted by applicable law and GNU GPLv3, this EULA and disputes arising out of hosted Sanctuary OS services are governed by the laws of the **State of Florida** and applicable **United States federal law** (including `17 U.S.C. § 512`), without conflict-of-law principles and without limiting mandatory local consumer rights or statutory privacy protections in your jurisdiction.
* **Severability:** If any provision of this document is held unenforceable or incompatible with GNU GPLv3 for software source/binary distribution, GNU GPLv3 controls as to the software license and all remaining provisions stay in full effect.
* **Legal & Support Inquiries:** Contact **`legal@sanctuaryos.net`** (security disclosures: **`security@sanctuaryos.net`**, per [`SECURITY.md`](./SECURITY.md); privacy/erasure: **`privacy@sanctuaryos.net`**).

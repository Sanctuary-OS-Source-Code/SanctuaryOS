# Sanctuary OS — Global Compliance Protocol

**Document Version:** V6.4 (v0.6.0-Dev.15)  
**Last Updated:** November 18, 2026  

---

## Table of Contents
1. **PREAMBLE & RIGHT OF MODIFICATION**
2. **PLATFORM CLASSIFICATION, MINOR SAFETY & NON-OVERRIDABLE VERIFIED MASON HARDGATES**
3. **THE FLORIDA COMPLIANCE LAYER (TIERS 0–4, PENDING CONFIRMATION & ARCHITECT ISOLATION)**
4. **MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)**
5. **CROSS-PLATFORM SECURITY PARITY (WINDOWS, MACOS & LINUX / STEAMOS)**
6. **THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER**
7. **NON-CUSTODIAL FINANCIAL COMPLIANCE & 0% PLATFORM CUT**
8. **ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE**

---

## 1. PREAMBLE & RIGHT OF MODIFICATION
This Sanctuary Global Compliance Protocol ("Protocol") outlines the mandatory moderation, safety, and content sanitization standards required by all officially recognized Sanctuary Partners and connected Spoke Databases across the Sanctuary OS multi-game federation.

**Living Document Clause:** Sanctuary Foundry ("Keepers Core") reserves the right to modify, expand, or redefine Compliance Tiers, automated heuristic enforcement mechanisms, and malware definitions at any time to respond to evolving security threats or legal regulations. Updates become effective upon publication or reasonable notice, except emergency malware and security updates (including Core OS Heuristic Signatures), which take effect immediately across all connected workspaces.

---

## 2. PLATFORM CLASSIFICATION, MINOR SAFETY & NON-OVERRIDABLE VERIFIED MASON HARDGATES
Sanctuary OS is designed and operated specifically to fall outside social media, commercial storefront, and file-hosting classifications through strict architectural hardgates that apply identically across Keepers Core and every connected Community Spoke:

### 2.1. Statutory Classification: Technical Software, Developer Tools & Creator Release Channel
* **Local-First Technical Software & Developer Tooling:** Sanctuary OS functions as an offline-capable **Symlink Airgap manager, load-order compiler, Bytecode Hound malware/heuristic scanner, conflict radar, and schema-driven Workbench/Studio IDE** for local software configuration files.
* **Not a Storefront or File Host:** Sanctuary OS hosts **zero third-party mod binaries or copyrighted game executables**, processes **zero first-party payments**, and takes a **0% cut** of external non-custodial creator donations.
* **Not an Open Social Media Network:** Sanctuary OS contains **no general Citizen public profile pages, no peer-to-peer direct messaging (DMs), no open Citizen social posting feeds, and no algorithmic engagement ranking**.

### 2.2. Comm-Link Verified Mason Hardgate (No User Profiles or Open Social Posting)
* **Verified Creator Changelog & Release Dispatch Channel:** **Comm-Link** (`mason_posts`) operates exclusively as a structured **Creator-to-Subscriber release dispatch, changelog, and patch-advisory channel** tied to verified developers (`Verified Masons`). Comments on release dispatches are plain-text feedback subject to moderation controls and mute flags (`is_comm_banned` / `hide_mason_comment`), not general user publishing.
* **Non-Overridable Verified Mason Hardgate:** Top-level Comm-Link dispatch publishing is gated strictly to **Verified Masons** (`masons.is_verified = true`, authenticated with mandatory FIDO2 Passkey step-up) and authorized Spoke Staff at both the Core Gateway (`game-gateway`) and Spoke database RLS level (`owns_verified_mason`). **Partner Spokes (`Wayfinders`) cannot override, relax, or disable this Verified Mason hardgate.**

### 2.3. Nexus Asset Upload Hardgate (Minus Blueprints)
* **Verified Mason Hardgate on Nexus Assets:** All cloud **Nexus Asset uploads** (`nexus_assets` — **Chameleon Themes**, **Sparse Delta Lexicons**, and **Workbench Configuration Templates** — alongside **Collections** and cloud Mod Registry records) are strictly locked to **Verified Masons** (`is_verified_mason_or_staff()` + Core `game-gateway` enforcement) and authorized Spoke Staff. **Partner Spokes (`Wayfinders`) cannot override, bypass, or disable the Verified Mason hardgate.** (Unverified Citizens retain strictly local JSON import/export in their offline Open Workshop.)
* **Narrow Cloud Blueprint Exception:** Citizen-shareable **Cloud Blueprints (`SNCXXX`)** are strictly non-media JSON loadouts consisting exclusively of cryptographic SHA-256 DNA hashes, slot identifiers, and game-version compatibility strings (`zero uploaded binary files, zero executable code, and zero user-uploaded images or media`) and remain automatically scrubbed of any confirmed Tier 1–5 hash by `trg_purge_flagged_hash_from_blueprints`.

### 2.4. Minor Safety, Age Eligibility & Structural Tier-0 Airgap
* **Age Thresholds:** General Citizen accounts require users to be **13 years or older** (or the higher minimum digital-consent age required by local law); all Verified Creator (`Verified Mason`) and moderation/operator clearances (`Architect` through `Keeper`) require **18+ adult majority** plus hardware/biometric FIDO2 Passkey enrollment.
* **Zero-Surveillance Structural Safety:** Without collecting government photo IDs or biometric age scans, Sanctuary OS protects minor users through **(a)** the complete absence of public Citizen profiles, stranger DMs, and open Citizen social feeds, **(b)** non-overridable Verified Mason hardgates on Comm-Link dispatches and cloud Nexus Asset uploads (minus non-media hash Blueprints), and **(c)** mandatory **Compliance Tier 0 (Public Safe)** scrubbing across every public network surface.

---

## 3. THE FLORIDA COMPLIANCE LAYER (TIERS 0–4, PENDING CONFIRMATION & ARCHITECT ISOLATION)
Sanctuary OS operates on the foundational principle of **"User Sovereignty vs. Network Integrity."** While Citizens maintain total authority over their local airgapped Vaults and Personal Rig transfers, the Global Nexus, Cloud Blueprints, and public-facing endpoints must remain legally compliant and safe for general discovery.

Partners must ensure their internal moderation teams (`Architect`, `Oversight`, and `Wayfinder` clearances) actively categorize all database artifacts according to the 6-level Compliance Matrix (`compliance_tier` `0` through `5`):

### Defined Content & Safety Tiers:
* **Compliance Tier 0 (Standard / Public Safe):**
  * **Definition:** Safe, verified general-audience artifacts (`Stable` / `Unstable`) eligible for full public indexing across The Nexus, Comm-Link, Cloud Blueprints (`SNCXXX`), public Mason Profiles, and Community Mod Support tickets. Consistent with Section 2, cloud publishing of Nexus Assets (`workbench_template`, `lexicon`, `chameleon`), Collections, and Comm-Link dispatches is strictly hard-locked to **Verified Masons** and Spoke Staff (non-overridable by Partner Spokes), while local JSON export/import and non-media JSON Cloud Blueprint sharing remain open to all Citizens.
  * **Strict Tier 0 & Unknown Isolation:** Only **Compliance Tier 0** artifacts appear across The Nexus, Comm-Link, Community Support, and the Tier 3 **Architect Console**. **Unknown / Unverified** hashes appear exclusively in **Scout** and **Mason** triage queues with passing 4-stage Homestead Lab verification (`_lab_cert_proof`). Items flagged with `has_pending_flag = true` or **Compliance Tiers 1–4** are hidden publicly and restricted exclusively to **Oversight** and **Wayfinder** hubs. Architect diagnostic submissions (`enforceArchitectSubmissionCompliance`) accept only known Tier 0 catalog hashes.
  * **`Pending` Compliance Escalation Pipeline:** Whenever an Architect or Citizen flags an artifact or report as Compliance Tiers 1–4, it triggers `has_pending_flag = true` and routes exclusively into **Oversight Command -> Compliance** with `status = 'pending'` (and `status_reason` provenance), hiding it immediately from public surfaces and Tier 3 Architects while protecting active Citizen Cloud Blueprints from premature stripping until confirmed by `Oversight` or `Wayfinder`.
* **Compliance Tiers 1–2 (Explicit / Adult & Illicit Themes):**
  * **Definition:** Any artifact, mod, or asset containing adult/NSFW themes (**Tier 1**) or illicit substances/themes (**Tier 2**).
  * **Local Sovereignty, Personal Rig Sync & Static Edge Polling:** Permitted for local use by Citizens within their isolated Vaults, Zero-PII AES-256-GCM Personal Rig transfers, and decentralized Static Edge Manifests (`.sanctuary.manifest.json` / `catalog.json` / `.sanctuary.override.json`).
  * **Public Scrub & Confirmed Blueprint Auto-Purge:** Automatically scrubbed from The Nexus, Comm-Link, Architect Console, and Community Search Results, remaining visible solely inside **Oversight** and **Wayfinder** queues until reviewed or purged. Once a Tier 1–4 flag is **confirmed** by `Oversight` or `Wayfinder`, the PostgreSQL trigger `trg_purge_flagged_hash_from_blueprints` automatically strips the confirmed hash from shared public Cloud Blueprints.
  * **Non-Destructive Active Blueprint Support Lock & Zero-PII Keeper Tickets:** To keep Community Mod Support logs free of unverified or restricted telemetry without deleting local Vault files, equipping any Tier 1–4 or Unknown artifact inside the active Blueprint engages an **Active Blueprint Support Lock** on Community Mod Support—providing a 1-click non-destructive unequip helper that clears only the active Blueprint slot while leaving Vault files untouched on disk. **Keeper OS Bug Reports** remain unrestricted at all times and collect zero mod hashes or mod telemetry, while Oversight-routed diagnostic logs automatically scrub OS paths, usernames, IPs, MACs, SIDs, emails, and hostnames across Windows, macOS, Linux, and SteamOS/Proton.
* **Compliance Tiers 3–4 (Extreme Violence & Taboo / Prohibited Content):**
  * **Definition:** Severe content involving extreme violence (**Tier 3**) or taboo/prohibited themes (**Tier 4**).
  * **Local Sovereignty:** Permitted strictly within isolated local Vaults.
  * **Public Scrub, Lab Restriction & Support Lock:** Automatically scrubbed from public feeds, Comm-Link, confirmed Cloud Blueprints, and community Homestead Lab telemetry submissions, and routed strictly to **Oversight** and **Wayfinder** hubs. Any confirmed Tier 3–4 artifact present in the active Blueprint triggers the non-destructive **Active Blueprint Support Lock** on Community Mod Support (unlockable via 1-click active-Blueprint unequip without deleting local files), while Keeper OS Bug Reports remain accessible with zero mod telemetry.

---

## 4. MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)
Sanctuary OS employs a **Universal Multi-Format Rust Heuristic Scanner** alongside cryptographic SHA-256 DNA signature verification to protect Citizens across every supported game engine and file container (`.zip`, `.7z`, `.rar`, `.jar`, `.pak`, `.rpf`, `.dll`, `.asi`, `.exe`, `.app`, `.py`, `.pyc`, `.pyo`, and compressed binary chunk streams).

### 4.1. Dual-Tier Heuristic Governance
* **Core Heuristics (`keeper_heuristic_signatures` on Hub DB):** Maintained exclusively by Keepers Core. Enforces baseline cross-game protection against OS-level execution and exfiltration vectors (`os.system`, `subprocess.Popen`, `ctypes.windll`, `discord.com/api/webhooks`, `urllib.request.urlopen`, `base64.b64decode`, marshaled Python bytecode symbol chains, and PE/Mach-O/ELF wide-string payloads). Core Heuristics are compiled using thread-safe `OnceLock` regex sets in Rust, are read-only at the Spoke level, and cannot be disabled by Partner administrators.
* **Spoke Heuristics (`heuristic_signatures` on Spoke DB):** Maintained by the Partner's `Oversight` and `Wayfinder` teams to target game-specific exploits or script payloads unique to their engine architecture. Both Core and Spoke signatures are merged into `.malware_signatures.json` prior to every Radar Sweep and file ingestion.

### 4.2. Compliance Tier 5 (Confirmed Malware & Full-OS Quarantine Lockdown)
* **Definition:** Any artifact containing malicious code, unauthorized executable scripts, credential stealers, webhook exfiltrators, remote-code-execution (RCE) payloads, or destructive routines.
* **Full-OS Quarantine SidePanel Lockdown (`MalwareAlertModal`):** If Sanctuary OS detects a confirmed Tier 5 DNA hash or critical heuristic hit during ingestion or a Radar Sweep, the OS immediately halts game execution, isolates the asset into the airgapped `Quarantine/` sector, locks the entire OS shell (Sidebar and Top-Right Control Capsule), and opens the **Quarantine Lockdown SidePanel**. Back-to-back malware detections are queued asynchronously so the UI never freezes.
* **Transparent Attribution & Citizen-Signed Secure Shred:** The Quarantine Lockdown SidePanel displays the exact **Triggered By** vector (`Known Malware Hash` vs. `Heuristic Hit` pattern) and **Detection Source** (`Spoke Registry • <Spoke Name>` or `Sanctuary Foundry`). Neutralization requires the **Citizen's Signature** to execute an irreversible zero-fill byte-level **Secure Shred** (zero-fill overwrite, flush, and unlink) in Rust. Upon shredding, optional opt-in Zero-PII Threat Manifests (File Name, SHA-256 DNA Hash, and Threat Signature — completely unlinked from user identity) may be routed to `public.malware_reports` for global cluster neutralization.

### 4.3. Partner Obligation for Tier 5
Partners must never host, endorse, or intentionally allow Tier 5 DNA to propagate within their Spoke Database. If a Partner discovers malware within their community, their `Oversight` or `Wayfinder` team must immediately confirm its DNA hash as `compliance_tier = 5` and `status = 'corrupted'` to trigger network-wide neutralization and automatic pruning from all public Cloud Blueprints.

---

## 5. CROSS-PLATFORM SECURITY PARITY (WINDOWS, MACOS & LINUX / STEAMOS)
Sanctuary OS enforces identical airgap, signed-update, path-traversal, and heuristic security guarantees across **Windows (`SanctuaryOS.exe` / NSIS)**, **macOS (`.dmg` / `.app` Universal Binary)**, and **Linux / SteamOS (`.AppImage` / `.deb` & Steam Deck Proton)**:
* **Signed Desktop Updates & Root-Containment Path Guards:** Desktop updates verify cryptographic signatures via `tauri-plugin-updater`, archive extraction uses bounded `.take()` streaming into isolated temporary staging, and all filesystem commands enforce canonical root-containment guards (`utils.rs`) blocking `..` traversal, symlink escapes, protected save/airgap deletion (`is_protected_save_or_airgap_path`), and writes to OS system folders.
* **macOS Touch ID, Gatekeeper & Full Disk Access (TCC):** Supports native Apple Touch ID passkeys, verifies read/write access to `~/Documents` and `~/Library/Application Support` (`check_macos_permissions`), and strips `com.apple.quarantine` extended attributes only on validated Vault projections.
* **Linux & SteamOS / Proton Security Parity:** Enforces the exact same Bytecode Hound Core + Spoke Rust Heuristic scans, SHA-256 DNA verification, and Symlink Airgap isolation across native Linux paths, external SD card mounts (`/run/media/mmcblk0p1` & `/run/media/deck`), and Valve Proton prefixes (`compatdata/<AppID>/pfx/drive_c/`).

---

## 6. THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER
Partners acknowledge the existence of the **Nuclear Override** built into System Preferences (revealed by clicking the System Preferences subtitle 5 times, allowing advanced developers to bypass local security lockouts strictly within an offline local environment).
* **Privacy-First Decoupled Ban Ledger (`hardware_bans`):** Sanctuary OS does **not** persistently track or store Hardware IDs (HWIDs) on standard Citizen profiles. A domain-salted one-way SHA-256 hardware signature hash (`"sanctuary-os-zero-pii-hwid-v1:"`) is computed in Rust and recorded into the Core OS `hardware_bans` ledger **only** at the exact moment a user triggers the Nuclear Override or is banned for Tier 5 malware distribution, with strict guards preventing fallback placeholder strings from ever being written or matched.
* **Cross-Network Enforcement:** Once an account or hardware hash is recorded in the Core OS ban ledger, the `game-gateway` Edge Function propagates the ban status across connected Spoke databases, permanently revoking cloud network privileges while leaving the user's offline local machine untouched.
* **Partner Network Impact:** Partners cannot override global Core OS security bans or grant cloud exemptions to accounts/hardware hashes flagged for Tier 5 malware distribution.

---

## 7. NON-CUSTODIAL FINANCIAL COMPLIANCE & 0% PLATFORM CUT
* **100% Non-Custodial & Wayfinder-Isolated Routing:** All Creator (`Mason`) Supporter links and Partner Community donation checkouts (`Wayfinder Operations -> Spoke Control -> Non-Custodial Community Donations`) route 100% directly to the Mason's or Partner Community's own payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`), enforced by Postgres triggers so Keepers cannot alter Partner Spoke donation fields.
* **Zero Custodial Liability:** Sanctuary Foundry takes a **0% cut**, never touches or custodies community funds, and assumes zero liability for payment disputes, refunds, chargebacks, or tax reporting on Partner or Mason transactions.

---

## 8. ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE
* **Proactive Moderation & Crowd-Sourced Firewall:** Each Partner Spoke is responsible for staffing `Architect` and `Oversight` moderators to triage the **Verified Mason Queue** and the **Scout Queue** (enforcing the schema-defined `min_scout_submissions` threshold).
* **Foundry Intervention:** If a Partner consistently fails to classify Tiers 1 through 5 artifacts, Keepers Core reserves the right to enforce global heuristic blocks or intervene at the gateway level.
* **High-Friction Bilateral Severance ("Cut the Cord"):**
  * **Foundry Termination:** Repeated or intentional failure to enforce this Protocol constitutes a material breach of the [Partners Agreement](./Partners%20Agreement.md) and results in bilateral severance via `sever_spoke_cord`.
  * **Partner Self-Service Severance:** Conversely, any Partner's `Wayfinder` may unilaterally execute **Spoke Sever (Cut the Cord)** from **Wayfinder Operations -> Spoke Control** at any time (`"CUT THE CORD"` phrase verification + armed confirmation). Executing severance writes an immutable audit entry to both databases, deactivates the workspace on the Sanctuary Hub, revokes all active Spoke Gateway Tokens on the Spoke (`revoke_spoke_gateway_tokens`), and permanently purges the Partner's sealed Vault credential from `sanctuary_internal.spoke_credentials` + Supabase Vault while leaving 100% of the Partner's Spoke Database intact under their sole ownership (with cryptographic `SRK1` profile relinking available for returning Citizens).
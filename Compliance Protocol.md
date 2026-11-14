# Sanctuary OS — Global Compliance Protocol

**Document Version:** V6.1 (v0.6.0-Dev.13)  
**Last Updated:** November 14, 2026  

---

## Table of Contents
1. **PREAMBLE & RIGHT OF MODIFICATION**
2. **THE FLORIDA COMPLIANCE LAYER (TIERS 0–4, PENDING CONFIRMATION & ARCHITECT ISOLATION)**
3. **MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)**
4. **CROSS-PLATFORM SECURITY PARITY (WINDOWS, MACOS & LINUX / STEAMOS)**
5. **THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER**
6. **NON-CUSTODIAL FINANCIAL COMPLIANCE & 0% PLATFORM CUT**
7. **ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE**

---

## 1. PREAMBLE & RIGHT OF MODIFICATION
This Sanctuary Global Compliance Protocol ("Protocol") outlines the mandatory moderation, safety, and content sanitization standards required by all officially recognized Sanctuary Partners and connected Spoke Databases across the Sanctuary OS multi-game federation.

**Living Document Clause:** Sanctuary Foundry ("Keepers Core") reserves the right to modify, expand, or redefine Compliance Tiers, automated heuristic enforcement mechanisms, and malware definitions at any time to respond to evolving security threats or legal regulations. Updates become effective upon publication or reasonable notice, except emergency malware and security updates (including Core OS Heuristic Signatures), which take effect immediately across all connected workspaces.

---

## 2. THE FLORIDA COMPLIANCE LAYER (TIERS 0–4, PENDING CONFIRMATION & ARCHITECT ISOLATION)
Sanctuary OS operates on the foundational principle of **"User Sovereignty vs. Network Integrity."** While Citizens maintain total authority over their local airgapped Vaults and Personal Rig transfers, the Global Nexus, Cloud Blueprints, and public-facing endpoints must remain legally compliant and safe for general discovery.

Partners must ensure their internal moderation teams (`Architect`, `Oversight`, and `Wayfinder` clearances) actively categorize all database artifacts according to the 6-level Compliance Matrix (`compliance_tier` `0` through `5`):

### Defined Content & Safety Tiers:
* **Compliance Tier 0 (Standard / Public Safe):**
  * **Definition:** Safe, verified general-audience artifacts (`Stable` / `Unstable`) eligible for full public indexing across The Nexus, Cloud Blueprints (`SNCXXX`), and public Mason Profiles. Cloud publishing of Nexus assets (`workbench_template`, `lexicon`, `chameleon`) is restricted to **Verified Masons** and Spoke Staff, while local JSON export/import and Cloud Blueprint sharing remain open to all Citizens.
  * **Strict Tier 0 Architect Console Isolation & Known-Hash Submission Gate:** The Tier 3 **Architect Console** is strictly isolated to Compliance Tier 0 artifacts, reports, and support tickets, and cannot issue bans or active compliance locks. Architect diagnostic and support submissions are enforced client- and server-side (`enforceArchitectSubmissionCompliance`) to accept only **known Tier 0 catalog hashes**, while unknown Tier 0 hashes enter exclusively through **Scout Queue** or **Mason Queue** uploads backed by a passing 4-stage Homestead Lab certificate (`_lab_cert_proof`).
  * **`Pending` Compliance Escalation Pipeline:** Whenever an Architect or Citizen flags an artifact or report as Compliance Tiers 1–4, it routes exclusively into **Oversight Command -> Compliance** with `status = 'pending'` (and `status_reason` provenance), hiding it immediately from Tier 3 Architects while protecting active Citizen Cloud Blueprints from premature stripping until confirmed by `Oversight` or `Wayfinder`.
* **Compliance Tiers 1–2 (Explicit / Adult & Illicit Themes):**
  * **Definition:** Any artifact, mod, or asset containing adult/NSFW themes (**Tier 1**) or illicit substances/themes (**Tier 2**).
  * **Local Sovereignty, Personal Rig Sync & Static Edge Polling:** Permitted for local use by Citizens within their isolated Vaults, Zero-PII AES-256-GCM Personal Rig transfers, and decentralized Static Edge Manifests (`.sanctuary.manifest.json` / `catalog.json` / `.sanctuary.override.json`).
  * **Public Scrub & Confirmed Blueprint Auto-Purge:** Automatically scrubbed from public Nexus Feeds and community Search Results. Once a Tier 1–4 flag is **confirmed** by `Oversight` or `Wayfinder`, the PostgreSQL trigger `trg_purge_flagged_hash_from_blueprints` automatically strips the confirmed hash from shared public Cloud Blueprints.
  * **Support Access & Zero-PII Log Sanitization:** Citizens using Tier 1–2 artifacts retain access to the Citizen Support Desk; exception logs containing adult-mod signatures ("Dirty Logs") are flagged for Oversight routing and local OS paths, usernames, IP addresses, MAC addresses, SIDs, emails, and hostnames across Windows, macOS, Linux, and SteamOS/Proton are automatically redacted before transmission.
* **Compliance Tiers 3–4 (Extreme Violence & Taboo / Prohibited Content):**
  * **Definition:** Severe content involving extreme violence (**Tier 3**) or taboo/prohibited themes (**Tier 4**).
  * **Local Sovereignty:** Permitted strictly within isolated local Vaults.
  * **Public Scrub, Lab Restriction & Vault Lock:** Automatically scrubbed from public feeds and confirmed Cloud Blueprints, and blocked from community Homestead Lab telemetry submissions. Equipping or storing active confirmed Tier 3–4 artifacts triggers a **Vault Lock**, restricting Citizen Support Desk ticket submissions until the flagged files are removed.

---

## 3. MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)
Sanctuary OS employs a **Universal Multi-Format Rust Heuristic Scanner** alongside cryptographic Blake3 / SHA-256 DNA signature verification to protect Citizens across every supported game engine and file container (`.zip`, `.7z`, `.rar`, `.jar`, `.pak`, `.rpf`, `.dll`, `.asi`, `.exe`, `.app`, `.py`, `.pyc`, `.pyo`, and compressed binary chunk streams).

### 3.1. Dual-Tier Heuristic Governance
* **Core Heuristics (`keeper_heuristic_signatures` on Hub DB):** Maintained exclusively by Keepers Core. Enforces baseline cross-game protection against OS-level execution and exfiltration vectors (`os.system`, `subprocess.Popen`, `ctypes.windll`, `discord.com/api/webhooks`, `urllib.request.urlopen`, `base64.b64decode`, marshaled Python bytecode symbol chains, and PE/Mach-O/ELF wide-string payloads). Core Heuristics are compiled using thread-safe `OnceLock` regex sets in Rust, are read-only at the Spoke level, and cannot be disabled by Partner administrators.
* **Spoke Heuristics (`heuristic_signatures` on Spoke DB):** Maintained by the Partner's `Oversight` and `Wayfinder` teams to target game-specific exploits or script payloads unique to their engine architecture. Both Core and Spoke signatures are merged into `.malware_signatures.json` prior to every Radar Sweep and file ingestion.

### 3.2. Compliance Tier 5 (Confirmed Malware & Full-OS Quarantine Lockdown)
* **Definition:** Any artifact containing malicious code, unauthorized executable scripts, credential stealers, webhook exfiltrators, remote-code-execution (RCE) payloads, or destructive routines.
* **Full-OS Quarantine SidePanel Lockdown (`MalwareAlertModal`):** If Sanctuary OS detects a confirmed Tier 5 DNA hash or critical heuristic hit during ingestion or a Radar Sweep, the OS immediately halts game execution, isolates the asset into the airgapped `Quarantine/` sector, locks the entire OS shell (Sidebar, Top Bar, and Morphing Dock), and opens the **Quarantine Lockdown SidePanel**. Back-to-back malware detections are queued asynchronously so the UI never freezes.
* **Transparent Attribution & Citizen-Signed Secure Shred:** The Quarantine Lockdown SidePanel displays the exact **Triggered By** vector (`Known Malware Hash` vs. `Heuristic Hit` pattern) and **Detection Source** (`Spoke Registry • <Spoke Name>` or `Sanctuary Foundry`). Neutralization requires the **Citizen's Signature** to execute a destructive byte-level **Secure Shred** in Rust. Upon shredding, optional anonymous Quarantine Manifests (File Name, DNA Hash, and Threat Signature) are routed to `quarantine_manifests` for global cluster neutralization.

### 3.3. Partner Obligation for Tier 5
Partners must never host, endorse, or intentionally allow Tier 5 DNA to propagate within their Spoke Database. If a Partner discovers malware within their community, their `Oversight` or `Wayfinder` team must immediately confirm its DNA hash as `compliance_tier = 5` and `status = 'corrupted'` to trigger network-wide neutralization and automatic pruning from all public Cloud Blueprints.

---

## 4. CROSS-PLATFORM SECURITY PARITY (WINDOWS, MACOS & LINUX / STEAMOS)
Sanctuary OS enforces identical airgap, signed-update, path-traversal, and heuristic security guarantees across **Windows (`SanctuaryOS.exe` / NSIS)**, **macOS (`.dmg` / `.app` Universal Binary)**, and **Linux / SteamOS (`.AppImage` / `.deb` & Steam Deck Proton)**:
* **Signed Desktop Updates & Root-Containment Path Guards:** Desktop updates verify cryptographic signatures via `tauri-plugin-updater`, archive extraction uses bounded `.take()` streaming into isolated temporary staging, and all filesystem commands enforce canonical root-containment guards (`utils.rs`) blocking `..` traversal, symlink escapes, protected save/airgap deletion (`is_protected_save_or_airgap_path`), and writes to OS system folders.
* **macOS Touch ID, Gatekeeper & Full Disk Access (TCC):** Supports native Apple Touch ID passkeys, verifies read/write access to `~/Documents` and `~/Library/Application Support` (`check_macos_permissions`), and strips `com.apple.quarantine` extended attributes only on validated Vault projections.
* **Linux & SteamOS / Proton Security Parity:** Enforces the exact same 21 Core + 17 Spoke Rust Heuristic scans, SHA-256 DNA verification, and Symlink Airgap isolation across native Linux paths, external SD card mounts (`/run/media/mmcblk0p1` & `/run/media/deck`), and Valve Proton prefixes (`compatdata/<AppID>/pfx/drive_c/`).

---

## 5. THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER
Partners acknowledge the existence of the **Nuclear Override** built into System Preferences (revealed by clicking the System Preferences subtitle 5 times, allowing advanced developers to bypass local security lockouts strictly within an offline local environment).
* **Privacy-First Decoupled Ban Ledger (`hardware_bans`):** Sanctuary OS does **not** persistently track or store Hardware IDs (HWIDs) on standard Citizen profiles. A domain-salted one-way SHA-256 hardware signature hash (`"sanctuary-os-zero-pii-hwid-v1:"`) is computed in Rust and recorded into the Core OS `hardware_bans` ledger **only** at the exact moment a user triggers the Nuclear Override or is banned for Tier 5 malware distribution, with strict guards preventing fallback placeholder strings from ever being written or matched.
* **Cross-Network Enforcement:** Once an account or hardware hash is recorded in the Core OS ban ledger, the `game-gateway` Edge Function propagates the ban status across connected Spoke databases, permanently revoking cloud network privileges while leaving the user's offline local machine untouched.
* **Partner Network Impact:** Partners cannot override global Core OS security bans or grant cloud exemptions to accounts/hardware hashes flagged for Tier 5 malware distribution.

---

## 6. NON-CUSTODIAL FINANCIAL COMPLIANCE & 0% PLATFORM CUT
* **100% Non-Custodial & Wayfinder-Isolated Routing:** All Creator (`Mason`) Supporter links and Partner Community donation checkouts (`Wayfinder Operations -> Spoke Control -> Non-Custodial Community Donations`) route 100% directly to the Mason's or Partner Community's own payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`), enforced by Postgres triggers so Keepers cannot alter Partner Spoke donation fields.
* **Zero Custodial Liability:** Sanctuary Foundry takes a **0% cut**, never touches or custodies community funds, and assumes zero liability for payment disputes, refunds, chargebacks, or tax reporting on Partner or Mason transactions.

---

## 7. ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE
* **Proactive Moderation & Crowd-Sourced Firewall:** Each Partner Spoke is responsible for staffing `Architect` and `Oversight` moderators to triage the **Verified Mason Queue** and the **Scout Queue** (enforcing the schema-defined `min_scout_submissions` threshold).
* **Foundry Intervention:** If a Partner consistently fails to classify Tiers 1 through 5 artifacts, Keepers Core reserves the right to enforce global heuristic blocks or intervene at the gateway level.
* **High-Friction Bilateral Severance ("Cut the Cord"):**
  * **Foundry Termination:** Repeated or intentional failure to enforce this Protocol constitutes a material breach of the [Partners Agreement](./Partners%20Agreement.md) and results in bilateral severance via `sever_spoke_cord`.
  * **Partner Self-Service Severance:** Conversely, any Partner's `Wayfinder` may unilaterally execute **Spoke Sever (Cut the Cord)** from **Wayfinder Operations -> Spoke Control** at any time (`"CUT THE CORD"` phrase verification + armed confirmation). Executing severance writes an immutable audit entry to both databases, deactivates the workspace on the Sanctuary Hub, and permanently scrubs (`NULL`s / deletes) the Partner's `supabase_service_key` from `public.sanctuary_game_secrets` while leaving 100% of the Partner's Spoke Database intact under their sole ownership (with cryptographic `SRK1` profile relinking available for returning Citizens).

# Sanctuary OS — Global Compliance Protocol

**Document Version:** V5.8 (v0.5.8-Dev.5)  
**Last Updated:** October 28, 2026  

---

## Table of Contents
1. **PREAMBLE & RIGHT OF MODIFICATION**
2. **THE FLORIDA COMPLIANCE LAYER (TIERS 0–4 & CONTENT SCRUBBING)**
3. **MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)**
4. **CROSS-PLATFORM SECURITY PARITY (WINDOWS & MACOS)**
5. **THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER**
6. **NON-CUSTODIAL FINANCIAL COMPLIANCE & 0% PLATFORM CUT**
7. **ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE**

---

## 1. PREAMBLE & RIGHT OF MODIFICATION
This Sanctuary Global Compliance Protocol ("Protocol") outlines the mandatory moderation, safety, and content sanitization standards required by all officially recognized Sanctuary Partners and connected Spoke Databases across the Sanctuary OS multi-game federation.

**Living Document Clause:** Sanctuary Foundry ("Keepers Core") reserves the right to modify, expand, or redefine Compliance Tiers, automated heuristic enforcement mechanisms, and malware definitions at any time to respond to evolving security threats or legal regulations. Updates become effective upon publication or reasonable notice, except emergency malware and security updates (including Core OS Heuristic Signatures), which take effect immediately across all connected workspaces.

---

## 2. THE FLORIDA COMPLIANCE LAYER (TIERS 0–4 & CONTENT SCRUBBING)
Sanctuary OS operates on the foundational principle of **"User Sovereignty vs. Network Integrity."** While Citizens maintain total authority over their local airgapped Vaults, the Global Nexus, Cloud Blueprints, and public-facing endpoints must remain legally compliant and safe for general discovery.

Partners must ensure their internal moderation teams (`Architect`, `Oversight`, and `Wayfinder` clearances) actively categorize all database artifacts according to the 6-level Compliance Matrix (`compliance_tier` `0` through `5`):

### Defined Content & Safety Tiers:
* **Compliance Tier 0 (Standard / Public Safe):**
  * **Definition:** Safe, verified general-audience artifacts eligible for full public indexing across The Nexus, Cloud Blueprints (`SNCXXX`), and public Mason Profiles.
* **Compliance Tiers 1–2 (Explicit / Adult & Illicit Themes):**
  * **Definition:** Any artifact, mod, or asset containing adult/NSFW themes (**Tier 1**) or illicit substances/themes (**Tier 2**).
  * **Local Sovereignty:** Permitted for local use by Citizens within their isolated Vaults and via decentralized Static Edge Manifests (`manifest.json` / `override.json`).
  * **Public Scrub & Blueprint Auto-Purge:** Automatically scrubbed from all public Nexus Feeds, community Search Results, and Cloud Blueprints. The PostgreSQL trigger `trg_purge_flagged_hash_from_blueprints` automatically strips any non-Tier-0 hash from public Cloud Blueprints the instant it is flagged.
  * **Support Access & Dirty Log Sanitization:** Citizens using Tier 1–2 artifacts retain access to the Citizen Support Desk; however, exception logs containing adult-mod signatures ("Dirty Logs") are flagged and local OS paths/usernames are automatically scrubbed before transmission so moderators can route tickets safely.
* **Compliance Tiers 3–4 (Extreme Violence & Taboo / Prohibited Content):**
  * **Definition:** Severe content involving extreme violence (**Tier 3**) or taboo/prohibited themes (**Tier 4**).
  * **Local Sovereignty:** Permitted strictly within isolated local Vaults.
  * **Public Scrub, Lab Restriction & Vault Lock:** Automatically scrubbed from all public feeds and Cloud Blueprints, and blocked from community Homestead Lab telemetry submissions. Equipping or storing active Tier 3–4 artifacts triggers a **Vault Lock**, restricting Citizen Support Desk ticket submissions until the flagged files are removed.

---

## 3. MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)
Sanctuary OS employs a **Universal Multi-Format Rust Heuristic Scanner** alongside cryptographic Blake3 / SHA-256 DNA signature verification to protect Citizens across every supported game engine and file container (`.package`, `.ts4script`, `.zip`, `.jar`, `.pak`, `.rpf`, `.dll`, `.asi`, `.exe`, `.app`, `.py`, `.pyc`, `.pyo`).

### 3.1. Dual-Tier Heuristic Governance
* **Core Heuristics (`keeper_heuristic_signatures` on Hub DB):** Maintained exclusively by Keepers Core. Enforces baseline cross-game protection against OS-level execution and exfiltration vectors (`os.system`, `subprocess.Popen`, `ctypes.windll`, `discord.com/api/webhooks`, `urllib.request.urlopen`, `base64.b64decode`, marshaled Python bytecode symbol chains, and PE/Mach-O wide-string payloads). Core Heuristics are compiled using thread-safe `OnceLock` regex sets in Rust, are read-only at the Spoke level, and cannot be disabled by Partner administrators.
* **Spoke Heuristics (`heuristic_signatures` on Spoke DB):** Maintained by the Partner's `Oversight` and `Wayfinder` teams to target game-specific exploits or script payloads unique to their engine architecture. Both Core and Spoke signatures are merged into `.malware_signatures.json` prior to every Radar Sweep and file ingestion.

### 3.2. Compliance Tier 5 (Confirmed Malware & Full-OS Quarantine Lockdown)
* **Definition:** Any artifact containing malicious code, unauthorized executable scripts, credential stealers, webhook exfiltrators, remote-code-execution (RCE) payloads, or destructive routines.
* **Full-OS Quarantine SidePanel Lockdown (`MalwareAlertModal`):** If Sanctuary OS detects a confirmed Tier 5 DNA hash or critical heuristic hit during ingestion or a Radar Sweep, the OS immediately halts game execution, isolates the asset into the airgapped `Quarantine/` sector, locks the entire OS shell (Sidebar, Top Bar, and Morphing Dock), and opens the **Quarantine Lockdown SidePanel**. Back-to-back malware detections are queued asynchronously so the UI never freezes.
* **Transparent Attribution & Citizen-Signed Secure Shred:** The Quarantine Lockdown SidePanel displays the exact **Triggered By** vector (`Known Malware Hash` vs. `Heuristic Hit` pattern) and **Detection Source** (`Spoke Registry • <Spoke Name>` or `Sanctuary Foundry`). Neutralization requires the **Citizen's Signature** to execute a destructive byte-level **Secure Shred** in Rust. Upon shredding, optional anonymous Quarantine Manifests (File Name, DNA Hash, and Threat Signature) are routed to `quarantine_manifests` for global cluster neutralization.

### 3.3. Partner Obligation for Tier 5
Partners must never host, endorse, or intentionally allow Tier 5 DNA to propagate within their Spoke Database. If a Partner discovers malware within their community, their `Oversight` or `Architect` team must immediately flag its DNA hash as `compliance_tier = 5` and `status = 'corrupted'` to trigger network-wide neutralization and automatic pruning from all public Cloud Blueprints.

---

## 4. CROSS-PLATFORM SECURITY PARITY (WINDOWS & MACOS)
Sanctuary OS enforces identical airgap and heuristic security guarantees across both Windows (`.exe` / NSIS) and macOS (`.dmg` / `.app` Universal Binary):
* **macOS Gatekeeper & Quarantine Handling:** When deploying verified symlinks or launching game binaries on macOS, the Rust backend inspects and manages `com.apple.quarantine` extended attributes (`xattr`) only for validated Vault artifacts while preserving full heuristic scanning prior to projection.
* **Full Disk Access (TCC) & Sandbox Integrity:** On macOS, Sanctuary OS verifies read/write access to `~/Documents` and `~/Library/Application Support` (`check_macos_permissions`) and guides Citizens to grant Full Disk Access when required so symlink airgapping and Time Capsule hardlinks operate without silent permission failures.

---

## 5. THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER
Partners acknowledge the existence of the **Nuclear Override** built into System Preferences (revealed by clicking the System Preferences subtitle 5 times, allowing advanced developers to bypass local security lockouts strictly within an offline local environment).
* **Privacy-First Decoupled Ban Ledger (`hardware_bans`):** Sanctuary OS does **not** persistently track or store Hardware IDs (HWIDs) on standard Citizen profiles. An encrypted hardware signature hash is recorded into the Core OS `hardware_bans` ledger **only** at the exact moment a user triggers the Nuclear Override or is banned for Tier 5 malware distribution.
* **Cross-Network Enforcement:** Once an account or hardware hash is recorded in the Core OS ban ledger, the `game-gateway` Edge Function (`secure_sync_hub_ban_to_spokes`) propagates the ban status across connected Spoke databases, permanently revoking cloud network privileges while leaving the user's offline local machine untouched.
* **Partner Network Impact:** Partners cannot override global Core OS security bans or grant cloud exemptions to accounts/hardware hashes flagged for Tier 5 malware distribution.

---

## 6. NON-CUSTODIAL FINANCIAL COMPLIANCE & 0% PLATFORM CUT
* **100% Non-Custodial Routing:** All Creator (`Mason`) Supporter links and Partner Community donation checkouts (`Wayfinder Operations -> Spoke Control -> Non-Custodial Community Donations`) route 100% directly to the Mason's or Partner Community's own payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`).
* **Zero Custodial Liability:** Sanctuary Foundry takes a **0% cut**, never touches or custodies community funds, and assumes zero liability for payment disputes, refunds, chargebacks, or tax reporting on Partner or Mason transactions.

---

## 7. ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE
* **Proactive Moderation & Crowd-Sourced Firewall:** Each Partner Spoke is responsible for staffing `Architect` and `Oversight` moderators to triage the **Verified Mason Queue** and the **Scout Queue** (which enforces the schema-defined `min_scout_submissions` threshold before surfacing unverified crowdsourced hashes).
* **Foundry Intervention:** If a Partner consistently fails to classify Tiers 1 through 5 artifacts, Keepers Core reserves the right to enforce global heuristic blocks or intervene at the gateway level.
* **Bilateral Severance ("Cut the Cord"):**
  * **Foundry Termination:** Repeated or intentional failure to enforce this Protocol (such as intentionally un-flagging malware or promoting Tier 1–4 content into public Tier-0 feeds) constitutes a material breach of the [Partners Agreement](./Partners%20Agreement.md) and results in immediate severance via `secure_sever_spoke_cord`.
  * **Partner Self-Service Severance:** Conversely, any Partner's `Wayfinder` may unilaterally execute **Spoke Sever (Cut the Cord)** from **Wayfinder Operations -> Spoke Control** at any time. Executing severance writes an immutable audit entry to both databases, deactivates the workspace on the Sanctuary Hub, and permanently scrubs (`NULL`s) the Partner's `supabase_service_key` from the Hub while leaving 100% of the Partner's Spoke Database intact under their sole ownership.

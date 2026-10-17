# Sanctuary OS
# Compliance Protocol

**Document Version:** V5.7  
**Last Updated:** October 17, 2026  

---

## Table Of Contents
1. **PREAMBLE & RIGHT OF MODIFICATION**
2. **THE FLORIDA COMPLIANCE LAYER (TIERS 0–4 & CONTENT SCRUBBING)**
3. **MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)**
4. **THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER**
5. **ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE**

---

## 1. PREAMBLE & RIGHT OF MODIFICATION
This Sanctuary Global Compliance Protocol ("Protocol") outlines the mandatory moderation, safety, and content sanitization standards required by all officially recognized Sanctuary Partners and connected Spoke Databases.

**Living Document Clause:** Sanctuary Foundry reserves the right to modify, expand, or redefine Compliance Tiers, automated enforcement mechanisms, and malware definitions at any time to respond to evolving security threats or legal regulations. Updates become effective upon publication or reasonable notice, except emergency malware/security updates (including Core OS Heuristic Signatures), which take effect immediately across all connected workspaces.

---

## 2. THE FLORIDA COMPLIANCE LAYER (TIERS 0–4 & CONTENT SCRUBBING)
Sanctuary OS operates on the philosophy of **"User Sovereignty vs. Network Integrity."** While Citizens maintain total authority over their local Vaults, the Global Nexus, Cloud Blueprints, and public-facing endpoints must remain legally compliant and safe.

Partners must ensure their internal moderation teams (Architects, Oversight, and Wayfinders) actively categorize all database artifacts according to the current Compliance Tiers (`compliance_tier` `0` through `5`):

### Currently Defined Content Tiers:
*   **Compliance Tier 0 (Standard / Public Safe):**
    *   **Definition:** Safe, verified general-audience artifacts eligible for full public indexing across The Nexus, Cloud Blueprints (`SNCXXX`), and public Mason Profiles.
*   **Compliance Tiers 1–2 (Explicit / Adult & Illicit Themes):**
    *   **Definition:** Any artifact, mod, or asset containing adult/NSFW themes (Tier 1) or illicit substances/themes (Tier 2).
    *   **Local Sovereignty:** Permitted for local use by Citizens within their isolated Vaults and via decentralized Static Edge Manifests (`manifest.json`).
    *   **Public Scrub & Blueprint Purge:** Automatically scrubbed from all public Nexus Feeds, community Search Results, and Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints` automatically strips any non-Tier-0 hash from public blueprints the moment it is flagged).
    *   **Support Access & Dirty Log Handling:** Citizens using Tier 1–2 artifacts retain access to the Citizen Support Desk; however, crash logs containing known adult-mod signatures ("Dirty Logs") are flagged so moderators can route or sanitize sensitive stack traces appropriately.
*   **Compliance Tiers 3–4 (Extreme Violence & Taboo Content):**
    *   **Definition:** Severe content involving extreme violence (Tier 3) or taboo/prohibited themes (Tier 4).
    *   **Local Sovereignty:** Permitted strictly within isolated local Vaults.
    *   **Public Scrub & Vault Lock:** Automatically scrubbed from all public feeds and Cloud Blueprints. Equipping or storing active Tier 3–4 artifacts triggers a **Vault Lock**, which restricts Citizen Support Desk ticket submissions until the severe artifacts are removed.

---

## 3. MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 5)
Sanctuary OS employs a **Universal Multi-Format Rust Heuristic Scanner** alongside cryptographic SHA-256 DNA signature verification to protect the ecosystem across every mod file format (`.package`, `.ts4script`, `.zip`, `.jar`, `.pak`, `.dll`, `.asi`, `.exe`, `.py`, `.pyc`, `.pyo`).

### 3.1. Dual-Tier Heuristic Governance:
*   **Core Heuristics (`keeper_heuristic_signatures` on Hub DB):** Maintained exclusively by Sanctuary Keepers. Enforces baseline cross-game protection against OS-level execution vectors (`os.system`, `subprocess.Popen`, `ctypes.windll`, `discord.com/api/webhooks`, `urllib.request.urlopen`, `base64.b64decode`, marshaled Python bytecode symbol chains, and PE wide-string payloads). Core Heuristics are read-only at the Spoke level and cannot be disabled by Partner administrators.
*   **Spoke Heuristics (`heuristic_signatures` on Spoke DB):** Maintained by the Partner's Oversight and Wayfinder teams to target game-specific exploits or script payloads unique to their ecosystem. Both Core and Spoke signatures are merged into `.malware_signatures.json` prior to every Radar Sweep and file ingestion.

### 3.2. Compliance Tier 5 (Confirmed Malware):
*   **Definition:** Any artifact containing malicious code, unauthorized executable scripts, credential stealers, webhook exfiltrators, or destructive payloads.
*   **Zero-Choice Lockdown:** If the Core OS detects a confirmed Tier 5 DNA hash originating from the Partner's database or local ingestion, the OS automatically halts game execution, isolates the asset into the Quarantine Zone, triggers a **Vault Lock**, and locks the user's interface with a critical security modal.
*   **Secure Shred & Telemetry:** To neutralize the threat, the OS utilizes the **Secure Shred** protocol (requiring the Citizen's Signature to execute a destructive byte-level overwrite and removal via the Rust backend). Upon execution of a Secure Shred, anonymous Quarantine Manifests (File Name, DNA Hash, and Threat Signature) are routed to Oversight Command (`quarantine_manifests`) to track and neutralize global malware clusters.

### 3.3. Partner Obligation for Tier 5:
Partners must not host, endorse, or intentionally allow Tier 5 DNA to propagate within their Spoke Database. If a Partner discovers malware within their community, their Oversight/Architect team must immediately flag its DNA hash as `compliance_tier = 5` and `status = 'corrupted'` to trigger network-wide neutralization and automatic pruning from all public Cloud Blueprints.

---

## 4. THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER
The Partner acknowledges the existence of the **Nuclear Override** built into the Core OS System Preferences (revealed by clicking the System Preferences subtitle 5 times, allowing advanced users to bypass security lockouts for isolated local testing).
*   **Privacy-First Decoupled Ban Ledger (`hardware_bans`):** Sanctuary OS does **not** persistently track or store Hardware IDs (HWIDs) on standard user profiles. An encrypted hardware signature hash is recorded into the Core OS `hardware_bans` ledger **only** at the exact moment a user triggers the Nuclear Override or is banned for malware evasion.
*   **Cross-Network Enforcement:** Once an account or hardware hash is recorded in the Core OS ban ledger, the `game-gateway` Edge Function (`secure_sync_hub_ban_to_spokes`) propagates the ban status across connected Spoke databases, permanently revoking cloud network privileges while leaving the user's local offline sandbox intact.
*   **Partner Network Impact:** Partners cannot override global Core OS security bans or request network exceptions for accounts/hardware hashes flagged for Tier 5 malware distribution.

---

## 5. ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE
*   **Proactive Moderation & Crowd-Sourced Firewall:** The Partner is responsible for staffing an adequate number of Architects to monitor the **Verified Mason Queue** and the **Scout Queue** (which enforces the `min_scout_submissions` threshold before surfacing unverified crowdsourced hashes).
*   **Foundry Intervention:** If a Partner consistently fails to classify Tiers 1 through 5 artifacts, Sanctuary Foundry (Keepers) reserves the right to enforce global heuristic blocks or intervene at the gateway level.
*   **Bilateral Severance ("Cut the Cord"):**
    *   **Foundry Termination:** Repeated or intentional failure to enforce this Protocol (e.g., intentionally un-flagging malware or surfacing Tier 1–4 content to public Tier-0 feeds) constitutes a material breach of the Sanctuary Partners Program Agreement and will result in immediate severance via `secure_sever_spoke_cord`.
    *   **Partner Self-Service Severance:** Conversely, any Partner's Wayfinder may unilaterally execute the **Cut the Cord** protocol from their Wayfinder Hub (`ServerHealthSidePanel`) at any time. Executing severance logs an immutable audit entry on both databases, deactivates the workspace on the Sanctuary Hub, and permanently scrubs the Partner's `supabase_service_key` from the Hub while leaving 100% of the Partner's Spoke Database intact under their sole ownership.
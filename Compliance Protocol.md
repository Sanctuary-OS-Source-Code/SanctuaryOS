# Sanctuary OS — Global Compliance Protocol

## 1. PREAMBLE & RIGHT OF MODIFICATION

This Sanctuary Global Compliance Protocol ("Protocol") outlines the mandatory moderation, safety, DMCA routing, and content sanitization standards required by all officially recognized Sanctuary Partners and connected Spoke Databases across the Sanctuary OS multi-game federation.

**Living Document Clause:** Sanctuary Foundry ("Keepers Core") reserves the right to modify, expand, or redefine Compliance Tiers, automated heuristic enforcement mechanisms, and malware definitions at any time to respond to evolving security threats or legal regulations. Updates become effective upon publication or reasonable notice, except emergency malware and security updates (including Core OS Heuristic Signatures), which take effect immediately across all connected workspaces.

---

## 2. PLATFORM CLASSIFICATION, MINOR SAFETY & NON-OVERRIDABLE VERIFIED MASON HARDGATES

Sanctuary OS is designed and operated specifically to fall outside social media, commercial storefront, and file-hosting classifications through strict architectural hardgates that apply identically across Keepers Core and every connected Community Spoke:

### 2.1. Statutory Classification: Technical Software, Developer Tools & Creator Release Channel

- **Local-First Technical Software & Developer Tooling:** Sanctuary OS functions as an offline-capable **Symlink Airgap manager, load-order compiler, Bytecode Hound malware/heuristic scanner, conflict radar, and schema-driven Workbench/Studio IDE** for local software configuration files.
- **Not a Storefront or File Host:** Sanctuary OS hosts **zero third-party mod binaries or copyrighted game executables**, processes **zero first-party payments**, and takes a **0% cut** of external non-custodial creator donations.
- **Not an Open Social Media Network:** Sanctuary OS contains **no general Citizen public profile pages, no peer-to-peer direct messaging (DMs), no open Citizen social posting feeds, and no algorithmic engagement ranking**.

### 2.2. Comm-Link Verified Mason Hardgate (No User Profiles or Open Social Posting)

- **Verified Creator Changelog & Release Dispatch Channel:** **Comm-Link** (`mason_posts`) operates exclusively as a structured **Creator-to-Subscriber release dispatch, changelog, and patch-advisory channel** tied to verified developers (`Verified Masons`). Comments on release dispatches are plain-text feedback subject to moderation controls and mute flags (`is_comm_banned` / `hide_mason_comment`), not general user publishing.
- **Non-Overridable Verified Mason Hardgate:** Top-level Comm-Link dispatch publishing is gated strictly to **Verified Masons** (`masons.is_verified = true`, authenticated with mandatory FIDO2 Passkey step-up) and authorized Spoke Staff at both the Core Gateway (`game-gateway`) and Spoke database RLS layer (`owns_verified_mason`). **Partner Spokes (**`Wayfinders`**) cannot override, relax, or disable this Verified Mason hardgate.**

### 2.3. Nexus Asset Upload Hardgate (Minus Blueprints)

- **Verified Mason Hardgate on Nexus Assets:** All cloud **Nexus Asset uploads** (`nexus_assets` — **Chameleon Themes**, **Sparse Delta Lexicons**, and **Workbench Configuration Templates** — alongside **Collections** and cloud Mod Registry records) are strictly locked to **Verified Masons** (`is_verified_mason_or_staff()` + Core `game-gateway` enforcement) and authorized Spoke Staff. **Partner Spokes (**`Wayfinders`**) cannot override, bypass, or disable the Verified Mason hardgate.** (Unverified Citizens retain strictly local JSON import/export in their offline Open Workshop.)
- **Narrow Cloud Blueprint Exception:** Citizen-shareable **Cloud Blueprints (**`SNCXXX`**)** are strictly non-media JSON loadouts consisting exclusively of cryptographic SHA-256 DNA hashes, slot identifiers, and game-version compatibility strings (`zero uploaded binary files, zero executable code, and zero user-uploaded images or media`) and remain automatically scrubbed of any confirmed **Tier 1–6** hash by `trg_purge_flagged_hash_from_blueprints`.

### 2.4. Minor Safety, Age Eligibility & Structural Tier-0 Airgap

- **Age Thresholds:** General Citizen accounts require users to be **13 years or older** (or the higher minimum digital-consent age required by local law); all Verified Creator (`Verified Mason`) and moderation/operator clearances (`Architect` through `Keeper`) require **18+ adult majority** (verified via our Zero-ID attestation + FIDO2 Passkey protocol in [Verified Mason & Spoke Governance SOP](./Docs/verified_mason_and_spoke_governance_sop.md)).
- **Zero-Surveillance Structural Safety:** Without collecting government photo IDs or biometric age scans, Sanctuary OS protects minor users through **(a)** the complete absence of public Citizen profiles, stranger DMs, and open Citizen social feeds, **(b)** non-overridable Verified Mason hardgates on Comm-Link dispatches and cloud Nexus Asset uploads (minus non-media hash Blueprints), and **(c)** mandatory **Compliance Tier 0 (Public Safe)** scrubbing across every public network surface.

---

## 3. COMPLIANCE TIERS 0–5: PUBLIC TIER 0, SPOKE-ROUTED DMCA (TIER 1) & RESTRICTED CONTENT (TIERS 2–5)

Sanctuary OS operates on the foundational principle of **"User Sovereignty vs. Network Integrity."** While Citizens maintain total authority over their local airgapped Vaults and Personal Rig transfers, the Global Nexus, Cloud Blueprints, and public-facing endpoints must remain legally compliant and safe for general discovery.

Partners must ensure their internal moderation teams (`Architect`, `Oversight`, and `Wayfinder` clearances) actively categorize all database artifacts according to the **7-Level Compliance Matrix (**`compliance_tier` `0` **through** `6`**)**:

### Complete 7-Tier Matrix Summary

- **Tier 0 — Clean / Public Safe (**`compliance_tier = 0`**):** Public safe, general-audience verified artifacts.
- **Tier 1 — Legal / DMCA Hold (**`compliance_tier = 1`**):** Validated copyright / IP takedown hold forwarded to the responsible Partner Spoke with Keepers Core compliance logging.
- **Tier 2 — Explicit (**`compliance_tier = 2`**):** Adult / NSFW content.
- **Tier 3 — Illicit (**`compliance_tier = 3`**):** Illicit substances or restricted illegal-activity depictions.
- **Tier 4 — Extreme Violence (**`compliance_tier = 4`**):** Graphic violence or gore.
- **Tier 5 — Taboo / All Other Prohibited Content (**`compliance_tier = 5`**):** Taboo or severe non-malware restricted content.
- **Tier 6 — Confirmed Malware (**`compliance_tier = 6`**):** Malicious code, infostealers, RCE payloads, or unauthorized executables (Full-OS Quarantine Lockdown).

### 3.1. Compliance Tier 0 (Clean / Public Safe)

- **Definition:** Safe, verified general-audience artifacts (`Stable` / `Unstable`) eligible for full public indexing across The Nexus, Comm-Link, Cloud Blueprints (`SNCXXX`), public Mason Profiles, and Community Mod Support tickets. Consistent with Section 2, cloud publishing of Nexus Assets (`workbench_template`, `lexicon`, `chameleon`), Collections, and Comm-Link dispatches is strictly hard-locked to **Verified Masons** and Spoke Staff (non-overridable by Partner Spokes), while local JSON export/import and non-media JSON Cloud Blueprint sharing remain open to all Citizens.
- **Strict Tier 0 & Unknown Isolation:** Only **Compliance Tier 0** artifacts appear across The Nexus, Comm-Link, Community Support, and the Tier 3 **Architect Console**. **Unknown / Unverified** hashes appear exclusively in **Scout** and **Mason** triage queues with passing 4-stage Homestead Lab verification (`_lab_cert_proof`). Items flagged with `has_pending_flag = true` or **Compliance Tiers 1–5** are hidden publicly (`NOT IN (1, 2, 3, 4, 5)`) and restricted exclusively to **Oversight** and **Wayfinder** hubs. Architect diagnostic submissions (`enforceArchitectSubmissionCompliance`) accept only known Tier 0 catalog hashes.
- `Pending` **Compliance Escalation Pipeline:** Whenever an Architect or Citizen flags an artifact or report as **Compliance Tiers 1–5**, it triggers `has_pending_flag = true` and routes exclusively into **Oversight Command -&gt; Compliance** with `status = 'pending'` (and `status_reason` provenance), hiding it immediately from public surfaces and Tier 3 Architects while protecting active Citizen Cloud Blueprints from premature stripping until confirmed by `Oversight` or `Wayfinder`.

### 3.2. Compliance Tier 1 (Legal / DMCA Hold — Spoke-Routed With Keepers Core Compliance Log)

- **Definition:** Any metadata record, Nexus Collection, Cloud Blueprint, or external download link subject to a valid `17 U.S.C. § 512(c)(3)` **DMCA Takedown Notice** or verified creator ownership hold (detailed in full in [DMCA & Ownership Dispute SOP](./Docs/dmca_and_ownership_dispute_sop.md)).
- **Spoke-Forwarded Workflow & Immutable Keepers Core Compliance Log:**
  1. **Keepers Core Statutory Log (**`public.dmca_compliance_notices`**):** All formal DMCA notices ingested by the Hub record an immutable statutory compliance entry on Keepers Core—encrypting claimant PII at rest inside `sealed_legal_contact` (`enc:dmca1:`)—while logging timestamps, target identifiers, strike progression, and triage decisions.
  2. **Automatic Spoke Relay (**`SPOKE_PENDING_SLA` **— 48-Hour SLA):** Because Partner Communities own and operate their own Spoke databases (`schema.sql`), notices targeting a Partner Spoke's `mods`, `blueprints`, or `collections` forward directly into that Spoke's **Oversight Command -&gt; Compliance -&gt; DMCA & Legal** queue under a mandatory **48-hour SLA**. Keepers Core executes direct takedown triage only for Core Hub assets or when a Spoke defaults on its statutory SLA.
  3. **Tier 1 Soft-Hold (**`VALIDATE_TAKEDOWN`**) & Blueprint Hash Strip:** Upon validating a prima facie § 512(c)(3) notice, Spoke Oversight/Wayfinder sets `compliance_tier = 1` (`[DMCA HOLD - TIER 1]`), soft-delists affected records from public feeds, strips referenced hashes from public Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`), discloses claimant contact fields to the uploader, opens the **10–14 business day** `§ 512(g)(3)` **counter-notice window**, and increments Keepers Core's **3-strike § 512(i)** repeat-infringer ledger (`cloud_publishing_revoked`).
  4. **Authority Pause & Restoration (**`HOLD_VERIFY_AUTHORITY` **/** `RESTORE_MATERIAL`**):** Ambiguous authority filings pause the 48h SLA (`AWAITING_AUTHORITY`) without removing content prematurely; valid uncontested counter-notices restore entries back to **Tier 0** (`compliance_tier = 0`). Local files inside Citizen Vaults are **never** remotely deleted by a Tier 1 Legal/DMCA hold.

### 3.3. Compliance Tiers 2–3 (Explicit / Adult & Illicit Themes)

- **Definition:** Any artifact, mod, or asset containing explicit adult/NSFW themes (**Tier 2**) or illicit substances/themes (**Tier 3**).
- **Local Sovereignty, Personal Rig Sync & Static Edge Polling:** Permitted for local use by Citizens within their isolated Vaults, Zero-PII AES-256-GCM Personal Rig transfers, and decentralized Static Edge Manifests (`.sanctuary.manifest.json` / `catalog.json` / `.sanctuary.override.json`).
- **Public Scrub & Confirmed Blueprint Auto-Purge:** Automatically scrubbed from The Nexus, Comm-Link, Architect Console, and Community Search Results, remaining visible solely inside **Oversight** and **Wayfinder** queues until reviewed or purged. Once a Tier 2–5 flag is **confirmed** by `Oversight` or `Wayfinder`, the PostgreSQL trigger `trg_purge_flagged_hash_from_blueprints` automatically strips the confirmed hash from shared public Cloud Blueprints.
- **Non-Destructive Active Blueprint Support Lock & Zero-PII Keeper Tickets:** To keep Community Mod Support logs free of unverified or restricted telemetry without deleting local Vault files, equipping any Tier 1–5 or Unknown artifact inside the active Blueprint engages an **Active Blueprint Support Lock** on Community Mod Support—providing a 1-click non-destructive unequip helper that clears only the active Blueprint slot while leaving Vault files untouched on disk. **Keeper OS Bug Reports** remain unrestricted at all times and collect zero mod hashes or mod telemetry, while Oversight-routed diagnostic logs automatically scrub OS paths, usernames, IPs, MACs, SIDs, emails, and hostnames across Windows, macOS, Linux, and SteamOS/Proton.

### 3.4. Compliance Tiers 4–5 (Extreme Violence & Taboo / All Other Prohibited Content)

- **Definition:** Severe content involving extreme violence or gore (**Tier 4**) or taboo / all other prohibited non-malware content (**Tier 5**).
- **Local Sovereignty:** Permitted strictly within isolated local Vaults.
- **Public Scrub, Lab Restriction & Support Lock:** Automatically scrubbed from public feeds, Comm-Link, confirmed Cloud Blueprints, and community Homestead Lab telemetry submissions, and routed strictly to **Oversight** and **Wayfinder** hubs. Any confirmed Tier 4–5 artifact present in the active Blueprint triggers the non-destructive **Active Blueprint Support Lock** on Community Mod Support (unlockable via 1-click active-Blueprint unequip without deleting local files), while Keeper OS Bug Reports remain accessible with zero mod telemetry.

---

## 4. MALWARE ENFORCEMENT, DUAL-TIER HEURISTICS & ZERO-TOLERANCE (TIER 6)

Sanctuary OS employs **Bytecode Hound v3**, a **Universal Multi-Format Rust Heuristic Scanner** alongside cryptographic SHA-256 DNA signature verification to protect Citizens across every supported game engine and file container (`.zip`, `.7z`, `.rar`, `.jar`, `.pak`, `.rpf`, `.dll`, `.asi`, `.exe`, `.app`, `.py`, `.pyc`, `.pyo`, and compressed binary chunk streams).

### 4.1. Dual-Tier Heuristic Governance

- **Core Heuristics (**`keeper_heuristic_signatures` **on Hub DB):** Maintained exclusively by Keepers Core. Enforces baseline cross-game protection against OS-level execution and exfiltration vectors (`os.system`, `subprocess.Popen`, `ctypes.windll`, `discord.com/api/webhooks`, `urllib.request.urlopen`, `base64.b64decode`, marshaled Python bytecode symbol chains, `> 8 MiB` sliding-window buffer threats, and PE/Mach-O/ELF/LNK masquerade payloads). Core Heuristics are compiled using thread-safe `OnceLock` regex sets in Rust, are read-only at the Spoke level, and cannot be disabled by Partner administrators.
- **Spoke Heuristics (**`heuristic_signatures` **on Spoke DB):** Maintained by the Partner's `Oversight` and `Wayfinder` teams to target game-specific exploits or script payloads unique to their engine architecture. Both Core and Spoke signatures are merged into `.malware_signatures.json` prior to every Radar Sweep and file ingestion.

### 4.2. Compliance Tier 6 (Confirmed Malware & Full-OS Quarantine Lockdown)

- **Definition:** Any artifact containing malicious code, unauthorized executable scripts, credential stealers, webhook exfiltrators, remote-code-execution (RCE) payloads, or destructive routines.
- **Full-OS Quarantine SidePanel Lockdown (**`MalwareAlertModal`**):** If Sanctuary OS detects a confirmed **Tier 6 Malware** DNA hash or critical heuristic hit during ingestion or a Radar Sweep, the OS immediately halts game execution, isolates the asset into the airgapped `Quarantine/` sector, locks the entire OS shell (Sidebar and Top-Right Control Capsule), and opens the **Quarantine Lockdown SidePanel**. Back-to-back malware detections are queued asynchronously so the UI never freezes.
- **Transparent Attribution & Citizen-Signed Secure Shred:** The Quarantine Lockdown SidePanel displays the exact **Triggered By** vector (`Known Malware Hash` vs. `Heuristic Hit` pattern) and **Detection Source** (`Spoke Registry • <Spoke Name>` or `Sanctuary Foundry`). Neutralization requires the **Citizen's Signature** to execute an irreversible zero-fill byte-level **Secure Shred** (zero-fill overwrite, flush, and unlink) in Rust. Upon shredding, optional opt-in Zero-PII Threat Manifests (File Name, SHA-256 DNA Hash, and Threat Signature — completely unlinked from user identity) may be routed to `public.malware_reports` for global cluster neutralization.

### 4.3. Partner Obligation for Tier 6 Malware

Partners must never host, endorse, or intentionally allow **Tier 6 Malware** DNA to propagate within their Spoke Database. If a Partner discovers malware within their community, their `Oversight` or `Wayfinder` team must immediately confirm its DNA hash as `compliance_tier = 6` and `status = 'blacklisted'` to trigger network-wide neutralization and automatic pruning from all public Cloud Blueprints.

---

## 5. CROSS-PLATFORM SECURITY PARITY (WINDOWS, MACOS & LINUX / STEAMOS)

Sanctuary OS enforces identical airgap, signed-update, path-traversal, and heuristic security guarantees across **Windows (**`SanctuaryOS.exe` **/ NSIS /** `.msi`**)**, **macOS (**`.dmg` **/** `.app` **Universal Binary)**, and **Linux / SteamOS (**`.AppImage` **/** `.deb` **& Steam Deck Proton)**:

- **Signed Desktop Updates & Root-Containment Path Guards:** Desktop updates verify cryptographic signatures via `tauri-plugin-updater`, archive extraction uses bounded `.take()` streaming into isolated temporary staging, and all filesystem commands enforce canonical root-containment guards (`utils.rs`) blocking `..` traversal, symlink escapes, protected save/airgap deletion (`is_protected_save_or_airgap_path`), and writes to OS system folders.
- **macOS Touch ID, Gatekeeper & Full Disk Access (TCC):** Supports native Apple Touch ID passkeys, verifies read/write access to `~/Documents` and `~/Library/Application Support` (`check_macos_permissions`), and strips `com.apple.quarantine` extended attributes only on validated Vault projections.
- **Linux & SteamOS / Proton Security Parity:** Enforces the exact same Bytecode Hound Core + Spoke Rust Heuristic scans, SHA-256 DNA verification, and Symlink Airgap isolation across native Linux paths, external SD card mounts (`/run/media/mmcblk0p1` & `/run/media/deck`), and Valve Proton prefixes (`compatdata/<AppID>/pfx/drive_c/`).

---

## 6. THE NUCLEAR OVERRIDE & PRIVACY-FIRST BAN LEDGER

Partners acknowledge the existence of the **Nuclear Override** built into System Preferences (revealed by clicking the System Preferences subtitle 5 times, allowing advanced developers to toggle bypass of local **Tier 6 Malware** lockouts strictly within an offline local environment—bidirectional since `v0.6.0-Dev.15` so users can also re-engage protection offline).

- **Privacy-First Decoupled Ban Ledger (**`hardware_bans`**):** Sanctuary OS does **not** persistently track or store Hardware IDs (HWIDs) on standard Citizen profiles. A domain-salted one-way SHA-256 hardware signature hash (`"sanctuary-os-zero-pii-hwid-v1:"`) is computed in Rust and recorded into the Core OS `hardware_bans` ledger **only** at the exact moment a user triggers the Nuclear Override or is banned for **Tier 6 Malware** distribution, with strict guards preventing fallback placeholder strings from ever being written or matched.
- **Cross-Network Enforcement:** Once an account or hardware hash is recorded in the Core OS ban ledger, the `game-gateway` Edge Function propagates the ban status across connected Spoke databases, permanently revoking cloud network privileges while leaving the user's offline local machine untouched.
- **Partner Network Impact:** Partners cannot override global Core OS security bans or grant cloud exemptions to accounts/hardware hashes flagged for **Tier 6 Malware** distribution; appeals are governed by the [Moderation Appeals & Remediation SOP](./Docs/moderation_appeals_and_remediation_sop.md).

---

## 7. NON-CUSTODIAL FINANCIAL COMPLIANCE & 0% PLATFORM CUT

- **100% Non-Custodial & Wayfinder-Isolated Routing:** All Creator (`Mason`) Supporter links and Partner Community donation checkouts (`Wayfinder Operations -> Spoke Control -> Non-Custodial Community Donations`) route 100% directly to the Mason's or Partner Community's own payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`), enforced by Postgres triggers so Keepers cannot alter Partner Spoke donation fields.
- **Zero Custodial Liability:** Sanctuary Foundry takes a **0% cut**, never touches or custodies community funds, and assumes zero liability for payment disputes, refunds, chargebacks, or tax reporting on Partner or Mason transactions.

---

## 8. ENFORCEMENT, INTERVENTION & BILATERAL SEVERANCE

- **Proactive Moderation, DMCA SLA & Crowd-Sourced Firewall:** Each Partner Spoke is responsible for staffing `Architect` and `Oversight` moderators to triage the **Verified Mason Queue**, the **Scout Queue** (enforcing the schema-defined `min_scout_submissions` threshold), **Pending Compliance Tiers 1–5**, and **Spoke-Forwarded DMCA Notices** within the **48-hour SLA**.
- **Foundry Intervention:** If a Partner consistently fails to classify **Tiers 1–6** artifacts or ignores forwarded statutory DMCA compliance obligations tracked in Keepers Core's `dmca_compliance_notices` log, Keepers Core reserves the right to execute fallback DMCA triage, enforce global heuristic blocks, or intervene at the gateway level.
- **High-Friction Bilateral Severance ("Cut the Cord"):**
  - **Foundry Termination:** Repeated or intentional failure to enforce this Protocol constitutes a material breach of the [Partners Agreement](./Partners%20Agreement.md) and results in bilateral severance via `sever_spoke_cord`.
  - **Partner Self-Service Severance:** Conversely, any Partner's `Wayfinder` may unilaterally execute **Spoke Sever (Cut the Cord)** from **Wayfinder Operations -&gt; Spoke Control** at any time (`"CUT THE CORD"` phrase verification + armed confirmation). Executing severance writes an immutable audit entry to both databases, deactivates the workspace on the Sanctuary Hub, revokes all active Spoke Gateway Tokens on the Spoke (`revoke_spoke_gateway_tokens`), and permanently purges the Partner's sealed Vault credential from `sanctuary_internal.spoke_credentials` + Supabase Vault while leaving 100% of the Partner's Spoke Database intact under their sole ownership (with cryptographic `SRK1` profile relinking available for returning Citizens).
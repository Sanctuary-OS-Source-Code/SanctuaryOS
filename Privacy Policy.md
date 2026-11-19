# Sanctuary OS — Privacy Policy

**Effective Date:** November 18, 2026

---

## 1. Core Privacy Principle: Local-First Sovereignty, Zero Anti-Cheat Hooks & Zero Spyware

Sanctuary OS is engineered from the ground up on a **Local-First, Privacy-by-Design** architecture across Windows, macOS, Linux, SteamOS / Steam Deck, and Web/Mobile PWA:

- **Your Local Vault Stays Local:** Your local mod files, private **Compliance Tier 1–5** configurations (`Legal/DMCA`, `Explicit`, `Illicit`, `Extreme Violence`, `Taboo`), save games, externalized Homestead Lab save mirrors (`SanctuarySaveVault` & `Backups/.lab_save_vault`), Mod Version History archives (`Backups/Mods/`), and Time Capsule snapshots reside on your local storage drive and are **never** uploaded to Sanctuary Foundry servers.
- **Zero Spyware, Ad-Tech or Intrusive Process Hooks:** Sanctuary OS contains zero third-party advertising SDKs, zero cross-site tracking pixels, never sells or rents Citizen data, and uses strictly passive OS telemetry (`PROCESS_QUERY_LIMITED_INFORMATION`, zero process-memory scraping, and zero global keyloggers) during Homestead Lab verification.

---

## 2. Zero-Knowledge Auth, Blinded Emails & Decoupled Hub/Spoke Minimization

Sanctuary OS strictly isolates your authentication credentials from independent Community Game Spokes:

1. **Core OS Hub (**`schema_os.sql` **— Governed by Keepers Core):**
   - Protects passwords with client-side **OWASP 600,000-iteration** `PBKDF2-HMAC-SHA256` stretching (`zkpw2$`) before transmission (layered with server-side **Bcrypt**) and supports **600,000-iteration Blinded Email Aliases (**`zk-...@blind.sanctuaryos.net`**)** so plaintext passwords are never transmitted. Sensitive account columns are strictly isolated from public/peer queries.
   - All transactional emails dispatched via `keeper-email-dispatch` store masked recipient addresses (`j•••@o•••.com`) and `NULL` HTML bodies in `keeper_email_dispatches`.
2. **Community Game Spokes (**`schema.sql` **— Governed by Community Wayfinders):**
   - When you mount a Community Game Spoke, `secure_sync_spoke_profile` synchronizes **only** your pseudonymous UUID (`id`), `username`, Spoke-specific role (`citizen` through `wayfinder`), and optional domain-separated SHA-256 `SRK1` **Spoke Relink Commitment** (`sanctuary_internal.spoke_relink_commitments`) so you can safely claim your legacy profile if a Spoke ever cuts the cord.
   - **Zero Email or Password Bleed:** Your email address, password hash, and private OAuth/authentication tokens are **never** stored in or shared with Community Spoke databases.

---

## 3. FIDO2 Passkeys, Touch ID, Companion Handshake & 12-Hour Device Seal

For users enabling Citizen 2FA or holding Elevated Clearances (`Verified Mason` through `Keeper`), the **Security Vault (**`auth.webauthn_credentials` **paired with the AES-256-GCM local desktop passkey vault)** stores only standard WebAuthn/FIDO2 public keys, credential IDs, and monotonic signature counters (`signCount`), while local desktop passkey, **Mason Edge Push API tokens (**`edge_push_tokens_v1.json`**)**, and **Local BYO API Key Broker** secrets (`Nexus`, `CurseForge`, `Modrinth`) are sealed strictly on-device with OS DPAPI/`0600` + `AES-256-GCM`. Biometric data (Windows Hello, macOS Touch ID, or hardware key secrets) never leaves your device's Secure Enclave / TPM. Successful verification issues a local **12-hour Device-Bound Cryptographic Passkey Seal (**`sanctuary_passkey_seal_v2`**)** or completes an ephemeral **Live Companion Passkey Handshake** (via W3C Web Push) without storing biometric or hardware identifiers in the cloud.

---

## 4. Privacy-First Decoupled Hardware Ban Ledger (`hardware_bans`) & Sealed DMCA Contact Custody

1. **Hardware Ban Ledger (**`hardware_bans`**):** Sanctuary OS does **not** collect, log, or attach Hardware IDs (HWIDs) to standard Citizen accounts or profiles:
   - When required by a security enforcement event, the Rust backend computes a **domain-salted one-way SHA-256 digest** (`"sanctuary-os-zero-pii-hwid-v1:"`) from the operating system UUID—never transmitting raw motherboard serials, MAC addresses, or hostnames—and blocks fallback placeholder strings (`unknown-hardware-id`) from ever causing false-positive collisions.
   - This one-way hash is recorded in the decoupled `hardware_bans` table on the Core OS Hub **only** when:
     1. You intentionally unlock and toggle on the **Nuclear Override** in System Preferences after acknowledging the security warning (`v0.6.0-Dev.15` supports offline bidirectional toggling back to safe mode); or
     2. Your account is permanently terminated by Oversight/Keepers for intentional **Compliance Tier 6 (Malware)** distribution or network attack.
2. **Statutory DMCA Contact Sealing (**`enc:dmca1:` **in** `dmca_compliance_notices`**):** When a claimant submits a formal `17 U.S.C. § 512` DMCA takedown or counter-notice, required statutory legal contact information (name, address, email, electronic signature) is immediately encrypted at rest under `AES-256-GCM` **(**`enc:dmca1:`**)** inside Keepers Core's `dmca_compliance_notices` compliance ledger, kept invisible to public APIs, unsealed only for authorized Keepers/Spoke Wayfinder/Oversight statutory triage or mandatory uploader § 512(c)(3) disclosure, and automatically purged after the statutory retention period (`Section 9`).

---

## 5. Automatic Zero-PII Scrubbing, Zero-Identity Reports & Strictly Opt-In Defaults

When you use the **Homestead Lab** exception analyzer, share diagnostic snippets, view community posts, or attach crash logs to a **Support Desk** ticket:

- **Opt-In Off Defaults (**`v0.6.0-Dev.15`**+):** Homestead Lab `_lab_cert_proof` receipts default to **local-only device storage** unless you explicitly submit to the cloud Scout/Mason queues. Mobile Companion (`Pocket Radar`) sync and diagnostic/Vault context attachments on support tickets default to **strict opt-in (OFF)**.
- Sanctuary OS's proactive **Zero-PII Scrubber (**`scrubLogUserData` **/** `obscure_username`**)** automatically redacts local operating system file paths containing your account username across **Windows (**`C:\Users\<Username>\`**)**, **macOS (**`/Users/<Username>/`**)**, **Linux (**`/home/<Username>/`**,** `/var/home/<Username>/`**,** `/run/media/<Username>/`**,** `/media/<Username>/`**)**, and **SteamOS / Valve Proton prefixes (**`drive_c/users/<Username>/`**)** to `[REDACTED BY SANCTUARY]` before displaying or transmitting the log snippet.
- The scrubber also redacts XML `<user>`, `<username>`, `<account>`, `<computername>`, and `<hostname>` tags, explicit `HWID` / `MachineId` / `DeviceId` / `Hostname` / `LocalIP` / `PublicIP` headers, MAC addresses, IPv4 and IPv6 addresses, Windows Security Identifiers (`S-1-5-21-...`), and email addresses to `[REDACTED BY SANCTUARY]` (and hex session tokens to `000000000000000000000000`). Unauthenticated / anonymous Citizen tickets (`author_id = null`) never expose user email prefixes.
- **Zero-Identity Community Telemetry:** Comm-Link views track strictly anonymous session-deduped aggregate counters (`increment_mason_post_view`), Nexus content flags/reports strip reporter identities, and clicking **Share Malware Manifest** (opt-in on **Citizen-Signed Secure Shred** of **Tier 6 Malware**) transmits only the leaf file name, cryptographic SHA-256 DNA hash, and matched rule ID to `public.malware_reports`—zero personal identifiers or user IDs are attached.
- **Opt-In Lexicon Studio Auto-Translate:** Standard Sanctuary usage sends zero UI strings to third-party translators. Only when a creator or Citizen explicitly clicks **Auto-Translate** inside **Lexicon Visual Studio** are abstract UI dictionary strings (with `{Glossary}` placeholders masked and zero user data) sent to Google Translate (`translate.googleapis.com` `gtx` endpoint) to populate draft translations.

---

## 6. Zero-PII E2EE Multi-Rig Staging, Alert Sync & Mason Perk Sync (`citizen_staging_queue`)

When you explicitly opt in to synchronize state across multiple devices (Windows, macOS, Steam Deck, Web, and Mobile PWA) via `citizen_staging_queue`:

- **Personal Rig Blueprints, Mobile Companion Pocket Radar, Once-Per-Account Notification Sync (**`notification_state_sync`**), and Multi-Rig Mason Support Sync (**`supporter_vault_sync`**)** are GZIP-compressed and encrypted client-side using **AES-256-GCM** (`deriveKey` + random `IV` and `salt`) and indexed solely by blinded one-way SHA-256 `user_token` digests—never transmitting plaintext mod lists, alert histories, or raw Patreon OAuth tokens.
- Neither Sanctuary Foundry nor the Spoke database can decrypt your staged payloads, and Blueprint transfer rows can be shredded immediately upon deployment (**Shred After Deploy**).

---

## 7. Non-Custodial Payment Privacy & Transparent Ledgers

When you support a Mason or donate to Sanctuary Foundry or a Partner Community Spoke, checkout occurs directly on the external payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`). Sanctuary OS never sees or stores your credit card number, bank details, or billing address. Verified webhooks (`partner-donation-webhook`) process only a one-way SHA-256 transaction nonce (`donation_event_nonces`), your Citizen UUID, and the paid amount to credit `+30 days per $5` of Supporter access and aggregate anonymous monthly operating ledger totals—storing zero relational history of which Partner Community or Mason you supported.

---

## 8. Platform Classification, Minor Safety & Zero Social-Graph Harvesting

Sanctuary OS is strictly **local-first technical configuration software, developer tooling, cybersecurity middleware, and a creator-to-subscriber release dispatch tool**—never an open social media network, commercial storefront, or user media host:

- **No General User Profiles, DMs, or Social Posting:** Standard Citizen accounts do not have public social profiles, peer-to-peer direct messaging (DMs), or open Comm-Link posting privileges. **Comm-Link** operates strictly as a **Verified Creator Changelog & Release Dispatch Channel**, and all cloud **Nexus Asset uploads (minus non-media JSON hash Blueprints)** are strictly locked to FIDO2-authenticated **Verified Masons** behind Core hardgates that **Partner Spokes cannot override**. Consequently, Sanctuary OS performs zero social-graph profiling, behavioral ad targeting, or engagement tracking on Citizens or minors.
- **Age Eligibility (**`13+` **Citizens /** `18+` **Creators & Staff) & COPPA / GDPR-K Compliance:** Sanctuary OS is not directed at children under `13` (or the higher minimum digital-consent age required in a user's jurisdiction, such as `13–16` under GDPR), and Elevated Creator/Staff clearances (`Verified Mason` through `Keeper`) require **18+ adult majority** and hardware/biometric FIDO2 Passkey enrollment.
- **Zero Invasive Age-Surveillance Data Collection:** Sanctuary OS protects minors structurally through zero public Citizen profiles, zero stranger DMs, non-overridable Verified Mason publishing hardgates, and strict public **Compliance Tier 0** scrubbing—**without** collecting or storing government photo IDs, driver's licenses, or facial-biometric age-estimation scans. If we learn a child under the applicable minimum age has created a network account without verifiable legal consent, we will promptly deactivate and purge that account upon notice.

---

## 9. Data Subject Rights (GDPR / UK GDPR / CCPA), Self-Service Erasure, Retention & Governing Law

### 9.1. 100% Offline Operation & Data Control

You may use Sanctuary OS entirely offline (`Guest / Offline Local Mode` or **Local Network Only** air-gap mode inside System Preferences) to manage your Vault, Mod Version History, Load Order, Homestead Lab, Workbench configs, and Time Capsule backups without creating any network account.

### 9.2. Data Retention Schedules

We retain minimal cloud records strictly for the operational and statutory windows below:

Data CategoryStorage LocationRetention Schedule & Purge Mechanism**Core Hub Account Credentials (**`auth.users`**,** `profiles`**,** `user_passkeys`)Hub DB (`schema_os.sql`)Retained while account is active; **deleted immediately** upon self-service Account Deletion or verified erasure request (`<= 30 days` for automated cold DB backups).**E2EE Rig Staging & Alert Sync (**`citizen_staging_queue`)Spoke / Hub DBDeleted immediately on **Shred After Deploy** or account deletion; automatic FIFO TTL expiration after `30 days` (`cleanup_expired_staging_queue()`).**Support Tickets (**`sanctuary_tickets` **/** `keeper_tickets`)Spoke / Hub DBActive tickets retained while open; resolved/closed tickets anonymized or pruned on a rolling `365-day` schedule (`90 days` on user-requested erasure, subject to security abuse holds).**Email Dispatch Logs (**`keeper_email_dispatches`)Hub DBHTML body stored as `NULL`; masked recipient audit log (`j•••@o•••.com`) automatically purged after `90 days`.**DMCA Statutory Compliance Ledger (**`dmca_compliance_notices`)Hub DB (`enc:dmca1:`)Retained for `3 years` (`17 U.S.C. § 512` statutory limitation period) with contact details encrypted at rest; purged thereafter unless subject to active litigation hold.**Donation Webhook Nonces (**`donation_event_nonces`)Hub / Spoke DBOne-way SHA-256 deduplication nonces purged after `365 days`.**Spoke Moderation Audit Logs (**`audit_logs`)Spoke DB (`schema.sql`)Preserved minimum `30 days` for integrity; historical entries older than `30 days` may be pruned by the Spoke's Wayfinder (`prune_old_audit_logs`). User UUIDs are stripped or tombstoned on Hub erasure.**Salted Security / Ban Hashes (**`hardware_bans`)Hub DBLegitimate interest / security defense exemption (`GDPR Art. 17(3)`): retained solely for active Tier 6 Malware bans or while voluntary Nuclear Override remains engaged.

### 9.3. Self-Service Account Deletion & Right to Erasure (`GDPR Art. 17` / `CCPA`)

1. **1-Click Self-Service Hub Deletion:** Open **Settings -&gt; Account & System -&gt; Delete Sanctuary Account** (or email `privacy@sanctuaryos.net` from your Blinded Email or via Support Ticket) to permanently delete your `Keepers Core` `auth.users` account, `user_passkeys`, encrypted `user_encrypted_keyrings`, and `citizen_staging_queue` rows.
2. **Spoke Erasure Propagation:** Because Sanctuary Foundry does **not** custody independent Partner Spoke databases (`Partners Agreement`), Hub deletion automatically revokes your Hub SSO session and sends a pseudonymous `erasure_Tombstone` notice to mounted Spokes to scrub any local `notification_state_sync`, personal blueprints, and profile links—while preserving anonymous verified mod hashes under public technical metadata. You may also request direct Spoke-level erasure from any Partner Community's `Wayfinder` via their Spoke Support Desk (SLA: `30 calendar days`).
3. **Export, Rectification & Non-Discrimination (**`GDPR Art. 15–21` **/** `CCPA`**):** You may export all local configurations, blueprints, and Dossiers offline in plain JSON anytime. Sanctuary Foundry never sells personal data (**zero "Do Not Sell" opt-out needed**), never profiles users for targeted ads, and never discriminates against users exercising privacy rights.

### 9.4. Governing Law, Zero-Knowledge Disclosure Boundary & Privacy Contact

- **Primary Legal Framework:** Governed by the laws of the **State of Florida** and applicable **United States federal law**, alongside compliance with applicable **GDPR / UK GDPR** (for EEA/UK data subjects, under `Art. 6(1)(b)` contract necessity and `Art. 6(1)(f)` security/anti-malware legitimate interest) and **CCPA/CPRA** rights.
- **Zero-Knowledge Subpoena & Statutory Reporting Boundary (**`18 U.S.C. § 2258A`**):** Sanctuary OS enforces cryptographic minimization (`600k` PBKDF2 `zk-*@blind.sanctuaryos.net` aliases, AES-256-GCM E2EE `citizen_staging_queue` payloads, and zero local Vault telemetry). Sanctuary Foundry never grants external third parties direct database read access, cannot decrypt client-sealed payloads, cannot inspect or remotely delete Citizen local files without consent (only blocking cloud indexing/uploads, with Quarantine Lockdown restricted strictly to **Tier** `6` **Malware** code threats), and can legally disclose or report under compulsory lawful process or mandatory `18 U.S.C. § 2258A` duties **only** the minimal public/cloud-submitted metadata actually in its possession (e.g., an offending Mason/Scout Queue submission URL or Storage image, SHA-256 hash, timestamp, and pseudonymous `UUID`). We cannot produce plaintext emails, local mod inventories, or keys we mathematically do not possess.
- **Privacy & Data Protection Contact:** Direct all GDPR, UK GDPR, COPPA/GDPR-K, and CCPA inquiries or formal erasure requests to `privacy@sanctuaryos.net` (target response SLA: **72 hours acknowledgement / 30 calendar days completion**).
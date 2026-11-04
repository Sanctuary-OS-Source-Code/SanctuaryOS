# Sanctuary OS — Privacy Policy

**Document Version:** V6.0 (v0.6.0-Dev.2)  
**Effective Date:** November 4, 2026  

---

## 1. Core Privacy Principle: Local-First Sovereignty & Zero Spyware
Sanctuary OS is engineered from the ground up on a **Local-First, Privacy-by-Design** architecture across Windows, macOS, Linux, SteamOS / Steam Deck, and Web/Mobile PWA:
* **Your Local Vault Stays Local:** Your local mod files, private Compliance Tier 1–4 configurations, save games, Mod Version History archives (`Backups/Mods/`), and Time Capsule snapshots reside on your local storage drive and are **never** uploaded to Sanctuary Foundry servers.
* **Zero Ad-Tech or Behavioral Tracking:** Sanctuary OS contains zero third-party advertising SDKs, zero cross-site tracking pixels, and never sells or rents Citizen data.

---

## 2. Decoupled Hub-and-Spoke Data Minimization
Sanctuary OS strictly isolates your authentication credentials from independent Community Game Spokes:
1. **Core OS Hub (`schema_os.sql` — Governed by Keepers Core):**
   - Stores your global account email, hashed authentication credentials (via Supabase Auth), chosen `username`, global role (`citizen` | `keeper`), and Supporter expiration timestamp (`dev_build_until`).
2. **Community Game Spokes (`schema.sql` — Governed by Community Wayfinders):**
   - When you mount a Community Game Spoke, `secure_sync_spoke_profile` synchronizes **only** your pseudonymous UUID (`id`), `username`, and Spoke-specific role (`citizen`, `mason`, `architect`, `oversight`, `wayfinder`).
   - **Zero Email or Password Bleed:** Your email address, password hash, and private authentication tokens are **never** stored in or shared with Community Spoke databases.

---

## 3. FIDO2 Passkeys, 12-Hour Device Seal & Cryptographic Authentication
For users holding Elevated Clearances (`Verified Mason` through `Keeper`), the **Security Vault (`auth.webauthn_credentials`)** stores only standard WebAuthn/FIDO2 public keys, credential IDs, and signature counters. Biometric data (such as Windows Hello facial/fingerprint templates, macOS Touch ID data, or Linux/SteamOS hardware key secrets) never leaves your device's hardware Secure Enclave / TPM. Successful FIDO2 verification issues a local **12-hour Device-Bound Cryptographic Passkey Seal (`sanctuary_passkey_seal_v2`)** on your trusted machine without storing biometric or hardware identifiers in the cloud.

---

## 4. Privacy-First Decoupled Hardware Ban Ledger (`hardware_bans`)
Sanctuary OS does **not** collect, log, or attach Hardware IDs (HWIDs) to standard Citizen accounts or profiles:
* When required by a security enforcement event, the Rust backend computes a **domain-salted one-way SHA-256 digest** (`"sanctuary-os-zero-pii-hwid-v1:"`) from the operating system UUID—never transmitting raw motherboard serials, MAC addresses, or hostnames—and blocks fallback placeholder strings (`unknown-hardware-id`) from ever causing false-positive collisions.
* This one-way hash is recorded in the decoupled `hardware_bans` table on the Core OS Hub **only** in two specific security events:
  1. You explicitly unlock and trigger the **Nuclear Override** in System Preferences after acknowledging the security warning; or
  2. Your account is permanently terminated by Oversight/Keepers for intentional **Compliance Tier 5 (Malware)** distribution or network attack.

---

## 5. Automatic Zero-PII Scrubbing Across Windows, macOS, Linux & SteamOS/Proton
When you use the **Homestead Lab** exception analyzer, share diagnostic snippets, or attach crash logs (`lastException.txt`, `lastUIException.txt`, etc.) to a **Citizen Support Desk** ticket:
* Sanctuary OS's proactive **Zero-PII Scrubber (`scrubLogUserData` / `obscure_username`)** automatically redacts local operating system file paths containing your account username across **Windows (`C:\Users\<Username>\`)**, **macOS (`/Users/<Username>/`)**, **Linux (`/home/<Username>/`, `/var/home/<Username>/`, `/run/media/<Username>/`, `/media/<Username>/`)**, and **SteamOS / Valve Proton prefixes (`drive_c/users/<Username>/`)** to `[REDACTED_USER]` before displaying or transmitting the log snippet.
* The scrubber also automatically redacts XML `<user>`, `<username>`, `<account>`, `<computername>`, and `<hostname>` tags, explicit `HWID` / `MachineId` / `DeviceId` / `Hostname` / `LocalIP` / `PublicIP` headers, MAC addresses (`[REDACTED_MAC]`), IPv4 and IPv6 addresses (`[REDACTED_IP]`), Windows Security Identifiers (`[REDACTED_SID]`), and email addresses (`[REDACTED_EMAIL]`).
* If you trigger a **Citizen-Signed Secure Shred** on a Tier 5 Malware file and leave **Anonymous Manifest Upload** enabled, only the file name, cryptographic SHA-256 DNA hash, and matched heuristic rule ID are transmitted to `quarantine_manifests`—zero personal identifiers are attached.

---

## 6. Zero-PII AES-256-GCM Mobile Companion Radar & Multi-Rig Blueprint Queue
When you use the **Mobile/Web Vault Companion Radar** or **Multi-Rig Blueprint Signature Queue (`citizen_staging_queue`)** to inspect your Vault health from your phone or deploy Blueprint changes across multiple computers (such as a Windows Desktop and a Steam Deck):
* All queued Blueprint diffs (`+Added` / `-Removing`) and Vault Companion snapshots are encrypted client-side using **AES-256-GCM** (`deriveKey` + random `IV` and `salt`) and indexed solely by a blinded one-way SHA-256 `user_token` with `item_count: 0`.
* Neither Sanctuary Foundry nor the Spoke database can read which mods you have installed or queued, and rows are automatically purged upon expiration or immediately shredded when you select **Shred After Deploy**.

---

## 7. Non-Custodial Payment Privacy
When you support a Mason or donate to a Partner Community Spoke, checkout occurs directly on the external payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`). Sanctuary OS never sees or stores your credit card number, bank details, or billing address. If automatic Supporter credit (`partner-donation-webhook`) is used, only a one-way SHA-256 transaction nonce (`donation_event_nonces`), your Citizen UUID, and the donation amount are processed to credit your `+30 days per $5` Supporter status—storing zero relational history of which Partner Community or Mason you supported.

---

## 8. Data Retention, Offline Operation & Account Deletion
* **100% Offline Capability:** You may use Sanctuary OS entirely offline (`Guest / Offline Local Mode`) to manage your Vault, Mod Version History, Load Order, Workbench configs, and Time Capsule backups without creating an account.
* **Right to Erasure:** You may request deletion of your Core OS Hub account at any time via the Support Desk or System Preferences, which permanently removes your authentication record and profile (excluding immutable security entries in `hardware_bans` resulting from prior Tier 5 malware violations).


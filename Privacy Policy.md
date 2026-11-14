# Sanctuary OS — Privacy Policy

**Document Version:** V6.1 (v0.6.0-Dev.13)  
**Effective Date:** November 14, 2026  

---

## 1. Core Privacy Principle: Local-First Sovereignty, Zero Anti-Cheat Hooks & Zero Spyware
Sanctuary OS is engineered from the ground up on a **Local-First, Privacy-by-Design** architecture across Windows, macOS, Linux, SteamOS / Steam Deck, and Web/Mobile PWA:
* **Your Local Vault Stays Local:** Your local mod files, private Compliance Tier 1–4 configurations, save games, externalized Homestead Lab save mirrors (`SanctuarySaveVault` & `Backups/.lab_save_vault`), Mod Version History archives (`Backups/Mods/`), and Time Capsule snapshots reside on your local storage drive and are **never** uploaded to Sanctuary Foundry servers.
* **Zero Spyware, Ad-Tech or Intrusive Process Hooks:** Sanctuary OS contains zero third-party advertising SDKs, zero cross-site tracking pixels, never sells or rents Citizen data, and uses strictly passive OS telemetry (`PROCESS_QUERY_LIMITED_INFORMATION`, zero process-memory scraping, and zero global keyloggers) during Homestead Lab verification.

---

## 2. Zero-Knowledge Auth, Blinded Emails & Decoupled Hub/Spoke Minimization
Sanctuary OS strictly isolates your authentication credentials from independent Community Game Spokes:
1. **Core OS Hub (`schema_os.sql` — Governed by Keepers Core):**
   - Protects passwords with client-side **OWASP 600,000-iteration `PBKDF2-HMAC-SHA256`** stretching (`zkpw2$`) before transmission (layered with server-side **Bcrypt**) and supports **600,000-iteration Blinded Email Aliases (`zk-...@blind.sanctuaryos.net`)** so plaintext passwords are never transmitted. Sensitive account columns are strictly isolated from public/peer queries.
2. **Community Game Spokes (`schema.sql` — Governed by Community Wayfinders):**
   - When you mount a Community Game Spoke, `secure_sync_spoke_profile` synchronizes **only** your pseudonymous UUID (`id`), `username`, Spoke-specific role (`citizen` through `wayfinder`), and optional domain-separated SHA-256 **`SRK1` Spoke Relink Commitment** (`sanctuary_internal.spoke_relink_commitments`) so you can safely claim your legacy profile if a Spoke ever cuts the cord.
   - **Zero Email or Password Bleed:** Your email address, password hash, and private OAuth/authentication tokens are **never** stored in or shared with Community Spoke databases.

---

## 3. FIDO2 Passkeys, Touch ID, Companion Handshake & 12-Hour Device Seal
For users enabling Citizen 2FA or holding Elevated Clearances (`Verified Mason` through `Keeper`), the **Security Vault (`user_passkeys`)** stores only standard WebAuthn/FIDO2 public keys, credential IDs, and monotonic signature counters (`signCount`), while local desktop passkey metadata is encrypted via **`AES-256-GCM`**. Biometric data (Windows Hello, macOS Touch ID, or hardware key secrets) never leaves your device's Secure Enclave / TPM. Successful verification issues a local **12-hour Device-Bound Cryptographic Passkey Seal (`sanctuary_passkey_seal_v2`)** or completes an ephemeral **Live Companion Passkey Handshake** (via W3C Web Push) without storing biometric or hardware identifiers in the cloud.

---

## 4. Privacy-First Decoupled Hardware Ban Ledger (`hardware_bans`)
Sanctuary OS does **not** collect, log, or attach Hardware IDs (HWIDs) to standard Citizen accounts or profiles:
* When required by a security enforcement event, the Rust backend computes a **domain-salted one-way SHA-256 digest** (`"sanctuary-os-zero-pii-hwid-v1:"`) from the operating system UUID—never transmitting raw motherboard serials, MAC addresses, or hostnames—and blocks fallback placeholder strings (`unknown-hardware-id`) from ever causing false-positive collisions.
* This one-way hash is recorded in the decoupled `hardware_bans` table on the Core OS Hub **only** when:
  1. You explicitly unlock and trigger the **Nuclear Override** in System Preferences after acknowledging the security warning; or
  2. Your account is permanently terminated by Oversight/Keepers for intentional **Compliance Tier 5 (Malware)** distribution or network attack.

---

## 5. Automatic Zero-PII Scrubbing Across Windows, macOS, Linux & SteamOS/Proton
When you use the **Homestead Lab** exception analyzer, share diagnostic snippets, or attach crash logs to a **Citizen Support Desk** ticket:
* Sanctuary OS's proactive **Zero-PII Scrubber (`scrubLogUserData` / `obscure_username`)** automatically redacts local operating system file paths containing your account username across **Windows (`C:\Users\<Username>\`)**, **macOS (`/Users/<Username>/`)**, **Linux (`/home/<Username>/`, `/var/home/<Username>/`, `/run/media/<Username>/`, `/media/<Username>/`)**, and **SteamOS / Valve Proton prefixes (`drive_c/users/<Username>/`)** to `[REDACTED_USER]` before displaying or transmitting the log snippet.
* The scrubber also redacts XML `<user>`, `<username>`, `<account>`, `<computername>`, and `<hostname>` tags, explicit `HWID` / `MachineId` / `DeviceId` / `Hostname` / `LocalIP` / `PublicIP` headers, MAC addresses (`[REDACTED_MAC]`), IPv4 and IPv6 addresses (`[REDACTED_IP]`), Windows Security Identifiers (`[REDACTED_SID]`), and email addresses (`[REDACTED_EMAIL]`).
* If you trigger a **Citizen-Signed Secure Shred** on a Tier 5 Malware file and leave **Share Malware Reports** enabled, only the file name, cryptographic SHA-256 DNA hash, and matched heuristic rule ID are transmitted to `quarantine_manifests`—zero personal identifiers are attached.

---

## 6. Zero-PII E2EE Multi-Rig Staging, Alert Sync & Mason Perk Sync (`citizen_staging_queue`)
When you synchronize state across multiple devices (Windows, macOS, Steam Deck, Web, and Mobile PWA) via `citizen_staging_queue`:
* **Personal Rig Blueprints, Mobile Vault Companion Radar, Once-Per-Account Notification Sync (`notification_state_sync`), and Multi-Rig Mason Support Sync (`supporter_vault_sync`)** are GZIP-compressed and encrypted client-side using **AES-256-GCM** (`deriveKey` + random `IV` and `salt`) and indexed solely by blinded one-way SHA-256 `user_token` digests—never transmitting plaintext mod lists, alert histories, or raw Patreon OAuth tokens.
* Neither Sanctuary Foundry nor the Spoke database can decrypt your staged payloads, and Blueprint transfer rows can be shredded immediately upon deployment (**Shred After Deploy**).

---

## 7. Non-Custodial Payment Privacy & Transparent Ledgers
When you support a Mason or donate to Sanctuary Foundry or a Partner Community Spoke, checkout occurs directly on the external payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`). Sanctuary OS never sees or stores your credit card number, bank details, or billing address. Verified webhooks (`partner-donation-webhook`) process only a one-way SHA-256 transaction nonce (`donation_event_nonces`), your Citizen UUID, and the paid amount to credit `+30 days per $5` of Supporter access and aggregate anonymous monthly operating ledger totals—storing zero relational history of which Partner Community or Mason you supported.

---

## 8. Data Retention, Offline Operation & Account Control
* **100% Offline Capability:** You may use Sanctuary OS entirely offline (`Guest / Offline Local Mode` or `Local Network Only` air-gap mode) to manage your Vault, Mod Version History, Load Order, Homestead Lab, Workbench configs, and Time Capsule backups without creating an account.

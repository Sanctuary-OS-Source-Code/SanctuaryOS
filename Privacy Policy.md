# Sanctuary OS — Privacy Policy

**Document Version:** V5.8 (v0.5.8-Dev.5)  
**Effective Date:** October 28, 2026  

---

## 1. Core Privacy Principle: Local-First Sovereignty & Zero Spyware
Sanctuary OS is engineered from the ground up on a **Local-First, Privacy-by-Design** architecture:
* **Your Local Vault Stays Local:** Your local mod files, private Compliance Tier 1–4 configurations, save games, and Time Capsule snapshots reside on your local storage drive and are **never** uploaded to Sanctuary Foundry servers.
* **Zero Ad-Tech or Behavioral Tracking:** Sanctuary OS contains zero third-party advertising SDKs, zero cross-site tracking pixels, and never sells or rents Citizen data.

---

## 2. Decoupled Hub-and-Spoke Data Minimization
Sanctuary OS strictly isolates your authentication credentials from independent Community Game Spokes:
1. **Core OS Hub (`schema_os.sql` — Governed by Keepers Core):**
   - Stores your global account email, hashed authentication credentials (via Supabase Auth), chosen `username`, global role (`citizen` | `keeper`), and Supporter expiration timestamp (`supporter_until`).
2. **Community Game Spokes (`schema.sql` — Governed by Community Wayfinders):**
   - When you mount a Community Game Spoke, `secure_sync_spoke_profile` synchronizes **only** your pseudonymous UUID (`id`), `username`, and Spoke-specific role (`citizen`, `mason`, `architect`, `oversight`, `wayfinder`).
   - **Zero Email or Password Bleed:** Your email address, password hash, and private authentication tokens are **never** stored in or shared with Community Spoke databases.

---

## 3. FIDO2 Passkeys & Cryptographic Authentication
For users holding Elevated Clearances (`Verified Mason` through `Keeper`), the **Security Vault (`user_passkeys`)** stores only standard WebAuthn/FIDO2 public keys, credential IDs, and signature counters. Biometric data (such as Windows Hello facial/fingerprint templates or macOS Touch ID data) never leaves your device's hardware Secure Enclave / TPM.

---

## 4. Privacy-First Decoupled Hardware Ban Ledger (`hardware_bans`)
Sanctuary OS does **not** collect, log, or attach Hardware IDs (HWIDs) to standard Citizen accounts or profiles:
* A one-way cryptographic hardware hash is generated and recorded in the decoupled `hardware_bans` table on the Core OS Hub **only** in two specific security events:
  1. You explicitly unlock and trigger the **Nuclear Override** in System Preferences after acknowledging the security warning; or
  2. Your account is permanently terminated by Oversight/Keepers for intentional **Compliance Tier 5 (Malware)** distribution or network attack.

---

## 5. Automatic PII Scrubbing in Crash Logs & Support Dossiers
When you use the **Homestead Lab** exception analyzer or attach diagnostic logs (`lastException.txt`, `lastUIException.txt`, etc.) to a **Citizen Support Desk** ticket:
* Sanctuary OS automatically scrubs local operating system file paths containing your Windows (`C:\Users\<Username>\`) or macOS (`/Users/<Username>/`) account name before displaying or transmitting the log snippet.
* If you trigger a **Citizen-Signed Secure Shred** on a Tier 5 Malware file and leave **Anonymous Manifest Upload** enabled, only the file name, cryptographic SHA-256 DNA hash, and matched heuristic rule ID are transmitted to `quarantine_manifests`—no personal identifiers are attached.

---

## 6. Non-Custodial Payment Privacy
When you support a Mason or donate to a Partner Community Spoke, checkout occurs directly on the external payment processor (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`). Sanctuary OS never sees or stores your credit card number, bank details, or billing address. If automatic Supporter credit (`partner-donation-webhook`) is used, only your pseudonymous Citizen UUID (`client_reference_id`), donation amount, and transaction receipt ID are verified to credit your `+30 days per $5` Supporter status.

---

## 7. Data Retention, Offline Operation & Account Deletion
* **100% Offline Capability:** You may use Sanctuary OS entirely offline (`Guest / Offline Local Mode`) to manage your Vault, Load Order, Workbench configs, and Time Capsule backups without creating an account.
* **Right to Erasure:** You may request deletion of your Core OS Hub account at any time via the Support Desk or System Preferences, which permanently removes your authentication record and profile (excluding immutable security entries in `hardware_bans` resulting from prior Tier 5 malware violations).


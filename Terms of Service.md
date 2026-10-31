# Sanctuary OS — Terms of Service (TOS)

**Document Version:** V5.8 (v0.5.8-Dev.5)  
**Effective Date:** October 28, 2026  

---

## 1. Acceptance of Terms & Hub-and-Spoke Ecosystem
By creating an account or connecting to the **Sanctuary OS** network, you agree to these Terms of Service ("Terms"), the [End-User License Agreement (EULA)](./EULA.md), the [Privacy Policy](./Privacy%20Policy.md), and the [Global Compliance Protocol](./Compliance%20Protocol.md).

Sanctuary OS operates as a **Federated Hub-and-Spoke Network**:
* **The Sanctuary OS Hub (`Keepers Core`):** Provides global Single Sign-On (SSO) identity, WebAuthn/FIDO2 Passkey verification, baseline malware heuristics (`keeper_heuristic_signatures`), and the Keepers Core Default Schema.
* **Community Game Spokes (`Wayfinders`):** Independent, community-owned Supabase databases (`schema.sql`) that govern game-specific mod registries, conflict rules, dispatches, themes, lexicons, and community moderation.

---

## 2. The 6-Tier Clearance Hierarchy & FIDO2 Security Vault
Access to network features is governed by the 6-Tier Clearance Matrix:
1. **Tier 1 — Citizen (`citizen`):** Access to all 9 Citizen modules, the local **Open Mason Workshop** (`Sandbox`, `IDE`, `3-Tile Artifact Studio`, `Theme Forge`, `Static Edge Export`), Cloud Blueprints, and Scout Queue submissions.
2. **Tier 2 — Verified Mason (`mason`):** Verified creator clearance unlocking direct Nexus metadata publishing, the Verified Mason Queue fast-lane, Public Mason Profiles, and the 0%-cut Supporter Bridge.
3. **Tier 3 — Architect (`architect`):** Spoke registry and conflict matrix moderator, Scout Queue reviewer, and Citizen Support Desk responder.
4. **Tier 4 — Oversight (`oversight`):** Spoke security administrator managing Spoke Heuristics, Tier 5 Malware flags, DEFCON 1 patch shields, and role assignments up to Architect.
5. **Tier 5 — Wayfinder (`wayfinder`):** Sovereign Spoke owner managing `Spoke Control`, `Spoke Aesthetics`, Master Schemas, Lexicons, Non-Custodial Community Donations, and unilateral **"Cut the Cord"** severance.
6. **Tier 6 — Keeper (`keeper`):** Sanctuary Foundry Core OS administrator.

**Mandatory FIDO2 / TOTP Verification:** Users holding Elevated Clearances (`Tier 2 Verified Mason` through `Tier 6 Keeper`) must bind a hardware/biometric **FIDO2 Passkey** or **TOTP Authenticator** via the **Security Vault SidePanel** to access administrative hubs.

---

## 3. Metadata-Only Registry & Creator Intellectual Property
1. **No Unauthorized Redistribution:** The Nexus indexes cryptographic SHA-256 / Blake3 DNA hashes, dependency rules, compatibility telemetry, Workbench config templates, Chameleon themes, and Lexicon dictionaries. Uploading or linking pirated, paywall-circumvented, or stolen creator assets is strictly prohibited.
2. **Creator Sovereignty:** Masons retain 100% ownership of their intellectual property, external download links, and Static Edge manifests (`manifest.json` / `override.json`).

---

## 4. The Florida Compliance Layer (Tiers 0–5) & Prohibited Conduct
All network submissions must adhere to the [Global Compliance Protocol](./Compliance%20Protocol.md):
* **Public Feeds Are Strictly Tier 0:** Public Nexus discovery feeds and shared Cloud Blueprints (`SNCXXX`) are restricted to **Compliance Tier 0 (Public Safe)** artifacts. Any hash flagged as **Tier 1–2 (Explicit / Illicit)** or **Tier 3–4 (Severe / Taboo)** is automatically scrubbed from public feeds and purged from Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`), though it remains usable in your private local Vault.
* **Zero Tolerance for Tier 5 Malware:** Intentionally submitting, disguising, or distributing **Compliance Tier 5 (Malware)**—including credential stealers, webhook exfiltrators, or unauthorized remote execution payloads—results in immediate permanent account termination and hardware-hash blacklisting (`hardware_bans`) across the entire Sanctuary network.

---

## 5. Non-Custodial Donations, Supporter Perks & 0% Platform Cut
1. **0% Platform Tax:** Sanctuary OS takes **0%** of Creator (`Mason`) supporter revenue and **0%** of Partner Community (`Spoke`) donations.
2. **Non-Custodial Third-Party Processors:** When you contribute to a Mason or a Partner Community Spoke (via `Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, or `OpenCollective`), your payment is processed directly by that recipient's third-party payment processor. Sanctuary Foundry never collects, holds, or custodies those funds and is not responsible for refunds, chargebacks, or tax receipts on third-party donations.
3. **Supporter Time Stacking (`+30 Days per $5`):** Verified contributions of `$5 USD` (or equivalent) to either Sanctuary Foundry or a participating Partner Community Spoke grant `+30 days` of **Global Dev Build** access and Supporter Badge recognition. Supporter perks are digital goodwill recognitions, have no cash surrender value, and are non-transferable.

---

## 6. Bilateral Spoke Sovereignty ("Cut the Cord")
Independent Community Spokes connected to the Sanctuary OS Hub are governed by the [Partners Agreement](./Partners%20Agreement.md). Either the Community's Wayfinder or Keepers Core may sever the Spoke Uplink at any time via **Cut the Cord** (`secure_sever_spoke_cord`), immediately scrubbing the Spoke's service key from the Hub while leaving 100% of the Community's Spoke database under the Community's sole control.


# Sanctuary OS — Terms of Service (TOS)

**Document Version:** V6.2 (v0.6.0-Dev.14)  
**Effective Date:** November 14, 2026  

---

## 1. Acceptance of Terms & Hub-and-Spoke Ecosystem
By creating an account or connecting to the **Sanctuary OS** network across Windows, macOS, Linux, SteamOS, or Web/Mobile PWA, you agree to these Terms of Service ("Terms"), the [End-User License Agreement (EULA)](./EULA.md), the [Privacy Policy](./Privacy%20Policy.md), and the [Global Compliance Protocol](./Compliance%20Protocol.md).

Sanctuary OS operates as a **Federated Hub-and-Spoke Network**:
* **The Sanctuary OS Hub (`Keepers Core`):** Provides global Zero-Knowledge Single Sign-On (SSO) identity, WebAuthn/FIDO2 Passkey verification, baseline malware heuristics (`keeper_heuristic_signatures`), Core Lexicons/Themes, and the Keepers Core Default Schema.
* **Community Game Spokes (`Wayfinders`):** Independent, community-owned Supabase databases (`schema.sql`) that govern game-specific mod registries, Highlander Exclusive Slots, conflict rules, dispatches, themes, lexicons, community donations, and moderation.

---

## 2. The 6-Tier Clearance Hierarchy & FIDO2 Security Vault
Access to network features is governed by the 6-Tier Clearance Matrix:
1. **Tier 1 — Citizen (`citizen`):** Access to all 9 Citizen modules (including the `Blueprint Patch Readiness Simulator`), the local **Open Mason Workshop** (`Sandbox`, `IDE`, `3-Tile Artifact Studio`, `Theme Forge`, `Lexicon Studio`, local JSON export/import, and `Static Edge Export` + Auto-Push), **Cloud Blueprints (`Public`, `Unlisted`, `Private`)** (strictly non-media JSON loadouts of cryptographic DNA hashes and compatibility version strings), and Scout Queue submissions (`_lab_cert_proof`). Citizens have **no public user profile pages, no peer-to-peer direct messaging (DMs), no open Comm-Link posting privileges, and no cloud Nexus Asset upload privileges**.
2. **Tier 2 — Verified Mason (`mason`):** FIDO2-authenticated verified creator clearance unlocking **Comm-Link Creator Changelog & Release Dispatches**, **Cloud Nexus Asset Uploads** (`Mods`, `Lexicons`, `Chameleons`, `Workbench Templates`, and `Collections`), the Verified Mason Queue fast-lane, Public Creator Profiles, and the 0%-cut Supporter Bridge. Both the **Comm-Link dispatch hardgate** and the **Cloud Nexus Asset upload hardgate (minus Blueprints)** are Core OS architecture rules that **Partner Spokes cannot override**.
3. **Tier 3 — Architect (`architect`):** Spoke Tier-0 registry, Exclusive Slot, Known Error, and conflict matrix moderator, Scout/Mason Queue reviewer, and Citizen Support Desk responder (strictly isolated to Tier 0 without ban or active compliance lock authority).
4. **Tier 4 — Oversight (`oversight`):** Spoke security administrator managing Spoke Heuristics, `Pending` Tier 1–4 Compliance confirmation & Tier 5 Malware blacklisting, DEFCON 1 patch shields, read/export-only Audit Log review, and role assignments up to Architect.
5. **Tier 5 — Wayfinder (`wayfinder`):** Sovereign Spoke owner managing `Spoke Control`, `Spoke Aesthetics`, Master Schemas, Lexicons, 100% isolated Non-Custodial Community Donations, and unilateral **"Cut the Cord"** severance.
6. **Tier 6 — Keeper (`keeper`):** Sanctuary Foundry Core OS administrator (strictly isolated from Partner Spoke operations beyond compliance severance and `Keepers-Only` dev-spoke staging).

**Mandatory FIDO2 Passkey Step-Up & 12-Hour Device Seal:** Users holding Elevated Clearances (`Tier 2 Verified Mason` through `Tier 6 Keeper`) must bind a hardware/biometric **FIDO2 Passkey** (Windows Hello, macOS Touch ID, hardware security key, or Companion Passkey Handshake) or **TOTP Authenticator** via the **Security Vault SidePanel**. Accessing Elevated Hubs or modifying account credentials requires an active per-session FIDO2 verification or a valid **12-hour Device-Bound Cryptographic Passkey Seal (`sanctuary_passkey_seal_v2`)**. Pre-release Development Builds (`-Dev`) additionally enforce the **Dev Build Clearance Gate**.

---

## 3. Platform Classification, Statutory Exemptions & Minor Safety
Sanctuary OS is architected specifically as **local-first technical software, developer tooling, cybersecurity middleware, and a creator-to-subscriber release dispatch tool**—not as an open social media network, commercial storefront, or third-party file-hosting site:

1. **Technical Software, Developer Tooling & Middleware Classification (Not a Storefront, File Host, or Social Media Platform):**
   - Sanctuary OS operates as a **local-first configuration compiler, Symlink Airgap manager, conflict/heuristic analyzer, and developer IDE/Workbench**. Sanctuary Foundry does not sell goods or digital content (**0% platform cut**, strictly optional third-party non-custodial donations), does not host or distribute third-party game binaries or mod archives, and does not provide open public social feeds, algorithmic engagement timelines, or private user-to-user messaging.
2. **Comm-Link as a Verified Creator Changelog & Release Dispatch Channel (Non-Overridable Hardgate):**
   - **Comm-Link** (`mason_posts`) functions strictly as a **Verified Creator Changelog & Release Dispatch Channel** for patch notes, version advisories, and compatibility announcements tied to registered software artifacts. There are **no general Citizen user profiles, no peer-to-peer DMs, and no open Citizen social posting**.
   - **Mandatory Verified Mason Hardgate:** Publishing top-level Comm-Link dispatches is strictly locked at the Core gateway (`game-gateway`) and Spoke database RLS layer to **Verified Masons** and authorized Spoke staff. **Partner Spokes (`Wayfinders`) cannot override, weaken, or disable this Verified Mason hardgate.**
3. **Nexus Asset Uploads Locked to Verified Masons (Minus Blueprints — Non-Overridable Hardgate):**
   - Cloud **Nexus Asset uploads** (`nexus_assets` — **Chameleon Themes**, **Sparse Delta Lexicons**, and **Workbench Configuration Templates** — along with **Collections** and Cloud Mod Registry definitions) are strictly locked to **Verified Masons** (requiring FIDO2/Passkey step-up authentication) and authorized Spoke staff. **Partner Spokes (`Wayfinders`) cannot override, bypass, or disable this Verified Mason hardgate.**
   - **Narrow Citizen Blueprint Exception:** Citizen-shareable **Cloud Blueprints (`SNCXXX`)** contain exclusively structured JSON configuration metadata (cryptographic SHA-256/Blake3 DNA hashes, slot identifiers, and game-version compatibility strings) with **zero uploaded binary files, zero executable scripts, and zero user-uploaded images or media**, and remain automatically subject to database Tier 0 compliance purging (`trg_purge_flagged_hash_from_blueprints`).
4. **Minor Safety, Age Eligibility & Strict Public Tier-0 Airgap:**
   - **Minimum Age Eligibility:** Standard Citizen network accounts require a minimum age of **13 years old** (or the higher minimum digital-consent age in your jurisdiction, such as `13–16` under GDPR). Elevated Creator and Staff clearances (**Tier 2 Verified Mason** through **Tier 6 Keeper**) require users to be **18 years of age or older** (or the age of legal majority in their jurisdiction) and pass hardware/biometric FIDO2 Passkey verification.
   - **Structural Minor Protection Without Invasive Surveillance:** Rather than harvesting government IDs or facial-biometric scans, Sanctuary OS protects minors structurally: **(a)** zero public Citizen user profiles, zero stranger direct messaging, and zero open social posting, **(b)** non-overridable Verified Mason hardgates on Comm-Link dispatches and cloud Nexus Asset uploads (minus non-media hash Blueprints), and **(c)** strict **Compliance Tier 0 (Public Safe)** filtering on all public endpoints (automatically scrubbing Tiers 1–4 and Quarantine Tier 5 from The Nexus, Comm-Link, and Cloud Blueprints).

---

## 4. Metadata-Only Registry, Content-Addressed Themes & Creator IP
1. **No Unauthorized Redistribution:** The Nexus indexes cryptographic SHA-256 / Blake3 DNA hashes, dependency rules, compatibility telemetry, Workbench config templates, Sparse Delta Lexicons, and content-addressed Chameleon themes (`<= 250 KB` WebP wallpapers or external HTTPS URLs). Uploading or linking pirated, paywall-circumvented, or stolen creator assets is strictly prohibited.
2. **Creator Sovereignty:** Masons retain 100% ownership of their intellectual property, external download links, and Static Edge manifests (`.sanctuary.manifest.json` / `catalog.json` / `.sanctuary.override.json`).

---

## 5. The Florida Compliance Layer (Tiers 0–5), Pending Confirmation & Prohibited Conduct
All network submissions must adhere to the [Global Compliance Protocol](./Compliance%20Protocol.md):
* **Public Feeds & Architect Console Are Strictly Tier 0:** Public Nexus discovery feeds, the Tier 3 **Architect Console**, and shared Cloud Blueprints (`SNCXXX`) are restricted exclusively to **Compliance Tier 0 (Public Safe)** artifacts. Any hash flagged as **Tier 1–4** routes into **Oversight Command -> Compliance** as `Pending`; once confirmed by `Oversight` or `Wayfinder`, it is scrubbed from public feeds and purged from Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`), while remaining usable in your private local Vault, Personal Rig transfers, and decentralized Static Edge Manifests.
* **Zero Tolerance for Tier 5 Malware:** Intentionally submitting, disguising, or distributing **Compliance Tier 5 (Malware)**—including credential stealers, webhook exfiltrators, or unauthorized remote execution payloads—results in immediate permanent account termination and domain-salted SHA-256 hardware-hash blacklisting (`hardware_bans`) across the entire Sanctuary network.

---

## 6. Non-Custodial Donations, Supporter Perks & 0% Platform Cut
1. **0% Platform Tax:** Sanctuary OS takes **0%** of Creator (`Mason`) supporter revenue and **0%** of Partner Community (`Spoke`) donations.
2. **Non-Custodial Third-Party Processors:** When you contribute to a Mason or a Partner Community Spoke (via `Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, or `OpenCollective`), your payment is processed directly by that recipient's third-party payment processor. Sanctuary Foundry never collects, holds, or custodies those funds and is not responsible for refunds, chargebacks, or tax receipts on third-party donations.
3. **Supporter Time Stacking (`+30 Days per $5`):** Verified paid contributions of `$5 USD` (or equivalent) to either Sanctuary Foundry or a participating Partner Community Spoke grant `+30 days` of **Global Dev Build** access and Supporter Badge recognition. Supporter perks are digital goodwill recognitions, have no cash surrender value, and are non-transferable.

---

## 7. Bilateral Spoke Sovereignty ("Cut the Cord") & `SRK1` Profile Relinking
Independent Community Spokes connected to the Sanctuary OS Hub are governed by the [Partners Agreement](./Partners%20Agreement.md). Either the Community's Wayfinder or Keepers Core may sever the Spoke Uplink at any time via **Cut the Cord** (`sever_spoke_cord`), revoking all active Spoke Gateway Tokens (`spk_gw_*`) on the Spoke and permanently purging the Hub's sealed Vault credential from `sanctuary_internal.spoke_credentials` while leaving 100% of the Community's Spoke database under the Community's sole control and enabling cryptographic **`SRK1` Spoke Relink** profile claiming for returning users.
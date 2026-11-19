# Sanctuary OS — Terms of Service (TOS)

**Effective Date:** November 18, 2026

---

## 1. Acceptance of Terms & Hub-and-Spoke Ecosystem

By creating an account or connecting to the **Sanctuary OS** hosted network across Windows, macOS, Linux, SteamOS, or Web/Mobile PWA, you agree to these Terms of Service ("Terms"), the [End-User License Agreement & GPLv3 Notice](./EULA.md), the [Privacy Policy](./Privacy%20Policy.md), and the [Global Compliance Protocol](./Compliance%20Protocol.md). Local offline use and derivative forks of the software remain governed irrevocably by [GNU GPLv3](./LICENSE).

Sanctuary OS operates as a **Federated Hub-and-Spoke Network**:

- **The Sanctuary OS Hub (**`Keepers Core`**):** Provides global Zero-Knowledge Single Sign-On (SSO) identity, WebAuthn/FIDO2 Passkey verification, baseline malware heuristics (`keeper_heuristic_signatures`), Core Lexicons/Themes, the Keepers Core Default Schema, and the statutory **DMCA Compliance Audit Log** (`dmca_compliance_notices`).
- **Community Game Spokes (**`Wayfinders`**):** Independent, community-owned Supabase databases (`schema.sql`) that govern game-specific mod registries, Highlander Exclusive Slots, conflict rules, `public.taxonomy` categories, dispatches, themes, lexicons, community donations, and local moderation/DMCA triage.

---

## 2. The 6-Tier Clearance Hierarchy & FIDO2 Security Vault

Access to network features is governed by the 6-Tier Clearance Matrix:

1. **Tier 1 — Citizen (**`citizen`**):** Access to all 9 Citizen modules (including the `Blueprint Patch Readiness Simulator`, `Save Doctor`, and `Creator Airlock`), the local **Open Mason Workshop** (`Sandbox`, `Mason IDE`, `3-Tile Artifact Studio`, `Theme Forge`, `Lexicon Studio`, local JSON export/import, and `Static Edge Export` + Auto-Push), **Cloud Blueprints (**`Public`**,** `Unlisted`**,** `Private`**)** (strictly non-media JSON loadouts of cryptographic DNA hashes and compatibility version strings), and Scout Queue submissions (`_lab_cert_proof`). Citizens have **no public user profile pages, no peer-to-peer direct messaging (DMs), no open Comm-Link posting privileges, and no cloud Nexus Asset upload privileges**.
2. **Tier 2 — Verified Mason (**`mason`**):** FIDO2-authenticated verified creator clearance (`18+`) unlocking **Comm-Link Creator Changelog & Release Dispatches**, **Cloud Nexus Asset Uploads** (`Mods`, `Lexicons`, `Chameleons`, `Workbench Templates`, and `Collections`), the Verified Mason Queue fast-lane, Public Creator Profiles, and the 0%-cut Supporter Bridge. Both the **Comm-Link dispatch hardgate** and the **Cloud Nexus Asset upload hardgate (minus Blueprints)** are Core OS architecture rules that **Partner Spokes cannot override**.
3. **Tier 3 — Architect (**`architect`**):** Spoke Tier-0 registry, Exclusive Slot, Known Error, and conflict matrix moderator, Scout/Mason Queue reviewer, and Citizen Support Desk responder (strictly isolated to Tier 0 without ban or active compliance lock authority).
4. **Tier 4 — Oversight (**`oversight`**):** Spoke security administrator managing Spoke Heuristics, `Pending` Tier 1–5 Compliance confirmation (including Spoke-forwarded **Tier 1 Legal / DMCA Holds**) & **Tier 6 Malware** blacklisting, DEFCON 1 patch shields, read/export-only Audit Log review, and role assignments up to Architect.
5. **Tier 5 — Wayfinder (**`wayfinder`**):** Sovereign Spoke owner managing `Spoke Control`, `Spoke Aesthetics`, Master Schemas, Lexicons, Spoke DMCA & compliance SLA adherence, 100% isolated Non-Custodial Community Donations, and unilateral **"Cut the Cord"** severance.
6. **Tier 6 — Keeper (**`keeper`**):** Sanctuary Foundry Core OS administrator (strictly isolated from Partner Spoke operations beyond Keepers Core compliance/DMCA SLA oversight, bilateral severance, and `Keepers-Only` dev-spoke staging).

**Mandatory FIDO2 Passkey Step-Up & 12-Hour Device Seal:** Users holding Elevated Clearances (`Tier 2 Verified Mason` through `Tier 6 Keeper`) must bind a hardware/biometric **FIDO2 Passkey** (Windows Hello, macOS Touch ID, hardware security key, or Companion Passkey Handshake) or **TOTP Authenticator** via the **Security Vault SidePanel**. Accessing Elevated Hubs or modifying account credentials requires an active per-session FIDO2 verification or a valid **12-hour Device-Bound Cryptographic Passkey Seal (**`sanctuary_passkey_seal_v2`**)**. Pre-release Development Builds (`-Dev`) additionally enforce the **Dev Build Clearance Gate**.

---

## 3. Platform Classification, Statutory Exemptions & Minor Safety

Sanctuary OS is architected specifically as **local-first technical software, developer tooling, cybersecurity middleware, and a creator-to-subscriber release dispatch tool**—not as an open social media network, commercial storefront, or third-party file-hosting site:

1. **Technical Software, Developer Tooling & Middleware Classification:**
   - Sanctuary OS operates as a **local-first configuration compiler, Symlink Airgap manager, conflict/heuristic analyzer, and developer IDE/Workbench**. Sanctuary Foundry does not sell goods or digital content (**0% platform cut**, strictly optional third-party non-custodial donations), does not host or distribute third-party game binaries or mod archives, and does not provide open public social feeds, algorithmic engagement timelines, or private user-to-user messaging.
2. **Comm-Link as a Verified Creator Changelog & Release Dispatch Channel (Non-Overridable Hardgate):**
   - **Comm-Link** (`mason_posts`) functions strictly as a **Verified Creator Changelog & Release Dispatch Channel** for patch notes, version advisories, and compatibility announcements tied to registered software artifacts. There are **no general Citizen user profiles, no peer-to-peer DMs, and no open Citizen social posting**.
   - **Mandatory Verified Mason Hardgate:** Publishing top-level Comm-Link dispatches is strictly locked at the Core gateway (`game-gateway`) and Spoke database RLS layer to **Verified Masons** and authorized Spoke staff. **Partner Spokes (**`Wayfinders`**) cannot override, weaken, or disable this Verified Mason hardgate.**
3. **Nexus Asset Uploads Locked to Verified Masons (Minus Blueprints — Non-Overridable Hardgate):**
   - Cloud **Nexus Asset uploads** (`nexus_assets` — **Chameleon Themes**, **Sparse Delta Lexicons**, and **Workbench Configuration Templates** — along with **Collections** and Cloud Mod Registry definitions) are strictly locked to **Verified Masons** (requiring FIDO2/Passkey step-up authentication) and authorized Spoke staff. **Partner Spokes (**`Wayfinders`**) cannot override, bypass, or disable this Verified Mason hardgate.**
   - **Narrow Citizen Blueprint Exception:** Citizen-shareable **Cloud Blueprints (**`SNCXXX`**)** contain exclusively structured JSON configuration metadata (cryptographic SHA-256 DNA hashes, slot identifiers, and game-version compatibility strings) with **zero uploaded binary files, zero executable code, and zero user-uploaded images or media**, and remain automatically subject to database Tier 0 compliance purging (`trg_purge_flagged_hash_from_blueprints`).
4. **Minor Safety, Age Eligibility & Strict Public Tier-0 Airgap:**
   - **Minimum Age Eligibility:** Standard Citizen network accounts require a minimum age of **13 years old** (or the higher minimum digital-consent age in your jurisdiction, such as `13–16` under GDPR). Elevated Creator and Staff clearances (**Tier 2 Verified Mason** through **Tier 6 Keeper**) require users to be **18 years of age or older** (or the age of legal majority in their jurisdiction) and pass hardware/biometric FIDO2 Passkey verification per our Zero-ID vetting procedure ([Verified Mason & Spoke Governance SOP](./Docs/verified_mason_and_spoke_governance_sop.md)).
   - **Structural Minor Protection Without Invasive Surveillance:** Rather than harvesting government IDs or facial-biometric scans, Sanctuary OS protects minors structurally: **(a)** zero public Citizen user profiles, zero stranger direct messaging, and zero open social posting, **(b)** non-overridable Verified Mason hardgates on Comm-Link dispatches and cloud Nexus Asset uploads (minus non-media hash Blueprints), and **(c)** strict **Compliance Tier 0 (Public Safe)** filtering on all public endpoints (automatically scrubbing **Tiers 1–5** and Quarantine **Tier 6** from The Nexus, Comm-Link, and Cloud Blueprints).

---

## 4. Metadata-Only Registry, Content-Addressed Themes & Creator IP

1. **No Unauthorized Redistribution:** The Nexus indexes cryptographic SHA-256 DNA hashes, dependency rules, compatibility telemetry, Workbench config templates, Sparse Delta Lexicons, and content-addressed Chameleon themes (`<= 250 KB` WebP wallpapers or external HTTPS URLs). Uploading or linking pirated, paywall-circumvented, or stolen creator assets is strictly prohibited.
2. **Creator Sovereignty:** Masons retain 100% ownership of their intellectual property, external download links, and Static Edge manifests (`.sanctuary.manifest.json` / `catalog.json` / `.sanctuary.override.json`).

---

## 5. Compliance Tiers (0–6), Spoke-Routed DMCA & Appeals

All network submissions must adhere to the [Global Compliance Protocol](./Compliance%20Protocol.md) and our governance SOPs:

- **Compliance Tiers 0–6 Matrix:**
  - **Tier 0 (**`Clean / Public Safe`**):** Exclusively permitted across public Nexus discovery feeds, Comm-Link, Tier 3 **Architect Console**, and shared Cloud Blueprints (`SNCXXX`).
  - **Tier 1 (**`Legal / DMCA Hold`**):** Validated `17 U.S.C. § 512(c)(3)` takedown holds. DMCA notices are logged immutably on Keepers Core (`public.dmca_compliance_notices` with AES-256-GCM sealed claimant contact info) and **forwarded directly to the responsible Partner Spoke's Oversight / Wayfinder queue under a 48-hour SLA**; soft-hidden (`compliance_tier = 1`, public Blueprint hashes stripped) during the 10–14 business day § 512(g)(3) counter-notice window per our [DMCA & Ownership Dispute SOP](./Docs/dmca_and_ownership_dispute_sop.md). **Three uncontested DMCA strikes (**`§ 512(i)`**) automatically revoke cloud publishing privileges.**
  - **Tiers 2–5 (**`Explicit`**,** `Illicit`**,** `Extreme Violence`**,** `Taboo`**):** Any hash flagged as Tier 2–5 routes into **Oversight Command -&gt; Compliance** as `Pending`; once confirmed by `Oversight` or `Wayfinder`, it is scrubbed from public feeds and purged from Cloud Blueprints (`trg_purge_flagged_hash_from_blueprints`), while remaining usable in private local Vaults, Zero-PII Personal Rig transfers, and decentralized Static Edge Manifests (Tiers 4–5 also engage the non-destructive Active Blueprint Support Lock on Community Mod Support while leaving Keeper OS Bug Reports open).
  - **Tier 6 (**`Confirmed Malware` **— Zero Tolerance):** Intentionally submitting, disguising, or distributing **Compliance Tier 6 (Malware)**—including credential stealers, webhook exfiltrators, or unauthorized remote execution payloads—results in immediate permanent account termination and domain-salted SHA-256 hardware-hash blacklisting (`hardware_bans`) across the entire Sanctuary network.
- **Moderation Appeals & False-Positive Remediation:** Citizens, Masons, and Partner Spokes may appeal misclassifications, false-positive heuristic quarantines, repeat-infringer strikes, or account restrictions under the SLAs defined in the [Moderation Appeals & Remediation SOP](./Docs/moderation_appeals_and_remediation_sop.md).

---

## 6. Non-Custodial Donations, Supporter Perks & 0% Platform Cut

1. **0% Platform Tax:** Sanctuary OS takes **0%** of Creator (`Mason`) supporter revenue and **0%** of Partner Community (`Spoke`) donations.
2. **Non-Custodial Third-Party Processors:** When you contribute to a Mason or a Partner Community Spoke (via `Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, or `OpenCollective`), your payment is processed directly by that recipient's third-party payment processor. Sanctuary Foundry never collects, holds, or custodies those funds and is not responsible for refunds, chargebacks, or tax receipts on third-party donations.
3. **Supporter Time Stacking (**`+30 Days per $5`**):** Verified paid contributions of `$5 USD` (or equivalent) to either Sanctuary Foundry or a participating Partner Community Spoke grant `+30 days` of **Global Dev Build** access and Supporter Badge recognition. Supporter perks are digital goodwill recognitions, have no cash surrender value, and are non-transferable.

---

## 7. Bilateral Spoke Sovereignty ("Cut the Cord") & `SRK1` Profile Relinking

Independent Community Spokes connected to the Sanctuary OS Hub are governed by the [Partners Agreement](./Partners%20Agreement.md). Either the Community's Wayfinder or Keepers Core may sever the Spoke Uplink at any time via **Cut the Cord** (`sever_spoke_cord`), revoking all active Spoke Gateway Tokens (`spk_gw_*`) on the Spoke and permanently purging the Hub's sealed Vault credential from `sanctuary_internal.spoke_credentials` while leaving 100% of the Community's Spoke database under the Community's sole control and enabling cryptographic `SRK1` **Spoke Relink** profile claiming for returning users.

---

## 8. Governing Law, Venue, Severability & Legal Contact

- **Governing Law & Venue:** These Terms and your use of the Official Sanctuary OS Hub services are governed by the laws of the **State of Florida** and applicable **United States federal law** (including the Digital Millennium Copyright Act, `17 U.S.C. § 512`), excluding conflict-of-law rules. Where you are a consumer in the EEA, UK, or another jurisdiction with mandatory consumer protection or privacy statutes, nothing in these Terms deprives you of non-waivable statutory rights under your local law.
- **Severability & Entire Network Covenant:** If any provision of these Terms is held invalid or unenforceable, the remaining provisions continue in full force.
- **Legal, DMCA & Governance Contacts:**
  - General Legal & Terms: `legal@sanctuaryos.net`
  - Designated DMCA Notices: `dmca@sanctuaryos.net` (see [DMCA & Ownership Dispute SOP](./Docs/dmca_and_ownership_dispute_sop.md))
  - Security & Vulnerability Reports: `security@sanctuaryos.net` (see `SECURITY.md`)
  - Privacy & Data Subject Erasure: `privacy@sanctuaryos.net` (see `Privacy Policy.md`)
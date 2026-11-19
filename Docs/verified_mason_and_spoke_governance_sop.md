# Verified Mason Onboarding (`18+` Zero-ID) & Spoke Succession SOP

**Effective Date:** November 18, 2026 | **Document ID:** `SOP-GOV-03 (V1.0)`

---

## 1. Zero-ID `18+` Verified Mason Onboarding (`Tier 2`)

Sanctuary OS grants **Open Mason Workshop** creator tools (Sandbox, IDE, 3-Tile Studio, Theme Forge, Edge Direct Push) to every Citizen out of the box. Upgrading to **Tier `2` — Verified Mason** unlocks verified public showcase pages, direct Nexus submission fast-lanes, Comm-Link broadcasts, and `0%`-cut Supporter Bridges **without invasive identity harvesting**.

### Privacy-First Eligibility & Vetting Steps
1. **Zero Government ID Collection:** Sanctuary OS **never collects, stores, or transmits passports, driver's licenses, selfies, or KYC documents**.
2. **Cryptographic `18+` Attestation:** During Verified Mason application, the applicant executes an explicit signed declaration confirming they are at least **18 years of age** (or age of majority in their jurisdiction) and legally competent to publish mods and link independent third-party supporter accounts under [Terms of Service](../Terms%20of%20Service.md).
3. **Mandatory Hardware-Backed Security (`Zero-Knowledge Seal`):** Applicant binds at least one **WebAuthn FIDO2 Passkey** (Windows Hello, Apple Touch ID, or YubiKey) or **TOTP authenticator** inside the Security Vault drawer before elevated tokens activate.
4. **Portfolio & Original Authorship Check:** Spoke **Architect** / **Oversight** officers verify at least **two original public or Scout-verified artifacts**, matching creator URLs / `.sanctuary.manifest.sig` Ed25519 keys where applicable, and zero unresolved Tier `1` DMCA strikes or Tier `6` Malware incidents.

### `0%`-Cut Creator Economics & Signing Best Practices
- **Non-Custodial Supporter Links:** Masons connect external Patreon, Ko-fi, GitHub Sponsors, or Stripe/BuyMeACoffee links with **0% Sanctuary cut** (zero payment routing through Keepers Core).
- **Ed25519 Manifest Signing:** Verified Masons are encouraged to sign release manifests (`sanctuary-manifest.sig`) inside **Mason Studio -> Release Channels** (`Stable` / `Beta` / `Alpha`) so Citizen rigs pin authentic creator keys (TOFU verification).

---

## 2. Partner Spoke Readiness Checklist

Before Keepers Core approves a new community **Partner Spoke** (`sanctuary_games`) application:
1. **Database Validation (`schema.sql`):** Community supplies a dedicated Supabase project with all **`61` tables**, RLS policies, `schema_migrations`, and minted `spk_gw_*` token passing the `game-gateway` handshake.
2. **Master Game Schema Readiness:** Active `sanctuary_schemas` definition (selected from the **27 engine presets** or bespoke JSON) validated cleanly against Keepers Core `default.json` plus populated `public.taxonomy` categories.
3. **Governance Coverage:** Named Founding **Wayfinder (`Tier 5`)** with FIDO2 passkey bound, clear moderation readiness (`Tier 3–4` coverage plan), `48h` Tier `1` DMCA SLA acceptance, and `0%` platform-fee non-custodial donation alignment.
4. **Covenant Acceptance:** Founding Wayfinder signs both the [Compliance Protocol](../Compliance%20Protocol.md) and [Partners Agreement](../Partners%20Agreement.md).

---

## 3. Wayfinder Succession & Abandoned Spoke Protocol

Because every Partner Spoke community independently owns its Supabase database and moderation tree, Keepers Core enforces a strict, predictable **Wayfinder Succession Protocol** that prevents deadlocked communities without seizing community databases:

### A. Planned Succession (Voluntary Handoff)
1. Existing **Wayfinder** promotes one or more trusted **Oversight** officers or peer creators to `wayfinder` inside the Spoke Identity Matrix (FIDO2 Passkey confirmation required).
2. Outgoing Wayfinder optionally rotates `spk_gw_*` via **Rotate Gateway Token**, confirms billing ownership of the underlying Supabase project has transferred at the host layer, and demotes their own role cleanly.

### B. Unplanned Abandonment (`60+` Days Inactivity + Unresolved Trigger)
A Partner Spoke enters **Abandoned Spoke Review** only if **ALL** of the following occur:
- All listed `wayfinder` and `oversight` accounts show **zero governance activity for `>= 60` consecutive days**; AND
- Either (i) an unresolved **Tier `1` DMCA notice** breaches the `48h` SLA, (ii) an active **Tier `6` Malware** incident remains unaddressed on the Spoke catalog, or (iii) at least **two** active Spoke **Architects** or `>50` active Citizens petition Keepers Core for continuity.

### Step-by-Step Resolution (Zero Data Seizure)
1. **7-Day Direct Outreach Notice:** Keepers Core sends formal written notice via registered contacts (`sanctuary_games` metadata + `audit_logs` alert banner) granting **7 calendar days** for an existing Wayfinder to respond.
2. **Community-Validated Succession:** If unreachable after 7 days and an active Spoke co-administrator exists on the Spoke team, Keepers Core coordinates with remaining active Spoke leadership (`Oversight` / `Architect`) to validate an interim `wayfinder` promotion—or instructs the community on linking their database cleanly to a new Wayfinder-controlled Supabase fork (`SANCTUARY-UPLINK://` + `sanctuary.fork.json`).
3. **Clean Federation Freeze (`Cut the Cord` Fallback):** If the underlying Supabase database itself is unreachable, deleted, or abandoned in breach of statutory Tier `1` DMCA SLAs after notice, Keepers Core executes `is_active = false` severance (`audit_logs` + sealed credential purge). **Keepers Core never seizes, copies, or hijacks community mod tables—100% of existing Spoke data remains the community's own property.**

# Sanctuary OS: Community Partners Agreement & Sovereignty Covenant

> **Document Version:** V6.2 (v0.6.0-Dev.14)  
> **Last Updated:** November 14, 2026  
> **Classification:** Legal & Operational Governance Covenant  
> **Scope:** Keepers Core (Sanctuary OS Hub) & Sovereign Community Spokes (Wayfinders)

This **Partners Agreement** establishes the operational, technical, and legal relationship between the **Sanctuary OS Core Team ("Keepers Core" / "Sanctuary Foundry")** and independent **Game Community Operators ("Wayfinders")** who connect a Spoke database to the Sanctuary OS ecosystem across Windows, macOS, Linux, SteamOS, and Web/Mobile PWA.

---

## 1. Foundational Principle: 100% Spoke Data & Donation Sovereignty

Sanctuary OS is architected on a strict **Hub-and-Spoke Sovereignty Model**:

1. **Community Ownership:** The Community (represented by its Founding Wayfinder) provisions, owns, and controls its own Supabase PostgreSQL instance ("The Spoke") initialized via [`schema.sql`](./schema.sql) (including `citizen_staging_queue` for Zero-PII AES-256-GCM Multi-Rig Blueprint Queueing, Mobile Companion Radar, Cross-Device Alert Sync & Mason Support Sync, and `sanctuary_internal.spoke_relink_commitments` for Spin-Off profile relinking).
2. **Zero Hostage Data:** All community mod registries (`mods`, `mod_versions`), Highlander Exclusive Slots (`flavor_groups`), dependency matrices, creator profiles (`masons`), blueprints, collections, Spoke Master Schemas (`sanctuary_schemas`), Sparse Delta Spoke Lexicons (`sanctuary_lexicons`), Chameleon themes (`sanctuary_themes`), support tickets, and dispatches reside physically inside the Community's Spoke database—never locked inside a proprietary central silo.
3. **Decoupled Governance & Full Donation Isolation:** Roles granted within a Spoke (`wayfinder`, `oversight`, `architect`, `mason`, `citizen`) apply strictly to that game workspace. Partner Community donation endpoints and monthly infrastructure ledgers are governed **100% exclusively by the Spoke's Wayfinder** (`wayfinder_update_spoke_donations` + Postgres `protect_spoke_donation_fields` triggers)—Keepers Core has zero UI or database write access to Partner Spoke donation settings and takes a **0% platform cut**.

---

## 2. Streamlined Spoke Uplink & Server-Only Secret Vault Custody

1. **Turnkey Uplink Handshake (`SANCTUARY-UPLINK://`):**
   - To connect a Spoke to the Sanctuary OS Hub, the Wayfinder provides a secret-free Spoke Uplink Bundle (Project URL and Anon/Publishable Key) alongside a **Scoped Spoke Gateway Token** (`spk_gw_*`, minted via `SELECT public.mint_spoke_gateway_token();` inside `sanctuary_internal.spoke_gateway_tokens` after running `schema.sql`) via **Keepers Core** or **Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance**.
   - During the automated handshake (`verify_and_bootstrap_spoke`), the Hub verifies `schema.sql` table readiness, initializes the Spoke's network status, and provisions the Founding Wayfinder's role. Private staging/dev Spokes can also be cloaked from public discovery via **`is_keepers_only`**.
2. **Split-Custody Double-Envelope Vault Protection (`sanctuary_internal.spoke_credentials` + Vault KMS):**
   - Plaintext Spoke `service_role` keys are never stored in `public.sanctuary_games` or any client-exposed table. Instead, the Spoke's `spk_gw_*` token is sealed via **HKDF-SHA256 + AES-256-GCM** with bound Associated Authenticated Data (`sanctuary-spoke-aad:v1|<game_id>|<schema_id>|<supabase_url>`), keyed by the Edge-only **`SPOKE_VAULT_MASTER_KEY`** secret, and wrapped inside Supabase Vault (`vault.secrets`) under `service_role`-only `sanctuary_internal.spoke_credentials`—so neither a SQL database dump alone nor an Edge secret leak alone exposes any Spoke credential, and credentials are **never transmitted to client devices** or exported inside `SANCTUARY-UPLINK://` bundles.
   - All privileged Spoke queries (`spoke_query` / `spoke_query_batch`) and mutations are proxied server-side through the `game-gateway` Edge Function using `x-sanctuary-spoke-token` HMAC verification (`sanctuary_internal.is_verified_hub_gateway()`) after verifying the caller's Hub JWT and Spoke clearance.
3. **Zero-Downtime Key & Token Rotation:**
   - A Wayfinder or Keeper may click **Rotate Gateway Token** (`rotate_spoke_gateway_token` / `mint_spoke_gateway_token` with a 60-second grace window) or rotate their Spoke's `anon` / `sb_publishable_*` keys at any time directly from **Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance** (`update_spoke_uplink`), immediately invalidating stale tokens and cached gateway clients without dropping live connections.

---

## 3. High-Friction Bilateral "Cut the Cord" & Cryptographic `SRK1` Relink

Both the Community (Wayfinder) and the Sanctuary OS Core Team (Keepers) hold an unconditional, unilateral right to **Cut the Cord** at any time, without penalty, fee, or lock-in:

### A. Community-Initiated Severance (Wayfinder Self-Service)
- A Spoke's Wayfinder can execute **Cut the Cord** directly inside **Wayfinder Operations -> Spoke Control -> Spoke Sever (Cut the Cord)** via a high-friction `<SidePanel>` safeguard (`"CUT THE CORD"` phrase verification lock + 2-step 6-second armed confirmation + pre-severance `Copy Uplink Bundle` backup).
- **Immediate Technical Effect:**
  1. An immutable audit record (`Community Executed Cut the Cord (Severed Uplink)`) is written to both the Spoke's `audit_logs` and the Hub's `audit_logs`.
  2. The Spoke's entry in `public.sanctuary_games` is immediately set to `is_active = false`.
  3. All active Spoke Gateway Tokens are **immediately revoked** on the Spoke (`revoke_spoke_gateway_tokens`) and the Hub's sealed envelope credential is **permanently purged** from `sanctuary_internal.spoke_credentials` + Supabase Vault, revoking Hub administrative access instantly.
  4. The Community retains 100% of its Supabase database, tables, and community records intact, may paste its `SANCTUARY-UPLINK://` bundle into `src/supabase.ts` to run as an independent Standalone Fork, and allows returning Citizens, Masons, and Staff to safely claim their historical profiles using **Cryptographic `SRK1` Spoke Relink Tokens** (`SRK1.<hub_uuid>.<relink_secret>`) without username hijacking.

### B. Keeper-Initiated Severance (Core OS Protection)
- Keepers may execute the identical phrase-locked **Cut the Cord** safeguard from **Keepers Core -> Partner Spokes** if a Spoke violates mandatory safety covenants (such as distributing Tier 5 malware, refusing to quarantine illegal/Tier 5 artifacts, attempting to bypass or disable the non-overridable Verified Mason hardgates or Tier-0 minor-safety airgap, or abusing network infrastructure).

---

## 4. Non-Negotiable Safety & Compliance Covenants

While Communities enjoy broad autonomy over their Spoke's taxonomy, Master Schema, Chameleon themes, Lexicons, and creator ecosystems, participation in the connected Sanctuary OS Network requires adherence to four non-negotiable baseline standards:

1. **Core Antivirus & Malware Heuristics (`keeper_heuristic_signatures`):**
   - Keepers Core maintains a global baseline of malware, remote-code-execution (RCE), and credential-stealer signatures. Connected clients enforce both Core Heuristics and Spoke Heuristics (`heuristic_signatures`) during local Radar Sweeps and file ingestion, triggering the Full-OS Quarantine SidePanel Lockdown on Tier 5 detections.
2. **Compliance Protocol Enforcement (Tiers 0–5):**
   - Communities must enforce the [Compliance Protocol](./Compliance%20Protocol.md) classification tiers. Specifically, **Tier 1–2 (Explicit / Illicit)**, **Tier 3–4 (Severe / Restricted)**, and **Tier 5 (Confirmed Malware)** artifacts must never be promoted in public Tier-0 discovery feeds, `Pending` Tier 1–4 escalations must be reviewed in **Oversight Command -> Compliance**, and `trg_purge_flagged_hash_from_blueprints` must remain active to strip confirmed non-Tier-0 hashes from shared Cloud Blueprints.
3. **Non-Overridable Verified Mason Hardgates, Platform Classification & Minor Safety:**
   - **Comm-Link as Verified Creator Dispatch Channel Only:** Spoke Comm-Link feeds (`mason_posts`) operate strictly as a **Verified Creator Changelog & Release Dispatch Channel** with no general Citizen user profiles, no peer-to-peer direct messaging (DMs), and no open Citizen social posting. **Partner Spokes cannot override, weaken, or disable the Verified Mason hardgate** enforcing Comm-Link dispatch publishing (`owns_verified_mason` + Core `game-gateway`).
   - **Nexus Asset Uploads Locked to Verified Masons (Minus Blueprints):** All cloud **Nexus Asset uploads** (`nexus_assets` — Chameleons, Sparse Delta Lexicons, Workbench Templates — alongside Collections and Cloud Mod Registry records) remain strictly hard-locked to FIDO2-authenticated **Verified Masons** and authorized Spoke Staff (`is_verified_mason_or_staff()` + Core `game-gateway`). **Partner Spokes cannot override or bypass this Verified Mason hardgate.** Only non-media JSON **Cloud Blueprints (`SNCXXX`)** (containing solely cryptographic DNA hashes and compatibility version strings) remain open to Citizens.
   - **No Storefront, Binary Host, or Social Repurposing:** Partners shall never repurpose Sanctuary Spoke tables, RPCs, or branding to operate an unverified user social media network, binary mod-file hosting repository, or custodial storefront, and must enforce `18+` adult majority for Verified Creator and Staff clearances alongside `13+` (or jurisdictional minimum) Citizen eligibility and strict Tier-0 minor safety.
4. **Append-Only Audit Integrity:**
   - Spoke `audit_logs` must remain append-only and un-prunable across governance operations so moderation, patch, and compliance actions maintain a verifiable community record.
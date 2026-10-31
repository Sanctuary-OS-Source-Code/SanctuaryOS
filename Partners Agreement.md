# Sanctuary OS: Community Partners Agreement & Sovereignty Covenant

> **Document Version:** V0.5.8 (v0.5.8-Dev.5)  
> **Last Updated:** October 28, 2026  
> **Classification:** Legal & Operational Governance Covenant  
> **Scope:** Keepers Core (Sanctuary OS Hub) & Sovereign Community Spokes (Wayfinders)

This **Partners Agreement** establishes the operational, technical, and legal relationship between the **Sanctuary OS Core Team ("Keepers Core" / "Sanctuary Foundry")** and independent **Game Community Operators ("Wayfinders")** who connect a Spoke database to the Sanctuary OS ecosystem.

---

## 1. Foundational Principle: 100% Spoke Data Sovereignty

Sanctuary OS is architected on a strict **Hub-and-Spoke Sovereignty Model**:

1. **Community Ownership:** The Community (represented by its Founding Wayfinder) provisions, owns, and controls its own Supabase PostgreSQL instance ("The Spoke") initialized via [`schema.sql`](./schema.sql) (36 tables).
2. **Zero Hostage Data:** All community mod registries (`mods`, `mod_versions`), dependency matrices, creator profiles (`masons`), blueprints, collections, Spoke Master Schemas (`sanctuary_schemas`), Spoke Lexicons (`sanctuary_lexicons`), Chameleon themes (`sanctuary_themes`), support tickets, and dispatches reside physically inside the Community's Spoke database—never locked inside a proprietary central silo.
3. **Decoupled Governance & Branding:** Roles granted within a Spoke (`wayfinder`, `oversight`, `architect`, `mason`, `citizen`) are stored locally in the Spoke's `profiles` table and apply strictly to that game workspace. Spoke Master Schemas and Lexicons carry the Community Spoke's own identity and attribution inside **Wayfinder Operations -> Spoke Control** and **Spoke Aesthetics**.

---

## 2. Streamlined Spoke Uplink & Key Custody

1. **Turnkey Uplink Handshake (`SANCTUARY-UPLINK://`):**
   - To connect a Spoke to the Sanctuary OS Hub, the Wayfinder provides a Spoke Uplink Bundle (or configures their Project URL, Anon Key, and Service Role Key via **Keepers Core** or **Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance**).
   - During the automated handshake (`verify_and_bootstrap_spoke`), the Hub verifies `schema.sql` table readiness, initializes the Spoke's network status, and provisions the Founding Wayfinder's role.
2. **Service Role Key Protection:**
   - The Spoke's `supabase_service_key` is stored strictly in the Hub's protected `sanctuary_games` registry and is **never transmitted to client devices** during workspace synchronization (`syncGameDatabases`).
   - All privileged Spoke mutations are proxied server-side through the `game-gateway` Edge Function after verifying the caller's Hub JWT and Spoke clearance.
3. **Live Key Rotation:**
   - A Wayfinder may rotate their Spoke's `anon` and `service_role` keys at any time directly from **Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance** (`update_spoke_uplink`).

---

## 3. Bilateral "Cut the Cord" (Severance Protocol)

Both the Community (Wayfinder) and the Sanctuary OS Core Team (Keepers) hold an unconditional, unilateral right to **Cut the Cord** at any time, without penalty, fee, or lock-in:

### A. Community-Initiated Severance (Wayfinder Self-Service)
- A Spoke's Wayfinder can execute **Cut the Cord** directly inside **Wayfinder Operations -> Spoke Control -> Spoke Sever (Cut the Cord)** with a double-click confirmation.
- **Immediate Technical Effect:**
  1. An immutable audit record (`Community Executed Cut the Cord (Severed Uplink)`) is written to both the Spoke's `audit_logs` and the Hub's `audit_logs`.
  2. The Spoke's entry in the Hub's `sanctuary_games` table is immediately set to `is_active = false`.
  3. The Spoke's `supabase_service_key` is **permanently scrubbed (`NULL`ed)** from the Hub database, revoking the Hub's administrative write access instantly.
  4. The Community retains 100% of its Supabase database, tables, and community records intact, and may immediately paste its `SANCTUARY-UPLINK://` bundle into `src/supabase.ts` to run as an independent Standalone Fork.

### B. Keeper-Initiated Severance (Core OS Protection)
- Keepers may execute **Cut the Cord** from **Keepers Core -> Active Workspaces** if a Spoke violates mandatory safety covenants (such as distributing Tier 5 malware, refusing to quarantine illegal/Tier 5 artifacts, or abusing network infrastructure).

---

## 4. Non-Negotiable Safety & Compliance Covenants

While Communities enjoy broad autonomy over their Spoke's taxonomy, Master Schema, Chameleon themes, Lexicons, and creator ecosystems, participation in the connected Sanctuary OS Network requires adherence to three non-negotiable baseline standards:

1. **Core Antivirus & Malware Heuristics (`keeper_heuristic_signatures`):**
   - Keepers Core maintains a global baseline of malware, remote-code-execution (RCE), and credential-stealer signatures. Connected clients enforce both Core Heuristics and Spoke Heuristics (`heuristic_signatures`) during local Radar Sweeps and file ingestion, triggering the Full-OS Quarantine SidePanel Lockdown on Tier 5 detections.
2. **Compliance Protocol Enforcement (Tiers 0–5):**
   - Communities must enforce the [Compliance Protocol](./Compliance%20Protocol.md) classification tiers. Specifically, **Tier 1–2 (Explicit / Illicit)**, **Tier 3–4 (Severe / Restricted)**, and **Tier 5 (Confirmed Malware)** artifacts must never be promoted in public Tier-0 discovery feeds, and the automated database trigger (`trg_purge_flagged_hash_from_blueprints`) must remain active to strip flagged hashes from shared Cloud Blueprints.
3. **Append-Only Audit Integrity:**
   - The `ensure_audit_log_immutability` PostgreSQL trigger on `audit_logs` must not be disabled or bypassed. Administrative actions, DEFCON changes, and compliance flags must remain transparent and auditable.

---

## 5. Non-Custodial Community Donations, Creator Independence & 0% Platform Tax

1. **Zero Platform Tax (`0% Sanctuary Cut`):**
   - Sanctuary OS takes **0%** of Mason (Creator) Patreon, Ko-fi, Stripe, or website revenue, and **0%** of Partner Community donations.
2. **Direct Non-Custodial Community Checkout (`Wayfinder Operations -> Spoke Control -> Non-Custodial Community Donations`):**
   - Partner Communities may configure their own direct payment processor link (`Stripe`, `Ko-fi`, `Patreon`, `PayPal`, `Fourthwall`, `OpenCollective`, or custom URL).
   - 100% of Citizen contributions flow directly to the Partner Community's own merchant account. Sanctuary Foundry never touches, holds, or custodies Partner funds, and the Partner Community remains solely responsible for its own payment processor fees, taxes, refunds, and chargebacks.
3. **Mutual Supporter Perk Recognition (`+30 Days per $5`):**
   - As a goodwill ecosystem benefit, every `$5` a Citizen donates to a verified Partner Community Spoke (verified via `partner-donation-webhook` or receipt verification) automatically grants that Citizen **+30 days of Global Dev Build access** and Supporter Badge recognition across Sanctuary OS.
4. **Direct Creator Attribution:**
   - Every mod, collection, blueprint, and Chameleon theme links directly to the Mason's verified external channels (`patreon_url`, `website_url`, `discord_url`, `donations_url`).

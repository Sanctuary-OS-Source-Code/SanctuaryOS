# Sanctuary OS: Community Partners Agreement & Sovereignty Covenant

> **Document Version**: V0.5.7  
> **Classification**: Legal & Operational Governance Covenant  
> **Scope**: Keepers Core (Sanctuary OS Hub) & Sovereign Community Spokes (Wayfinders)

This **Partners Agreement** establishes the operational, technical, and legal relationship between the **Sanctuary OS Core Team ("Keepers")** and independent **Game Community Operators ("Wayfinders")** who connect a Spoke database to the Sanctuary OS ecosystem.

---

## 1. Foundational Principle: 100% Spoke Data Sovereignty

Sanctuary OS is architected on a strict **Hub-and-Spoke Sovereignty Model**:

1. **Community Ownership**: The Community (represented by its Founding Wayfinder) provisions, owns, and controls its own Supabase PostgreSQL instance ("The Spoke") initialized via [`schema.sql`](./schema.sql).
2. **Zero Hostage Data**: All community mod registries (`mods`, `mod_versions`), dependency matrices, creator profiles (`masons`), blueprints, collections, Chameleon themes, support tickets, and dispatches reside physically inside the Community's Spoke database—never locked inside a proprietary central silo.
3. **Decoupled Governance**: Roles granted within a Spoke (`wayfinder`, `oversight`, `architect`, `mason`) are stored locally in the Spoke's `profiles` table and apply strictly to that game workspace.

---

## 2. Streamlined Spoke Uplink & Key Custody

1. **Turnkey Uplink Handshake (`SANCTUARY-UPLINK://`)**:
   - To connect a Spoke to the Sanctuary OS Hub, the Wayfinder provides a Spoke Uplink Bundle (or configures their Project URL, Anon Key, and Service Role Key via **Keepers Core / Wayfinder Hub**).
   - During the automated handshake (`verify_and_bootstrap_spoke`), the Hub verifies `schema.sql` table readiness, initializes the Spoke's network status, and provisions the Founding Wayfinder's role.
2. **Service Role Key Protection**:
   - The Spoke's `supabase_service_key` is stored strictly in the Hub's protected `sanctuary_games` registry and is **never transmitted to client devices** during workspace synchronization (`syncGameDatabases`).
   - All privileged Spoke mutations are proxied server-side through the `game-gateway` Edge Function after verifying the caller's Hub JWT and Spoke clearance.
3. **Live Key Rotation**:
   - A Wayfinder may rotate their Spoke's `anon` and `service_role` keys at any time directly from **Wayfinder Hub -> Spoke Uplink & Sovereignty** (`update_spoke_uplink`).

---

## 3. Bilateral "Cut the Cord" (Severance Protocol)

Both the Community (Wayfinder) and the Sanctuary OS Core Team (Keepers) hold an unconditional, unilateral right to **Cut the Cord** at any time, without penalty or lock-in:

### A. Community-Initiated Severance (Wayfinder Self-Service)
- A Spoke's Wayfinder can execute **Cut the Cord** directly inside **Wayfinder Hub -> Spoke Uplink & Sovereignty** (`ServerHealthSidePanel`) with a double-click confirmation.
- **Immediate Technical Effect**:
  1. An immutable audit record (`Community Executed Cut the Cord (Severed Uplink)`) is written to both the Spoke's `audit_logs` and the Hub's `audit_logs`.
  2. The Spoke's entry in the Hub's `sanctuary_games` table is immediately set to `is_active = false`.
  3. The Spoke's `supabase_service_key` is **permanently scrubbed (`NULL`ed)** from the Hub database, revoking the Hub's administrative write access instantly.
  4. The Community retains 100% of its Supabase database, tables, and community records intact.

### B. Keeper-Initiated Severance (Core OS Protection)
- Keepers may execute **Cut the Cord** from **Keepers Core -> Active Workspaces** if a Spoke violates mandatory safety covenants (e.g., distributing malware, refusing to quarantine CSAM/illegal Tier 5 artifacts, or abusing network infrastructure).

---

## 4. Non-Negotiable Safety & Compliance Covenants

While Communities enjoy broad autonomy over their Spoke's taxonomy, themes, lexicons, and creator ecosystems, participation in the connected Sanctuary OS Network requires adherence to three non-negotiable baseline standards:

1. **Core Antivirus & Malware Heuristics (`keeper_heuristic_signatures`)**:
   - Keepers Core maintains a global baseline of malware, remote-code-execution (RCE), and credential-stealer signatures. Connected clients enforce both Core Heuristics and Spoke Heuristics (`heuristic_signatures`) during local Deep Scans.
2. **Compliance Protocol Enforcement (Tiers 0–5)**:
   - Communities must enforce the [Compliance Protocol](./Compliance%20Protocol.md) classification tiers. Specifically, **Tier 3 (Quarantined / Severe)**, **Tier 4 (Restricted / Extreme)**, and **Tier 5 (Blacklisted / Illegal / Malware)** artifacts must never be promoted in public discovery feeds, and the automated database trigger (`trg_purge_flagged_hash_from_blueprints`) must remain active to strip flagged hashes from shared Blueprints.
3. **Append-Only Audit Integrity**:
   - The `ensure_audit_log_immutability` PostgreSQL trigger on `audit_logs` must not be disabled or bypassed. Administrative actions, DEFCON changes, and compliance flags must remain transparent and auditable.

---

## 5. Financial & Creator Independence

1. **Zero Platform Tax**: Sanctuary OS takes **0%** of Mason (Creator) Patreon, Ko-fi, or website revenue, and **0%** of Community donations.
2. **Direct Attribution**: Every mod, collection, blueprint, and Chameleon theme links directly to the Mason's verified external links (`patreon_url`, `website_url`, `discord_url`).
# Sanctuary OS: Executive & Partner Community Pitch Matrix

## Executive Positioning

The PC modding ecosystem is caught between two unsustainable extremes:
* **Private-Equity Platform Consolidation:** Centralized multi-terabyte CDNs (Chosen's rollup of Nexus Mods + SteamDB; Overwolf's CurseForge) forced to throttle free users, cap automated modpack downloads, lock down third-party APIs, inject adware overlays, or monetize telemetry to pay petabyte bandwidth bills.
* **Fragmented Hobbyist Utilities:** Single-game, Windows-bound local tools lacking cross-platform parity, pre-ingest bytecode malware heuristics, save airgapping, or sustainable community governance.

**Sanctuary OS** is a sovereign, local-first desktop middleware and federated **Hub-and-Spoke** ecosystem engineered on four non-negotiable pillars:
1. **No Binary Asset Hosting (Metadata-Only Static Edge)**
2. **0% Platform Tax & Non-Custodial Creator Economics**
3. **Statutory Technical Tool Classification & Dual-Tier Safety**
4. **Cryptographic User Privacy & Phrase-Locked Community Secession ("Cut the Cord")**

---

## Ecosystem Strategic Comparison Matrix

| Strategic Pillar | Centralized CDNs (Nexus Mods / Chosen, CurseForge / Overwolf) | Legacy Local Managers (MO2, S4MM, BG3MM, r2modman) | Sanctuary OS (Keepers Core + Sovereign Partner Spokes) |
| :--- | :--- | :--- | :--- |
| **Infrastructure & Bandwidth Liability** | Multi-petabyte binary hosting forcing ~3 MB/s speed caps, Collection download quotas, or Overwolf video ads | $0 cloud cost, but zero live metadata registry, cloud threat sync, or cross-device queueing | **$0 Binary Asset Hosting:** Indexes lightweight SHA-256 metadata, schemas & conflict rules; static `.sanctuary.manifest.json` edge polling |
| **Creator & Community Monetization** | Platform revenue splits, locked Donation Point pools, or ad-gated launcher APIs | No native creator attribution feed or community infrastructure funding rails | **0% Platform Cut (Non-Custodial):** Direct Stripe/Ko-fi/Patreon links; `$5 = +30 Days` Global Dev Builds; public monthly Cost vs. Spending ledgers |
| **Data Ownership & Governance** | 100% platform-owned database; top-down policy shifts; zero community exit path | Isolated local `.ini`/`.txt`/`.lsx` files; no shared community verification pipeline | **100% Spoke Sovereignty (`schema.sql`):** Community owns its 52-table Supabase DB, roles, schemas & themes with unilateral **"Cut the Cord"** exit |
| **Cross-Platform & Handheld Reach** | Windows-centric clients (Nexus canceled cross-platform app Jan 2026; CurseForge restricts Linux launchers) | Windows-bound USVFS hooks (MO2) or single-OS tools requiring Wine hacks on Steam Deck | **Single Unified Codebase:** Native Windows (`.exe`/`.msi`), macOS (`.dmg`), Linux / SteamOS (`.AppImage` + Deck Overdrive), Web & Mobile PWA |
| **Malware & Supply-Chain Security** | Reactive upload scans; vulnerable to hijacked accounts & unscanned modpack `overrides/` ZIPs | Zero built-in bytecode inspection; host AV frequently blocks MO2's own DLL injector | **Local Rust Bytecode Hound + Lab Gate:** Pre-ingest Zlib/Zstd stream, `> 8 MiB` sliding-window & `.pyc`/`.7z`/`.rar` inspection, Zero-Choice Lockdown & mandatory Sandbox boot proof |
| **Regulatory & Content Compliance** | Blunt site-wide bans vs. unmoderated liability exposure and DMCA takedown abuse | Unfiltered local tools with unscrubbed PII inside shared crash logs | **Dual-Tier Architecture:** Statutory Technical Tool classification; Florida Compliance Tiers 0–5 filter public cloud feeds while keeping local Vaults 100% sovereign |
| **Identity & Subpoena Minimization** | Plaintext email profiles, download histories, IP logs & local build telemetry | Local-only (but crash logs frequently leak Windows/macOS OS usernames) | **Zero-Knowledge Seal:** 600k PBKDF2 Blinded Emails, FIDO2 Passkeys, AES-256-GCM queues & automatic crash-log PII scrubbing |

---

## Core Value Propositions for Stakeholders & Partner Spokes ("Wayfinders")

### 1. Eliminating the Bandwidth Trap ($0 Petabyte Liability)
* Centralized repositories drown in server bills whenever automated modpacks scale—forcing Nexus Mods to cap free Collection auto-downloads (September 2026) and CurseForge to enforce Overwolf ad views.
* Because Sanctuary OS indexes **declarative Master Schemas, cryptographic SHA-256 hashes, and atomic conflict directives** while creators push updates via 6-provider **Edge Direct Push** (GitHub/Cloudflare Pages, Gist, GitLab/Codeberg, Neocities, WebDAV, or Local Synced Folders), operating costs remain tiny, predictable, and publicly audited.

### 2. True Community Sovereignty, Split-Custody & "Cut the Cord" Exit
* **5-Minute Spoke Provisioning:** Partner game communities (**Wayfinders**) create their own Supabase project, run the turnkey 52-table `schema.sql` script, mint a scoped `spk_gw_...` gateway token (`SELECT public.mint_spoke_gateway_token();`), and link via a secret-free `SANCTUARY-UPLINK://` bundle sealed inside Keepers Core's **Split-Custody Double-Envelope Vault** (`HKDF-SHA256 + AES-256-GCM`).
* **Three Seamless Fork Modes:** Communities can operate as an **Official Partner Spoke** (zero code edits), launch a **1-File Standalone Fork** (single `schema.sql` database editing only `SANCTUARY_CONFIG` in `src/supabase.ts` with zero Edge Functions), or self-host a **Full Multi-Game Federation Fork** (`schema_os.sql` + `schema.sql`).
* **Credible Exit & Cryptographic Profile Relinking (`SRK1`):** At any time, a Wayfinder can execute the phrase-locked **"CUT THE CORD"** protocol in Wayfinder Operations—revoking all gateway tokens, purging Hub Vault credentials, and detaching cleanly with 100% of their community database intact. Returning Citizens and Masons reclaim their legacy Spoke profiles without username hijacking via cryptographic `SRK1.<uuid>.<secret>` relink commitments.

### 3. 0%-Cut Non-Custodial Economics & Transparent Ledgers
* Sanctuary Foundry takes **0% of Mason (creator) or Partner Spoke revenue** and never custodies community funds (`protect_spoke_donation_fields` Postgres triggers restrict donation endpoints strictly to the Spoke's Wayfinder).
* Verified Stripe and Ko-fi webhooks update locked `YYYY-MM` **6-Card Cost vs. Spending Ledgers** (*Gross Contributions, Processor Fees, Net Received, Prior Cycle Carryover, Operating Cost, and Remaining Surplus*) and automatically credit Citizens **+30 days of Global Daily Dev Builds per $5 contributed** across Windows, macOS, and Linux / SteamOS.

### 4. 6-Tier Role Governance & Dual-Tier Compliance Isolation
* **Strict Clearance Separation:** Decouples Core Hub roles from Spoke clearances across 6 tiers (*Citizen -> Verified Mason -> Architect -> Oversight -> Wayfinder -> Keeper*), gated from Tier 2 upward by hardware/biometric **FIDO2 Passkeys**.
* **Safe Public Discovery + Uncensored Local Vaults:** Architects curate strictly **Compliance Tier 0** public records; Tier 1–4 adult or sensitive records are isolated from public Nexus feeds and stripped from shared Cloud Blueprints automatically (while remaining 100% functional via decentralized Static Edge manifests inside a Citizen's private local Vault); **Tier 5 Malware** triggers immediate network-wide neutralization.
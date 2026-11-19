# Sanctuary OS (`sanctuary-os`)

> **Don't Be Evil. Advise, Never Dictate. Chronological By Design.**

[![License: GNU GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)

Sanctuary OS is a **100% game-agnostic, local-first, non-destructive modding operating system** licensed under **GNU GPLv3** and built with **Tauri v2 (Rust)**, **React 19 + TypeScript**, **SQLite / CoW snapshots**, and an optional federated **Supabase Keepers Core / Partner Spoke** backend.

Instead of hardcoding single-game assumptions, proprietary accounts, or paid cloud lock-ins, every engine's file extensions, OS paths, load-order strategies, binary container TOCs, crash log matchers, save airgap targets, and mod categories are driven declaratively by a **Master Schema** (`GameSchema` with **27 built-in engine presets** + relational `public.taxonomy` / `public.dlc_registry` / `public.known_exception_rules`).

---

## Core Architecture & Capabilities

- **Zero-Scan Cartographer & Non-Destructive VFS (`src-tauri/src/`):** Discovers Windows/macOS/Linux/Steam Deck Proton storefronts natively, runs **Cloud-Sync Folder Sentinel** checks (OneDrive/iCloud/Dropbox), stages mods inside your isolated `{Vault}`, deploys transactional symlinks/junctions (`mklink /J`) backed by `.sanctuary_deploy_journal.jsonl` / `.sanctuary_routed_links.jsonl` WAL crash recovery, and isolates vanilla game roots (`mods_dir_is_shared_with_vanilla`).
- **Topological Load Order Engine & Conflict Radar 2.0:** Solves Master/Dependency DAGs across `folder_priority`, `manifest_list` (INI, JSON, XML, BG3 `modsettings.lsx`, Bethesda `plugins.txt`), `numeric_prefix`, and `timestamp`; enforces schema `slot_buckets` (including Starfield `0x0800` Medium Masters and `0x0200` ESLs); inspects `.bsa`/`.ba2`, `LSPK`, Unreal `.pak`/`.utoc`, `RDAR`, `RPF7`, `TES4` FormID streams, and `selector_path` configs; imports LOOT YAML/JSON rules; and supports per-file VFS masking (`.sanctuary_hidden.json`).
- **The Quartermaster, Rosetta Protocol & Zero-Copy Exodus:** Interactive UTF-8/UTF-16 FOMOD (`ModuleConfig.xml`) and BAIN installer wizards with `.sanctuary_fomod_choices.json` reload, Modrinth `.mrpack` / CurseForge `manifest.json` / Nexus `collection.json` / `.wabbajack` conversion, and hardlink migration from Mod Organizer 2, Vortex, BG3MM, and r2modman/Gale.
- **Homestead Lab, Save Doctor & Creator Airlock:** Sandboxed test launches with save airgapping (opt-in OFF cloud certificates by default), binary/JSON save-header inspection before launch, external tool session airlock cleanup, and multi-root crash autopsy across logs and Proton prefixes.
- **ByteHound v3 & Compliance Tiers 0–6:** Pure-Rust `.zip`/`.7z`/`.rar` extraction, sliding-window streaming auditing for `> 8 MiB` assets, structural PE/ELF/Mach-O/LNK masquerade detection, sealed OS keyring / BYO API Key Broker storage (`DPAPI` / `AES-256-GCM`), opt-in Zero-PII threat hash sharing, and federated **Tier 0–6** classification (`0: Clean`, `1: Spoke-Routed Legal / DMCA`, `2–5: Explicit..Taboo`, `6: Malware`).
- **Sovereign Federation & 100% Offline Support:** Bundle-free fonts (`@fontsource-variable/*` + `material-symbols`), **7,300+** dynamic `{Glossary}` lexicon keys (`en-default` + Sparse Delta Overrides), strict **Local Network Only** airgap mode, live `SANCTUARY-UPLINK://` Spoke switching without rebuilding, or a **Zero-Conflict Standalone Fork** (`sanctuary.fork.json` + `npm run fork:configure` / `sanctuary-os/src/supabase.ts`).

---

## Quick Start (Development & Testing)

### Prerequisites
- **Node.js 22 LTS** & **npm**
- **Rust stable toolchain** (`rustup` / `cargo`)
- Platform prerequisites for **Tauri v2** (MSVC + WebView2 on Windows; Xcode CLT on macOS; `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf` on Ubuntu/Linux)

### Commands (Run from `sanctuary-os/`)

```bash
cd sanctuary-os
npm install

# Run frontend + Tauri desktop app in dev mode
npm run tauri dev

# Run Rust engine & security unit tests (Ironclad Gauntlet — Cargo)
cd src-tauri && cargo test

# Run Frontend Vitest regression suite (Ironclad Gauntlet — Vitest)
cd .. && npm test

# Sync source-first i18n keys into src/lexicons/en-default.json
npm run lexicon:sync

# Typecheck frontend, Node config/build scripts & Supabase Edge Functions
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
npx tsc -p supabase/functions/tsconfig.json --noEmit
SANCTUARY_SKIP_SPOKE_PULL=1 npm run build
```

---

## Self-Hosting: Partner Spoke vs. Standalone Fork

1. **Partner Spoke (`SANCTUARY-UPLINK://`):**
   - Run the **61-table** [`schema.sql`](./schema.sql) in a dedicated Supabase project (`public.taxonomy`, `public.sanctuary_schemas`, `public.mods`, `public.blueprints`, `public.sanctuary_lexicons`, `public.sanctuary_themes`, etc.).
   - Citizens can paste a `SANCTUARY-UPLINK://` invite bundle at the Login screen or under **Settings -> Core** (or click a `SANCTUARY-UPLINK://` deep link) to switch runtime cloud connectivity immediately—no rebuild required.
2. **Zero-Conflict Standalone Fork (`sanctuary.fork.json`):**
   - Copy `sanctuary-os/sanctuary.fork.example.json` to `sanctuary.fork.json` (git-ignored) and run `npm run fork:configure` (`scripts/configure-fork.mjs`), or override `SANCTUARY_CONFIG` / `VITE_*` variables cleanly in [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts).
   - Deploy [`schema.sql`](./schema.sql) (or the **28-table** [`schema_os.sql`](./schema_os.sql) + [`sanctuary-os/supabase/functions/game-gateway`](./sanctuary-os/supabase/functions/game-gateway) for multi-tenant Keepers Core hubs).
   - See [Sanctuary OS Forking & Architecture Guide.md](./Sanctuary%20OS%20Forking%20%26%20Architecture%20Guide.md) for the complete walkthrough.

---

## Documentation, Legal & Governance Index

### Core Architecture & Guides
- **[Citizen Guide.md](./Citizen%20Guide.md):** End-to-end walkthrough of Vault, Blueprints, Homestead Lab, Workbench, Conflict Radar, Time Capsule, and Role Tiers.
- **[Sanctuary OS Forking & Architecture Guide.md](./Sanctuary%20OS%20Forking%20%26%20Architecture%20Guide.md):** Deploying Partner Spokes (`SANCTUARY-UPLINK://`), Zero-Conflict Forks (`sanctuary.fork.json`), and Standalone builds.
- **[Master Architecture & Feature Document.md](./Master%20Architecture%20%26%20Feature%20Document.md):** Technical architecture of VFS deployment, Hub/Spoke sync, ByteHound v3, and Schema Engine v2.
- **[Master Protocol List.md](./Master%20Protocol%20List.md):** Security, Zero-PII privacy, Compliance Tiers `0–6`, and operational governance protocols.
- **[Phase Roadmap.md](./Phase%20Roadmap.md):** Engineering milestones across **Phases 1–16** (`v0.6.0` -> `v0.7.0` -> `v1.0 GA`).
- **[Release Notes (Community Blog).md](./Release%20Notes%20%28Community%20Blog%29.md)**, **[Release Notes (Dev).md](./Release%20Notes%20%28Dev%29.md)** & **[changelog.md](./changelog.md):** Community release summaries, developer build notes, and chronological engineering logs.

### Legal & Security Covenants
- **[LICENSE](./LICENSE) & [EULA.md](./EULA.md):** **GNU GPLv3** open-source software license and technical middleware notice.
- **[Terms of Service.md](./Terms%20of%20Service.md):** Network rules, non-overridable Verified Mason hardgates, Compliance Tiers `0–6`, and Florida/U.S. Governing Law.
- **[Privacy Policy.md](./Privacy%20Policy.md):** Zero-PII architecture, GDPR/UK GDPR/CCPA Data Subject Rights & self-service erasure, retention schedules, and privacy contact.
- **[Compliance Protocol.md](./Compliance%20Protocol.md) & [Partners Agreement.md](./Partners%20Agreement.md):** Spoke sovereignty covenant, `0%` cut isolation, Spoke-forwarded DMCA compliance, and `"CUT THE CORD"` severance.
- **[SECURITY.md](./SECURITY.md):** Coordinated vulnerability disclosure, safe harbor, key-compromise runbooks, and 72-hour GDPR Art. 33 breach response.
- **[CONTRIBUTING.md](./CONTRIBUTING.md) & [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md):** PR/code-quality standards, game-agnostic schema rules, `{Glossary}` i18n rules, and community conduct expectations.

### Governance SOPs & Ecosystem Briefs (`/Docs/`)
- [DMCA & Ownership Dispute SOP](./Docs/dmca_and_ownership_dispute_sop.md)
- [Moderation Appeals & False-Positive Remediation SOP](./Docs/moderation_appeals_and_remediation_sop.md)
- [Verified Mason & Spoke Governance SOP](./Docs/verified_mason_and_spoke_governance_sop.md)
- [Spoke Schema Migration & Trademark Policy](./Docs/spoke_schema_migration_and_trademark_policy.md)
- [Public Comparison: Why Switch to Sanctuary OS](./Docs/public_comparison_page_why_switch_to_sanctuary_os.md)
- [Modding Ecosystem Competitor Comparison Matrix](./Docs/modding_ecosystem_competitor_comparison.md)
- [Zero-Reinstall Player & Creator Migration Guide](./Docs/zero_reinstall_player_creator_migration_guide.md)
- [Technical Deep Dive: Formats, Malware & Cloud Traps](./Docs/technical_deep_dive_formats_malware_cloud_traps.md)
- [Executive Partner Spoke Pitch Matrix](./Docs/executive_partner_spoke_pitch_matrix.md)

---

## License

Sanctuary OS is free and open-source software licensed under the **GNU General Public License v3.0** ([`LICENSE`](./LICENSE)).

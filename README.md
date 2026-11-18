# Sanctuary OS (`sanctuary-os`)

> **Don't Be Evil. Advise, Never Dictate. Chronological By Design.**

Sanctuary OS is a **100% game-agnostic, local-first, non-destructive modding operating system** built with **Tauri v2 (Rust)**, **React 19 + TypeScript**, **SQLite / CoW snapshots**, and an optional federated **Supabase Keepers Core / Partner Spoke** backend.

Instead of hardcoding single-game assumptions, proprietary accounts, or paid cloud lock-ins, every engine's file extensions, OS paths, load-order strategies, binary container TOCs, crash log matchers, save airgap targets, and mod categories are driven declaratively by a **Master Schema** (`GameSchema` + `public.taxonomy`).

---

## Core Architecture & Capabilities

- **Zero-Scan Cartographer & Non-Destructive VFS (`src-tauri/src/`):** Discovers Windows/macOS/Linux/Steam Deck Proton storefronts natively, stages mods inside your isolated `{Vault}`, deploys transactional symlinks/junctions (`mklink /J`) backed by `.sanctuary_deploy_journal.jsonl` WAL crash recovery, and isolates vanilla game roots (`mods_dir_is_shared_with_vanilla`).
- **Topological Load Order Engine & Conflict Radar 2.0:** Solves Master/Dependency DAGs across `folder_priority`, `manifest_list` (INI, JSON, XML, BG3 `modsettings.lsx`, Bethesda `plugins.txt`), `numeric_prefix`, and `timestamp`; enforces schema `slot_buckets` (including Starfield `0x0800` Medium Masters and `0x0200` ESLs); inspects `.bsa`/`.ba2`, `LSPK`, Unreal `.pak`/`.utoc`, `RDAR`, `RPF7`, `TES4` FormID streams, and `selector_path` configs; imports LOOT YAML/JSON rules; and supports per-file VFS masking (`.sanctuary_hidden.json`).
- **The Quartermaster, Rosetta Protocol & Zero-Copy Exodus:** Interactive UTF-8/UTF-16 FOMOD (`ModuleConfig.xml`) and BAIN installer wizards with `.sanctuary_fomod_choices.json` reload, Modrinth `.mrpack` / CurseForge `manifest.json` / Nexus `collection.json` / `.wabbajack` conversion, and hardlink migration from Mod Organizer 2, Vortex, BG3MM, and r2modman/Gale.
- **Homestead Lab, Save Doctor & Creator Airlock:** Sandboxed test launches with save airgapping, binary/JSON save-header inspection before launch, external tool session airlock cleanup, and multi-root crash autopsy across logs and Proton prefixes.
- **ByteHound v3 Local Security:** Pure-Rust `.zip`/`.7z`/`.rar` extraction, sliding-window streaming auditing for `> 8 MiB` assets, structural PE/ELF/Mach-O/LNK masquerade detection, sealed OS keyring storage (`DPAPI` / `AES-256-GCM`), and opt-in Zero-PII threat hash sharing.
- **Sovereign Federation & 100% Offline Support:** Bundle-free fonts (`@fontsource-variable/*` + `material-symbols`), dynamic `{Glossary}` lexicons (`en-default` + Sparse Delta Overrides), strict **Local Network Only** airgap mode, live `SANCTUARY-UPLINK://` Spoke switching without rebuilding, or a **1-File Standalone Codebase Fork** (`sanctuary-os/src/supabase.ts`).

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

# Typecheck frontend + Supabase Edge Functions and build offline bundle
npx tsc --noEmit
npx tsc -p supabase/functions/tsconfig.json --noEmit
SANCTUARY_SKIP_SPOKE_PULL=1 npm run build
```

---

## Self-Hosting: Partner Spoke vs. Standalone Fork

1. **Partner Spoke (`SANCTUARY-UPLINK://`):**
   - Run [schema.sql](./schema.sql) in a dedicated Supabase project (`public.taxonomy`, `public.sanctuary_schemas`, `public.mods`, `public.play_sets`, `public.lexicons`, `public.themes`).
   - Citizens can paste a `SANCTUARY-UPLINK://` invite bundle at the Login screen or under **Settings -> Core** (or click a `SANCTUARY-UPLINK://` deep link) to switch runtime cloud connectivity immediately—no rebuild required.
2. **Standalone 1-File Codebase Fork:**
   - Configure your Supabase credentials, `githubReleaseRepo` (`VITE_GITHUB_RELEASE_REPO`), and branding inside [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts).
   - Deploy [`schema.sql`](./schema.sql) (or [`schema_os.sql`](./schema_os.sql) for Keepers Core multi-tenant hubs) and Edge Functions under [`sanctuary-os/supabase/functions/`](./sanctuary-os/supabase/functions/).
   - See [Sanctuary OS Forking & Architecture Guide.md](./Sanctuary%20OS%20Forking%20%26%20Architecture%20Guide.md) for the complete walkthrough.

---

## Documentation Index

- **[Citizen Guide.md](./Citizen%20Guide.md):** End-to-end walkthrough of Vault, Blueprints, Homestead Lab, Workbench, Conflict Radar, Time Capsule, and Role Tiers.
- **[Sanctuary OS Forking & Architecture Guide.md](./Sanctuary%20OS%20Forking%20%26%20Architecture%20Guide.md):** Deploying Partner Spokes (`SANCTUARY-UPLINK://`) and Standalone Codebase Forks.
- **[Master Architecture & Feature Document.md](./Master%20Architecture%20%26%20Feature%20Document.md):** Technical architecture of VFS deployment, Hub/Spoke sync, ByteHound v3, and Schema Engine v2.
- **[Master Protocol List.md](./Master%20Protocol%20List.md):** Security, Zero-PII privacy, and operational governance protocols.
- **[Phase Roadmap.md](./Phase%20Roadmap.md):** Engineering milestones across Phases 1–14.
- **[Release Notes (Dev).md](./Release%20Notes%20%28Dev%29.md)** & **[changelog.md](./changelog.md):** Detailed developer build notes and chronological engineering logs.
- **Ecosystem Briefs (`/Docs/`):**
  - [Public Comparison: Why Switch to Sanctuary OS](./Docs/public_comparison_page_why_switch_to_sanctuary_os.md)
  - [Modding Ecosystem Competitor Comparison Matrix](./Docs/modding_ecosystem_competitor_comparison.md)
  - [Zero-Reinstall Player & Creator Migration Guide](./Docs/zero_reinstall_player_creator_migration_guide.md)
  - [Technical Deep Dive: Formats, Malware & Cloud Traps](./Docs/technical_deep_dive_formats_malware_cloud_traps.md)
  - [Executive Partner Spoke Pitch Matrix](./Docs/executive_partner_spoke_pitch_matrix.md)

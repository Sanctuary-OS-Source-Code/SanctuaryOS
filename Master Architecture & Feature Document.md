# Sanctuary OS — Master Architecture & Feature Document

Sanctuary OS is a cross-platform (Windows, macOS & Linux / SteamOS), local-first mod operations layer, desktop middleware, and decentralized Hub-and-Spoke ecosystem built on a strict **"no asset hosting / metadata-only / offline-first / 0% platform tax"** architecture.

---

## Pillar 1: Tri-Platform Native Engine, Deck Overdrive & Liquid Glass Optics

Sanctuary OS pairs a native multi-threaded Rust systems backend with a 60+ FPS WebGL2 optical glassmorphic UI and full handheld/mobile parity:

- **Frontend Runtime (`React 19 + TypeScript + Vite + Tailwind CSS v4`):**
  - **Liquid Glass Optics (`webgl_glass_v61` / `rev_74`) & Zero-Bloat Chameleon Wallpapers:** Real-time 1:1 physical-pixel background projection (`background-attachment: fixed` parity) with crystal-clear interiors (`4px–6px` diffusion), `8px–13px` 3D Snell's Law refractive edge bevels, a dedicated `layer2` WebGL2 overlay pipeline for floating dropdowns (`.sa-dropdown-popover`) and custom Liquid Glass hovertips, concentric rounded-square geometry, translucent Chameleon `::selection` highlights, built-in `2560×1440` lossless wallpapers across 7 Core Chameleon profiles (plus Spoke offline fallback presets), and content-addressed `<= 250 KB` WebP Chameleon wallpapers (`1-year` CDN cache, external HTTPS URLs, and `{Vault}/Data/Themes/` offline storage).
  - **6 Live Theme Forge Optical Sliders & Per-Space Aesthetics Matrix:** Real-time control over **Glass Opacity**, **Refractive Blur**, **Refractive Saturation**, **Rim Light Intensity**, **Specular Glare**, and **Elevation Depth**, paired with a **Per-Space `{Chameleons}` & `{Lexicons}` Assignment Matrix** (`Settings -> Appearance`) so `Keepers Core` and each mounted Spoke workspace maintain independent visual and language profiles.
  - **Jump Gate (`Ctrl+K` / `Cmd+K`), Responsive Mobile Filter Drawers & Control Capsule:** Consolidates the Active Workspace Selector, System Queues & Utilities, Notifications, **Jump Gate** command palette, and **7-Domain `{Settings}`**, alongside universal OS-wide right-click flyouts, unified **Mod Dossier** action headers, and responsive mobile filter selector pills collapsing 2+ filter tiles on `< 768px` mobile screens into a Liquid Glass Selector Pill + Portal Popover across 51+ drawers.
  - **Live System Telemetry Toast & System Log History:** Transient bottom-right Liquid Glass toast displaying live scan progress and system alerts without cluttering the bottom screen edge, opening the **System Log History** drawer on click alongside **Command Center** quick actions for Radar Sweep and `{Vault}` Lockdown.
- **Code-Switch (`Zustand` + Lexicon V2):**
  - Atomic selector subscriptions (`useShallow`), Rollup code-splitting, virtualized list/grid rendering, and AppData FS Desktop `{Blueprint}` persistence preventing `localStorage` quota exhaustion.
  - **6,800+-Key Baseline, Sparse Delta Packs & 1-Click Auto-Translate:** Static source extraction (`npm run lexicon:sync`) maintains `en-default.json` while compacting `en-sanctuary.json`, Spoke packs, and community packs into lightweight **Sparse Delta Override Packs** with O(1) memoized lookups, **21 Dynamic `{Glossary}` Tokens**, a Source-First 4-tab **Lexicon Visual Studio**, and **1-Click Neural Auto-Translate** across **28+ languages**.
- **Tri-Platform Native Desktop Engine (`Tauri v2 + Rust` — Windows, macOS & Linux / SteamOS):**
  - **The Cartographer, Multi-Tier Version Ripper & Gatekeeper Clearance:** Native builds for Windows (`SanctuaryOS.exe` with signed `tauri-plugin-updater` and 1-click cross-drive UAC symlink unlock), macOS (`.dmg` / `.app` Universal Binary with **Gatekeeper Clearance** Touch ID passkeys, Full Disk Access diagnostics, and `com.apple.quarantine` stripping), and Linux / SteamOS (`.AppImage` / `.deb` with AMD RDNA2 acceleration and storefront-aware **Multi-Tier Version Ripper** across declarative JSON/XML/INI/regex/PE probes, `Info.plist`, `.acf`, and Steam/GOG/Epic/EA/Lutris discovery).
  - **Deck Overdrive:** Unified XWayland surface binding under Gamescope (`GDK_BACKEND=x11`), dynamic `/dev/input` + `/sys/class/hidraw` discovery with `evdev`/`joydev` deduplication and 64-byte `SteamDeckStatePacket_t` decoding, **60 FPS Chameleon Virtual Pointer**, **2D Spatial Focus**, `L1`/`R1` tab cycling, Trackpad scrolling, Steam OSK auto-summon, and Valve Proton `compatdata/<AppID>/pfx/` prefix auto-resolution across internal storage and SD cards.
  - **High-Throughput Rust I/O & Parallel CoW Pipeline:** Managed SQLite WAL connection pool (`.sanctuary_cache.db`), `rayon`-parallelized Vault DNA hashing and Copy-on-Write (`CoW`) **Time Capsule** streaming, bounded concurrent **Edge Pulse** polling, `ring::aead::AES_256_GCM` passkey storage, and **Mirror Uplink** bilateral codebase `.md` sync.

---

## Pillar 2: Hub, Spokes, Cut the Cord, Beam to Rig & Edge Pulse

Sanctuary OS eliminates centralized lock-in by separating global identity from community-owned game databases and creator-owned static manifests:

- **Core OS Hub Database (`schema_os.sql` — Project `tpsbtaqxlczrysqqmanp`):**
  - Governed by **Keepers Core**. Hosts global SSO authentication (`OWASP 600,000-iteration PBKDF2 + Bcrypt` password stretching and `600k` blinded email aliases), `auth.webauthn_credentials` & Live Companion Passkey Handshakes (with W3C Web Push), `hardware_bans` (**Nuclear Override** domain-salted one-way SHA-256 HWID ledger), `sanctuary_games` (including `is_keepers_only` dev-spoke cloaking), Split-Custody Double-Envelope `sanctuary_internal.spoke_credentials` (`HKDF-SHA256` + `AES-256-GCM` with bound AAD + Supabase Vault + Edge `SPOKE_VAULT_MASTER_KEY`), Vault-sealed `sanctuary_internal.runtime_secrets`, Core Schemas/Lexicons/Themes, `system_directives`, and `keeper_heuristic_signatures`.
- **Community Game Spoke Databases (`schema.sql`):**
  - 100% owned and hosted by each game community's **Wayfinder**, with non-permissive RLS, indexed FKs, and Postgres triggers (`protect_spoke_donation_fields`) isolating community donation settings strictly to the Wayfinder. Stores pseudonymous Spoke `profiles`, `sanctuary_schemas` (`v12`), Sparse Delta `sanctuary_lexicons`, `mods`, `mod_versions`, `flavor_groups` (**The Highlander Rule** Exclusive Slots), `masons`, `blueprints`, Verified-Mason-governed `nexus_assets`, `citizen_staging_queue` (`10 MB` GZIP + AES-256-GCM **Beam to Rig** sync for **Personal Rig Blueprints**, **Pocket Radar**, **Echo Suppressor** sync, and **Multi-Rig Mason Support Perks**), and `sanctuary_internal.spoke_relink_commitments`.
- **Cut the Cord, `SRK1` Relink & Standalone Fork (`src/supabase.ts`):**
  - Supports modern Supabase `sb_publishable_*` and `sb_secret_*` opaque keys, sub-second Elevated Hub loading via `spoke_query_batch` + microtask coalescing, high-friction **`"CUT THE CORD"`** bilateral severance, and **Cryptographic `SRK1` Spoke Relink Commitments** (`SRK1.<hub_uuid>.<relink_secret>`) so returning Citizens safely claim legacy profiles on severed Spin-Off forks without username hijacking. Editing only `SANCTUARY_CONFIG` in `src/supabase.ts` runs the entire OS in 1-database Standalone Mode with zero Edge Functions.
- **Sovereign Covenants, Cost Ledgers & Edge Pulse:**
  - `0%` platform cut across Mason and Partner Spoke donations (`+30 days` Global Dev Builds per `$5` donated), itemized **Monthly Cost vs. Spending Reports** with automatic carryover ledgers, and concurrent Rust **Edge Pulse** polling (across `.sanctuary.manifest.json`, `.sanctuary.override.json`, and `catalog.json` with `ETag` / `304` caching and 6-provider **Edge Direct Push**).

---

## Pillar 3: Universal Master Schema, Patch Fire Drill & Groundhog Sandbox

Sanctuary OS is 100% engine- and format-agnostic across Rust, TypeScript, Edge Functions, and SQL:

- **Universal Master Schema, Topological Load Order, Binary TOC Radar & Quartermaster:**
  - **7 Engine Presets** and **Schema Forge** (4-Tab Visual Editor) supporting multi-folder asset tree preservation (`preserve_auxiliary_assets`), `.zip`/`.7z`/`.rar` `archive_containers`, structured `load_order` XML/manifest templates (including BG3 `modsettings.lsx`), Topological Master/Dependency DAG & Slot-Bucket compilation, database-driven `public.taxonomy` Categories (`Oversight -> Game Management`), secondary `install_routes`, per-file `.sanctuary_hidden.json` VFS masking, multi-engine binary TOC Conflict Analyzers (`TES4`, `BSA`/`BA2`, `LSPK`, `.pak`/`.utoc`, `RDAR`, `RPF7`), and **The Quartermaster** (`ModuleConfig.xml` FOMOD & BAIN wizard).
- **Patch Fire Drill, 3-Mode Sync & The Highlander Rule:**
  - **Patch Fire Drill:** Evaluates every `{Blueprint}` against any target game build with 1-to-1 deduplicated `{Mod}` count parity, multi-pass Atomic Logic & transitive dependency checks, **Nuclear Family Cohesion** folder coupling, `Auto-Swap Ready` local version matching, 1-click **Get Dependency** acquisition, diagnostics, and 1-click **Clone Ready**.
  - **The Highlander Rule & Swap Alerts:** Pairs `mods.highlander_group_id` and Static Edge `atomic_logic.highlander_group` rules with explicit **Swap / Keep Both / Cancel** prompts across `{Vault}` cards and **Mod Dossier** drawers—never silently evicting equipped `{Mods}`.
  - **Rosetta Protocol, Zero-Copy Exodus & Beam to Rig:** Translates `.mrpack`, CurseForge, `collection.json`, and `.wabbajack` modlists via **Rosetta Protocol**, imports MO2/Vortex setups cleanly via `fs::hard_link` **Zero-Copy Exodus**, supports `Public`/`Unlisted`/`Private` Blueprint sync with settled SHA-256 ghost healing, and beams encrypted queues across rigs.
- **Groundhog Sandbox, Save Doctor, Creator Airlock, Time Capsule & Lossless Workbench:**
  - **Groundhog Sandbox, Save Doctor & Creator Airlock:** Externalized `SanctuarySaveVault` + immortal `{Vault}` Save Mirror, read-only **Golden Baseline** test save + disposable working copy per run with Stage 4 magic-byte corruption auditing and automatic teardown rewind, **Save Doctor** pre-launch missing-mod warnings (`.sanctuary-save-manifest.json`), **Creator Airlock** save-airgapped external tool sessions with automatic post-exit save restoration, 100% passive 4-stage verification, native PCM chimes, multi-root **Crash Autopsy** suspect scoring, 2-column **Active Test Bench**, and pinned **Known Errors**.
  - **Time Capsule, Echo Archive & Deep Yeet:** Multi-threaded `rayon` Copy-on-Write snapshots (`World State`, `Engine Core`, and zero-byte hardlink **Echo Archive** `Backups/Mods/` with Suite Revision Matrix rollbacks), delta-aware cap pruning, **DEFCON 1 Shield**, additive save slot restoration, and complete **Deep Yeet** teardown.
  - **Live-Wire Workbench & 7-Domain `{Settings}`:** 60 FPS 2-column Visual Config Editor (`.sanctuary.template.json` + native INI/TOML/YAML/XML/JSON), bidirectional **Live-Wire Diff** Timeline, and 7-domain `{Settings}` with Per-Spoke Notification Muting and split `ON:` / `OFF:` toggle guides.

---

## Pillar 4: Gatekeeper Clearance, Zero-Knowledge Seal & Zero-Choice Lockdown

Security and operational governance are enforced across 6 clearance tiers, sub-second Command Hubs, and hardware-backed cryptographic gates:

- **6-Tier Clearance Hierarchy & Strict Role Boundaries:**
  1. **Tier 1 — Citizen (`citizen`):** Full access to all 9 Citizen modules, inherited local **Open Mason Workshop** (`Sandbox`, `IDE`, `3-Tile Artifact Studio`, `Theme Forge`, DPAPI/AES-256-GCM sealed **Edge Direct Push**) plus save-airgapped **Creator Airlock** external tool launches, local JSON export/import, Cloud `{Blueprint}` sharing (`Public` / `Unlisted` / `Private`), and Scout Queue submissions.
  2. **Tier 2 — Verified Mason (`mason` / `isVerifiedMason`):** Direct `{Nexus}` publishing for `{Mods}`, `{Lexicons}`, `{Chameleons}`, and `Workbench Templates`, Verified Mason Queue fast-lane, Public Mason Profile showcase, and 0%-cut Supporter Bridge.
  3. **Tier 3 — Architect (`architect` — Strict Tier 0 Isolation):** **Public Verified** (Tier 0) Registry curation (`Stable` telemetry, atomic logic, conflict rules, **Crash Autopsy** Known Error rules, live **Workbench Template Previews**), Scout & `{Mason}` Queue triage, and exclusive **`Claimed`** Citizen Support Desk queues—routing Tier 1–4 flags into `Oversight > Compliance` as **`Pending`**.
  4. **Tier 4 — Oversight (`oversight`):** Spoke Heuristic Signatures, **`Pending` Tier 1–4 Compliance confirmation** (`purge_flagged_hash_from_blueprints` strips Cloud `{Blueprints}` once confirmed) & Tier 5 **Zero-Choice Lockdown** blacklisting, **DEFCON 1 Shield** lockdowns, Game/DLC patch registration, read/export-only Audit Log review, and Spoke Identity Matrix governance (excluding Oversight/Wayfinders).
  5. **Tier 5 — Wayfinder (`wayfinder`):** Full Spoke Sovereignty (`Spoke Control` & `Spoke Aesthetics`), **Schema Forge** & **Code-Switch**, in-hub `Mass Update` & `Patch Management`, Identity Matrix up to Wayfinder, 100% isolated Non-Custodial Community Donations, and unilateral **Cut the Cord** severance.
  6. **Tier 6 — Keeper (`keeper` on Core Hub):** Global OS Hub governance, Partner Spoke onboarding & `is_keepers_only` dev-node cloaking, Core Heuristics, Keepers Core Default Schema, Global Lexicons/Chameleons, **Mirror Uplink**, and Global Audit Logs—strictly isolated from Partner Spoke operations beyond compliance severance.
- **Sub-Second Landing-Page Command Screens & `2x3` Hub Metrics:**
  - All 5 Elevated Hubs load in under a second via batch-coalesced queries (`spoke_query_batch`) and warm hub caching, opening to full-coverage landing-page overviews with section-jump headers, direct in-drawer workflows, and right-rail `2x3` Hub Metrics.
- **Zero-Knowledge Seal, Ghost Scrubber & Zero-Choice Lockdown:**
  - 12-hour Device-Bound Passkey Seal (`sanctuary_passkey_seal_v2`), **Gatekeeper Clearance** Touch ID, Live Phone/PC Companion Passkey Handshake via W3C Web Push, Tier 0 Known-Hash Architect submission gating backed by `_lab_cert_proof`, multi-OS **Ghost Scrubber** PII sanitization, and **Bytecode Hound** triggering **Zero-Choice Lockdown** with Citizen-signed **Secure Shred**.

<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:
{
  "slug": "master_architecture",
  "_schemaVersion": 88,
  "title": "Master Architecture & Feature Blueprint",
  "summary": "Deep-dive interactive explorer into the Tauri v2 Rust core, Universal Master Schema, Code-Switch, Mirror Uplink, Symlink Airgap, Edge Pulse, Groundhog Sandbox, and Bytecode Hound.",
  "tabs": [
    {
      "id": "p1",
      "icon": "memory",
      "label": "PILLAR 1",
      "value": "Core & Glass",
      "cards": [
        {
          "id": "arch_p1",
          "icon": "memory",
          "overline": "ARCHITECTURE PILLAR 1 • CORE ENGINE, OPTICS & STUDIOS",
          "badge": "Active",
          "title": "Tauri v2 Kernel, Liquid Glass Optics, Schema Forge & Code-Switch",
          "footerMeta": "Tauri v2 • React 19 • Liquid Glass Optics • Win, Mac & Linux / SteamOS",
          "desc": "Sanctuary OS combines a zero-overhead native Rust backend across Windows, macOS, and Linux / SteamOS (Deck Overdrive) with GPU-pinned Liquid Glass Optics, Universal Master Schema tooling, and the Code-Switch.",
          "subCards": [
            {
              "id": "arch_p1_c1",
              "icon": "auto_awesome",
              "title": "Liquid Glass Optics",
              "desc": "Zero-Tearing WebGL2 Liquid Glass Engine (.glass-panel / .glass-surface) with 6 live Theme Forge optical sliders (Opacity, Blur, Saturation, Rim Light, Glare, Depth), Per-Space Aesthetics, and responsive mobile selector pills."
            },
            {
              "id": "arch_p1_c2",
              "icon": "memory",
              "title": "Deck Overdrive & Native Kernel",
              "desc": "Native Tauri v2 Rust core: Multi-Tier Version Ripper (PE, Info.plist, manifests, storefronts), Deck Overdrive Steam Deck controller + Proton compatdata/user_settings resolver, SQLite .sanctuary_cache.db delta scanner, WebAuthn FIDO2 bridge, and cross-platform auto-updater."
            },
            {
              "id": "arch_p1_c3",
              "icon": "schema",
              "title": "Universal Master Schema",
              "desc": "Declarative Schema Forge JSON editor governing binaries, secondary install_routes, config_extensions watcher, topological DAG + slot_buckets load ordering, container TOC analyzers, database-driven public.taxonomy Categories, and exception matchers."
            },
            {
              "id": "arch_p1_c4",
              "icon": "translate",
              "title": "Code-Switch",
              "desc": "21 Dynamic {Glossary} Tokens interpolated across 6,800+ keys with smart article grammar, Sparse Delta Override packs, Guided Icon Overrides, and 1-click auto-translation across 28+ languages."
            }
          ]
        }
      ]
    },
    {
      "id": "p2",
      "icon": "hub",
      "label": "PILLAR 2",
      "value": "Hub & Spokes",
      "cards": [
        {
          "id": "arch_p2",
          "icon": "hub",
          "overline": "ARCHITECTURE PILLAR 2 • FEDERATION, SYNC & STATIC EDGE",
          "badge": "Active",
          "title": "Hub Federation, Mirror Uplink & Edge Pulse",
          "footerMeta": "schema_os.sql • schema.sql • Edge Pulse • Mirror Uplink",
          "desc": "Uses bundled codebase files as an offline baseline paired with Mirror Uplink cloud synchronization, community-owned Spoke DBs (Cut the Cord & SRK1 Relink), Echo Suppressor sync, and 6-provider Edge Pulse polling.",
          "subCards": [
            {
              "id": "arch_p2_c1",
              "icon": "hub",
              "title": "Core Hub & Spoke Sovereignty",
              "desc": "Core OS Hub (schema_os.sql) governs global SSO, FIDO2 passkeys, sanctuary_schemas, keeper_heuristic_signatures & system_directives; Spokes (schema.sql) own 100% of their 52 community tables."
            },
            {
              "id": "arch_p2_c2",
              "icon": "sync",
              "title": "Mirror Uplink",
              "desc": "First-time launch and offline sessions boot from bundled .md, schema, and lexicon files; connected clients pull live updates via Mirror Uplink without requiring an app update."
            },
            {
              "id": "arch_p2_c3",
              "icon": "cloud_done",
              "title": "Edge Pulse & Direct Push",
              "desc": "6-provider 1-click OS Auto-Push (.sanctuary.manifest.json & catalog.json) and concurrent Rust HTTP GET polling with ETag/304 caching and automatic previous_hashes lineage rollover."
            },
            {
              "id": "arch_p2_c4",
              "icon": "favorite",
              "title": "Sovereign Covenants & Cut the Cord",
              "desc": "Readiness-gated Partner Spoke onboarding with mandatory Covenants, 0%-cut community donations, Stripe-verified Dev Builds, phrase-locked Cut the Cord severance, and SRK1 relink commitments."
            }
          ]
        }
      ]
    },
    {
      "id": "p3",
      "icon": "shield",
      "label": "PILLAR 3",
      "value": "{Vault} & Lab",
      "cards": [
        {
          "id": "arch_p3",
          "icon": "inventory_2",
          "overline": "ARCHITECTURE PILLAR 3 • {VAULT}, COMPILER & WORKBENCH",
          "badge": "Active",
          "title": "Symlink Airgap, Priority Compiler & Groundhog Sandbox",
          "footerMeta": "Symlink Airgap • Priority Compiler • Groundhog Sandbox",
          "desc": "Protects your game installation via Symlink Airgap, Priority Compiler & Conflict Radar 2.0, Live-Wire Workbench config editing, Groundhog Sandbox save-verified testing, and Time Capsule snapshots.",
          "subCards": [
            {
              "id": "arch_p3_c1",
              "icon": "inventory_2",
              "title": "Symlink Airgap & Config Watcher",
              "desc": "Projects {mods} from {Vault}/{Mods}/ into live game folders and secondary install_routes while deduplicating stray root configs and syncing in-game config_extensions writes back to the {Vault}."
            },
            {
              "id": "arch_p3_c2",
              "icon": "layers",
              "title": "Priority Compiler & Conflict Radar 2.0",
              "desc": "5-Tier Severity Matrix, 1-click 'Set Winner' priority tier assignment, The Highlander Rule swap prompts, and Schema-Driven Load Order compilation with topological cycle breaking."
            },
            {
              "id": "arch_p3_c3",
              "icon": "tune",
              "title": "Live-Wire Workbench & Live-Wire Diff",
              "desc": "60 FPS 2-column Visual Config Editor with Category Pill Bar, Min/Max range steppers, No-Code Template Builder, and side-by-side [In-Game Engine Edit] Visual/Raw Diff."
            },
            {
              "id": "arch_p3_c4",
              "icon": "science",
              "title": "Groundhog Sandbox & Time Capsule",
              "desc": "Immortal Save-Verify-and-Rewind {Lab} isolation, Crash Autopsy log decoding, fullscreen PCM audio chimes, and zero-bloat Copy-on-Write OS hardlink snapshots with additive save restores."
            }
          ]
        }
      ]
    },
    {
      "id": "p4",
      "icon": "admin_panel_settings",
      "label": "PILLAR 4",
      "value": "6-Tier & AV",
      "cards": [
        {
          "id": "arch_p4",
          "icon": "admin_panel_settings",
          "overline": "ARCHITECTURE PILLAR 4 • GOVERNANCE, PASSKEYS & MALWARE LOCKDOWN",
          "badge": "Active",
          "title": "Zero-Knowledge Seal, Echo Suppressor & Zero-Choice Lockdown",
          "footerMeta": "6 Role Tiers • Zero-Knowledge Seal • Bytecode Hound",
          "desc": "Enforces strict separation between Spoke and Core Hub clearances, hardware-backed Zero-Knowledge Seal passkey gates, Echo Suppressor alert sync, and Zero-Choice Lockdown quarantine.",
          "subCards": [
            {
              "id": "arch_p4_c1",
              "icon": "admin_panel_settings",
              "title": "6-Tier Clearance Hierarchy",
              "desc": "Decouples Game Spoke roles ({Citizen}, Verified {Mason}, Architect, Oversight, Wayfinder) from Global Core OS Hub roles (Keeper) with Pending Tier 1–4 compliance gating."
            },
            {
              "id": "arch_p4_c2",
              "icon": "space_dashboard",
              "title": "Sub-Second Command Hubs & Echo Suppressor",
              "desc": "Every Elevated Hub loads sub-second into a 2-column Recent and Anomalies overview, while Echo Suppressor deduplicates dismissed alerts across all devices via Zero-PII AES-256-GCM sync."
            },
            {
              "id": "arch_p4_c3",
              "icon": "passkey",
              "title": "Zero-Knowledge Seal & Companion Handshake",
              "desc": "Hardware-bound WebAuthn Passkeys (Windows Hello, Touch ID, YubiKey), OWASP 600k auth, and live Web Push Companion Handshakes guard Elevated Hubs inside a right-hand Security {Vault}."
            },
            {
              "id": "arch_p4_c4",
              "icon": "gpp_bad",
              "title": "Zero-Choice Lockdown & Bytecode Hound",
              "desc": "Merges Core + Spoke heuristics with Zlib/Zstd decompression to halt launches on Tier 5 Malware and lock the OS shell until a {Citizen}-signed Secure Shred."
            }
          ]
        }
      ]
    }
  ],
  "_bodySig": 1539929614
}
-->

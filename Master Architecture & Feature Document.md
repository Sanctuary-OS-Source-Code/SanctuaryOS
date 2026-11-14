# Sanctuary OS — Master Architecture & Feature Document

**Document Version:** v0.6.0-Dev.13  
**Last Updated:** November 14, 2026  

Sanctuary OS is a cross-platform (Windows, macOS & Linux / SteamOS), local-first mod operations layer, desktop middleware, and decentralized Hub-and-Spoke ecosystem built on a strict **"no asset hosting / metadata-only / offline-first / 0% platform tax"** architecture.

---

## Pillar 1: Core Stack, Tri-Platform Rust Backend, Steam Deck Controller Engine & WebGL2 Liquid Glass

Sanctuary OS pairs a native multi-threaded Rust systems backend with a 60+ FPS WebGL2 optical glassmorphic UI and full handheld/mobile parity:

- **Frontend Runtime (`React 18 + TypeScript + Vite + Tailwind CSS v4`):**
  - **WebGL2 3D Liquid Glass Optical Engine (`webgl_glass_v61` / `rev_74`) & Zero-Bloat Chameleon Wallpapers:** Real-time 1:1 physical-pixel background projection (`background-attachment: fixed` parity) with crystal-clear interiors (`4px–6px` diffusion), `8px–13px` 3D Snell's Law refractive edge bevels, a dedicated `layer2` WebGL2 overlay pipeline for floating dropdowns (`.sa-dropdown-popover`) and hovertips (`<HoverTooltip />`), concentric rounded-square geometry, translucent Chameleon `::selection` highlights, 8 `2560×1440` lossless built-in wallpapers, and a **Content-Addressed Cloud Wallpaper Pipeline** (`SHA-256` deduplicated `<= 250 KB` WebP wallpapers + `~16 KB` browse thumbnails with 1-year CDN caching, External HTTPS Wallpaper URL support, and local `{Vault}/Data/Themes/` offline caching).
  - **6 Live Theme Forge Optical Sliders & Per-Space Aesthetics Matrix:** Real-time control over **Glass Opacity**, **Refractive Blur**, **Refractive Saturation**, **Rim Light Intensity**, **Specular Glare**, and **Elevation Depth**, paired with a **Per-Space `{Chameleons}` & `{Lexicons}` Assignment Matrix** (`Settings -> Appearance`) so `Keepers Core` and each mounted Spoke workspace maintain independent visual and language profiles.
  - **Unified Top-Right Control Capsule, `Ctrl+K` Command Matrix, Mobile `<SidePanelFilterBar>` & Right-Click Menus:** Consolidates the Active Workspace Selector, System Queues & Utilities, Notifications, `Ctrl+K` / `Cmd+K` Command Matrix, and **7-Domain `{Settings}`**, alongside universal `openSanctuaryContextMenu` right-click flyouts, unified `ModDossier` `<ActionButton>` drawer headers, and `<SidePanelFilterBar>` (collapsing 2+ filter tiles on `< 768px` mobile screens into a Liquid Glass Selector Pill + Portal Popover across 51+ drawers).
  - **Single Morphing Status Pill (`SystemStatusBar.tsx`):** Centered, auto-tucking Liquid Glass dock adapting dynamically between the **Foundry Landing Page** and **Mounted Game Workspaces** (Radar Sweep, Vault Lockdown, Blueprint Swap, and live alert counters).
- **State & Lexicon Engine V2 (`Zustand + LexiconContext.tsx`):**
  - Atomic selector subscriptions (`useShallow`), Rollup code-splitting, `useVirtualWindow` list/grid virtualization, and AppData FS Desktop `{Blueprint}` persistence preventing `localStorage` quota exhaustion.
  - **Auto-Extracted `6,166`-Key Baseline, Sparse Delta Packs & 1-Click Auto-Translate:** Static source extraction (`npm run lexicon:sync`) maintains `en-default.json` while compacting `en-sanctuary.json`, Spoke packs, and community packs into lightweight **Sparse Delta Override Packs** with O(1) memoized lookups, **21 Dynamic `{Glossary}` Tokens** (`interpolateGlossaryTokens`), a Source-First 4-tab `LexiconVisualStudio`, and **1-Click Neural Auto-Translate** across **28+ languages**.
- **Tri-Platform Native Desktop Engine (`Tauri v2 + Rust` — Windows, macOS & Linux / SteamOS):**
  - **Windows, macOS & Linux / SteamOS Parity:** Native builds for Windows (`SanctuaryOS.exe` with signed `tauri-plugin-updater` and 1-click cross-drive UAC symlink unlock), macOS (`.dmg` / `.app` Universal Binary with native **Touch ID** passkeys, Full Disk Access diagnostics, and Gatekeeper `com.apple.quarantine` handling), and Linux / SteamOS (`.AppImage` / `.deb` with AMD RDNA2 acceleration and `libraryfolders.vdf` + `compatdata/<AppID>/pfx/` Proton prefix auto-resolution across internal storage and SD cards).
  - **Full-OS Steam Deck & Non-Steam Game Controller Engine:** Unified XWayland surface binding under Gamescope, dynamic `/dev/input` + `/sys/class/hidraw` discovery with `evdev`/`joydev` deduplication and 64-byte `SteamDeckStatePacket_t` decoding, a **60 FPS Chameleon Virtual Pointer** (`Left Stick` / `Right Trackpad`), **2D Spatial Focus** (`D-Pad`, `A`/`R2` click + Steam OSK auto-summon, `L2`/`X` context menu, `B` back, `L1`/`R1` tab cycling), and `Right Stick` / `Left Trackpad` scrolling.
  - **High-Throughput Rust I/O & Parallel CoW Pipeline:** Managed SQLite WAL connection pool (`.sanctuary_cache.db`), `rayon`-parallelized Vault DNA hashing and Copy-on-Write (`CoW`) Time Capsule streaming, bounded concurrent Static Edge polling (`poll_edge_manifests_batch`), `ring::aead::AES_256_GCM` passkey storage, and bilateral codebase `.md` directive sync.

---

## Pillar 2: Hub, Spokes, Cryptographic Sovereignty, Zero-PII Cross-Rig Sync & Static Edge

Sanctuary OS eliminates centralized lock-in by separating global identity from community-owned game databases and creator-owned static manifests:

- **Core OS Hub Database (`schema_os.sql` — Project `tpsbtaqxlczrysqqmanp`):**
  - Governed by **Keepers Core**. Hosts global SSO authentication (`OWASP 600,000-iteration PBKDF2 + Bcrypt` password stretching and `600k` blinded email aliases), `user_passkeys` & Live Companion Passkey Handshakes (with W3C Web Push), `hardware_bans` (domain-salted one-way SHA-256 HWID ledger), `sanctuary_games` (including `is_keepers_only` dev-spoke cloaking), `service_role`-only **`sanctuary_game_secrets`** & `sanctuary_internal.runtime_secrets` vaults, the `default` Master Schema (`v5`), Core Lexicons/Themes, `system_directives`, and `keeper_heuristic_signatures`.
- **Community Game Spoke Databases (`schema.sql`):**
  - 100% owned and hosted by each game community's **Wayfinder**, with non-permissive RLS, indexed FKs, and Postgres triggers (`protect_spoke_donation_fields`) isolating community donation settings strictly to the Wayfinder. Stores pseudonymous Spoke `profiles`, `sanctuary_schemas` (`v12`), Sparse Delta `sanctuary_lexicons`, `mods`, `mod_versions`, `flavor_groups` (Highlander Exclusive Slots), `masons`, `blueprints`, Verified-Mason-governed `nexus_assets`, `citizen_staging_queue` (`10 MB` GZIP + AES-256-GCM Zero-PII sync for **Personal Rig Blueprints**, **Mobile Vault Companion Radar**, **Once-Per-Account Notification Sync**, and **Multi-Rig Mason Support Perks**), and `sanctuary_internal.spoke_relink_commitments`.
- **Batch-Coalesced Edge Gateway (`game-gateway` v22), `SRK1` Relink & Standalone Fork (`src/supabase.ts`):**
  - Supports modern Supabase `sb_publishable_*` and `sb_secret_*` opaque keys, sub-second Elevated Hub loading via `spoke_query_batch` + microtask coalescing, high-friction `"CUT THE CORD"` bilateral severance, and **Cryptographic `SRK1` Spoke Relink Commitments** (`SRK1.<hub_uuid>.<relink_secret>`) so returning Citizens safely claim legacy profiles on severed Spin-Off forks without username hijacking. Editing only `SANCTUARY_CONFIG` in `src/supabase.ts` runs the entire OS in 1-database Standalone Mode with zero Edge Functions.
- **Non-Custodial Supporter Bridge, Transparent Monthly Ledgers & Static Edge Polling:**
  - `0%` platform cut across Mason and Partner Spoke donations (`+30 days` Global Dev Builds per `$5` donated), itemized **Monthly Cost vs. Spending Reports** with automatic carryover ledgers, and concurrent Rust **Static Edge Polling** (`poll_edge_manifests_batch` across `.sanctuary.manifest.json`, `.sanctuary.override.json`, and `catalog.json` with `ETag` / `304` caching and 6-provider 1-click Auto-Push).

---

## Pillar 3: Master Schema v2, Blueprint Patch Readiness, Highlander Slots, Homestead Airgap & Workbench

Sanctuary OS is 100% engine- and format-agnostic across Rust, TypeScript, Edge Functions, and SQL:

- **Master Schema v2 (`SchemaVisualStudio.tsx`) & Pluggable Conflict Radar (`ArtifactScout.tsx` & `radar.rs`):**
  - **7 Engine Architecture Presets** and a **4-Tab Visual Schema Editor** supporting multi-folder asset tree preservation (`preserve_auxiliary_assets`), `archive_containers`, structured `load_order` XML/manifest templates (including BG3 `modsettings.lsx`), secondary `install_routes`, `editable_config_formats`, `"json_key"` version probing, and declarative **`conflict_analyzers`** (`virtual_fs_path`, `archive_member`, `binary_chunk_index` with `bitmask_constant_header`, and `json_xml_key`) across a 5-Tier Severity Matrix (`S1–S5`).
- **`{Blueprint}` Patch Readiness Simulator, 3-Mode Sync & Highlander Swap Alerts:**
  - **Patch Readiness Simulator (`BlueprintPatchReadiness.tsx`):** Evaluates every `{Blueprint}` against any target game build with 1-to-1 deduplicated `{Mod}` count parity, multi-pass Atomic Logic & transitive dependency checks, family/twin folder coupling, `Auto-Swap Ready` local version matching, 1-click **`Get Dependency`** acquisition, **`Issue & Cause Details`** diagnostics, and 1-click **`Clone Ready {Blueprint}`**.
  - **Highlander Exclusive Slots & Swap Alerts:** Pairs `mods.highlander_group_id` and Static Edge `atomic_logic.highlander_group` rules with explicit **`Swap {Mods}` / `Keep Both` / `Cancel`** prompts across `{Vault}` cards and `ModDossier` drawers—never silently evicting equipped `{Mods}`.
  - **3-Mode `{Blueprint}` Sync & Autonomous Self-Healing:** `Public`, `Unlisted`, and `Private` visibility modes, settled post-scan SHA-256 ghost healing, and concurrent Web Streams `Beam to Rig` transfers.
- **Immortal Save-Verify-and-Rewind Homestead `{Lab}`, Parallel CoW Time Capsule & Workbench:**
  - **Cheat-Proof Homestead `{Lab}`:** Externalized `SanctuarySaveVault` + immortal `{Vault}` Save Mirror, read-only **Golden Baseline** test save + disposable working copy per run with Stage 4 magic-byte corruption auditing (`audit_save_file_corruption`) and automatic teardown rewind, 100% passive anti-cheat-safe 4-stage verification (`PROCESS_QUERY_LIMITED_INFORMATION`, 4-tick post-load settle gate, pause-menu suspension, zero overlays/hooks), synthesized native PCM fullscreen chimes, 2-column **Active Test Bench**, and pinned 3-section **Known Errors** showcase.
  - **Parallel CoW Time Capsule & Additive Restores:** Multi-threaded `rayon` Copy-on-Write snapshots (`World State`, `Engine Core`, and zero-byte hardlink `Backups/Mods/` Version History with `Suite Revision Matrix` rollbacks), delta-aware `{Backups} Limit` pruning, Next-Desktop-Open & Offline DEFCON shields, and strictly **additive** `World_State` save restoration.
  - **Citizen's Workbench & 7-Domain `{Settings}`:** 60 FPS 2-column Visual Config Editor (`.sanctuary.template.json` + native INI/TOML/YAML/XML/JSON), interactive `[In-Game Engine Edit]` Diff Timeline, and a 7-domain `{Settings}` architecture with Per-Spoke Notification Muting and split `ON:` / `OFF:` toggle guides.

---

## Pillar 4: 6-Tier Governance, Pending Compliance Pipeline, Sub-Second Hubs & Zero-PII Security

Security and operational governance are enforced across 6 clearance tiers, sub-second Command Hubs, and hardware-backed cryptographic gates:

- **6-Tier Clearance Hierarchy & Strict Role Boundaries:**
  1. **Tier 1 — Citizen (`citizen`):** Full access to all 9 Citizen modules, inherited local **Open Mason Workshop** (`Sandbox`, `IDE`, `3-Tile Artifact Studio`, `Theme Forge`, `Static Edge Export` + 1-click Auto-Push), local JSON export/import, Cloud `{Blueprint}` sharing (`Public` / `Unlisted` / `Private`), and Scout Queue submissions.
  2. **Tier 2 — Verified Mason (`mason` / `isVerifiedMason`):** Direct `{Nexus}` publishing for `{Mods}`, `{Lexicons}`, `{Chameleons}`, and `Workbench Templates`, Verified Mason Queue fast-lane, Public Mason Profile showcase, and 0%-cut Supporter Bridge.
  3. **Tier 3 — Architect (`architect` — Strict Tier 0 Isolation):** Tier-0 Registry curation (`Stable` telemetry, atomic logic, conflict rules, pinned Known Error rules, live `TemplatePreviewer`), Scout & `{Mason}` Queue triage, and exclusive **`Claimed`** Citizen Support Desk queues—without ban powers or active compliance locks (routing Tier 1–4 flags into `Oversight > Compliance` as **`Pending`**).
  4. **Tier 4 — Oversight (`oversight`):** Spoke Heuristic Signatures, **`Pending` Tier 1–4 Compliance confirmation** (`purge_flagged_hash_from_blueprints` strips Cloud `{Blueprints}` only once confirmed by Oversight/Wayfinder) & Tier 5 Malware blacklisting, DEFCON 1 lockdowns, Game/DLC patch registration, read/export-only Audit Log review, and Spoke Identity Matrix governance (excluding Oversight/Wayfinders).
  5. **Tier 5 — Wayfinder (`wayfinder`):** Full Spoke Sovereignty (`Spoke Control` & `Spoke Aesthetics`), Master Schema & Lexicon Studios, in-hub `Mass Update` & `Patch Management`, Identity Matrix up to Wayfinder, 100% isolated Non-Custodial Community Donations, and unilateral **"Cut the Cord"** severance.
  6. **Tier 6 — Keeper (`keeper` on Core Hub):** Global OS Hub governance, Partner Spoke onboarding & `is_keepers_only` dev-node cloaking, Core Heuristics (`21+` rules), Keepers Core Default Schema, Global Lexicons/Chameleons, Bilateral Directives/Legal Sync, and Global Audit Logs—strictly isolated from Partner Spoke operations beyond compliance severance.
- **Sub-Second Landing-Page Command Screens & `2x3` Hub Metrics:**
  - All 5 Elevated Hubs load in under a second via `spoke_query_batch` and `hubCommandCache.ts`, opening to full-coverage landing-page overviews with section-jump headers, direct in-drawer `<SidePanel>` workflows, and right-rail `2x3` Hub Metrics.
- **FIDO2 Passkeys (Touch ID + Companion Handshake), Zero-PII Scrubber & Quarantine Lockdown:**
  - 12-hour Device-Bound Passkey Seal (`sanctuary_passkey_seal_v2`), macOS Touch ID, Live Phone/PC Companion Passkey Handshake via W3C Web Push, Tier 0 Known-Hash Architect submission gating backed by `_lab_cert_proof`, multi-OS Zero-PII log scrubbing, and 21+17 Heuristic Full-OS Quarantine SidePanel Lockdown with Citizen-signed **Secure Shred**.

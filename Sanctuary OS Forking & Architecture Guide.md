# Sanctuary OS: Forking & Spoke Architecture Guide

Sanctuary OS is architected to support three seamless deployment and forking models across **Windows**, **macOS**, and **Linux / SteamOS (Steam Deck)**:
1. **Official Hub-and-Spoke Partner Network (Zero Code Edits):** Connect your community's Supabase Spoke database ([`schema.sql`](./schema.sql)) to the official Sanctuary OS Hub ([`schema_os.sql`](./schema_os.sql)) using a `SANCTUARY-UPLINK://` bundle.
2. **True Standalone Codebase Fork (1 Database — Edit ONLY `src/supabase.ts`):** Run your own completely independent desktop/web build of Sanctuary OS backed by **a single Supabase database ([`schema.sql`](./schema.sql))**—requiring **no separate Hub database**, **no Edge Functions (`game-gateway`)**, and **editing only `SANCTUARY_CONFIG` at the top of [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts)**.
3. **Full Hub-and-Spoke Multi-Game Federation Fork (Hub DB + Multiple Spoke DBs):** Fork the entire multi-game Hub-and-Spoke ecosystem—running your own Central Core OS Hub ([`schema_os.sql`](./schema_os.sql) + `supabase/functions/game-gateway` Edge Function) connected to multiple independent community Spoke databases ([`schema.sql`](./schema.sql)).

---

## 1. True Codebase Forking (Standalone Mode — Edit Only `src/supabase.ts`)

If your community wants to fork Sanctuary OS into a standalone desktop/web application—or if you are an existing Partner community that executed **Spoke Sever (Cut the Cord)** and wants to run your own client against your existing Spoke database—you only need to edit **one file**: [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts).

### Step 1: Set Up Your Single Supabase Database (`schema.sql`)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase Dashboard.
3. Copy and paste the entire contents of [`schema.sql`](./schema.sql) (available via the **Copy `schema.sql`** button inside **Wayfinder Operations -> Spoke Control -> Forking Help & Walkthrough**, on the Landing Page Forking Matrix, or in the repository root) and click **Run**.
   - This single script provisions all Spoke tables, foreign-key indexes, triggers, `sanctuary_internal` RBAC helpers, non-permissive Row-Level Security (RLS) policies, `spoke_relink_commitments`, and the `on_auth_user_created_spoke` trigger (which automatically promotes the **very first user who signs up** in your forked app to `role = 'wayfinder'`).

### Step 2: Edit `SANCTUARY_CONFIG` at the Top of `sanctuary-os/src/supabase.ts`
Open [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts) and choose **Option A** or **Option B**:

#### Option A: 1-Line Paste (If you exported a `SANCTUARY-UPLINK://` Bundle from Spoke Control)
If you clicked **Copy Uplink Bundle** inside **Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance** (or inside the **Spoke Sever** drawer) before cutting the cord, simply paste that string into `uplinkBundle`:
```ts
export const SANCTUARY_CONFIG = {
    uplinkBundle: "SANCTUARY-UPLINK://eyJuYW1lIjoiVGhlIFNpbXMgNCIs...", // <-- Paste here! Everything else auto-configures.
    mode: "hub_and_spoke",
    // ...
};
```
Sanctuary OS will automatically decode your bundle, switch `mode` to `"standalone"`, and configure your Supabase URL, Anon/Publishable Key (`eyJ...` or `sb_publishable_*`), and Workspace identity.

#### Option B: Manual Standalone Configuration
Set `mode` to `"standalone"` and enter your Supabase Project URL, Anon/Publishable Key, and workspace metadata:
```ts
export const SANCTUARY_CONFIG = {
    uplinkBundle: "",

    // Switch from "hub_and_spoke" to "standalone"
    mode: "standalone",

    // Paste your single Supabase Project URL and Anon/Publishable Key
    supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
    supabaseAnonKey: "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY",

    // Define your game workspace
    standaloneWorkspace: {
        id: "custom_game",
        name: "My Community Workspace",
        schema_id: "default",
        icon: "sports_esports",
    },
};
```
*(Optional: You can also pass these via `.env` variables: `VITE_SANCTUARY_UPLINK_BUNDLE`, `VITE_SANCTUARY_MODE=standalone`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STANDALONE_WORKSPACE_ID`, `VITE_STANDALONE_WORKSPACE_NAME`, `VITE_STANDALONE_SCHEMA_ID`, and `VITE_GITHUB_RELEASE_REPO=your-org/your-fork-repo` for optional fork updater routing.)*

### Step 3: Launch, Claim Founding Wayfinder Clearance & Cryptographic `SRK1` Profile Relinking
1. Run the app in development or build native installers for Windows, macOS, and Linux / SteamOS:
   ```bash
   cd sanctuary-os
   npm install
   npm run tauri dev
   ```
2. If this is a brand-new database, register the **first account** on the Sign-Up screen.
   - Both the PostgreSQL `on_auth_user_created_spoke` trigger in `schema.sql` and the Standalone RPC engine in `src/supabase.ts` detect when a standalone database has `0` Wayfinders and **automatically promote the first registered user to `wayfinder`** (granting full access to **Wayfinder Operations -> Spoke Control & Spoke Aesthetics** as well as Master Schema, Lexicon, and Theme tools).
3. **Connecting an Existing Spin-Off Spoke Database & `SRK1` Legacy Profile Claiming:**
   - Enable Supabase Auth on your Spoke project; all of your existing `mods`, `masons`, `blueprints`, `collections`, `flavor_groups`, `sanctuary_schemas`, `sanctuary_lexicons`, `sanctuary_themes`, `system_broadcasts`, and `audit_logs` are immediately live.
   - To prevent username hijacking after severance, Sanctuary OS binds returning Citizens, Masons, and Staff using **Cryptographic `SRK1` Spoke Relink Commitments** (`SRK1.<hub_uuid>.<relink_secret>`, stored as a domain-separated SHA-256 commitment `sha256("sanctuary-spoke-relink-v1:" || lower(hub_uuid) || ":" || relink_secret)` inside `sanctuary_internal.spoke_relink_commitments`). Users copy their **Spoke Relink Token** from **Settings -> Account & System -> System ID** and paste it into **Claim Legacy Spoke Profile** during Standalone Sign-Up (or post-signup inside Settings) to cryptographically re-bind their historical Spoke role, Mason profile, Blueprints, and tickets to their new Standalone UUID.

### How Standalone Mode Works Under the Hood (`src/supabase.ts`)
When `isStandaloneFork` (`mode === "standalone"`) is active:
- **Unified Auth & Game Client:** `getActiveGameClient()` reuses the authenticated `supabaseAuth` client directly so your session JWT works natively across all Spoke tables without cross-project JWT mismatches.
- **Zero Edge Function Dependency:** All `secure_*` RPCs (`secure_sync_spoke_profile`, `secure_update_spoke_profile`, `secure_upsert_cloud_file`, `secure_delete_cloud_file`, `secure_update_mason_profile`, `secure_toggle_mason_follow`, `secure_fetch_notifications`, etc.) execute directly against your single Supabase database via `executeStandaloneDirectRpc` instead of calling `game-gateway`.
- **Automatic OS-to-Spoke Table Mapping:** Any internal OS queries to `sanctuary_games`, `keeper_system_broadcasts`, `keeper_dispatch_poll_votes`, `keeper_tickets`, or `keeper_support_categories` are transparently mapped to your `standaloneWorkspace` config and your Spoke's `system_broadcasts`, `dispatch_poll_votes`, `sanctuary_tickets`, and `support_categories` tables.

---

## 1B. Forking the Full Multi-Game Hub & Spoke Setup (`mode: "hub_and_spoke"`)

If you want to fork Sanctuary OS to operate your own **multi-game federation** (1 central Hub database for SSO, FIDO2 Passkeys, Keepers Core Default Schema, and Global Heuristics + multiple separate Spoke databases for each game community):

1. **Step 1 — Provision Your Central Core Hub Database (`schema_os.sql`):**
   - Create a central Supabase project for your Hub, open the SQL Editor, and run [`schema_os.sql`](./schema_os.sql).
   - Register your admin account and set `role = 'keeper'` in `public.profiles` on the Hub database.
2. **Step 2 — Set `SPOKE_VAULT_MASTER_KEY` & Deploy the `game-gateway` Edge Function to Your Hub:**
   - Generate a 256-bit (32-byte) Split-Custody envelope key, set it on your Hub project's Edge secrets, and deploy [`supabase/functions/game-gateway`](./supabase/functions/game-gateway):
     ```bash
     supabase link --project-ref YOUR_HUB_PROJECT_ID
     supabase secrets set SPOKE_VAULT_MASTER_KEY=$(openssl rand -hex 32)
     supabase functions deploy game-gateway --no-verify-jwt
     ```
     *(For zero-downtime master key rotation later, supply old hex keys in `SPOKE_VAULT_PREVIOUS_KEYS` comma-separated while switching `SPOKE_VAULT_MASTER_KEY`.)*
3. **Step 3 — Point `sanctuary-os/src/supabase.ts` at Your Core Hub:**
   - Keep `mode: "hub_and_spoke"` in `SANCTUARY_CONFIG` inside [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts) and enter your Hub project's URL and Anon/Publishable Key:
     ```ts
     export const SANCTUARY_CONFIG = {
         uplinkBundle: "",
         mode: "hub_and_spoke",
         supabaseUrl: "https://YOUR_HUB_PROJECT_ID.supabase.co",
         supabaseAnonKey: "YOUR_HUB_SUPABASE_ANON_OR_PUBLISHABLE_KEY",
     };
     ```
4. **Step 4 — Provision & Link Child Spoke Databases (`schema.sql`):**
   - For each game workspace, create a dedicated Supabase project and run [`schema.sql`](./schema.sql) in its SQL Editor.
   - Then run the gateway token mint helper in that Spoke's SQL Editor to mint your one-time `spk_gw_...` credential:
     ```sql
     SELECT public.mint_spoke_gateway_token();
     ```
   - Sign into your forked app with your `keeper` account, open **Keepers Core -> Partner Spokes**, click **+ Register Game Database**, paste the Spoke's `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or secret-free `SANCTUARY-UPLINK://` bundle), and the one-time `spk_gw_...` **Spoke Gateway Token**, and click **Test Handshake & Verify Schema**. You may also toggle **`Keepers-Only` (`is_keepers_only`)** while staging private development or test Spokes so they remain completely invisible to non-Keepers.

---

## 2. Official Hub-and-Spoke Architecture (Partner Network)

If you are joining the official Sanctuary OS multi-game network rather than forking the client, **zero code edits are required**. Sanctuary OS separates global identity and core infrastructure from community-owned game registries:

1. **The Core OS Hub ([`schema_os.sql`](./schema_os.sql)) — Governed by Keepers Core:**
   - **Zero-Knowledge Seal & FIDO2 Security Vault:** Citizens authenticate once against the Core OS Hub (`profiles` holds global `id`, `username`, `role = 'citizen' | 'keeper'`, and protected Supporter / **Nuclear Override** ban state; `auth.webauthn_credentials` paired with the AES-256-GCM local desktop passkey vault stores WebAuthn/FIDO2 hardware and biometric credentials).
   - **Mirror Uplink, Default Schema & Assets:** Hosts the baseline `default.json` **Universal Master Schema** in `sanctuary_schemas`, `system_directives` (bidirectionally synced via **Mirror Uplink** with codebase `.md` files), core `sanctuary_lexicons` (`en-default`, `en-sanctuary`), the 7 universal Core OS `sanctuary_themes`, and `keeper_heuristic_signatures` (**Bytecode Hound**).
   - **Spoke Directory & Split-Custody Double-Envelope Vault (`sanctuary_games` & `sanctuary_internal.spoke_credentials`):** `public.sanctuary_games` maps each active community workspace (`schema_id`, `supabase_url`, `supabase_anon_key`, `is_keepers_only`, and Wayfinder-governed non-custodial `donation_url` / `payment_processor`), while Spoke `spk_gw_*` gateway tokens are sealed via **HKDF-SHA256 + AES-256-GCM** bound AAD (`SPOKE_VAULT_MASTER_KEY`) and Supabase Vault (`vault.secrets`) inside `service_role`-only `sanctuary_internal.spoke_credentials` so neither DB leaks nor client queries can expose usable Spoke credentials.
   - **Batch-Coalesced API Gateway (`game-gateway` Edge Function):** Validates the Citizen's Hub JWT, enforces 5-tier Spoke RBAC across `spoke_query` and sub-second `spoke_query_batch` requests, manages content-addressed `<= 250 KB` WebP theme wallpaper uploads, and executes bilateral severance.

2. **The Community Spoke ([`schema.sql`](./schema.sql)) — Owned 100% by the Community (Wayfinder):**
   - **Sovereign Supabase Instance:** The community creates and owns their own Supabase project, with community donation fields protected by Postgres triggers (`protect_spoke_donation_fields`) so only the Spoke's Wayfinder can modify them.
   - **Spoke-Scoped 5-Tier Roles:** Each Spoke has its own `profiles` table where community roles (`wayfinder`, `oversight`, `architect`, `mason`, `citizen`) and communications bans (`is_comm_banned`) are assigned independently per game.
   - **Spoke Control & Spoke Aesthetics:** Hosts the community's own game Master Schema, relational `taxonomy` Categories, **Code-Switch** Sparse Delta Spoke Lexicons, **Liquid Glass Optics** Chameleon Themes, `mods`, `mod_versions`, `flavor_groups` (**The Highlander Rule** Exclusive Slots), `blueprints`, `collections`, Verified-Mason-governed `nexus_assets`, `citizen_staging_queue` (10 MB GZIP + AES-256-GCM **Beam to Rig** sync), `mason_posts`, `system_broadcasts`, `heuristic_signatures`, `sanctuary_tickets`, and append-only `audit_logs` (with Wayfinder >30-day retention pruning).

### Quick Reference Cheat Sheet: Linking, Rotating & Re-Linking a Spoke
1. **First-Time Spoke Link:** Run [`schema.sql`](./schema.sql) in the Spoke's Supabase SQL Editor -> run `SELECT public.mint_spoke_gateway_token();` in the Spoke SQL Editor to get a one-time `spk_gw_...` token -> open **Keepers Core -> Partner Spokes** (or **Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance**), enter `Supabase Project URL`, `Supabase Anon / Publishable Key` (or paste a secret-free `SANCTUARY-UPLINK://` bundle), and the `spk_gw_...` **Spoke Gateway Token** -> click **Test Handshake & Verify Schema** / **Save**.
2. **Routine Edits & 1-Click Rotation:** When editing Spoke metadata later, leave the **Spoke Gateway Token** input blank to preserve the existing Split-Custody Vault credential. Click **Rotate Gateway Token** inside the drawer anytime for 1-click zero-downtime rotation (60-second grace window — no SQL Editor required). Note that **Copy Uplink Bundle** exports secret-free connection metadata (`URL` + `Anon Key`) only.
3. **Re-Linking After Cut the Cord:** Severing revokes all active Spoke tokens on the Spoke and permanently purges the Hub's sealed Vault entry. To reconnect later, run `SELECT public.mint_spoke_gateway_token();` again in the Spoke SQL Editor and paste the freshly minted `spk_gw_...` token alongside the URL and Anon Key.

---

## 3. Cut the Cord (Bilateral Severance Protocol)

Under **Sovereign Covenants** ([Partners Agreement](./Partners%20Agreement.md)), both Keepers and Community Wayfinders possess unilateral authority to sever the uplink between Sanctuary OS Hub and a Spoke database at any time via a high-friction severance drawer safeguard:

- **Executing Cut the Cord (`Wayfinder Operations -> Spoke Control` or `Keepers Core -> Partner Spokes`):**
  1. Open **Cut the Cord** (**Spoke Sever**) to open the severance drawer.
  2. Click **Copy Uplink Bundle** in **Pre-Severance Uplink Backup** if you plan to paste it into `src/supabase.ts` for a standalone fork.
  3. Enter an audit reason, type **`CUT THE CORD`** to unlock the verification gate, and complete the 2-step 6-second armed confirmation.
  4. The `game-gateway` Edge Function logs the severance in both the Spoke and Hub `audit_logs`, sets `is_active = false` on `sanctuary_games`, revokes all active Spoke Gateway Tokens via `revoke_spoke_gateway_tokens()`, and **permanently purges the Spoke's sealed Vault credential from `sanctuary_internal.spoke_credentials`**.
  5. The community retains 100% ownership and control of their standalone Supabase database, and returning users can claim their historical profiles using their **`SRK1` Spoke Relink Token**.

---

## 4. Universal Master Schema Specification (`sanctuary_schemas` v12)

Instead of hardcoding file extensions, folder paths, conflict rules, or crash log names in Rust, Sanctuary OS reads a declarative Master Schema JSON from `sanctuary_schemas` (or `src/data/schemas/<schema_id>.json`) editable visually in **Schema Forge** (validated in real time against the **Keepers Core Default Schema**):

```json
{
  "id": "custom_engine",
  "game_id": "custom-engine-rpg",
  "name": "Custom Engine RPG",
  "display_name": "Custom Engine RPG",
  "default_lexicon": "en-default",
  "schema_version": 12,
  "min_scout_submissions": 5,
  "executables": [
    "Game_x64.exe",
    "Game_DX11.exe",
    "Game.app",
    "Game"
  ],
  "paths": {
    "executable_subdir": "bin/x64",
    "default_mod_dir_windows": "%USERPROFILE%/Documents/MyGame/Mods",
    "default_mod_dir_mac": "~/Documents/MyGame/Mods",
    "user_data_dir_windows": "%USERPROFILE%/Documents/MyGame",
    "user_data_dir_mac": "~/Documents/MyGame",
    "manifest_file": "loadorder.txt",
    "dlc_subdirs": ["DLC*"],
    "save_airgap_targets": ["Saves", "Profiles"]
  },
  "extensions": {
    "supported": [".pak", ".asi", ".dll"],
    "archive_containers": [".zip", ".7z", ".rar"],
    "config_extensions": [".ini", ".cfg", ".json", ".toml", ".yaml", ".xml"],
    "cache_files": ["shader_cache.bin"],
    "preserve_auxiliary_assets": true,
    "install_routes": [
      {
        "extensions": [".asi", ".dll"],
        "target_subdir": "bin/x64/plugins",
        "method": "symlink"
      }
    ]
  },
  "load_order": {
    "strategy": "manifest_list",
    "winner_direction": "higher_wins",
    "manifest_target": "loadorder.txt",
    "tiers": ["Standard Load", "Late Load", "High Priority", "Final Override"]
  },
  "conflict_analyzers": [
    { "kind": "virtual_fs_path", "default_severity": 2 },
    { "kind": "archive_member", "extensions": [".pak"], "default_severity": 3 }
  ],
  "lab_verification": {
    "save_extensions": [".sav", ".json"]
  }
}
```

---

## 5. Cross-Platform Desktop Builds (Windows, macOS & Linux / SteamOS)

Sanctuary OS compiles natively for Windows, macOS, and Linux / SteamOS via Tauri v2 (`sanctuary-os/src-tauri/tauri.conf.json`):
- **Windows Build (`SanctuaryOS.exe` / NSIS & `.msi`):**
  - Includes cryptographically signed `tauri-plugin-updater` verification and 1-click UAC unprivileged symlink privilege unlocking across drives. Run `npm run tauri build` on Windows (or via GitHub Actions `windows-latest` runner).
- **macOS Universal Build (`.dmg` & `.app` for Apple Silicon `aarch64` + Intel `x86_64`):**
  - Configured with `Entitlements.plist`, `Info.plist`, **Gatekeeper Clearance** (native Touch ID WebAuthn Passkeys + TCC/quarantine handling), and `macos-private-api` transparent window glass for custom `sanctuary://` deep-link URL schemes. Run `npm run tauri build -- --target universal-apple-darwin`.
- **Linux & SteamOS / Steam Deck Build (`.AppImage` & `.deb`):**
  - Configured with AMD RDNA2 hardware acceleration, automatic Gamescope XWayland surface binding (`GDK_BACKEND=x11`), and **Deck Overdrive** (`hidraw` + `evdev` 64-byte `SteamDeckStatePacket_t` decoding, 60 FPS Chameleon Virtual Pointer, 2D Spatial Focus, Steam OSK auto-summon, `libraryfolders.vdf` / `appmanifest_*.acf` discovery, SD card scanning at `/run/media/mmcblk0p1`, and Valve Proton prefix translation across `compatdata/<AppID>/pfx/`). Run `npm run tauri build` on Ubuntu/Linux.

---

## 6. Shared Codebase Deployment, White-Label Branding & Custom Domains

One unified codebase powers your native **Desktop client (Windows / macOS / Linux & SteamOS)**, installable **PWA**, and **Web Portal**:

1. **White-Label Identity & Live Title Area Branding (`SANCTUARY_CONFIG.branding` & `Title Area` Studio):**
   - Configure compile-time defaults in the single `SANCTUARY_CONFIG.branding` block inside `sanctuary-os/src/supabase.ts`—or via `.env` / CI build variables (`VITE_APP_TITLE`, `VITE_ORG_NAME`, `VITE_LOGO_URL`, `VITE_SUPPORT_EMAIL`, `VITE_WEBAUTHN_RP_ID`)—covering your app title, organization name, logo URL, support email, FIDO2 WebAuthn Relying Party ID, and rotating subtitles.
   - Standalone & Core Hub founders can also customize logos, app title, and rotating subtitles live from the database at runtime using **Wayfinder / Keepers -> `Chameleons` -> `Title Area` Studio** (persisted in `sanctuary_themes`, automatically syncing `document.title` and copy via `LexiconContext.tsx`).
2. **One Codebase Across Desktop, PWA & Web (`sanctuary-os/package.json`):**
   - **Web Portal & Installable PWA:** Run `npm run build:web:public` (or `npm run build:web:beta`) inside `sanctuary-os/` to emit a static single-page bundle (`dist/`) backed by `public/sw.js` and `public/manifest.webmanifest`.
   - **Native Desktop:** Run `npm run tauri build` inside `sanctuary-os/` using the exact same `src/` React views, `SANCTUARY_CONFIG`, and `.env` variables alongside the Rust backend in `src-tauri/`.
3. **Custom Domains, DNS, Supabase Auth & FIDO2 WebAuthn:**
   - **DNS Routing:** Point your apex domain or subdomain (`CNAME` / `ALIAS`) to your static host (Cloudflare Pages, Vercel, or Netlify) and configure a SPA rewrite (`/* -> /index.html 200`).
   - **Supabase Auth URLs:** In your Supabase Dashboard -> **Authentication -> URL Configuration**, set **Site URL** to `https://your-domain.com` and add `https://your-domain.com/**`, `http://localhost:1420/**`, and `sanctuary://**` to **Redirect URLs**.
   - **Passkey Domain (`rp_id`):** Set `VITE_WEBAUTHN_RP_ID` (and `SANCTUARY_CONFIG.branding.webauthnRpId`) to your exact root production domain (for example `example-mods.org`) so browser FIDO2 and Tauri native passkeys bind to the same Relying Party ID across all platforms.
4. **Icons, PWA Manifest & Sitemaps:**
   - Replace `sanctuary-os/public/icon.png` (and icon references in `public/manifest.webmanifest` / `public/sitemap.xml`), then run `npx tauri icon path/to/icon.png` inside `sanctuary-os/` to regenerate Windows `.ico`, macOS `.icns`, and Linux/PWA PNG sizes together.

<!-- SANCTUARY_DIRECTIVE_BUILDER_JSON:
{
  "slug": "forking_guide",
  "_schemaVersion": 88,
  "title": "Forking & Spoke Provisioning Matrix",
  "summary": "Interactive schematic for deploying a Sovereign Community Spoke (SANCTUARY-UPLINK://), reviewing Partner Covenants, launching a 1-file Standalone Codebase Fork (src/supabase.ts), or building cross-platform Master Schemas.",
  "tabs": [
    {
      "id": "spoke",
      "icon": "hub",
      "label": "STEP 1",
      "value": "Spoke Setup",
      "cards": [
        {
          "id": "fork_spoke_setup",
          "icon": "hub",
          "overline": "OFFICIAL PARTNER NETWORK • ZERO CODE EDITS",
          "badge": "Active",
          "title": "Connect a Sovereign Community Spoke in 3 Steps",
          "footerMeta": "SANCTUARY-UPLINK:// • schema.sql",
          "desc": "Join the official Sanctuary OS multi-game network while retaining 100% ownership of your community's Supabase PostgreSQL database. No client forking or code edits required.",
          "subCards": [
            {
              "id": "fork_spoke_s1",
              "icon": "database",
              "title": "Step 1: Initialize Your Supabase Spoke (schema.sql) & Mint Token",
              "desc": "Create a free Supabase project, open the SQL Editor, run schema.sql (52 tables, RLS, and gateway auth), then run SELECT public.mint_spoke_gateway_token(); to mint your one-time spk_gw_... token."
            },
            {
              "id": "fork_spoke_s2",
              "icon": "key",
              "title": "Step 2: Configure Uplink Bundle & Scoped Gateway Token",
              "desc": "In Keepers Core -> Partner Spokes (or Wayfinder Operations -> Spoke Control), paste your secret-free SANCTUARY-UPLINK:// bundle (Supabase URL + Anon Key) and your spk_gw_... token to seal it inside the Split-Custody Hub Vault. Rotate anytime later in 1 click."
            },
            {
              "id": "fork_spoke_s3",
              "icon": "rocket_launch",
              "title": "Step 3: Verify Handshake & Provision Founding Wayfinder",
              "desc": "Click 'Test Handshake & Verify Schema'. The game-gateway Edge Function verifies table readiness, seeds global_network_status, and automatically promotes your founder account to Wayfinder."
            }
          ]
        },
        {
          "id": "fork_spoke_covenants",
          "icon": "gavel",
          "overline": "PARTNER APPLICATION • SOVEREIGN COVENANTS",
          "badge": "Verified",
          "title": "Readiness-Gated Partner Application & Sovereign Covenants",
          "footerMeta": "Partners Agreement • Compliance Protocol",
          "desc": "Prospective community leaders can apply directly from the Landing Page after inspecting and accepting the Sanctuary Partners Agreement and Compliance Protocol.",
          "subCards": [
            {
              "id": "fork_cov_s1",
              "icon": "handshake",
              "title": "Mandatory Partners Agreement & Compliance Review",
              "desc": "Both covenants open in an interactive overlay drawer during Step 1 of the Partner Application and remain permanently accessible inside Wayfinder Hub -> Spoke Maintenance."
            },
            {
              "id": "fork_cov_s2",
              "icon": "link_off",
              "title": "Community-Initiated Severance ('Cut the Cord')",
              "desc": "A Wayfinder can execute the phrase-locked 'Cut the Cord' safeguard in Wayfinder Operations at any time—writing an append-only audit log, setting is_active = false, revoking all Spoke Gateway Tokens, and purging the Spoke's sealed Vault credential from the Hub."
            },
            {
              "id": "fork_cov_s3",
              "icon": "volunteer_activism",
              "title": "0% Platform Tax & Non-Custodial Community Donations",
              "desc": "Sanctuary OS takes 0% of {mason} Patreon/Ko-fi revenue and 0% of Partner community donations. Export your SANCTUARY-UPLINK:// bundle at any time."
            }
          ]
        }
      ]
    },
    {
      "id": "standalone",
      "icon": "call_split",
      "label": "Step 2",
      "value": "Fork Modes",
      "cards": [
        {
          "id": "fork_mode_standalone",
          "icon": "call_split",
          "overline": "MODE 1 • 1-DATABASE STANDALONE",
          "badge": "1-File Fork",
          "title": "1-File Standalone Fork (Single Database)",
          "footerMeta": "schema.sql • src/supabase.ts",
          "desc": "Run your own independent Sanctuary OS build backed by a single Supabase project (schema.sql) and a 1-file edit in src/supabase.ts with zero Edge Functions.",
          "subCards": [
            {
              "id": "fork_m1_s1",
              "icon": "bolt",
              "title": "1. Unified Auth & Direct RPC Engine",
              "desc": "When mode is set to 'standalone', Sanctuary OS automatically routes all 15 secure_* RPCs directly against your single Supabase database with zero Edge Function dependency."
            },
            {
              "id": "fork_m1_s2",
              "icon": "verified",
              "title": "2. Founding Wayfinder & Cryptographic Spoke Profile Relinking",
              "desc": "In federated mode, auth.users lives on the Hub while Spokes store public.profiles and zero-PII SHA-256 relink commitments. When transitioning a severed Spoke to a Standalone Fork, on_auth_user_created_spoke promotes the first local auth.users signup to Wayfinder, and {Citizens} or {Masons} verify their Spoke Relink Token (SRK1.<uuid>.<secret>) at sign-up or in {Settings} -> System ID to cryptographically reclaim their legacy Spoke profile, {Mason} studio, and {Blueprints} without username hijacking."
            },
            {
              "id": "fork_m1_s3",
              "icon": "storage",
              "title": "3. Transparent OS-to-Spoke Table Mapping",
              "desc": "All internal queries to global broadcasts, polls, and support categories automatically map to your single database's system_broadcasts, dispatch_poll_votes, and support_tickets tables."
            }
          ]
        },
        {
          "id": "fork_mode_hub",
          "icon": "hub",
          "overline": "MODE 2 • FULL HUB & SPOKE FEDERATION",
          "badge": "Hub & Spokes",
          "title": "Full Hub & Spoke Multi-Game Fork (Hub + Child Spokes)",
          "footerMeta": "schema_os.sql + schema.sql • game-gateway",
          "desc": "Self-host your own central Sanctuary OS Hub (schema_os.sql + game-gateway Edge Function) that authenticates users once and routes across multiple independent community Spoke databases (schema.sql).",
          "subCards": [
            {
              "id": "fork_m2_s1",
              "icon": "memory",
              "title": "1. Provision Core Hub Database (schema_os.sql)",
              "desc": "Create your central Hub Supabase project and run schema_os.sql in the SQL Editor. This provisions global SSO profiles, auth.webauthn_credentials FIDO2 passkeys, sanctuary_games, sanctuary_schemas, system_directives, and keeper_heuristic_signatures."
            },
            {
              "id": "fork_m2_s2",
              "icon": "cloud_done",
              "title": "2. Set SPOKE_VAULT_MASTER_KEY & Deploy game-gateway",
              "desc": "Generate a 256-bit Split-Custody key (supabase secrets set SPOKE_VAULT_MASTER_KEY=<64-hex-chars>) and deploy supabase/functions/game-gateway to your Hub project to proxy verified cross-database Spoke RPCs."
            },
            {
              "id": "fork_m2_s3",
              "icon": "code",
              "title": "3. Point src/supabase.ts at Your Core Hub",
              "desc": "Keep mode set to 'hub_and_spoke' in src/supabase.ts (or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env) pointing to your central Hub project's URL and Anon Key."
            },
            {
              "id": "fork_m2_s4",
              "icon": "storage",
              "title": "4. Provision & Link Child Spoke Databases (schema.sql)",
              "desc": "For each game community, create a separate Supabase project, run schema.sql, execute SELECT public.mint_spoke_gateway_token(); in the SQL Editor, and register its URL, Anon Key, and spk_gw_... token in Keepers Core -> Partner Spokes."
            }
          ]
        },
        {
          "id": "fork_mode_schema",
          "icon": "schema",
          "overline": "MODE 3 • MASTER GAME SCHEMAS & CROSS-PLATFORM",
          "badge": "7 Engine Presets",
          "title": "Master Schema Studio & Windows/macOS/Linux Build Pipeline",
          "footerMeta": "schema.json • Windows .msi, Darwin .dmg & Linux / SteamOS .AppImage/.deb",
          "desc": "Adapt Sanctuary OS to any game engine without touching Rust or React code by configuring a declarative Master Schema JSON in Wayfinder or Keepers IDE.",
          "subCards": [
            {
              "id": "fork_m3_s1",
              "icon": "schema",
              "title": "7 Built-In Engine Architecture Presets",
              "desc": "1-click templates for Binary Chunk + Script, Multi-Folder Asset Tree, Ordered Load List, Virtual Archive Container, XML Load Manifest, JSON Mod Loader, and Universal engines."
            },
            {
              "id": "fork_m3_s2",
              "icon": "laptop_mac",
              "title": "Windows (.exe), macOS (.app) & Linux / SteamOS Parity",
              "desc": "Supports Windows %USERPROFILE%, macOS ~/Documents & /Applications/*.app bundles, and Linux / SteamOS Proton compatdata prefixes, plus Windows .msi, universal-apple-darwin .dmg, and Linux .AppImage/.deb builds."
            }
          ]
        }
      ]
    },
    {
      "id": "deploy",
      "icon": "language",
      "label": "STEP 3",
      "value": "Deploy & Domains",
      "cards": [
        {
          "id": "fork_deploy_branding",
          "icon": "palette",
          "overline": "WHITE-LABEL BRANDING • ZERO SCATTERED EDITS",
          "badge": "Title Area Studio",
          "title": "Centralized Brand Identity (SANCTUARY_CONFIG.branding & Database Title Area)",
          "footerMeta": "src/supabase.ts • VITE_APP_TITLE • sanctuary_themes",
          "desc": "Customize every app title, organization name, logo, support email, WebAuthn Relying Party ID, and rotating subtitle from SANCTUARY_CONFIG.branding / VITE_* env vars—or edit them live from the database in Wayfinder / Keepers -> Chameleons -> Title Area Studio.",
          "subCards": [
            {
              "id": "fork_deploy_b1",
              "icon": "tune",
              "title": "Compile-Time Env Vars & Uplink Bundles",
              "desc": "Set VITE_APP_TITLE, VITE_ORG_NAME, VITE_LOGO_URL, VITE_SUPPORT_EMAIL, and VITE_WEBAUTHN_RP_ID in .env (or embed branding in SANCTUARY-UPLINK://), and LexiconContext automatically updates copy and document.title."
            },
            {
              "id": "fork_deploy_b2",
              "icon": "auto_awesome",
              "title": "Database-Driven Title Area Studio",
              "desc": "Both Core Hubs and Standalone Forks unlock Title Area Studio inside Chameleons to push live logos, app names, and subtitles via sanctuary_themes without rebuilding binaries."
            }
          ]
        },
        {
          "id": "fork_deploy_targets",
          "icon": "devices",
          "overline": "SHARED CODEBASE • DESKTOP, PWA & WEB",
          "badge": "Single Repo",
          "title": "Build Desktop App, Installable PWA & Web Portal From One Codebase",
          "footerMeta": "package.json • dist/ • src-tauri/target/",
          "desc": "One React + Vite + Tauri codebase deploys everywhere: static web portal, offline-capable PWA, and native desktop builds sharing identical SANCTUARY_CONFIG and environment variables.",
          "subCards": [
            {
              "id": "fork_deploy_t1",
              "icon": "public",
              "title": "Web Portal & PWA (npm run build:web:public)",
              "desc": "Run npm run build:web:public (or build:web:beta) inside sanctuary-os/ to output dist/ with public/sw.js and public/manifest.webmanifest ready for Cloudflare Pages, Vercel, or Netlify."
            },
            {
              "id": "fork_deploy_t2",
              "icon": "desktop_windows",
              "title": "Native Desktop Binaries & Brand Icons",
              "desc": "Replace public/icon.png, run npx tauri icon path/to/icon.png to regenerate Windows/macOS/Linux assets, and compile installers with npm run tauri build."
            }
          ]
        },
        {
          "id": "fork_deploy_domains",
          "icon": "dns",
          "overline": "CUSTOM DOMAINS • AUTH & PASSKEYS",
          "badge": "HTTPS + WebAuthn",
          "title": "Domain DNS, Supabase Auth Redirects & Cross-Platform Passkeys",
          "footerMeta": "CNAME / ALIAS • Auth Redirects • rp_id",
          "desc": "Link your custom domain cleanly across web, mobile PWA, and native desktop deep links without breaking OAuth callbacks or FIDO2 passkeys.",
          "subCards": [
            {
              "id": "fork_deploy_d1",
              "icon": "link",
              "title": "DNS Records & Supabase Redirect Allowlist",
              "desc": "Point CNAME/ALIAS records to your static host with SPA fallback to /index.html, then set Site URL and add https://your-domain.com/**, http://localhost:1420/**, and sanctuary://** in Supabase Auth URL Configuration."
            },
            {
              "id": "fork_deploy_d2",
              "icon": "fingerprint",
              "title": "Matching WebAuthn rp_id Across Web & Desktop",
              "desc": "Set VITE_WEBAUTHN_RP_ID to your apex/host domain (such as example-mods.org) so passkeys enrolled in the browser validate inside desktop builds too."
            }
          ]
        }
      ]
    },
    {
      "id": "sql",
      "icon": "database",
      "label": "STEP 4",
      "value": "SQL Schemas",
      "cards": [
        {
          "id": "fork_sql_spoke",
          "icon": "storage",
          "overline": "Spoke & Standalone DB • 52 Tables",
          "badge": "schema.sql",
          "title": "schema.sql (52 Tables)",
          "footerMeta": "Community Spoke & Standalone Fork SQL",
          "desc": "Idempotent copy-paste community registry schema (mods, blueprints, citizen_staging_queue, masons, conflicts, tickets, heuristics, pending-flag triggers, RLS policies, and Founding Wayfinder trigger).",
          "subCards": []
        },
        {
          "id": "fork_sql_hub",
          "icon": "dns",
          "overline": "Core Hub Federation DB • 22 Tables",
          "badge": "schema_os.sql",
          "title": "schema_os.sql (Core Hub DB)",
          "footerMeta": "Central Multi-Game Federation SQL",
          "desc": "Central multi-game federation schema (global SSO profiles, FIDO2 passkeys, sanctuary_games directory, master schemas, global lexicons/themes, and core heuristics).",
          "subCards": []
        }
      ]
    }
  ],
  "_bodySig": 1821606791,
  "isActive": true
}
-->

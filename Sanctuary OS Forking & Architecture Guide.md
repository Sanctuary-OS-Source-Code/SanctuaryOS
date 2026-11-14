# Sanctuary OS: Forking & Spoke Architecture Guide

**Document Version:** v0.6.0-Dev.13  
**Last Updated:** November 14, 2026  

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
*(Optional: You can also pass these via `.env` variables: `VITE_SANCTUARY_UPLINK_BUNDLE`, `VITE_SANCTUARY_MODE=standalone`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STANDALONE_WORKSPACE_ID`, `VITE_STANDALONE_WORKSPACE_NAME`, `VITE_STANDALONE_SCHEMA_ID`.)*

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
2. **Step 2 — Deploy the `game-gateway` Edge Function to Your Hub:**
   - Link the Supabase CLI to your Hub project and deploy [`supabase/functions/game-gateway`](./supabase/functions/game-gateway):
     ```bash
     supabase link --project-ref YOUR_HUB_PROJECT_ID
     supabase functions deploy game-gateway
     ```
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
4. **Step 4 — Provision & Connect Child Spoke Databases (`schema.sql`):**
   - For each game workspace, create a dedicated Supabase project and run [`schema.sql`](./schema.sql).
   - Sign into your forked app with your `keeper` account, open **Keepers Core -> Active Workspaces**, click **+ Register Game Database**, paste the Spoke's `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (supports both legacy JWT and modern `sb_publishable_*` / `sb_secret_*` keys, or a `SANCTUARY-UPLINK://` bundle), and click **Test Handshake & Verify Schema**. You may also toggle **`Keepers-Only` (`is_keepers_only`)** while staging private development or test Spokes so they remain completely invisible to non-Keepers.

---

## 2. Official Hub-and-Spoke Architecture (Partner Network)

If you are joining the official Sanctuary OS multi-game network rather than forking the client, **zero code edits are required**. Sanctuary OS separates global identity and core infrastructure from community-owned game registries:

1. **The Core OS Hub ([`schema_os.sql`](./schema_os.sql)) — Governed by Keepers Core:**
   - **Single Sign-On (SSO) Identity & FIDO2 Security Vault:** Citizens authenticate once against the Core OS Hub (`profiles` holds global `id`, `username`, `role = 'citizen' | 'keeper'`, and protected Supporter / ban state; `user_passkeys` stores WebAuthn/FIDO2 hardware and biometric credentials).
   - **Keepers Core Default Schema, Directives & Assets:** Hosts the baseline `default.json` Master Schema in `sanctuary_schemas`, `system_directives` (bidirectionally synced with the codebase `.md` files), core `sanctuary_lexicons` (`en-default`, `en-sanctuary`), the 7 universal Core OS `sanctuary_themes`, and `keeper_heuristic_signatures` (Baseline Global Antivirus).
   - **Spoke Directory & Isolated Secret Vault (`sanctuary_games` & `sanctuary_game_secrets`):** `public.sanctuary_games` maps each active community workspace (`schema_id`, `supabase_url`, `supabase_anon_key`, `is_keepers_only`, and Wayfinder-governed non-custodial `donation_url` / `payment_processor`), while Spoke `supabase_service_key` credentials are vaulted strictly inside `service_role`-only `public.sanctuary_game_secrets` so service keys can never be read by client queries.
   - **Batch-Coalesced API Gateway (`game-gateway` Edge Function):** Validates the Citizen's Hub JWT, enforces 5-tier Spoke RBAC across `spoke_query` and sub-second `spoke_query_batch` requests, manages content-addressed `<= 250 KB` WebP theme wallpaper uploads, and executes bilateral severance.

2. **The Community Spoke ([`schema.sql`](./schema.sql)) — Owned 100% by the Community (Wayfinder):**
   - **Sovereign Supabase Instance:** The community creates and owns their own Supabase project, with community donation fields protected by Postgres triggers (`protect_spoke_donation_fields`) so only the Spoke's Wayfinder can modify them.
   - **Spoke-Scoped 5-Tier Roles:** Each Spoke has its own `profiles` table where community roles (`wayfinder`, `oversight`, `architect`, `mason`, `citizen`) and communications bans (`is_comm_banned`) are assigned independently per game.
   - **Spoke Control & Spoke Aesthetics:** Hosts the community's own game Master Schema, Sparse Delta Spoke Lexicons, Chameleon Themes, `mods`, `mod_versions`, `flavor_groups` (Highlander Exclusive Slots), `blueprints`, `collections`, Verified-Mason-governed `nexus_assets`, `citizen_staging_queue` (10 MB GZIP + AES-256-GCM Zero-PII sync), `mason_posts`, `system_broadcasts`, `heuristic_signatures`, `sanctuary_tickets`, and immutable `audit_logs`.

---

## 3. Bilateral Sovereignty: High-Friction "Cut the Cord" (Severance Protocol)

Under the [Partners Agreement](./Partners%20Agreement.md), both Keepers and Community Wayfinders possess unilateral authority to sever the uplink between Sanctuary OS Hub and a Spoke database at any time via a high-friction `<SidePanel>` safeguard:

- **Executing Bilateral Severance (`Wayfinder Operations -> Spoke Control` or `Keepers Core -> Partner Spokes`):**
  1. Open **Spoke Sever (Cut the Cord)** to open the severance `<SidePanel>`.
  2. Click **Copy Uplink Bundle** in **Pre-Severance Uplink Backup** if you plan to paste it into `src/supabase.ts` for a standalone fork.
  3. Enter an audit reason, type **`CUT THE CORD`** to unlock the verification gate, and complete the 2-step 6-second armed confirmation.
  4. The `game-gateway` Edge Function logs the severance in both the Spoke and Hub `audit_logs`, sets `is_active = false` on `sanctuary_games`, and **permanently scrubs (`NULL`s / deletes) the Spoke's `supabase_service_key` from `public.sanctuary_game_secrets`**.
  5. The community retains 100% ownership and control of their standalone Supabase database, and returning users can claim their historical profiles using their **`SRK1` Spoke Relink Token**.

---

## 4. 100% Game-Agnostic Master Schema v2 Specification (`sanctuary_schemas` v12)

Instead of hardcoding file extensions, folder paths, conflict rules, or crash log names in Rust, Sanctuary OS reads a declarative Master Schema JSON from `sanctuary_schemas` (or `src/data/schemas/<schema_id>.json`) editable visually in the **4-Tab Master Schema Studio** (validated in real time against the **Keepers Core Default Schema**):

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
  - Configured with `Entitlements.plist`, `Info.plist`, native **Touch ID** WebAuthn Passkeys, and `macos-private-api` transparent window glass for macOS TCC Documents/Application Support access and custom `sanctuary://` deep-link URL schemes. Run `npm run tauri build -- --target universal-apple-darwin`.
- **Linux & SteamOS / Steam Deck Build (`.AppImage` & `.deb`):**
  - Configured with AMD RDNA2 hardware acceleration, automatic Gamescope XWayland surface binding (`GDK_BACKEND=x11`), a **Full-OS `hidraw` + `evdev` Controller Engine** (64-byte `SteamDeckStatePacket_t` trackpad/button decoding, 60 FPS Chameleon Virtual Pointer, 2D Spatial Focus, and Steam OSK auto-summon), `libraryfolders.vdf` / `appmanifest_*.acf` discovery, SD card mount scanning (`/run/media/mmcblk0p1`), and Valve Proton prefix translation (`compatdata/<AppID>/pfx/drive_c/users/steamuser/`). Run `npm run tauri build` on Ubuntu/Linux.

# Sanctuary OS: Forking & Spoke Architecture Guide

**Document Version:** v0.5.8-Dev.5  
**Last Updated:** October 28, 2026  

Sanctuary OS is architected to support three seamless deployment and forking models across Windows and macOS:
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
   - This single script provisions all 36 tables, indexes, triggers, helper RPCs, Row-Level Security (RLS) policies, and the `on_auth_user_created_spoke` trigger (which automatically promotes the **very first user who signs up** in your forked app to `role = 'wayfinder'`).

### Step 2: Edit `SANCTUARY_CONFIG` at the Top of `sanctuary-os/src/supabase.ts`
Open [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts) (lines 7–35) and choose **Option A** or **Option B**:

#### Option A: 1-Line Paste (If you exported a `SANCTUARY-UPLINK://` Bundle from Spoke Control)
If you clicked **Copy Uplink Bundle** inside **Wayfinder Operations -> Spoke Control -> Spoke Setup & Maintenance** (or inside the **Spoke Sever** drawer) before cutting the cord, simply paste that string into `uplinkBundle`:
```ts
export const SANCTUARY_CONFIG = {
    uplinkBundle: "SANCTUARY-UPLINK://eyJuYW1lIjoiVGhlIFNpbXMgNCIs...", // <-- Paste here! Everything else auto-configures.
    mode: "hub_and_spoke",
    // ...
};
```
Sanctuary OS will automatically decode your bundle, switch `mode` to `"standalone"`, and configure your Supabase URL, Anon Key, and Workspace identity.

#### Option B: Manual Standalone Configuration
Set `mode` to `"standalone"` and enter your Supabase Project URL, Anon Key, and workspace metadata:
```ts
export const SANCTUARY_CONFIG = {
    uplinkBundle: "",

    // Switch from "hub_and_spoke" to "standalone"
    mode: "standalone",

    // Paste your single Supabase Project URL and Anon/Publishable Key
    supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
    supabaseAnonKey: "YOUR_SUPABASE_ANON_PUBLIC_KEY",

    // Define your game workspace
    standaloneWorkspace: {
        id: "sims4",
        name: "The Sims 4",
        schema_id: "sims4",
        icon: "sports_esports",
    },
};
```
*(Optional: You can also pass these via `.env` variables: `VITE_SANCTUARY_UPLINK_BUNDLE`, `VITE_SANCTUARY_MODE=standalone`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STANDALONE_WORKSPACE_ID`, `VITE_STANDALONE_WORKSPACE_NAME`, `VITE_STANDALONE_SCHEMA_ID`.)*

### Step 3: Launch & Claim Founding Wayfinder Clearance
1. Run the app in development or build native installers for Windows and macOS:
   ```bash
   cd sanctuary-os
   npm install
   npm run tauri dev
   ```
2. If this is a brand-new database, register the **first account** on the Sign-Up screen.
   - Both the PostgreSQL `on_auth_user_created_spoke` trigger in `schema.sql` and the Standalone RPC engine in `src/supabase.ts` detect when a standalone database has `0` Wayfinders and **automatically promote the first registered user to `wayfinder`** (granting full access to **Wayfinder Operations -> Spoke Control & Spoke Aesthetics** as well as Master Schema, Lexicon, and Theme tools).
3. If you are connecting an existing Spoke database after cutting the cord, simply enable Supabase Auth (Email/Password) on your Spoke project; all of your existing `mods`, `masons`, `blueprints`, `conflicts`, `sanctuary_schemas`, `sanctuary_lexicons`, `sanctuary_themes`, `system_broadcasts`, and `audit_logs` are immediately live.

### How Standalone Mode Works Under the Hood (`src/supabase.ts`)
When `isStandaloneFork` (`mode === "standalone"`) is active:
- **Unified Auth & Game Client:** `getActiveGameClient()` reuses the authenticated `supabaseAuth` client directly so your session JWT works natively across all Spoke tables without JWT secret collisions.
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
   - Keep `mode: "hub_and_spoke"` in `SANCTUARY_CONFIG` inside [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts) and enter your Hub project's URL and Anon Key:
     ```ts
     export const SANCTUARY_CONFIG = {
         uplinkBundle: "",
         mode: "hub_and_spoke",
         supabaseUrl: "https://YOUR_HUB_PROJECT_ID.supabase.co",
         supabaseAnonKey: "YOUR_HUB_SUPABASE_ANON_KEY",
     };
     ```
4. **Step 4 — Provision & Connect Child Spoke Databases (`schema.sql`):**
   - For each game workspace, create a dedicated Supabase project and run [`schema.sql`](./schema.sql).
   - Sign into your forked app with your `keeper` account, open **Keepers Core -> Active Workspaces**, click **+ Register Game Database**, paste the Spoke's `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (or a `SANCTUARY-UPLINK://` bundle), and click **Test Handshake & Verify Schema**.

---

## 2. Official Hub-and-Spoke Architecture (Partner Network)

If you are joining the official Sanctuary OS multi-game network rather than forking the client, **zero code edits are required**. Sanctuary OS separates global identity and core infrastructure from community-owned game registries:

1. **The Core OS Hub ([`schema_os.sql`](./schema_os.sql)) — Governed by Keepers Core:**
   - **Single Sign-On (SSO) Identity & FIDO2 Security Vault:** Citizens authenticate once against the Core OS Hub (`profiles` table holds global `id`, `username`, `email`, `role = 'citizen' | 'keeper'`, and global hardware/network ban status; `user_passkeys` stores WebAuthn/FIDO2 hardware credentials).
   - **Keepers Core Default Schema, Directives & Assets:** Hosts the baseline `default.json` Master Schema in `sanctuary_schemas`, `system_directives` (bidirectionally synced with the codebase `.md` files), core `sanctuary_lexicons` (`en-default`, `en-sanctuary`), `sanctuary_themes`, and `keeper_heuristic_signatures` (Baseline Global Antivirus).
   - **Spoke Directory (`sanctuary_games`):** Maps each active community workspace (`schema_id`, `supabase_url`, `supabase_anon_key`, non-custodial `donation_url` / `payment_processor`, and server-only `supabase_service_key`).
   - **API Gateway (`game-gateway` Edge Function):** Validates the Citizen's Hub JWT and executes authenticated mutations, role checks, and bilateral severance against the active Spoke database.

2. **The Community Spoke ([`schema.sql`](./schema.sql)) — Owned 100% by the Community (Wayfinder):**
   - **Sovereign Supabase Instance:** The community creates and owns their own Supabase project.
   - **Spoke-Scoped 5-Tier Roles:** Each Spoke has its own `profiles` table where community roles (`wayfinder`, `oversight`, `architect`, `mason`, `citizen`) and communications bans (`is_comm_banned`) are assigned independently per game.
   - **Spoke Control & Spoke Aesthetics:** Hosts the community's own game Master Schema (`sims4.json`, etc.), Spoke Lexicons (`en-sims.json`, `Simlish.json`, or custom packs), Chameleon Themes, `mods`, `mod_versions`, `blueprints`, `collections`, `nexus_assets`, `mason_posts`, `system_broadcasts`, `dispatch_poll_votes`, `heuristic_signatures`, `sanctuary_tickets`, and immutable `audit_logs`.

---

## 3. Bilateral Sovereignty: "Cut the Cord" (Severance Protocol)

Under the [Partners Agreement](./Partners%20Agreement.md), both Keepers and Community Wayfinders possess unilateral authority to sever the uplink between Sanctuary OS Hub and a Spoke database at any time:

- **Community-Initiated Severance (`Wayfinder Operations -> Spoke Control`):**
  1. Open **Wayfinder Operations -> Spoke Control** and click the **Spoke Sever (Cut the Cord)** card.
  2. Click **Copy Uplink Bundle** in the **Pre-Severance Uplink Backup** card if you plan to paste it into `src/supabase.ts` for a standalone fork.
  3. Optionally enter a severance reason for the immutable Audit Trail and double-click **Cut the Cord**.
  4. The `game-gateway` Edge Function logs the severance in both the Spoke and Hub `audit_logs`, sets `is_active = false` on `sanctuary_games`, and **immediately scrubs (`NULL`s) the Spoke's `supabase_service_key` from the Hub database**.
  5. The community retains 100% ownership and control of their standalone Supabase database.

---

## 4. 100% Game-Agnostic Master Schema Specification (`sanctuary_schemas` v10)

Instead of hardcoding file extensions, folder paths, or crash log names in Rust, Sanctuary OS reads a declarative Master Schema JSON from `sanctuary_schemas` (or `src/data/schemas/<schema_id>.json`) editable visually in the **4-Tab Master Schema Studio** (with real-time validation against the **Keepers Core Default Schema**):

```json
{
  "id": "sims4",
  "game_id": "the-sims-4",
  "name": "The Sims 4",
  "display_name": "The Sims 4",
  "default_lexicon": "en-sims",
  "schema_version": 10,
  "min_scout_submissions": 5,
  "executables": [
    "TS4_x64.exe",
    "TS4.exe",
    "TS4_DX9_x64.exe",
    "The Sims 4.app",
    "The Sims 4"
  ],
  "paths": {
    "executable_subdir": "Game/Bin",
    "default_mod_dir_windows": "%USERPROFILE%/Documents/Electronic Arts/The Sims 4/Mods",
    "default_mod_dir_mac": "~/Documents/Electronic Arts/The Sims 4/Mods",
    "user_data_dir_windows": "%USERPROFILE%/Documents/Electronic Arts/The Sims 4",
    "user_data_dir_mac": "~/Documents/Electronic Arts/The Sims 4",
    "manifest_file": "Resource.cfg",
    "dlc_subdirs": ["Delta", "EP*", "GP*", "SP*", "FP*"],
    "launch_args_dlc_mask_template": "-disablepacks:{packs}",
    "save_airgap_targets": ["saves", "Tray", "Options.ini"]
  },
  "extensions": {
    "supported": [".package", ".ts4script", ".world"],
    "config_extensions": [".ini", ".cfg", ".json", ".toml", ".yaml"],
    "cache_files": ["localthumbcache.package", "avatarcache.package", "localsimtexturecache.package"],
    "install_routes": [
      {
        "extensions": [".world"],
        "target_subdir": "SaveData/Worlds",
        "method": "symlink"
      }
    ]
  },
  "load_order": {
    "strategy": "folder_priority",
    "winner_direction": "higher_wins",
    "manifest_target": "Resource.cfg",
    "tiers": ["Base", "Sanctuary1", "Sanctuary2", "Sanctuary3"]
  },
  "lab_verification": {
    "save_extensions": [".save", ".ver0", ".ver1", ".ver2", ".ver3", ".ver4"]
  }
}
```

---

## 5. Cross-Platform Desktop Builds (Windows & macOS)

Sanctuary OS compiles natively for both Windows and macOS via Tauri v2 (`sanctuary-os/src-tauri/tauri.conf.json`):
- **Windows Build (`.exe` / NSIS & `.msi`):**
  - Run `npm run tauri build` on Windows (or via GitHub Actions `windows-latest` runner).
- **macOS Universal Build (`.dmg` & `.app` for Apple Silicon `aarch64` + Intel `x86_64`):**
  - Configured with `sanctuary-os/src-tauri/Entitlements.plist` and `Info.plist` for macOS TCC Documents/Application Support access and custom `sanctuary://` deep-link URL schemes.
  - Run `npm run tauri build -- --target universal-apple-darwin` on macOS (or via GitHub Actions `macos-latest` runner — no physical Mac required for CI/CD release builds).

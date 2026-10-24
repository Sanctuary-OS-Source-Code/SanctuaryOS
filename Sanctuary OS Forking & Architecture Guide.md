# Sanctuary OS: Forking & Spoke Architecture Guide

> **Document Version**: V0.5.8-Dev.3 (Hub-and-Spoke, Single-File Standalone Fork & Embedded SQL Edition)  
> **Last Updated**: October 24, 2026  
> **Sync Pipeline**: Synced bidirectionally between `Sanctuary OS Forking & Architecture Guide.md` and **Keepers Core -> System Directives (`public.system_directives`)**.

Welcome to the **Sanctuary OS Forking & Spoke Architecture Guide**. Sanctuary OS is architected to support two seamless deployment models:
1. **Official Hub-and-Spoke Partner Network (Zero Code Edits)**: Connect your community's Supabase Spoke database ([`schema.sql`](./schema.sql)) to the official Sanctuary OS Hub ([`schema_os.sql`](./schema_os.sql)) using a `SANCTUARY-UPLINK://` bundle.
2. **True Standalone Codebase Fork (Edit ONLY `src/supabase.ts`)**: Run your own completely independent build of Sanctuary OS backed by **a single Supabase database ([`schema.sql`](./schema.sql))**—requiring **no separate Hub database**, **no Edge Functions (`game-gateway`)**, and **editing only `SANCTUARY_CONFIG` at the top of [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts)**.

---

## 1. True Codebase Forking (Standalone Mode — Edit Only `src/supabase.ts`)

If your community wants to fork Sanctuary OS into a standalone desktop/web application—or if you are an existing Partner community that clicked **Cut the Cord** and wants to run your own client against your existing Spoke database—you only need to edit **one file**: [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts).

### Step 1: Set Up Your Single Supabase Database (`schema.sql`)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase Dashboard.
3. Copy and paste the entire contents of [`schema.sql`](./schema.sql) (available directly in the interactive **SQL Schemas** tab of the Forking Matrix in Sanctuary OS or in the repository root) and click **Run**.
   - This single script provisions all 36 tables, indexes, triggers, helper RPCs, Row-Level Security (RLS) policies, and the `on_auth_user_created_spoke` trigger (which automatically promotes the **very first user who signs up** in your forked app to `role = 'wayfinder'`).

### Step 2: Edit `SANCTUARY_CONFIG` at the Top of `sanctuary-os/src/supabase.ts`
Open [`sanctuary-os/src/supabase.ts`](./sanctuary-os/src/supabase.ts) (lines 7–35) and choose **Option A** or **Option B**:

#### Option A: 1-Line Paste (If you exported a `SANCTUARY-UPLINK://` Bundle from Wayfinder Hub)
If you clicked **Copy Bundle** inside **Wayfinder Hub -> Spoke Uplink & Sovereignty** before cutting the cord, simply paste that string into `uplinkBundle`:
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
1. Run the app:
   ```bash
   cd sanctuary-os
   npm install
   npm run tauri dev
   ```
2. If this is a brand-new database, register the **first account** on the Sign-Up screen.
   - Both the PostgreSQL `on_auth_user_created_spoke` trigger in `schema.sql` and the Standalone RPC engine in `src/supabase.ts` detect when a standalone database has `0` Wayfinders and **automatically promote the first registered user to `wayfinder`** (granting full access to both **Wayfinder Hub** and **Keepers Core** Schema/Lexicon/Theme tools).
3. If you are connecting an existing Spoke database after cutting the cord, simply enable Supabase Auth (Email/Password) on your Spoke project; all of your existing `mods`, `masons`, `blueprints`, `conflicts`, `system_broadcasts`, and `audit_logs` are immediately live.

### How Standalone Mode Works Under the Hood (`src/supabase.ts`)
When `isStandaloneFork` (`mode === "standalone"`) is active:
- **Unified Auth & Game Client**: `getActiveGameClient()` reuses the authenticated `supabaseAuth` client directly so your session JWT works natively across all Spoke tables without JWT secret collisions.
- **Zero Edge Function Dependency**: All `secure_*` RPCs (`secure_sync_spoke_profile`, `secure_update_spoke_profile`, `secure_upsert_cloud_file`, `secure_delete_cloud_file`, `secure_update_mason_profile`, `secure_toggle_mason_follow`, `secure_fetch_notifications`, etc.) execute directly against your single Supabase database via `executeStandaloneDirectRpc` instead of calling `game-gateway`.
- **Automatic OS-to-Spoke Table Mapping**: Any internal OS queries to `sanctuary_games`, `keeper_system_broadcasts`, `keeper_dispatch_poll_votes`, `keeper_tickets`, or `keeper_support_categories` are transparently mapped to your `standaloneWorkspace` config and your Spoke's `system_broadcasts`, `dispatch_poll_votes`, `support_tickets`, and `support_categories` tables.

---

## 2. Official Hub-and-Spoke Architecture (Partner Network)

If you are joining the official Sanctuary OS multi-game network rather than forking the client, **zero code edits are required**. Sanctuary OS separates global identity and core infrastructure from community-owned game registries:

1. **The Core OS Hub ([`schema_os.sql`](./schema_os.sql)) — Governed by Keepers Core**:
   - **Single Sign-On (SSO) Identity & FIDO2 Security Vault**: Citizens authenticate once against the Core OS Hub (`profiles` table holds global `id`, `username`, `email`, `role = 'citizen' | 'keeper'`, and global hardware/network ban status; `user_passkeys` stores WebAuthn/FIDO2 hardware credentials).
   - **Master Schemas, Directives & Assets**: Hosts global `sanctuary_schemas`, `system_directives` (bidirectionally synced with the codebase `.md` files), `sanctuary_lexicons` (`en-default`, `en-sanctuary`, `Simlish`, `en-sims`), `sanctuary_themes`, and `keeper_heuristic_signatures` (Baseline Global Antivirus).
   - **Spoke Directory (`sanctuary_games`)**: Maps each active community workspace (`schema_id`, `supabase_url`, `supabase_anon_key`, and server-only `supabase_service_key`).
   - **API Gateway (`game-gateway` Edge Function)**: Validates the Citizen's Hub JWT and executes authenticated mutations, role checks, and bilateral severance against the active Spoke database.

2. **The Community Spoke ([`schema.sql`](./schema.sql)) — Owned 100% by the Community (Wayfinder)**:
   - **Sovereign Supabase Instance**: The community creates and owns their own Supabase project.
   - **Spoke-Scoped 5-Tier Roles**: Each Spoke has its own `profiles` table where community roles (`wayfinder`, `oversight`, `architect`, `mason`, `citizen`) and communications bans (`is_comm_banned`) are assigned independently per game.
   - **Community Registry & Feeds**: Stores all `mods`, `mod_versions`, `blueprints`, `collections`, `nexus_assets`, `mason_posts`, `system_broadcasts`, `dispatch_poll_votes`, `heuristic_signatures`, `sanctuary_tickets`, and immutable `audit_logs`.

### Partner Spoke Onboarding (3 Steps)
1. **Run `schema.sql`**: Paste [`schema.sql`](./schema.sql) into your Supabase SQL Editor and click **Run**.
2. **Generate or Paste Credentials**:
   - In **Keepers Core -> Active Workspaces**, click **+ Register Game Database** and paste either a `SANCTUARY-UPLINK://` bundle or your raw `.env` credentials (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) into **Quick-Paste Uplink Bundle / Credentials**.
3. **Test Handshake & Provision Founding Wayfinder**:
   - Enter the **Founding Wayfinder (UUID, Username, or Email)** and click **Test Handshake & Verify Schema** (or **Save**). The `game-gateway` Edge Function verifies all required tables, seeds `global_network_status`, and provisions the founder's `wayfinder` role on the Spoke automatically.

---

## 3. SQL Database Schemas (`schema.sql` & `schema_os.sql`)

Both SQL provisioning scripts are embedded directly inside the **Forking & Spoke Provisioning Matrix (`SQL Schemas` tab)** on the Sanctuary OS Landing Page for 1-click copying or `.sql` download:

- **[`schema.sql` (Turnkey Community Spoke Schema — 36 Tables)](./schema.sql):**
  - **Use For:** Both **Partner Spoke Communities** AND **Standalone Codebase Forks**.
  - **Includes:** `profiles`, `mods`, `mod_versions`, `masons`, `mason_followers`, `mason_posts`, `mason_post_likes`, `mason_post_comments`, `blueprints`, `collections`, `conflicts`, `scout_suggestions`, `nexus_assets`, `nexus_reports`, `sanctuary_tickets`, `ticket_messages`, `support_categories`, `support_macros`, `system_broadcasts`, `dispatch_poll_votes`, `global_network_status`, `game_versions`, `game_dlcs`, `heuristic_signatures`, `quarantine_manifests`, `audit_logs`, plus RLS policies and the `on_auth_user_created_spoke` Founding Wayfinder auto-promotion trigger.
- **[`schema_os.sql` (Core OS Hub Schema — Multi-Hub Operators Only)](./schema_os.sql):**
  - **Use For:** Running your own central multi-game **Sanctuary OS Hub** that routes across multiple child Spoke databases.
  - **Includes:** Hub `profiles`, `hardware_bans`, `user_passkeys`, `sanctuary_games`, `sanctuary_schemas`, `sanctuary_lexicons`, `sanctuary_themes`, `system_directives`, `keeper_heuristic_signatures`, `keeper_system_broadcasts`, `keeper_dispatch_poll_votes`, `keeper_tickets`, `keeper_ticket_messages`, `keeper_support_categories`, `keeper_blog_posts`, and global `audit_logs`.

---

## 4. Bilateral Sovereignty: "Cut the Cord" (Severance Protocol)

Under the [Partners Agreement](./Partners%20Agreement.md), both Keepers and Community Wayfinders possess unilateral authority to sever the uplink between Sanctuary OS Hub and a Spoke database at any time:

- **Community-Initiated Severance (Wayfinder Hub)**:
  1. Open **Wayfinder Hub** and click **Spoke Uplink & Sovereignty** (`ServerHealthSidePanel`).
  2. Click **Copy Bundle** in the **Uplink Bundle (`SANCTUARY-UPLINK://`)** card if you plan to paste it into `src/supabase.ts` for a standalone fork.
  3. Scroll to the **Cut the Cord (Sever Hub Uplink)** danger panel, optionally enter a severance reason for the immutable Audit Trail, and double-click **Cut the Cord**.
  4. The `game-gateway` Edge Function logs the severance in both the Spoke and Hub `audit_logs`, sets `is_active = false` on `sanctuary_games`, and **immediately scrubs (`NULL`s) the Spoke's `supabase_service_key` from the Hub database**.
  5. The community retains 100% ownership and control of their standalone Supabase database.

- **Keeper-Initiated Severance (Keepers Core)**:
  Keepers can click the **Sever Uplink (`link_off`)** action button on any workspace card in **Keepers Core -> Active Workspaces** to immediately deactivate the workspace and scrub its service key.

---

## 5. Dynamic Game Schema (`sanctuary_schemas`)

Instead of hardcoding file extensions or folder paths in Rust, Sanctuary OS reads a Dynamic Game Schema JSON from `sanctuary_schemas` (or `src/data/schemas/<schema_id>.json`):

```json
{
  "id": "sims4",
  "game_id": "sims4",
  "name": "The Sims 4",
  "display_name": "The Sims 4",
  "schema_version": 2,
  "paths": {
    "default_mod_dir_windows": "%USERPROFILE%/Documents/Electronic Arts/The Sims 4/Mods",
    "default_mod_dir_mac": "~/Documents/Electronic Arts/The Sims 4/Mods",
    "manifest_file": "Resource.cfg"
  },
  "extensions": {
    "supported": [".package", ".ts4script"],
    "parsers": {
      ".package": "dbpf",
      ".ts4script": "zip_python"
    }
  },
  "load_order": {
    "strategy": "folder_priority",
    "winner_direction": "higher_wins",
    "manifest_target": "Resource.cfg",
    "tiers": ["Base", "Sanctuary", "Sanctuary2", "Sanctuary3"]
  }
}
```

## Sanctuary OS
## Forking & Architecture Guide
#### Version: 4
#### Last Updated: July 22, 2026

Welcome to the architecture and forking guide for Sanctuary OS. 
Sanctuary OS has evolved from a robust mod manager into a local-first mod operations layer and desktop middleware for mod ecosystems. It relies on a "no asset hosting / metadata-only / offline-first" philosophy. 
This application utilizes a React 18/TypeScript frontend, a Tauri V2 (Rust) backend for native file-system operations (airgapping, symlinking, and ZSTD compression), and Supabase for cloud synchronization and global DNA registry oversight.

---
### Quick Start
1. **Node.js:** Install Node.js (v18+ recommended).
2. **Rust & Cargo:** Install from [rustup.rs](https://rustup.rs/).
3. **Tauri Prerequisites:** Depending on your OS, install the necessary C++ build tools and WebKit dependencies. Refer to the [Tauri V2 Setup Guide](https://v2.tauri.app/start/prerequisites/).
4. **Supabase Account:** You will need a free [Supabase](https://supabase.com/) account for database hosting and authentication.
5. **Database Setup:** We rely on a Hub-and-Spoke Supabase PostgreSQL architecture. Execute [schema_os.sql] in your primary OS database, and [schema.sql] in your game-specific databases.
6. **Environment Variables:** Create a `.env` file in the root of your frontend directory:
   - `VITE_SUPABASE_URL=https://your-project-id.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=your-anon-key-here`
7. **Running Locally:** 
   - `npm install`
   - `npm run tauri dev`

---
### Forking Philosophy
Sanctuary OS is built entirely as a local-first desktop middleware platform. 
- **No Asset Hosting**: We do not host mod files. The system operates entirely on metadata and DNA hashes.
- **Offline-First**: All core file operations, symlinking, active network toggles, and blueprints work completely offline. Network integration merely provides global oversight and sync.
- **Desktop Middleware**: Sanctuary OS is not just a mod manager. It's a localized operating layer that safely orchestrates game engines, dependencies, telemetry, and updates.

---
### Architecture Overview
The application follows a highly decoupled Hub-and-Spoke design, completely isolating global OS infrastructure from game-specific data.

#### 1. Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v3.
- **State Management:** Zustand (`useStore` for Global State & `useModalStore` for UI Overlays).
- **Context Providers:** ThemeContext (Dynamic CSS Variables) & LexiconContext (Dynamic localization).
- **Desktop Framework:** Tauri v2.11.0 (with fs, dialog, process, and opener plugins).
- **Backend/Database:** Supabase (PostgreSQL, GoTrue Auth, Realtime WebSockets) configured in a multi-database architecture with dynamic routing.
- **Rust Dependencies:** serde, sha2, zstd/tar, filetime, notify.

#### 2. The Shared File System Refactor
Bloated files (like `AppModals.tsx` and `App.tsx`) have been purged. Everything now utilizes:
- **Split Modal & Router Components**: Modals are independently rendered and isolated from main routing loops.
- **Shared Alert/Transmission Viewer**: A single unified component handles public/oversight alert flows and general comms.
- **Command Screen Plumbing**: Shared logic between all elevated hubs.
- **Side-Panel Extraction**: Side panels manage all context-heavy tasks (Ticket Dossiers, DNA Match, Radar Logic) without disrupting the main view.

#### 3. New Application Pillars
- **Internal Browser & Download Interception**: A fully embedded browser running inside Tauri. Downloads are automatically intercepted and routed directly into your Vault.
- **Structure Matrix**: Visually define the exact folder structure a mod must maintain when deployed to ensure maximum engine performance.
- **The Mason IDE**: Powered by `@monaco-editor/react`, this provides an in-app sandbox code editor directly inside the client.
- **Shared Editor/Update Flow**: Shared state between publishing new mods and updating existing blueprints.
- **Shared Command Screens**: The Mason Workshop, Architect Console, and Wayfinder Hubs share identical `CommandScreenLayout.tsx` components to eliminate JSX duplication.

#### 4. The Rust Backend (`/src-tauri/src/`)
Because JavaScript cannot safely handle heavy file operations, all physical logistics are offloaded to Rust:
- **Core Engine:** Handles `backup_universe`, `backup_engine_full`, `deploy_playset_bulk`, and `scan_bunker`.
- **Binary Parsers:** `parser.rs` / `dbpf.rs` read raw bytes and extract headers to catch logical overlaps.

---
### Database Schema (Conceptual Overview)
Instead of hardcoding SQL, refer to [schema.sql] and [schema_os.sql] for the exact builds. Conceptually, our Postgres tables are split into these operational blocks:
- **Central OS Hub**: Manages `sanctuary_games` (Workspace definitions), `profiles` (Core identities), `audit_logs` (Global Oversight), and Master Configurations (`sanctuary_themes`, `sanctuary_lexicons`, `sanctuary_schemas`).
- **Game Databases (Spokes)**: Contain game-specific data including:
  - **Profiles & Masons**: Defines Creator profiles (Masons) and hierarchical followings, linked via UUID to the OS Hub.
  - **Global Registry & Versions**: The true source of metadata. It tracks mods, versions, and DLC registries.
  - **Network Protocols**: Tracks recursive dependencies (addons, betas, rivals) and flavor groups.
  - **Conflicts & Labs**: Maps logical conflict arrays and Homestead Lab results.
  - **Blueprints**: Saves tactical loadout schemas.
  - **Administration & Moderation**: Tracks system telemetry, Nexus reports, asset flags, and active DEFCON status.

---
### Game Schema / Porting Guide
Sanctuary OS has been refactored to support dynamic JSON schemas (e.g., `src/data/schemas/sims4.json`). You **no longer need to rewrite hardcoded Rust backend logic** to port to a new game. 
By duplicating and modifying a game schema file, you define:
- **Paths**: `executable_names` and `paths` for auto-detecting bin and mod directories.
- **Extensions**: Supported files, parsers mapped to `dbpf_parser`, `zip_parser`, etc.
- **Conflict Radar**: Taxonomy rules (harmless vs critical TGIs).
- **Time Capsule**: World State vs Engine Core targets.
- **Exception Logs**: Matching heuristics.
The Rust backend automatically deserializes the active schema at runtime to adjust its I/O logic.

---
### Security & Governance Model
Security is handled through a tiered global compliance system managed by Oversight, Wayfinders, and Keepers.
- **Public/Oversight Alert Flows**: Global DEFCON alerts are pushed over WebSockets. Wayfinders can initiate scheduled/operational DEFCON events.
- **System Status Telemetry**: The Registry Health Status provides a real-time telemetry tile showing current Database Latency (ms), CPU usage, memory allocation, and server connectivity status.
- **Audit Log Behavior**: Every database mutation, role change, and security flag executed by the administration is tracked in a permanent, undeletable ledger (Audit Logs). Keepers and Wayfinders use this for accountability and system forensics.
- **Tiered Roles**: From Citizens (users) to Masons (creators), Architects (moderators), Oversight (administrators), Wayfinders (game admins), and Keepers (OS infrastructure), every profile operates under strict logic gates that share 1:1 workflow consistency.
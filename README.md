🛠️ Forking & Development Guide: Sanctuary OS

Welcome to the developer guide for Sanctuary OS, a robust, desktop-native artifact and mod manager built for The Sims 4. 
This application relies on a React 18/TypeScript frontend, a Tauri V2 (Rust) backend for heavy file-system operations, and Supabase for cloud synchronization and global DNA registry.

📦 Tech Stack Overview
  Frontend: React 18, TypeScript, Vite, Tailwind CSS.
  State Management: Zustand (useStore for Global Store & useModalStore for UI Overlays).
  Context Providers: ThemeContext (Dynamic UI theming) & LexiconContext (Dynamic localization & personas).
  Desktop Framework: Tauri 2.11.0.
  Backend/Database: Supabase (PostgreSQL, GoTrue Auth, Realtime).
  Rust Dependencies: serde, sha2 (hashing), zstd/tar (compression/backups), filetime, notify (file watching).


🏗️ Architecture & Directory Structure
The application has been heavily modularized to separate UI components from business logic, state, and native system APIs.
1. Global State (/src/store/)
   The app uses Zustand to prevent prop-drilling and manage complex states across the OS:
     index.ts: Manages global OS state (active views, folder paths, active blueprints, radar scanning progress, and global Anarchy rules).
     modalStore.ts: Centralizes the state for all translucent UI overlays, dialogs, dropzones, and alert prompts (consumed by AppModals.tsx and ModalManager.tsx).

2. Abstraction Layers (/src/lib/ & /src/hooks/)
   To keep React components completely decoupled from raw backend calls, the app utilizes abstraction layers:
     tauri-bridge.ts & supabase-services.ts: Clean wrappers around native Rust invokes and Supabase RPCs.
     useAppActions.ts: Handles repetitive global actions (e.g., executing snapshots, confirming file renames).
     useCloudService.ts: Handles heavy cloud operations like mass ingestion, blueprint uplinking, and syncing.
     useGlobalListeners.ts: Manages global event listeners like vault_changed, scan-progress, backup-progress, and the Supabase Realtime DEFCON channel.
     useDefconRadar.ts & useSolderLab.ts: Manages emergency patch responses and complex load-order/dependency chain resolution.
     useVaultInTake.ts: Manages the drag-and-drop ingestion protocols for moving loose files into the Vault securely.


3. Context & Theming (/src/ThemeContext.tsx & /src/LexiconContext.tsx)
     Chameleon Protocol (Themes): ThemeContext dynamically maps CSS variables (--bg, --accent, etc.) to the document.documentElement, allowing on-the-fly theme switching (e.g., Architect, Bunker, Miami Vice).
     Lexicon System: LexiconContext allows the entire app's terminology to be swapped. Out of the box, it supports the en-sanctuary (Sci-Fi Hacker) terminology and en-default (Standard Mod Manager) terminology.

4. Routing & App Stability
     ViewRouter.tsx: Replaces monolithic routing. It dynamically renders active components based on the Zustand view state.
     AuthWrapper.tsx: Wraps the entire OS, preventing access to the app until a secure Supabase session is established.
     ErrorBoundary.tsx: Wraps every major module. If a specific panel (e.g., "Solder Lab") encounters a critical React error, it prevents the entire OS from crashing and presents a local reboot button.
     AppModals.tsx: A centralized portal that reads from modalStore.ts to render translucent popups at the top level of the DOM.

5. The Rust Backend (/src-tauri/src/)
     Because JavaScript cannot safely or efficiently handle heavy file operations, the heavy lifting is offloaded to Rust:
       main.rs: The core bridge. Key capabilities include:
         backup_universe & backup_engine_full: Uses zstd and tar to compress user save files and mod loadouts into time-stamped archives.
         deploy_playset_bulk: Mounts mods into the live game directory using Symlinks or Directory Junctions (or copies them), protecting the original files safely in the Vault.
         scan_bunker: Scans the vault, hashes files, and uses a local .sanctuary_cache.json to skip re-hashing unmodified files during radar sweeps.
         File watchers (initialize_vault_watch, initialize_airgap_watch): Real-time folder syncing using the notify crate.
     parser.rs / Parsers.rs: A custom binary parser for DBPF files (The standard Sims 4 .package format). It reads raw bytes, extracts headers, and maps TGI (Type, Group, Instance) IDs to detect overlaps. It optimizes scanning by ignoring "harmless CC" to prevent false positives.


⚙️ Step 1: Prerequisites
  Node.js: Install Node.js (v18+ recommended).
  Rust & Cargo: Install from rustup.rs.
  Tauri Prerequisites: Depending on your OS, install the necessary C++ build tools and WebKit dependencies. Refer to theTauri V2 Setup Guide.
  Supabase Account: You will need a free Supabase account for database hosting and authentication.


🗄️ Step 2: Supabase Backend Setup
  Sanctuary OS relies on a Supabase PostgreSQL database to manage mod DNA signatures, telemetry, and user profiles.
  Create a new project in your Supabase dashboard.
  Go to Authentication > Providers and ensure Email/Password is enabled.
  Execute the following SQL in your Supabase SQL Editor to generate the required schema:

-- 1. Profiles & Masons (Creators)
CREATE TABLE profiles (id UUID REFERENCES auth.users(id) PRIMARY KEY, username TEXT, role TEXT DEFAULT 'citizen');
CREATE TABLE masons (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, profile_id UUID REFERENCES profiles(id), name TEXT NOT NULL, bio TEXT, avatar_url TEXT, patreon_url TEXT, website_url TEXT, is_verified BOOLEAN DEFAULT false);
CREATE TABLE mason_followers (user_id UUID REFERENCES profiles(id), mason_id UUID REFERENCES masons(id), PRIMARY KEY (user_id, mason_id));
CREATE TABLE mason_posts (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, mason_id UUID REFERENCES masons(id), title TEXT, content TEXT, image_url TEXT, created_at TIMESTAMP DEFAULT NOW());

-- Auth Trigger (Auto-creates profile on signup)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role) VALUES (new.id, new.raw_user_meta_data->>'username', 'citizen');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Registry & Flavors
CREATE TABLE mods (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, name TEXT UNIQUE NOT NULL, status TEXT, category_override TEXT, sub_type TEXT, image_url TEXT, url TEXT, description TEXT, master_author TEXT, allow_write BOOLEAN DEFAULT false, compliance_tier TEXT, mason_id UUID REFERENCES masons(id));
CREATE TABLE mod_versions (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, mod_id UUID REFERENCES mods(id), dna_hash TEXT UNIQUE NOT NULL, version_label TEXT, game_version TEXT);
CREATE TABLE mod_relationships (parent_id UUID REFERENCES mods(id), child_id UUID REFERENCES mods(id), relationship_type TEXT, UNIQUE(parent_id, child_id));
CREATE TABLE mod_dependencies (parent_id UUID REFERENCES mods(id), child_id UUID REFERENCES mods(id), UNIQUE(parent_id, child_id));
CREATE TABLE flavor_groups (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE flavor_group_members (group_id UUID REFERENCES flavor_groups(id), mod_hash TEXT NOT NULL, PRIMARY KEY (group_id, mod_hash));

-- 3. Conflicts, Sets, & Blueprints
CREATE TABLE logical_conflicts (id SERIAL PRIMARY KEY, mod_a TEXT NOT NULL, mod_b TEXT NOT NULL, severity_rank INTEGER, resolution_note TEXT, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE scout_suggestions (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, dna_hash TEXT, suggested_name TEXT, suggested_author TEXT, suggested_url TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE solder_lab_logs (id SERIAL PRIMARY KEY, mod_id UUID REFERENCES mods(id), version_id UUID REFERENCES mod_versions(id), status TEXT, log_snippet TEXT, tester_note TEXT);
CREATE TABLE cc_sets (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, name TEXT NOT NULL, creator_name TEXT, image_url TEXT, is_official BOOLEAN DEFAULT false, mason_id UUID REFERENCES masons(id));
CREATE TABLE cc_set_members (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, set_id UUID REFERENCES cc_sets(id), mod_id UUID REFERENCES mods(id));
CREATE TABLE blueprints (code TEXT UNIQUE PRIMARY KEY, name TEXT NOT NULL, artifacts JSONB, mason_id UUID REFERENCES masons(id));

-- 4. Global Network Status & Security
CREATE TABLE global_network_status (id INTEGER PRIMARY KEY, defcon_level INTEGER DEFAULT 5, message TEXT);
INSERT INTO global_network_status (id, defcon_level, message) VALUES (1, 5, 'System Normal');
CREATE TABLE hub_comms (id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, sender_id UUID REFERENCES auth.users(id), message TEXT, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE global_security (id SERIAL PRIMARY KEY, malware_hashes TEXT ARRAY, 
    tier2_hashes TEXT ARRAY);


🌍 Step 3: Environment Variables
  Create a .env file in the root of your frontend directory and add your Supabase connection strings:
codeEnv
    VITE_SUPABASE_URL=https://your-project-id.supabase.co
    VITE_SUPABASE_ANON_KEY=your-anon-key-here
  (Ensure src/supabase.ts is configured to ingest these variables).


🚀 Step 4: Running the Application Locally
  Because Sanctuary OS requires direct access to the local file system, it must be run via Tauri, not just the browser.
    Install dependencies and start the development server:
      npm install
      npm run tauri dev
    Note: The first compilation of the Rust backend will take a few minutes.


💡 Tips for Customizing
  Changing the "Hacker/Sci-Fi" Terminology: Look at LexiconContext.tsx and change the default activeLang state to "en-default" instead of "en-sanctuary". This will instantly revert the app to standard Mod Manager terminology (e.g., "Artifacts" becomes "Mods", "Yeet" becomes "Delete").
  Adapting for Another Game: You will need to rewrite src-tauri/src/Parsers.rs. Currently, it is strictly hardcoded to parse The Sims 4's DBPF package format via specific byte offsets. You would also need to update the launch_game and auto_detect_paths functions in main.rs to point to the new game's executable and document folders.
  Tauri V2 Permissions: Ensure your src-tauri/tauri.conf.json (or your capability files) explicitly grants permissions for the fs, dialog, shell, and opener plugins. If you add new Rust commands, you must register them in main.rs inside the .invoke_handler() block.

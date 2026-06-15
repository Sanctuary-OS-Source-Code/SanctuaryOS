🛠️ Forking \& Development Guide: Sanctuary OS

Welcome to the developer guide for Sanctuary OS, a robust, desktop-native artifact and mod manager built for The Sims 4.

This application relies on a React 18/TypeScript frontend, a Tauri V2 (Rust) backend for native file-system operations (airgapping, symlinking, and ZSTD compression), and Supabase for cloud synchronization and global DNA registry oversight.



📦 Tech Stack Overview

Frontend: React 18, TypeScript, Vite, Tailwind CSS v3.

State Management: Zustand (useStore for Global State \& useModalStore for UI Overlays).

Context Providers: ThemeContext (Dynamic CSS Variables) \& LexiconContext (Dynamic localization \& personas).

Code Editor (Mason IDE): @monaco-editor/react (for in-app sandbox editing).

Desktop Framework: Tauri v2.11.0.

Backend/Database: Supabase (PostgreSQL, GoTrue Auth, Realtime WebSockets).

Rust Dependencies: serde, sha2 (hashing), zstd/tar (compression/backups), filetime, notify (file watching).



🏗️ Architecture \& Directory Structure

The application is heavily modularized to separate UI components from business logic, state, and native system APIs.

1\. Global State (/src/store/)

The app uses Zustand to prevent prop-drilling across the OS:

index.ts: Manages global OS state (active views, folder paths, active blueprints, radar scanning progress, and global Anarchy rules).

modalStore.ts: Centralizes the state for all translucent UI overlays, dialogs, dropzones, and alert prompts (consumed by AppModals.tsx).

2\. Abstraction Layers (/src/lib/ \& /src/hooks/)

To keep React components completely decoupled from raw backend calls, the app utilizes abstraction layers:

tauri-bridge.ts \& supabase-services.ts: Clean wrappers around native Rust invokes and Supabase RPCs.

useAppActions.ts \& useCloudService.ts: Handles heavy cloud operations like mass ingestion, blueprint uplinking, and syncing.

useGlobalListeners.ts: Manages global event listeners like vault\_changed, scan-progress, backup-progress, and the Supabase Realtime DEFCON channel.

3\. Tiered Role Architecture (/src/)

The frontend dynamically renders modules based on Supabase auth roles (Citizen, Mason, Architect, Senior Architect, Wayfinder).

MasonHub.tsx: Contains the Mason IDE (Monaco integration), CC Set Builder, and Sandbox Sync features for mod creators.

ArchitectHub.tsx: Contains the Protocol Orchestrator and Structure Visualizer for community moderators.

SeniorArchitect.tsx: Contains the Identity Matrix, Mason Linker, Compliance Oversight (Tier 1-3 malware flags), Mass Update Utility, Game Versions Registry, and Audit Logs.

4\. The Rust Backend (/src-tauri/src/)

Because JavaScript cannot safely or efficiently handle heavy file operations, the heavy lifting is offloaded to Rust:

main.rs: The core bridge. Key capabilities include:

backup\_universe \& backup\_engine\_full: Uses zstd and tar to compress user save files and mod loadouts into time-stamped archives.

deploy\_playset\_bulk: Mounts mods into the live game directory using Symlinks or Hardlinks, protecting the original files safely in the Vault. Includes priority loading mechanisms (!Sanctuary folders).

scan\_bunker \& scan\_sandbox: Scans the vault, hashes files, and uses a local .sanctuary\_cache.json to skip re-hashing unmodified files during radar sweeps.

Sandbox I/O: import\_to\_sandbox, get\_sandbox\_files, read\_config\_file, and save\_config\_file support the new frontend IDE.





parser.rs / Parsers.rs: A custom binary parser for DBPF files (The standard Sims 4 .package format). It reads raw bytes, extracts headers, and maps TGI (Type, Group, Instance) IDs to detect overlaps while ignoring "harmless CC" to prevent false positives.



⚙️ Step 1: Prerequisites

Node.js: Install Node.js (v18+ recommended).

Rust \& Cargo: Install from rustup.rs.

Tauri Prerequisites: Depending on your OS, install the necessary C++ build tools and WebKit dependencies. Refer to the Tauri V2 Setup Guide.

Supabase Account: You will need a free Supabase account for database hosting and authentication.



🗄️ Step 2: Supabase Backend Setup

Sanctuary OS relies on a Supabase PostgreSQL database to manage mod DNA signatures, telemetry, security tiers, and user profiles.

Create a new project in your Supabase dashboard.

Go to Authentication > Providers and ensure Email/Password is enabled.

Execute the following SQL in your Supabase SQL Editor to generate the required schema:



\-- Enable the UUID extension if not already enabled

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



\-- ==========================================

\-- 1. PROFILES \& MASONS (CREATORS)

\-- ==========================================



CREATE TABLE profiles (

&#x20;   id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY, 

&#x20;   username TEXT, 

&#x20;   role TEXT DEFAULT 'citizen' -- Roles: citizen, mason, architect, senior\_architect, wayfinder, blacklisted

);



CREATE TABLE masons (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   profile\_id UUID REFERENCES profiles(id) ON DELETE SET NULL, 

&#x20;   name TEXT NOT NULL, 

&#x20;   bio TEXT, 

&#x20;   avatar\_url TEXT, 

&#x20;   patreon\_url TEXT, 

&#x20;   website\_url TEXT, 

&#x20;   discord\_url TEXT,

&#x20;   compliance\_tier INTEGER DEFAULT 0,

&#x20;   is\_verified BOOLEAN DEFAULT false

);



CREATE TABLE mason\_followers (

&#x20;   user\_id UUID REFERENCES profiles(id) ON DELETE CASCADE, 

&#x20;   mason\_id UUID REFERENCES masons(id) ON DELETE CASCADE, 

&#x20;   PRIMARY KEY (user\_id, mason\_id)

);



CREATE TABLE mason\_posts (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   mason\_id UUID REFERENCES masons(id) ON DELETE CASCADE, 

&#x20;   title TEXT, 

&#x20;   content TEXT, 

&#x20;   image\_url TEXT, 

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



\-- Auto-create profile trigger on Supabase Auth Signup

CREATE OR REPLACE FUNCTION public.handle\_new\_user() RETURNS TRIGGER AS $$

BEGIN

&#x20; INSERT INTO public.profiles (id, username, role) 

&#x20; VALUES (new.id, new.raw\_user\_meta\_data->>'username', 'citizen');

&#x20; RETURN new;

END;

$$ LANGUAGE plpgsql SECURITY DEFINER;

<<<<<<< HEAD


CREATE TRIGGER on\_auth\_user\_created 

&#x20; AFTER INSERT ON auth.users 

&#x20; FOR EACH ROW EXECUTE PROCEDURE public.handle\_new\_user();





\-- ==========================================

\-- 2. GLOBAL REGISTRY \& VERSIONS

\-- ==========================================



CREATE TABLE game\_versions (

&#x20;   version TEXT PRIMARY KEY,

&#x20;   display\_name TEXT

);



CREATE TABLE mods (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   name TEXT UNIQUE NOT NULL, 

&#x20;   status TEXT DEFAULT 'unverified', 

&#x20;   category\_override TEXT, 

&#x20;   sub\_type TEXT, 

&#x20;   image\_url TEXT, 

&#x20;   url TEXT, 

&#x20;   description TEXT, 

&#x20;   master\_author TEXT, 

&#x20;   allow\_write BOOLEAN DEFAULT false, 

&#x20;   compliance\_tier INTEGER DEFAULT 0, 

&#x20;   mason\_id UUID REFERENCES masons(id) ON DELETE SET NULL,

&#x20;   latest\_version TEXT,

&#x20;   requiredDLC TEXT,

&#x20;   compatible\_versions TEXT\[],

&#x20;   folder\_structure JSONB DEFAULT '\[]'::jsonb,

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

&#x20;   updated\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



CREATE TABLE mod\_versions (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   mod\_id UUID REFERENCES mods(id) ON DELETE CASCADE, 

&#x20;   dna\_hash TEXT UNIQUE NOT NULL, 

&#x20;   version\_label TEXT, 

&#x20;   game\_version TEXT

);





\-- ==========================================

\-- 3. NETWORK PROTOCOLS \& RELATIONSHIPS

\-- ==========================================



CREATE TABLE mod\_relationships (

&#x20;   parent\_id UUID REFERENCES mods(id) ON DELETE CASCADE, 

&#x20;   child\_id UUID REFERENCES mods(id) ON DELETE CASCADE, 

&#x20;   relationship\_type TEXT, -- 'twin', 'addon', 'rival', 'beta'

&#x20;   UNIQUE(parent\_id, child\_id)

);



CREATE TABLE mod\_dependencies (

&#x20;   parent\_id UUID REFERENCES mods(id) ON DELETE CASCADE, 

&#x20;   child\_id UUID REFERENCES mods(id) ON DELETE CASCADE, 

&#x20;   UNIQUE(parent\_id, child\_id)

);



CREATE TABLE flavor\_groups (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   name TEXT UNIQUE NOT NULL,

&#x20;   mason\_id UUID REFERENCES masons(id) ON DELETE SET NULL

);



CREATE TABLE flavor\_group\_members (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY,

&#x20;   group\_id UUID REFERENCES flavor\_groups(id) ON DELETE CASCADE, 

&#x20;   mod\_id UUID REFERENCES mods(id) ON DELETE CASCADE,

&#x20;   mod\_hash TEXT,

&#x20;   sort\_order INTEGER DEFAULT 0,

&#x20;   UNIQUE (group\_id, mod\_hash)

);





\-- ==========================================

\-- 4. CONFLICTS, LABS, \& SCOUTING

\-- ==========================================



CREATE TABLE logical\_conflicts (

&#x20;   id SERIAL PRIMARY KEY, 

&#x20;   mod\_a TEXT NOT NULL, 

&#x20;   mod\_b TEXT NOT NULL, 

&#x20;   mod\_a\_id UUID REFERENCES mods(id) ON DELETE CASCADE,

&#x20;   mod\_b\_id UUID REFERENCES mods(id) ON DELETE CASCADE,

&#x20;   severity\_rank INTEGER, 

&#x20;   resolution\_note TEXT, 

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



CREATE TABLE scout\_suggestions (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   dna\_hash TEXT, 

&#x20;   suggested\_name TEXT, 

&#x20;   suggested\_author TEXT, 

&#x20;   suggested\_url TEXT, 

&#x20;   category\_override TEXT,

&#x20;   suggested\_type TEXT,

&#x20;   status TEXT DEFAULT 'pending', 

&#x20;   created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



CREATE TABLE solder\_lab\_logs (

&#x20;   id SERIAL PRIMARY KEY, 

&#x20;   mod\_id UUID REFERENCES mods(id) ON DELETE CASCADE, 

&#x20;   version\_id UUID REFERENCES mod\_versions(id) ON DELETE CASCADE, 

&#x20;   status TEXT, 

&#x20;   log\_snippet TEXT, 

&#x20;   tester\_note TEXT

);





\-- ==========================================

\-- 5. CC SETS \& BLUEPRINTS

\-- ==========================================



CREATE TABLE cc\_sets (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   name TEXT NOT NULL, 

&#x20;   creator\_name TEXT, 

&#x20;   image\_url TEXT, 

&#x20;   is\_official BOOLEAN DEFAULT false, 

&#x20;   mason\_id UUID REFERENCES masons(id) ON DELETE SET NULL,

&#x20;   compliance\_tier INTEGER DEFAULT 0

);



CREATE TABLE cc\_set\_members (

&#x20;   id UUID DEFAULT uuid\_generate\_v4() PRIMARY KEY, 

&#x20;   set\_id UUID REFERENCES cc\_sets(id) ON DELETE CASCADE, 

&#x20;   mod\_id UUID REFERENCES mods(id) ON DELETE CASCADE

);



CREATE TABLE blueprints (

&#x20;   code TEXT UNIQUE PRIMARY KEY, 

&#x20;   name TEXT NOT NULL, 

&#x20;   artifacts JSONB, 

&#x20;   mason\_id UUID REFERENCES masons(id) ON DELETE SET NULL

);





\-- ==========================================

\-- 6. GLOBAL ADMINISTRATION \& SECURITY

\-- ==========================================



CREATE TABLE global\_network\_status (

&#x20;   id INTEGER PRIMARY KEY, 

&#x20;   defcon\_level INTEGER DEFAULT 5, 

&#x20;   message TEXT

);

\-- Initialize normal status

INSERT INTO global\_network\_status (id, defcon\_level, message) VALUES (1, 5, 'System Normal');



CREATE TABLE global\_security (

&#x20;   id SERIAL PRIMARY KEY, 

&#x20;   malware\_hashes TEXT\[], 

&#x20;   tier2\_hashes TEXT

=======
CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users 
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ==========================================
-- 2. GLOBAL REGISTRY & VERSIONS
-- ==========================================

CREATE TABLE game_versions (
    version TEXT PRIMARY KEY,
    display_name TEXT
);

CREATE TABLE mods (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    name TEXT UNIQUE NOT NULL, 
    status TEXT DEFAULT 'unverified', 
    category_override TEXT, 
    sub_type TEXT, 
    image_url TEXT, 
    url TEXT, 
    description TEXT, 
    master_author TEXT, 
    allow_write BOOLEAN DEFAULT false, 
    compliance_tier INTEGER DEFAULT 0, 
    mason_id UUID REFERENCES masons(id) ON DELETE SET NULL,
    latest_version TEXT,
    requiredDLC TEXT,
    compatible_versions TEXT[],
    folder_structure JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE mod_versions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE, 
    dna_hash TEXT UNIQUE NOT NULL, 
    version_label TEXT, 
    game_version TEXT
);


-- ==========================================
-- 3. NETWORK PROTOCOLS & RELATIONSHIPS
-- ==========================================

CREATE TABLE mod_relationships (
    parent_id UUID REFERENCES mods(id) ON DELETE CASCADE, 
    child_id UUID REFERENCES mods(id) ON DELETE CASCADE, 
    relationship_type TEXT, -- 'twin', 'addon', 'rival', 'beta'
    UNIQUE(parent_id, child_id)
);

CREATE TABLE mod_dependencies (
    parent_id UUID REFERENCES mods(id) ON DELETE CASCADE, 
    child_id UUID REFERENCES mods(id) ON DELETE CASCADE, 
    UNIQUE(parent_id, child_id)
);

CREATE TABLE flavor_groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    name TEXT UNIQUE NOT NULL,
    mason_id UUID REFERENCES masons(id) ON DELETE SET NULL
);

CREATE TABLE flavor_group_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID REFERENCES flavor_groups(id) ON DELETE CASCADE, 
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    mod_hash TEXT,
    sort_order INTEGER DEFAULT 0,
    UNIQUE (group_id, mod_hash)
);


-- ==========================================
-- 4. CONFLICTS, LABS, & SCOUTING
-- ==========================================

CREATE TABLE logical_conflicts (
    id SERIAL PRIMARY KEY, 
    mod_a TEXT NOT NULL, 
    mod_b TEXT NOT NULL, 
    mod_a_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    mod_b_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    severity_rank INTEGER, 
    resolution_note TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE scout_suggestions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    dna_hash TEXT, 
    suggested_name TEXT, 
    suggested_author TEXT, 
    suggested_url TEXT, 
    category_override TEXT,
    suggested_type TEXT,
    status TEXT DEFAULT 'pending', 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE solder_lab_logs (
    id SERIAL PRIMARY KEY, 
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE, 
    version_id UUID REFERENCES mod_versions(id) ON DELETE CASCADE, 
    status TEXT, 
    log_snippet TEXT, 
    tester_note TEXT
);


-- ==========================================
-- 5. CC SETS & BLUEPRINTS
-- ==========================================

CREATE TABLE cc_sets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    name TEXT NOT NULL, 
    creator_name TEXT, 
    image_url TEXT, 
    is_official BOOLEAN DEFAULT false, 
    mason_id UUID REFERENCES masons(id) ON DELETE SET NULL,
    compliance_tier INTEGER DEFAULT 0
);

CREATE TABLE cc_set_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    set_id UUID REFERENCES cc_sets(id) ON DELETE CASCADE, 
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE
);

CREATE TABLE blueprints (
    code TEXT UNIQUE PRIMARY KEY, 
    name TEXT NOT NULL, 
    artifacts JSONB, 
    mason_id UUID REFERENCES masons(id) ON DELETE SET NULL
);


-- ==========================================
-- 6. GLOBAL ADMINISTRATION & SECURITY
-- ==========================================

CREATE TABLE global_network_status (
    id INTEGER PRIMARY KEY, 
    defcon_level INTEGER DEFAULT 5, 
    message TEXT
);
-- Initialize normal status
INSERT INTO global_network_status (id, defcon_level, message) VALUES (1, 5, 'System Normal');
>>>>>>> 4da5db4554424345dce33d4446df682e26120256

CREATE TABLE global_security (
    id SERIAL PRIMARY KEY, 
    malware_hashes TEXT[], 
    tier2_hashes TEXT

🌍 Step 3: Environment Variables
<<<<<<< HEAD

Create a .env file in the root of your frontend directory and add your Supabase connection strings:

VITE\_SUPABASE\_URL=https://your-project-id.supabase.co

VITE\_SUPABASE\_ANON\_KEY=your-anon-key-here



(Ensure src/supabase.ts is configured to ingest these variables).

=======
Create a .env file in the root of your frontend directory and add your Supabase connection strings:
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
>>>>>>> 4da5db4554424345dce33d4446df682e26120256

(Ensure src/supabase.ts is configured to ingest these variables).

🚀 Step 4: Running the Application Locally
<<<<<<< HEAD

Because Sanctuary OS requires direct access to the local file system, it must be run via Tauri, not just the browser.

Install dependencies and start the development server:

npm install

npm run tauri dev



Note: The first compilation of the Rust backend will take a few minutes as it downloads and compiles the crates.

=======
Because Sanctuary OS requires direct access to the local file system, it must be run via Tauri, not just the browser.
Install dependencies and start the development server:
npm install
npm run tauri dev
>>>>>>> 4da5db4554424345dce33d4446df682e26120256

Note: The first compilation of the Rust backend will take a few minutes as it downloads and compiles the crates.

💡 Tips for Customizing
<<<<<<< HEAD

Changing the "Hacker/Sci-Fi" Terminology:

Look at LexiconContext.tsx and change the default activeLang state to "en-default" instead of "en-sanctuary". This will instantly revert the app to standard Mod Manager terminology (e.g., "Artifacts" becomes "Mods", "Yeet Cascade" becomes "Cascade Deletion").

Adapting for Another Game:

You will need to rewrite src-tauri/src/Parsers.rs. Currently, it is strictly hardcoded to parse The Sims 4's DBPF package format via specific byte offsets. You would also need to update the launch\_game, rip\_game\_version, and auto\_detect\_paths functions in main.rs to point to the new game's executable, config files, and document folders.

Tauri V2 Permissions:

Ensure your src-tauri/capabilities/default.json explicitly grants permissions for the fs, dialog, process, and opener plugins. If you add new Rust commands, you must register them in main.rs inside the .invoke\_handler() block.



=======
Changing the "Hacker/Sci-Fi" Terminology:
Look at LexiconContext.tsx and change the default activeLang state to "en-default" instead of "en-sanctuary". This will instantly revert the app to standard Mod Manager terminology (e.g., "Artifacts" becomes "Mods", "Yeet Cascade" becomes "Cascade Deletion").
Adapting for Another Game:
You will need to rewrite src-tauri/src/Parsers.rs. Currently, it is strictly hardcoded to parse The Sims 4's DBPF package format via specific byte offsets. You would also need to update the launch_game, rip_game_version, and auto_detect_paths functions in main.rs to point to the new game's executable, config files, and document folders.
Tauri V2 Permissions:
Ensure your src-tauri/capabilities/default.json explicitly grants permissions for the fs, dialog, process, and opener plugins. If you add new Rust commands, you must register them in main.rs inside the .invoke_handler() block.


[Fork Guide.pdf](https://github.com/user-attachments/files/27940617/Fork.Guide.pdf)
>>>>>>> 4da5db4554424345dce33d4446df682e26120256

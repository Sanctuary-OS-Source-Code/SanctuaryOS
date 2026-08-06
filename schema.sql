-- Enable the UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. PROFILES & MASONS (CREATORS)
-- ==========================================
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY, 
    username TEXT, 
    role TEXT DEFAULT 'citizen' -- Roles: citizen, mason, architect, oversight, wayfinder, blacklisted
);
  
CREATE TABLE masons (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    profile_id UUID, 
    name TEXT NOT NULL, 
    bio TEXT, 
    avatar_url TEXT, 
    patreon_url TEXT, 
    website_url TEXT, 
    discord_url TEXT,
    compliance_tier INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    pinned_mod_id UUID REFERENCES mods(id) ON DELETE SET NULL,
    pinned_asset_id UUID,
    pinned_blueprint_id INTEGER,
    pinned_ccset_id TEXT
);
  
CREATE TABLE mason_followers (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, 
    mason_id UUID REFERENCES masons(id) ON DELETE CASCADE, 
    PRIMARY KEY (user_id, mason_id)
);

CREATE TABLE mason_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    mason_id UUID REFERENCES masons(id) ON DELETE CASCADE, 
    title TEXT, 
    description TEXT,
    content TEXT, 
    image_url TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Auto-create profile trigger on Supabase Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role) 
  VALUES (new.id, new.raw_user_meta_data->>'username', 'citizen');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users 
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user(); 

-- ==========================================
-- 2. GLOBAL REGISTRY & VERSIONS
-- ==========================================
CREATE TABLE game_versions (
    version TEXT PRIMARY KEY,
    release_date DATE
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
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
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
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending', 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
  

-- ==========================================
-- 5. CC SETS & BLUEPRINTS
-- ==========================================
  
  
CREATE TABLE blueprints (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL, 
    name TEXT NOT NULL, 
    artifacts JSONB, 
    mason_id UUID REFERENCES masons(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT false,
    is_market_listed BOOLEAN DEFAULT false,
    is_locked BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    compliance_tier INTEGER DEFAULT 0,
    game_version TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
); 

-- ==========================================
-- 6. GLOBAL ADMINISTRATION & SECURITY
-- ==========================================  
CREATE TABLE global_network_status (
    id INTEGER PRIMARY KEY, 
    defcon_level INTEGER DEFAULT 5, 
    message TEXT,
    status_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initialize normal status
INSERT INTO global_network_status (id, defcon_level, message) VALUES (1, 5, 'System Normal');
  
CREATE TABLE global_security (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    hash TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE dlc_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    release_date TIMESTAMP WITH TIME ZONE
);

CREATE TABLE audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_table TEXT NOT NULL,
    target_name TEXT,
    reason TEXT NOT NULL,
    game_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- AUDIT LOG SECURITY TRIGGERS
-- ==========================================
CREATE OR REPLACE FUNCTION prevent_audit_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. Modification or deletion is strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modifications();

CREATE TRIGGER trg_prevent_audit_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modifications();

-- ==========================================
-- 7. SUPPORT, TELEMETRY & NOTIFICATIONS
-- ==========================================
CREATE TABLE sanctuary_tickets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_support_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category_code TEXT UNIQUE NOT NULL,
    category_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    requires_target_mod BOOLEAN DEFAULT false,
    requires_target_user BOOLEAN DEFAULT false,
    show_title_box BOOLEAN DEFAULT true,
    show_description_box BOOLEAN DEFAULT true,
    show_logs_box BOOLEAN DEFAULT false,
    escalation_path TEXT,
    ticket_destination TEXT,
    telemetry_config JSONB,
    custom_fields JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_telemetry_sources (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    search_path TEXT NOT NULL,
    file_pattern TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE system_broadcasts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    message TEXT NOT NULL,
    category TEXT NOT NULL,
    code_snippet TEXT,
    is_active BOOLEAN DEFAULT true,
    is_pinned TEXT,
    target_audience TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    message TEXT,
    reference_id TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 8. MARKETPLACE & CONTENT MODERATION
-- ==========================================


CREATE TABLE blueprint_reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    blueprint_id INTEGER REFERENCES blueprints(id) ON DELETE CASCADE,
    reporter_name TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE content_flags (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolution_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE heuristic_signatures (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    signature TEXT NOT NULL,
    match_type TEXT NOT NULL,
    source TEXT NOT NULL,
    severity TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE mason_post_comments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    post_id UUID REFERENCES mason_posts(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES mason_post_comments(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    code_snippet TEXT,
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 8. MASTER SCHEMAS
-- ==========================================
CREATE TABLE sanctuary_schemas (
    id TEXT PRIMARY KEY,
    schema_data JSONB,
    version INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_lexicons (
    id TEXT PRIMARY KEY,
    name TEXT,
    badge TEXT,
    version INTEGER,
    lexicon_data JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_themes (
    id TEXT PRIMARY KEY,
    theme_data JSONB,
    version INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- ROLE MIGRATION (RUN MANUALLY)
-- ==========================================
-- UPDATE profiles SET role = 'oversight' WHERE role = 'senior_architect';


-- ==========================================
-- 9. NEXUS & HOMESTEAD (FORMERLY MARKETPLACE & SOLDER LAB)
-- ==========================================
CREATE TABLE nexus_assets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT,
    asset_type TEXT,
    author TEXT,
    language TEXT,
    json_data JSONB,
    image_url TEXT,
    description TEXT,
    is_community_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE nexus_reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    target_id UUID,
    target_type TEXT,
    report_reason TEXT,
    report_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE collections (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mason_id UUID REFERENCES masons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE collection_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE homestead_lab_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    mod_version_id UUID REFERENCES mod_versions(id) ON DELETE CASCADE,
    session_id TEXT,
    log_text TEXT,
    severity TEXT,
    tester_note TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE homestead_workbench_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_name TEXT,
    schema_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 10. SECURE CROSS-DATABASE AUTHENTICATION (OS -> GAME)
-- ==========================================
-- Enable HTTP extension to securely verify OS tokens
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Securely handle Follow/Unfollow by verifying OS Token via HTTP 
-- bypassing Game RLS while strictly maintaining identity
CREATE OR REPLACE FUNCTION secure_toggle_mason_follow(p_token text, p_mason_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_response http_response;
  v_request http_request;
  v_headers http_header[];
BEGIN
  -- Build headers for the Auth request
  v_headers := ARRAY[
    http_header('Authorization', 'Bearer ' || p_token),
    http_header('apikey', 'sb_publishable_UfZsGP0-5CvUlFOXpLJXaw_eCqQoKaC')
  ];

  -- Create the HTTP request to Sanctuary OS
  v_request := ROW(
    'GET',
    'https://tpsbtaqxlczrysqqmanp.supabase.co/auth/v1/user',
    v_headers,
    NULL,
    NULL
  )::http_request;

  -- Verify the token with the OS Database
  v_response := http(v_request);

  IF v_response.status != 200 THEN
    RAISE EXCEPTION 'Unauthorized: Invalid OS Token';
  END IF;

  -- Extract user_id from the JSON response
  v_user_id := (v_response.content::json->>'id')::uuid;

  -- Ensure profile exists in Game DB
  INSERT INTO profiles (id, username) 
  VALUES (v_user_id, 'Citizen_' || left(v_user_id::text, 6)) 
  ON CONFLICT DO NOTHING;
  
  -- Handle Follow / Unfollow
  IF p_action = 'follow' THEN
    INSERT INTO mason_followers (user_id, mason_id) 
    VALUES (v_user_id, p_mason_id) 
    ON CONFLICT DO NOTHING;
    RETURN true;
  ELSIF p_action = 'unfollow' THEN
    DELETE FROM mason_followers 
    WHERE user_id = v_user_id AND mason_id = p_mason_id;
    RETURN false;
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;
END;
$$;

-- Securely upsert to sanctuary_schemas or sanctuary_lexicons using OS Token Verification
CREATE OR REPLACE FUNCTION secure_upsert_cloud_file(p_token text, p_target text, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_response http_response;
  v_request http_request;
  v_headers http_header[];
BEGIN
  -- Build headers for the Auth request
  v_headers := ARRAY[
    http_header('Authorization', 'Bearer ' || p_token),
    http_header('apikey', 'sb_publishable_UfZsGP0-5CvUlFOXpLJXaw_eCqQoKaC')
  ];

  -- Create the HTTP request to Sanctuary OS
  v_request := ROW(
    'GET',
    'https://tpsbtaqxlczrysqqmanp.supabase.co/auth/v1/user',
    v_headers,
    NULL,
    NULL
  )::http_request;

  -- Verify the token with the OS Database
  v_response := http(v_request);

  IF v_response.status != 200 THEN
    RAISE EXCEPTION 'Unauthorized: Invalid OS Token';
  END IF;

  -- Perform the UPSERT action safely
  IF p_target = 'sanctuary_schemas' THEN
    INSERT INTO sanctuary_schemas (id, name, schema_data, version, updated_at) 
    VALUES (
      p_payload->>'id', 
      p_payload->>'name', 
      p_payload->'schema_data', 
      COALESCE((p_payload->>'version')::int, 1), 
      COALESCE((p_payload->>'updated_at')::timestamp with time zone, NOW())
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      schema_data = EXCLUDED.schema_data,
      version = EXCLUDED.version,
      updated_at = EXCLUDED.updated_at;
      
  ELSIF p_target = 'sanctuary_lexicons' THEN
    INSERT INTO sanctuary_lexicons (id, name, badge, version, lexicon_data, updated_at) 
    VALUES (
      p_payload->>'id', 
      p_payload->>'name', 
      p_payload->>'badge', 
      COALESCE((p_payload->>'version')::int, 1), 
      p_payload->'lexicon_data', 
      COALESCE((p_payload->>'updated_at')::timestamp with time zone, NOW())
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      badge = EXCLUDED.badge,
      version = EXCLUDED.version,
      lexicon_data = EXCLUDED.lexicon_data,
      updated_at = EXCLUDED.updated_at;
  ELSIF p_target = 'game_versions' THEN
    INSERT INTO game_versions (version, release_date)
    VALUES (p_payload->>'version', COALESCE((p_payload->>'release_date')::date, CURRENT_DATE))
    ON CONFLICT (version) DO UPDATE SET release_date = EXCLUDED.release_date;
  ELSIF p_target = 'dlc_registry' THEN
    INSERT INTO dlc_registry SELECT * FROM jsonb_populate_record(null::dlc_registry, p_payload)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, release_date = EXCLUDED.release_date;
  ELSIF p_target = 'audit_logs' THEN
    INSERT INTO audit_logs (id, action, actor_id, target_table, target_name, reason, created_at)
    VALUES (
      COALESCE((p_payload->>'id')::uuid, uuid_generate_v4()),
      p_payload->>'action',
      (p_payload->>'actor_id')::uuid,
      p_payload->>'target_table',
      p_payload->>'target_name',
      p_payload->>'reason',
      COALESCE((p_payload->>'created_at')::timestamp with time zone, NOW())
    );
  ELSIF p_target = 'logical_conflicts' THEN
    IF p_payload->>'id' IS NULL THEN
      INSERT INTO logical_conflicts (mod_a, mod_b, mod_a_id, mod_b_id, severity_rank)
      VALUES (p_payload->>'mod_a', p_payload->>'mod_b', (p_payload->>'mod_a_id')::uuid, (p_payload->>'mod_b_id')::uuid, (p_payload->>'severity_rank')::int);
    ELSE
      INSERT INTO logical_conflicts (id, mod_a, mod_b, mod_a_id, mod_b_id, severity_rank)
      VALUES ((p_payload->>'id')::int, p_payload->>'mod_a', p_payload->>'mod_b', (p_payload->>'mod_a_id')::uuid, (p_payload->>'mod_b_id')::uuid, (p_payload->>'severity_rank')::int)
      ON CONFLICT (id) DO UPDATE SET mod_a = EXCLUDED.mod_a, mod_b = EXCLUDED.mod_b, mod_a_id = EXCLUDED.mod_a_id, mod_b_id = EXCLUDED.mod_b_id, severity_rank = EXCLUDED.severity_rank;
    END IF;
  ELSIF p_target = 'sanctuary_support_categories' THEN
    IF p_payload->>'id' IS NULL THEN
      INSERT INTO sanctuary_support_categories (category_code, category_name, description, is_active)
      VALUES (p_payload->>'category_code', p_payload->>'category_name', p_payload->>'description', (p_payload->>'is_active')::boolean);
    ELSE
      INSERT INTO sanctuary_support_categories (id, category_code, category_name, description, is_active)
      VALUES ((p_payload->>'id')::int, p_payload->>'category_code', p_payload->>'category_name', p_payload->>'description', (p_payload->>'is_active')::boolean)
      ON CONFLICT (id) DO UPDATE SET category_code = EXCLUDED.category_code, category_name = EXCLUDED.category_name, description = EXCLUDED.description, is_active = EXCLUDED.is_active;
    END IF;
  ELSIF p_target = 'sanctuary_telemetry_sources' THEN
    INSERT INTO sanctuary_telemetry_sources (id, label, description, type, search_path)
    VALUES (
      COALESCE((p_payload->>'id')::uuid, uuid_generate_v4()),
      p_payload->>'label',
      p_payload->>'description',
      p_payload->>'type',
      p_payload->>'search_path'
    )
    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, type = EXCLUDED.type, search_path = EXCLUDED.search_path;
  ELSIF p_target = 'content_flags' THEN
    INSERT INTO content_flags (id, content_id, content_type, reporter_id, reason, created_at)
    VALUES (
      COALESCE((p_payload->>'id')::uuid, uuid_generate_v4()),
      p_payload->>'content_id',
      p_payload->>'content_type',
      (p_payload->>'reporter_id')::uuid,
      p_payload->>'reason',
      COALESCE((p_payload->>'created_at')::timestamp with time zone, NOW())
    )
    ON CONFLICT (id) DO UPDATE SET content_id = EXCLUDED.content_id, content_type = EXCLUDED.content_type, reporter_id = EXCLUDED.reporter_id, reason = EXCLUDED.reason;
  ELSIF p_target = 'heuristic_signatures' THEN
    INSERT INTO heuristic_signatures (id, signature, match_type, source, severity, created_at)
    VALUES (
      COALESCE((p_payload->>'id')::uuid, uuid_generate_v4()),
      p_payload->>'signature',
      p_payload->>'match_type',
      p_payload->>'source',
      p_payload->>'severity',
      COALESCE((p_payload->>'created_at')::timestamp with time zone, NOW())
    )
    ON CONFLICT (id) DO UPDATE SET signature = EXCLUDED.signature, match_type = EXCLUDED.match_type, source = EXCLUDED.source, severity = EXCLUDED.severity;
  ELSIF p_target = 'mods' THEN
    INSERT INTO mods (id, name, status, category_override, sub_type, compliance_tier, compatible_versions, created_at)
    VALUES (
      COALESCE((p_payload->>'id')::uuid, uuid_generate_v4()),
      p_payload->>'name',
      p_payload->>'status',
      p_payload->>'category_override',
      p_payload->>'sub_type',
      p_payload->>'compliance_tier',
      (p_payload->>'compatible_versions')::jsonb,
      COALESCE((p_payload->>'created_at')::timestamp with time zone, NOW())
    )
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, category_override = EXCLUDED.category_override, sub_type = EXCLUDED.sub_type, compliance_tier = EXCLUDED.compliance_tier, compatible_versions = EXCLUDED.compatible_versions;
  ELSIF p_target = 'mod_versions' THEN
    INSERT INTO mod_versions (dna_hash, mod_id, version_label, game_version, created_at)
    VALUES (
      p_payload->>'dna_hash',
      (p_payload->>'mod_id')::uuid,
      p_payload->>'version_label',
      p_payload->>'game_version',
      COALESCE((p_payload->>'created_at')::timestamp with time zone, NOW())
    )
    ON CONFLICT (dna_hash) DO UPDATE SET mod_id = EXCLUDED.mod_id, version_label = EXCLUDED.version_label, game_version = EXCLUDED.game_version;
  ELSIF p_target = 'wf_comms_title' THEN
    INSERT INTO wf_comms_title (id, sender_id, message, created_at)
    VALUES (
      COALESCE((p_payload->>'id')::uuid, uuid_generate_v4()),
      (p_payload->>'sender_id')::uuid,
      p_payload->>'message',
      COALESCE((p_payload->>'created_at')::timestamp with time zone, NOW())
    )
    ON CONFLICT (id) DO UPDATE SET message = EXCLUDED.message;
  ELSE
    RAISE EXCEPTION 'Invalid target: %', p_target;
  END IF;

  RETURN true;
END;
$$;

-- Securely delete from sanctuary_schemas or sanctuary_lexicons using OS Token Verification
CREATE OR REPLACE FUNCTION secure_delete_cloud_file(p_token text, p_target text, p_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response http_response;
  v_request http_request;
  v_headers http_header[];
BEGIN
  -- Build headers for the Auth request
  v_headers := ARRAY[
    http_header('Authorization', 'Bearer ' || p_token),
    http_header('apikey', 'sb_publishable_UfZsGP0-5CvUlFOXpLJXaw_eCqQoKaC')
  ];

  -- Create the HTTP request to Sanctuary OS
  v_request := ROW(
    'GET',
    'https://tpsbtaqxlczrysqqmanp.supabase.co/auth/v1/user',
    v_headers,
    NULL,
    NULL
  )::http_request;

  -- Verify the token with the OS Database
  v_response := http(v_request);

  IF v_response.status != 200 THEN
    RAISE EXCEPTION 'Unauthorized: Invalid OS Token';
  END IF;

  -- Perform the DELETE action safely
  IF p_target = 'sanctuary_schemas' THEN
    DELETE FROM sanctuary_schemas WHERE id = p_id;
  ELSIF p_target = 'sanctuary_lexicons' THEN
    DELETE FROM sanctuary_lexicons WHERE id = p_id;
  ELSIF p_target = 'game_versions' THEN
    DELETE FROM game_versions WHERE version = p_id;
  ELSIF p_target = 'dlc_registry' THEN
    DELETE FROM dlc_registry WHERE id = p_id;
  ELSIF p_target = 'logical_conflicts' THEN
    DELETE FROM logical_conflicts WHERE id = p_id::int;
  ELSIF p_target = 'sanctuary_support_categories' THEN
    DELETE FROM sanctuary_support_categories WHERE id = p_id::uuid;
  ELSIF p_target = 'sanctuary_telemetry_sources' THEN
    DELETE FROM sanctuary_telemetry_sources WHERE id = p_id::uuid;
  ELSIF p_target = 'content_flags' THEN
    DELETE FROM content_flags WHERE id = p_id::uuid;
  ELSIF p_target = 'heuristic_signatures' THEN
    DELETE FROM heuristic_signatures WHERE id = p_id::uuid;
  ELSIF p_target = 'mods' THEN
    DELETE FROM mods WHERE id = p_id::uuid;
  ELSIF p_target = 'mod_versions' THEN
    DELETE FROM mod_versions WHERE id = p_id::uuid;
  ELSIF p_target = 'wf_comms_title' THEN
    DELETE FROM wf_comms_title WHERE id = p_id::uuid;
  ELSE
    RAISE EXCEPTION 'Invalid target: %', p_target;
  END IF;

  RETURN true;
END;
$$;

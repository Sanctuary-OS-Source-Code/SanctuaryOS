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
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL, 
    name TEXT NOT NULL, 
    bio TEXT, 
    avatar_url TEXT, 
    patreon_url TEXT, 
    website_url TEXT, 
    discord_url TEXT,
    compliance_tier INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT false
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
    session_id TEXT,
    log_text TEXT,
    severity TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE homestead_workbench_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    template_name TEXT,
    schema_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

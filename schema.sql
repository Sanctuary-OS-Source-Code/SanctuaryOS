-- Enable the UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- DROP EXISTING SCHEMA (DEPENDENCY ORDER)
-- ==========================================
DROP TRIGGER IF EXISTS trg_purge_flagged_hash_from_blueprints ON public.mods CASCADE;
DROP TRIGGER IF EXISTS trg_prevent_audit_update ON audit_logs CASCADE;
DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON audit_logs CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.purge_flagged_hash_from_blueprints() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS prevent_audit_modifications() CASCADE;

DROP TABLE IF EXISTS homestead_workbench_templates CASCADE;
DROP TABLE IF EXISTS homestead_lab_logs CASCADE;
DROP TABLE IF EXISTS collection_members CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS nexus_reports CASCADE;
DROP TABLE IF EXISTS nexus_assets CASCADE;
DROP TABLE IF EXISTS mason_post_comments CASCADE;
DROP TABLE IF EXISTS heuristic_signatures CASCADE;
DROP TABLE IF EXISTS content_flags CASCADE;
DROP TABLE IF EXISTS blueprint_reports CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS system_broadcasts CASCADE;
DROP TABLE IF EXISTS sanctuary_telemetry_sources CASCADE;
DROP TABLE IF EXISTS sanctuary_support_categories CASCADE;
DROP TABLE IF EXISTS sanctuary_tickets CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS dlc_registry CASCADE;
DROP TABLE IF EXISTS global_security CASCADE;
DROP TABLE IF EXISTS global_network_status CASCADE;
DROP TABLE IF EXISTS blueprints CASCADE;
DROP TABLE IF EXISTS scout_suggestions CASCADE;
DROP TABLE IF EXISTS logical_conflicts CASCADE;
DROP TABLE IF EXISTS flavor_group_members CASCADE;
DROP TABLE IF EXISTS flavor_groups CASCADE;
DROP TABLE IF EXISTS mod_dependencies CASCADE;
DROP TABLE IF EXISTS mod_relationships CASCADE;
DROP TABLE IF EXISTS mod_versions CASCADE;
DROP TABLE IF EXISTS mods CASCADE;
DROP TABLE IF EXISTS game_versions CASCADE;
DROP TABLE IF EXISTS mason_posts CASCADE;
DROP TABLE IF EXISTS mason_followers CASCADE;
DROP TABLE IF EXISTS masons CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS sanctuary_theme_images CASCADE;
DROP TABLE IF EXISTS sanctuary_themes CASCADE;
DROP TABLE IF EXISTS sanctuary_lexicons CASCADE;
DROP TABLE IF EXISTS sanctuary_schemas CASCADE;

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
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE, 
    name TEXT NOT NULL, 
    bio TEXT, 
    avatar_url TEXT, 
    patreon_url TEXT, 
    website_url TEXT, 
    discord_url TEXT,
    compliance_tier INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    pinned_mod_id UUID, -- Foreign key added later to avoid circular dependency
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

-- Now we can add the foreign key to masons
ALTER TABLE masons ADD CONSTRAINT fk_pinned_mod FOREIGN KEY (pinned_mod_id) REFERENCES mods(id) ON DELETE SET NULL;
  
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
    mod_meta JSONB,
    mason_id UUID REFERENCES masons(id) ON DELETE SET NULL,
    game_id TEXT,
    game_name TEXT,
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
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
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
-- MODERATION TRIGGERS
-- ==========================================
-- Create a function to remove a specific hash from all blueprints
CREATE OR REPLACE FUNCTION public.purge_flagged_hash_from_blueprints()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if compliance_tier was changed to 1-5
    IF (TG_OP = 'INSERT' AND NEW.compliance_tier BETWEEN 1 AND 5) OR 
       (TG_OP = 'UPDATE' AND NEW.compliance_tier BETWEEN 1 AND 5 AND OLD.compliance_tier IS DISTINCT FROM NEW.compliance_tier) THEN

        -- Update artifacts column (if it contains data)
        UPDATE public.blueprints
        SET artifacts = (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(artifacts) AS elem
            WHERE elem->>'hash' NOT IN (
                SELECT dna_hash FROM public.mod_versions WHERE mod_id = NEW.id
            )
        )
        WHERE EXISTS (
            SELECT 1 FROM jsonb_array_elements(artifacts) AS elem
            JOIN public.mod_versions mv ON mv.dna_hash = elem->>'hash'
            WHERE mv.mod_id = NEW.id
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on mods table
CREATE TRIGGER trg_purge_flagged_hash_from_blueprints
AFTER INSERT OR UPDATE OF compliance_tier ON public.mods
FOR EACH ROW
EXECUTE FUNCTION public.purge_flagged_hash_from_blueprints();

-- ==========================================
-- 9. MASTER SCHEMAS (Synched from Core)
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

CREATE TABLE sanctuary_theme_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    theme_id TEXT REFERENCES sanctuary_themes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_data TEXT NOT NULL, -- Base64 encoded image data
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and add basic policies for sanctuary_theme_images
ALTER TABLE sanctuary_theme_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access theme images" ON public.sanctuary_theme_images FOR SELECT USING (true);
CREATE POLICY "Allow insert access theme images" ON public.sanctuary_theme_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update access theme images" ON public.sanctuary_theme_images FOR UPDATE USING (true);
CREATE POLICY "Allow delete access theme images" ON public.sanctuary_theme_images FOR DELETE USING (true);

-- ==========================================
-- 10. NEXUS & HOMESTEAD (FORMERLY MARKETPLACE & SOLDER LAB)
-- ==========================================
CREATE TABLE nexus_assets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT,
    asset_type TEXT,
    author TEXT,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    language TEXT,
    json_data JSONB,
    image_url TEXT,
    description TEXT,
    is_community_default BOOLEAN DEFAULT false,
    version TEXT,
    release_notes TEXT,
    is_public BOOLEAN DEFAULT true,
    theme_mode TEXT,
    downloads INTEGER DEFAULT 0,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    lexicon_type TEXT,
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

-- Enable RLS and add basic policies for nexus_assets
ALTER TABLE nexus_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.nexus_assets FOR SELECT USING (true);
CREATE POLICY "Allow insert access" ON public.nexus_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update access" ON public.nexus_assets FOR UPDATE USING (true);
CREATE POLICY "Allow delete access" ON public.nexus_assets FOR DELETE USING (true);

-- Enable RLS and add basic policies for nexus_reports
ALTER TABLE nexus_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access reports" ON public.nexus_reports FOR SELECT USING (true);
CREATE POLICY "Allow insert access reports" ON public.nexus_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update access reports" ON public.nexus_reports FOR UPDATE USING (true);
CREATE POLICY "Allow delete access reports" ON public.nexus_reports FOR DELETE USING (true);

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

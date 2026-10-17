-- ============================================================================
-- SANCTUARY OS: TURNKEY SPOKE DATABASE SCHEMA (V0.5.7)
-- ============================================================================
-- HOW TO USE:
-- 1. Create a new Supabase project for your game community (Spoke).
-- 2. Copy and paste this entire file into the Supabase SQL Editor and click RUN.
-- 3. Generate your SANCTUARY-UPLINK:// bundle (or copy your Project URL, Anon Key,
--    and Service Role Key) and link your Spoke in Keepers Core -> Active Workspaces.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CLEANUP (IDEMPOTENT RESET)
-- ============================================================================
DROP TABLE IF EXISTS version_dependencies CASCADE;
DROP TABLE IF EXISTS tracked_template_files CASCADE;
DROP TABLE IF EXISTS taxonomy CASCADE;
DROP TABLE IF EXISTS dispatch_poll_votes CASCADE;
DROP TABLE IF EXISTS system_broadcasts CASCADE;
DROP TABLE IF EXISTS scout_suggestions CASCADE;
DROP TABLE IF EXISTS sanctuary_tickets CASCADE;
DROP TABLE IF EXISTS sanctuary_themes CASCADE;
DROP TABLE IF EXISTS sanctuary_telemetry_sources CASCADE;
DROP TABLE IF EXISTS sanctuary_support_categories CASCADE;
DROP TABLE IF EXISTS sanctuary_schemas CASCADE;
DROP TABLE IF EXISTS sanctuary_lexicons CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS nexus_reports CASCADE;
DROP TABLE IF EXISTS nexus_assets CASCADE;
DROP TABLE IF EXISTS mods CASCADE;
DROP TABLE IF EXISTS mod_versions CASCADE;
DROP TABLE IF EXISTS mod_relationships CASCADE;
DROP TABLE IF EXISTS mod_dependencies CASCADE;
DROP TABLE IF EXISTS mod_bundles CASCADE;
DROP TABLE IF EXISTS masons CASCADE;
DROP TABLE IF EXISTS mason_posts CASCADE;
DROP TABLE IF EXISTS mason_post_views CASCADE;
DROP TABLE IF EXISTS mason_post_likes CASCADE;
DROP TABLE IF EXISTS mason_post_comments CASCADE;
DROP TABLE IF EXISTS mason_followers CASCADE;
DROP TABLE IF EXISTS malware_reports CASCADE;
DROP TABLE IF EXISTS logical_conflicts CASCADE;
DROP TABLE IF EXISTS homestead_workbench_templates CASCADE;
DROP TABLE IF EXISTS homestead_lab_logs CASCADE;
DROP TABLE IF EXISTS heuristic_signatures CASCADE;
DROP TABLE IF EXISTS global_security CASCADE;
DROP TABLE IF EXISTS global_network_status CASCADE;
DROP TABLE IF EXISTS game_versions CASCADE;
DROP TABLE IF EXISTS flavor_groups CASCADE;
DROP TABLE IF EXISTS flavor_group_members CASCADE;
DROP TABLE IF EXISTS dlc_registry CASCADE;
DROP TABLE IF EXISTS content_flags CASCADE;
DROP TABLE IF EXISTS community_groups CASCADE;
DROP TABLE IF EXISTS community_group_members CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS collection_members CASCADE;
DROP TABLE IF EXISTS blueprints CASCADE;
DROP TABLE IF EXISTS blueprint_reports CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- ============================================================================
-- 2. IDENTITY & CREATOR TABLES (HUB-DECOUPLED SPOKE PROFILES)
-- ============================================================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'citizen',
    is_banned BOOLEAN DEFAULT false,
    blacklist_reason TEXT,
    is_comm_banned BOOLEAN DEFAULT false,
    comm_blacklist_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE masons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    bio TEXT,
    avatar_url TEXT,
    patreon_url TEXT,
    website_url TEXT,
    discord_url TEXT,
    is_verified BOOLEAN DEFAULT false,
    pinned_mod_id UUID,
    pinned_asset_id UUID,
    pinned_blueprint_id INTEGER,
    pinned_ccset_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE mason_followers (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mason_id UUID NOT NULL REFERENCES masons(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, mason_id)
);

-- ============================================================================
-- 3. ARTIFACT REGISTRY, VERSIONS & RELATIONAL MATRIX
-- ============================================================================

CREATE TABLE mods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mason_id UUID REFERENCES masons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    status TEXT DEFAULT 'under_review',
    is_official BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    family_slug TEXT,
    category_override TEXT,
    master_author TEXT,
    image_url TEXT,
    url TEXT,
    is_nsfw BOOLEAN DEFAULT false,
    "requiredDLC" JSONB,
    latest_version TEXT,
    sub_type TEXT,
    allow_write BOOLEAN NOT NULL DEFAULT false,
    compliance_tier SMALLINT NOT NULL DEFAULT 0,
    status_reason TEXT,
    compatible_versions TEXT[],
    updated_at TIMESTAMP WITH TIME ZONE,
    folder_structure JSONB DEFAULT '[]'::jsonb,
    last_updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    file_extension TEXT,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false
);

CREATE TABLE mod_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    version_label TEXT NOT NULL,
    game_version TEXT,
    dna_hash TEXT UNIQUE,
    download_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_core_file BOOLEAN DEFAULT false,
    parent_hash TEXT
);

CREATE TABLE mod_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    twin_id UUID REFERENCES mods(id) ON DELETE CASCADE
);

CREATE TABLE mod_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    child_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    UNIQUE (parent_id, child_id)
);

CREATE TABLE mod_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    child_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    relationship_type TEXT DEFAULT 'addon',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    set_item TEXT
);

CREATE TABLE version_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_hash TEXT NOT NULL,
    child_hash TEXT NOT NULL,
    is_flavor BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (parent_hash, child_hash)
);

CREATE TABLE logical_conflicts (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    severity_rank INTEGER,
    resolution_note TEXT,
    mod_a_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    mod_b_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    mod_a TEXT,
    mod_b TEXT,
    status TEXT DEFAULT 'approved'
);

CREATE TABLE community_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE community_group_members (
    group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    mod_hash TEXT NOT NULL REFERENCES mod_versions(dna_hash) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, mod_hash)
);

CREATE TABLE flavor_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL
);

CREATE TABLE flavor_group_members (
    group_id UUID NOT NULL REFERENCES flavor_groups(id) ON DELETE CASCADE,
    mod_hash TEXT NOT NULL REFERENCES mod_versions(dna_hash) ON DELETE CASCADE,
    PRIMARY KEY (group_id, mod_hash)
);

-- ============================================================================
-- 4. COLLECTIONS, BLUEPRINTS & MARKETPLACE (THE GALLERY / NEXUS)
-- ============================================================================

CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    image_url TEXT,
    is_official BOOLEAN DEFAULT false,
    set_type TEXT DEFAULT 'Collection',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    mason_id UUID REFERENCES masons(id) ON DELETE SET NULL,
    url TEXT,
    compliance_tier SMALLINT DEFAULT 0
);

CREATE TABLE collection_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    mod_id UUID REFERENCES mods(id) ON DELETE CASCADE,
    dna_hash TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (set_id, mod_id)
);

CREATE TABLE blueprints (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    mason_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    compliance_tier SMALLINT NOT NULL DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    is_locked BOOLEAN DEFAULT false,
    is_market_listed BOOLEAN DEFAULT false,
    game_version TEXT,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    downloads INTEGER DEFAULT 0
);

CREATE TABLE blueprint_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id BIGINT REFERENCES blueprints(id) ON DELETE CASCADE,
    reporter_name TEXT,
    reason TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE nexus_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_type TEXT NOT NULL,
    name TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT,
    json_data JSONB NOT NULL,
    downloads INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    language TEXT,
    lexicon_type TEXT,
    theme_mode TEXT,
    is_community_default BOOLEAN DEFAULT false,
    version TEXT DEFAULT '1.0.0',
    release_notes TEXT,
    is_public BOOLEAN DEFAULT true,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE nexus_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES nexus_assets(id) ON DELETE CASCADE,
    reporter_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ============================================================================
-- 5. MASON COMM-LINK, SYSTEM DISPATCHES & INTERACTIVE POLLS
-- ============================================================================

CREATE TABLE mason_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mason_id UUID REFERENCES masons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    image_url TEXT,
    code_snippet TEXT,
    is_pinned BOOLEAN DEFAULT false
);

CREATE TABLE mason_post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES mason_posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    parent_comment_id UUID REFERENCES mason_post_comments(id) ON DELETE CASCADE,
    code_snippet TEXT
);

CREATE TABLE mason_post_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES mason_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (post_id, user_id)
);

CREATE TABLE mason_post_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES mason_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (post_id, user_id)
);

CREATE TABLE system_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    title TEXT NOT NULL,
    description TEXT,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Information',
    is_active BOOLEAN NOT NULL DEFAULT true,
    target_audience TEXT,
    action_required TEXT DEFAULT 'No Action Required',
    poll_data JSONB,
    code_snippet TEXT,
    is_pinned TEXT
);

CREATE TABLE dispatch_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES system_broadcasts(id) ON DELETE CASCADE,
    poll_id TEXT NOT NULL DEFAULT 'default',
    option_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (broadcast_id, user_id, option_id)
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    reference_id UUID,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================================================
-- 6. SECURITY, HEURISTICS, SUPPORT & TELEMETRY
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_name TEXT,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE content_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,
    content_id UUID NOT NULL,
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolution_note TEXT
);

CREATE TABLE global_network_status (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    defcon_level INTEGER NOT NULL DEFAULT 5,
    message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    status_message TEXT DEFAULT 'Network Secure. All systems nominal.'
);

INSERT INTO global_network_status (id, defcon_level, status_message)
VALUES (1, 5, 'Network Secure. All systems nominal.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE global_security (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE heuristic_signatures (
    id TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    match_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    source TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

CREATE TABLE malware_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    artifact_name TEXT,
    detected_hash TEXT,
    signature TEXT,
    original_hash_at_import TEXT,
    original_exists BOOLEAN,
    original_shredded BOOLEAN,
    detected_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    quarantined_file_shredded BOOLEAN DEFAULT false
);

CREATE TABLE scout_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dna_hash TEXT NOT NULL,
    suggested_name TEXT,
    suggested_author TEXT,
    suggested_type TEXT,
    suggested_url TEXT,
    submitter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'pending',
    suggested_bonded_to TEXT,
    suggested_version TEXT,
    suggested_game_versions TEXT[],
    description TEXT,
    image_url TEXT,
    compliance_tier TEXT,
    suggested_sub_type TEXT
);

CREATE TABLE sanctuary_support_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    category_name TEXT NOT NULL,
    category_code TEXT NOT NULL UNIQUE,
    description TEXT,
    requires_target_mod BOOLEAN DEFAULT false,
    requires_target_user BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    custom_fields JSONB DEFAULT '[]'::jsonb,
    ticket_destination TEXT DEFAULT 'general',
    escalation_path TEXT DEFAULT 'standard',
    show_description_box BOOLEAN DEFAULT true,
    show_logs_box BOOLEAN DEFAULT false,
    show_title_box BOOLEAN DEFAULT true,
    attach_blueprints BOOLEAN DEFAULT false,
    telemetry_config JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE sanctuary_telemetry_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    file_pattern TEXT NOT NULL,
    search_path TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ticket_type TEXT NOT NULL,
    status TEXT DEFAULT 'OPEN',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 7. WORKBENCH, GAME METADATA & SPOKE OVERRIDES
-- ============================================================================

CREATE TABLE dlc_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    release_date DATE
);

CREATE TABLE game_versions (
    version VARCHAR PRIMARY KEY,
    release_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE taxonomy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    type TEXT,
    sub_type TEXT,
    style TEXT,
    gender_frame TEXT
);

CREATE TABLE homestead_lab_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id TEXT NOT NULL UNIQUE,
    target_file TEXT NOT NULL,
    parser_type TEXT NOT NULL,
    mod_author TEXT,
    template_author TEXT,
    template_version TEXT DEFAULT '1.0.0',
    schema_version TEXT DEFAULT '2',
    supported_mod_versions JSONB DEFAULT '[]'::jsonb,
    write_scope TEXT DEFAULT 'active_mod_folder',
    categories JSONB DEFAULT '[]'::jsonb,
    settings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tracked_template_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name TEXT NOT NULL UNIQUE,
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE sanctuary_lexicons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    badge TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    lexicon_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_schemas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    schema_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    theme_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 8. INDEXES
-- ============================================================================
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_blueprints_code ON blueprints(code);
CREATE INDEX idx_dispatch_poll_votes_broadcast ON dispatch_poll_votes(broadcast_id);
CREATE INDEX idx_mason_posts_created_at ON mason_posts(created_at DESC);
CREATE INDEX idx_mason_posts_mason ON mason_posts(mason_id);
CREATE INDEX idx_mod_versions_dna_hash ON mod_versions(dna_hash);
CREATE INDEX idx_mod_versions_mod_id ON mod_versions(mod_id);
CREATE INDEX idx_mods_compliance_tier ON mods(compliance_tier);
CREATE INDEX idx_mods_mason_id ON mods(mason_id);
CREATE INDEX idx_mods_slug ON mods(slug);
CREATE INDEX idx_mods_status ON mods(status);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX idx_scout_suggestions_dna_hash ON scout_suggestions(dna_hash);
CREATE INDEX idx_scout_suggestions_status ON scout_suggestions(status);
CREATE INDEX idx_tickets_author ON sanctuary_tickets(author_id);
CREATE INDEX idx_tickets_status ON sanctuary_tickets(status);

-- ============================================================================
-- 9. FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_mods_modtime
BEFORE UPDATE ON mods
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE OR REPLACE FUNCTION prevent_audit_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. Modification or deletion is strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_audit_log_immutability
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modifications();

CREATE OR REPLACE FUNCTION purge_flagged_hash_from_blueprints()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.compliance_tier BETWEEN 1 AND 5) OR 
       (TG_OP = 'UPDATE' AND NEW.compliance_tier BETWEEN 1 AND 5 AND OLD.compliance_tier IS DISTINCT FROM NEW.compliance_tier) THEN
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

CREATE TRIGGER trg_purge_flagged_hash_from_blueprints
AFTER INSERT OR UPDATE OF compliance_tier ON mods
FOR EACH ROW EXECUTE FUNCTION purge_flagged_hash_from_blueprints();

CREATE OR REPLACE FUNCTION get_blueprints_premium_status(b_ids bigint[])
RETURNS TABLE(id bigint, is_paid boolean, is_early_access boolean)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT b.id,
         COALESCE(bool_or(m.is_paid), false) AS is_paid,
         COALESCE(bool_or(m.is_early_access), false) AS is_early_access
  FROM blueprints b
  CROSS JOIN LATERAL jsonb_array_elements(b.artifacts) AS arr(elem)
  LEFT JOIN mod_versions mv ON mv.dna_hash = (elem->>'hash')
  LEFT JOIN mods m ON m.id = mv.mod_id
  WHERE b.id = ANY(b_ids)
  GROUP BY b.id;
END;
$$;

CREATE OR REPLACE FUNCTION get_flavor_group_members_by_hashes(p_hashes text[])
RETURNS SETOF flavor_group_members LANGUAGE sql STABLE AS $$
  SELECT * FROM flavor_group_members WHERE mod_hash = ANY(p_hashes);
$$;

CREATE OR REPLACE FUNCTION get_flavor_groups_by_ids(p_ids uuid[])
RETURNS SETOF flavor_groups LANGUAGE sql STABLE AS $$
  SELECT * FROM flavor_groups WHERE id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION get_mod_dependencies_by_ids(p_ids uuid[])
RETURNS SETOF mod_dependencies LANGUAGE sql STABLE AS $$
  SELECT * FROM mod_dependencies WHERE child_id = ANY(p_ids) OR parent_id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION get_mod_relationships_by_ids(p_ids uuid[])
RETURNS SETOF mod_relationships LANGUAGE sql STABLE AS $$
  SELECT * FROM mod_relationships WHERE child_id = ANY(p_ids) OR parent_id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION get_mod_versions_by_hashes(p_hashes text[])
RETURNS SETOF mod_versions LANGUAGE sql STABLE AS $$
  SELECT * FROM mod_versions WHERE dna_hash = ANY(p_hashes);
$$;

CREATE OR REPLACE FUNCTION get_mods_by_ids(p_ids uuid[])
RETURNS SETOF mods LANGUAGE sql STABLE AS $$
  SELECT * FROM mods WHERE id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION increment_asset_downloads(asset_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE nexus_assets SET downloads = COALESCE(downloads, 0) + 1 WHERE id = asset_id;
$$;

CREATE OR REPLACE FUNCTION increment_blueprint_downloads(blueprint_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE blueprints SET downloads = COALESCE(downloads, 0) + 1 WHERE id = blueprint_id;
END;
$$;

CREATE OR REPLACE FUNCTION hide_mason_comment(p_comment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.mason_post_comments SET is_hidden = true WHERE id = p_comment_id;
END;
$$;

CREATE TABLE IF NOT EXISTS hardware_bans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hwid_hash TEXT NOT NULL UNIQUE,
    reason TEXT DEFAULT 'Malware / Security Violation',
    banned_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Automatic Standalone Fork Auth Trigger:
-- In Hub-and-Spoke mode, users sign up on the Hub DB, so this trigger remains dormant on the Spoke.
-- In Standalone Fork mode, users sign up directly on this database: the very first registered user is
-- automatically promoted to 'wayfinder' (Founding Wayfinder), and subsequent users default to 'citizen'.
CREATE OR REPLACE FUNCTION public.handle_new_spoke_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    assigned_role TEXT := 'citizen';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'wayfinder') THEN
        assigned_role := 'wayfinder';
    END IF;

    INSERT INTO public.profiles (id, username, role, is_banned, is_comm_banned, created_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'Citizen'),
        assigned_role,
        false,
        false,
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_spoke ON auth.users;
CREATE TRIGGER on_auth_user_created_spoke
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_spoke_user();

-- ============================================================================
-- 10. TURNKEY ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Note: Spoke databases are queried by clients using the Spoke Anon Key (or
-- authenticated session JWTs in Standalone Fork mode) while Hub-and-Spoke
-- role mutations route through the Hub API Gateway (Service Role).
-- These policies ensure immediate turnkey operation out of the box for both modes.
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Sanctuary Spoke Public Read" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Sanctuary Spoke Public Read" ON public.%I FOR SELECT TO public USING (true);', tbl);
    END LOOP;
END $$;

-- Allow client-side operational writes on Spoke tables (audit_logs is append-only via trigger)
DO $$
DECLARE
    writable_tbl TEXT;
BEGIN
    FOREACH writable_tbl IN ARRAY ARRAY[
        'audit_logs',
        'blueprint_reports',
        'blueprints',
        'collection_members',
        'collections',
        'community_group_members',
        'community_groups',
        'content_flags',
        'dispatch_poll_votes',
        'dlc_registry',
        'flavor_group_members',
        'flavor_groups',
        'game_versions',
        'global_network_status',
        'global_security',
        'hardware_bans',
        'heuristic_signatures',
        'homestead_lab_logs',
        'homestead_workbench_templates',
        'logical_conflicts',
        'malware_reports',
        'mason_followers',
        'mason_post_comments',
        'mason_post_likes',
        'mason_post_views',
        'mason_posts',
        'masons',
        'mod_bundles',
        'mod_dependencies',
        'mod_relationships',
        'mod_versions',
        'mods',
        'nexus_assets',
        'nexus_reports',
        'notifications',
        'profiles',
        'sanctuary_lexicons',
        'sanctuary_schemas',
        'sanctuary_support_categories',
        'sanctuary_telemetry_sources',
        'sanctuary_themes',
        'sanctuary_tickets',
        'scout_suggestions',
        'system_broadcasts',
        'taxonomy',
        'tracked_template_files',
        'version_dependencies'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Sanctuary Spoke Operational Write" ON public.%I;', writable_tbl);
        EXECUTE format('CREATE POLICY "Sanctuary Spoke Operational Write" ON public.%I FOR ALL TO public USING (true) WITH CHECK (true);', writable_tbl);
    END LOOP;
END $$;

SELECT 'Sanctuary OS Spoke Schema V0.5.7 Initialized Successfully' AS status;



-- ============================================================================
-- SANCTUARY OS: TURNKEY SPOKE DATABASE SCHEMA (V0.6.0-Dev.13)
-- ============================================================================
-- HOW TO USE:
-- 1. Create a new Supabase project for your game community (Spoke).
-- 2. Copy and paste this entire file into the Supabase SQL Editor and click RUN.
-- 3. Copy your Project URL, Anon Key, and the one-time Spoke Gateway Token
--    (`spk_gw_...`) printed in the SQL result (NEVER copy your service_role key!)
--    and link your Spoke in Keepers Core -> Active Workspaces (or run
--    SELECT * FROM public.mint_spoke_gateway_token(); at any time to rotate).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PRIVATE INTERNAL SCHEMA, VAULT-SEALED SECRETS & GATEWAY TOKENS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS sanctuary_internal;
REVOKE ALL ON SCHEMA sanctuary_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA sanctuary_internal TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS sanctuary_internal.runtime_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '[VAULT_SEALED]',
    vault_secret_id UUID,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE sanctuary_internal.runtime_secrets
    ADD COLUMN IF NOT EXISTS vault_secret_id UUID;

REVOKE ALL ON TABLE sanctuary_internal.runtime_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sanctuary_internal.runtime_secrets TO service_role;
ALTER TABLE sanctuary_internal.runtime_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_runtime_secrets" ON sanctuary_internal.runtime_secrets;
CREATE POLICY "service_role_runtime_secrets" ON sanctuary_internal.runtime_secrets
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION sanctuary_internal.read_runtime_secret(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_val TEXT;
    v_vault_id UUID;
BEGIN
    SELECT value, vault_secret_id
    INTO v_val, v_vault_id
    FROM sanctuary_internal.runtime_secrets
    WHERE key = p_key;

    IF v_vault_id IS NOT NULL AND to_regnamespace('vault') IS NOT NULL THEN
        EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1'
        INTO v_val
        USING v_vault_id;
        RETURN v_val;
    END IF;

    IF v_val = '[VAULT_SEALED]' THEN
        RETURN NULL;
    END IF;
    RETURN v_val;
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.read_runtime_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sanctuary_internal.read_runtime_secret(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION sanctuary_internal.write_runtime_secret(p_key TEXT, p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_clean TEXT := NULLIF(btrim(COALESCE(p_value, '')), '');
    v_existing_vault_id UUID;
    v_secret_name TEXT := 'sanctuary_runtime:' || p_key;
    v_new_vault_id UUID;
BEGIN
    SELECT vault_secret_id INTO v_existing_vault_id
    FROM sanctuary_internal.runtime_secrets
    WHERE key = p_key;

    IF v_clean IS NULL THEN
        IF v_existing_vault_id IS NOT NULL AND to_regnamespace('vault') IS NOT NULL THEN
            EXECUTE 'DELETE FROM vault.secrets WHERE id = $1' USING v_existing_vault_id;
        END IF;
        DELETE FROM sanctuary_internal.runtime_secrets WHERE key = p_key;
        RETURN;
    END IF;

    IF to_regnamespace('vault') IS NOT NULL THEN
        IF v_existing_vault_id IS NULL THEN
            EXECUTE 'SELECT id FROM vault.secrets WHERE name = $1 LIMIT 1'
            INTO v_existing_vault_id
            USING v_secret_name;
        END IF;

        IF v_existing_vault_id IS NOT NULL THEN
            EXECUTE 'SELECT vault.update_secret($1, $2, $3, $4)'
            USING v_existing_vault_id, v_clean, v_secret_name, 'Sanctuary OS Spoke runtime secret';
            v_new_vault_id := v_existing_vault_id;
        ELSE
            EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
            INTO v_new_vault_id
            USING v_clean, v_secret_name, 'Sanctuary OS Spoke runtime secret';
        END IF;

        INSERT INTO sanctuary_internal.runtime_secrets (key, value, vault_secret_id, updated_at)
        VALUES (p_key, '[VAULT_SEALED]', v_new_vault_id, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = '[VAULT_SEALED]',
            vault_secret_id = EXCLUDED.vault_secret_id,
            updated_at = NOW();
    ELSE
        INSERT INTO sanctuary_internal.runtime_secrets (key, value, vault_secret_id, updated_at)
        VALUES (p_key, v_clean, NULL, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            vault_secret_id = NULL,
            updated_at = NOW();
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.write_runtime_secret(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sanctuary_internal.write_runtime_secret(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION sanctuary_internal.cleanup_runtime_secret_vault()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF OLD.vault_secret_id IS NOT NULL AND to_regnamespace('vault') IS NOT NULL THEN
        EXECUTE 'DELETE FROM vault.secrets WHERE id = $1' USING OLD.vault_secret_id;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_runtime_secret_vault ON sanctuary_internal.runtime_secrets;
CREATE TRIGGER trg_cleanup_runtime_secret_vault
    AFTER DELETE ON sanctuary_internal.runtime_secrets
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.cleanup_runtime_secret_vault();

DO $$
DECLARE
    r RECORD;
BEGIN
    IF to_regnamespace('vault') IS NOT NULL THEN
        FOR r IN
            SELECT key, value
            FROM sanctuary_internal.runtime_secrets
            WHERE vault_secret_id IS NULL
              AND COALESCE(value, '') <> ''
              AND value <> '[VAULT_SEALED]'
        LOOP
            PERFORM sanctuary_internal.write_runtime_secret(r.key, r.value);
        END LOOP;
    END IF;
END;
$$;

-- Scoped Hub Gateway Tokens (Salted HMAC-SHA256 digests only; raw spk_gw_* secret is NEVER stored)
CREATE TABLE IF NOT EXISTS sanctuary_internal.spoke_gateway_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL DEFAULT 'Hub Gateway Uplink',
    token_salt TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

REVOKE ALL ON TABLE sanctuary_internal.spoke_gateway_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sanctuary_internal.spoke_gateway_tokens TO service_role;
ALTER TABLE sanctuary_internal.spoke_gateway_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_spoke_gateway_tokens" ON sanctuary_internal.spoke_gateway_tokens;
CREATE POLICY "service_role_spoke_gateway_tokens" ON sanctuary_internal.spoke_gateway_tokens
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. IDEMPOTENT UPGRADE NOTICE (NON-DESTRUCTIVE COPY & PASTE)
-- ============================================================================
-- All tables below use CREATE TABLE IF NOT EXISTS and additive ALTER TABLE ...
-- ADD COLUMN IF NOT EXISTS blocks so this script can be safely pasted and
-- re-run inside the Supabase SQL Editor on existing databases without data loss.

-- ============================================================================
-- 3. IDENTITY & CREATOR TABLES (HUB-DECOUPLED SPOKE PROFILES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'citizen',
    is_banned BOOLEAN DEFAULT false,
    blacklist_reason TEXT,
    is_comm_banned BOOLEAN DEFAULT false,
    comm_blacklist_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sanctuary_internal.spoke_relink_commitments (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    commitment_hash TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE sanctuary_internal.spoke_relink_commitments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sanctuary_internal.spoke_relink_commitments TO service_role;
ALTER TABLE sanctuary_internal.spoke_relink_commitments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_spoke_relink_commitments" ON sanctuary_internal.spoke_relink_commitments;
CREATE POLICY "service_role_spoke_relink_commitments" ON sanctuary_internal.spoke_relink_commitments
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.masons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    bio TEXT,
    avatar_url TEXT,
    patreon_url TEXT,
    donation_url TEXT,
    payment_processor TEXT DEFAULT 'patreon',
    patreon_campaign_id TEXT,
    website_url TEXT,
    discord_url TEXT,
    is_verified BOOLEAN DEFAULT false,
    followers_count INTEGER DEFAULT 0,
    pinned_mod_id UUID,
    pinned_asset_id UUID,
    pinned_blueprint_id INTEGER,
    pinned_collection_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mason_followers (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mason_id UUID NOT NULL REFERENCES public.masons(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, mason_id)
);

-- ============================================================================
-- 4. ARTIFACT REGISTRY, VERSIONS & RELATIONAL MATRIX
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mason_id UUID REFERENCES public.masons(id) ON DELETE CASCADE,
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
    has_pending_flag BOOLEAN NOT NULL DEFAULT false,
    status_reason TEXT,
    compatible_versions TEXT[],
    updated_at TIMESTAMP WITH TIME ZONE,
    folder_structure JSONB DEFAULT '[]'::jsonb,
    last_updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    file_extension TEXT,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    highlander_group_id UUID
);

CREATE TABLE IF NOT EXISTS public.mod_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mod_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    version_label TEXT NOT NULL,
    game_version TEXT,
    dna_hash TEXT UNIQUE,
    download_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_core_file BOOLEAN DEFAULT false,
    parent_hash TEXT
);

CREATE TABLE IF NOT EXISTS public.mod_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    twin_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    UNIQUE (primary_id, twin_id)
);

CREATE TABLE IF NOT EXISTS public.mod_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    child_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    UNIQUE (parent_id, child_id)
);

CREATE TABLE IF NOT EXISTS public.mod_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    child_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    relationship_type TEXT DEFAULT 'addon',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    set_item TEXT,
    UNIQUE (parent_id, child_id)
);

CREATE TABLE IF NOT EXISTS public.version_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_hash TEXT NOT NULL,
    child_hash TEXT NOT NULL,
    is_flavor BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (parent_hash, child_hash)
);

CREATE TABLE IF NOT EXISTS public.logical_conflicts (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    severity_rank INTEGER,
    resolution_note TEXT,
    mod_a_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    mod_b_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    mod_a TEXT,
    mod_b TEXT,
    status TEXT DEFAULT 'approved'
);

CREATE TABLE IF NOT EXISTS public.community_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_group_members (
    group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
    mod_hash TEXT NOT NULL REFERENCES public.mod_versions(dna_hash) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, mod_hash)
);

CREATE TABLE IF NOT EXISTS public.flavor_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mods_highlander_group_id_fkey'
    ) THEN
        ALTER TABLE public.mods
            ADD CONSTRAINT mods_highlander_group_id_fkey
            FOREIGN KEY (highlander_group_id) REFERENCES public.flavor_groups(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.flavor_group_members (
    group_id UUID NOT NULL REFERENCES public.flavor_groups(id) ON DELETE CASCADE,
    mod_hash TEXT NOT NULL REFERENCES public.mod_versions(dna_hash) ON DELETE CASCADE,
    PRIMARY KEY (group_id, mod_hash)
);

-- ============================================================================
-- 5. COLLECTIONS, BLUEPRINTS & MARKETPLACE (NEXUS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    image_url TEXT,
    is_official BOOLEAN DEFAULT false,
    set_type TEXT DEFAULT 'Collection',
    status TEXT DEFAULT 'stable',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    mason_id UUID REFERENCES public.masons(id) ON DELETE SET NULL,
    url TEXT,
    compliance_tier SMALLINT DEFAULT 0,
    has_pending_flag BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.collection_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
    mod_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    dna_hash TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (set_id, mod_id)
);

-- Note: `mason_id` stores either a Citizen's `profiles.id` or a Creator's `masons.id`
CREATE TABLE IF NOT EXISTS public.blueprints (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    mason_id UUID,
    compliance_tier SMALLINT NOT NULL DEFAULT 0,
    has_pending_flag BOOLEAN NOT NULL DEFAULT false,
    is_public BOOLEAN DEFAULT true,
    is_locked BOOLEAN DEFAULT false,
    is_market_listed BOOLEAN DEFAULT false,
    game_version TEXT,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    downloads INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.blueprint_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blueprint_id BIGINT REFERENCES public.blueprints(id) ON DELETE CASCADE,
    reporter_name TEXT,
    reason TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.nexus_assets (
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
    has_pending_flag BOOLEAN NOT NULL DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    is_early_access BOOLEAN DEFAULT false,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.nexus_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.nexus_assets(id) ON DELETE CASCADE,
    reporter_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ============================================================================
-- 6. CREATOR COMM-LINK, SYSTEM DISPATCHES & INTERACTIVE POLLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mason_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mason_id UUID REFERENCES public.masons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    image_url TEXT,
    code_snippet TEXT,
    is_pinned BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    has_pending_flag BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.mason_post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.mason_posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT false,
    has_pending_flag BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    parent_comment_id UUID REFERENCES public.mason_post_comments(id) ON DELETE CASCADE,
    code_snippet TEXT
);

CREATE TABLE IF NOT EXISTS public.mason_post_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.mason_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.mason_post_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.mason_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.system_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    title TEXT NOT NULL,
    description TEXT,
    message TEXT NOT NULL,
    image_url TEXT,
    category TEXT NOT NULL DEFAULT 'Information',
    is_active BOOLEAN NOT NULL DEFAULT true,
    target_audience TEXT,
    action_required TEXT DEFAULT 'No Action Required',
    poll_data JSONB,
    code_snippet TEXT,
    is_pinned TEXT,
    has_pending_flag BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.dispatch_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.system_broadcasts(id) ON DELETE CASCADE,
    poll_id TEXT NOT NULL DEFAULT 'default',
    option_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (broadcast_id, poll_id, option_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    reference_id UUID,
    title TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================================================
-- 7. SECURITY, HEURISTICS, SUPPORT & TELEMETRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_name TEXT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    game_name TEXT,
    changes JSONB DEFAULT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.content_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,
    content_id UUID NOT NULL,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolution_note TEXT
);

CREATE TABLE IF NOT EXISTS public.global_network_status (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    defcon_level INTEGER NOT NULL DEFAULT 5,
    message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    status_message TEXT DEFAULT 'Network Secure. All systems nominal.'
);

INSERT INTO public.global_network_status (id, defcon_level, status_message)
VALUES (1, 5, 'Network Secure. All systems nominal.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.global_security (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hardware_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hwid_hash TEXT NOT NULL UNIQUE,
    reason TEXT DEFAULT 'Malware / Security Violation',
    banned_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.heuristic_signatures (
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

CREATE TABLE IF NOT EXISTS public.malware_reports (
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

CREATE TABLE IF NOT EXISTS public.scout_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dna_hash TEXT NOT NULL,
    suggested_name TEXT,
    suggested_author TEXT,
    suggested_type TEXT,
    suggested_url TEXT,
    submitter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS public.sanctuary_support_categories (
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

CREATE TABLE IF NOT EXISTS public.sanctuary_telemetry_sources (
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

CREATE TABLE IF NOT EXISTS public.sanctuary_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ticket_type TEXT NOT NULL,
    status TEXT DEFAULT 'OPEN',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_mod_id UUID,
    target_blueprint_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 8. WORKBENCH, UNIVERSAL TAXONOMY, STAGING & PUSH OVERRIDES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dlc_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    release_date DATE
);

CREATE TABLE IF NOT EXISTS public.game_versions (
    version VARCHAR PRIMARY KEY,
    release_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS public.taxonomy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    type TEXT,
    sub_type TEXT,
    style TEXT,
    taxonomy_attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.homestead_lab_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mod_id UUID REFERENCES public.mods(id) ON DELETE CASCADE,
    mod_version_id UUID REFERENCES public.mod_versions(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.mod_versions(id) ON DELETE CASCADE,
    session_id TEXT,
    log_text TEXT,
    log_snippet TEXT,
    severity TEXT,
    tester_note TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.known_exception_rules (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    pattern TEXT NOT NULL,
    file_hint TEXT,
    raw_log TEXT,
    severity TEXT NOT NULL DEFAULT 'unstable',
    diagnosis TEXT NOT NULL DEFAULT '',
    resolution TEXT NOT NULL DEFAULT '',
    ignore_in_lab BOOLEAN NOT NULL DEFAULT false,
    pinned BOOLEAN NOT NULL DEFAULT false,
    pinned_order INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.homestead_workbench_templates (
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

CREATE TABLE IF NOT EXISTS public.tracked_template_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name TEXT NOT NULL UNIQUE,
    added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.sanctuary_lexicons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    badge TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    lexicon_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sanctuary_schemas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    schema_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sanctuary_themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    theme_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.citizen_staging_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_token TEXT NOT NULL,
    payload_type TEXT NOT NULL DEFAULT 'mod_queue',
    encrypted_payload TEXT NOT NULL,
    iv TEXT NOT NULL,
    salt TEXT NOT NULL,
    item_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE TABLE IF NOT EXISTS public.pwa_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_id UUID,
    user_hash TEXT,
    handshake_token TEXT,
    staging_token TEXT,
    companion_token TEXT,
    device_label TEXT,
    subscribed_spokes TEXT[] DEFAULT ARRAY['global']::TEXT[],
    prefs JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Standalone-Compatible Directives & Custom Email Dispatch Tables
CREATE TABLE IF NOT EXISTS public.system_directives (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    category TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    structured_payload JSONB DEFAULT '{}'::jsonb,
    version TEXT DEFAULT 'v0.6.0-Dev.13',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by TEXT DEFAULT 'Keepers Core',
    published_content TEXT,
    published_title TEXT,
    published_summary TEXT,
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.keeper_email_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.sanctuary_tickets(id) ON DELETE SET NULL,
    sender_user_id UUID,
    from_name TEXT NOT NULL DEFAULT 'Sanctuary OS Support',
    from_email TEXT NOT NULL DEFAULT 'support@sanctuaryos.gg',
    reply_to TEXT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    body_html TEXT,
    provider TEXT NOT NULL DEFAULT 'RESEND',
    provider_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'SENT',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8B. IDEMPOTENT COLUMN UPGRADES FOR EXISTING SPOKE & STANDALONE DATABASES
-- ============================================================================
ALTER TABLE IF EXISTS public.mods ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.collections ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.blueprints ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.nexus_assets ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.mason_posts ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.mason_post_comments ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.system_broadcasts ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE IF EXISTS public.sanctuary_tickets ADD COLUMN IF NOT EXISTS target_mod_id UUID;
ALTER TABLE IF EXISTS public.sanctuary_tickets ADD COLUMN IF NOT EXISTS target_blueprint_id UUID;

CREATE INDEX IF NOT EXISTS idx_keeper_email_dispatches_ticket_id ON public.keeper_email_dispatches(ticket_id);
CREATE INDEX IF NOT EXISTS idx_keeper_email_dispatches_created_at ON public.keeper_email_dispatches(created_at DESC);

-- ============================================================================
-- 9. INDEXES (FULL FK COVERAGE, ZERO DUPLICATE UNIQUE INDEXES)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_table_created ON public.audit_logs(target_table, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spoke_audit_logs_actor_id ON public.audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_spoke_masons_profile_id ON public.masons(profile_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mason_followers_mason_id ON public.mason_followers(mason_id);

CREATE INDEX IF NOT EXISTS idx_mods_mason_id ON public.mods(mason_id);
CREATE INDEX IF NOT EXISTS idx_mods_status ON public.mods(status);
CREATE INDEX IF NOT EXISTS idx_mods_compliance_tier ON public.mods(compliance_tier);
CREATE INDEX IF NOT EXISTS idx_spoke_mods_last_updated_by ON public.mods(last_updated_by);
CREATE INDEX IF NOT EXISTS idx_mods_highlander_group_id ON public.mods(highlander_group_id);

CREATE INDEX IF NOT EXISTS idx_spoke_mod_versions_mod_id ON public.mod_versions(mod_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mod_bundles_twin_id ON public.mod_bundles(twin_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mod_dependencies_child_id ON public.mod_dependencies(child_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mod_relationships_child_id ON public.mod_relationships(child_id);
CREATE INDEX IF NOT EXISTS idx_spoke_version_dependencies_child_hash ON public.version_dependencies(child_hash);

CREATE INDEX IF NOT EXISTS idx_spoke_logical_conflicts_mod_a_id ON public.logical_conflicts(mod_a_id);
CREATE INDEX IF NOT EXISTS idx_spoke_logical_conflicts_mod_b_id ON public.logical_conflicts(mod_b_id);
CREATE INDEX IF NOT EXISTS idx_spoke_community_group_members_mod_hash ON public.community_group_members(mod_hash);
CREATE INDEX IF NOT EXISTS idx_spoke_flavor_group_members_mod_hash ON public.flavor_group_members(mod_hash);

CREATE INDEX IF NOT EXISTS idx_spoke_collections_mason_id ON public.collections(mason_id);
CREATE INDEX IF NOT EXISTS idx_spoke_collection_members_mod_id ON public.collection_members(mod_id);

CREATE INDEX IF NOT EXISTS idx_spoke_blueprints_mason_id ON public.blueprints(mason_id);
CREATE INDEX IF NOT EXISTS idx_spoke_blueprint_reports_blueprint_id ON public.blueprint_reports(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_spoke_blueprint_reports_reporter_id ON public.blueprint_reports(reporter_id);

CREATE INDEX IF NOT EXISTS idx_spoke_nexus_assets_author_id ON public.nexus_assets(author_id);
CREATE INDEX IF NOT EXISTS idx_spoke_nexus_reports_asset_id ON public.nexus_reports(asset_id);
CREATE INDEX IF NOT EXISTS idx_spoke_nexus_reports_reporter_id ON public.nexus_reports(reporter_id);

CREATE INDEX IF NOT EXISTS idx_mason_posts_created_at ON public.mason_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spoke_mason_posts_mason_id ON public.mason_posts(mason_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mason_post_comments_post_id ON public.mason_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mason_post_comments_author_id ON public.mason_post_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mason_post_comments_parent_id ON public.mason_post_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mason_post_likes_user_id ON public.mason_post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_spoke_mason_post_views_user_id ON public.mason_post_views(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_spoke_notifications_actor_id ON public.notifications(actor_id);

CREATE INDEX IF NOT EXISTS idx_spoke_content_flags_reporter_id ON public.content_flags(reporter_id);
CREATE INDEX IF NOT EXISTS idx_spoke_content_flags_resolved_by ON public.content_flags(resolved_by);

CREATE INDEX IF NOT EXISTS idx_scout_suggestions_dna_hash ON public.scout_suggestions(dna_hash);
CREATE INDEX IF NOT EXISTS idx_scout_suggestions_status ON public.scout_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_spoke_scout_suggestions_submitter_id ON public.scout_suggestions(submitter_id);

CREATE INDEX IF NOT EXISTS idx_spoke_sanctuary_tickets_author_id ON public.sanctuary_tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_spoke_sanctuary_tickets_assigned_to ON public.sanctuary_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.sanctuary_tickets(status);

CREATE INDEX IF NOT EXISTS idx_spoke_homestead_lab_logs_mod_id ON public.homestead_lab_logs(mod_id);
CREATE INDEX IF NOT EXISTS idx_spoke_homestead_lab_logs_mod_version_id ON public.homestead_lab_logs(mod_version_id);
CREATE INDEX IF NOT EXISTS idx_spoke_homestead_lab_logs_version_id ON public.homestead_lab_logs(version_id);
CREATE INDEX IF NOT EXISTS idx_spoke_tracked_template_files_added_by ON public.tracked_template_files(added_by);

CREATE INDEX IF NOT EXISTS idx_citizen_staging_queue_user_token ON public.citizen_staging_queue(user_token);
CREATE INDEX IF NOT EXISTS idx_citizen_staging_queue_expires_at ON public.citizen_staging_queue(expires_at);

CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_user_id ON public.pwa_push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_companion_token ON public.pwa_push_subscriptions(companion_token);
CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_handshake_token ON public.pwa_push_subscriptions(handshake_token);
CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_staging_token ON public.pwa_push_subscriptions(staging_token);

-- ============================================================================
-- 10. INTERNAL SPOKE ROLE HELPERS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION sanctuary_internal.active_spoke_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT lower(btrim(id))
            FROM public.sanctuary_schemas
            WHERE btrim(COALESCE(id, '')) <> ''
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            LIMIT 1
        ),
        'spoke'
    );
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.spoke_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT lower(COALESCE((
        SELECT p.role
        FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
    ), ''));
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.is_spoke_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
    SELECT sanctuary_internal.spoke_user_role() IN ('wayfinder', 'oversight', 'architect', 'senior_architect', 'admin');
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.is_spoke_oversight_or_wayfinder()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
    SELECT sanctuary_internal.spoke_user_role() IN ('wayfinder', 'oversight', 'admin');
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.is_mod_publicly_syncable(p_mod_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.mods m
        WHERE m.id = p_mod_id
          AND COALESCE(m.compliance_tier, 0) NOT BETWEEN 1 AND 4
    );
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.is_spoke_creator_or_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
    SELECT sanctuary_internal.spoke_user_role() IN ('wayfinder', 'oversight', 'architect', 'senior_architect', 'admin', 'mason');
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.owns_mason(p_mason_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_mason_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.masons m
        WHERE m.id = p_mason_id
          AND m.profile_id = (SELECT auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.owns_verified_mason(p_mason_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_mason_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.masons m
        WHERE m.id = p_mason_id
          AND m.profile_id = (SELECT auth.uid())
          AND COALESCE(m.is_verified, false) = true
    );
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.is_verified_mason_or_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
    SELECT sanctuary_internal.is_spoke_staff() OR EXISTS (
        SELECT 1
        FROM public.masons m
        WHERE m.profile_id = (SELECT auth.uid())
          AND COALESCE(m.is_verified, false) = true
    );
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.active_spoke_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sanctuary_internal.spoke_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION sanctuary_internal.is_spoke_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION sanctuary_internal.is_spoke_oversight_or_wayfinder() FROM PUBLIC;
REVOKE ALL ON FUNCTION sanctuary_internal.is_mod_publicly_syncable(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sanctuary_internal.is_spoke_creator_or_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION sanctuary_internal.owns_mason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sanctuary_internal.owns_verified_mason(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sanctuary_internal.is_verified_mason_or_staff() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION sanctuary_internal.active_spoke_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.spoke_user_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_spoke_staff() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_spoke_oversight_or_wayfinder() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_mod_publicly_syncable(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_spoke_creator_or_staff() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.owns_mason(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.owns_verified_mason(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_verified_mason_or_staff() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sanctuary_internal.is_verified_hub_gateway()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, sanctuary_internal
AS $$
DECLARE
    v_headers_raw TEXT;
    v_headers JSONB;
    v_token TEXT;
    v_rec RECORD;
    v_computed TEXT;
BEGIN
    IF COALESCE(auth.role(), '') = 'service_role'
       OR session_user IN ('postgres', 'supabase_admin') THEN
        RETURN true;
    END IF;

    v_headers_raw := NULLIF(btrim(COALESCE(current_setting('request.headers', true), '')), '');
    IF v_headers_raw IS NULL THEN
        RETURN false;
    END IF;

    v_headers := v_headers_raw::jsonb;
    v_token := lower(btrim(COALESCE(v_headers ->> 'x-sanctuary-spoke-token', '')));
    IF v_token = '' OR v_token !~ '^spk_gw_[0-9a-f]{64}$' THEN
        RETURN false;
    END IF;

    FOR v_rec IN
        SELECT token_salt, token_hash
        FROM sanctuary_internal.spoke_gateway_tokens
        WHERE is_active = true
          AND (expires_at IS NULL OR expires_at > NOW())
    LOOP
        v_computed := encode(
            extensions.hmac(convert_to(v_token, 'UTF8'), convert_to(v_rec.token_salt, 'UTF8'), 'sha256'),
            'hex'
        );
        IF lower(v_computed) = lower(v_rec.token_hash) THEN
            RETURN true;
        END IF;
    END LOOP;

    RETURN false;
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.is_verified_hub_gateway() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_verified_hub_gateway() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sanctuary_internal.current_staging_owner_tag()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, sanctuary_internal
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_key TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;
    v_key := COALESCE(
        NULLIF(sanctuary_internal.read_runtime_secret('staging_owner_hmac_key'), ''),
        'sanctuary_staging_owner_v1'
    );
    RETURN encode(
        extensions.hmac(convert_to(v_uid::text, 'UTF8'), convert_to(v_key, 'UTF8'), 'sha256'),
        'hex'
    );
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.current_staging_owner_tag() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sanctuary_internal.current_staging_owner_tag() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sanctuary_internal.stamp_staging_owner_tag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF NOT sanctuary_internal.is_verified_hub_gateway() AND (SELECT auth.uid()) IS NOT NULL THEN
        NEW.owner_tag := sanctuary_internal.current_staging_owner_tag();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.guard_mason_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF sanctuary_internal.is_verified_hub_gateway()
       OR sanctuary_internal.is_spoke_staff() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF COALESCE(NEW.is_verified, false) = true THEN
            RAISE EXCEPTION 'Forbidden: Only Spoke Staff can grant Verified Creator status';
        END IF;
        NEW.is_verified := false;
        NEW.followers_count := 0;
        IF NEW.profile_id IS NOT NULL AND NEW.profile_id IS DISTINCT FROM (SELECT auth.uid()) THEN
            RAISE EXCEPTION 'Forbidden: Creator profile_id must match authenticated caller';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF COALESCE(NEW.is_verified, false) = true AND COALESCE(OLD.is_verified, false) = false THEN
            RAISE EXCEPTION 'Forbidden: Only Spoke Staff can grant Verified Creator status';
        END IF;
        NEW.is_verified := COALESCE(OLD.is_verified, false);
        NEW.followers_count := COALESCE(OLD.followers_count, 0);
        IF OLD.profile_id IS NOT NULL AND NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
            RAISE EXCEPTION 'Forbidden: Only Spoke Staff can reassign Creator profile_id';
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mason_privileged_columns ON public.masons;
CREATE TRIGGER trg_guard_mason_privileged_columns
    BEFORE INSERT OR UPDATE ON public.masons
    FOR EACH ROW
    EXECUTE FUNCTION sanctuary_internal.guard_mason_privileged_columns();

CREATE OR REPLACE FUNCTION sanctuary_internal.cleanup_expired_staging_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.citizen_staging_queue WHERE expires_at < NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.relink_spoke_profile_uuid(
    p_legacy_uuid UUID,
    p_new_uid UUID,
    p_claim_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, sanctuary_internal
AS $$
DECLARE
    v_legacy_profile public.profiles%ROWTYPE;
    v_new_profile public.profiles%ROWTYPE;
    v_commitment_hash TEXT;
    v_expected_hash TEXT;
    v_final_username TEXT;
    v_final_role TEXT;
BEGIN
    IF p_legacy_uuid IS NULL OR p_new_uid IS NULL THEN
        RAISE EXCEPTION 'Missing legacy System ID or target account ID.';
    END IF;
    IF p_legacy_uuid = p_new_uid THEN
        RAISE EXCEPTION 'Target account already owns this System ID.';
    END IF;
    IF btrim(COALESCE(p_claim_secret, '')) = '' OR length(btrim(p_claim_secret)) < 32 THEN
        RAISE EXCEPTION 'Invalid cryptographic relink secret.';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_legacy_uuid) THEN
        RAISE EXCEPTION 'Legacy Spoke profile is already bound to an active authentication account.';
    END IF;

    SELECT * INTO v_legacy_profile
    FROM public.profiles
    WHERE id = p_legacy_uuid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Legacy Spoke profile was not found on this workspace.';
    END IF;

    SELECT commitment_hash INTO v_commitment_hash
    FROM sanctuary_internal.spoke_relink_commitments
    WHERE profile_id = p_legacy_uuid
    FOR UPDATE;

    IF NOT FOUND OR btrim(COALESCE(v_commitment_hash, '')) = '' THEN
        RAISE EXCEPTION 'No cryptographic relink commitment is registered for this legacy Spoke profile.';
    END IF;

    v_expected_hash := encode(
        pg_catalog.sha256(
            convert_to(
                'sanctuary_spoke_relink_v1:' || lower(p_legacy_uuid::text) || ':' || btrim(p_claim_secret),
                'UTF8'
            )
        ),
        'hex'
    );

    IF lower(btrim(v_commitment_hash)) <> v_expected_hash THEN
        RAISE EXCEPTION 'Cryptographic relink verification failed for this System ID.';
    END IF;

    SELECT * INTO v_new_profile
    FROM public.profiles
    WHERE id = p_new_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active Spoke profile record not found.';
    END IF;

    PERFORM set_config('sanctuary.allow_profile_relink', 'true', true);

    UPDATE public.masons SET profile_id = p_new_uid WHERE profile_id = p_legacy_uuid;

    INSERT INTO public.mason_followers (user_id, mason_id, created_at)
    SELECT p_new_uid, mason_id, created_at
    FROM public.mason_followers
    WHERE user_id = p_legacy_uuid
    ON CONFLICT (user_id, mason_id) DO NOTHING;
    DELETE FROM public.mason_followers WHERE user_id = p_legacy_uuid;

    UPDATE public.mods SET last_updated_by = p_new_uid WHERE last_updated_by = p_legacy_uuid;
    UPDATE public.blueprints SET mason_id = p_new_uid WHERE mason_id = p_legacy_uuid;
    UPDATE public.blueprint_reports SET reporter_id = p_new_uid WHERE reporter_id = p_legacy_uuid;
    UPDATE public.nexus_assets SET author_id = p_new_uid WHERE author_id = p_legacy_uuid;
    UPDATE public.nexus_reports SET reporter_id = p_new_uid WHERE reporter_id = p_legacy_uuid;
    UPDATE public.mason_post_comments SET author_id = p_new_uid WHERE author_id = p_legacy_uuid;

    INSERT INTO public.mason_post_likes (post_id, user_id, created_at)
    SELECT post_id, p_new_uid, created_at
    FROM public.mason_post_likes
    WHERE user_id = p_legacy_uuid
    ON CONFLICT (post_id, user_id) DO NOTHING;
    DELETE FROM public.mason_post_likes WHERE user_id = p_legacy_uuid;

    INSERT INTO public.mason_post_views (post_id, user_id, created_at)
    SELECT post_id, p_new_uid, created_at
    FROM public.mason_post_views
    WHERE user_id = p_legacy_uuid
    ON CONFLICT (post_id, user_id) DO NOTHING;
    DELETE FROM public.mason_post_views WHERE user_id = p_legacy_uuid;

    INSERT INTO public.dispatch_poll_votes (broadcast_id, poll_id, option_id, user_id, created_at)
    SELECT broadcast_id, poll_id, option_id, p_new_uid, created_at
    FROM public.dispatch_poll_votes
    WHERE user_id = p_legacy_uuid
    ON CONFLICT (broadcast_id, poll_id, option_id, user_id) DO NOTHING;
    DELETE FROM public.dispatch_poll_votes WHERE user_id = p_legacy_uuid;

    UPDATE public.notifications SET user_id = p_new_uid WHERE user_id = p_legacy_uuid;
    UPDATE public.notifications SET actor_id = p_new_uid WHERE actor_id = p_legacy_uuid;
    UPDATE public.audit_logs SET actor_id = p_new_uid WHERE actor_id = p_legacy_uuid;
    UPDATE public.content_flags SET reporter_id = p_new_uid WHERE reporter_id = p_legacy_uuid;
    UPDATE public.content_flags SET resolved_by = p_new_uid WHERE resolved_by = p_legacy_uuid;
    UPDATE public.scout_suggestions SET submitter_id = p_new_uid WHERE submitter_id = p_legacy_uuid;
    UPDATE public.sanctuary_tickets SET author_id = p_new_uid WHERE author_id = p_legacy_uuid;
    UPDATE public.sanctuary_tickets SET assigned_to = p_new_uid WHERE assigned_to = p_legacy_uuid;
    UPDATE public.heuristic_signatures SET created_by = p_new_uid::text WHERE created_by = p_legacy_uuid::text;
    UPDATE public.tracked_template_files SET added_by = p_new_uid WHERE added_by = p_legacy_uuid;
    UPDATE public.pwa_push_subscriptions SET user_id = p_new_uid WHERE user_id = p_legacy_uuid;

    DELETE FROM sanctuary_internal.spoke_relink_commitments WHERE profile_id = p_legacy_uuid;
    DELETE FROM public.profiles WHERE id = p_legacy_uuid;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE lower(username) = lower(v_legacy_profile.username)
          AND id <> p_new_uid
    ) THEN
        v_final_username := v_legacy_profile.username;
    ELSE
        v_final_username := v_new_profile.username;
    END IF;

    IF v_new_profile.role IN ('wayfinder', 'admin') THEN
        v_final_role := v_new_profile.role;
    ELSE
        v_final_role := COALESCE(NULLIF(v_legacy_profile.role, ''), v_new_profile.role);
    END IF;

    UPDATE public.profiles
    SET username = v_final_username,
        role = v_final_role,
        is_banned = COALESCE(v_new_profile.is_banned, false) OR COALESCE(v_legacy_profile.is_banned, false),
        blacklist_reason = COALESCE(v_new_profile.blacklist_reason, v_legacy_profile.blacklist_reason),
        is_comm_banned = COALESCE(v_new_profile.is_comm_banned, false) OR COALESCE(v_legacy_profile.is_comm_banned, false),
        comm_blacklist_reason = COALESCE(v_new_profile.comm_blacklist_reason, v_legacy_profile.comm_blacklist_reason)
    WHERE id = p_new_uid;

    INSERT INTO public.audit_logs (action, target_table, target_name, actor_id, reason)
    VALUES (
        'Cryptographic Spoke Profile Relink',
        'profiles',
        v_final_username,
        p_new_uid,
        'Verified SHA-256 relink commitment for legacy System ID ' || p_legacy_uuid::text
    );

    PERFORM set_config('sanctuary.allow_profile_relink', 'false', true);

    RETURN jsonb_build_object(
        'ok', true,
        'id', p_new_uid,
        'legacy_id', p_legacy_uuid,
        'username', v_final_username,
        'role', v_final_role
    );
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.relink_spoke_profile_uuid(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Standalone Fork Auth Trigger:
-- Promotes the very first local `auth.users` registrant to Founding `wayfinder`;
-- subsequent registrants receive `citizen` unless they supply a valid cryptographic `relink_token`
-- (`SRK1.<legacy_uuid>.<claim_secret>`), never trusting bare usernames.
CREATE OR REPLACE FUNCTION sanctuary_internal.handle_new_spoke_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_username TEXT := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''), 'Citizen_' || left(NEW.id::text, 6));
    v_role TEXT := 'citizen';
    v_relink_token TEXT := btrim(COALESCE(NEW.raw_user_meta_data->>'relink_token', ''));
    v_clean_token TEXT;
    v_legacy_uuid_text TEXT;
    v_claim_secret TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.id
        WHERE p.role = 'wayfinder'
    ) THEN
        v_role := 'wayfinder';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_username) AND id <> NEW.id) THEN
        v_username := v_username || '_' || left(NEW.id::text, 4);
    END IF;

    INSERT INTO public.profiles (id, username, role, is_banned, is_comm_banned, created_at)
    VALUES (NEW.id, v_username, v_role, false, false, NOW())
    ON CONFLICT (id) DO NOTHING;

    IF v_relink_token <> '' THEN
        v_clean_token := regexp_replace(v_relink_token, '^SRK1\.', '', 'i');
        v_legacy_uuid_text := split_part(v_clean_token, '.', 1);
        v_claim_secret := substring(v_clean_token FROM length(v_legacy_uuid_text) + 2);
        IF v_legacy_uuid_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           AND length(btrim(COALESCE(v_claim_secret, ''))) >= 32 THEN
            PERFORM sanctuary_internal.relink_spoke_profile_uuid(
                v_legacy_uuid_text::uuid,
                NEW.id,
                v_claim_secret
            );
        ELSE
            RAISE EXCEPTION 'Malformed Spoke Relink Token. Expected SRK1.<uuid>.<secret>';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.protect_spoke_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_caller_role TEXT;
    v_uid UUID := (SELECT auth.uid());
BEGIN
    IF sanctuary_internal.is_verified_hub_gateway()
       OR COALESCE(current_setting('sanctuary.allow_profile_relink', true), '') = 'true' THEN
        RETURN NEW;
    END IF;

    v_caller_role := sanctuary_internal.spoke_user_role();

    IF v_caller_role IN ('wayfinder', 'admin') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.id IS DISTINCT FROM v_uid OR EXISTS (SELECT 1 FROM public.profiles WHERE role = 'wayfinder') THEN
            NEW.role := 'citizen';
        END IF;
        NEW.is_banned := false;
        NEW.blacklist_reason := NULL;
        NEW.is_comm_banned := false;
        NEW.comm_blacklist_reason := NULL;
        RETURN NEW;
    END IF;

    IF v_caller_role = 'oversight' THEN
        IF OLD.role IN ('wayfinder', 'admin', 'oversight') OR NEW.role IN ('wayfinder', 'admin', 'oversight') THEN
            NEW.role := OLD.role;
            NEW.is_banned := OLD.is_banned;
            NEW.blacklist_reason := OLD.blacklist_reason;
            NEW.is_comm_banned := OLD.is_comm_banned;
            NEW.comm_blacklist_reason := OLD.comm_blacklist_reason;
        END IF;
        RETURN NEW;
    END IF;

    IF v_caller_role IN ('architect', 'senior_architect') THEN
        IF OLD.role = 'citizen' AND NEW.role = 'mason' THEN
            NEW.is_banned := OLD.is_banned;
            NEW.blacklist_reason := OLD.blacklist_reason;
            NEW.is_comm_banned := OLD.is_comm_banned;
            NEW.comm_blacklist_reason := OLD.comm_blacklist_reason;
            RETURN NEW;
        END IF;
    END IF;

    NEW.role := OLD.role;
    NEW.is_comm_banned := OLD.is_comm_banned;
    NEW.comm_blacklist_reason := OLD.comm_blacklist_reason;

    IF OLD.id = v_uid AND OLD.is_banned IS DISTINCT FROM true AND NEW.is_banned = true THEN
        RETURN NEW;
    END IF;

    NEW.is_banned := OLD.is_banned;
    NEW.blacklist_reason := OLD.blacklist_reason;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_staging()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_endpoint TEXT;
    v_secret TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
        RETURN NEW;
    END IF;

    v_endpoint := sanctuary_internal.read_runtime_secret('pwa_push_endpoint');
    v_secret := sanctuary_internal.read_runtime_secret('pwa_push_secret');
    IF COALESCE(v_endpoint, '') = '' THEN
        RETURN NEW;
    END IF;

    IF NEW.payload_type = 'passkey_handshake' THEN
        EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
        USING
            v_endpoint,
            jsonb_build_object('Content-Type', 'application/json', 'x-internal-push-secret', COALESCE(v_secret, '')),
            jsonb_build_object('type', 'passkey_handshake', 'handshake_token', NEW.user_token, 'row_id', NEW.id);
    ELSIF NEW.payload_type = 'blueprint_staging' THEN
        EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
        USING
            v_endpoint,
            jsonb_build_object('Content-Type', 'application/json', 'x-internal-push-secret', COALESCE(v_secret, '')),
            jsonb_build_object('type', 'blueprint_staging', 'staging_token', NEW.user_token, 'item_count', NEW.item_count, 'row_id', NEW.id);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_endpoint TEXT;
    v_secret TEXT;
    v_spoke_id TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') OR NEW.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_endpoint := sanctuary_internal.read_runtime_secret('pwa_push_endpoint');
    v_secret := sanctuary_internal.read_runtime_secret('pwa_push_secret');
    IF COALESCE(v_endpoint, '') = '' THEN
        RETURN NEW;
    END IF;

    v_spoke_id := sanctuary_internal.active_spoke_id();

    EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
    USING
        v_endpoint,
        jsonb_build_object('Content-Type', 'application/json', 'x-internal-push-secret', COALESCE(v_secret, '')),
        jsonb_build_object(
            'type', 'user_notification',
            'user_id', NEW.user_id,
            'notif_type', COALESCE(NEW.type, 'system_dispatch'),
            'title', 'Sanctuary OS',
            'body', COALESCE(NEW.message, ''),
            'spoke_id', v_spoke_id,
            'unique_id', 'notif_' || NEW.id::text
        );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_spoke_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_endpoint TEXT;
    v_secret TEXT;
    v_spoke_id TEXT;
BEGIN
    IF NEW.is_active IS DISTINCT FROM false
       AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
        v_endpoint := sanctuary_internal.read_runtime_secret('pwa_push_endpoint');
        v_secret := sanctuary_internal.read_runtime_secret('pwa_push_secret');
        IF COALESCE(v_endpoint, '') <> '' THEN
            v_spoke_id := sanctuary_internal.active_spoke_id();
            EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
            USING
                v_endpoint,
                jsonb_build_object('Content-Type', 'application/json', 'x-internal-push-secret', COALESCE(v_secret, '')),
                jsonb_build_object(
                    'type', 'broadcast',
                    'spoke_id', v_spoke_id,
                    'broadcast_type', COALESCE(NEW.category, 'system_dispatch'),
                    'title', COALESCE(NEW.title, 'Sanctuary OS Dispatch'),
                    'body', COALESCE(NEW.message, ''),
                    'unique_id', 'spoke_bc_' || NEW.id::text
                );
        END IF;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.cleanup_expired_staging_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.handle_new_spoke_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.protect_spoke_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.trigger_pwa_web_push_on_staging() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.trigger_pwa_web_push_on_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.trigger_pwa_web_push_on_spoke_broadcast() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_spoke ON auth.users;
CREATE TRIGGER on_auth_user_created_spoke
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.handle_new_spoke_user();

DROP TRIGGER IF EXISTS ensure_spoke_profile_integrity ON public.profiles;
CREATE TRIGGER ensure_spoke_profile_integrity
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.protect_spoke_profile_fields();

DROP TRIGGER IF EXISTS trg_cleanup_expired_staging_queue ON public.citizen_staging_queue;
CREATE TRIGGER trg_cleanup_expired_staging_queue
    AFTER INSERT ON public.citizen_staging_queue
    FOR EACH STATEMENT EXECUTE FUNCTION sanctuary_internal.cleanup_expired_staging_queue();

DROP TRIGGER IF EXISTS trg_pwa_web_push_staging ON public.citizen_staging_queue;
CREATE TRIGGER trg_pwa_web_push_staging
    AFTER INSERT ON public.citizen_staging_queue
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_staging();

DROP TRIGGER IF EXISTS trg_pwa_web_push_notification ON public.notifications;
CREATE TRIGGER trg_pwa_web_push_notification
    AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_notification();

DROP TRIGGER IF EXISTS trg_pwa_web_push_spoke_broadcast ON public.system_broadcasts;
CREATE TRIGGER trg_pwa_web_push_spoke_broadcast
    AFTER INSERT ON public.system_broadcasts
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_spoke_broadcast();

-- ============================================================================
-- 11. OPERATIONAL TRIGGERS & PUBLIC RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_mods_modtime ON public.mods;
CREATE TRIGGER update_mods_modtime
    BEFORE UPDATE ON public.mods
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE OR REPLACE FUNCTION public.sync_homestead_lab_logs_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.version_id IS NULL AND NEW.mod_version_id IS NOT NULL THEN
        NEW.version_id := NEW.mod_version_id;
    ELSIF NEW.mod_version_id IS NULL AND NEW.version_id IS NOT NULL THEN
        NEW.mod_version_id := NEW.version_id;
    END IF;
    IF NEW.log_snippet IS NULL AND NEW.log_text IS NOT NULL THEN
        NEW.log_snippet := NEW.log_text;
    ELSIF NEW.log_text IS NULL AND NEW.log_snippet IS NOT NULL THEN
        NEW.log_text := NEW.log_snippet;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_homestead_lab_logs_columns ON public.homestead_lab_logs;
CREATE TRIGGER trg_sync_homestead_lab_logs_columns
    BEFORE INSERT OR UPDATE ON public.homestead_lab_logs
    FOR EACH ROW EXECUTE FUNCTION public.sync_homestead_lab_logs_columns();

CREATE OR REPLACE FUNCTION public.prevent_audit_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND COALESCE(current_setting('sanctuary.allow_audit_prune', true), '') = 'true' THEN
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE'
       AND COALESCE(current_setting('sanctuary.allow_profile_relink', true), '') = 'true'
       AND NEW.action IS NOT DISTINCT FROM OLD.action
       AND NEW.target_table IS NOT DISTINCT FROM OLD.target_table
       AND NEW.target_name IS NOT DISTINCT FROM OLD.target_name
       AND NEW.game_name IS NOT DISTINCT FROM OLD.game_name
       AND NEW.changes IS NOT DISTINCT FROM OLD.changes
       AND NEW.reason IS NOT DISTINCT FROM OLD.reason
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Audit logs are append-only. Modification or deletion is strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS ensure_audit_log_immutability ON public.audit_logs;
CREATE TRIGGER ensure_audit_log_immutability
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modifications();

CREATE OR REPLACE FUNCTION public.prune_old_audit_logs(p_retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_deleted INTEGER := 0;
    v_uid UUID := (SELECT auth.uid());
BEGIN
    IF p_retention_days < 30 THEN
        RAISE EXCEPTION 'Retention window must be at least 30 days.';
    END IF;

    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin')
       AND sanctuary_internal.spoke_user_role() NOT IN ('wayfinder', 'admin')
    THEN
        RAISE EXCEPTION 'Unauthorized: Only Wayfinders may prune archived Spoke audit logs.';
    END IF;

    PERFORM set_config('sanctuary.allow_audit_prune', 'true', true);

    DELETE FROM public.audit_logs
    WHERE created_at < (NOW() - make_interval(days => p_retention_days));

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO public.audit_logs (action, target_table, target_name, actor_id, reason)
    VALUES (
        'Pruned Archived Audit Logs',
        'audit_logs',
        p_retention_days || 'd Retention Policy',
        v_uid,
        'Executed rolling retention prune (' || v_deleted || ' entries older than ' || p_retention_days || ' days removed)'
    );

    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_old_audit_logs(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_old_audit_logs(INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_flagged_hash_from_blueprints()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_confirmed BOOLEAN;
    v_old_confirmed BOOLEAN := false;
BEGIN
    v_new_confirmed := (
        NEW.compliance_tier = 5
        OR (
            NEW.compliance_tier BETWEEN 1 AND 4
            AND LOWER(COALESCE(NEW.status, '')) NOT IN ('pending', 'under_review', 'unverified')
        )
    );

    IF TG_OP = 'UPDATE' THEN
        v_old_confirmed := (
            OLD.compliance_tier = 5
            OR (
                OLD.compliance_tier BETWEEN 1 AND 4
                AND LOWER(COALESCE(OLD.status, '')) NOT IN ('pending', 'under_review', 'unverified')
            )
        );
    END IF;

    IF v_new_confirmed AND (TG_OP = 'INSERT' OR NOT v_old_confirmed OR OLD.compliance_tier IS DISTINCT FROM NEW.compliance_tier) THEN
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
$$;

DROP TRIGGER IF EXISTS trg_purge_flagged_hash_from_blueprints ON public.mods;
CREATE TRIGGER trg_purge_flagged_hash_from_blueprints
    AFTER INSERT OR UPDATE OF compliance_tier, status ON public.mods
    FOR EACH ROW EXECUTE FUNCTION public.purge_flagged_hash_from_blueprints();

-- Recompute has_pending_flag immediately when community reports or flags change
CREATE OR REPLACE FUNCTION public.sync_nexus_asset_pending_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND OLD.asset_id IS DISTINCT FROM NEW.asset_id) THEN
        target_id := OLD.asset_id;
        IF target_id IS NOT NULL THEN
            UPDATE public.nexus_assets
            SET has_pending_flag = (
                EXISTS (
                    SELECT 1 FROM public.nexus_reports
                    WHERE asset_id = target_id
                      AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
                )
                OR EXISTS (
                    SELECT 1 FROM public.content_flags
                    WHERE LOWER(COALESCE(content_type, '')) IN ('nexus_asset', 'nexus_assets')
                      AND content_id = target_id
                      AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
                )
            )
            WHERE id = target_id;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.asset_id IS NOT NULL THEN
        target_id := NEW.asset_id;
        UPDATE public.nexus_assets
        SET has_pending_flag = (
            EXISTS (
                SELECT 1 FROM public.nexus_reports
                WHERE asset_id = target_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
            OR EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('nexus_asset', 'nexus_assets')
                  AND content_id = target_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
        )
        WHERE id = target_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_nexus_asset_pending_flag ON public.nexus_reports;
CREATE TRIGGER trg_sync_nexus_asset_pending_flag
    AFTER INSERT OR UPDATE OR DELETE ON public.nexus_reports
    FOR EACH ROW EXECUTE FUNCTION public.sync_nexus_asset_pending_flag();

CREATE OR REPLACE FUNCTION public.sync_blueprint_pending_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_id BIGINT;
BEGIN
    IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND OLD.blueprint_id IS DISTINCT FROM NEW.blueprint_id) THEN
        target_id := OLD.blueprint_id;
        IF target_id IS NOT NULL THEN
            UPDATE public.blueprints
            SET has_pending_flag = EXISTS (
                SELECT 1 FROM public.blueprint_reports
                WHERE blueprint_id = target_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
            WHERE id = target_id;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.blueprint_id IS NOT NULL THEN
        target_id := NEW.blueprint_id;
        UPDATE public.blueprints
        SET has_pending_flag = EXISTS (
            SELECT 1 FROM public.blueprint_reports
            WHERE blueprint_id = target_id
              AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
        )
        WHERE id = target_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_blueprint_pending_flag ON public.blueprint_reports;
CREATE TRIGGER trg_sync_blueprint_pending_flag
    AFTER INSERT OR UPDATE OR DELETE ON public.blueprint_reports
    FOR EACH ROW EXECUTE FUNCTION public.sync_blueprint_pending_flag();

CREATE OR REPLACE FUNCTION public.sync_content_flag_pending_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    norm_type TEXT;
    is_flagged BOOLEAN;
BEGIN
    IF (TG_OP = 'DELETE') OR (
        TG_OP = 'UPDATE' AND (
            LOWER(COALESCE(OLD.content_type, '')) IS DISTINCT FROM LOWER(COALESCE(NEW.content_type, ''))
            OR OLD.content_id IS DISTINCT FROM NEW.content_id
        )
    ) THEN
        norm_type := LOWER(COALESCE(OLD.content_type, ''));
        IF norm_type IN ('post', 'mason_post') THEN
            UPDATE public.mason_posts
            SET has_pending_flag = EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('post', 'mason_post')
                  AND content_id = OLD.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
            WHERE id = OLD.content_id;
        ELSIF norm_type IN ('comment', 'mason_post_comment') THEN
            UPDATE public.mason_post_comments
            SET has_pending_flag = EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('comment', 'mason_post_comment')
                  AND content_id = OLD.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
            WHERE id = OLD.content_id;
        ELSIF norm_type IN ('broadcast', 'system_broadcast') THEN
            UPDATE public.system_broadcasts
            SET has_pending_flag = EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('broadcast', 'system_broadcast')
                  AND content_id = OLD.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
            WHERE id = OLD.content_id;
        ELSIF norm_type IN ('mod', 'mods') THEN
            UPDATE public.mods
            SET has_pending_flag = EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('mod', 'mods')
                  AND content_id = OLD.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
            WHERE id = OLD.content_id;
        ELSIF norm_type IN ('collection', 'collections') THEN
            UPDATE public.collections
            SET has_pending_flag = EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('collection', 'collections')
                  AND content_id = OLD.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            )
            WHERE id = OLD.content_id;
        ELSIF norm_type IN ('nexus_asset', 'nexus_assets') THEN
            UPDATE public.nexus_assets
            SET has_pending_flag = (
                EXISTS (
                    SELECT 1 FROM public.content_flags
                    WHERE LOWER(COALESCE(content_type, '')) IN ('nexus_asset', 'nexus_assets')
                      AND content_id = OLD.content_id
                      AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
                )
                OR EXISTS (
                    SELECT 1 FROM public.nexus_reports
                    WHERE asset_id = OLD.content_id
                      AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
                )
            )
            WHERE id = OLD.content_id;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.content_id IS NOT NULL THEN
        norm_type := LOWER(COALESCE(NEW.content_type, ''));
        IF norm_type IN ('post', 'mason_post') THEN
            is_flagged := EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('post', 'mason_post')
                  AND content_id = NEW.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            );
            UPDATE public.mason_posts SET has_pending_flag = is_flagged WHERE id = NEW.content_id;
        ELSIF norm_type IN ('comment', 'mason_post_comment') THEN
            is_flagged := EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('comment', 'mason_post_comment')
                  AND content_id = NEW.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            );
            UPDATE public.mason_post_comments SET has_pending_flag = is_flagged WHERE id = NEW.content_id;
        ELSIF norm_type IN ('broadcast', 'system_broadcast') THEN
            is_flagged := EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('broadcast', 'system_broadcast')
                  AND content_id = NEW.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            );
            UPDATE public.system_broadcasts SET has_pending_flag = is_flagged WHERE id = NEW.content_id;
        ELSIF norm_type IN ('mod', 'mods') THEN
            is_flagged := EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('mod', 'mods')
                  AND content_id = NEW.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            );
            UPDATE public.mods SET has_pending_flag = is_flagged WHERE id = NEW.content_id;
        ELSIF norm_type IN ('collection', 'collections') THEN
            is_flagged := EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('collection', 'collections')
                  AND content_id = NEW.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            );
            UPDATE public.collections SET has_pending_flag = is_flagged WHERE id = NEW.content_id;
        ELSIF norm_type IN ('nexus_asset', 'nexus_assets') THEN
            is_flagged := EXISTS (
                SELECT 1 FROM public.content_flags
                WHERE LOWER(COALESCE(content_type, '')) IN ('nexus_asset', 'nexus_assets')
                  AND content_id = NEW.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            ) OR EXISTS (
                SELECT 1 FROM public.nexus_reports
                WHERE asset_id = NEW.content_id
                  AND LOWER(COALESCE(status, 'pending')) IN ('open', 'pending', 'investigating')
            );
            UPDATE public.nexus_assets SET has_pending_flag = is_flagged WHERE id = NEW.content_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_content_flag_pending_flag ON public.content_flags;
CREATE TRIGGER trg_sync_content_flag_pending_flag
    AFTER INSERT OR UPDATE OR DELETE ON public.content_flags
    FOR EACH ROW EXECUTE FUNCTION public.sync_content_flag_pending_flag();

CREATE OR REPLACE FUNCTION public.get_blueprints_premium_status(b_ids BIGINT[])
RETURNS TABLE(id BIGINT, is_paid BOOLEAN, is_early_access BOOLEAN)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT b.id,
           COALESCE(bool_or(m.is_paid), false) AS is_paid,
           COALESCE(bool_or(m.is_early_access), false) AS is_early_access
    FROM public.blueprints b
    CROSS JOIN LATERAL jsonb_array_elements(b.artifacts) AS arr(elem)
    LEFT JOIN public.mod_versions mv ON mv.dna_hash = (elem->>'hash')
    LEFT JOIN public.mods m ON m.id = mv.mod_id
    WHERE b.id = ANY(b_ids)
    GROUP BY b.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_flavor_group_members_by_hashes(p_hashes TEXT[])
RETURNS SETOF public.flavor_group_members
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT * FROM public.flavor_group_members WHERE mod_hash = ANY(p_hashes);
$$;

CREATE OR REPLACE FUNCTION public.get_flavor_groups_by_ids(p_ids UUID[])
RETURNS SETOF public.flavor_groups
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT * FROM public.flavor_groups WHERE id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION public.get_mod_dependencies_by_ids(p_ids UUID[])
RETURNS SETOF public.mod_dependencies
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT * FROM public.mod_dependencies WHERE child_id = ANY(p_ids) OR parent_id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION public.get_mod_relationships_by_ids(p_ids UUID[])
RETURNS SETOF public.mod_relationships
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT * FROM public.mod_relationships WHERE child_id = ANY(p_ids) OR parent_id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION public.get_mod_versions_by_hashes(p_hashes TEXT[])
RETURNS SETOF public.mod_versions
LANGUAGE sql
STABLE
SET search_path = public, sanctuary_internal
AS $$
    SELECT mv.*
    FROM public.mod_versions mv
    WHERE mv.dna_hash = ANY(p_hashes)
      AND (
          sanctuary_internal.is_mod_publicly_syncable(mv.mod_id)
          OR sanctuary_internal.is_spoke_oversight_or_wayfinder()
      );
$$;

CREATE OR REPLACE FUNCTION public.get_mods_by_ids(p_ids UUID[])
RETURNS SETOF public.mods
LANGUAGE sql
STABLE
SET search_path = public, sanctuary_internal
AS $$
    SELECT m.*
    FROM public.mods m
    WHERE m.id = ANY(p_ids)
      AND (
          COALESCE(m.compliance_tier, 0) NOT BETWEEN 1 AND 4
          OR sanctuary_internal.is_spoke_oversight_or_wayfinder()
      );
$$;

CREATE OR REPLACE FUNCTION public.get_compliance_restricted_hashes(p_hashes TEXT[])
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(array_agg(DISTINCT mv.dna_hash), ARRAY[]::TEXT[])
    FROM public.mod_versions mv
    INNER JOIN public.mods m ON m.id = mv.mod_id
    WHERE mv.dna_hash = ANY(p_hashes)
      AND COALESCE(m.compliance_tier, 0) BETWEEN 1 AND 4;
$$;

REVOKE ALL ON FUNCTION public.get_compliance_restricted_hashes(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_compliance_restricted_hashes(TEXT[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_compliance_hash_tiers(p_hashes TEXT[])
RETURNS TABLE(dna_hash TEXT, compliance_tier SMALLINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT LOWER(mv.dna_hash) AS dna_hash,
           MAX(COALESCE(m.compliance_tier, 0))::SMALLINT AS compliance_tier
    FROM public.mod_versions mv
    INNER JOIN public.mods m ON m.id = mv.mod_id
    WHERE LOWER(mv.dna_hash) = ANY(SELECT LOWER(unnest(COALESCE(p_hashes, ARRAY[]::TEXT[]))))
      AND COALESCE(m.compliance_tier, 0) BETWEEN 1 AND 5
      AND LOWER(COALESCE(m.status, '')) NOT IN ('rejected', 'pending', 'under_review', 'unverified')
    GROUP BY LOWER(mv.dna_hash);
$$;

REVOKE ALL ON FUNCTION public.get_compliance_hash_tiers(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_compliance_hash_tiers(TEXT[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.flag_mod_for_compliance(
    p_mod_id UUID DEFAULT NULL,
    p_dna_hash TEXT DEFAULT NULL,
    p_mod_name TEXT DEFAULT NULL,
    p_tier INTEGER DEFAULT 1,
    p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_is_gateway BOOLEAN := sanctuary_internal.is_verified_hub_gateway();
    v_role TEXT := sanctuary_internal.spoke_user_role();
    v_is_oversight BOOLEAN := v_is_gateway OR (v_role IN ('wayfinder', 'oversight', 'admin'));
    v_tier INTEGER := LEAST(4, GREATEST(1, COALESCE(p_tier, 1)));
    v_reason TEXT := COALESCE(NULLIF(btrim(p_reason), ''), 'Flagged Tier ' || v_tier || ' for Compliance Review');
    v_tagged_reason TEXT := '[' || CASE WHEN v_role <> '' THEN upper(v_role) WHEN v_is_gateway THEN 'WAYFINDER' ELSE 'CITIZEN' END || ' FLAG - TIER ' || v_tier || '] ' || left(v_reason, 1000);
    v_hash TEXT := lower(btrim(COALESCE(p_dna_hash, '')));
    v_mod_id UUID := p_mod_id;
    v_existing public.mods%ROWTYPE;
    v_is_pending BOOLEAN;
    v_is_confirmed BOOLEAN;
    v_next_tier INTEGER;
    v_next_status TEXT;
    v_slug TEXT;
BEGIN
    IF v_uid IS NULL AND NOT v_is_gateway THEN
        RAISE EXCEPTION 'Authentication required to flag artifacts';
    END IF;

    IF v_mod_id IS NULL AND v_hash ~ '^[0-9a-f]{64}$' THEN
        SELECT mv.mod_id INTO v_mod_id
        FROM public.mod_versions mv
        WHERE lower(mv.dna_hash) = v_hash
        LIMIT 1;
    END IF;

    IF v_mod_id IS NULL THEN
        IF v_hash !~ '^[0-9a-f]{64}$' THEN
            RAISE EXCEPTION 'Missing mod_id or valid 64-character SHA-256 dna_hash';
        END IF;

        v_mod_id := gen_random_uuid();
        v_slug := lower(regexp_replace(COALESCE(NULLIF(btrim(p_mod_name), ''), 'flagged-artifact'), '[^a-zA-Z0-9]+', '-', 'g'));
        v_slug := trim(both '-' from v_slug);
        IF v_slug = '' THEN
            v_slug := 'flagged-artifact';
        END IF;
        v_slug := v_slug || '-' || left(v_hash, 8);

        v_next_status := CASE WHEN v_is_oversight THEN 'verified' ELSE 'pending' END;

        INSERT INTO public.mods (
            id,
            name,
            slug,
            status,
            compliance_tier,
            status_reason,
            updated_at
        ) VALUES (
            v_mod_id,
            COALESCE(NULLIF(btrim(p_mod_name), ''), 'Flagged Artifact (' || left(v_hash, 12) || ')'),
            v_slug,
            v_next_status,
            v_tier,
            v_tagged_reason,
            NOW()
        )
        RETURNING * INTO v_existing;

        INSERT INTO public.mod_versions (mod_id, dna_hash, version_label, is_core_file)
        VALUES (v_mod_id, v_hash, 'flagged', true)
        ON CONFLICT (dna_hash) DO NOTHING;
    ELSE
        SELECT * INTO v_existing FROM public.mods WHERE id = v_mod_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Target artifact not found in Spoke registry';
        END IF;

        v_is_pending := lower(COALESCE(v_existing.status, '')) IN ('pending', 'under_review', 'unverified');
        v_is_confirmed := COALESCE(v_existing.compliance_tier, 0) >= 1 AND NOT v_is_pending;

        IF NOT v_is_confirmed OR (v_tier > COALESCE(v_existing.compliance_tier, 0)) THEN
            v_next_tier := CASE WHEN v_is_pending THEN GREATEST(COALESCE(v_existing.compliance_tier, 0), v_tier) ELSE v_tier END;
            v_next_status := CASE
                WHEN v_is_oversight THEN (CASE WHEN v_is_pending THEN 'pending' ELSE 'verified' END)
                ELSE 'pending'
            END;

            UPDATE public.mods
            SET compliance_tier = v_next_tier,
                status = v_next_status,
                status_reason = CASE
                    WHEN COALESCE(btrim(status_reason), '') <> '' AND v_is_confirmed AND v_tier > COALESCE(v_existing.compliance_tier, 0)
                        THEN status_reason || E'\n' || v_tagged_reason
                    ELSE v_tagged_reason
                END,
                updated_at = NOW()
            WHERE id = v_mod_id
            RETURNING * INTO v_existing;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (action, target_table, target_name, actor_id, reason)
    VALUES (
        'Flagged Artifact for Compliance (Tier ' || v_tier || ')',
        'mods',
        COALESCE(v_existing.name, v_mod_id::text),
        v_uid,
        v_tagged_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'queued_pending', COALESCE(v_existing.status, 'pending') = 'pending',
        'mod_id', v_mod_id,
        'compliance_tier', COALESCE(v_existing.compliance_tier, v_tier),
        'status', COALESCE(v_existing.status, 'pending')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.flag_mod_for_compliance(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_mod_for_compliance(UUID, TEXT, TEXT, INTEGER, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.increment_asset_downloads(asset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL AND NOT (SELECT sanctuary_internal.is_verified_hub_gateway()) THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.nexus_assets
    SET downloads = COALESCE(downloads, 0) + 1
    WHERE id = asset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_asset_downloads(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_asset_downloads(UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.increment_blueprint_downloads(blueprint_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL AND NOT (SELECT sanctuary_internal.is_verified_hub_gateway()) THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.blueprints
    SET downloads = COALESCE(downloads, 0) + 1
    WHERE id = blueprint_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_blueprint_downloads(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_blueprint_downloads(BIGINT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hide_mason_comment(p_comment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_author_id UUID;
    v_post_mason_id UUID;
BEGIN
    IF NOT sanctuary_internal.is_verified_hub_gateway() THEN
        IF v_uid IS NULL THEN
            RAISE EXCEPTION 'Not authenticated';
        END IF;

        SELECT c.author_id, mp.mason_id
        INTO v_author_id, v_post_mason_id
        FROM public.mason_post_comments c
        LEFT JOIN public.mason_posts mp ON mp.id = c.post_id
        WHERE c.id = p_comment_id;

        IF NOT FOUND THEN
            RETURN;
        END IF;

        IF v_author_id IS DISTINCT FROM v_uid
           AND NOT sanctuary_internal.owns_mason(v_post_mason_id)
           AND NOT sanctuary_internal.is_spoke_staff() THEN
            RAISE EXCEPTION 'Forbidden: Only comment author, post Creator, or Spoke staff can hide this comment';
        END IF;
    END IF;

    UPDATE public.mason_post_comments
    SET is_hidden = true
    WHERE id = p_comment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hide_mason_comment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_mason_comment(UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bulk_ingest_vault_mods(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_item JSONB;
    v_mason_name TEXT;
    v_mason_id UUID;
    v_mod_name TEXT;
    v_slug TEXT;
    v_mod_id UUID;
    v_dna_hash TEXT;
    v_processed INTEGER := 0;
    v_mods_upserted INTEGER := 0;
    v_versions_upserted INTEGER := 0;
BEGIN
    IF NOT sanctuary_internal.is_verified_hub_gateway()
       AND NOT sanctuary_internal.is_verified_mason_or_staff() THEN
        RAISE EXCEPTION 'Forbidden: Verified Creator or Staff clearance required for bulk registry ingestion';
    END IF;

    IF jsonb_typeof(p_items) <> 'array' THEN
        RETURN jsonb_build_object('ok', true, 'processed', 0, 'mods_upserted', 0, 'versions_upserted', 0);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_processed := v_processed + 1;
        v_mod_name := btrim(COALESCE(v_item->>'name', ''));
        IF v_mod_name = '' THEN
            CONTINUE;
        END IF;

        v_dna_hash := btrim(COALESCE(v_item->>'dna_hash', v_item->>'hash', ''));
        IF v_dna_hash <> '' AND EXISTS (
            SELECT 1
            FROM public.mod_versions mv
            INNER JOIN public.mods m ON m.id = mv.mod_id
            WHERE mv.dna_hash = v_dna_hash
              AND COALESCE(m.compliance_tier, 0) >= 1
        ) THEN
            CONTINUE;
        END IF;

        v_mason_id := NULL;
        IF COALESCE(v_item->>'mason_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_mason_id := (v_item->>'mason_id')::uuid;
        ELSE
            v_mason_name := btrim(COALESCE(v_item->>'author', v_item->>'master_author', ''));
            IF v_mason_name <> '' AND lower(v_mason_name) NOT IN ('unknown', 'unidentified') THEN
                INSERT INTO public.masons (name)
                VALUES (v_mason_name)
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id INTO v_mason_id;
            END IF;
        END IF;

        v_slug := NULLIF(btrim(COALESCE(v_item->>'slug', '')), '');
        IF v_slug IS NULL THEN
            v_slug := lower(regexp_replace(COALESCE(v_mason_name, 'mod') || '-' || v_mod_name, '[^a-zA-Z0-9]+', '-', 'g'));
            v_slug := trim(both '-' from v_slug);
        END IF;

        v_mod_id := NULL;
        INSERT INTO public.mods (
            mason_id,
            name,
            slug,
            description,
            status,
            is_official,
            family_slug,
            category_override,
            master_author,
            image_url,
            url,
            is_nsfw,
            "requiredDLC",
            latest_version,
            sub_type,
            allow_write,
            compliance_tier,
            folder_structure,
            file_extension,
            is_paid,
            is_early_access,
            updated_at
        ) VALUES (
            v_mason_id,
            v_mod_name,
            v_slug,
            NULLIF(v_item->>'description', ''),
            COALESCE(NULLIF(v_item->>'status', ''), 'ok'),
            COALESCE((v_item->>'is_official')::boolean, false),
            NULLIF(v_item->>'family_slug', ''),
            NULLIF(v_item->>'category_override', ''),
            NULLIF(COALESCE(v_item->>'master_author', v_item->>'author'), ''),
            NULLIF(v_item->>'image_url', ''),
            NULLIF(v_item->>'url', ''),
            COALESCE((v_item->>'is_nsfw')::boolean, false),
            COALESCE(v_item->'requiredDLC', '[]'::jsonb),
            NULLIF(COALESCE(v_item->>'latest_version', v_item->>'version'), ''),
            NULLIF(v_item->>'sub_type', ''),
            COALESCE((v_item->>'allow_write')::boolean, true),
            COALESCE((v_item->>'compliance_tier')::smallint, 0),
            v_item->'folder_structure',
            NULLIF(v_item->>'file_extension', ''),
            COALESCE((v_item->>'is_paid')::boolean, false),
            COALESCE((v_item->>'is_early_access')::boolean, false),
            NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
            mason_id = COALESCE(EXCLUDED.mason_id, public.mods.mason_id),
            latest_version = COALESCE(EXCLUDED.latest_version, public.mods.latest_version),
            url = COALESCE(EXCLUDED.url, public.mods.url),
            image_url = COALESCE(EXCLUDED.image_url, public.mods.image_url),
            category_override = COALESCE(EXCLUDED.category_override, public.mods.category_override),
            sub_type = COALESCE(EXCLUDED.sub_type, public.mods.sub_type),
            file_extension = COALESCE(EXCLUDED.file_extension, public.mods.file_extension),
            updated_at = NOW()
        WHERE COALESCE(public.mods.compliance_tier, 0) = 0
        RETURNING id INTO v_mod_id;

        IF v_mod_id IS NULL THEN
            CONTINUE;
        END IF;

        v_mods_upserted := v_mods_upserted + 1;

        IF v_mod_id IS NOT NULL AND v_dna_hash <> '' THEN
            INSERT INTO public.mod_versions (
                mod_id,
                version_label,
                game_version,
                dna_hash,
                download_url,
                is_core_file,
                parent_hash
            ) VALUES (
                v_mod_id,
                COALESCE(NULLIF(btrim(COALESCE(v_item->>'version_label', v_item->>'version', '')), ''), '1.0.0'),
                NULLIF(btrim(COALESCE(v_item->>'game_version', '')), ''),
                v_dna_hash,
                NULLIF(btrim(COALESCE(v_item->>'download_url', v_item->>'url', '')), ''),
                COALESCE((v_item->>'is_core_file')::boolean, true),
                NULLIF(btrim(COALESCE(v_item->>'parent_hash', '')), '')
            )
            ON CONFLICT (dna_hash) DO UPDATE SET
                mod_id = EXCLUDED.mod_id,
                version_label = COALESCE(EXCLUDED.version_label, public.mod_versions.version_label),
                game_version = COALESCE(EXCLUDED.game_version, public.mod_versions.game_version),
                download_url = COALESCE(EXCLUDED.download_url, public.mod_versions.download_url)
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.mods em
                WHERE em.id = public.mod_versions.mod_id
                  AND COALESCE(em.compliance_tier, 0) >= 1
            );

            v_versions_upserted := v_versions_upserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'processed', v_processed,
        'mods_upserted', v_mods_upserted,
        'versions_upserted', v_versions_upserted
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_ingest_vault_mods(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_ingest_vault_mods(JSONB) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_follower_notifications(
    p_mason_id UUID,
    p_type TEXT DEFAULT 'mason_post',
    p_reference_id UUID DEFAULT NULL,
    p_message TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_count INTEGER := 0;
    v_clean_msg TEXT := btrim(COALESCE(p_message, ''));
BEGIN
    IF v_clean_msg = '' OR p_mason_id IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'dispatched', 0);
    END IF;

    IF NOT sanctuary_internal.is_verified_hub_gateway()
       AND NOT sanctuary_internal.owns_mason(p_mason_id)
       AND NOT sanctuary_internal.is_spoke_staff() THEN
        RAISE EXCEPTION 'Forbidden: You can only notify followers of your own Creator profile';
    END IF;

    INSERT INTO public.notifications (user_id, actor_id, type, reference_id, message, is_read)
    SELECT
        mf.user_id,
        v_uid,
        COALESCE(NULLIF(btrim(p_type), ''), 'mason_post'),
        p_reference_id,
        v_clean_msg,
        false
    FROM public.mason_followers mf
    WHERE mf.mason_id = p_mason_id
      AND (v_uid IS NULL OR mf.user_id <> v_uid);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'dispatched', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_follower_notifications(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_follower_notifications(UUID, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.internal_get_runtime_secret(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;
    RETURN sanctuary_internal.read_runtime_secret(p_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_set_runtime_secret(p_key TEXT, p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;
    PERFORM sanctuary_internal.write_runtime_secret(p_key, p_value);
END;
$$;

REVOKE ALL ON FUNCTION public.internal_get_runtime_secret(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_set_runtime_secret(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_runtime_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_set_runtime_secret(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_spoke_gateway_handshake()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, sanctuary_internal
AS $$
DECLARE
    v_headers_raw TEXT;
    v_headers JSONB;
    v_token TEXT;
    v_rec RECORD;
    v_computed TEXT;
BEGIN
    IF NOT sanctuary_internal.is_verified_hub_gateway() THEN
        RAISE EXCEPTION 'Forbidden: Invalid or revoked Spoke Gateway Token';
    END IF;

    v_headers_raw := NULLIF(btrim(COALESCE(current_setting('request.headers', true), '')), '');
    IF v_headers_raw IS NOT NULL THEN
        BEGIN
            v_headers := v_headers_raw::jsonb;
            v_token := lower(btrim(COALESCE(v_headers ->> 'x-sanctuary-spoke-token', '')));
        EXCEPTION WHEN OTHERS THEN
            v_token := '';
        END;

        IF v_token ~ '^spk_gw_[0-9a-f]{64}$' THEN
            FOR v_rec IN
                SELECT id, token_salt, token_hash
                FROM sanctuary_internal.spoke_gateway_tokens
                WHERE is_active = true
                  AND (expires_at IS NULL OR expires_at > NOW())
            LOOP
                v_computed := encode(
                    extensions.hmac(convert_to(v_token, 'UTF8'), convert_to(v_rec.token_salt, 'UTF8'), 'sha256'),
                    'hex'
                );
                IF lower(v_computed) = lower(v_rec.token_hash) THEN
                    UPDATE sanctuary_internal.spoke_gateway_tokens
                    SET last_used_at = NOW()
                    WHERE id = v_rec.id;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'verified', true,
        'spoke_id', sanctuary_internal.active_spoke_id(),
        'auth_mode', CASE
            WHEN COALESCE(auth.role(), '') = 'service_role'
                 OR session_user IN ('postgres', 'supabase_admin') THEN 'service_role'
            ELSE 'scoped_gateway_token'
        END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mint_spoke_gateway_token(
    p_label TEXT DEFAULT 'Hub Gateway Uplink',
    p_grace_seconds INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, sanctuary_internal
AS $$
DECLARE
    v_is_allowed BOOLEAN := sanctuary_internal.is_verified_hub_gateway()
        OR sanctuary_internal.spoke_user_role() IN ('wayfinder', 'admin');
    v_grace INTEGER := GREATEST(0, LEAST(86400, COALESCE(p_grace_seconds, 60)));
    v_clean_label TEXT := COALESCE(NULLIF(btrim(p_label), ''), 'Hub Gateway Uplink');
    v_raw_token TEXT;
    v_salt TEXT;
    v_hash TEXT;
    v_fp TEXT;
    v_id UUID;
BEGIN
    IF NOT v_is_allowed THEN
        RAISE EXCEPTION 'Forbidden: Only Wayfinder, Admin, or verified Hub Gateway may mint Spoke Gateway Tokens';
    END IF;

    v_raw_token := 'spk_gw_' || encode(extensions.gen_random_bytes(32), 'hex');
    v_salt := encode(extensions.gen_random_bytes(16), 'hex');
    v_hash := encode(extensions.hmac(convert_to(v_raw_token, 'UTF8'), convert_to(v_salt, 'UTF8'), 'sha256'), 'hex');
    v_fp := 'spk_gw_...' || right(v_raw_token, 4);

    IF v_grace = 0 THEN
        UPDATE sanctuary_internal.spoke_gateway_tokens
        SET is_active = false,
            expires_at = NOW()
        WHERE is_active = true;
    ELSE
        UPDATE sanctuary_internal.spoke_gateway_tokens
        SET expires_at = LEAST(
                COALESCE(expires_at, NOW() + make_interval(secs => v_grace)),
                NOW() + make_interval(secs => v_grace)
            )
        WHERE is_active = true;
    END IF;

    DELETE FROM sanctuary_internal.spoke_gateway_tokens
    WHERE is_active = false
       OR (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 hour');

    INSERT INTO sanctuary_internal.spoke_gateway_tokens (
        label, token_salt, token_hash, key_fingerprint, is_active, expires_at
    )
    VALUES (
        v_clean_label, v_salt, v_hash, v_fp, true, NULL
    )
    RETURNING id INTO v_id;

    INSERT INTO public.audit_logs (action, target_table, target_name, actor_id, reason)
    VALUES (
        'Minted Scoped Spoke Gateway Token',
        'spoke_gateway_tokens',
        v_clean_label,
        (SELECT auth.uid()),
        'Fingerprint: ' || v_fp || ' (grace: ' || v_grace || 's)'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'token', v_raw_token,
        'key_fingerprint', v_fp,
        'token_id', v_id,
        'grace_seconds', v_grace
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_spoke_gateway_tokens()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, sanctuary_internal
AS $$
DECLARE
    v_is_allowed BOOLEAN := sanctuary_internal.is_verified_hub_gateway()
        OR sanctuary_internal.spoke_user_role() IN ('wayfinder', 'admin');
    v_count INTEGER := 0;
BEGIN
    IF NOT v_is_allowed THEN
        RAISE EXCEPTION 'Forbidden: Only Wayfinder, Admin, or verified Hub Gateway may revoke Spoke Gateway Tokens';
    END IF;

    UPDATE sanctuary_internal.spoke_gateway_tokens
    SET is_active = false,
        expires_at = NOW()
    WHERE is_active = true;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO public.audit_logs (action, target_table, target_name, actor_id, reason)
    VALUES (
        'Revoked All Spoke Gateway Tokens',
        'spoke_gateway_tokens',
        'Hub Gateway Uplink',
        (SELECT auth.uid()),
        'Immediately invalidated ' || v_count || ' active gateway token(s)'
    );

    RETURN jsonb_build_object('ok', true, 'revoked', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_spoke_gateway_handshake() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mint_spoke_gateway_token(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_spoke_gateway_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_spoke_gateway_handshake() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mint_spoke_gateway_token(TEXT, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_spoke_gateway_tokens() TO anon, authenticated, service_role;

-- ============================================================================
-- 12. INTERNAL WEBAUTHN & ZERO-KNOWLEDGE STANDALONE FORK RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.internal_get_webauthn_challenge(p_challenge_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'challenge_type', challenge_type,
        'session_data', session_data,
        'created_at', created_at,
        'expires_at', expires_at
    )
    INTO v_result
    FROM auth.webauthn_challenges
    WHERE id = p_challenge_id;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_get_webauthn_credential(p_credential_id_b64 TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'credential_id_b64', encode(credential_id, 'base64'),
        'public_key_b64', encode(public_key, 'base64'),
        'attestation_type', attestation_type,
        'aaguid', aaguid,
        'sign_count', sign_count,
        'transports', transports,
        'backup_eligible', backup_eligible,
        'backed_up', backed_up,
        'friendly_name', friendly_name,
        'created_at', created_at,
        'updated_at', updated_at,
        'last_used_at', last_used_at
    )
    INTO v_result
    FROM auth.webauthn_credentials
    WHERE credential_id = decode(p_credential_id_b64, 'base64')
    LIMIT 1;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_complete_webauthn_authentication(
    p_challenge_id UUID,
    p_cred_row_id UUID,
    p_sign_count BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    UPDATE auth.webauthn_credentials
    SET sign_count = GREATEST(COALESCE(sign_count, 0), COALESCE(p_sign_count, 0)),
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE id = p_cred_row_id
    RETURNING jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'friendly_name', friendly_name,
        'created_at', created_at,
        'updated_at', updated_at,
        'last_used_at', last_used_at
    ) INTO v_result;

    DELETE FROM auth.webauthn_challenges WHERE id = p_challenge_id;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_complete_webauthn_registration(
    p_challenge_id UUID,
    p_user_id UUID,
    p_credential_id_b64 TEXT,
    p_public_key_b64 TEXT,
    p_attestation_type TEXT,
    p_aaguid UUID,
    p_sign_count BIGINT,
    p_transports JSONB,
    p_backup_eligible BOOLEAN,
    p_backed_up BOOLEAN,
    p_friendly_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    INSERT INTO auth.webauthn_credentials (
        id,
        user_id,
        credential_id,
        public_key,
        attestation_type,
        aaguid,
        sign_count,
        transports,
        backup_eligible,
        backed_up,
        friendly_name,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        p_user_id,
        decode(p_credential_id_b64, 'base64'),
        decode(p_public_key_b64, 'base64'),
        COALESCE(NULLIF(p_attestation_type, ''), 'none'),
        p_aaguid,
        COALESCE(p_sign_count, 0),
        COALESCE(p_transports, '["internal", "hybrid"]'::jsonb),
        COALESCE(p_backup_eligible, false),
        COALESCE(p_backed_up, false),
        COALESCE(NULLIF(p_friendly_name, ''), 'FIDO2 Passkey'),
        NOW(),
        NOW()
    )
    RETURNING jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'friendly_name', friendly_name,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO v_result;

    DELETE FROM auth.webauthn_challenges WHERE id = p_challenge_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_get_webauthn_challenge(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_get_webauthn_credential(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_complete_webauthn_authentication(UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_complete_webauthn_registration(UUID, UUID, TEXT, TEXT, TEXT, UUID, BIGINT, JSONB, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.internal_get_webauthn_challenge(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_get_webauthn_credential(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_complete_webauthn_authentication(UUID, UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_complete_webauthn_registration(UUID, UUID, TEXT, TEXT, TEXT, UUID, BIGINT, JSONB, BOOLEAN, BOOLEAN, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_pwa_push_subscription(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_endpoint TEXT := btrim(COALESCE(p_payload->>'endpoint', ''));
    v_p256dh TEXT := btrim(COALESCE(p_payload->>'p256dh', ''));
    v_auth TEXT := btrim(COALESCE(p_payload->>'auth', ''));
    v_existing_uid UUID;
    v_spokes TEXT[];
BEGIN
    IF v_endpoint !~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|push\.opera\.com)/'
       OR length(v_p256dh) < 16
       OR length(v_auth) < 8 THEN
        RAISE EXCEPTION 'Invalid Web Push subscription payload';
    END IF;

    SELECT user_id INTO v_existing_uid
    FROM public.pwa_push_subscriptions
    WHERE endpoint = v_endpoint
    FOR UPDATE;

    IF FOUND AND v_existing_uid IS NOT NULL AND v_existing_uid IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Forbidden: Push endpoint is bound to another authenticated citizen';
    END IF;

    IF jsonb_typeof(p_payload->'subscribed_spokes') = 'array' THEN
        SELECT COALESCE(array_agg(elem), ARRAY[]::TEXT[])
        INTO v_spokes
        FROM jsonb_array_elements_text(p_payload->'subscribed_spokes') AS elem;
    ELSE
        v_spokes := ARRAY['global']::TEXT[];
    END IF;

    INSERT INTO public.pwa_push_subscriptions (
        endpoint,
        p256dh,
        auth,
        user_id,
        user_hash,
        handshake_token,
        staging_token,
        companion_token,
        device_label,
        subscribed_spokes,
        prefs,
        updated_at
    ) VALUES (
        v_endpoint,
        v_p256dh,
        v_auth,
        v_uid,
        NULLIF(btrim(COALESCE(p_payload->>'user_hash', '')), ''),
        NULLIF(btrim(COALESCE(p_payload->>'handshake_token', '')), ''),
        NULLIF(btrim(COALESCE(p_payload->>'staging_token', '')), ''),
        NULLIF(btrim(COALESCE(p_payload->>'companion_token', '')), ''),
        NULLIF(btrim(COALESCE(p_payload->>'device_label', '')), ''),
        v_spokes,
        COALESCE(p_payload->'prefs', '{}'::jsonb),
        NOW()
    )
    ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_id = COALESCE(v_uid, public.pwa_push_subscriptions.user_id),
        user_hash = EXCLUDED.user_hash,
        handshake_token = EXCLUDED.handshake_token,
        staging_token = EXCLUDED.staging_token,
        companion_token = EXCLUDED.companion_token,
        device_label = EXCLUDED.device_label,
        subscribed_spokes = EXCLUDED.subscribed_spokes,
        prefs = EXCLUDED.prefs,
        updated_at = NOW();

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_pwa_push_subscription(JSONB) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sanctuary_update_own_credentials(
    p_current_password TEXT,
    p_current_zk_password TEXT DEFAULT NULL,
    p_new_email TEXT DEFAULT NULL,
    p_new_password TEXT DEFAULT NULL,
    p_metadata_patch JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_enc_pw TEXT;
    v_current_email TEXT;
    v_clean_email TEXT;
    v_updated_meta JSONB;
    v_safe_patch JSONB := '{}'::jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
    INTO v_safe_patch
    FROM jsonb_each(COALESCE(p_metadata_patch, '{}'::jsonb)) AS e(k, v)
    WHERE k IN (
        'username',
        'zk_password_v1',
        'zk_password_v2',
        'zk_recovery_salt',
        'zk_recovery_verifier',
        'blinded_email_enabled',
        'sanctuary_security_policy',
        'email'
    );

    SELECT encrypted_password, email, COALESCE(raw_user_meta_data, '{}'::jsonb)
    INTO v_enc_pw, v_current_email, v_updated_meta
    FROM auth.users
    WHERE id = v_uid
    FOR UPDATE;

    IF v_enc_pw IS NULL THEN
        RAISE EXCEPTION 'Account record not found';
    END IF;

    IF NOT (
        (p_current_password IS NOT NULL AND p_current_password <> '' AND v_enc_pw = extensions.crypt(p_current_password, v_enc_pw))
        OR
        (p_current_zk_password IS NOT NULL AND p_current_zk_password <> '' AND v_enc_pw = extensions.crypt(p_current_zk_password, v_enc_pw))
    ) THEN
        RAISE EXCEPTION 'Current password verification failed.';
    END IF;

    IF p_new_email IS NOT NULL AND btrim(p_new_email) <> '' THEN
        v_clean_email := lower(btrim(p_new_email));
        IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email AND id <> v_uid) THEN
            RAISE EXCEPTION 'That email or blind alias is already registered to another account.';
        END IF;

        v_updated_meta := v_updated_meta || v_safe_patch || jsonb_build_object('email', v_clean_email);

        UPDATE auth.users
        SET email = v_clean_email,
            email_change = '',
            email_change_token_new = '',
            email_change_token_current = '',
            email_change_confirm_status = 0,
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_user_meta_data = v_updated_meta,
            updated_at = NOW()
        WHERE id = v_uid;

        UPDATE auth.identities
        SET identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_clean_email),
            updated_at = NOW()
        WHERE user_id = v_uid AND provider = 'email';
    ELSIF v_safe_patch <> '{}'::jsonb THEN
        v_updated_meta := v_updated_meta || v_safe_patch;
        UPDATE auth.users
        SET raw_user_meta_data = v_updated_meta,
            updated_at = NOW()
        WHERE id = v_uid;
    END IF;

    IF p_new_password IS NOT NULL AND length(p_new_password) >= 8 THEN
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
            updated_at = NOW()
        WHERE id = v_uid;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'email', COALESCE(v_clean_email, v_current_email),
        'user_metadata', v_updated_meta
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sanctuary_update_own_credentials(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sanctuary_update_own_credentials(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sanctuary_update_own_security_metadata(
    p_metadata_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_safe_patch JSONB := '{}'::jsonb;
    v_merged_meta JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
    INTO v_safe_patch
    FROM jsonb_each(COALESCE(p_metadata_patch, '{}'::jsonb)) AS e(k, v)
    WHERE k IN (
        'sanctuary_security_policy',
        'zk_password_v1',
        'zk_password_v2',
        'zk_recovery_salt',
        'zk_recovery_verifier',
        'blinded_email_enabled'
    );

    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || v_safe_patch,
        updated_at = NOW()
    WHERE id = v_uid
    RETURNING raw_user_meta_data INTO v_merged_meta;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found.';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'user_metadata', v_merged_meta
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sanctuary_update_own_security_metadata(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sanctuary_update_own_security_metadata(JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sanctuary_reset_own_password_from_recovery(
    p_new_password TEXT,
    p_metadata_patch JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_jwt JSONB := COALESCE((SELECT auth.jwt()), '{}'::jsonb);
    v_app_meta JSONB;
    v_recovery_sent_at TIMESTAMPTZ;
    v_passkey_ts TIMESTAMPTZ;
    v_is_verified_recovery BOOLEAN := false;
    v_safe_patch JSONB := '{}'::jsonb;
    v_meta JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters long';
    END IF;

    SELECT COALESCE(raw_app_meta_data, '{}'::jsonb), recovery_sent_at
    INTO v_app_meta, v_recovery_sent_at
    FROM auth.users
    WHERE id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account record not found';
    END IF;

    IF COALESCE(v_jwt->>'aal', '') = 'aal2' THEN
        v_is_verified_recovery := true;
    ELSIF jsonb_typeof(v_jwt->'amr') = 'array' AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_jwt->'amr') AS elem
        WHERE COALESCE(elem->>'method', trim(both '"' from elem::text)) IN ('recovery', 'otp', 'magiclink', 'totp', 'webauthn', 'passkey')
    ) THEN
        v_is_verified_recovery := true;
    ELSIF v_recovery_sent_at IS NOT NULL AND v_recovery_sent_at > (NOW() - INTERVAL '30 minutes') THEN
        v_is_verified_recovery := true;
    ELSIF COALESCE(v_app_meta->>'last_passkey_verified_at', '') <> '' THEN
        BEGIN
            v_passkey_ts := (v_app_meta->>'last_passkey_verified_at')::timestamptz;
            IF v_passkey_ts > (NOW() - INTERVAL '15 minutes') THEN
                v_is_verified_recovery := true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_is_verified_recovery := false;
        END;
    END IF;

    IF NOT v_is_verified_recovery THEN
        RAISE EXCEPTION 'Forbidden: Password reset requires an active recovery link, OTP, MFA, or FIDO2 Passkey verification session.';
    END IF;

    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
    INTO v_safe_patch
    FROM jsonb_each(COALESCE(p_metadata_patch, '{}'::jsonb)) AS e(k, v)
    WHERE k IN ('zk_password_v1', 'zk_password_v2');

    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('zk_password_v1', true)
            || v_safe_patch,
        recovery_sent_at = NULL,
        updated_at = NOW()
    WHERE id = v_uid
    RETURNING raw_user_meta_data INTO v_meta;

    RETURN jsonb_build_object(
        'ok', true,
        'user_metadata', COALESCE(v_meta, '{}'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sanctuary_reset_own_password_from_recovery(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sanctuary_reset_own_password_from_recovery(TEXT, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sanctuary_check_recovery_method(
    p_email TEXT,
    p_blind_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_clean_email TEXT := lower(trim(COALESCE(p_email, '')));
    v_clean_blind TEXT := lower(trim(COALESCE(p_blind_email, '')));
    v_matched_blind BOOLEAN := false;
    v_matched_plain BOOLEAN := false;
BEGIN
    IF v_clean_blind <> '' AND EXISTS (
        SELECT 1 FROM auth.users WHERE lower(email) = v_clean_blind
    ) THEN
        v_matched_blind := true;
    END IF;

    IF v_clean_email <> '' AND EXISTS (
        SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email
    ) THEN
        v_matched_plain := true;
    END IF;

    RETURN jsonb_build_object(
        'is_blinded_account', (v_matched_blind AND NOT v_matched_plain)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sanctuary_check_recovery_method(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sanctuary_resolve_login_identifier(
    p_identifier TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_clean TEXT := btrim(COALESCE(p_identifier, ''));
    v_resolved_email TEXT;
BEGIN
    IF v_clean = '' OR position('@' in v_clean) > 0 THEN
        RETURN NULL;
    END IF;

    SELECT u.email
    INTO v_resolved_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(p.username) = lower(v_clean)
    LIMIT 1;

    IF v_resolved_email IS NULL THEN
        SELECT u.email
        INTO v_resolved_email
        FROM auth.users u
        WHERE lower(u.raw_user_meta_data->>'username') = lower(v_clean)
        LIMIT 1;
    END IF;

    IF v_resolved_email IS NOT NULL AND v_resolved_email LIKE 'zk-%' THEN
        RETURN v_resolved_email;
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sanctuary_resolve_login_identifier(TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.internal_upsert_spoke_relink_commitment(
    p_profile_id UUID,
    p_commitment_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_clean_hash TEXT := lower(btrim(COALESCE(p_commitment_hash, '')));
BEGIN
    IF NOT sanctuary_internal.is_verified_hub_gateway() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;
    IF p_profile_id IS NULL OR v_clean_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid profile_id or SHA-256 commitment hash';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
    END IF;

    INSERT INTO sanctuary_internal.spoke_relink_commitments (profile_id, commitment_hash, updated_at)
    VALUES (p_profile_id, v_clean_hash, NOW())
    ON CONFLICT (profile_id) DO UPDATE
    SET commitment_hash = EXCLUDED.commitment_hash,
        updated_at = NOW();

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.internal_upsert_spoke_relink_commitment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_upsert_spoke_relink_commitment(UUID, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_spoke_relink_commitment(
    p_commitment_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
    v_clean_hash TEXT := lower(btrim(COALESCE(p_commitment_hash, '')));
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF v_clean_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid SHA-256 commitment hash';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
    END IF;

    INSERT INTO sanctuary_internal.spoke_relink_commitments (profile_id, commitment_hash, updated_at)
    VALUES (v_uid, v_clean_hash, NOW())
    ON CONFLICT (profile_id) DO UPDATE
    SET commitment_hash = EXCLUDED.commitment_hash,
        updated_at = NOW();

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.register_spoke_relink_commitment(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_spoke_relink_commitment(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_severed_spoke_profile(
    p_legacy_uuid UUID,
    p_claim_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, sanctuary_internal
AS $$
DECLARE
    v_uid UUID := (SELECT auth.uid());
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    RETURN sanctuary_internal.relink_spoke_profile_uuid(p_legacy_uuid, v_uid, p_claim_secret);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_severed_spoke_profile(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_severed_spoke_profile(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 13. TURNKEY ROW LEVEL SECURITY (RLS) POLICIES (CONSOLIDATED 1-PER-CMD)
-- ============================================================================
-- Hub-and-Spoke administrative mutations route through `game-gateway` (service_role).
-- Direct client queries use Spoke Anon Key (read) or Standalone Fork JWTs (write).
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    END LOOP;
END $$;

-- Profiles (No email/payment PII stored on Spoke; public username/role resolution, self/staff/gateway writes)
DROP POLICY IF EXISTS "spoke_profiles_select" ON public.profiles;
CREATE POLICY "spoke_profiles_select" ON public.profiles
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_profiles_insert" ON public.profiles;
CREATE POLICY "spoke_profiles_insert" ON public.profiles
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_profiles_update" ON public.profiles;
CREATE POLICY "spoke_profiles_update" ON public.profiles
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_profiles_delete" ON public.profiles;
CREATE POLICY "spoke_profiles_delete" ON public.profiles
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

-- Append-only Audit Logs (strictly SELECT / INSERT; zero UPDATE or DELETE via gateway or users)
DROP POLICY IF EXISTS "spoke_audit_logs_select" ON public.audit_logs;
CREATE POLICY "spoke_audit_logs_select" ON public.audit_logs
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_audit_logs_insert" ON public.audit_logs;
CREATE POLICY "spoke_audit_logs_insert" ON public.audit_logs
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR ((SELECT auth.uid()) IS NOT NULL AND (actor_id IS NULL OR actor_id = (SELECT auth.uid())))
    );

-- Creators (Masons) & Followers
DROP POLICY IF EXISTS "spoke_masons_select" ON public.masons;
CREATE POLICY "spoke_masons_select" ON public.masons
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_masons_insert" ON public.masons;
CREATE POLICY "spoke_masons_insert" ON public.masons
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR (profile_id = (SELECT auth.uid()) AND sanctuary_internal.is_spoke_creator_or_staff())
        OR sanctuary_internal.is_spoke_staff()
    );
DROP POLICY IF EXISTS "spoke_masons_update" ON public.masons;
CREATE POLICY "spoke_masons_update" ON public.masons
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR profile_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR profile_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_masons_delete" ON public.masons;
CREATE POLICY "spoke_masons_delete" ON public.masons
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_mason_followers_select" ON public.mason_followers;
CREATE POLICY "spoke_mason_followers_select" ON public.mason_followers
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_mason_followers_insert" ON public.mason_followers;
CREATE POLICY "spoke_mason_followers_insert" ON public.mason_followers
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_mason_followers_delete" ON public.mason_followers;
CREATE POLICY "spoke_mason_followers_delete" ON public.mason_followers
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));

-- Creator Comm-Link (Posts, Comments, Likes, Views)
DROP POLICY IF EXISTS "spoke_mason_posts_select" ON public.mason_posts;
CREATE POLICY "spoke_mason_posts_select" ON public.mason_posts
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_mason_posts_insert" ON public.mason_posts;
CREATE POLICY "spoke_mason_posts_insert" ON public.mason_posts
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_verified_mason(mason_id) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_mason_posts_update" ON public.mason_posts;
CREATE POLICY "spoke_mason_posts_update" ON public.mason_posts
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_verified_mason(mason_id) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_verified_mason(mason_id) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_mason_posts_delete" ON public.mason_posts;
CREATE POLICY "spoke_mason_posts_delete" ON public.mason_posts
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_mason(mason_id) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_mason_post_comments_select" ON public.mason_post_comments;
CREATE POLICY "spoke_mason_post_comments_select" ON public.mason_post_comments
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR COALESCE(is_hidden, false) = false
        OR author_id = (SELECT auth.uid())
        OR sanctuary_internal.is_spoke_staff()
    );
DROP POLICY IF EXISTS "spoke_mason_post_comments_insert" ON public.mason_post_comments;
CREATE POLICY "spoke_mason_post_comments_insert" ON public.mason_post_comments
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_mason_post_comments_update" ON public.mason_post_comments;
CREATE POLICY "spoke_mason_post_comments_update" ON public.mason_post_comments
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_mason_post_comments_delete" ON public.mason_post_comments;
CREATE POLICY "spoke_mason_post_comments_delete" ON public.mason_post_comments
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_mason_post_likes_select" ON public.mason_post_likes;
CREATE POLICY "spoke_mason_post_likes_select" ON public.mason_post_likes
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_mason_post_likes_insert" ON public.mason_post_likes;
CREATE POLICY "spoke_mason_post_likes_insert" ON public.mason_post_likes
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_mason_post_likes_delete" ON public.mason_post_likes;
CREATE POLICY "spoke_mason_post_likes_delete" ON public.mason_post_likes
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "spoke_mason_post_views_select" ON public.mason_post_views;
CREATE POLICY "spoke_mason_post_views_select" ON public.mason_post_views
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_mason_post_views_insert" ON public.mason_post_views;
CREATE POLICY "spoke_mason_post_views_insert" ON public.mason_post_views
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));

-- Collections, Blueprints & Marketplace (Nexus)
DROP POLICY IF EXISTS "spoke_collections_select" ON public.collections;
CREATE POLICY "spoke_collections_select" ON public.collections
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR COALESCE(compliance_tier, 0) NOT BETWEEN 1 AND 4
        OR sanctuary_internal.is_spoke_oversight_or_wayfinder()
    );
DROP POLICY IF EXISTS "spoke_collections_insert" ON public.collections;
CREATE POLICY "spoke_collections_insert" ON public.collections
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_verified_mason(mason_id) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_collections_update" ON public.collections;
CREATE POLICY "spoke_collections_update" ON public.collections
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_verified_mason(mason_id) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_verified_mason(mason_id) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_collections_delete" ON public.collections;
CREATE POLICY "spoke_collections_delete" ON public.collections
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.owns_mason(mason_id) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_collection_members_select" ON public.collection_members;
CREATE POLICY "spoke_collection_members_select" ON public.collection_members
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_collection_members_insert" ON public.collection_members;
CREATE POLICY "spoke_collection_members_insert" ON public.collection_members
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR sanctuary_internal.is_spoke_staff()
        OR EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = set_id AND sanctuary_internal.owns_verified_mason(c.mason_id)
        )
    );
DROP POLICY IF EXISTS "spoke_collection_members_update" ON public.collection_members;
CREATE POLICY "spoke_collection_members_update" ON public.collection_members
    FOR UPDATE TO anon, authenticated
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR sanctuary_internal.is_spoke_staff()
        OR EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = set_id AND sanctuary_internal.owns_verified_mason(c.mason_id)
        )
    )
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR sanctuary_internal.is_spoke_staff()
        OR EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = set_id AND sanctuary_internal.owns_verified_mason(c.mason_id)
        )
    );
DROP POLICY IF EXISTS "spoke_collection_members_delete" ON public.collection_members;
CREATE POLICY "spoke_collection_members_delete" ON public.collection_members
    FOR DELETE TO anon, authenticated
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR sanctuary_internal.is_spoke_staff()
        OR EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = set_id AND sanctuary_internal.owns_mason(c.mason_id)
        )
    );

DROP POLICY IF EXISTS "spoke_blueprints_select" ON public.blueprints;
CREATE POLICY "spoke_blueprints_select" ON public.blueprints
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR COALESCE(is_public, true) = true
        OR mason_id = (SELECT auth.uid())
        OR sanctuary_internal.owns_mason(mason_id)
        OR sanctuary_internal.is_spoke_staff()
    );
DROP POLICY IF EXISTS "spoke_blueprints_insert" ON public.blueprints;
CREATE POLICY "spoke_blueprints_insert" ON public.blueprints
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR (
            (SELECT auth.uid()) IS NOT NULL
            AND (mason_id = (SELECT auth.uid()) OR sanctuary_internal.owns_mason(mason_id) OR sanctuary_internal.is_spoke_staff())
        )
    );
DROP POLICY IF EXISTS "spoke_blueprints_update" ON public.blueprints;
CREATE POLICY "spoke_blueprints_update" ON public.blueprints
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR mason_id = (SELECT auth.uid()) OR sanctuary_internal.owns_mason(mason_id) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR mason_id = (SELECT auth.uid()) OR sanctuary_internal.owns_mason(mason_id) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_blueprints_delete" ON public.blueprints;
CREATE POLICY "spoke_blueprints_delete" ON public.blueprints
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR mason_id = (SELECT auth.uid()) OR sanctuary_internal.owns_mason(mason_id) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_nexus_assets_select" ON public.nexus_assets;
CREATE POLICY "spoke_nexus_assets_select" ON public.nexus_assets
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR COALESCE(is_public, true) = true
        OR author_id = (SELECT auth.uid())
        OR sanctuary_internal.is_spoke_staff()
    );
DROP POLICY IF EXISTS "spoke_nexus_assets_insert" ON public.nexus_assets;
CREATE POLICY "spoke_nexus_assets_insert" ON public.nexus_assets
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR (author_id = (SELECT auth.uid()) AND sanctuary_internal.is_verified_mason_or_staff())
        OR sanctuary_internal.is_spoke_staff()
    );
DROP POLICY IF EXISTS "spoke_nexus_assets_update" ON public.nexus_assets;
CREATE POLICY "spoke_nexus_assets_update" ON public.nexus_assets
    FOR UPDATE TO anon, authenticated
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR (author_id = (SELECT auth.uid()) AND sanctuary_internal.is_verified_mason_or_staff())
        OR sanctuary_internal.is_spoke_staff()
    )
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR (author_id = (SELECT auth.uid()) AND sanctuary_internal.is_verified_mason_or_staff())
        OR sanctuary_internal.is_spoke_staff()
    );
DROP POLICY IF EXISTS "spoke_nexus_assets_delete" ON public.nexus_assets;
CREATE POLICY "spoke_nexus_assets_delete" ON public.nexus_assets
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());

-- Reports, Content Flags, Malware Telemetry, Scout Suggestions & Tickets
DROP POLICY IF EXISTS "spoke_blueprint_reports_select" ON public.blueprint_reports;
CREATE POLICY "spoke_blueprint_reports_select" ON public.blueprint_reports
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR reporter_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_blueprint_reports_insert" ON public.blueprint_reports;
CREATE POLICY "spoke_blueprint_reports_insert" ON public.blueprint_reports
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR ((SELECT auth.uid()) IS NOT NULL AND (reporter_id IS NULL OR reporter_id = (SELECT auth.uid())))
    );
DROP POLICY IF EXISTS "spoke_blueprint_reports_update" ON public.blueprint_reports;
CREATE POLICY "spoke_blueprint_reports_update" ON public.blueprint_reports
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_blueprint_reports_delete" ON public.blueprint_reports;
CREATE POLICY "spoke_blueprint_reports_delete" ON public.blueprint_reports
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_nexus_reports_select" ON public.nexus_reports;
CREATE POLICY "spoke_nexus_reports_select" ON public.nexus_reports
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR reporter_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_nexus_reports_insert" ON public.nexus_reports;
CREATE POLICY "spoke_nexus_reports_insert" ON public.nexus_reports
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR ((SELECT auth.uid()) IS NOT NULL AND (reporter_id IS NULL OR reporter_id = (SELECT auth.uid())))
    );
DROP POLICY IF EXISTS "spoke_nexus_reports_update" ON public.nexus_reports;
CREATE POLICY "spoke_nexus_reports_update" ON public.nexus_reports
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_nexus_reports_delete" ON public.nexus_reports;
CREATE POLICY "spoke_nexus_reports_delete" ON public.nexus_reports
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_content_flags_select" ON public.content_flags;
CREATE POLICY "spoke_content_flags_select" ON public.content_flags
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR reporter_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_content_flags_insert" ON public.content_flags;
CREATE POLICY "spoke_content_flags_insert" ON public.content_flags
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR reporter_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_content_flags_update" ON public.content_flags;
CREATE POLICY "spoke_content_flags_update" ON public.content_flags
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_content_flags_delete" ON public.content_flags;
CREATE POLICY "spoke_content_flags_delete" ON public.content_flags
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_malware_reports_select" ON public.malware_reports;
CREATE POLICY "spoke_malware_reports_select" ON public.malware_reports
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_malware_reports_insert" ON public.malware_reports;
CREATE POLICY "spoke_malware_reports_insert" ON public.malware_reports
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR (SELECT auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "spoke_malware_reports_update" ON public.malware_reports;
CREATE POLICY "spoke_malware_reports_update" ON public.malware_reports
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_malware_reports_delete" ON public.malware_reports;
CREATE POLICY "spoke_malware_reports_delete" ON public.malware_reports
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_homestead_lab_logs_select" ON public.homestead_lab_logs;
CREATE POLICY "spoke_homestead_lab_logs_select" ON public.homestead_lab_logs
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_homestead_lab_logs_insert" ON public.homestead_lab_logs;
CREATE POLICY "spoke_homestead_lab_logs_insert" ON public.homestead_lab_logs
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR (SELECT auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "spoke_homestead_lab_logs_update" ON public.homestead_lab_logs;
CREATE POLICY "spoke_homestead_lab_logs_update" ON public.homestead_lab_logs
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_creator_or_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_creator_or_staff());
DROP POLICY IF EXISTS "spoke_homestead_lab_logs_delete" ON public.homestead_lab_logs;
CREATE POLICY "spoke_homestead_lab_logs_delete" ON public.homestead_lab_logs
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_creator_or_staff());

DROP POLICY IF EXISTS "spoke_scout_suggestions_select" ON public.scout_suggestions;
CREATE POLICY "spoke_scout_suggestions_select" ON public.scout_suggestions
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_scout_suggestions_insert" ON public.scout_suggestions;
CREATE POLICY "spoke_scout_suggestions_insert" ON public.scout_suggestions
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR ((SELECT auth.uid()) IS NOT NULL AND (submitter_id IS NULL OR submitter_id = (SELECT auth.uid())))
    );
DROP POLICY IF EXISTS "spoke_scout_suggestions_update" ON public.scout_suggestions;
CREATE POLICY "spoke_scout_suggestions_update" ON public.scout_suggestions
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR submitter_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_creator_or_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR submitter_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_creator_or_staff());
DROP POLICY IF EXISTS "spoke_scout_suggestions_delete" ON public.scout_suggestions;
CREATE POLICY "spoke_scout_suggestions_delete" ON public.scout_suggestions
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR submitter_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_creator_or_staff());

DROP POLICY IF EXISTS "spoke_sanctuary_tickets_select" ON public.sanctuary_tickets;
CREATE POLICY "spoke_sanctuary_tickets_select" ON public.sanctuary_tickets
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_sanctuary_tickets_insert" ON public.sanctuary_tickets;
CREATE POLICY "spoke_sanctuary_tickets_insert" ON public.sanctuary_tickets
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_sanctuary_tickets_update" ON public.sanctuary_tickets;
CREATE POLICY "spoke_sanctuary_tickets_update" ON public.sanctuary_tickets
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR author_id = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_sanctuary_tickets_delete" ON public.sanctuary_tickets;
CREATE POLICY "spoke_sanctuary_tickets_delete" ON public.sanctuary_tickets
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

-- Standalone / Spoke Email Dispatches (Staff-only PII protection)
DROP POLICY IF EXISTS "spoke_keeper_email_dispatches_select" ON public.keeper_email_dispatches;
CREATE POLICY "spoke_keeper_email_dispatches_select" ON public.keeper_email_dispatches
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_keeper_email_dispatches_insert" ON public.keeper_email_dispatches;
CREATE POLICY "spoke_keeper_email_dispatches_insert" ON public.keeper_email_dispatches
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_keeper_email_dispatches_update" ON public.keeper_email_dispatches;
CREATE POLICY "spoke_keeper_email_dispatches_update" ON public.keeper_email_dispatches
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff())
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_keeper_email_dispatches_delete" ON public.keeper_email_dispatches;
CREATE POLICY "spoke_keeper_email_dispatches_delete" ON public.keeper_email_dispatches
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());

-- Notifications & Poll Votes
DROP POLICY IF EXISTS "spoke_notifications_select" ON public.notifications;
CREATE POLICY "spoke_notifications_select" ON public.notifications
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_notifications_insert" ON public.notifications;
CREATE POLICY "spoke_notifications_insert" ON public.notifications
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR (actor_id = (SELECT auth.uid()) AND user_id = (SELECT auth.uid())) OR sanctuary_internal.is_spoke_staff());
DROP POLICY IF EXISTS "spoke_notifications_update" ON public.notifications;
CREATE POLICY "spoke_notifications_update" ON public.notifications
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()))
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_notifications_delete" ON public.notifications;
CREATE POLICY "spoke_notifications_delete" ON public.notifications
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()) OR sanctuary_internal.is_spoke_staff());

DROP POLICY IF EXISTS "spoke_dispatch_poll_votes_select" ON public.dispatch_poll_votes;
CREATE POLICY "spoke_dispatch_poll_votes_select" ON public.dispatch_poll_votes
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_dispatch_poll_votes_insert" ON public.dispatch_poll_votes;
CREATE POLICY "spoke_dispatch_poll_votes_insert" ON public.dispatch_poll_votes
    FOR INSERT TO anon, authenticated
    WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_dispatch_poll_votes_delete" ON public.dispatch_poll_votes;
CREATE POLICY "spoke_dispatch_poll_votes_delete" ON public.dispatch_poll_votes
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));

-- Ephemeral Encrypted Staging Queue & PWA Push Subscriptions
DO $$
BEGIN
    IF sanctuary_internal.read_runtime_secret('staging_owner_hmac_key') IS NULL THEN
        PERFORM sanctuary_internal.write_runtime_secret(
            'staging_owner_hmac_key',
            encode(extensions.gen_random_bytes(32), 'hex')
        );
    END IF;
END $$;

ALTER TABLE public.citizen_staging_queue ADD COLUMN IF NOT EXISTS owner_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_spoke_staging_queue_owner_tag ON public.citizen_staging_queue(owner_tag);

DROP TRIGGER IF EXISTS trg_stamp_staging_owner_tag ON public.citizen_staging_queue;
CREATE TRIGGER trg_stamp_staging_owner_tag
    BEFORE INSERT OR UPDATE ON public.citizen_staging_queue
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.stamp_staging_owner_tag();

DROP POLICY IF EXISTS "spoke_staging_queue_select" ON public.citizen_staging_queue;
CREATE POLICY "spoke_staging_queue_select" ON public.citizen_staging_queue
    FOR SELECT TO anon, authenticated
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR (
            (SELECT auth.uid()) IS NOT NULL
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (owner_tag IS NULL OR owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag()))
        )
    );
DROP POLICY IF EXISTS "spoke_staging_queue_insert" ON public.citizen_staging_queue;
CREATE POLICY "spoke_staging_queue_insert" ON public.citizen_staging_queue
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        length(user_token) >= 16
        AND length(encrypted_payload) <= 10485760
        AND (
            (SELECT sanctuary_internal.is_verified_hub_gateway())
            OR (
                (SELECT auth.uid()) IS NOT NULL
                AND owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag())
            )
        )
    );
DROP POLICY IF EXISTS "spoke_staging_queue_update" ON public.citizen_staging_queue;
CREATE POLICY "spoke_staging_queue_update" ON public.citizen_staging_queue
    FOR UPDATE TO anon, authenticated
    USING (
        length(user_token) >= 16
        AND (
            (SELECT sanctuary_internal.is_verified_hub_gateway())
            OR (
                (SELECT auth.uid()) IS NOT NULL
                AND (owner_tag IS NULL OR owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag()))
            )
        )
    )
    WITH CHECK (
        length(user_token) >= 16
        AND length(encrypted_payload) <= 10485760
        AND (
            (SELECT sanctuary_internal.is_verified_hub_gateway())
            OR (
                (SELECT auth.uid()) IS NOT NULL
                AND owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag())
            )
        )
    );
DROP POLICY IF EXISTS "spoke_staging_queue_delete" ON public.citizen_staging_queue;
CREATE POLICY "spoke_staging_queue_delete" ON public.citizen_staging_queue
    FOR DELETE TO anon, authenticated
    USING (
        length(user_token) >= 16
        AND (
            (SELECT sanctuary_internal.is_verified_hub_gateway())
            OR (
                (SELECT auth.uid()) IS NOT NULL
                AND (owner_tag IS NULL OR owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag()))
            )
        )
    );

DROP POLICY IF EXISTS "spoke_pwa_push_subscriptions_select" ON public.pwa_push_subscriptions;
CREATE POLICY "spoke_pwa_push_subscriptions_select" ON public.pwa_push_subscriptions
    FOR SELECT TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "spoke_pwa_push_subscriptions_insert" ON public.pwa_push_subscriptions;
CREATE POLICY "spoke_pwa_push_subscriptions_insert" ON public.pwa_push_subscriptions
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        endpoint ~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|push\.opera\.com)/'
        AND length(p256dh) >= 16
        AND length(auth) >= 8
        AND (user_id IS NULL OR user_id = (SELECT auth.uid()) OR (SELECT sanctuary_internal.is_verified_hub_gateway()))
    );
DROP POLICY IF EXISTS "spoke_pwa_push_subscriptions_update" ON public.pwa_push_subscriptions;
CREATE POLICY "spoke_pwa_push_subscriptions_update" ON public.pwa_push_subscriptions
    FOR UPDATE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()) OR user_id IS NULL)
    WITH CHECK (
        endpoint ~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|push\.opera\.com)/'
        AND length(p256dh) >= 16
        AND length(auth) >= 8
        AND (user_id = (SELECT auth.uid()) OR (SELECT sanctuary_internal.is_verified_hub_gateway()))
    );
DROP POLICY IF EXISTS "spoke_pwa_push_subscriptions_delete" ON public.pwa_push_subscriptions;
CREATE POLICY "spoke_pwa_push_subscriptions_delete" ON public.pwa_push_subscriptions
    FOR DELETE TO anon, authenticated
    USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR user_id = (SELECT auth.uid()));

-- Creator-or-Staff Registry & Matrix Tables (Public Read, Creator/Staff/Gateway Write)
DO $$
DECLARE
    creator_tbl TEXT;
BEGIN
    FOREACH creator_tbl IN ARRAY ARRAY[
        'community_group_members',
        'community_groups',
        'homestead_workbench_templates',
        'logical_conflicts',
        'mod_bundles',
        'mod_dependencies',
        'mod_relationships',
        'mod_versions',
        'mods',
        'version_dependencies'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_select" ON public.%1$I;', creator_tbl);
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_insert" ON public.%1$I;', creator_tbl);
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_update" ON public.%1$I;', creator_tbl);
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_delete" ON public.%1$I;', creator_tbl);
        IF creator_tbl NOT IN ('mods', 'mod_versions') THEN
            EXECUTE format(
                'CREATE POLICY "spoke_%1$s_select" ON public.%1$I FOR SELECT TO public USING (true);',
                creator_tbl
            );
        END IF;
        EXECUTE format(
            'CREATE POLICY "spoke_%1$s_insert" ON public.%1$I FOR INSERT TO anon, authenticated WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff());',
            creator_tbl
        );
        EXECUTE format(
            'CREATE POLICY "spoke_%1$s_update" ON public.%1$I FOR UPDATE TO anon, authenticated USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()) WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff());',
            creator_tbl
        );
        EXECUTE format(
            'CREATE POLICY "spoke_%1$s_delete" ON public.%1$I FOR DELETE TO anon, authenticated USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff());',
            creator_tbl
        );
    END LOOP;
END $$;

-- Strict Zero-Sync Tier 1-4 Protection: hide Tier 1-4 Artifact & Version metadata from anon/Citizens/Masons/Architects
CREATE POLICY "spoke_mods_select" ON public.mods
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR COALESCE(compliance_tier, 0) NOT BETWEEN 1 AND 4
        OR sanctuary_internal.is_spoke_oversight_or_wayfinder()
    );

CREATE POLICY "spoke_mod_versions_select" ON public.mod_versions
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR sanctuary_internal.is_mod_publicly_syncable(mod_id)
        OR sanctuary_internal.is_spoke_oversight_or_wayfinder()
    );

-- Spoke Staff Governance Tables (Public Read, Staff/Gateway Write)
DO $$
DECLARE
    staff_tbl TEXT;
BEGIN
    FOREACH staff_tbl IN ARRAY ARRAY[
        'dlc_registry',
        'flavor_group_members',
        'flavor_groups',
        'game_versions',
        'global_network_status',
        'global_security',
        'hardware_bans',
        'heuristic_signatures',
        'known_exception_rules',
        'sanctuary_lexicons',
        'sanctuary_schemas',
        'sanctuary_support_categories',
        'sanctuary_telemetry_sources',
        'sanctuary_themes',
        'system_broadcasts',
        'system_directives',
        'taxonomy',
        'tracked_template_files'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_select" ON public.%1$I;', staff_tbl);
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_insert" ON public.%1$I;', staff_tbl);
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_update" ON public.%1$I;', staff_tbl);
        EXECUTE format('DROP POLICY IF EXISTS "spoke_%1$s_delete" ON public.%1$I;', staff_tbl);
        EXECUTE format(
            'CREATE POLICY "spoke_%1$s_select" ON public.%1$I FOR SELECT TO public USING (true);',
            staff_tbl
        );
        EXECUTE format(
            'CREATE POLICY "spoke_%1$s_insert" ON public.%1$I FOR INSERT TO anon, authenticated WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());',
            staff_tbl
        );
        EXECUTE format(
            'CREATE POLICY "spoke_%1$s_update" ON public.%1$I FOR UPDATE TO anon, authenticated USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff()) WITH CHECK ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());',
            staff_tbl
        );
        EXECUTE format(
            'CREATE POLICY "spoke_%1$s_delete" ON public.%1$I FOR DELETE TO anon, authenticated USING ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_spoke_staff());',
            staff_tbl
        );
    END LOOP;
END $$;

-- ============================================================================
-- STORAGE BUCKET HARDENING: Theme Wallpapers & Thumbnails ('backgrounds')
-- 512 KB cap, raster formats only, public CDN read, Verified Creator/Staff/Gateway writes
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('backgrounds', 'backgrounds', true, 524288, ARRAY['image/webp', 'image/png', 'image/jpeg'])
        ON CONFLICT (id) DO UPDATE
        SET public = true,
            file_size_limit = 524288,
            allowed_mime_types = ARRAY['image/webp', 'image/png', 'image/jpeg'];

        EXECUTE 'DROP POLICY IF EXISTS "Backgrounds are publicly accessible." ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "Anyone can upload backgrounds." ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "Users can update their own backgrounds." ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own backgrounds." ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_select" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_insert" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_update" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_delete" ON storage.objects';

        EXECUTE 'CREATE POLICY "spoke_backgrounds_select" ON storage.objects FOR SELECT TO public USING (bucket_id = ''backgrounds'')';
        EXECUTE 'CREATE POLICY "spoke_backgrounds_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
        EXECUTE 'CREATE POLICY "spoke_backgrounds_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff())) WITH CHECK (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
        EXECUTE 'CREATE POLICY "spoke_backgrounds_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
    END IF;
END $$;

SELECT
    'Sanctuary OS Spoke Schema V0.6.0-Dev.13 Initialized Successfully' AS status,
    CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM sanctuary_internal.spoke_gateway_tokens
            WHERE is_active = true
              AND (expires_at IS NULL OR expires_at > NOW())
        ) THEN (public.mint_spoke_gateway_token('Initial Spoke Bootstrap', 0))->>'token'
        ELSE '[ACTIVE TOKEN ALREADY EXISTS - RUN SELECT public.mint_spoke_gateway_token() IF NEEDED]'
    END AS initial_spoke_gateway_token;

-- Idempotent Taxonomy Backfill & Schema Stripping (Moves mod_categories -> public.taxonomy)
DO $$
DECLARE
    schema_row RECORD;
    cat_elem JSONB;
    cat_idx INT;
    cat_id TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.taxonomy LIMIT 1) THEN
        FOR schema_row IN
            SELECT id, schema_data
            FROM public.sanctuary_schemas
            WHERE jsonb_typeof(schema_data->'mod_categories') = 'array'
               OR jsonb_typeof(schema_data->'taxonomy'->'categories') = 'array'
        LOOP
            cat_idx := 0;
            FOR cat_elem IN
                SELECT value FROM jsonb_array_elements(
                    COALESCE(
                        CASE WHEN jsonb_typeof(schema_row.schema_data->'mod_categories') = 'array'
                             THEN schema_row.schema_data->'mod_categories'
                             ELSE NULL END,
                        schema_row.schema_data->'taxonomy'->'categories',
                        '[]'::jsonb
                    )
                )
            LOOP
                cat_id := NULLIF(BTRIM(COALESCE(cat_elem->>'id', cat_elem->>'category', cat_elem->>'label', '')), '');
                IF cat_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM public.taxonomy WHERE LOWER(category) = LOWER(cat_id)
                ) THEN
                    INSERT INTO public.taxonomy (category, type, taxonomy_attributes)
                    VALUES (
                        cat_id,
                        NULLIF(BTRIM(COALESCE(cat_elem->>'label', cat_id)), ''),
                        jsonb_build_object(
                            'sort_order', COALESCE((cat_elem->>'sort_order')::int, cat_idx),
                            'icon', COALESCE(NULLIF(cat_elem->>'icon', ''), 'category'),
                            'icon_key', NULLIF(cat_elem->>'icon_key', ''),
                            'lexicon_key', NULLIF(cat_elem->>'lexicon_key', ''),
                            'subcategories', COALESCE(cat_elem->'subcategories', '[]'::jsonb)
                        )
                    );
                END IF;
                cat_idx := cat_idx + 1;
            END LOOP;
        END LOOP;
    END IF;

    UPDATE public.sanctuary_schemas
    SET schema_data = (schema_data - 'mod_categories' - 'taxonomy')
    WHERE schema_data ? 'mod_categories' OR schema_data ? 'taxonomy';
END $$;

-- Anonymous Post View Counter (Zero User ID Tracking)
ALTER TABLE IF EXISTS public.mason_posts
    ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF to_regclass('public.mason_posts') IS NOT NULL AND to_regclass('public.mason_post_views') IS NOT NULL THEN
        UPDATE public.mason_posts mp
        SET view_count = GREATEST(
            COALESCE(mp.view_count, 0),
            COALESCE((SELECT COUNT(*) FROM public.mason_post_views v WHERE v.post_id = mp.id), 0)
        );
        TRUNCATE TABLE public.mason_post_views;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.increment_mason_post_view(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.mason_posts
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_mason_post_view(UUID) TO anon, authenticated;

-- Zero-Identity Content Reports, Scout Suggestions & Anonymous Tickets
DO $$
BEGIN
    IF to_regclass('public.content_flags') IS NOT NULL THEN
        ALTER TABLE public.content_flags ALTER COLUMN reporter_id DROP NOT NULL;
    END IF;
    IF to_regclass('public.sanctuary_tickets') IS NOT NULL THEN
        ALTER TABLE public.sanctuary_tickets ALTER COLUMN author_id DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scout_suggestions' AND column_name = 'submitter_id'
    ) THEN
        ALTER TABLE public.scout_suggestions ALTER COLUMN submitter_id DROP NOT NULL;
    END IF;
END $$;

DROP POLICY IF EXISTS "spoke_content_flags_insert" ON public.content_flags;
CREATE POLICY "spoke_content_flags_insert" ON public.content_flags
    FOR INSERT
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR ((SELECT auth.uid()) IS NOT NULL AND (reporter_id IS NULL OR reporter_id = (SELECT auth.uid())))
    );

DROP POLICY IF EXISTS "spoke_sanctuary_tickets_insert" ON public.sanctuary_tickets;
CREATE POLICY "spoke_sanctuary_tickets_insert" ON public.sanctuary_tickets
    FOR INSERT
    WITH CHECK (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR ((SELECT auth.uid()) IS NOT NULL AND (author_id IS NULL OR author_id = (SELECT auth.uid())))
    );

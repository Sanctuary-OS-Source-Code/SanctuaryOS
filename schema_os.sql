-- ============================================================================
-- SANCTUARY OS: CORE HUB DATABASE SCHEMA (V0.6.0-Dev.13)
-- ============================================================================
-- This schema defines the central Sanctuary OS Hub database ("Keepers Core").
-- It governs global Citizen authentication, Master Game Schemas, Chameleon
-- Themes, Global Lexicons, Core Heuristics, Keeper Support, and Spoke Uplinks.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PRIVATE INTERNAL SCHEMA & RUNTIME SECRETS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS sanctuary_internal;
REVOKE ALL ON SCHEMA sanctuary_internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA sanctuary_internal TO authenticated, service_role;

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
            USING v_existing_vault_id, v_clean, v_secret_name, 'Sanctuary OS runtime secret';
            v_new_vault_id := v_existing_vault_id;
        ELSE
            EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
            INTO v_new_vault_id
            USING v_clean, v_secret_name, 'Sanctuary OS runtime secret';
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

-- ============================================================================
-- 2. IDEMPOTENT UPGRADE NOTICE (NON-DESTRUCTIVE COPY & PASTE)
-- ============================================================================
-- All tables below use CREATE TABLE IF NOT EXISTS and additive ALTER TABLE ...
-- ADD COLUMN IF NOT EXISTS blocks so this script can be safely pasted and
-- re-run inside the Supabase SQL Editor on existing databases without data loss.

-- ============================================================================
-- 3. CORE IDENTITY, DONATION LEDGERS & SPOKE REGISTRY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    email TEXT,
    role TEXT DEFAULT 'citizen',
    is_banned BOOLEAN DEFAULT false,
    blacklist_reason TEXT,
    dev_build_until TIMESTAMP WITH TIME ZONE,
    donation_credit_cents INTEGER DEFAULT 0,
    total_months_unlocked INTEGER DEFAULT 0,
    last_donation_at TIMESTAMP WITH TIME ZONE,
    web_dev_channel_enabled BOOLEAN NOT NULL DEFAULT false,
    dmca_strike_count SMALLINT NOT NULL DEFAULT 0,
    cloud_publishing_revoked BOOLEAN NOT NULL DEFAULT false,
    cloud_publishing_revoked_reason TEXT,
    dmca_strike_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.donation_event_nonces (
    tx_hash TEXT PRIMARY KEY,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.monthly_donation_ledgers (
    month_key TEXT NOT NULL,
    target_id TEXT NOT NULL,
    covered_cents BIGINT NOT NULL DEFAULT 0,
    stripe_fees_cents BIGINT NOT NULL DEFAULT 0,
    net_received_cents BIGINT NOT NULL DEFAULT 0,
    tx_nonces JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month_key, target_id)
);

CREATE TABLE IF NOT EXISTS public.user_encrypted_keyrings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    staging_secret_v2 TEXT NOT NULL CHECK (length(staging_secret_v2) BETWEEN 32 AND 4096),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

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

REVOKE ALL ON FUNCTION sanctuary_internal.current_staging_owner_tag() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sanctuary_internal.current_staging_owner_tag() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION sanctuary_internal.stamp_staging_owner_tag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NOT NULL THEN
        NEW.owner_tag := sanctuary_internal.current_staging_owner_tag();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.sanctuary_schemas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schema_data JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.sanctuary_lexicons (
    id TEXT PRIMARY KEY,
    name TEXT,
    badge TEXT,
    version INTEGER DEFAULT 1,
    lexicon_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sanctuary_themes (
    id TEXT PRIMARY KEY,
    name TEXT,
    version INTEGER DEFAULT 1,
    theme_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sanctuary_theme_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    theme_id TEXT REFERENCES public.sanctuary_themes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_data TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Registered Community Spoke Databases (Public Connection Metadata Only)
CREATE TABLE IF NOT EXISTS public.sanctuary_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    schema_id TEXT NOT NULL,
    supabase_url TEXT NOT NULL,
    supabase_anon_key TEXT NOT NULL,
    icon TEXT,
    donation_url TEXT,
    payment_processor TEXT DEFAULT 'custom',
    is_active BOOLEAN DEFAULT true,
    is_keepers_only BOOLEAN NOT NULL DEFAULT false,
    spoke_schema_version INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.sanctuary_games
    ADD COLUMN IF NOT EXISTS spoke_schema_version INTEGER NOT NULL DEFAULT 2;

-- Envelope-Encrypted & Vault-Sealed Spoke Credentials (Split-Custody, service_role only)
DROP TABLE IF EXISTS public.sanctuary_game_secrets CASCADE;

CREATE TABLE IF NOT EXISTS sanctuary_internal.spoke_credentials (
    game_id UUID PRIMARY KEY REFERENCES public.sanctuary_games(id) ON DELETE CASCADE,
    envelope_ciphertext TEXT NOT NULL DEFAULT 'vault_sealed',
    vault_secret_id UUID,
    key_version TEXT NOT NULL DEFAULT 'v1:master',
    credential_kind TEXT NOT NULL DEFAULT 'spoke_gateway',
    key_fingerprint TEXT NOT NULL DEFAULT '',
    rotated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE sanctuary_internal.spoke_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sanctuary_internal.spoke_credentials TO service_role;
ALTER TABLE sanctuary_internal.spoke_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_spoke_credentials" ON sanctuary_internal.spoke_credentials;
CREATE POLICY "service_role_spoke_credentials" ON sanctuary_internal.spoke_credentials
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION sanctuary_internal.cleanup_spoke_credential_vault()
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

DROP TRIGGER IF EXISTS trg_cleanup_spoke_credential_vault ON sanctuary_internal.spoke_credentials;
CREATE TRIGGER trg_cleanup_spoke_credential_vault
    AFTER DELETE ON sanctuary_internal.spoke_credentials
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.cleanup_spoke_credential_vault();

-- ============================================================================
-- 4. GLOBAL SECURITY, CORE HEURISTICS & IMMUTABLE AUDIT TRAIL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hardware_bans (
    hwid_hash TEXT PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.keeper_heuristic_signatures (
    id TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    match_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'malware',
    source TEXT NOT NULL DEFAULT 'keepers_core',
    enabled BOOLEAN DEFAULT true,
    created_by TEXT DEFAULT 'Keepers Core',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT,
    target_table TEXT,
    target_name TEXT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    game_name TEXT,
    changes JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 5. KEEPERS CORE SUPPORT, DISPATCHES, POLLS, DIRECTIVES & PUSH
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.keeper_support_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_code TEXT NOT NULL UNIQUE,
    category_name TEXT NOT NULL,
    description TEXT,
    ticket_destination TEXT DEFAULT 'keepers',
    support_domain TEXT NOT NULL DEFAULT 'platform',
    escalation_path TEXT DEFAULT 'standard',
    is_active BOOLEAN DEFAULT true,
    custom_fields JSONB DEFAULT '[]'::jsonb,
    requires_target_mod BOOLEAN DEFAULT false,
    requires_target_user BOOLEAN DEFAULT false,
    show_title_box BOOLEAN DEFAULT true,
    show_description_box BOOLEAN DEFAULT true,
    show_logs_box BOOLEAN DEFAULT false,
    attach_blueprints BOOLEAN DEFAULT false,
    telemetry_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.keeper_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ticket_type TEXT,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'NEW',
    target_mod_id UUID,
    target_blueprint_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.keeper_email_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.keeper_tickets(id) ON DELETE SET NULL,
    thread_id UUID,
    direction TEXT NOT NULL DEFAULT 'outbound',
    in_reply_to TEXT,
    recipient_hash TEXT,
    sealed_envelope TEXT,
    sender_user_id UUID,
    from_name TEXT NOT NULL DEFAULT 'Sanctuary OS',
    from_email TEXT NOT NULL DEFAULT 'support@sanctuaryos.net',
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

CREATE TABLE IF NOT EXISTS public.dmca_compliance_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.keeper_tickets(id) ON DELETE SET NULL,
    notice_type TEXT NOT NULL,
    target_scope TEXT NOT NULL,
    target_spoke_id UUID REFERENCES public.sanctuary_games(id) ON DELETE SET NULL,
    spoke_ticket_id UUID,
    target_identifiers TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    work_description TEXT,
    work_url TEXT,
    claimant_name_masked TEXT,
    reply_email_masked TEXT,
    sealed_legal_contact TEXT NOT NULL,
    good_faith_attested BOOLEAN NOT NULL DEFAULT false,
    perjury_authority_attested BOOLEAN NOT NULL DEFAULT false,
    jurisdiction_attested BOOLEAN NOT NULL DEFAULT false,
    forwarding_acknowledged BOOLEAN NOT NULL DEFAULT false,
    electronic_signature TEXT NOT NULL,
    submitter_user_id UUID,
    affected_user_id UUID,
    relay_status TEXT NOT NULL DEFAULT 'OPEN',
    sla_deadline_at TIMESTAMPTZ,
    counter_window_ends_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.keeper_system_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    message TEXT NOT NULL,
    category TEXT DEFAULT 'Information',
    target_audience TEXT DEFAULT 'All',
    action_required TEXT DEFAULT 'No Action Required',
    poll_data JSONB,
    code_snippet TEXT,
    is_pinned TEXT DEFAULT 'false',
    is_active BOOLEAN DEFAULT true,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    published_title TEXT,
    published_description TEXT,
    published_message TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by TEXT DEFAULT 'Keepers Core',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_keeper_broadcasts_singleton_category
ON public.keeper_system_broadcasts (category)
WHERE category IN (
    'EULA', 'Privacy', 'Terms', 'PartnersAgreement', 'ComplianceProtocol',
    'ReleasePost_Public', 'ReleasePost_Dev', 'ReleaseChangelog_Public', 'ReleaseChangelog_Dev'
);

CREATE TABLE IF NOT EXISTS public.keeper_dispatch_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.keeper_system_broadcasts(id) ON DELETE CASCADE,
    poll_id TEXT NOT NULL DEFAULT 'default',
    option_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (broadcast_id, poll_id, option_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.system_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    title TEXT,
    description TEXT,
    message TEXT,
    category TEXT DEFAULT 'Information',
    is_active BOOLEAN DEFAULT true,
    target_audience TEXT DEFAULT 'All',
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
    revision INTEGER NOT NULL DEFAULT 1,
    published_content TEXT,
    published_title TEXT,
    published_summary TEXT,
    published_at TIMESTAMP WITH TIME ZONE
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

-- ============================================================================
-- 5B. IDEMPOTENT COLUMN UPGRADES FOR EXISTING HUB DATABASES
-- ============================================================================
ALTER TABLE IF EXISTS public.keeper_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE IF EXISTS public.keeper_tickets ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.keeper_support_categories ADD COLUMN IF NOT EXISTS telemetry_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.keeper_support_categories ADD COLUMN IF NOT EXISTS support_domain TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE IF EXISTS public.system_broadcasts ADD COLUMN IF NOT EXISTS has_pending_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.keeper_email_dispatches
    ADD COLUMN IF NOT EXISTS thread_id UUID,
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound',
    ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
    ADD COLUMN IF NOT EXISTS recipient_hash TEXT,
    ADD COLUMN IF NOT EXISTS sealed_envelope TEXT;
ALTER TABLE IF EXISTS public.profiles
    ADD COLUMN IF NOT EXISTS dmca_strike_count SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cloud_publishing_revoked BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cloud_publishing_revoked_reason TEXT,
    ADD COLUMN IF NOT EXISTS dmca_strike_log JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_keeper_email_dispatches_thread_id ON public.keeper_email_dispatches(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_keeper_email_dispatches_recipient_hash ON public.keeper_email_dispatches(recipient_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dmca_compliance_notices_spoke_status ON public.dmca_compliance_notices(target_spoke_id, relay_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_dmca_compliance_notices_ticket ON public.dmca_compliance_notices(ticket_id);

-- ============================================================================
-- 6. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_hub_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_os_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_audit_logs_game_created ON public.audit_logs(game_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_audit_logs_target_table_created ON public.audit_logs(target_table, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_theme_images_theme_id ON public.sanctuary_theme_images(theme_id);
CREATE INDEX IF NOT EXISTS idx_hub_keeper_tickets_author_id ON public.keeper_tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_hub_keeper_broadcasts_author_id ON public.keeper_system_broadcasts(author_id);

CREATE INDEX IF NOT EXISTS idx_keeper_email_dispatches_ticket_id ON public.keeper_email_dispatches(ticket_id);
CREATE INDEX IF NOT EXISTS idx_keeper_email_dispatches_created_at ON public.keeper_email_dispatches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_citizen_staging_queue_user_token ON public.citizen_staging_queue(user_token);
CREATE INDEX IF NOT EXISTS idx_citizen_staging_queue_expires_at ON public.citizen_staging_queue(expires_at);

CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_user_id ON public.pwa_push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_companion_token ON public.pwa_push_subscriptions(companion_token);
CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_handshake_token ON public.pwa_push_subscriptions(handshake_token);
CREATE INDEX IF NOT EXISTS idx_pwa_push_subs_staging_token ON public.pwa_push_subscriptions(staging_token);

-- ============================================================================
-- 7. INTERNAL ROLE HELPERS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION sanctuary_internal.hub_user_role()
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

CREATE OR REPLACE FUNCTION sanctuary_internal.is_hub_keeper()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT sanctuary_internal.hub_user_role() = 'keeper';
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.is_hub_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT sanctuary_internal.hub_user_role() IN ('keeper', 'core_dev', 'admin');
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.hub_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sanctuary_internal.is_hub_keeper() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sanctuary_internal.is_hub_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sanctuary_internal.hub_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_hub_keeper() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sanctuary_internal.is_hub_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION sanctuary_internal.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email, role)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'username',
        NEW.email,
        'citizen'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.cleanup_expired_staging_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF pg_try_advisory_xact_lock(hashtext('sanctuary_staging_queue_gc')) THEN
        DELETE FROM public.citizen_staging_queue
        WHERE id IN (
            SELECT id
            FROM public.citizen_staging_queue
            WHERE expires_at < NOW()
            ORDER BY expires_at ASC
            LIMIT 250
            FOR UPDATE SKIP LOCKED
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sanctuary_internal.protect_profile_supporter_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
       AND COALESCE(current_setting('sanctuary.internal_rpc', true), '') IS DISTINCT FROM 'true'
       AND session_user NOT IN ('postgres', 'supabase_admin')
       AND NOT sanctuary_internal.is_hub_keeper()
    THEN
        IF TG_OP = 'INSERT' THEN
            NEW.role := 'citizen';
            NEW.is_banned := false;
            NEW.blacklist_reason := NULL;
            NEW.dev_build_until := NULL;
            NEW.donation_credit_cents := 0;
            NEW.total_months_unlocked := 0;
            NEW.last_donation_at := NULL;
        ELSE
            NEW.role := OLD.role;
            IF OLD.is_banned = true OR NEW.is_banned IS DISTINCT FROM true THEN
                NEW.is_banned := OLD.is_banned;
                NEW.blacklist_reason := OLD.blacklist_reason;
            END IF;
            NEW.dev_build_until := OLD.dev_build_until;
            NEW.donation_credit_cents := OLD.donation_credit_cents;
            NEW.total_months_unlocked := OLD.total_months_unlocked;
            NEW.last_donation_at := OLD.last_donation_at;
        END IF;
    END IF;
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

CREATE OR REPLACE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_keeper_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_endpoint TEXT;
    v_secret TEXT;
BEGIN
    IF COALESCE(NEW.category, '') IN ('PipelineConfig', 'MonthlyDonationLedger', 'CoreTitleAreaConfig') THEN
        RETURN NEW;
    END IF;

    IF NEW.is_active IS DISTINCT FROM false
       AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
        v_endpoint := sanctuary_internal.read_runtime_secret('pwa_push_endpoint');
        v_secret := sanctuary_internal.read_runtime_secret('pwa_push_secret');
        IF COALESCE(v_endpoint, '') <> '' THEN
            EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
            USING
                v_endpoint,
                jsonb_build_object('Content-Type', 'application/json', 'x-internal-push-secret', COALESCE(v_secret, '')),
                jsonb_build_object(
                    'type', 'broadcast',
                    'spoke_id', 'global',
                    'broadcast_type', COALESCE(NEW.category, 'system_dispatch'),
                    'title', COALESCE(NEW.title, 'Sanctuary OS Dispatch'),
                    'body', COALESCE(NEW.message, ''),
                    'unique_id', 'hub_bc_' || NEW.id::text
                );
        END IF;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.cleanup_expired_staging_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.protect_profile_supporter_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.trigger_pwa_web_push_on_staging() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sanctuary_internal.trigger_pwa_web_push_on_keeper_broadcast() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.handle_new_user();

DROP TRIGGER IF EXISTS ensure_profile_supporter_integrity ON public.profiles;
CREATE TRIGGER ensure_profile_supporter_integrity
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.protect_profile_supporter_fields();

DROP TRIGGER IF EXISTS trg_cleanup_expired_staging_queue ON public.citizen_staging_queue;
CREATE TRIGGER trg_cleanup_expired_staging_queue
    AFTER INSERT ON public.citizen_staging_queue
    FOR EACH STATEMENT EXECUTE FUNCTION sanctuary_internal.cleanup_expired_staging_queue();

DROP TRIGGER IF EXISTS trg_pwa_web_push_staging ON public.citizen_staging_queue;
CREATE TRIGGER trg_pwa_web_push_staging
    AFTER INSERT ON public.citizen_staging_queue
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_staging();

DROP TRIGGER IF EXISTS trg_pwa_web_push_keeper_broadcast ON public.keeper_system_broadcasts;
CREATE TRIGGER trg_pwa_web_push_keeper_broadcast
    AFTER INSERT ON public.keeper_system_broadcasts
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_keeper_broadcast();

CREATE OR REPLACE FUNCTION public.prevent_audit_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND COALESCE(current_setting('sanctuary.allow_audit_prune', true), '') = 'true' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Audit logs are append-only. Modification or deletion is strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS ensure_os_audit_log_immutability ON public.audit_logs;
CREATE TRIGGER ensure_os_audit_log_immutability
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modifications();

-- ============================================================================
-- 8. AUDIT RETENTION, DONATION LEDGER & RUNTIME SECRET RPCs
-- ============================================================================

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
       AND NOT sanctuary_internal.is_hub_keeper()
    THEN
        RAISE EXCEPTION 'Unauthorized: Only Keepers may prune archived Core OS audit logs.';
    END IF;

    PERFORM set_config('sanctuary.allow_audit_prune', 'true', true);

    DELETE FROM public.audit_logs
    WHERE created_at < (NOW() - make_interval(days => p_retention_days));

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO public.audit_logs (action, target_table, target_name, actor_id, reason, game_name)
    VALUES (
        'Pruned Archived Audit Logs',
        'audit_logs',
        p_retention_days || 'd Retention Policy',
        v_uid,
        'Executed rolling retention prune (' || v_deleted || ' entries older than ' || p_retention_days || ' days removed)',
        'Core OS'
    );

    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_old_audit_logs(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_old_audit_logs(INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_partner_donation_event(
    p_user_id UUID,
    p_amount_cents INTEGER,
    p_tx_nonce TEXT,
    p_base_until TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx_hash TEXT;
    v_cur_until TIMESTAMP WITH TIME ZONE;
    v_cur_credit INTEGER;
    v_cur_months INTEGER;
    v_combined_cents INTEGER;
    v_months_added INTEGER;
    v_new_credit INTEGER;
    v_new_until TIMESTAMP WITH TIME ZONE;
    v_new_months INTEGER;
    v_effective_base TIMESTAMP WITH TIME ZONE;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'Invalid donation amount.';
    END IF;

    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin')
       AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'keeper')
    THEN
        RAISE EXCEPTION 'Unauthorized: Only verified payment webhooks or Keepers may credit partner donation events.';
    END IF;

    v_tx_hash := encode(sha256(convert_to(COALESCE(p_tx_nonce, gen_random_uuid()::text), 'UTF8')), 'hex');

    SELECT dev_build_until, COALESCE(donation_credit_cents, 0), COALESCE(total_months_unlocked, 0)
    INTO v_cur_until, v_cur_credit, v_cur_months
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF EXISTS (SELECT 1 FROM public.donation_event_nonces WHERE tx_hash = v_tx_hash) THEN
        RETURN jsonb_build_object(
            'already_redeemed', true,
            'dev_build_until', v_cur_until,
            'months_added', 0,
            'donation_credit_cents', v_cur_credit,
            'total_months_unlocked', v_cur_months
        );
    END IF;

    INSERT INTO public.donation_event_nonces (tx_hash, processed_at)
    VALUES (v_tx_hash, NOW());

    v_combined_cents := COALESCE(v_cur_credit, 0) + p_amount_cents;
    v_months_added := v_combined_cents / 500;
    v_new_credit := v_combined_cents % 500;

    v_effective_base := GREATEST(COALESCE(v_cur_until, NOW()), COALESCE(p_base_until, NOW()), NOW());

    IF v_months_added > 0 THEN
        v_new_until := v_effective_base + (v_months_added * INTERVAL '30 days');
        v_new_months := COALESCE(v_cur_months, 0) + v_months_added;
    ELSE
        v_new_until := COALESCE(v_cur_until, p_base_until);
        v_new_months := COALESCE(v_cur_months, 0);
    END IF;

    PERFORM set_config('sanctuary.internal_rpc', 'true', true);

    UPDATE public.profiles
    SET dev_build_until = v_new_until,
        donation_credit_cents = v_new_credit,
        total_months_unlocked = v_new_months,
        last_donation_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'already_redeemed', false,
        'dev_build_until', v_new_until,
        'months_added', v_months_added,
        'donation_credit_cents', v_new_credit,
        'total_months_unlocked', v_new_months
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_partner_donation_event(UUID, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_partner_donation_event(UUID, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE) TO service_role;

CREATE OR REPLACE FUNCTION public.record_monthly_donation_ledger(
    p_month_key TEXT,
    p_target_id TEXT,
    p_amount_cents INTEGER,
    p_fee_cents INTEGER,
    p_tx_nonce TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_norm_month TEXT := btrim(COALESCE(p_month_key, ''));
    v_norm_target TEXT := lower(regexp_replace(COALESCE(p_target_id, 'keepers_core'), '[^a-zA-Z0-9_-]', '', 'g'));
    v_row public.monthly_donation_ledgers%ROWTYPE;
    v_nonces JSONB;
    v_next_cents BIGINT;
    v_next_fees BIGINT;
    v_next_net BIGINT;
    v_ledger_title TEXT;
    v_payload TEXT;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    IF v_norm_target = '' THEN
        v_norm_target := 'keepers_core';
    END IF;
    IF v_norm_month = '' OR p_amount_cents <= 0 OR COALESCE(btrim(p_tx_nonce), '') = '' THEN
        RAISE EXCEPTION 'Invalid ledger parameters';
    END IF;

    INSERT INTO public.monthly_donation_ledgers (month_key, target_id)
    VALUES (v_norm_month, v_norm_target)
    ON CONFLICT (month_key, target_id) DO NOTHING;

    SELECT * INTO v_row
    FROM public.monthly_donation_ledgers
    WHERE month_key = v_norm_month AND target_id = v_norm_target
    FOR UPDATE;

    v_nonces := COALESCE(v_row.tx_nonces, '[]'::jsonb);
    IF v_nonces ? p_tx_nonce THEN
        RETURN jsonb_build_object(
            'already_recorded', true,
            'month_key', v_norm_month,
            'target_id', v_norm_target,
            'covered_cents', v_row.covered_cents,
            'stripe_fees_cents', v_row.stripe_fees_cents,
            'net_received_cents', v_row.net_received_cents
        );
    END IF;

    IF jsonb_array_length(v_nonces) >= 200 THEN
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO v_nonces
        FROM (
            SELECT elem
            FROM jsonb_array_elements(v_nonces) WITH ORDINALITY AS t(elem, ord)
            WHERE ord > (jsonb_array_length(v_nonces) - 199)
            ORDER BY ord
        ) sub;
    END IF;
    v_nonces := v_nonces || to_jsonb(p_tx_nonce);

    v_next_cents := GREATEST(0, v_row.covered_cents) + GREATEST(0, p_amount_cents);
    v_next_fees := GREATEST(0, v_row.stripe_fees_cents) + GREATEST(0, COALESCE(p_fee_cents, 0));
    v_next_net := GREATEST(0, v_next_cents - v_next_fees);

    UPDATE public.monthly_donation_ledgers
    SET covered_cents = v_next_cents,
        stripe_fees_cents = v_next_fees,
        net_received_cents = v_next_net,
        tx_nonces = v_nonces,
        updated_at = NOW()
    WHERE month_key = v_norm_month AND target_id = v_norm_target;

    v_ledger_title := 'LEDGER_' || v_norm_month || '_' || upper(v_norm_target);
    v_payload := jsonb_build_object(
        'month_key', v_norm_month,
        'target_id', v_norm_target,
        'covered_cents', v_next_cents,
        'stripe_fees_cents', v_next_fees,
        'net_received_cents', v_next_net,
        'updated_at', NOW()
    )::text;

    UPDATE public.keeper_system_broadcasts
    SET description = v_payload,
        message = v_payload,
        target_audience = 'Internal_Pipeline',
        is_active = true
    WHERE category = 'MonthlyDonationLedger' AND title = v_ledger_title;

    IF NOT FOUND THEN
        INSERT INTO public.keeper_system_broadcasts (
            title, category, description, message, target_audience, is_active, is_pinned
        ) VALUES (
            v_ledger_title, 'MonthlyDonationLedger', v_payload, v_payload, 'Internal_Pipeline', true, 'false'
        );
    END IF;

    RETURN jsonb_build_object(
        'already_recorded', false,
        'month_key', v_norm_month,
        'target_id', v_norm_target,
        'covered_cents', v_next_cents,
        'stripe_fees_cents', v_next_fees,
        'net_received_cents', v_next_net
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_monthly_donation_ledger(TEXT, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_monthly_donation_ledger(TEXT, TEXT, INTEGER, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.get_monthly_donation_summaries(p_month_key TEXT)
RETURNS TABLE(
    month_key TEXT,
    target_id TEXT,
    covered_cents BIGINT,
    stripe_fees_cents BIGINT,
    net_received_cents BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT l.month_key,
           l.target_id,
           l.covered_cents,
           l.stripe_fees_cents,
           l.net_received_cents,
           l.updated_at
    FROM public.monthly_donation_ledgers l
    WHERE l.month_key = btrim(COALESCE(p_month_key, ''))
    ORDER BY l.target_id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_donation_summaries(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_donation_summaries(TEXT) TO anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.internal_upsert_spoke_credential(
    p_game_id UUID,
    p_envelope_ciphertext TEXT,
    p_key_version TEXT DEFAULT 'v1:master',
    p_credential_kind TEXT DEFAULT 'spoke_gateway',
    p_key_fingerprint TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_clean_env TEXT := btrim(COALESCE(p_envelope_ciphertext, ''));
    v_existing_vault_id UUID;
    v_new_vault_id UUID;
    v_secret_name TEXT := 'sanctuary_spoke:' || p_game_id::text;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    IF left(v_clean_env, 7) <> 'enc:v1:' THEN
        RAISE EXCEPTION 'Spoke credential must be sealed in an enc:v1 envelope before DB storage';
    END IF;

    SELECT vault_secret_id INTO v_existing_vault_id
    FROM sanctuary_internal.spoke_credentials
    WHERE game_id = p_game_id;

    IF to_regnamespace('vault') IS NOT NULL THEN
        IF v_existing_vault_id IS NULL THEN
            EXECUTE 'SELECT id FROM vault.secrets WHERE name = $1 LIMIT 1'
            INTO v_existing_vault_id
            USING v_secret_name;
        END IF;

        IF v_existing_vault_id IS NOT NULL THEN
            EXECUTE 'SELECT vault.update_secret($1, $2, $3, $4)'
            USING v_existing_vault_id, v_clean_env, v_secret_name, 'Sanctuary OS Split-Custody Spoke Credential';
            v_new_vault_id := v_existing_vault_id;
        ELSE
            EXECUTE 'SELECT vault.create_secret($1, $2, $3)'
            INTO v_new_vault_id
            USING v_clean_env, v_secret_name, 'Sanctuary OS Split-Custody Spoke Credential';
        END IF;

        INSERT INTO sanctuary_internal.spoke_credentials (
            game_id, envelope_ciphertext, vault_secret_id, key_version, credential_kind, key_fingerprint, rotated_at, updated_at
        )
        VALUES (
            p_game_id,
            'vault_sealed',
            v_new_vault_id,
            COALESCE(NULLIF(btrim(p_key_version), ''), 'v1:master'),
            COALESCE(NULLIF(btrim(p_credential_kind), ''), 'spoke_gateway'),
            COALESCE(btrim(p_key_fingerprint), ''),
            NOW(),
            NOW()
        )
        ON CONFLICT (game_id) DO UPDATE
        SET envelope_ciphertext = 'vault_sealed',
            vault_secret_id = EXCLUDED.vault_secret_id,
            key_version = EXCLUDED.key_version,
            credential_kind = EXCLUDED.credential_kind,
            key_fingerprint = EXCLUDED.key_fingerprint,
            rotated_at = NOW(),
            updated_at = NOW();
    ELSE
        INSERT INTO sanctuary_internal.spoke_credentials (
            game_id, envelope_ciphertext, vault_secret_id, key_version, credential_kind, key_fingerprint, rotated_at, updated_at
        )
        VALUES (
            p_game_id,
            v_clean_env,
            NULL,
            COALESCE(NULLIF(btrim(p_key_version), ''), 'v1:master'),
            COALESCE(NULLIF(btrim(p_credential_kind), ''), 'spoke_gateway'),
            COALESCE(btrim(p_key_fingerprint), ''),
            NOW(),
            NOW()
        )
        ON CONFLICT (game_id) DO UPDATE
        SET envelope_ciphertext = EXCLUDED.envelope_ciphertext,
            vault_secret_id = NULL,
            key_version = EXCLUDED.key_version,
            credential_kind = EXCLUDED.credential_kind,
            key_fingerprint = EXCLUDED.key_fingerprint,
            rotated_at = NOW(),
            updated_at = NOW();
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_get_spoke_credential(p_game_id UUID)
RETURNS TABLE (
    envelope_ciphertext TEXT,
    key_version TEXT,
    credential_kind TEXT,
    key_fingerprint TEXT,
    rotated_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_rec RECORD;
    v_decrypted TEXT;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT sc.*
    INTO v_rec
    FROM sanctuary_internal.spoke_credentials sc
    WHERE sc.game_id = p_game_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_decrypted := v_rec.envelope_ciphertext;
    IF v_rec.vault_secret_id IS NOT NULL AND to_regnamespace('vault') IS NOT NULL THEN
        EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1'
        INTO v_decrypted
        USING v_rec.vault_secret_id;
    ELSIF v_decrypted = 'vault_sealed' THEN
        v_decrypted := NULL;
    END IF;

    IF COALESCE(v_decrypted, '') = '' THEN
        RETURN;
    END IF;

    envelope_ciphertext := v_decrypted;
    key_version := v_rec.key_version;
    credential_kind := v_rec.credential_kind;
    key_fingerprint := v_rec.key_fingerprint;
    rotated_at := v_rec.rotated_at;
    updated_at := v_rec.updated_at;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_list_spoke_credentials()
RETURNS TABLE (
    game_id UUID,
    envelope_ciphertext TEXT,
    key_version TEXT,
    credential_kind TEXT,
    key_fingerprint TEXT,
    rotated_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_rec RECORD;
    v_decrypted TEXT;
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    FOR v_rec IN
        SELECT sc.*
        FROM sanctuary_internal.spoke_credentials sc
        ORDER BY sc.game_id
    LOOP
        v_decrypted := v_rec.envelope_ciphertext;
        IF v_rec.vault_secret_id IS NOT NULL AND to_regnamespace('vault') IS NOT NULL THEN
            EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = $1'
            INTO v_decrypted
            USING v_rec.vault_secret_id;
        ELSIF v_decrypted = 'vault_sealed' THEN
            v_decrypted := NULL;
        END IF;

        IF COALESCE(v_decrypted, '') <> '' THEN
            game_id := v_rec.game_id;
            envelope_ciphertext := v_decrypted;
            key_version := v_rec.key_version;
            credential_kind := v_rec.credential_kind;
            key_fingerprint := v_rec.key_fingerprint;
            rotated_at := v_rec.rotated_at;
            updated_at := v_rec.updated_at;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_delete_spoke_credential(p_game_id UUID)
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

    DELETE FROM sanctuary_internal.spoke_credentials WHERE game_id = p_game_id;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_upsert_spoke_credential(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_get_spoke_credential(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_list_spoke_credentials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_delete_spoke_credential(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_upsert_spoke_credential(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_get_spoke_credential(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_list_spoke_credentials() TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_delete_spoke_credential(UUID) TO service_role;

-- ============================================================================
-- 9. INTERNAL WEBAUTHN SUBDOMAIN ORIGIN VERIFICATION HELPERS (SERVICE_ROLE ONLY)
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

-- ============================================================================
-- 10. WEB PUSH & ZERO-KNOWLEDGE CREDENTIAL RPCs
-- ============================================================================

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

        UPDATE public.profiles SET email = v_clean_email WHERE id = v_uid;
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
    IF length(v_clean_email) NOT BETWEEN 3 AND 254
       OR position('@' in v_clean_email) <= 1
       OR v_clean_blind NOT LIKE 'zk-%@blind.%'
       OR length(v_clean_blind) > 254 THEN
        RETURN jsonb_build_object('is_blinded_account', false);
    END IF;

    IF EXISTS (
        SELECT 1 FROM auth.users WHERE lower(email) = v_clean_blind
    ) THEN
        v_matched_blind := true;
    END IF;

    IF EXISTS (
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
    IF length(v_clean) NOT BETWEEN 2 AND 64 OR position('@' in v_clean) > 0 THEN
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

    IF v_resolved_email IS NOT NULL AND v_resolved_email LIKE 'zk-%@blind.%' THEN
        RETURN v_resolved_email;
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sanctuary_resolve_login_identifier(TEXT) TO anon, authenticated, service_role;

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES (CONSOLIDATED 1-PER-CMD, INITPLAN SAFE)
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_event_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_donation_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_encrypted_keyrings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuary_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuary_lexicons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuary_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuary_theme_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctuary_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keeper_heuristic_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keeper_support_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keeper_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keeper_email_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keeper_system_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keeper_dispatch_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citizen_staging_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pwa_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Profiles (Hub PII & donation balances locked to self or Hub Staff)
DROP POLICY IF EXISTS "hub_profiles_select" ON public.profiles;
CREATE POLICY "hub_profiles_select" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_profiles_insert" ON public.profiles;
CREATE POLICY "hub_profiles_insert" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = (SELECT auth.uid()) OR sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_profiles_update" ON public.profiles;
CREATE POLICY "hub_profiles_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()) OR sanctuary_internal.is_hub_keeper())
    WITH CHECK (id = (SELECT auth.uid()) OR sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_profiles_delete" ON public.profiles;
CREATE POLICY "hub_profiles_delete" ON public.profiles
    FOR DELETE TO authenticated
    USING (sanctuary_internal.is_hub_keeper());

-- Service-Role Vault Tables
DROP POLICY IF EXISTS "Service role manages donation nonces" ON public.donation_event_nonces;
CREATE POLICY "Service role manages donation nonces" ON public.donation_event_nonces
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Monthly Donation Ledgers & Private Encrypted Keyrings
DROP POLICY IF EXISTS "hub_monthly_donation_ledgers_select" ON public.monthly_donation_ledgers;
CREATE POLICY "hub_monthly_donation_ledgers_select" ON public.monthly_donation_ledgers
    FOR SELECT TO authenticated USING (sanctuary_internal.is_hub_staff());

DROP POLICY IF EXISTS "hub_user_encrypted_keyrings_select" ON public.user_encrypted_keyrings;
CREATE POLICY "hub_user_encrypted_keyrings_select" ON public.user_encrypted_keyrings
    FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "hub_user_encrypted_keyrings_insert" ON public.user_encrypted_keyrings;
CREATE POLICY "hub_user_encrypted_keyrings_insert" ON public.user_encrypted_keyrings
    FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "hub_user_encrypted_keyrings_update" ON public.user_encrypted_keyrings;
CREATE POLICY "hub_user_encrypted_keyrings_update" ON public.user_encrypted_keyrings
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "hub_user_encrypted_keyrings_delete" ON public.user_encrypted_keyrings;
CREATE POLICY "hub_user_encrypted_keyrings_delete" ON public.user_encrypted_keyrings
    FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "hub_monthly_donation_ledgers_insert" ON public.monthly_donation_ledgers;
CREATE POLICY "hub_monthly_donation_ledgers_insert" ON public.monthly_donation_ledgers
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_monthly_donation_ledgers_update" ON public.monthly_donation_ledgers;
CREATE POLICY "hub_monthly_donation_ledgers_update" ON public.monthly_donation_ledgers
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_keeper()) WITH CHECK (sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_monthly_donation_ledgers_delete" ON public.monthly_donation_ledgers;
CREATE POLICY "hub_monthly_donation_ledgers_delete" ON public.monthly_donation_ledgers
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_keeper());

-- Master Schemas, Lexicons, Themes & Theme Images
DROP POLICY IF EXISTS "hub_sanctuary_schemas_select" ON public.sanctuary_schemas;
CREATE POLICY "hub_sanctuary_schemas_select" ON public.sanctuary_schemas
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_sanctuary_schemas_insert" ON public.sanctuary_schemas;
CREATE POLICY "hub_sanctuary_schemas_insert" ON public.sanctuary_schemas
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_schemas_update" ON public.sanctuary_schemas;
CREATE POLICY "hub_sanctuary_schemas_update" ON public.sanctuary_schemas
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_schemas_delete" ON public.sanctuary_schemas;
CREATE POLICY "hub_sanctuary_schemas_delete" ON public.sanctuary_schemas
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

DROP POLICY IF EXISTS "hub_sanctuary_lexicons_select" ON public.sanctuary_lexicons;
CREATE POLICY "hub_sanctuary_lexicons_select" ON public.sanctuary_lexicons
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_sanctuary_lexicons_insert" ON public.sanctuary_lexicons;
CREATE POLICY "hub_sanctuary_lexicons_insert" ON public.sanctuary_lexicons
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_lexicons_update" ON public.sanctuary_lexicons;
CREATE POLICY "hub_sanctuary_lexicons_update" ON public.sanctuary_lexicons
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_lexicons_delete" ON public.sanctuary_lexicons;
CREATE POLICY "hub_sanctuary_lexicons_delete" ON public.sanctuary_lexicons
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

DROP POLICY IF EXISTS "hub_sanctuary_themes_select" ON public.sanctuary_themes;
CREATE POLICY "hub_sanctuary_themes_select" ON public.sanctuary_themes
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_sanctuary_themes_insert" ON public.sanctuary_themes;
CREATE POLICY "hub_sanctuary_themes_insert" ON public.sanctuary_themes
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_themes_update" ON public.sanctuary_themes;
CREATE POLICY "hub_sanctuary_themes_update" ON public.sanctuary_themes
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_themes_delete" ON public.sanctuary_themes;
CREATE POLICY "hub_sanctuary_themes_delete" ON public.sanctuary_themes
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

DROP POLICY IF EXISTS "hub_sanctuary_theme_images_select" ON public.sanctuary_theme_images;
CREATE POLICY "hub_sanctuary_theme_images_select" ON public.sanctuary_theme_images
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_sanctuary_theme_images_insert" ON public.sanctuary_theme_images;
CREATE POLICY "hub_sanctuary_theme_images_insert" ON public.sanctuary_theme_images
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_theme_images_update" ON public.sanctuary_theme_images;
CREATE POLICY "hub_sanctuary_theme_images_update" ON public.sanctuary_theme_images
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_sanctuary_theme_images_delete" ON public.sanctuary_theme_images;
CREATE POLICY "hub_sanctuary_theme_images_delete" ON public.sanctuary_theme_images
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

-- Spoke Registry & Global Security
DROP POLICY IF EXISTS "hub_sanctuary_games_select_anon" ON public.sanctuary_games;
CREATE POLICY "hub_sanctuary_games_select_anon" ON public.sanctuary_games
    FOR SELECT TO anon
    USING (COALESCE(is_keepers_only, false) = false AND COALESCE(is_active, true) = true);
DROP POLICY IF EXISTS "hub_sanctuary_games_select_auth" ON public.sanctuary_games;
CREATE POLICY "hub_sanctuary_games_select_auth" ON public.sanctuary_games
    FOR SELECT TO authenticated
    USING ((COALESCE(is_keepers_only, false) = false AND COALESCE(is_active, true) = true) OR sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_sanctuary_games_insert" ON public.sanctuary_games;
CREATE POLICY "hub_sanctuary_games_insert" ON public.sanctuary_games
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_sanctuary_games_update" ON public.sanctuary_games;
CREATE POLICY "hub_sanctuary_games_update" ON public.sanctuary_games
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_keeper()) WITH CHECK (sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_sanctuary_games_delete" ON public.sanctuary_games;
CREATE POLICY "hub_sanctuary_games_delete" ON public.sanctuary_games
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_keeper());

-- Isolate Spoke Donation Configuration strictly to Spoke Wayfinders (via game-gateway service_role); Hub Keepers cannot alter Spoke donations
CREATE OR REPLACE FUNCTION sanctuary_internal.protect_spoke_donation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(auth.role(), '') = 'authenticated' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.donation_url := NULL;
            NEW.payment_processor := 'STRIPE';
        ELSIF TG_OP = 'UPDATE' THEN
            NEW.donation_url := OLD.donation_url;
            NEW.payment_processor := OLD.payment_processor;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_spoke_donation_fields ON public.sanctuary_games;
CREATE TRIGGER trg_protect_spoke_donation_fields
    BEFORE INSERT OR UPDATE ON public.sanctuary_games
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.protect_spoke_donation_fields();

CREATE OR REPLACE FUNCTION sanctuary_internal.protect_spoke_donation_broadcasts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(auth.role(), '') = 'authenticated' THEN
        IF TG_OP = 'DELETE' THEN
            IF OLD.category = 'SpokeDonationConfig' THEN
                RAISE EXCEPTION 'Forbidden: Spoke donation configuration is isolated to the Spoke Wayfinder';
            END IF;
            RETURN OLD;
        ELSIF NEW.category = 'SpokeDonationConfig' OR (TG_OP = 'UPDATE' AND OLD.category = 'SpokeDonationConfig') THEN
            RAISE EXCEPTION 'Forbidden: Spoke donation configuration is isolated to the Spoke Wayfinder';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_spoke_donation_broadcasts ON public.keeper_system_broadcasts;
CREATE TRIGGER trg_protect_spoke_donation_broadcasts
    BEFORE INSERT OR UPDATE OR DELETE ON public.keeper_system_broadcasts
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.protect_spoke_donation_broadcasts();

DROP POLICY IF EXISTS "hub_hardware_bans_select" ON public.hardware_bans;
CREATE POLICY "hub_hardware_bans_select" ON public.hardware_bans
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "hub_hardware_bans_insert" ON public.hardware_bans;
CREATE POLICY "hub_hardware_bans_insert" ON public.hardware_bans
    FOR INSERT TO authenticated
    WITH CHECK (
        sanctuary_internal.is_hub_keeper()
        OR (
            (SELECT auth.uid()) IS NOT NULL
            AND length(btrim(hwid_hash)) = 64
            AND banned_by IS NULL
            AND reason IN ('Nuclear Override', 'Malware Evasion')
        )
    );
DROP POLICY IF EXISTS "hub_hardware_bans_update" ON public.hardware_bans;
CREATE POLICY "hub_hardware_bans_update" ON public.hardware_bans
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_keeper()) WITH CHECK (sanctuary_internal.is_hub_keeper());
DROP POLICY IF EXISTS "hub_hardware_bans_delete" ON public.hardware_bans;
CREATE POLICY "hub_hardware_bans_delete" ON public.hardware_bans
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_keeper());

DROP POLICY IF EXISTS "hub_keeper_heuristic_signatures_select" ON public.keeper_heuristic_signatures;
CREATE POLICY "hub_keeper_heuristic_signatures_select" ON public.keeper_heuristic_signatures
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_keeper_heuristic_signatures_insert" ON public.keeper_heuristic_signatures;
CREATE POLICY "hub_keeper_heuristic_signatures_insert" ON public.keeper_heuristic_signatures
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_heuristic_signatures_update" ON public.keeper_heuristic_signatures;
CREATE POLICY "hub_keeper_heuristic_signatures_update" ON public.keeper_heuristic_signatures
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_heuristic_signatures_delete" ON public.keeper_heuristic_signatures;
CREATE POLICY "hub_keeper_heuristic_signatures_delete" ON public.keeper_heuristic_signatures
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

-- Append-Only Core Audit Trail
DROP POLICY IF EXISTS "hub_audit_logs_select" ON public.audit_logs;
CREATE POLICY "hub_audit_logs_select" ON public.audit_logs
    FOR SELECT TO authenticated USING (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_audit_logs_insert" ON public.audit_logs;
CREATE POLICY "hub_audit_logs_insert" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (actor_id IS NULL OR actor_id = (SELECT auth.uid())));

-- Support Categories, Tickets & Email Dispatches
DROP POLICY IF EXISTS "hub_keeper_support_categories_select" ON public.keeper_support_categories;
CREATE POLICY "hub_keeper_support_categories_select" ON public.keeper_support_categories
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_keeper_support_categories_insert" ON public.keeper_support_categories;
CREATE POLICY "hub_keeper_support_categories_insert" ON public.keeper_support_categories
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_support_categories_update" ON public.keeper_support_categories;
CREATE POLICY "hub_keeper_support_categories_update" ON public.keeper_support_categories
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_support_categories_delete" ON public.keeper_support_categories;
CREATE POLICY "hub_keeper_support_categories_delete" ON public.keeper_support_categories
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

DROP POLICY IF EXISTS "hub_keeper_tickets_select" ON public.keeper_tickets;
CREATE POLICY "hub_keeper_tickets_select" ON public.keeper_tickets
    FOR SELECT TO authenticated
    USING (author_id = (SELECT auth.uid()) OR sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_tickets_insert" ON public.keeper_tickets;
CREATE POLICY "hub_keeper_tickets_insert" ON public.keeper_tickets
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (author_id = (SELECT auth.uid()) OR author_id IS NULL));
DROP POLICY IF EXISTS "hub_keeper_tickets_update" ON public.keeper_tickets;
CREATE POLICY "hub_keeper_tickets_update" ON public.keeper_tickets
    FOR UPDATE TO authenticated
    USING (author_id = (SELECT auth.uid()) OR sanctuary_internal.is_hub_staff())
    WITH CHECK (author_id = (SELECT auth.uid()) OR sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_tickets_delete" ON public.keeper_tickets;
CREATE POLICY "hub_keeper_tickets_delete" ON public.keeper_tickets
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

CREATE OR REPLACE FUNCTION sanctuary_internal.guard_keeper_ticket_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
BEGIN
    IF COALESCE(auth.role(), '') = 'service_role'
       OR session_user IN ('postgres', 'supabase_admin')
       OR sanctuary_internal.is_hub_staff() THEN
        RETURN NEW;
    END IF;

    IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
        RAISE EXCEPTION 'Forbidden: Only Keepers Core Staff can reassign ticket author_id';
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        RAISE EXCEPTION 'Forbidden: Only Keepers Core Staff can modify ticket assigned_to';
    END IF;
    IF NEW.ticket_type IS DISTINCT FROM OLD.ticket_type THEN
        RAISE EXCEPTION 'Forbidden: Only Keepers Core Staff can change ticket_type';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.author_id = (SELECT auth.uid())
           AND upper(COALESCE(NEW.status, '')) = 'CLOSED' THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Forbidden: Only Keepers Core Staff can modify ticket status';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_keeper_ticket_columns ON public.keeper_tickets;
CREATE TRIGGER trg_guard_keeper_ticket_columns
    BEFORE UPDATE ON public.keeper_tickets
    FOR EACH ROW
    EXECUTE FUNCTION sanctuary_internal.guard_keeper_ticket_columns();

DROP POLICY IF EXISTS "hub_keeper_email_dispatches_select" ON public.keeper_email_dispatches;
CREATE POLICY "hub_keeper_email_dispatches_select" ON public.keeper_email_dispatches
    FOR SELECT TO authenticated USING (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_email_dispatches_insert" ON public.keeper_email_dispatches;
CREATE POLICY "hub_keeper_email_dispatches_insert" ON public.keeper_email_dispatches
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_email_dispatches_update" ON public.keeper_email_dispatches;
CREATE POLICY "hub_keeper_email_dispatches_update" ON public.keeper_email_dispatches
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_email_dispatches_delete" ON public.keeper_email_dispatches;
CREATE POLICY "hub_keeper_email_dispatches_delete" ON public.keeper_email_dispatches
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_keeper());

ALTER TABLE public.dmca_compliance_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hub_dmca_notices_select" ON public.dmca_compliance_notices;
CREATE POLICY "hub_dmca_notices_select" ON public.dmca_compliance_notices
    FOR SELECT TO authenticated USING (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_dmca_notices_update" ON public.dmca_compliance_notices;
CREATE POLICY "hub_dmca_notices_update" ON public.dmca_compliance_notices
    FOR UPDATE TO authenticated
    USING (sanctuary_internal.is_hub_staff())
    WITH CHECK (sanctuary_internal.is_hub_staff());

-- Broadcasts, Polls & System Directives
DROP POLICY IF EXISTS "hub_keeper_system_broadcasts_select" ON public.keeper_system_broadcasts;
DROP POLICY IF EXISTS "hub_keeper_system_broadcasts_select_anon" ON public.keeper_system_broadcasts;
CREATE POLICY "hub_keeper_system_broadcasts_select_anon" ON public.keeper_system_broadcasts
    FOR SELECT TO anon
    USING (COALESCE(target_audience, 'All') <> 'Internal_Pipeline' OR category IN ('PipelineConfig', 'SpokeDonationConfig'));
DROP POLICY IF EXISTS "hub_keeper_system_broadcasts_select_auth" ON public.keeper_system_broadcasts;
CREATE POLICY "hub_keeper_system_broadcasts_select_auth" ON public.keeper_system_broadcasts
    FOR SELECT TO authenticated
    USING (COALESCE(target_audience, 'All') <> 'Internal_Pipeline' OR category IN ('PipelineConfig', 'SpokeDonationConfig') OR sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_system_broadcasts_insert" ON public.keeper_system_broadcasts;
CREATE POLICY "hub_keeper_system_broadcasts_insert" ON public.keeper_system_broadcasts
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_system_broadcasts_update" ON public.keeper_system_broadcasts;
CREATE POLICY "hub_keeper_system_broadcasts_update" ON public.keeper_system_broadcasts
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_keeper_system_broadcasts_delete" ON public.keeper_system_broadcasts;
CREATE POLICY "hub_keeper_system_broadcasts_delete" ON public.keeper_system_broadcasts
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

DROP POLICY IF EXISTS "hub_keeper_dispatch_poll_votes_select" ON public.keeper_dispatch_poll_votes;
CREATE POLICY "hub_keeper_dispatch_poll_votes_select" ON public.keeper_dispatch_poll_votes
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_keeper_dispatch_poll_votes_insert" ON public.keeper_dispatch_poll_votes;
CREATE POLICY "hub_keeper_dispatch_poll_votes_insert" ON public.keeper_dispatch_poll_votes
    FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "hub_keeper_dispatch_poll_votes_delete" ON public.keeper_dispatch_poll_votes;
CREATE POLICY "hub_keeper_dispatch_poll_votes_delete" ON public.keeper_dispatch_poll_votes
    FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "hub_system_broadcasts_select" ON public.system_broadcasts;
CREATE POLICY "hub_system_broadcasts_select" ON public.system_broadcasts
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_system_broadcasts_insert" ON public.system_broadcasts;
CREATE POLICY "hub_system_broadcasts_insert" ON public.system_broadcasts
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_system_broadcasts_update" ON public.system_broadcasts;
CREATE POLICY "hub_system_broadcasts_update" ON public.system_broadcasts
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_system_broadcasts_delete" ON public.system_broadcasts;
CREATE POLICY "hub_system_broadcasts_delete" ON public.system_broadcasts
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

DROP POLICY IF EXISTS "hub_dispatch_poll_votes_select" ON public.dispatch_poll_votes;
CREATE POLICY "hub_dispatch_poll_votes_select" ON public.dispatch_poll_votes
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_dispatch_poll_votes_insert" ON public.dispatch_poll_votes;
CREATE POLICY "hub_dispatch_poll_votes_insert" ON public.dispatch_poll_votes
    FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "hub_dispatch_poll_votes_delete" ON public.dispatch_poll_votes;
CREATE POLICY "hub_dispatch_poll_votes_delete" ON public.dispatch_poll_votes
    FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "hub_system_directives_select" ON public.system_directives;
CREATE POLICY "hub_system_directives_select" ON public.system_directives
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_system_directives_insert" ON public.system_directives;
CREATE POLICY "hub_system_directives_insert" ON public.system_directives
    FOR INSERT TO authenticated WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_system_directives_update" ON public.system_directives;
CREATE POLICY "hub_system_directives_update" ON public.system_directives
    FOR UPDATE TO authenticated USING (sanctuary_internal.is_hub_staff()) WITH CHECK (sanctuary_internal.is_hub_staff());
DROP POLICY IF EXISTS "hub_system_directives_delete" ON public.system_directives;
CREATE POLICY "hub_system_directives_delete" ON public.system_directives
    FOR DELETE TO authenticated USING (sanctuary_internal.is_hub_staff());

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
CREATE INDEX IF NOT EXISTS idx_hub_staging_queue_owner_tag ON public.citizen_staging_queue(owner_tag);

DROP TRIGGER IF EXISTS trg_stamp_staging_owner_tag ON public.citizen_staging_queue;
CREATE TRIGGER trg_stamp_staging_owner_tag
    BEFORE INSERT OR UPDATE ON public.citizen_staging_queue
    FOR EACH ROW EXECUTE FUNCTION sanctuary_internal.stamp_staging_owner_tag();

DROP POLICY IF EXISTS "hub_staging_queue_select" ON public.citizen_staging_queue;
CREATE POLICY "hub_staging_queue_select" ON public.citizen_staging_queue
    FOR SELECT TO authenticated
    USING (
        (expires_at IS NULL OR expires_at > NOW())
        AND (owner_tag IS NULL OR owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag()))
    );
DROP POLICY IF EXISTS "hub_staging_queue_insert" ON public.citizen_staging_queue;
CREATE POLICY "hub_staging_queue_insert" ON public.citizen_staging_queue
    FOR INSERT TO authenticated
    WITH CHECK (
        length(user_token) >= 16
        AND length(encrypted_payload) <= 10485760
        AND owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag())
    );
DROP POLICY IF EXISTS "hub_staging_queue_update" ON public.citizen_staging_queue;
CREATE POLICY "hub_staging_queue_update" ON public.citizen_staging_queue
    FOR UPDATE TO authenticated
    USING (
        length(user_token) >= 16
        AND (owner_tag IS NULL OR owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag()))
    )
    WITH CHECK (
        length(user_token) >= 16
        AND length(encrypted_payload) <= 10485760
        AND owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag())
    );
DROP POLICY IF EXISTS "hub_staging_queue_delete" ON public.citizen_staging_queue;
CREATE POLICY "hub_staging_queue_delete" ON public.citizen_staging_queue
    FOR DELETE TO authenticated
    USING (
        length(user_token) >= 16
        AND (owner_tag IS NULL OR owner_tag = (SELECT sanctuary_internal.current_staging_owner_tag()))
    );

DROP POLICY IF EXISTS "hub_pwa_push_subscriptions_select" ON public.pwa_push_subscriptions;
CREATE POLICY "hub_pwa_push_subscriptions_select" ON public.pwa_push_subscriptions
    FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "hub_pwa_push_subscriptions_insert" ON public.pwa_push_subscriptions;
CREATE POLICY "hub_pwa_push_subscriptions_insert" ON public.pwa_push_subscriptions
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        endpoint ~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|push\.opera\.com)/'
        AND length(p256dh) >= 16
        AND length(auth) >= 8
        AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
    );
DROP POLICY IF EXISTS "hub_pwa_push_subscriptions_update" ON public.pwa_push_subscriptions;
CREATE POLICY "hub_pwa_push_subscriptions_update" ON public.pwa_push_subscriptions
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()) OR user_id IS NULL)
    WITH CHECK (
        endpoint ~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|push\.opera\.com)/'
        AND length(p256dh) >= 16
        AND length(auth) >= 8
        AND user_id = (SELECT auth.uid())
    );
DROP POLICY IF EXISTS "hub_pwa_push_subscriptions_delete" ON public.pwa_push_subscriptions;
CREATE POLICY "hub_pwa_push_subscriptions_delete" ON public.pwa_push_subscriptions
    FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- STORAGE BUCKET HARDENING: Theme Wallpapers & Thumbnails ('backgrounds')
-- 512 KB cap, raster formats only, public CDN read, Keeper-only writes
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
        EXECUTE 'DROP POLICY IF EXISTS "hub_backgrounds_select" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "hub_backgrounds_insert" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "hub_backgrounds_update" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "hub_backgrounds_delete" ON storage.objects';

        EXECUTE 'CREATE POLICY "hub_backgrounds_select" ON storage.objects FOR SELECT TO public USING (bucket_id = ''backgrounds'')';
        EXECUTE 'CREATE POLICY "hub_backgrounds_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''backgrounds'' AND sanctuary_internal.is_hub_keeper())';
        EXECUTE 'CREATE POLICY "hub_backgrounds_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''backgrounds'' AND sanctuary_internal.is_hub_keeper()) WITH CHECK (bucket_id = ''backgrounds'' AND sanctuary_internal.is_hub_keeper())';
        EXECUTE 'CREATE POLICY "hub_backgrounds_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''backgrounds'' AND sanctuary_internal.is_hub_keeper())';
    END IF;
END $$;

DROP INDEX IF EXISTS public.idx_keeper_tickets_user_created;
DROP INDEX IF EXISTS public.idx_keeper_broadcasts_category;
CREATE INDEX IF NOT EXISTS idx_keeper_tickets_author_created ON public.keeper_tickets(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_profiles_lower_username ON public.profiles (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_hub_profiles_lower_email ON public.profiles (LOWER(email)) WHERE email IS NOT NULL;

-- ============================================================================
-- MULTI-TENANT PARTNER SPOKE WEBHOOK SECRETS (SERVICE_ROLE ONLY)
-- Isolated per-Spoke Stripe, Ko-fi, and shared webhook verification secrets.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS sanctuary_internal;

CREATE TABLE IF NOT EXISTS sanctuary_internal.spoke_webhook_secrets (
    spoke_id TEXT PRIMARY KEY,
    stripe_webhook_secret TEXT,
    kofi_verification_token TEXT,
    partner_shared_secret TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sanctuary_internal.spoke_webhook_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sanctuary_internal.spoke_webhook_secrets FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "hub_spoke_webhook_secrets_service_only" ON sanctuary_internal.spoke_webhook_secrets;
CREATE POLICY "hub_spoke_webhook_secrets_service_only" ON sanctuary_internal.spoke_webhook_secrets
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_spoke_webhook_secrets(p_spoke_id TEXT)
RETURNS TABLE(stripe_webhook_secret TEXT, kofi_verification_token TEXT, partner_shared_secret TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = sanctuary_internal, pg_catalog
AS $$
    SELECT s.stripe_webhook_secret, s.kofi_verification_token, s.partner_shared_secret
    FROM sanctuary_internal.spoke_webhook_secrets s
    WHERE s.spoke_id = lower(coalesce(trim(p_spoke_id), ''))
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_spoke_webhook_secrets(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_spoke_webhook_secrets(TEXT) TO service_role;

-- ============================================================================
-- HUB SCHEMA MIGRATION REGISTRY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hub_schema_migrations_select" ON public.schema_migrations;
CREATE POLICY "hub_schema_migrations_select" ON public.schema_migrations
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "hub_schema_migrations_service_write" ON public.schema_migrations;
CREATE POLICY "hub_schema_migrations_service_write" ON public.schema_migrations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.schema_migrations (version, name) VALUES
    (1, '0001_hub_baseline'),
    (2, '0002_hub_schema_versioning_and_staging_scale')
ON CONFLICT (version) DO NOTHING;

SELECT 'Sanctuary OS Core Hub Schema V0.6.0-Dev.15 Initialized Successfully' AS status;

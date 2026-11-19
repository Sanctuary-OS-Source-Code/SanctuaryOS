-- ============================================================================
-- Sanctuary OS Spoke Incremental Migration 0001 -> Version 2
-- Idempotent upgrade:
--   1. Statement-level batched Web Push dispatch on public.notifications
--   2. Non-blocking bounded SKIP LOCKED cleanup_expired_staging_queue()
--   3. 16-shard counter buffer (public.counter_shards) for viral downloads/views
--   4. Hardened Spoke 'backgrounds' & 'sanctuary_theme_images' Storage policies
--   5. public.schema_migrations & public.get_spoke_schema_version()
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "spoke_schema_migrations_select" ON public.schema_migrations;
CREATE POLICY "spoke_schema_migrations_select" ON public.schema_migrations
    FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "spoke_schema_migrations_service_write" ON public.schema_migrations;
CREATE POLICY "spoke_schema_migrations_service_write" ON public.schema_migrations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_spoke_schema_version()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT MAX(version) FROM public.schema_migrations), 2);
$$;

REVOKE ALL ON FUNCTION public.get_spoke_schema_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_spoke_schema_version() TO anon, authenticated, service_role;

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

REVOKE ALL ON FUNCTION sanctuary_internal.cleanup_expired_staging_queue() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_notifications_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_endpoint TEXT;
    v_secret TEXT;
    v_spoke_id TEXT;
    v_chunk RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
        RETURN NULL;
    END IF;

    v_endpoint := sanctuary_internal.read_runtime_secret('pwa_push_endpoint');
    v_secret := sanctuary_internal.read_runtime_secret('pwa_push_secret');
    IF COALESCE(v_endpoint, '') = '' THEN
        RETURN NULL;
    END IF;

    v_spoke_id := sanctuary_internal.active_spoke_id();

    FOR v_chunk IN
        WITH numbered AS (
            SELECT
                user_id,
                COALESCE(type, 'system_dispatch') AS notif_type,
                COALESCE(message, '') AS body,
                'notif_' || id::text AS unique_id,
                ((ROW_NUMBER() OVER (ORDER BY id) - 1) / 500)::INTEGER AS batch_no
            FROM inserted_notifications
            WHERE user_id IS NOT NULL
        )
        SELECT
            batch_no,
            jsonb_agg(
                jsonb_build_object(
                    'user_id', user_id,
                    'notif_type', notif_type,
                    'title', 'Sanctuary OS',
                    'body', body,
                    'unique_id', unique_id
                )
            ) AS items
        FROM numbered
        GROUP BY batch_no
        ORDER BY batch_no
    LOOP
        EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3)'
        USING
            v_endpoint,
            jsonb_build_object('Content-Type', 'application/json', 'x-internal-push-secret', COALESCE(v_secret, '')),
            jsonb_build_object(
                'type', 'user_notification_batch',
                'spoke_id', v_spoke_id,
                'items', v_chunk.items
            );
    END LOOP;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION sanctuary_internal.trigger_pwa_web_push_on_notifications_batch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pwa_web_push_notification ON public.notifications;
DROP FUNCTION IF EXISTS sanctuary_internal.trigger_pwa_web_push_on_notification();
CREATE TRIGGER trg_pwa_web_push_notification
    AFTER INSERT ON public.notifications
    REFERENCING NEW TABLE AS inserted_notifications
    FOR EACH STATEMENT EXECUTE FUNCTION sanctuary_internal.trigger_pwa_web_push_on_notifications_batch();

CREATE TABLE IF NOT EXISTS public.counter_shards (
    entity_kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    shard SMALLINT NOT NULL CHECK (shard BETWEEN 0 AND 15),
    pending_delta BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entity_kind, entity_id, shard)
);

ALTER TABLE public.counter_shards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.counter_shards FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.counter_shards TO service_role;
DROP POLICY IF EXISTS "service_role_counter_shards" ON public.counter_shards;
CREATE POLICY "service_role_counter_shards" ON public.counter_shards
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.flush_counter_shards(
    p_entity_kind TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_flushed INTEGER := 0;
BEGIN
    WITH drained AS (
        DELETE FROM public.counter_shards
        WHERE (p_entity_kind IS NULL OR entity_kind = p_entity_kind)
          AND (p_entity_id IS NULL OR entity_id = p_entity_id)
          AND pending_delta > 0
        RETURNING entity_kind, entity_id, pending_delta
    ),
    grouped AS (
        SELECT entity_kind, entity_id, SUM(pending_delta) AS total_delta
        FROM drained
        GROUP BY entity_kind, entity_id
    ),
    upd_assets AS (
        UPDATE public.nexus_assets na
        SET downloads = COALESCE(na.downloads, 0) + g.total_delta
        FROM grouped g
        WHERE g.entity_kind = 'nexus_asset' AND na.id::text = g.entity_id
        RETURNING na.id
    ),
    upd_blueprints AS (
        UPDATE public.blueprints b
        SET downloads = COALESCE(b.downloads, 0) + g.total_delta
        FROM grouped g
        WHERE g.entity_kind = 'blueprint' AND b.id::text = g.entity_id
        RETURNING b.id
    ),
    upd_posts AS (
        UPDATE public.mason_posts mp
        SET view_count = COALESCE(mp.view_count, 0) + g.total_delta
        FROM grouped g
        WHERE g.entity_kind = 'mason_post' AND mp.id::text = g.entity_id
        RETURNING mp.id
    )
    SELECT (SELECT COUNT(*) FROM upd_assets)
         + (SELECT COUNT(*) FROM upd_blueprints)
         + (SELECT COUNT(*) FROM upd_posts)
    INTO v_flushed;

    RETURN v_flushed;
END;
$$;

REVOKE ALL ON FUNCTION public.flush_counter_shards(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flush_counter_shards(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_asset_downloads(asset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_eid TEXT := asset_id::text;
    v_shard SMALLINT := (abs(hashtext(COALESCE((SELECT auth.uid())::text, txid_current()::text))) % 16)::smallint;
    v_pending BIGINT := 0;
BEGIN
    IF (SELECT auth.uid()) IS NULL AND NOT (SELECT sanctuary_internal.is_verified_hub_gateway()) THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    INSERT INTO public.counter_shards (entity_kind, entity_id, shard, pending_delta, updated_at)
    VALUES ('nexus_asset', v_eid, v_shard, 1, NOW())
    ON CONFLICT (entity_kind, entity_id, shard) DO UPDATE
    SET pending_delta = public.counter_shards.pending_delta + 1,
        updated_at = NOW()
    RETURNING pending_delta INTO v_pending;

    IF (v_shard = 0 OR v_pending >= 16)
       AND pg_try_advisory_xact_lock(hashtext('flush_counter:nexus_asset:' || v_eid)) THEN
        PERFORM public.flush_counter_shards('nexus_asset', v_eid);
    END IF;
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
DECLARE
    v_eid TEXT := blueprint_id::text;
    v_shard SMALLINT := (abs(hashtext(COALESCE((SELECT auth.uid())::text, txid_current()::text))) % 16)::smallint;
    v_pending BIGINT := 0;
BEGIN
    IF (SELECT auth.uid()) IS NULL AND NOT (SELECT sanctuary_internal.is_verified_hub_gateway()) THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    INSERT INTO public.counter_shards (entity_kind, entity_id, shard, pending_delta, updated_at)
    VALUES ('blueprint', v_eid, v_shard, 1, NOW())
    ON CONFLICT (entity_kind, entity_id, shard) DO UPDATE
    SET pending_delta = public.counter_shards.pending_delta + 1,
        updated_at = NOW()
    RETURNING pending_delta INTO v_pending;

    IF (v_shard = 0 OR v_pending >= 16)
       AND pg_try_advisory_xact_lock(hashtext('flush_counter:blueprint:' || v_eid)) THEN
        PERFORM public.flush_counter_shards('blueprint', v_eid);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_blueprint_downloads(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_blueprint_downloads(BIGINT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.increment_mason_post_view(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sanctuary_internal
AS $$
DECLARE
    v_eid TEXT := p_post_id::text;
    v_shard SMALLINT := (abs(hashtext(COALESCE((SELECT auth.uid())::text, txid_current()::text))) % 16)::smallint;
    v_pending BIGINT := 0;
BEGIN
    INSERT INTO public.counter_shards (entity_kind, entity_id, shard, pending_delta, updated_at)
    VALUES ('mason_post', v_eid, v_shard, 1, NOW())
    ON CONFLICT (entity_kind, entity_id, shard) DO UPDATE
    SET pending_delta = public.counter_shards.pending_delta + 1,
        updated_at = NOW()
    RETURNING pending_delta INTO v_pending;

    IF (v_shard = 0 OR v_pending >= 16)
       AND pg_try_advisory_xact_lock(hashtext('flush_counter:mason_post:' || v_eid)) THEN
        PERFORM public.flush_counter_shards('mason_post', v_eid);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_mason_post_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_mason_post_view(UUID) TO anon, authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('backgrounds', 'backgrounds', true, 524288, ARRAY['image/webp', 'image/png', 'image/jpeg'])
        ON CONFLICT (id) DO UPDATE
        SET public = true,
            file_size_limit = 524288,
            allowed_mime_types = ARRAY['image/webp', 'image/png', 'image/jpeg'];

        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_select" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_insert" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_update" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_backgrounds_delete" ON storage.objects';
        EXECUTE 'CREATE POLICY "spoke_backgrounds_select" ON storage.objects FOR SELECT TO public USING (bucket_id = ''backgrounds'')';
        EXECUTE 'CREATE POLICY "spoke_backgrounds_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
        EXECUTE 'CREATE POLICY "spoke_backgrounds_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff())) WITH CHECK (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
        EXECUTE 'CREATE POLICY "spoke_backgrounds_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = ''backgrounds'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';

        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('sanctuary_theme_images', 'sanctuary_theme_images', true, 524288, ARRAY['image/webp', 'image/png', 'image/jpeg'])
        ON CONFLICT (id) DO UPDATE
        SET public = true,
            file_size_limit = 524288,
            allowed_mime_types = ARRAY['image/webp', 'image/png', 'image/jpeg'];

        EXECUTE 'DROP POLICY IF EXISTS "spoke_theme_images_select" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_theme_images_insert" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_theme_images_update" ON storage.objects';
        EXECUTE 'DROP POLICY IF EXISTS "spoke_theme_images_delete" ON storage.objects';
        EXECUTE 'CREATE POLICY "spoke_theme_images_select" ON storage.objects FOR SELECT TO public USING (bucket_id = ''sanctuary_theme_images'')';
        EXECUTE 'CREATE POLICY "spoke_theme_images_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''sanctuary_theme_images'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
        EXECUTE 'CREATE POLICY "spoke_theme_images_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = ''sanctuary_theme_images'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff())) WITH CHECK (bucket_id = ''sanctuary_theme_images'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
        EXECUTE 'CREATE POLICY "spoke_theme_images_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = ''sanctuary_theme_images'' AND ((SELECT sanctuary_internal.is_verified_hub_gateway()) OR sanctuary_internal.is_verified_mason_or_staff()))';
    END IF;
END $$;

INSERT INTO public.schema_migrations (version, name) VALUES
    (1, '0001_spoke_baseline'),
    (2, '0002_spoke_batched_push_sharded_counters_and_storage')
ON CONFLICT (version) DO NOTHING;

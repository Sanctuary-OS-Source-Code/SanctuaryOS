-- ============================================================================
-- Sanctuary OS Core Hub Incremental Migration 0001 -> Version 2
-- Idempotent upgrade: schema version tracking, Spoke schema version column,
-- and non-blocking bounded SKIP LOCKED staging queue cleanup.
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

ALTER TABLE public.sanctuary_games
    ADD COLUMN IF NOT EXISTS spoke_schema_version INTEGER NOT NULL DEFAULT 2;

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

INSERT INTO public.schema_migrations (version, name) VALUES
    (1, '0001_hub_baseline'),
    (2, '0002_hub_schema_versioning_and_staging_scale')
ON CONFLICT (version) DO NOTHING;

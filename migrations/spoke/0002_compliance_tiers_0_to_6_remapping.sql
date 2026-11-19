-- ============================================================================
-- Sanctuary OS Spoke Incremental Migration 0002 -> Version 3
-- Idempotent upgrade aligning Compliance Tiers 0–6:
--   Tier 0: Clean / Public Safe
--   Tier 1: Legal / DMCA Hold (previously Tier 6)
--   Tier 2: Explicit Content (previously Tier 1)
--   Tier 3: Illicit / Substance (previously Tier 2)
--   Tier 4: Extreme Violence (previously Tier 3)
--   Tier 5: Taboo / Prohibited Content (previously Tier 4)
--   Tier 6: Confirmed Malware (previously Tier 5)
-- Guarded via public.schema_migrations (version = 3) so data remapping runs once.
-- ============================================================================

DO $$
DECLARE
    v_already_applied BOOLEAN := false;
BEGIN
    IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.schema_migrations WHERE version = 3
        ) INTO v_already_applied;
    END IF;

    IF NOT v_already_applied THEN
        UPDATE public.mods
        SET compliance_tier = CASE compliance_tier
            WHEN 6 THEN 1
            WHEN 5 THEN 6
            WHEN 4 THEN 5
            WHEN 3 THEN 4
            WHEN 2 THEN 3
            WHEN 1 THEN 2
            ELSE compliance_tier
        END
        WHERE compliance_tier BETWEEN 1 AND 6;

        UPDATE public.collections
        SET compliance_tier = CASE compliance_tier
            WHEN 6 THEN 1
            WHEN 5 THEN 6
            WHEN 4 THEN 5
            WHEN 3 THEN 4
            WHEN 2 THEN 3
            WHEN 1 THEN 2
            ELSE compliance_tier
        END
        WHERE compliance_tier BETWEEN 1 AND 6;

        UPDATE public.blueprints
        SET compliance_tier = CASE compliance_tier
            WHEN 6 THEN 1
            WHEN 5 THEN 6
            WHEN 4 THEN 5
            WHEN 3 THEN 4
            WHEN 2 THEN 3
            WHEN 1 THEN 2
            ELSE compliance_tier
        END
        WHERE compliance_tier BETWEEN 1 AND 6;

        UPDATE public.mods
        SET status_reason = regexp_replace(status_reason, '\[DMCA HOLD - TIER 6\]', '[DMCA HOLD - TIER 1]', 'g')
        WHERE status_reason LIKE '%[DMCA HOLD - TIER 6]%';
    END IF;
END $$;

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
          AND COALESCE(m.compliance_tier, 0) NOT IN (1, 2, 3, 4, 5)
    );
$$;

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
        NEW.compliance_tier = 6
        OR (
            NEW.compliance_tier BETWEEN 1 AND 5
            AND LOWER(COALESCE(NEW.status, '')) NOT IN ('pending', 'under_review', 'unverified')
        )
    );

    IF TG_OP = 'UPDATE' THEN
        v_old_confirmed := (
            OLD.compliance_tier = 6
            OR (
                OLD.compliance_tier BETWEEN 1 AND 5
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
          COALESCE(m.compliance_tier, 0) NOT IN (1, 2, 3, 4, 5)
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
      AND COALESCE(m.compliance_tier, 0) IN (1, 2, 3, 4, 5);
$$;

REVOKE ALL ON FUNCTION public.get_compliance_restricted_hashes(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_compliance_restricted_hashes(TEXT[]) TO anon, authenticated, service_role;

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
    v_tier INTEGER := LEAST(5, GREATEST(1, COALESCE(p_tier, 1)));
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

DROP POLICY IF EXISTS "spoke_collections_select" ON public.collections;
CREATE POLICY "spoke_collections_select" ON public.collections
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR COALESCE(compliance_tier, 0) NOT IN (1, 2, 3, 4, 5)
        OR sanctuary_internal.is_spoke_oversight_or_wayfinder()
    );

DROP POLICY IF EXISTS "spoke_mods_select" ON public.mods;
CREATE POLICY "spoke_mods_select" ON public.mods
    FOR SELECT TO public
    USING (
        (SELECT sanctuary_internal.is_verified_hub_gateway())
        OR COALESCE(compliance_tier, 0) NOT IN (1, 2, 3, 4, 5)
        OR sanctuary_internal.is_spoke_oversight_or_wayfinder()
    );

INSERT INTO public.schema_migrations (version, name)
VALUES (3, '0003_compliance_tiers_0_to_6_remapping')
ON CONFLICT (version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_spoke_schema_version()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT MAX(version) FROM public.schema_migrations), 3);
$$;

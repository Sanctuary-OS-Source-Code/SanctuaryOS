// @ts-nocheck
import { UUID_REGEX, SUPABASE_URL_REGEX, openSpokeEnvelope, createSpokeClient } from './cryptoEnvelope.ts'

export const STAFF_ROLES = ['wayfinder', 'oversight', 'architect', 'senior_architect', 'admin'];
export const CREATOR_OR_STAFF_ROLES = [...STAFF_ROLES, 'mason'];

export const STAFF_ONLY_TABLES = new Set([
  'global_network_status',
  'global_security',
  'heuristic_signatures',
  'known_exception_rules',
  'sanctuary_schemas',
  'sanctuary_lexicons',
  'sanctuary_themes',
  'sanctuary_support_categories',
  'sanctuary_telemetry_sources',
  'dlc_registry',
  'flavor_groups',
  'flavor_group_members',
  'game_versions',
  'taxonomy',
  'tracked_template_files',
  'system_broadcasts',
]);

export const CREATOR_OR_STAFF_TABLES = new Set([
  'mods',
  'mod_versions',
  'mod_bundles',
  'mod_dependencies',
  'mod_relationships',
  'version_dependencies',
  'community_groups',
  'community_group_members',
  'collections',
  'collection_members',
  'logical_conflicts',
  'mason_posts',
  'masons',
  'homestead_workbench_templates',
]);

export const CITIZEN_TABLES = new Set([
  'audit_logs',
  'mason_post_comments',
  'mason_post_likes',
  'mason_post_views',
  'dispatch_poll_votes',
  'blueprints',
  'blueprint_reports',
  'nexus_assets',
  'nexus_reports',
  'content_flags',
  'sanctuary_tickets',
  'scout_suggestions',
  'notifications',
  'homestead_lab_logs',
  'malware_reports',
  'citizen_staging_queue',
]);

export type CachedSpokeEntry = {
  game: any;
  serviceKey: string | null;
  credentialKind: 'spoke_gateway' | 'legacy_service_role' | null;
  keyVersion: string | null;
  keyFingerprint: string;
  rotatedAt: string | null;
  expiresAt: number;
};

export const spokeGameConfigCache = new Map<string, CachedSpokeEntry>();
export const SPOKE_GAME_CACHE_TTL_MS = 45_000;

export function invalidateSpokeGameConfigCache() {
  spokeGameConfigCache.clear();
}

export async function resolveGameWithServiceKey(supabaseAdmin: any, gameIdOrSchema: string) {
  const cacheKey = String(gameIdOrSchema || '').trim().toLowerCase();
  const cached = spokeGameConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      game: cached.game,
      serviceKey: cached.serviceKey,
      credentialKind: cached.credentialKind,
      keyVersion: cached.keyVersion,
      keyFingerprint: cached.keyFingerprint,
      rotatedAt: cached.rotatedAt,
      error: null,
    };
  }

  let gameQuery = supabaseAdmin
    .from('sanctuary_games')
    .select('id, name, schema_id, supabase_url, supabase_anon_key, is_active, is_keepers_only, donation_url, payment_processor');

  if (UUID_REGEX.test(gameIdOrSchema)) {
    gameQuery = gameQuery.eq('id', gameIdOrSchema);
  } else {
    gameQuery = gameQuery.ilike('schema_id', gameIdOrSchema);
  }

  const { data: game, error: gameError } = await gameQuery.maybeSingle();
  if (gameError || !game) {
    return {
      game: null,
      serviceKey: null,
      credentialKind: null,
      keyVersion: null,
      keyFingerprint: '',
      rotatedAt: null,
      error: gameError,
    };
  }

  const { data: credRows, error: credErr } = await supabaseAdmin.rpc('internal_get_spoke_credential', {
    p_game_id: game.id,
  });
  if (credErr) {
    throw new Error(`Failed to resolve Spoke credential from Vault: ${credErr.message}`);
  }
  const secretRow = Array.isArray(credRows) ? credRows[0] : credRows;

  let serviceKey: string | null = null;
  let credentialKind: 'spoke_gateway' | 'legacy_service_role' | null = null;
  let keyVersion: string | null = null;
  let keyFingerprint = '';
  let rotatedAt: string | null = null;

  if (secretRow?.envelope_ciphertext) {
    serviceKey = await openSpokeEnvelope(secretRow.envelope_ciphertext, {
      gameId: String(game.id),
      schemaId: String(game.schema_id || ''),
      supabaseUrl: String(game.supabase_url || ''),
    });
    credentialKind =
      secretRow.credential_kind === 'spoke_gateway' || secretRow.credential_kind === 'legacy_service_role'
        ? secretRow.credential_kind
        : detectCredentialKind(serviceKey);
    keyVersion = String(secretRow.key_version || 'v1:master');
    keyFingerprint = String(secretRow.key_fingerprint || maskCredentialFingerprint(serviceKey));
    rotatedAt = secretRow.rotated_at || null;
  }

  const entry: CachedSpokeEntry = {
    game,
    serviceKey,
    credentialKind,
    keyVersion,
    keyFingerprint,
    rotatedAt,
    expiresAt: Date.now() + SPOKE_GAME_CACHE_TTL_MS,
  };
  spokeGameConfigCache.set(cacheKey, entry);
  if (game.id) spokeGameConfigCache.set(String(game.id).toLowerCase(), entry);
  if (game.schema_id) spokeGameConfigCache.set(String(game.schema_id).toLowerCase(), entry);
  return {
    game,
    serviceKey,
    credentialKind,
    keyVersion,
    keyFingerprint,
    rotatedAt,
    error: null,
  };
}

export const MAX_INLINE_THEME_DATA_URI_CHARS = 32_768;

export function assertNoOversizedInlineImageBlobs(table: string, row: any) {
  if (!row || typeof row !== 'object') return;
  const cleanTable = String(table || '').trim().toLowerCase();
  if (cleanTable !== 'nexus_assets' && cleanTable !== 'sanctuary_themes') return;

  const inspectValue = (val: unknown) => {
    if (!val) return;
    if (typeof val === 'string') {
      if (val.startsWith('data:image/') && val.length > MAX_INLINE_THEME_DATA_URI_CHARS) {
        throw new Error(
          'Oversized inline base64 wallpaper rejected. Upload theme images via Cloud Storage or use an external HTTPS URL.'
        );
      }
      if (val.length > MAX_INLINE_THEME_DATA_URI_CHARS && val.includes('data:image/')) {
        try {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === 'object') inspectValue(parsed);
        } catch {
          // ignore non-JSON strings
        }
      }
      return;
    }
    if (typeof val === 'object') {
      for (const entryVal of Object.values(val as Record<string, unknown>)) {
        inspectValue(entryVal);
      }
    }
  };

  inspectValue(row.json_data);
  inspectValue(row.theme_data);
  inspectValue(row.banner_url);
}

export function normalizeSpokeTableRow(table: string, row: any) {
  if (!row || typeof row !== 'object') return row;
  assertNoOversizedInlineImageBlobs(table, row);
  return { ...row };
}

export function isValidPassingLabCertProof(proof: any, expectedHash: string): boolean {
  if (!proof || typeof proof !== 'object') return false;
  const proofHash = String(proof.dna_hash || '').trim();
  const activeSecs = Number(proof.active_seconds || 0);
  const saveVerified = String(proof.save_file_verified || '').trim();
  return (
    Boolean(expectedHash) &&
    proofHash === expectedHash &&
    Number.isFinite(activeSecs) &&
    activeSecs >= 15 &&
    saveVerified.length > 0
  );
}

export async function hasExistingCloudPassingLabReceipt(
  gameDb: any,
  dnaHash: string,
  versionId?: string | null
): Promise<boolean> {
  if (versionId) {
    const { data: vLogs } = await gameDb
      .from('homestead_lab_logs')
      .select('log_snippet, tester_note')
      .eq('version_id', versionId)
      .limit(5);
    if (
      Array.isArray(vLogs) &&
      vLogs.some(
        (l: any) =>
          l?.log_snippet === 'Clean' || String(l?.tester_note || '').includes('PASS_VERIFIED')
      )
    ) {
      return true;
    }
  }
  if (dnaHash) {
    const { data: hLogs } = await gameDb
      .from('homestead_lab_logs')
      .select('log_snippet, tester_note')
      .ilike('tester_note', `%${dnaHash}%`)
      .limit(5);
    if (
      Array.isArray(hLogs) &&
      hLogs.some(
        (l: any) =>
          l?.log_snippet === 'Clean' || String(l?.tester_note || '').includes('PASS_VERIFIED')
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function enforceArchitectSubmissionCompliance(
  gameDb: any,
  cleanTable: string,
  row: any,
  isCallerStaff: boolean
) {
  if (!row || typeof row !== 'object') return;
  const certProof = row._lab_cert_proof;
  if (Object.prototype.hasOwnProperty.call(row, '_lab_cert_proof')) {
    delete row._lab_cert_proof;
  }
  if (isCallerStaff) return;

  if (cleanTable === 'homestead_lab_logs') {
    const snippet = String(row.log_snippet || '').trim();
    const noteRaw = String(row.tester_note || '').trim();
    const isVerifiedReceipt =
      snippet === 'Clean' && noteRaw.includes('PASS_VERIFIED_4STAGE');

    if (isVerifiedReceipt) {
      let parsedNote: any = null;
      try {
        parsedNote = JSON.parse(noteRaw);
      } catch {
        parsedNote = null;
      }
      const receiptHash = String(parsedNote?.dna_hash || '').trim();
      if (!receiptHash || !isValidPassingLabCertProof(certProof, receiptHash)) {
        throw new Error(
          'Forbidden: Verified Lab certificate proof is required to record a 4-stage pass receipt.'
        );
      }

      const { data: verRow } = await gameDb
        .from('mod_versions')
        .select('id, mod_id, mods(compliance_tier, status)')
        .eq('dna_hash', receiptHash)
        .maybeSingle();

      if (verRow) {
        const parentMod = Array.isArray(verRow.mods) ? verRow.mods[0] : verRow.mods;
        const tier = Number(parentMod?.compliance_tier ?? 0);
        const statusLower = String(parentMod?.status || '').trim().toLowerCase();
        if (tier !== 0 || statusLower === 'rejected') {
          throw new Error('Forbidden: Only Tier 0 artifacts may record Architect Lab receipts.');
        }
        return;
      }

      const { data: scoutRow } = await gameDb
        .from('scout_suggestions')
        .select('id, status, compliance_tier, suggested_metadata')
        .eq('dna_hash', receiptHash)
        .neq('status', 'rejected')
        .limit(1)
        .maybeSingle();

      const scoutTier = Number(
        scoutRow?.compliance_tier ?? scoutRow?.suggested_metadata?.compliance_tier ?? 0
      );
      if (!scoutRow || scoutTier !== 0) {
        throw new Error(
          'Forbidden: Unknown hashes cannot write to Architect Lab logs unless queued in Tier 0 Scout or Creator Queue.'
        );
      }
      return;
    }

    // Diagnostic / exception submission to Architects: STRICTLY known Tier 0 hashes only
    if (!row.mod_id || !row.version_id) {
      throw new Error(
        'Forbidden: Submit to Architects only accepts known Tier 0 catalog hashes.'
      );
    }
    const { data: verRow } = await gameDb
      .from('mod_versions')
      .select('id, mod_id, dna_hash, mods(id, compliance_tier, status)')
      .eq('id', row.version_id)
      .maybeSingle();
    const parentMod = Array.isArray(verRow?.mods) ? verRow.mods[0] : verRow?.mods;
    const tier = Number(parentMod?.compliance_tier ?? -1);
    const statusLower = String(parentMod?.status || '').trim().toLowerCase();
    if (
      !verRow ||
      String(verRow.mod_id) !== String(row.mod_id) ||
      !verRow.dna_hash ||
      !parentMod ||
      tier !== 0 ||
      statusLower === 'unverified' ||
      statusLower === 'rejected'
    ) {
      throw new Error(
        'Forbidden: Submit to Architects only accepts known Tier 0 hashes. Unknown Tier 0 hashes must be uploaded via Scout or Creator Queue with a passing Lab test.'
      );
    }
  } else if (cleanTable === 'sanctuary_tickets') {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    if (Array.isArray(meta.restricted_violations) && meta.restricted_violations.length > 0) {
      throw new Error(
        'Forbidden: Support tickets containing non-Tier-0 or unknown artifacts cannot be submitted to Architects.'
      );
    }
    if (meta.target_mod_id) {
      const { data: tMod } = await gameDb
        .from('mods')
        .select('id, compliance_tier, status, mod_versions(id)')
        .eq('id', meta.target_mod_id)
        .maybeSingle();
      const tier = Number(tMod?.compliance_tier ?? -1);
      const statusLower = String(tMod?.status || '').trim().toLowerCase();
      const hasKnownVersion =
        Array.isArray(tMod?.mod_versions) && tMod.mod_versions.length > 0;
      if (
        !tMod ||
        tier !== 0 ||
        statusLower === 'unverified' ||
        statusLower === 'rejected' ||
        !hasKnownVersion
      ) {
        throw new Error(
          'Forbidden: Support tickets only accept known Tier 0 catalog artifacts.'
        );
      }
    }
  } else if (cleanTable === 'scout_suggestions') {
    const tier = Number(
      row.compliance_tier ?? row.suggested_metadata?.compliance_tier ?? 0
    );
    if (tier !== 0) {
      throw new Error('Forbidden: Scout Queue only accepts Tier 0 artifacts.');
    }
    row.compliance_tier = 0;

    const dnaHash = String(row.dna_hash || '').trim();
    if (!dnaHash || dnaHash === 'calculating') {
      throw new Error('Forbidden: Valid SHA-256 hash required for Scout Queue upload.');
    }

    const { data: existingVer } = await gameDb
      .from('mod_versions')
      .select('id, mod_id, mods(compliance_tier, status)')
      .eq('dna_hash', dnaHash)
      .maybeSingle();

    const parentMod = Array.isArray(existingVer?.mods)
      ? existingVer.mods[0]
      : existingVer?.mods;
    if (existingVer && parentMod && Number(parentMod.compliance_tier || 0) !== 0) {
      throw new Error('Forbidden: Non-Tier-0 hashes cannot be submitted to Scout Queue.');
    }

    const isKnownApprovedTier0 =
      Boolean(existingVer && parentMod) &&
      Number(parentMod.compliance_tier || 0) === 0 &&
      !['unverified', 'rejected'].includes(
        String(parentMod.status || '').trim().toLowerCase()
      );

    if (!isKnownApprovedTier0) {
      const hasPass =
        isValidPassingLabCertProof(certProof, dnaHash) ||
        (await hasExistingCloudPassingLabReceipt(gameDb, dnaHash, existingVer?.id));
      if (!hasPass) {
        throw new Error(
          'Forbidden: Unknown Tier 0 Scout Queue uploads require a passing 4-stage Lab test.'
        );
      }
    }
  } else if (cleanTable === 'mods') {
    const tier = Number(row.compliance_tier || 0);
    if (!Number.isFinite(tier) || tier < 0 || tier >= 5) {
      throw new Error('Forbidden: Invalid compliance tier.');
    }
    if (tier >= 1 && tier <= 4) {
      row.compliance_tier = Math.min(4, Math.max(1, Math.round(tier)));
      row.status = 'pending';
    }
  } else if (cleanTable === 'mod_versions') {
    const dnaHash = String(row.dna_hash || '').trim();
    if (!row.mod_id || !dnaHash || dnaHash === 'calculating') {
      throw new Error('Forbidden: mod_id and valid dna_hash are required.');
    }
    const [{ data: parentMod }, { data: existingVer }] = await Promise.all([
      gameDb
        .from('mods')
        .select('id, compliance_tier, status')
        .eq('id', row.mod_id)
        .maybeSingle(),
      gameDb
        .from('mod_versions')
        .select('id, mod_id')
        .eq('dna_hash', dnaHash)
        .maybeSingle(),
    ]);

    if (!parentMod) {
      throw new Error('Forbidden: Parent artifact record does not exist.');
    }
    const tier = Number(parentMod.compliance_tier || 0);
    const statusLower = String(parentMod.status || '').trim().toLowerCase();
    const isKnownApprovedTier0 =
      Boolean(existingVer) &&
      tier === 0 &&
      statusLower !== 'unverified' &&
      statusLower !== 'rejected';

    if (tier === 0 && !isKnownApprovedTier0) {
      const hasPass =
        isValidPassingLabCertProof(certProof, dnaHash) ||
        (await hasExistingCloudPassingLabReceipt(gameDb, dnaHash, existingVer?.id));
      if (!hasPass) {
        throw new Error(
          'Forbidden: Unknown Tier 0 Creator Queue uploads require a passing 4-stage Lab test.'
        );
      }
    }
  }
}


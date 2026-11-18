// @ts-nocheck
import {
  UUID_REGEX,
  detectCredentialKind,
  maskCredentialFingerprint,
  sealSpokeEnvelope,
  verifySpokeCredentialHandshake,
} from './cryptoEnvelope.ts'
import {
  invalidateSpokeGameConfigCache,
  assertNoOversizedInlineImageBlobs,
  enforceArchitectSubmissionCompliance,
} from './spokeAccessAndOwnership.ts'

export function createSpokeOwnershipHelpers(ctx: {
  gameDb: any;
  v_user_id: string;
  isCallerStaff: boolean;
}) {
  const { gameDb, v_user_id, isCallerStaff } = ctx;
    let cachedMasonIdsPromise: Promise<Set<string>> | null = null;
    async function getCallerOwnedMasonIds(): Promise<Set<string>> {
      if (!cachedMasonIdsPromise) {
        cachedMasonIdsPromise = (async () => {
          const { data: mRows } = await gameDb
            .from('masons')
            .select('id')
            .eq('profile_id', v_user_id)
          return new Set((mRows || []).map((r: any) => String(r.id)))
        })();
      }
      return cachedMasonIdsPromise;
    }

    let cachedVerifiedMasonPromise: Promise<boolean> | null = null;
    async function getIsCallerVerifiedMason(): Promise<boolean> {
      if (!cachedVerifiedMasonPromise) {
        cachedVerifiedMasonPromise = (async () => {
          const { data: mRows } = await gameDb
            .from('masons')
            .select('id')
            .eq('profile_id', v_user_id)
            .eq('is_verified', true)
            .limit(1)
          return Array.isArray(mRows) && mRows.length > 0
        })();
      }
      return cachedVerifiedMasonPromise;
    }

    async function assertOwnedCollectionSetId(
      setId: unknown,
      errorMessage = 'Forbidden: Collection set_id must belong to your Creator profile'
    ): Promise<void> {
      const cleanSetId = String(setId || '').trim()
      if (!cleanSetId) {
        throw new Error(errorMessage)
      }
      const ownedMasons = await getCallerOwnedMasonIds()
      const { data: colEx } = await gameDb
        .from('collections')
        .select('mason_id')
        .eq('id', cleanSetId)
        .maybeSingle()
      if (!colEx || !ownedMasons.has(String(colEx.mason_id))) {
        throw new Error(errorMessage)
      }
    }

    let cachedModIdsPromise: Promise<Set<string>> | null = null;
    async function getCallerOwnedModIds(): Promise<Set<string>> {
      if (!cachedModIdsPromise) {
        cachedModIdsPromise = (async () => {
          const ownedMasons = await getCallerOwnedMasonIds()
          const mIds = Array.from(ownedMasons)
          if (mIds.length === 0) return new Set<string>()
          const { data: modRows } = await gameDb
            .from('mods')
            .select('id')
            .in('mason_id', mIds)
          return new Set((modRows || []).map((r: any) => String(r.id)))
        })();
      }
      return cachedModIdsPromise;
    }

    let cachedStagingOwnerTagPromise: Promise<string> | null = null;
    async function getCallerStagingOwnerTag(): Promise<string> {
      if (!cachedStagingOwnerTagPromise) {
        cachedStagingOwnerTagPromise = (async () => {
          const enc = new TextEncoder().encode(`sanctuary_gw_staging_owner_v1:${v_user_id}`)
          const digest = await crypto.subtle.digest('SHA-256', enc)
          return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        })();
      }
      return cachedStagingOwnerTagPromise;
    }

    async function assertOwnedCreatorChildRow(
      tableName: string,
      row: Record<string, any>,
      isExistingUpdate = false
    ): Promise<void> {
      if (isCallerStaff) return
      const ownedMods = await getCallerOwnedModIds()
      if (tableName === 'mod_versions') {
        const modId = row?.mod_id ? String(row.mod_id) : ''
        if (!modId || !ownedMods.has(modId)) {
          throw new Error('Forbidden: mod_versions mod_id must belong to your owned artifacts')
        }
        if (row?.id) {
          const { data: ex } = await gameDb
            .from('mod_versions')
            .select('mod_id')
            .eq('id', row.id)
            .maybeSingle()
          if (ex && (!ex.mod_id || !ownedMods.has(String(ex.mod_id)))) {
            throw new Error('Forbidden: Cannot modify version of another Creator artifact')
          }
        }
      } else if (tableName === 'mod_bundles') {
        const primaryId = row?.primary_id ? String(row.primary_id) : ''
        if (!primaryId || !ownedMods.has(primaryId)) {
          throw new Error('Forbidden: mod_bundles primary_id must belong to your owned artifacts')
        }
        if (row?.id) {
          const { data: ex } = await gameDb
            .from('mod_bundles')
            .select('primary_id')
            .eq('id', row.id)
            .maybeSingle()
          if (ex && (!ex.primary_id || !ownedMods.has(String(ex.primary_id)))) {
            throw new Error('Forbidden: Cannot modify bundle of another Creator artifact')
          }
        }
      } else if (tableName === 'mod_dependencies' || tableName === 'mod_relationships') {
        const parentId = row?.parent_id ? String(row.parent_id) : ''
        if (!parentId || !ownedMods.has(parentId)) {
          throw new Error(`Forbidden: ${tableName} parent_id must belong to your owned artifacts`)
        }
        if (row?.id) {
          const { data: ex } = await gameDb
            .from(tableName)
            .select('parent_id')
            .eq('id', row.id)
            .maybeSingle()
          if (ex && (!ex.parent_id || !ownedMods.has(String(ex.parent_id)))) {
            throw new Error(`Forbidden: Cannot modify ${tableName} of another Creator artifact`)
          }
        }
      } else if (tableName === 'version_dependencies') {
        const pHash = String(row?.parent_hash || '').trim()
        if (!pHash) {
          throw new Error('Forbidden: version_dependencies requires parent_hash')
        }
        const { data: verRow } = await gameDb
          .from('mod_versions')
          .select('mod_id')
          .eq('dna_hash', pHash)
          .maybeSingle()
        if (!verRow?.mod_id || !ownedMods.has(String(verRow.mod_id))) {
          throw new Error('Forbidden: version_dependencies parent_hash must belong to your owned artifacts')
        }
      } else if (tableName === 'community_groups' || tableName === 'community_group_members') {
        throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
      } else if (tableName === 'logical_conflicts') {
        if (isExistingUpdate) {
          throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
        }
        const modAId = row?.mod_a_id ? String(row.mod_a_id) : ''
        const modBId = row?.mod_b_id ? String(row.mod_b_id) : ''
        if ((!modAId || !ownedMods.has(modAId)) && (!modBId || !ownedMods.has(modBId))) {
          throw new Error('Forbidden: logical_conflicts entry must reference one of your owned artifacts')
        }
        row.status = 'pending'
      } else if (tableName === 'homestead_workbench_templates') {
        throw new Error('Forbidden: Staff clearance required to modify shared Workbench templates')
      }
    }
  return {
    getCallerOwnedMasonIds,
    getIsCallerVerifiedMason,
    assertOwnedCollectionSetId,
    getCallerOwnedModIds,
    getCallerStagingOwnerTag,
    assertOwnedCreatorChildRow,
  };
}

export async function handleSpokeMutationAction(ctx: {
  action: string;
  payload: any;
  game: any;
  gameDb: any;
  v_user_id: string;
  hubUsername: string;
  hubRole: string;
  hubIsBanned: boolean;
  hubBlacklistReason: string | null;
  callerSpokeProfile: any;
  callerSpokeRole: string;
  isCallerBanned: boolean;
  isCallerStaff: boolean;
  isCallerCreatorOrStaff: boolean;
  resolvedCredentialKind: any;
  resolvedKeyVersion: any;
  resolvedKeyFingerprint: any;
  resolvedRotatedAt: any;
  supabaseAdmin: any;
  getCallerOwnedMasonIds: () => Promise<Set<string>>;
  getIsCallerVerifiedMason: () => Promise<boolean>;
  assertOwnedCollectionSetId: (setId: unknown, errorMessage?: string) => Promise<void>;
  getCallerOwnedModIds: () => Promise<Set<string>>;
  assertOwnedCreatorChildRow: (tableName: string, row: Record<string, any>, isExistingUpdate?: boolean) => Promise<void>;
}): Promise<any> {
  const {
    action, payload, game, gameDb, v_user_id, hubUsername, hubRole, hubIsBanned, hubBlacklistReason,
    callerSpokeProfile, callerSpokeRole, isCallerBanned, isCallerStaff, isCallerCreatorOrStaff,
    resolvedCredentialKind, resolvedKeyVersion, resolvedKeyFingerprint, resolvedRotatedAt,
    supabaseAdmin, getCallerOwnedMasonIds, getIsCallerVerifiedMason, assertOwnedCollectionSetId,
    getCallerOwnedModIds, assertOwnedCreatorChildRow,
  } = ctx;
  let resultData: any = null;

  switch (action) {
      case 'sync_spoke_profile': {
        const rawCommitment = String(payload?.relink_commitment_hash || '').trim().toLowerCase()
        if (/^[0-9a-f]{64}$/.test(rawCommitment)) {
          try {
            await gameDb.rpc('internal_upsert_spoke_relink_commitment', {
              p_profile_id: v_user_id,
              p_commitment_hash: rawCommitment,
            })
          } catch (_e) {
            // Best-effort on Spokes running older schemas
          }
        }
        resultData = {
          ...callerSpokeProfile,
          os_role: hubRole
        }
        break;
      }
      case 'register_relink_commitment': {
        const rawCommitment = String(payload?.relink_commitment_hash || '').trim().toLowerCase()
        if (!/^[0-9a-f]{64}$/.test(rawCommitment)) {
          throw new Error('Invalid SHA-256 relink commitment hash')
        }
        const { data: commitRes, error: commitErr } = await gameDb.rpc(
          'internal_upsert_spoke_relink_commitment',
          {
            p_profile_id: v_user_id,
            p_commitment_hash: rawCommitment,
          }
        )
        if (commitErr) throw commitErr
        resultData = commitRes || { ok: true }
        break;
      }
      case 'update_spoke_profile': {
        const { target_user_id, updates } = payload || {}
        if (!target_user_id || !updates) throw new Error('Missing target_user_id or updates')

        const isSelfBan = target_user_id === v_user_id && updates.is_banned === true && Object.keys(updates).every(k => ['is_banned', 'blacklist_reason'].includes(k))
        const isKeeperOrWayfinder = isFoundryTestNodeKeeper || callerSpokeRole === 'wayfinder'
        const isOversight = callerSpokeRole === 'oversight'
        const isArchitectMasonPromote = (callerSpokeRole === 'architect' || callerSpokeRole === 'senior_architect') && Object.keys(updates).length === 1 && updates.role === 'mason'

        if (!isSelfBan && !isKeeperOrWayfinder && !isOversight && !isArchitectMasonPromote) {
          throw new Error('Forbidden: Insufficient permissions to update Spoke profile')
        }

        const { data: targetSpoke } = await gameDb
          .from('profiles')
          .select('id, role')
          .eq('id', target_user_id)
          .maybeSingle()

        if (isOversight && !isKeeperOrWayfinder) {
          if (['oversight', 'wayfinder', 'admin'].includes(targetSpoke?.role) || ['oversight', 'wayfinder', 'admin'].includes(updates.role)) {
            throw new Error('Forbidden: Oversight cannot modify Wayfinder, Admin, or Oversight roles')
          }
        }

        if (!targetSpoke) {
          const { data: targetHub } = await supabaseAdmin
            .from('profiles')
            .select('id, username, is_banned, blacklist_reason')
            .eq('id', target_user_id)
            .maybeSingle()
          if (targetHub) {
            await gameDb.from('profiles').insert({
              id: targetHub.id,
              username: targetHub.username || ('Citizen_' + targetHub.id.substring(0, 6)),
              role: 'citizen',
              is_banned: targetHub.is_banned ?? false,
              blacklist_reason: targetHub.blacklist_reason ?? null
            })
          }
        }

        const allowedFields: Record<string, any> = {}
        if (updates.role !== undefined && !isSelfBan) allowedFields.role = updates.role
        if (updates.is_banned !== undefined) allowedFields.is_banned = updates.is_banned
        if (updates.blacklist_reason !== undefined) allowedFields.blacklist_reason = updates.blacklist_reason
        if (updates.is_comm_banned !== undefined) allowedFields.is_comm_banned = updates.is_comm_banned
        if (updates.comm_blacklist_reason !== undefined) allowedFields.comm_blacklist_reason = updates.comm_blacklist_reason

        const { data: updatedRows, error: updateErr } = await gameDb
          .from('profiles')
          .update(allowedFields)
          .eq('id', target_user_id)
          .select()

        if (updateErr) throw updateErr

        if ((hubRole === 'keeper' || isSelfBan) && (updates.is_banned !== undefined || updates.blacklist_reason !== undefined)) {
          const hubBanUpdate: Record<string, any> = {}
          if (updates.is_banned !== undefined) hubBanUpdate.is_banned = updates.is_banned
          if (updates.blacklist_reason !== undefined) hubBanUpdate.blacklist_reason = updates.blacklist_reason
          await supabaseAdmin
            .from('profiles')
            .update(hubBanUpdate)
            .eq('id', target_user_id)
        }

        resultData = updatedRows
        break;
      }
      case 'follow_mason': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { mason_id } = payload
        const { error } = await gameDb.from('mason_followers').insert({
          user_id: v_user_id,
          mason_id: mason_id
        })
        if (error && error.code !== '23505') throw error
        resultData = { success: true, following: true }
        break;
      }
      case 'unfollow_mason': {
        const { mason_id } = payload
        const { error } = await gameDb.from('mason_followers').delete()
          .match({ user_id: v_user_id, mason_id: mason_id })
        if (error) throw error
        resultData = { success: true, following: false }
        break;
      }
      case 'update_mason_profile': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { mason_id, profile_data } = payload || {}
        if (!mason_id || !profile_data || typeof profile_data !== 'object') {
          throw new Error('Missing mason_id or profile_data')
        }

        const { data: mason, error: masonError } = await gameDb
          .from('masons')
          .select('profile_id')
          .eq('id', mason_id)
          .single()

        if (masonError || !mason) throw new Error('Mason not found')
        const isOwner = mason.profile_id === v_user_id
        if (!isOwner && !isCallerStaff) {
          throw new Error('Forbidden: You do not own this mason profile')
        }

        const sanitizedData: Record<string, any> = {}
        const ownerAllowedKeys = [
          'name',
          'bio',
          'avatar_url',
          'patreon_url',
          'donation_url',
          'payment_processor',
          'patreon_campaign_id',
          'website_url',
          'discord_url',
          'pinned_mod_id',
          'pinned_asset_id',
          'pinned_blueprint_id',
          'pinned_collection_id',
        ]
        const staffExtraKeys = ['is_verified', 'profile_id', 'followers_count']
        const allowedKeys = isCallerStaff ? [...ownerAllowedKeys, ...staffExtraKeys] : ownerAllowedKeys

        const normalizedInput = normalizeSpokeTableRow('masons', profile_data)
        for (const k of allowedKeys) {
          if (normalizedInput[k] !== undefined) {
            sanitizedData[k] = normalizedInput[k]
          }
        }

        let updatedMason: any = null
        let updateError: any = null
        const masonPayload = { ...sanitizedData }
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await gameDb
            .from('masons')
            .update(masonPayload)
            .eq('id', mason_id)
            .select()
            .single()
          updatedMason = res.data
          updateError = res.error
          if (!updateError) break
          const missingColMatch = String(updateError.message || '').match(/Could not find the '([^']+)' column/i)
          if (missingColMatch && missingColMatch[1] && Object.prototype.hasOwnProperty.call(masonPayload, missingColMatch[1])) {
            delete masonPayload[missingColMatch[1]]
            continue
          }
          break
        }

        if (updateError) throw updateError
        resultData = updatedMason
        break;
      }
      case 'dispatch_broadcast_notifications': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const {
          mason_id,
          type = 'system_broadcast',
          reference_id = null,
          message = '',
          exclude_self = true,
        } = payload || {}

        const cleanMsg = String(message || '').trim()
        if (!cleanMsg) throw new Error('Missing notification message')

        let recipientIds: string[] = []
        if (mason_id) {
          if (!isCallerStaff) {
            const isVerifiedMason = await getIsCallerVerifiedMason()
            if (!isVerifiedMason) {
              throw new Error('Forbidden: Verified Creator status is required to dispatch Comm-Link follower notifications')
            }
            const ownedMasons = await getCallerOwnedMasonIds()
            if (!ownedMasons.has(String(mason_id))) {
              throw new Error('Forbidden: You can only notify followers of your own Creator profile')
            }
          }
          const { data: followerRows, error: folErr } = await gameDb
            .from('mason_followers')
            .select('user_id')
            .eq('mason_id', mason_id)
          if (folErr) throw folErr
          recipientIds = (followerRows || [])
            .map((r: any) => String(r.user_id || ''))
            .filter(Boolean)
        } else {
          if (!isCallerStaff) {
            throw new Error('Forbidden: Staff clearance required for community-wide broadcast notifications')
          }
          const { data: profRows, error: profErr } = await gameDb
            .from('profiles')
            .select('id')
            .eq('is_banned', false)
          if (profErr) throw profErr
          recipientIds = (profRows || [])
            .map((r: any) => String(r.id || ''))
            .filter(Boolean)
        }

        const uniqueRecipients = Array.from(new Set(recipientIds)).filter(
          (uid) => !exclude_self || uid !== v_user_id
        )

        let insertedCount = 0
        const CHUNK_SIZE = 500
        for (let i = 0; i < uniqueRecipients.length; i += CHUNK_SIZE) {
          const batch = uniqueRecipients.slice(i, i + CHUNK_SIZE).map((uid) => ({
            user_id: uid,
            actor_id: v_user_id,
            type: String(type),
            reference_id: reference_id || null,
            message: cleanMsg,
            is_read: false,
          }))
          const { error: insErr } = await gameDb.from('notifications').insert(batch)
          if (insErr) throw insErr
          insertedCount += batch.length
        }

        resultData = { success: true, dispatched: insertedCount }
        break;
      }
      case 'bulk_ingest_vault_mods': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const canBulkIngest = isCallerStaff || (await getIsCallerVerifiedMason())
        if (!canBulkIngest) {
          throw new Error('Forbidden: Verified Creator or Staff clearance required for bulk registry ingestion')
        }
        const items = Array.isArray(payload?.items) ? payload.items : []
        if (items.length === 0) {
          resultData = { success: true, processed: 0 }
          break
        }
        const { data: rpcRes, error: rpcErr } = await gameDb.rpc('bulk_ingest_vault_mods', {
          p_items: items,
        })
        if (rpcErr) throw rpcErr
        resultData = rpcRes
        break;
      }
      case 'upsert_cloud_file': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { target_table, payload_data } = payload || {}
        const cleanTable = String(target_table || '').trim().toLowerCase()

        if (!cleanTable || !payload_data) {
          throw new Error('Missing target_table or payload_data')
        }

        const restrictedTables = ['profiles', 'auth.users', 'hardware_bans']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Insufficient permissions to modify ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (cleanTable === 'masons') {
            if (!isCallerCreatorOrStaff) {
              throw new Error(`Forbidden: Creator or Staff role required to modify ${cleanTable}`)
            }
          } else if (!isCallerStaff && !(await getIsCallerVerifiedMason())) {
            throw new Error(`Forbidden: Verified Creator or Staff clearance required to modify ${cleanTable}`)
          }
        } else if (!CITIZEN_TABLES.has(cleanTable)) {
          throw new Error(`Forbidden: Table ${cleanTable} is not in the allowed gateway registry`)
        }

        const isArrayInput = Array.isArray(payload_data)
        const rawRows = (isArrayInput ? payload_data : [payload_data]).map((r) =>
          normalizeSpokeTableRow(cleanTable, r)
        )

        // Architects flagging Tier 1-4 on mods/collections always route to Oversight Compliance as 'pending'
        if (isArchitectOnlyStaff && (cleanTable === 'mods' || cleanTable === 'collections')) {
          for (const row of rawRows) {
            if (row && typeof row === 'object' && Number(row.compliance_tier || 0) >= 1) {
              row.compliance_tier = Math.min(4, Math.max(1, Math.round(Number(row.compliance_tier))))
              row.status = 'pending'
            }
          }
        }

        // Oversight cannot link/unlink Mason entities belonging to Wayfinder/Oversight/Admin accounts
        if (isOversightOnlyStaff && cleanTable === 'masons') {
          for (const row of rawRows) {
            if (!row || typeof row !== 'object') continue
            if (row.profile_id) {
              const { data: targetProf } = await gameDb
                .from('profiles')
                .select('role')
                .eq('id', row.profile_id)
                .maybeSingle()
              if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
              }
            }
            if (row.id) {
              const { data: exMason } = await gameDb
                .from('masons')
                .select('profile_id')
                .eq('id', row.id)
                .maybeSingle()
              if (exMason?.profile_id) {
                const { data: exProf } = await gameDb
                  .from('profiles')
                  .select('role')
                  .eq('id', exMason.profile_id)
                  .maybeSingle()
                if (exProf && ['wayfinder', 'oversight', 'admin'].includes(String(exProf.role || '').toLowerCase())) {
                  throw new Error('Forbidden: Oversight cannot modify Creator records owned by Wayfinder or Oversight')
                }
              }
            }
          }
        }

        // Strict row-ownership & anti-IDOR enforcement for non-staff callers
        if (!isCallerStaff) {
          const ownedMasons =
            cleanTable === 'masons' ||
            cleanTable === 'mason_posts' ||
            cleanTable === 'collections' ||
            cleanTable === 'collection_members' ||
            cleanTable === 'blueprints' ||
            cleanTable === 'mods'
              ? await getCallerOwnedMasonIds()
              : new Set<string>()

          for (const row of rawRows) {
            if (!row || typeof row !== 'object') {
              throw new Error('Invalid payload row')
            }

            if (cleanTable === 'audit_logs') {
              row.actor_id = v_user_id
              delete row.id
            } else if (cleanTable === 'mason_post_comments') {
              if (callerSpokeProfile?.is_comm_banned) {
                throw new Error('Forbidden: Community posting privileges are suspended')
              }
              row.author_id = v_user_id
              delete row.is_hidden
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('mason_post_comments')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot modify another citizen comment')
                }
              }
            } else if (
              cleanTable === 'mason_post_likes' ||
              cleanTable === 'mason_post_views' ||
              cleanTable === 'dispatch_poll_votes'
            ) {
              row.user_id = v_user_id
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('user_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.user_id !== v_user_id) {
                  throw new Error(`Forbidden: Cannot modify another citizen record in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'blueprints') {
              if (row.mason_id && row.mason_id !== v_user_id && !ownedMasons.has(String(row.mason_id))) {
                throw new Error('Forbidden: Blueprint mason_id must belong to caller')
              }
              if (!row.mason_id) {
                row.mason_id = v_user_id
              }
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('blueprints')
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.mason_id !== v_user_id && !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Blueprint')
                }
              }
              if (row.code) {
                const { data: exByCode } = await gameDb
                  .from('blueprints')
                  .select('id, mason_id')
                  .eq('code', row.code)
                  .maybeSingle()
                if (exByCode && exByCode.mason_id !== v_user_id && !ownedMasons.has(String(exByCode.mason_id))) {
                  throw new Error('Forbidden: Blueprint code belongs to another citizen')
                }
              }
            } else if (cleanTable === 'nexus_assets') {
              const isVerifiedMason = await getIsCallerVerifiedMason()
              if (!isVerifiedMason) {
                throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
              }
              row.author_id = v_user_id
              delete row.is_community_default
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('nexus_assets')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Nexus asset')
                }
              }
            } else if (cleanTable === 'sanctuary_tickets') {
              row.author_id = (row.author_id === null || row.metadata?.is_anonymous === true) ? null : v_user_id
              delete row.assigned_to
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('sanctuary_tickets')
                  .select('author_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.author_id && ex.author_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot modify another citizen ticket')
                }
              }
            } else if (
              cleanTable === 'content_flags' ||
              cleanTable === 'nexus_reports' ||
              cleanTable === 'blueprint_reports'
            ) {
              row.reporter_id = null
              if ('reporter_name' in row || cleanTable !== 'content_flags') {
                row.reporter_name = 'Anonymous'
              }
              delete row.resolved_by
              delete row.resolution_note
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('reporter_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.reporter_id && ex.reporter_id !== v_user_id) {
                  throw new Error(`Forbidden: Cannot overwrite another report in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'scout_suggestions') {
              row.submitter_id = null
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('scout_suggestions')
                  .select('submitter_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.submitter_id && ex.submitter_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen Scout suggestion')
                }
              }
            } else if (cleanTable === 'notifications') {
              if (row.user_id && String(row.user_id) !== v_user_id) {
                throw new Error('Forbidden: Cannot create notification for another citizen')
              }
              row.user_id = v_user_id
              row.actor_id = v_user_id
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('notifications')
                  .select('user_id, actor_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && ex.user_id !== v_user_id && ex.actor_id !== v_user_id) {
                  throw new Error('Forbidden: Cannot overwrite another citizen notification')
                }
              }
            } else if (cleanTable === 'citizen_staging_queue') {
              if (!row.user_token || String(row.user_token).length < 16) {
                throw new Error('Invalid staging token')
              }
              const callerOwnerTag = await getCallerStagingOwnerTag()
              if (row.id) {
                const { data: ex } = await gameDb
                  .from('citizen_staging_queue')
                  .select('user_token, owner_tag')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && (ex.user_token !== row.user_token || (ex.owner_tag && ex.owner_tag !== callerOwnerTag))) {
                  throw new Error('Forbidden: Staging queue ownership mismatch')
                }
              }
              row.owner_tag = callerOwnerTag
            } else if (cleanTable === 'masons') {
              delete row.is_verified
              delete row.followers_count
              if (row.id) {
                if (!ownedMasons.has(String(row.id))) {
                  throw new Error('Forbidden: You can only update your own Creator profile')
                }
              }
              row.profile_id = v_user_id
            } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
              const isVerifiedMason = await getIsCallerVerifiedMason()
              if (!isVerifiedMason) {
                throw new Error(
                  cleanTable === 'mason_posts'
                    ? 'Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches'
                    : 'Forbidden: Verified Creator status is required to publish or update Nexus collections'
                )
              }
              if (!row.mason_id || !ownedMasons.has(String(row.mason_id))) {
                throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
              }
              if (cleanTable === 'collections') {
                delete row.is_official
              }
              if (row.id) {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (ex && !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error(`Forbidden: Cannot overwrite another Creator record in ${cleanTable}`)
                }
              }
            } else if (cleanTable === 'collection_members') {
              await assertOwnedCollectionSetId(row.set_id)
              if (row.id) {
                const { data: exMember } = await gameDb
                  .from('collection_members')
                  .select('set_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (exMember?.set_id && String(exMember.set_id) !== String(row.set_id)) {
                  await assertOwnedCollectionSetId(exMember.set_id)
                }
              }
            } else if (cleanTable === 'mods') {
              if (row.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                delete row.highlander_group_id
              }
              if (row.id) {
                const { data: exMod } = await gameDb
                  .from('mods')
                  .select('mason_id')
                  .eq('id', row.id)
                  .maybeSingle()
                if (exMod?.mason_id && !ownedMasons.has(String(exMod.mason_id))) {
                  const { data: ownerMason } = await gameDb
                    .from('masons')
                    .select('profile_id')
                    .eq('id', exMod.mason_id)
                    .maybeSingle()
                  if (ownerMason?.profile_id && ownerMason.profile_id !== v_user_id) {
                    throw new Error('Forbidden: Cannot overwrite an artifact owned by another claimed Creator')
                  }
                }
              }
            } else if (
              cleanTable === 'mod_versions' ||
              cleanTable === 'mod_bundles' ||
              cleanTable === 'mod_dependencies' ||
              cleanTable === 'mod_relationships' ||
              cleanTable === 'version_dependencies' ||
              cleanTable === 'community_groups' ||
              cleanTable === 'community_group_members' ||
              cleanTable === 'logical_conflicts' ||
              cleanTable === 'homestead_workbench_templates'
            ) {
              await assertOwnedCreatorChildRow(cleanTable, row, false)
            }
            await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, false)
          }
        } else {
          for (const row of rawRows) {
            await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, true)
          }
        }

        let currentPayload: any = isArrayInput ? rawRows : rawRows[0]
        let data: any = null
        let error: any = null

        for (let attempt = 0; attempt < 6; attempt++) {
          const res = await gameDb
            .from(cleanTable)
            .upsert(currentPayload)
            .select()
          data = res.data
          error = res.error
          if (!error) break
          const missingColMatch = String(error.message || '').match(/Could not find the '([^']+)' column/i)
          const missingCol = missingColMatch?.[1]
          if (missingCol) {
            if (Array.isArray(currentPayload)) {
              currentPayload = currentPayload.map((row) => {
                if (row && typeof row === 'object') {
                  const next = { ...row }
                  delete next[missingCol]
                  return next
                }
                return row
              })
              continue
            } else if (currentPayload && typeof currentPayload === 'object' && Object.prototype.hasOwnProperty.call(currentPayload, missingCol)) {
              if (missingCol === 'image_url' && currentPayload.image_url && typeof currentPayload.content === 'string') {
                currentPayload.content = `[IMG:${currentPayload.image_url}]\n\n` + currentPayload.content
              }
              delete currentPayload[missingCol]
              continue
            }
          }
          break
        }

        if (error) {
          if (error.code === '23505' && cleanTable === 'mason_post_views') {
            resultData = [payload_data]
          } else {
            throw error
          }
        } else {
          resultData = data
        }
        break;
      }
      case 'delete_cloud_file': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const { target_table, id_value } = payload || {}
        const cleanTable = String(target_table || '').trim().toLowerCase()

        if (!cleanTable || id_value === undefined || id_value === null) {
          throw new Error('Missing target_table or id_value')
        }

        const restrictedTables = ['profiles', 'auth.users', 'audit_logs', 'hardware_bans']
        if (restrictedTables.includes(cleanTable)) {
          throw new Error('Forbidden table target')
        }

        if (STAFF_ONLY_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
          }
        } else if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
          if (
            cleanTable === 'masons' ||
            cleanTable === 'mason_posts' ||
            cleanTable === 'collections' ||
            cleanTable === 'collection_members'
          ) {
            if (!isCallerCreatorOrStaff) {
              throw new Error(`Forbidden: Creator or Staff role required to delete from ${cleanTable}`)
            }
            if (!isCallerStaff) {
              const ownedMasons = await getCallerOwnedMasonIds()
              if (cleanTable === 'masons') {
                if (!ownedMasons.has(String(id_value))) {
                  throw new Error('Forbidden: You can only delete your own Creator profile')
                }
              } else if (cleanTable === 'collection_members') {
                const { data: exMember } = await gameDb
                  .from('collection_members')
                  .select('set_id')
                  .eq('id', id_value)
                  .maybeSingle()
                const { data: exCol } = exMember?.set_id
                  ? await gameDb
                      .from('collections')
                      .select('mason_id')
                      .eq('id', exMember.set_id)
                      .maybeSingle()
                  : { data: null }
                if (!exMember?.set_id || !exCol || !ownedMasons.has(String(exCol.mason_id))) {
                  throw new Error('Forbidden: You can only delete members of your own collections')
                }
              } else {
                const { data: ex } = await gameDb
                  .from(cleanTable)
                  .select('mason_id')
                  .eq('id', id_value)
                  .maybeSingle()
                if (!ex || !ownedMasons.has(String(ex.mason_id))) {
                  throw new Error(`Forbidden: You can only delete your own records in ${cleanTable}`)
                }
              }
            }
          } else if (!isCallerStaff) {
            if (!(await getIsCallerVerifiedMason())) {
              throw new Error(`Forbidden: Verified Creator or Staff clearance required to delete from ${cleanTable}`)
            }
            if (cleanTable === 'mods') {
              throw new Error('Forbidden: Creators cannot delete cloud registry artifacts directly')
            }
            if (
              cleanTable === 'logical_conflicts' ||
              cleanTable === 'community_groups' ||
              cleanTable === 'community_group_members' ||
              cleanTable === 'homestead_workbench_templates'
            ) {
              throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
            }
            const ownedMods = await getCallerOwnedModIds()
            if (cleanTable === 'mod_versions') {
              const { data: exVer } = await gameDb.from('mod_versions').select('mod_id').eq('id', id_value).maybeSingle()
              if (!exVer?.mod_id || !ownedMods.has(String(exVer.mod_id))) {
                throw new Error('Forbidden: You can only delete versions of your own artifacts')
              }
            } else if (cleanTable === 'mod_bundles') {
              const { data: exB } = await gameDb.from('mod_bundles').select('primary_id').eq('id', id_value).maybeSingle()
              if (!exB?.primary_id || !ownedMods.has(String(exB.primary_id))) {
                throw new Error('Forbidden: You can only delete bundles of your own artifacts')
              }
            } else if (cleanTable === 'mod_dependencies' || cleanTable === 'mod_relationships') {
              const { data: exRel } = await gameDb.from(cleanTable).select('parent_id').eq('id', id_value).maybeSingle()
              if (!exRel?.parent_id || !ownedMods.has(String(exRel.parent_id))) {
                throw new Error(`Forbidden: You can only delete ${cleanTable} of your own artifacts`)
              }
            } else if (cleanTable === 'version_dependencies') {
              const { data: exVd } = await gameDb.from('version_dependencies').select('parent_hash').eq('id', id_value).maybeSingle()
              const { data: exVer } = exVd?.parent_hash
                ? await gameDb.from('mod_versions').select('mod_id').eq('dna_hash', exVd.parent_hash).maybeSingle()
                : { data: null }
              if (!exVer?.mod_id || !ownedMods.has(String(exVer.mod_id))) {
                throw new Error('Forbidden: You can only delete version_dependencies of your own artifacts')
              }
            } else {
              throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
            }
          }
        } else if (CITIZEN_TABLES.has(cleanTable)) {
          if (!isCallerStaff) {
            const ownerColumnMap: Record<string, string> = {
              mason_post_comments: 'author_id',
              mason_post_likes: 'user_id',
              dispatch_poll_votes: 'user_id',
              blueprints: 'mason_id',
              nexus_assets: 'author_id',
              sanctuary_tickets: 'author_id',
              notifications: 'user_id',
            }
            const ownerCol = ownerColumnMap[cleanTable]
            if (ownerCol) {
              const { data: existingRow } = await gameDb
                .from(cleanTable)
                .select(ownerCol)
                .eq('id', id_value)
                .maybeSingle()
              const ownedMasons = cleanTable === 'blueprints' ? await getCallerOwnedMasonIds() : new Set<string>()
              const rowOwner = existingRow?.[ownerCol]
              const isOwned =
                rowOwner === v_user_id ||
                (cleanTable === 'blueprints' && rowOwner && ownedMasons.has(String(rowOwner)))
              if (!existingRow || !isOwned) {
                throw new Error(`Forbidden: You can only delete your own records in ${cleanTable}`)
              }
            } else if (cleanTable === 'citizen_staging_queue') {
              const callerOwnerTag = await getCallerStagingOwnerTag()
              const { data: exRow } = await gameDb
                .from('citizen_staging_queue')
                .select('id, owner_tag')
                .eq('id', id_value)
                .maybeSingle()
              if (!exRow || (exRow.owner_tag && exRow.owner_tag !== callerOwnerTag)) {
                throw new Error('Forbidden: Staging queue ownership mismatch')
              }
            } else {
              throw new Error(`Forbidden: Staff role required to delete from ${cleanTable}`)
            }
          }
        } else {
          throw new Error(`Forbidden: Table ${cleanTable} is not in the allowed gateway registry`)
        }

        const { error } = await gameDb
          .from(cleanTable)
          .delete()
          .eq('id', id_value)

        if (error) throw error
        resultData = { success: true }
        break;
      }
      case 'fetch_notifications': {
        const { data, error } = await gameDb
          .from('notifications')
          .select('*')
          .eq('user_id', v_user_id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        resultData = data;
        break;
      }
      case 'mark_notifications_read': {
        const { notification_id } = payload || {};
        let query = gameDb.from('notifications').update({ is_read: true }).eq('user_id', v_user_id);
        if (notification_id) {
          query = query.eq('id', notification_id);
        }
        const { error } = await query;
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'mark_all_notifications_read': {
        const { error } = await gameDb
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', v_user_id);
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'delete_notifications': {
        const { notification_id } = payload || {};
        let query = gameDb.from('notifications').delete().eq('user_id', v_user_id);
        if (notification_id) {
          query = query.eq('id', notification_id);
        }
        const { error } = await query;
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'delete_all_notifications': {
        const { error } = await gameDb
          .from('notifications')
          .delete()
          .eq('user_id', v_user_id);
        if (error) throw error;
        resultData = { success: true };
        break;
      }
      case 'wayfinder_update_spoke_donations': {
        // Strictly isolated to the Spoke's own Wayfinder — Hub Keepers cannot view or alter Spoke donation configs
        if (callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder can manage Spoke donation settings.')
        }
        const cleanDonUrl = typeof payload?.donation_url === 'string' ? payload.donation_url.trim() : ''
        const rawProc = typeof payload?.payment_processor === 'string' ? payload.payment_processor.trim().toUpperCase() : 'STRIPE'
        const cleanProc = rawProc === 'SANDBOX' || !rawProc ? 'STRIPE' : rawProc
        const goalCents = Math.max(0, Math.round(Number(payload?.monthly_goal_cents) || 0))
        const coveredCents = Math.max(0, Math.round(Number(payload?.monthly_covered_cents) || 0))

        const { error: updateDonErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            donation_url: cleanDonUrl || null,
            payment_processor: cleanProc,
          })
          .eq('id', game.id)
        if (updateDonErr) throw updateDonErr

        const schemaKey = String(game.schema_id || game.id || 'default').toLowerCase()
        const broadcastTitle = `SPOKE_DONATION_${schemaKey.toUpperCase()}`
        const payloadStr = JSON.stringify({
          schema_id: schemaKey,
          game_id: game.id,
          donation_url: cleanDonUrl,
          payment_processor: cleanProc,
          monthly_goal_cents: goalCents,
          monthly_covered_cents: coveredCents,
          spoke_cost_breakdown: payload?.spoke_cost_breakdown,
          updated_at: new Date().toISOString(),
        })

        const { data: existingBroadcast } = await supabaseAdmin
          .from('keeper_system_broadcasts')
          .select('id')
          .eq('category', 'SpokeDonationConfig')
          .eq('title', broadcastTitle)
          .limit(1)
          .maybeSingle()

        if (existingBroadcast?.id) {
          await supabaseAdmin
            .from('keeper_system_broadcasts')
            .update({
              description: payloadStr,
              message: payloadStr,
              target_audience: 'Internal_Pipeline',
              is_active: true,
            })
            .eq('id', existingBroadcast.id)
        } else {
          await supabaseAdmin.from('keeper_system_broadcasts').insert([
            {
              title: broadcastTitle,
              category: 'SpokeDonationConfig',
              description: payloadStr,
              message: payloadStr,
              target_audience: 'Internal_Pipeline',
              is_active: true,
              is_pinned: false,
            },
          ])
        }

        try {
          await gameDb.from('audit_logs').insert({
            action: 'Updated Spoke Donation Settings',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `Payment processor: ${cleanProc}`,
          })
        } catch (e) {
          console.warn('Spoke audit log warning on donation update:', e)
        }

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          donation_url: cleanDonUrl || null,
          payment_processor: cleanProc,
        }
        break;
      }
      case 'get_spoke_credential_status': {
        if (hubRole !== 'keeper' && !isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can inspect credential status')
        }
        resultData = {
          has_credential: true,
          credential_kind: resolvedCredentialKind,
          key_version: resolvedKeyVersion,
          key_fingerprint: resolvedKeyFingerprint,
          rotated_at: resolvedRotatedAt,
        }
        break;
      }
      case 'rotate_spoke_gateway_token': {
        if (hubRole !== 'keeper' && !isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Keeper can rotate the Spoke Gateway Token')
        }
        if (!game.supabase_anon_key) {
          throw new Error('Spoke supabase_anon_key must be configured before minting a scoped Gateway Token')
        }
        const { data: mintData, error: mintErr } = await gameDb.rpc('mint_spoke_gateway_token', {
          p_label: 'Hub Gateway Uplink',
          p_grace_seconds: 60,
        })
        if (mintErr || !mintData?.token) {
          throw new Error('Failed to mint new Spoke Gateway Token: ' + (mintErr?.message || 'Empty response — apply latest schema.sql on Spoke first'))
        }
        const newToken = String(mintData.token).trim()
        const verifyClient = createSpokeClient(game.supabase_url, game.supabase_anon_key, newToken)
        await verifySpokeCredentialHandshake(verifyClient, 'spoke_gateway')

        const { envelope, keyVersion } = await sealSpokeEnvelope(newToken, {
          gameId: String(game.id),
          schemaId: String(game.schema_id || ''),
          supabaseUrl: String(game.supabase_url || ''),
        })
        const newFp = maskCredentialFingerprint(newToken)
        const { error: upsErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
          p_game_id: game.id,
          p_envelope_ciphertext: envelope,
          p_key_version: keyVersion,
          p_credential_kind: 'spoke_gateway',
          p_key_fingerprint: newFp,
        })
        if (upsErr) throw upsErr

        try {
          await supabaseAdmin.from('audit_logs').insert({
            action: 'Rotated Scoped Spoke Gateway Token',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `New Fingerprint: ${newFp} (${keyVersion})`,
            game_name: game.name || game.schema_id,
          })
        } catch {}

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          schema_id: game.schema_id,
          credential_kind: 'spoke_gateway',
          key_version: keyVersion,
          key_fingerprint: newFp,
          rotated_at: new Date().toISOString(),
        }
        break;
      }
      case 'sever_spoke_cord': {
        if (hubRole !== 'keeper' && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder or a Core OS Keeper can sever the uplink cord.')
        }
        const severReason = payload?.reason?.trim() || (callerSpokeRole === 'wayfinder' ? 'Community Executed Cut the Cord (Bilateral Sovereignty Severance)' : 'Keeper Severed Spoke Uplink')
        const actionTitle = callerSpokeRole === 'wayfinder' ? 'Community Executed Cut the Cord (Severed Uplink)' : 'Keeper Severed Spoke Uplink'

        try {
          await gameDb.from('audit_logs').insert({
            action: actionTitle,
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason
          })
          await gameDb.rpc('revoke_spoke_gateway_tokens')
        } catch (e) {
          console.warn('Spoke audit log / token revocation warning on sever:', e)
        }

        try {
          await supabaseAdmin.from('audit_logs').insert({
            action: actionTitle,
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: severReason,
            game_name: game.name || game.schema_id
          })
        } catch (e) {
          console.warn('Hub audit log insert warning on sever:', e)
        }

        const { error: severErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            is_active: false
          })
          .eq('id', game.id)

        if (severErr) throw severErr

        await supabaseAdmin.rpc('internal_delete_spoke_credential', { p_game_id: game.id })

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          severed_by: callerSpokeRole === 'wayfinder' ? 'wayfinder' : 'keeper',
          schema_id: game.schema_id
        }
        break;
      }
      case 'flag_mod_for_compliance': {
        if (isCallerBanned) throw new Error('Forbidden: Account is suspended')
        const rawModId = String(payload?.mod_id || '').trim()
        const rawHash = String(payload?.dna_hash || payload?.hash || '').trim().toLowerCase()
        const rawModName = String(payload?.mod_name || payload?.name || '').trim().slice(0, 200)
        const rawAuthor = String(payload?.author || payload?.master_author || '').trim().slice(0, 120)
        const rawTier = Math.round(Number(payload?.tier || 1))
        const requestedTier = Math.min(4, Math.max(1, Number.isFinite(rawTier) ? rawTier : 1))
        const cleanReason = String(payload?.reason || '').trim().slice(0, 1000) || `Flagged Tier ${requestedTier} for Compliance Review`
        const canApproveCompliance = callerSpokeRole === 'oversight' || callerSpokeRole === 'wayfinder' || callerSpokeRole === 'admin' || isFoundryTestNodeKeeper

        let modId = rawModId
        if (!modId && /^[0-9a-f]{64}$/.test(rawHash)) {
          const { data: verMatch } = await gameDb
            .from('mod_versions')
            .select('mod_id')
            .eq('dna_hash', rawHash)
            .maybeSingle()
          if (verMatch?.mod_id) {
            modId = String(verMatch.mod_id)
          }
        }

        const roleTag = isCallerStaff ? callerSpokeRole.toUpperCase() : (callerSpokeRole === 'mason' ? 'MASON' : 'CITIZEN')
        const taggedReason = `[${roleTag} FLAG - TIER ${requestedTier}] ${cleanReason}`

        let updatedMod: any = null

        if (!modId) {
          if (!/^[0-9a-f]{64}$/.test(rawHash)) {
            throw new Error('Missing mod_id or valid 64-character SHA-256 hash')
          }
          const newModId = crypto.randomUUID()
          const slugBase = (rawModName || 'flagged-artifact')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'flagged-artifact'
          const newSlug = `${slugBase}-${rawHash.slice(0, 8)}`
          const initialStatus = canApproveCompliance ? 'verified' : 'pending'

          const insertPayload: Record<string, any> = {
            id: newModId,
            name: rawModName || `Flagged Artifact (${rawHash.slice(0, 12)})`,
            slug: newSlug,
            master_author: rawAuthor || null,
            compliance_tier: requestedTier,
            status: initialStatus,
            status_reason: taggedReason,
          }
          let insRes = await gameDb
            .from('mods')
            .insert(insertPayload)
            .select()
            .maybeSingle()
          if (insRes.error && String(insRes.error.message || '').includes('status_reason')) {
            delete insertPayload.status_reason
            insRes = await gameDb
              .from('mods')
              .insert(insertPayload)
              .select()
              .maybeSingle()
          }
          if (insRes.error) throw insRes.error
          updatedMod = insRes.data || insertPayload
          modId = newModId

          const { error: verInsErr } = await gameDb
            .from('mod_versions')
            .insert({
              mod_id: newModId,
              dna_hash: rawHash,
              version_label: 'flagged',
              is_core_file: true,
            })
          if (verInsErr && verInsErr.code !== '23505') throw verInsErr
        } else {
          const { data: existingMod, error: fetchModErr } = await gameDb
            .from('mods')
            .select('id, name, compliance_tier, status, status_reason')
            .eq('id', modId)
            .maybeSingle()

          if (fetchModErr) throw fetchModErr
          if (!existingMod) throw new Error('Target artifact not found in Spoke registry')

          const currentTier = Number(existingMod.compliance_tier || 0)
          const currentStatusLower = String(existingMod.status || '').toLowerCase()
          const isCurrentlyPending = ['pending', 'under_review', 'unverified'].includes(currentStatusLower)
          const isConfirmedActiveOrBlocked = currentTier >= 1 && !isCurrentlyPending

          updatedMod = existingMod
          if (!isConfirmedActiveOrBlocked || requestedTier > currentTier) {
            const nextTier = isCurrentlyPending ? Math.max(currentTier, requestedTier) : requestedTier
            const nextStatus = canApproveCompliance
              ? (isCurrentlyPending ? 'pending' : 'verified')
              : 'pending'
            const nextReason =
              isConfirmedActiveOrBlocked && existingMod.status_reason
                ? `${existingMod.status_reason}\n${taggedReason}`
                : taggedReason

            let updRes = await gameDb
              .from('mods')
              .update({
                compliance_tier: nextTier,
                status: nextStatus,
                status_reason: nextReason,
              })
              .eq('id', modId)
              .select()
              .maybeSingle()

            if (updRes.error && String(updRes.error.message || '').includes('status_reason')) {
              updRes = await gameDb
                .from('mods')
                .update({
                  compliance_tier: nextTier,
                  status: nextStatus,
                })
                .eq('id', modId)
                .select()
                .maybeSingle()
            }
            if (updRes.error) throw updRes.error
            if (updRes.data) updatedMod = updRes.data
          }
        }

        try {
          await gameDb.from('audit_logs').insert({
            action: `Flagged Artifact for Compliance (Tier ${requestedTier})`,
            target_table: 'mods',
            target_name: updatedMod?.name || rawModName || modId,
            actor_id: isCallerStaff ? v_user_id : null,
            reason: taggedReason,
          })
        } catch (auditErr) {
          console.warn('Compliance flag audit log warning:', auditErr)
        }

        resultData = {
          success: true,
          queued_pending: String(updatedMod?.status || 'pending').toLowerCase() === 'pending',
          mod: updatedMod,
        }
        break;
      }
      case 'update_spoke_uplink': {
        if (!isFoundryTestNodeKeeper && callerSpokeRole !== 'wayfinder') {
          throw new Error('Forbidden: Only the Spoke Wayfinder can update Spoke uplink keys.')
        }
        const newUrl = (payload?.supabase_url?.trim() || game.supabase_url || '').replace(/\/+$/, '')
        const newAnonKey = payload?.supabase_anon_key?.trim() || game.supabase_anon_key
        const submittedSecret = String(payload?.spoke_gateway_token || payload?.supabase_service_key || '').trim()

        if (!submittedSecret && normalizeSpokeUrl(newUrl) !== normalizeSpokeUrl(game.supabase_url)) {
          throw new Error('Changing Spoke URL requires supplying a valid Spoke Gateway Token for the target project.')
        }

        const newServiceKey = submittedSecret || gameServiceKey

        if (!newUrl || !newAnonKey || !newServiceKey) {
          throw new Error('Missing required Spoke URL, Anon Key, or Gateway Token.')
        }
        if (!SUPABASE_URL_REGEX.test(newUrl)) {
          throw new Error('Invalid Spoke Supabase URL: must be a valid https://<project>.supabase.co endpoint')
        }

        const newKind = detectCredentialKind(newServiceKey)
        const verifyClient = createSpokeClient(newUrl, newAnonKey, newServiceKey)
        await verifySpokeCredentialHandshake(verifyClient, newKind)

        const { error: updErr } = await supabaseAdmin
          .from('sanctuary_games')
          .update({
            supabase_url: newUrl,
            supabase_anon_key: newAnonKey,
            is_active: true
          })
          .eq('id', game.id)

        if (updErr) throw updErr

        const { envelope, keyVersion } = await sealSpokeEnvelope(newServiceKey, {
          gameId: String(game.id),
          schemaId: String(game.schema_id || ''),
          supabaseUrl: newUrl,
        })
        const newFp = maskCredentialFingerprint(newServiceKey)
        const { error: secErr } = await supabaseAdmin.rpc('internal_upsert_spoke_credential', {
          p_game_id: game.id,
          p_envelope_ciphertext: envelope,
          p_key_version: keyVersion,
          p_credential_kind: newKind,
          p_key_fingerprint: newFp,
        })
        if (secErr) throw secErr

        try {
          await verifyClient.from('audit_logs').insert({
            action: 'Rotated Spoke Uplink Credentials',
            target_table: 'sanctuary_games',
            target_name: game.name || game.schema_id,
            actor_id: v_user_id,
            reason: `Wayfinder / Keeper Uplink Key Rotation (${newFp})`
          })
        } catch (e) {}

        invalidateSpokeGameConfigCache()
        resultData = {
          success: true,
          schema_id: game.schema_id,
          credential_kind: newKind,
          key_version: keyVersion,
          key_fingerprint: newFp,
          rotated_at: new Date().toISOString(),
        }
        break;
      }
      case 'upload_spoke_theme_asset': {
        if (isCallerBanned) {
          throw new Error('Forbidden: Account is suspended')
        }
        const canUploadThemeAsset = isCallerStaff || (await getIsCallerVerifiedMason())
        if (!canUploadThemeAsset) {
          throw new Error(
            'Forbidden: Verified Creator or Staff status is required to upload Nexus theme wallpapers'
          )
        }

        const rawKind = String(payload?.kind || 'bg').trim().toLowerCase()
        const safeKind = ['bg', 'thumb', 'preview'].includes(rawKind) ? rawKind : 'bg'
        const rawMime = String(payload?.mime_type || 'image/webp').trim().toLowerCase()
        const allowedMimeExt: Record<string, string> = {
          'image/webp': 'webp',
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
        }
        const ext = allowedMimeExt[rawMime]
        if (!ext) {
          throw new Error('Unsupported theme image format. Use WebP, PNG, or JPEG.')
        }
        const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime

        const base64Raw = String(payload?.base64_data || '')
          .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, '')
          .replace(/\s+/g, '')
        if (!base64Raw) {
          throw new Error('Missing image payload')
        }
        // 390 KB binary cap (~520 KB base64)
        if (base64Raw.length > 535_000) {
          throw new Error('Compressed theme wallpaper exceeds the 380 KB cloud upload budget.')
        }

        let bytes: Uint8Array
        try {
          const bin = atob(base64Raw)
          bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i)
          }
        } catch {
          throw new Error('Invalid base64 image encoding')
        }

        if (bytes.byteLength < 12 || bytes.byteLength > 390_000) {
          throw new Error('Theme image byte size out of bounds (max 380 KB)')
        }

        // Magic-byte header verification (WebP, PNG, JPEG)
        const isWebp =
          bytes[0] === 0x52 &&
          bytes[1] === 0x49 &&
          bytes[2] === 0x46 &&
          bytes[3] === 0x46 &&
          bytes[8] === 0x57 &&
          bytes[9] === 0x45 &&
          bytes[10] === 0x42 &&
          bytes[11] === 0x50
        const isPng =
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

        if (!isWebp && !isPng && !isJpeg) {
          throw new Error('Rejected file: invalid raster image header')
        }

        const actualMime = isWebp ? 'image/webp' : isPng ? 'image/png' : 'image/jpeg'
        const actualExt = isWebp ? 'webp' : isPng ? 'png' : 'jpg'
        if (actualMime !== normalizedMime && !(isWebp && ext === 'webp')) {
          // Use verified header mime/ext
        }

        const digestBuf = await crypto.subtle.digest('SHA-256', bytes)
        const shaHex = Array.from(new Uint8Array(digestBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        const bucket = 'backgrounds'
        const storagePath = `themes/${safeKind}_${shaHex}.${actualExt}`

        // Ensure bucket exists with 512 KB cap on newly onboarded Spokes
        const { error: getBucketErr } = await gameDb.storage.getBucket(bucket)
        if (getBucketErr && resolvedCredentialKind !== 'spoke_gateway') {
          await gameDb.storage
            .createBucket(bucket, {
              public: true,
              fileSizeLimit: 524288,
              allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
            })
            .catch(() => {})
        }

        let finalPublicUrl: string | null = null
        let finalStoragePath = storagePath
        const { error: uploadErr } = await gameDb.storage
          .from(bucket)
          .upload(storagePath, bytes, {
            contentType: actualMime,
            cacheControl: '31536000',
            upsert: true,
          })

        if (!uploadErr) {
          const { data: pubData } = gameDb.storage.from(bucket).getPublicUrl(storagePath)
          finalPublicUrl = pubData?.publicUrl || null
        } else if (resolvedCredentialKind === 'spoke_gateway') {
          // Storage API only evaluates JWT roles on some projects; fall back safely to Hub's hardened backgrounds CDN
          const spokeSlug = String(game.schema_id || 'spoke').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'spoke'
          finalStoragePath = `spoke-themes/${spokeSlug}/${safeKind}_${shaHex}.${actualExt}`
          const { error: hubBucketErr } = await supabaseAdmin.storage.getBucket(bucket)
          if (hubBucketErr) {
            await supabaseAdmin.storage
              .createBucket(bucket, {
                public: true,
                fileSizeLimit: 524288,
                allowedMimeTypes: ['image/webp', 'image/png', 'image/jpeg'],
              })
              .catch(() => {})
          }
          const { error: hubUpErr } = await supabaseAdmin.storage
            .from(bucket)
            .upload(finalStoragePath, bytes, {
              contentType: actualMime,
              cacheControl: '31536000',
              upsert: true,
            })
          if (hubUpErr) {
            throw new Error(`Theme wallpaper upload failed: ${hubUpErr.message}`)
          }
          const { data: hubPub } = supabaseAdmin.storage.from(bucket).getPublicUrl(finalStoragePath)
          finalPublicUrl = hubPub?.publicUrl || null
        } else {
          throw new Error(`Theme wallpaper upload failed: ${uploadErr.message}`)
        }

        resultData = {
          publicUrl: finalPublicUrl,
          storagePath: finalStoragePath,
          sha256: shaHex,
          byteLength: bytes.byteLength,
        }
        break
      }
      case 'increment_spoke_counter': {
        if (isCallerBanned) {
          throw new Error('Forbidden: Account is suspended')
        }
        const kind = String(payload?.kind || '').trim().toLowerCase()
        if (kind === 'asset') {
          const assetId = String(payload?.id || payload?.asset_id || '').trim()
          if (!UUID_REGEX.test(assetId)) {
            throw new Error('Invalid asset_id')
          }
          const { error: incErr } = await gameDb.rpc('increment_asset_downloads', { asset_id: assetId })
          if (incErr) throw incErr
          resultData = { success: true }
        } else if (kind === 'blueprint') {
          const bpId = Number(payload?.id ?? payload?.blueprint_id)
          if (!Number.isSafeInteger(bpId) || bpId <= 0) {
            throw new Error('Invalid blueprint_id')
          }
          const { error: incErr } = await gameDb.rpc('increment_blueprint_downloads', { blueprint_id: bpId })
          if (incErr) throw incErr
          resultData = { success: true }
        } else {
          throw new Error('Invalid counter kind')
        }
        break
      }
      default:
        throw new Error('Unknown action: ' + action)
    }
  return resultData;
}

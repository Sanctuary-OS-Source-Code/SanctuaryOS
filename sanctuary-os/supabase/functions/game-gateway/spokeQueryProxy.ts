/// <reference path="../deno.d.ts" />
import {
  applySpokeQueryFilters,
  applySpokeQueryModifiers,
  sanitizeGatewayErrorMessage,
  sanitizeSpokeSelectColumns,
  redactRestrictedEmbeddedRelations,
} from './corsAndSanitization.ts'
import {
  STAFF_ONLY_TABLES,
  CREATOR_OR_STAFF_TABLES,
  CITIZEN_TABLES,
  assertNoOversizedInlineImageBlobs,
  normalizeSpokeTableRow,
  enforceArchitectSubmissionCompliance,
  computeLegacyStagingOwnerTag,
} from './spokeAccessAndOwnership.ts'

export async function handleSpokeQueryAction(ctx: {
  action: string;
  payload: any;
  game: any;
  gameDb: any;
  v_user_id: string;
  hubRole: string;
  hubCloudPublishingRevoked?: boolean;
  isFoundryTestNodeKeeper: boolean;
  callerSpokeProfile: any;
  callerSpokeRole: string;
  isCallerBanned: boolean;
  isCallerStaff: boolean;
  isCallerCreatorOrStaff: boolean;
  isArchitectOnlyStaff: boolean;
  isOversightOnlyStaff: boolean;
  getCallerOwnedMasonIds: () => Promise<Set<string>>;
  getCallerOwnedModIds: () => Promise<Set<string>>;
  getIsCallerVerifiedMason: () => Promise<boolean>;
  getCallerStagingOwnerTag: () => Promise<string>;
  assertOwnedCollectionSetId: (setId: unknown, errorMessage?: string) => Promise<void>;
  assertOwnedCreatorChildRow: (tableName: string, row: Record<string, any>, isExistingUpdate?: boolean) => Promise<void>;
}): Promise<any> {
  const {
    action, payload, game: _game, gameDb, v_user_id, hubRole, hubCloudPublishingRevoked, isFoundryTestNodeKeeper,
    callerSpokeProfile, callerSpokeRole, isCallerBanned, isCallerStaff, isCallerCreatorOrStaff,
    isArchitectOnlyStaff, isOversightOnlyStaff,
    getCallerOwnedMasonIds, getCallerOwnedModIds, getIsCallerVerifiedMason, getCallerStagingOwnerTag,
    assertOwnedCollectionSetId, assertOwnedCreatorChildRow,
  } = ctx;

  let resultData: any = null;
        const executeSingleSpokeQuery = async (specPayload: any) => {
          const payload = specPayload || {}
          const cleanTable = String(payload?.table || '').trim().toLowerCase()
          const op = String(payload?.op || 'select').trim().toLowerCase()
          if (!cleanTable) throw new Error('Missing table for spoke_query')
          if (cleanTable === 'auth.users' || cleanTable === 'hardware_bans') {
            throw new Error('Forbidden table target')
          }

          const isKnownSpokeTable =
            cleanTable === 'profiles' ||
            cleanTable === 'pwa_push_subscriptions' ||
            STAFF_ONLY_TABLES.has(cleanTable) ||
            CREATOR_OR_STAFF_TABLES.has(cleanTable) ||
            CITIZEN_TABLES.has(cleanTable)

          if (!isKnownSpokeTable) {
            throw new Error(`Forbidden: Table ${cleanTable} is not in the Spoke registry`)
          }

          if (op === 'select') {
            const selectColumns = sanitizeSpokeSelectColumns(
              typeof payload?.selectColumns === 'string' && payload.selectColumns.trim()
                ? payload.selectColumns
                : '*'
            )
            const selectOpts = payload?.selectOpts && typeof payload.selectOpts === 'object'
              ? payload.selectOpts
              : undefined

            if (cleanTable === 'malware_reports' && !isCallerStaff && hubRole !== 'keeper') {
              throw new Error('Forbidden: Staff clearance required to view malware reports')
            }

            if (cleanTable === 'citizen_staging_queue') {
              const filtersArr = Array.isArray(payload?.filters) ? payload.filters : []
              const hasValidTokenFilter = filtersArr.some(
                (f: any) =>
                  f?.method === 'eq' &&
                  Array.isArray(f?.args) &&
                  String(f.args[0] || '') === 'user_token' &&
                  typeof f.args[1] === 'string' &&
                  f.args[1].trim().length >= 16
              )
              if (!hasValidTokenFilter && !isCallerStaff) {
                throw new Error('Forbidden: Staging queue select requires a valid user_token filter')
              }
              const callerOwnerTag = await getCallerStagingOwnerTag()
              const legacyOwnerTag = await computeLegacyStagingOwnerTag(v_user_id)
              const acceptedTags = new Set([callerOwnerTag, legacyOwnerTag])
              const requestedOwnerTag = selectColumns === '*' || /\bowner_tag\b/.test(selectColumns)
              const qCols = requestedOwnerTag ? selectColumns : `${selectColumns},owner_tag`
              let q = gameDb.from('citizen_staging_queue').select(qCols, selectOpts)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              let rows = res.data
              if (!isCallerStaff) {
                if (Array.isArray(rows)) {
                  rows = rows
                    .filter((r: any) => r && (!r.owner_tag || acceptedTags.has(String(r.owner_tag))))
                    .map((r: any) => {
                      if (!requestedOwnerTag && r && typeof r === 'object') {
                        const { owner_tag: _o, ...rest } = r
                        return rest
                      }
                      return r
                    })
                } else if (rows && typeof rows === 'object') {
                  if ((rows as any).owner_tag && !acceptedTags.has(String((rows as any).owner_tag))) {
                    rows = null
                  } else if (!requestedOwnerTag) {
                    const { owner_tag: _o, ...rest } = rows as any
                    rows = rest
                  }
                }
              }
              const finalCount = Array.isArray(rows) ? rows.length : (rows ? 1 : 0)
              return { __spoke_query_v1: true, data: rows, count: selectOpts?.head ? res.count ?? finalCount : finalCount }
            }

            if (cleanTable === 'notifications' || cleanTable === 'pwa_push_subscriptions') {
              let q = gameDb.from(cleanTable).select(selectColumns, selectOpts).eq('user_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            if (cleanTable === 'sanctuary_tickets' && !isCallerStaff) {
              if (callerSpokeRole === 'mason') {
                const ownedMasons = await getCallerOwnedMasonIds()
                const masonIdsArr = [v_user_id, ...Array.from(ownedMasons)]
                const { data: modRows } = await gameDb
                  .from('mods')
                  .select('id')
                  .in('mason_id', masonIdsArr)
                const ownedModIds = new Set((modRows || []).map((m: any) => String(m.id)))

                let q = gameDb.from('sanctuary_tickets').select(selectColumns === '*' ? '*' : '*')
                q = applySpokeQueryModifiers(q, { ...payload, singleMode: null })
                const res = await q
                if (res.error) throw res.error
                const rows = (Array.isArray(res.data) ? res.data : []).filter((t: any) => {
                  if (!t) return false
                  if (t.author_id === v_user_id || t.assigned_to === v_user_id) return true
                  const meta = t.metadata || {}
                  if (meta.target_user_id === v_user_id || meta.target_mason === v_user_id || meta.mason_id === v_user_id) return true
                  if (meta.target_mason && ownedMasons.has(String(meta.target_mason))) return true
                  if (meta.mason_id && ownedMasons.has(String(meta.mason_id))) return true
                  if (meta.target_mod_id && ownedModIds.has(String(meta.target_mod_id))) return true
                  return false
                }).map((t: any) => (
                  t.author_id === v_user_id ? t : { ...t, author_id: null }
                ))
                const finalData =
                  selectOpts?.head
                    ? null
                    : payload?.singleMode === 'single' || payload?.singleMode === 'maybeSingle'
                      ? (rows[0] ?? null)
                      : rows
                return { __spoke_query_v1: true, data: finalData, count: rows.length }
              }

              let q = gameDb.from('sanctuary_tickets').select(selectColumns, selectOpts).eq('author_id', v_user_id)
              q = applySpokeQueryModifiers(q, payload)
              const res = await q
              if (res.error) throw res.error
              return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
            }

            if ((cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports' || cleanTable === 'content_flags') && !isCallerStaff) {
              if (callerSpokeRole === 'mason' && (cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports')) {
                const ownedMasons = await getCallerOwnedMasonIds()
                let ownedTargetIds = new Set<string>()
                if (cleanTable === 'nexus_reports') {
                  const { data: myAssets } = await gameDb
                    .from('nexus_assets')
                    .select('id')
                    .eq('author_id', v_user_id)
                  ownedTargetIds = new Set((myAssets || []).map((a: any) => String(a.id)))
                } else {
                  const masonFilterIds = [v_user_id, ...Array.from(ownedMasons)]
                  const { data: myBps } = await gameDb
                    .from('blueprints')
                    .select('id')
                    .in('mason_id', masonFilterIds)
                  ownedTargetIds = new Set((myBps || []).map((b: any) => String(b.id)))
                }
                let q = gameDb.from(cleanTable).select(selectColumns)
                q = applySpokeQueryModifiers(q, { ...payload, singleMode: null })
                const res = await q
                if (res.error) throw res.error
                const fkField = cleanTable === 'nexus_reports' ? 'asset_id' : 'blueprint_id'
                const rows = (Array.isArray(res.data) ? res.data : []).filter(
                  (r: any) => r && r[fkField] && ownedTargetIds.has(String(r[fkField]))
                )
                const finalData =
                  selectOpts?.head
                    ? null
                    : payload?.singleMode === 'single' || payload?.singleMode === 'maybeSingle'
                      ? (rows[0] ?? null)
                      : rows
                return { __spoke_query_v1: true, data: finalData, count: rows.length }
              }

              // Zero-identity moderation submissions strip reporter_id to NULL on insert,
              // so non-staff citizens cannot query back historical reports.
              const emptyData =
                selectOpts?.head || payload?.singleMode === 'single' || payload?.singleMode === 'maybeSingle'
                  ? null
                  : []
              return { __spoke_query_v1: true, data: emptyData, count: 0 }
            }

            const canReadComplianceTiers =
              callerSpokeRole === 'oversight' ||
              callerSpokeRole === 'wayfinder' ||
              callerSpokeRole === 'admin' ||
              isFoundryTestNodeKeeper

            let effectiveSelectColumns = selectColumns
            let effectiveSelectOpts = selectOpts
            const injectedModId =
              !canReadComplianceTiers &&
              cleanTable === 'mod_versions' &&
              selectColumns !== '*' &&
              !/\bmod_id\b/.test(selectColumns)
            if (injectedModId) {
              effectiveSelectColumns = `${selectColumns},mod_id`
            }
            const needsPostCountFilter =
              !canReadComplianceTiers &&
              Boolean(selectOpts?.head) &&
              ['mods', 'collections', 'mod_versions'].includes(cleanTable)
            if (needsPostCountFilter) {
              effectiveSelectColumns = cleanTable === 'mod_versions' ? 'mod_id' : 'id, compliance_tier'
              effectiveSelectOpts = undefined
            }

            let q = gameDb.from(cleanTable).select(effectiveSelectColumns, effectiveSelectOpts)
            q = applySpokeQueryModifiers(q, payload)
            const res = await q
            if (res.error) throw res.error

            let responseData = res.data
            let responseCount = res.count ?? null

            if (!canReadComplianceTiers && ['mods', 'collections'].includes(cleanTable) && responseData !== null) {
              const isPublicComplianceRow = (r: any) => {
                if (!r || typeof r !== 'object') return false
                const tier = Number(r.compliance_tier ?? 0)
                return !(tier >= 1 && tier <= 5)
              }
              if (Array.isArray(responseData)) {
                const filtered = responseData.filter(isPublicComplianceRow)
                responseData = needsPostCountFilter ? null : filtered
                responseCount = filtered.length
              } else if (!isPublicComplianceRow(responseData)) {
                responseData = null
                responseCount = 0
              }
            }

            if (!canReadComplianceTiers && cleanTable === 'mod_versions' && responseData !== null) {
              const rowsArr = Array.isArray(responseData) ? responseData : [responseData]
              const modIdsToCheck = Array.from(
                new Set(
                  rowsArr
                    .map((r: any) => {
                      const joinedMod = Array.isArray(r?.mods) ? r.mods[0] : r?.mods
                      if (joinedMod && typeof joinedMod.compliance_tier === 'number') return null
                      return r?.mod_id ? String(r.mod_id) : null
                    })
                    .filter(Boolean)
                )
              ) as string[]

              const restrictedModIds = new Set<string>()
              if (modIdsToCheck.length > 0) {
                for (let i = 0; i < modIdsToCheck.length; i += 200) {
                  const chunk = modIdsToCheck.slice(i, i + 200)
                  const { data: modTiers } = await gameDb
                    .from('mods')
                    .select('id, compliance_tier')
                    .in('id', chunk)
                  for (const m of modTiers || []) {
                    const tier = Number((m as any)?.compliance_tier ?? 0)
                    if (tier >= 1 && tier <= 5) {
                      restrictedModIds.add(String((m as any).id))
                    }
                  }
                }
              }

              const isPublicVersionRow = (r: any) => {
                if (!r || typeof r !== 'object') return false
                const joinedMod = Array.isArray(r?.mods) ? r.mods[0] : r?.mods
                if (joinedMod && typeof joinedMod.compliance_tier === 'number') {
                  const t = Number(joinedMod.compliance_tier)
                  if (t >= 1 && t <= 5) return false
                }
                if (r.mod_id && restrictedModIds.has(String(r.mod_id))) return false
                return true
              }

              if (Array.isArray(responseData)) {
                let filtered = responseData.filter(isPublicVersionRow)
                if (injectedModId) {
                  filtered = filtered.map((r: any) => {
                    if (!r || typeof r !== 'object') return r
                    const { mod_id: _omitted, ...rest } = r
                    return rest
                  })
                }
                responseData = needsPostCountFilter ? null : filtered
                responseCount = filtered.length
              } else if (!isPublicVersionRow(responseData)) {
                responseData = null
                responseCount = 0
              } else if (injectedModId && typeof responseData === 'object') {
                const { mod_id: _omitted, ...rest } = responseData as any
                responseData = rest
              }
            }

            if (!canReadComplianceTiers && responseData !== null) {
              responseData = redactRestrictedEmbeddedRelations(responseData)
            }

            if (
              !isCallerStaff &&
              responseData !== null &&
              ['mason_posts', 'mason_post_comments', 'nexus_assets', 'blueprints', 'collections'].includes(cleanTable)
            ) {
              const hasFlaggedRow = Array.isArray(responseData)
                ? responseData.some((r: any) => r?.has_pending_flag === true)
                : (responseData as any)?.has_pending_flag === true
              if (hasFlaggedRow) {
                const ownedMasons =
                  cleanTable === 'mason_posts' || cleanTable === 'blueprints' || cleanTable === 'collections'
                    ? await getCallerOwnedMasonIds()
                    : new Set<string>()
                const isOwnFlaggedRow = (r: any) => {
                  if (!r || typeof r !== 'object') return false
                  if (r.has_pending_flag !== true) return true
                  if (r.author_id && r.author_id === v_user_id) return true
                  if (r.mason_id && (r.mason_id === v_user_id || ownedMasons.has(String(r.mason_id)))) return true
                  return false
                }
                if (Array.isArray(responseData)) {
                  const filtered = responseData.filter(isOwnFlaggedRow)
                  return { __spoke_query_v1: true, data: filtered, count: filtered.length }
                }
                if (!isOwnFlaggedRow(responseData)) {
                  return { __spoke_query_v1: true, data: null, count: 0 }
                }
              }
            }
            if (!isCallerStaff && cleanTable === 'profiles' && responseData !== null) {
              const sanitizeProfileRow = (r: any) => {
                if (!r || typeof r !== 'object') return r
                if (String(r.id || '') === v_user_id) return r
                const { email: _e, donation_credit_cents: _d, ...rest } = r
                return rest
              }
              responseData = Array.isArray(responseData)
                ? responseData.map(sanitizeProfileRow)
                : sanitizeProfileRow(responseData)
            }

            return { __spoke_query_v1: true, data: responseData, count: responseCount }
          }

          // Mutations: insert | upsert | update | delete
          if (cleanTable === 'profiles') {
            if (op !== 'update') throw new Error('Forbidden direct profile operation')
            const rawVals = payload?.values && typeof payload.values === 'object' ? { ...payload.values } : {}
            delete rawVals.id
            delete rawVals.created_at
            const isSelfBanOnly =
              Object.keys(rawVals).length > 0 &&
              rawVals.is_banned === true &&
              Object.keys(rawVals).every((k) => ['is_banned', 'blacklist_reason'].includes(k))
            if (!isCallerStaff && !isSelfBanOnly) {
              throw new Error('Forbidden: Insufficient permissions to update Spoke profile')
            }
            if (isCallerStaff && !isSelfBanOnly) {
              if (!Array.isArray(payload?.filters) || payload.filters.length === 0) {
                throw new Error('Refusing unfiltered update on profiles')
              }
              if (isArchitectOnlyStaff) {
                if (rawVals.role !== undefined) {
                  throw new Error('Forbidden: Architects cannot modify user roles')
                }
                delete rawVals.is_banned
                delete rawVals.blacklist_reason
                delete rawVals.is_comm_banned
                delete rawVals.comm_blacklist_reason
              }
              if (isOversightOnlyStaff) {
                const requestedRole = rawVals.role !== undefined ? String(rawVals.role || '').trim().toLowerCase() : ''
                if (requestedRole && ['wayfinder', 'oversight', 'admin', 'core_dev'].includes(requestedRole)) {
                  throw new Error('Forbidden: Oversight cannot promote users to Wayfinder, Oversight, or Admin roles')
                }
                const { data: matchedProfiles } = await applySpokeQueryFilters(
                  gameDb.from('profiles').select('id, role'),
                  payload.filters
                )
                if (
                  Array.isArray(matchedProfiles) &&
                  matchedProfiles.some((p: any) => ['wayfinder', 'admin'].includes(String(p?.role || '').toLowerCase()))
                ) {
                  throw new Error('Forbidden: Oversight cannot modify Wayfinder or Admin profiles')
                }
              }
            }
            let q = gameDb.from('profiles').update(
              isSelfBanOnly
                ? { is_banned: true, blacklist_reason: rawVals.blacklist_reason ?? null }
                : rawVals
            )
            if (!isCallerStaff) {
              q = q.eq('id', v_user_id)
            } else {
              q = applySpokeQueryFilters(q, payload?.filters || [])
            }
            if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
              q = q.select(payload.returnSelect || '*')
              if (payload?.singleMode === 'single') q = q.single()
              else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
            }
            const res = await q
            if (res.error) throw res.error
            return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
          }

          if (isCallerBanned) {
            throw new Error('Forbidden: Account is suspended')
          }

          if (STAFF_ONLY_TABLES.has(cleanTable) && !isCallerStaff) {
            throw new Error(`Forbidden: Staff clearance required to modify ${cleanTable}`)
          }
          if (CREATOR_OR_STAFF_TABLES.has(cleanTable)) {
            const isDeleteOwnLegacyContent =
              op === 'delete' &&
              ['mason_posts', 'collections', 'collection_members'].includes(cleanTable)
            const canModifyCreatorTable =
              cleanTable === 'masons' || isDeleteOwnLegacyContent
                ? isCallerCreatorOrStaff || (await getIsCallerVerifiedMason())
                : isCallerStaff || (await getIsCallerVerifiedMason())
            if (!canModifyCreatorTable) {
              throw new Error(`Forbidden: Verified Creator or Staff clearance required to modify ${cleanTable}`)
            }
          }
          if (
            !STAFF_ONLY_TABLES.has(cleanTable) &&
            !CREATOR_OR_STAFF_TABLES.has(cleanTable) &&
            !CITIZEN_TABLES.has(cleanTable) &&
            cleanTable !== 'pwa_push_subscriptions'
          ) {
            throw new Error(`Forbidden: Table ${cleanTable} cannot be modified`)
          }

          if (
            !isCallerStaff &&
            (hubCloudPublishingRevoked || Boolean(callerSpokeProfile?.cloud_publishing_revoked)) &&
            [
              'mods',
              'mod_versions',
              'collections',
              'collection_members',
              'nexus_assets',
              'mason_posts',
              'blueprints',
            ].includes(cleanTable)
          ) {
            throw new Error(
              'Forbidden: Cloud publishing privileges have been revoked under the Sanctuary OS Repeat Infringer Policy (17 U.S.C. § 512(i)).'
            )
          }

          if (op === 'insert' || op === 'upsert') {
            const isArr = Array.isArray(payload?.values)
            const rows = (isArr ? payload.values : [payload?.values]).map((r: any) =>
              normalizeSpokeTableRow(cleanTable, r)
            )
            if (!isCallerStaff) {
              const ownedMasons =
                cleanTable === 'masons' ||
                cleanTable === 'mason_posts' ||
                cleanTable === 'collections' ||
                cleanTable === 'collection_members' ||
                cleanTable === 'blueprints'
                  ? await getCallerOwnedMasonIds()
                  : new Set<string>()
              for (const row of rows) {
                if (!row || typeof row !== 'object') throw new Error('Invalid payload row')
                if (cleanTable === 'audit_logs') {
                  row.actor_id = v_user_id
                  delete row.id
                } else if (cleanTable === 'mason_post_comments') {
                  if (callerSpokeProfile?.is_comm_banned) {
                    throw new Error('Forbidden: Community posting privileges are suspended')
                  }
                  row.author_id = v_user_id
                  delete row.is_hidden
                } else if (
                  cleanTable === 'mason_post_likes' ||
                  cleanTable === 'mason_post_views' ||
                  cleanTable === 'dispatch_poll_votes' ||
                  cleanTable === 'pwa_push_subscriptions'
                ) {
                  row.user_id = v_user_id
                } else if (cleanTable === 'blueprints') {
                  if (row.mason_id && row.mason_id !== v_user_id && !ownedMasons.has(String(row.mason_id))) {
                    throw new Error('Forbidden: Blueprint mason_id must belong to caller')
                  }
                  if (!row.mason_id) row.mason_id = v_user_id
                } else if (cleanTable === 'nexus_assets') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
                  }
                  row.author_id = v_user_id
                  delete row.is_community_default
                } else if (cleanTable === 'sanctuary_tickets') {
                  row.author_id = (row.author_id === null || row.metadata?.is_anonymous === true) ? null : v_user_id
                  delete row.assigned_to
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
                } else if (cleanTable === 'scout_suggestions') {
                  row.submitter_id = null
                } else if (cleanTable === 'notifications') {
                  if (row.user_id && String(row.user_id) !== v_user_id) {
                    throw new Error('Forbidden: Cannot create notification for another citizen')
                  }
                  row.user_id = v_user_id
                  row.actor_id = v_user_id
                } else if (cleanTable === 'citizen_staging_queue') {
                  if (!row.user_token || String(row.user_token).length < 16) {
                    throw new Error('Invalid staging token')
                  }
                  const callerOwnerTag = await getCallerStagingOwnerTag()
                  row.owner_tag = callerOwnerTag
                } else if (cleanTable === 'masons') {
                  delete row.is_verified
                  delete row.followers_count
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
                  if (cleanTable === 'collections') delete row.is_official
                } else if (cleanTable === 'collection_members') {
                  await assertOwnedCollectionSetId(row.set_id)
                } else if (cleanTable === 'mods') {
                  if (row.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                    delete row.highlander_group_id
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
              for (const row of rows) {
                await enforceArchitectSubmissionCompliance(gameDb, cleanTable, row, true)
              }
            }

            if (isArchitectOnlyStaff && (cleanTable === 'mods' || cleanTable === 'collections')) {
              for (const row of rows) {
                if (row && typeof row === 'object' && Number(row.compliance_tier || 0) >= 1) {
                  row.compliance_tier = Math.min(5, Math.max(1, Math.round(Number(row.compliance_tier))))
                  row.status = 'pending'
                }
              }
            }

            if (isOversightOnlyStaff && cleanTable === 'masons') {
              for (const row of rows) {
                if (row?.profile_id) {
                  const { data: targetProf } = await gameDb
                    .from('profiles')
                    .select('role')
                    .eq('id', row.profile_id)
                    .maybeSingle()
                  if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                    throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
                  }
                }
              }
            }

            let currentBody: any = isArr ? rows : rows[0]
            let resData: any = null
            let resErr: any = null
            for (let attempt = 0; attempt < 5; attempt++) {
              let q =
                op === 'upsert'
                  ? gameDb.from(cleanTable).upsert(currentBody, payload?.upsertOpts || undefined)
                  : gameDb.from(cleanTable).insert(currentBody)
              if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
                q = q.select(payload.returnSelect || '*')
                if (payload?.singleMode === 'single') q = q.single()
                else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
              }
              const res = await q
              resData = res.data
              resErr = res.error
              if (!resErr) break
              const missingCol = String(resErr.message || '').match(/Could not find the '([^']+)' column/i)?.[1]
              if (missingCol) {
                if (Array.isArray(currentBody)) {
                  currentBody = currentBody.map((r: any) => {
                    if (r && typeof r === 'object') {
                      const next = { ...r }
                      delete next[missingCol]
                      return next
                    }
                    return r
                  })
                  continue
                } else if (currentBody && typeof currentBody === 'object' && Object.prototype.hasOwnProperty.call(currentBody, missingCol)) {
                  delete currentBody[missingCol]
                  continue
                }
              }
              break
            }
            if (resErr) {
              if (resErr.code === '23505' && cleanTable === 'mason_post_views') {
                return { __spoke_query_v1: true, data: [currentBody], count: 1 }
              }
              throw resErr
            }
            if (cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports' || cleanTable === 'content_flags') {
              for (const insertedRow of rows) {
                if (!insertedRow || typeof insertedRow !== 'object') continue
                try {
                  if (cleanTable === 'nexus_reports' && insertedRow.asset_id) {
                    await gameDb.from('nexus_assets').update({ has_pending_flag: true }).eq('id', insertedRow.asset_id)
                  } else if (cleanTable === 'blueprint_reports' && insertedRow.blueprint_id) {
                    await gameDb.from('blueprints').update({ has_pending_flag: true }).eq('id', insertedRow.blueprint_id)
                  } else if (cleanTable === 'content_flags' && insertedRow.content_id) {
                    const normCt = String(insertedRow.content_type || '').toLowerCase()
                    const cTable =
                      normCt === 'collection' || normCt === 'collections'
                        ? 'collections'
                        : normCt === 'comment' || normCt === 'mason_post_comment'
                          ? 'mason_post_comments'
                          : 'mason_posts'
                    await gameDb.from(cTable).update({ has_pending_flag: true }).eq('id', insertedRow.content_id)
                  }
                } catch {
                  // Gracefully ignore if older Spoke schema does not yet have has_pending_flag
                }
              }
            }
            return { __spoke_query_v1: true, data: resData, count: null }
          }

          if (op === 'update' || op === 'delete') {
            if (cleanTable === 'audit_logs') {
              throw new Error('Forbidden: Audit logs are immutable')
            }
            if (!Array.isArray(payload?.filters) || payload.filters.length === 0) {
              throw new Error(`Refusing unfiltered ${op} on ${cleanTable}`)
            }

            let updateVals = payload?.values && typeof payload.values === 'object'
              ? { ...payload.values }
              : {}
            if (op === 'update') {
              assertNoOversizedInlineImageBlobs(cleanTable, updateVals)
            }

            if (isArchitectOnlyStaff && op === 'update' && (cleanTable === 'mods' || cleanTable === 'collections')) {
              if (Number(updateVals.compliance_tier || 0) >= 1) {
                updateVals.compliance_tier = Math.min(5, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                updateVals.status = 'pending'
              }
            }

            if (isOversightOnlyStaff && cleanTable === 'masons' && updateVals.profile_id) {
              const { data: targetProf } = await gameDb
                .from('profiles')
                .select('role')
                .eq('id', updateVals.profile_id)
                .maybeSingle()
              if (targetProf && ['wayfinder', 'oversight', 'admin'].includes(String(targetProf.role || '').toLowerCase())) {
                throw new Error('Forbidden: Oversight cannot link Creators to Wayfinder or Oversight accounts')
              }
            }

            if (!isCallerStaff) {
              if (cleanTable === 'masons') {
                delete updateVals.is_verified
                delete updateVals.followers_count
                delete updateVals.profile_id
              } else if (cleanTable === 'nexus_assets') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus assets')
                  }
                }
                delete updateVals.is_community_default
                delete updateVals.author_id
              } else if (cleanTable === 'mason_posts') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Comm-Link dispatches')
                  }
                }
              } else if (cleanTable === 'collections') {
                if (op === 'update') {
                  const isVerifiedMason = await getIsCallerVerifiedMason()
                  if (!isVerifiedMason) {
                    throw new Error('Forbidden: Verified Creator status is required to publish or update Nexus collections')
                  }
                }
                delete updateVals.is_official
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(5, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mods') {
                if (updateVals.highlander_group_id !== undefined && !(await getIsCallerVerifiedMason())) {
                  delete updateVals.highlander_group_id
                }
                if (Number(updateVals.compliance_tier || 0) >= 1) {
                  updateVals.compliance_tier = Math.min(5, Math.max(1, Math.round(Number(updateVals.compliance_tier))))
                  updateVals.status = 'pending'
                }
              } else if (cleanTable === 'mason_post_comments') {
                delete updateVals.is_hidden
                delete updateVals.author_id
              } else if (cleanTable === 'sanctuary_tickets') {
                if (op === 'delete') throw new Error('Forbidden: Citizens/Creators cannot delete tickets')
                delete updateVals.id
                delete updateVals.created_at
                delete updateVals.author_id
                delete updateVals.assigned_to
                delete updateVals.ticket_type
                delete updateVals.target_mod_id
                delete updateVals.target_blueprint_id
                if (callerSpokeRole !== 'mason') {
                  if (
                    updateVals.status !== undefined &&
                    String(updateVals.status || '').trim().toLowerCase() !== 'closed'
                  ) {
                    throw new Error('Forbidden: Citizens may only close their own tickets')
                  }
                }
              } else if (cleanTable === 'nexus_reports' || cleanTable === 'blueprint_reports') {
                if (op === 'delete' || callerSpokeRole !== 'mason') {
                  throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
                }
                const nextStatus = String(updateVals.status || '').trim().toLowerCase()
                if (!['resolved', 'dismissed'].includes(nextStatus)) {
                  throw new Error(`Forbidden: Creators may only mark ${cleanTable} as resolved or dismissed`)
                }
                updateVals = { status: nextStatus }
              } else if (cleanTable === 'citizen_staging_queue' && op === 'update') {
                updateVals.owner_tag = await getCallerStagingOwnerTag()
              }

              if (
                op === 'update' &&
                updateVals.mason_id !== undefined &&
                (cleanTable === 'mason_posts' || cleanTable === 'collections' || cleanTable === 'mods')
              ) {
                const ownedMasonsCheck = await getCallerOwnedMasonIds()
                if (!ownedMasonsCheck.has(String(updateVals.mason_id))) {
                  throw new Error(`Forbidden: ${cleanTable} mason_id must belong to your Creator profile`)
                }
              }
            }

            let q = op === 'update'
              ? gameDb.from(cleanTable).update(updateVals)
              : gameDb.from(cleanTable).delete()

            q = applySpokeQueryFilters(q, payload.filters)

            if (!isCallerStaff) {
              const ownedMasons = await getCallerOwnedMasonIds()
              if (cleanTable === 'mason_post_comments') {
                q = q.eq('author_id', v_user_id)
              } else if (
                cleanTable === 'mason_post_likes' ||
                cleanTable === 'dispatch_poll_votes' ||
                cleanTable === 'notifications' ||
                cleanTable === 'pwa_push_subscriptions'
              ) {
                q = q.eq('user_id', v_user_id)
              } else if (cleanTable === 'nexus_assets') {
                q = q.eq('author_id', v_user_id)
              } else if (cleanTable === 'masons') {
                q = q.eq('profile_id', v_user_id)
              } else if (cleanTable === 'mason_posts' || cleanTable === 'collections') {
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'collection_members') {
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                const { data: myCols } = await gameDb
                  .from('collections')
                  .select('id')
                  .in('mason_id', mIds)
                const ownedSetIds = (myCols || []).map((c: any) => String(c.id))
                if (ownedSetIds.length === 0) throw new Error('Forbidden: No owned collections')
                if (op === 'update' && updateVals.set_id !== undefined && !ownedSetIds.includes(String(updateVals.set_id))) {
                  throw new Error('Forbidden: Collection set_id must belong to your Creator profile')
                }
                q = q.in('set_id', ownedSetIds)
              } else if (cleanTable === 'mods') {
                if (op === 'delete') throw new Error('Forbidden: Creators cannot delete cloud registry artifacts directly')
                const mIds = Array.from(ownedMasons)
                if (mIds.length === 0) throw new Error('Forbidden: No owned Creator profile')
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'mod_versions') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                if (op === 'update' && updateVals.mod_id !== undefined && !ownedMods.includes(String(updateVals.mod_id))) {
                  throw new Error('Forbidden: mod_versions mod_id must belong to your owned artifacts')
                }
                q = q.in('mod_id', ownedMods)
              } else if (cleanTable === 'mod_bundles') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                if (op === 'update' && updateVals.primary_id !== undefined && !ownedMods.includes(String(updateVals.primary_id))) {
                  throw new Error('Forbidden: mod_bundles primary_id must belong to your owned artifacts')
                }
                q = q.in('primary_id', ownedMods)
              } else if (cleanTable === 'mod_dependencies' || cleanTable === 'mod_relationships') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                if (op === 'update' && updateVals.parent_id !== undefined && !ownedMods.includes(String(updateVals.parent_id))) {
                  throw new Error(`Forbidden: ${cleanTable} parent_id must belong to your owned artifacts`)
                }
                q = q.in('parent_id', ownedMods)
              } else if (cleanTable === 'version_dependencies') {
                const ownedMods = Array.from(await getCallerOwnedModIds())
                if (ownedMods.length === 0) throw new Error('Forbidden: No owned artifacts')
                const { data: myVers } = await gameDb.from('mod_versions').select('dna_hash').in('mod_id', ownedMods)
                const ownedHashes = (myVers || []).map((v: any) => String(v.dna_hash)).filter(Boolean)
                if (ownedHashes.length === 0) throw new Error('Forbidden: No owned version hashes')
                if (op === 'update' && updateVals.parent_hash !== undefined && !ownedHashes.includes(String(updateVals.parent_hash))) {
                  throw new Error('Forbidden: version_dependencies parent_hash must belong to your owned artifacts')
                }
                q = q.in('parent_hash', ownedHashes)
              } else if (
                cleanTable === 'logical_conflicts' ||
                cleanTable === 'community_groups' ||
                cleanTable === 'community_group_members' ||
                cleanTable === 'homestead_workbench_templates'
              ) {
                throw new Error('Forbidden: Staff clearance required to modify shared conflict/group matrix')
              } else if (cleanTable === 'citizen_staging_queue') {
                const callerOwnerTag = await getCallerStagingOwnerTag()
                const legacyOwnerTag = await computeLegacyStagingOwnerTag(v_user_id)
                const acceptedTags = new Set([callerOwnerTag, legacyOwnerTag])
                const hasBoundFilter = Array.isArray(payload?.filters) && payload.filters.some(
                  (f: any) =>
                    (f?.method === 'eq' || f?.method === 'in') &&
                    Array.isArray(f?.args) &&
                    ['id', 'user_token'].includes(String(f.args[0] || ''))
                )
                if (!hasBoundFilter) {
                  throw new Error('Forbidden: Staging queue mutation requires id or user_token filter')
                }
                const { data: matchedStaging } = await applySpokeQueryFilters(
                  gameDb.from('citizen_staging_queue').select('id, owner_tag'),
                  payload.filters
                )
                if (
                  Array.isArray(matchedStaging) &&
                  matchedStaging.some((r: any) => r?.owner_tag && !acceptedTags.has(String(r.owner_tag)))
                ) {
                  throw new Error('Forbidden: Staging queue ownership mismatch')
                }
                const tagFilter =
                  callerOwnerTag === legacyOwnerTag
                    ? `owner_tag.is.null,owner_tag.eq.${callerOwnerTag}`
                    : `owner_tag.is.null,owner_tag.eq.${callerOwnerTag},owner_tag.eq.${legacyOwnerTag}`
                q = q.or(tagFilter)
              } else if (cleanTable === 'blueprints') {
                const mIds = [v_user_id, ...Array.from(ownedMasons)]
                q = q.in('mason_id', mIds)
              } else if (cleanTable === 'sanctuary_tickets') {
                if (op === 'delete') throw new Error('Forbidden: Citizens/Creators cannot delete tickets')
                if (callerSpokeRole === 'mason') {
                  const ownedModIds = await getCallerOwnedModIds()
                  const masonIdsArr = [v_user_id, ...Array.from(ownedMasons)]
                  const { data: myBps } = await gameDb
                    .from('blueprints')
                    .select('id')
                    .in('mason_id', masonIdsArr)
                  const ownedBpIds = new Set((myBps || []).map((b: any) => String(b.id)))
                  const { data: matchedTickets, error: matchErr } = await applySpokeQueryFilters(
                    gameDb
                      .from('sanctuary_tickets')
                      .select('id, author_id, assigned_to, target_mod_id, target_blueprint_id, metadata'),
                    payload.filters
                  )
                  if (matchErr) throw matchErr
                  const rows = Array.isArray(matchedTickets) ? matchedTickets : []
                  const isOwnedTicket = (t: any) => {
                    if (!t) return false
                    if (t.author_id === v_user_id || t.assigned_to === v_user_id) return true
                    if (t.target_mod_id && ownedModIds.has(String(t.target_mod_id))) return true
                    if (t.target_blueprint_id && ownedBpIds.has(String(t.target_blueprint_id))) return true
                    const meta = t.metadata || {}
                    if (
                      meta.target_user_id === v_user_id ||
                      meta.target_mason === v_user_id ||
                      meta.mason_id === v_user_id
                    ) {
                      return true
                    }
                    if (meta.target_mason && ownedMasons.has(String(meta.target_mason))) return true
                    if (meta.mason_id && ownedMasons.has(String(meta.mason_id))) return true
                    if (meta.target_mod_id && ownedModIds.has(String(meta.target_mod_id))) return true
                    return false
                  }
                  if (rows.length === 0 || !rows.every(isOwnedTicket)) {
                    throw new Error('Forbidden: Ticket does not belong to you or your Creator artifacts')
                  }
                  q = q.in('id', rows.map((t: any) => t.id))
                } else {
                  q = q.eq('author_id', v_user_id)
                }
              } else if (cleanTable === 'blueprint_reports') {
                if (op === 'delete' || callerSpokeRole !== 'mason') {
                  throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
                }
                const masonIdsArr = [v_user_id, ...Array.from(ownedMasons)]
                const { data: myBps } = await gameDb
                  .from('blueprints')
                  .select('id')
                  .in('mason_id', masonIdsArr)
                const ownedBpIds = (myBps || [])
                  .map((b: any) => b?.id)
                  .filter((id: any) => id !== null && id !== undefined)
                if (ownedBpIds.length === 0) {
                  throw new Error('Forbidden: No owned blueprints')
                }
                q = q.in('blueprint_id', ownedBpIds)
              } else if (cleanTable === 'nexus_reports') {
                if (op === 'delete' || callerSpokeRole !== 'mason') {
                  throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
                }
                const masonIdsArr = [v_user_id, ...Array.from(ownedMasons)]
                const [{ data: myAssets }, { data: myBps }] = await Promise.all([
                  gameDb.from('nexus_assets').select('id').eq('author_id', v_user_id),
                  gameDb.from('blueprints').select('id').in('mason_id', masonIdsArr),
                ])
                const ownedTargetIds = Array.from(
                  new Set(
                    [...(myAssets || []), ...(myBps || [])]
                      .map((item: any) => item?.id)
                      .filter((id: any) => id !== null && id !== undefined)
                      .map((id: any) => String(id))
                  )
                )
                if (ownedTargetIds.length === 0) {
                  throw new Error('Forbidden: No owned Nexus assets or blueprints')
                }
                q = q.in('asset_id', ownedTargetIds)
              } else if (
                cleanTable === 'content_flags' ||
                cleanTable === 'malware_reports'
              ) {
                throw new Error(`Forbidden: Staff clearance required to ${op} ${cleanTable}`)
              }
            }

            if (payload?.returnSelect !== null && payload?.returnSelect !== undefined) {
              q = q.select(payload.returnSelect || '*')
              if (payload?.singleMode === 'single') q = q.single()
              else if (payload?.singleMode === 'maybeSingle') q = q.maybeSingle()
            }

            const res = await q
            if (res.error) throw res.error
            return { __spoke_query_v1: true, data: res.data, count: res.count ?? null }
          }

          throw new Error(`Unsupported spoke_query op: ${op}`)
        }

        if (action === 'spoke_query_batch') {
          const queries = Array.isArray(payload?.queries) ? payload.queries.slice(0, 32) : []
          const results = await Promise.all(
            queries.map(async (qSpec: any) => {
              try {
                const out = await executeSingleSpokeQuery(qSpec)
                return { ok: true, ...out }
              } catch (err: any) {
                return { ok: false, error: sanitizeGatewayErrorMessage(err) }
              }
            })
          )
          return { __spoke_batch_v1: true, results }
        }

        return await executeSingleSpokeQuery(payload)
}

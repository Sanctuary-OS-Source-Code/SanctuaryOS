/// <reference path="../deno.d.ts" />
import {
  UUID_REGEX,
  b64UrlToBytes,
  bytesToB64Url,
  createSpokeClient,
  getMasterKeyRing,
} from './cryptoEnvelope.ts'
import { resolveGameWithServiceKey } from './spokeAccessAndOwnership.ts'

const SHA256_REGEX = /^[0-9a-f]{64}$/i
const BLUEPRINT_CODE_REGEX = /^[A-Za-z0-9_-]{4,64}$/
const REAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const BLINDED_EMAIL_REGEX = /@blind\.sanctuaryos\.(net|local)$/i

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function isValidLegalNoticeEmail(raw: unknown): boolean {
  const email = String(raw || '').trim()
  if (!email || email.startsWith('@')) return false
  if (BLINDED_EMAIL_REGEX.test(email)) return false
  return REAL_EMAIL_REGEX.test(email)
}

function maskEmailAddress(email: string): string {
  const clean = String(email || '').trim()
  const atIdx = clean.indexOf('@')
  if (atIdx <= 0) return clean ? '***' : ''
  const local = clean.slice(0, atIdx)
  const domain = clean.slice(atIdx + 1)
  const visibleLocal = local.length <= 2 ? `${local[0]}*` : `${local.slice(0, 2)}***`
  return `${visibleLocal}@${domain}`
}

function maskLegalName(name: string): string {
  const clean = String(name || '').trim()
  if (!clean) return ''
  return clean
    .split(/\s+/)
    .map((part) => (part.length <= 2 ? `${part[0]}*` : `${part[0]}***${part[part.length - 1]}`))
    .join(' ')
}

function normalizeTargetIdentifiers(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(/[\r\n,;]+/)
        .map((s) => s.trim())
  const deduped: string[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const clean = String(item || '').trim()
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(clean)
  }
  return deduped
}

function isValidTargetIdentifierToken(token: string): boolean {
  if (!token || /\s/.test(token)) return false
  return (
    UUID_REGEX.test(token) ||
    SHA256_REGEX.test(token) ||
    BLUEPRINT_CODE_REGEX.test(token)
  )
}

async function resolveDmcaKeyRing(): Promise<Array<{ kid: string; key: Uint8Array }>> {
  try {
    const ring = getMasterKeyRing()
    if (ring.length > 0) return ring
  } catch {
    // Fallback to HKDF over service role key when dedicated master key env is absent
  }
  const fallbackSecret = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (!fallbackSecret) {
    throw new Error('Server configuration missing DMCA sealing key material')
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(fallbackSecret))
  return [{ kid: 'srk1', key: new Uint8Array(digest) }]
}

async function deriveDmcaAesKey(masterKeyBytes: Uint8Array, noticeId: string) {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes as BufferSource,
    'HKDF',
    false,
    ['deriveKey']
  )
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(noticeId) as BufferSource,
      info: encoder.encode('sanctuary-os/dmca-legal-contact/v1') as BufferSource,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function sealLegalContact(contactObj: Record<string, any>, noticeId: string): Promise<string> {
  const ring = await resolveDmcaKeyRing()
  const active = ring[0]
  const aesKey = await deriveDmcaAesKey(active.key, noticeId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aad = encoder.encode(`dmca:${noticeId}`) as BufferSource
  const pt = encoder.encode(JSON.stringify(contactObj)) as BufferSource
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad },
    aesKey,
    pt
  )
  return `enc:dmca1:${active.kid}:${bytesToB64Url(iv)}:${bytesToB64Url(new Uint8Array(ctBuf))}`
}

async function openLegalContact(sealed: string, noticeId: string): Promise<Record<string, any> | null> {
  if (!sealed || !sealed.startsWith('enc:dmca1:')) return null
  const parts = sealed.split(':')
  if (parts.length !== 5) return null
  const [, , kid, ivB64, ctB64] = parts
  try {
    const ring = await resolveDmcaKeyRing()
    const ordered = [
      ...ring.filter((entry) => entry.kid === kid),
      ...ring.filter((entry) => entry.kid !== kid),
    ]
    const iv = b64UrlToBytes(ivB64)
    const ct = b64UrlToBytes(ctB64)
    const aad = encoder.encode(`dmca:${noticeId}`) as BufferSource
    for (const entry of ordered) {
      try {
        const aesKey = await deriveDmcaAesKey(entry.key, noticeId)
        const pt = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad },
          aesKey,
          ct as BufferSource
        )
        return JSON.parse(decoder.decode(pt))
      } catch {
        // Try next key in ring
      }
    }
  } catch {
    return null
  }
  return null
}

async function resolveSpokeClientForNotice(
  supabaseAdmin: any,
  notice: any,
  explicitGameDb?: any,
  explicitGame?: any
) {
  if (explicitGameDb && explicitGame && String(explicitGame.id) === String(notice.target_spoke_id || '')) {
    return { gameDb: explicitGameDb, game: explicitGame }
  }
  if (notice.target_scope !== 'spoke' || !notice.target_spoke_id) {
    return { gameDb: null, game: null }
  }
  const resolved = await resolveGameWithServiceKey(supabaseAdmin, String(notice.target_spoke_id))
  if (resolved.error || !resolved.game || !resolved.serviceKey) {
    throw new Error('Target Partner Spoke credentials unavailable for compliance action')
  }
  const gameDb = createSpokeClient(
    resolved.game.supabase_url,
    resolved.game.supabase_anon_key || '',
    resolved.serviceKey
  )
  return { gameDb, game: resolved.game }
}

async function findMatchingSpokeTargets(gameDb: any, rawIdentifiers: string[]) {
  const identifiers = normalizeTargetIdentifiers(rawIdentifiers)
  const uuidTokens = identifiers.filter((t) => UUID_REGEX.test(t))
  const hashTokens = identifiers.filter((t) => SHA256_REGEX.test(t)).map((h) => h.toLowerCase())
  const codeTokens = identifiers.filter(
    (t) => !UUID_REGEX.test(t) && !SHA256_REGEX.test(t) && BLUEPRINT_CODE_REGEX.test(t)
  )

  const modIds = new Set<string>(uuidTokens)
  if (hashTokens.length > 0) {
    const { data: matchedVersions } = await gameDb
      .from('mod_versions')
      .select('mod_id, dna_hash')
      .in('dna_hash', hashTokens)
    for (const v of matchedVersions || []) {
      if (v?.mod_id) modIds.add(String(v.mod_id))
    }
  }

  let matchedMods: any[] = []
  if (modIds.size > 0) {
    const { data: modsRows } = await gameDb
      .from('mods')
      .select('id, name, mason_id, compliance_tier, status, status_reason')
      .in('id', Array.from(modIds))
    matchedMods = modsRows || []
  }

  const matchedBlueprintsMap = new Map<number, any>()
  if (codeTokens.length > 0) {
    const { data: bpByCode } = await gameDb
      .from('blueprints')
      .select('id, code, name, mason_id, artifacts, is_public, compliance_tier')
      .in('code', codeTokens)
    for (const bp of bpByCode || []) {
      matchedBlueprintsMap.set(Number(bp.id), bp)
    }
  }
  const numericIds = identifiers.filter((t) => /^\d+$/.test(t)).map((n) => Number(n))
  if (numericIds.length > 0) {
    const { data: bpById } = await gameDb
      .from('blueprints')
      .select('id, code, name, mason_id, artifacts, is_public, compliance_tier')
      .in('id', numericIds)
    for (const bp of bpById || []) {
      matchedBlueprintsMap.set(Number(bp.id), bp)
    }
  }

  return {
    hashTokens,
    matchedMods,
    matchedBlueprints: Array.from(matchedBlueprintsMap.values()),
  }
}

async function resolveAffectedHubProfileId(
  gameDb: any,
  matchedMods: any[],
  matchedBlueprints: any[],
  explicitUserId?: string | null
): Promise<string | null> {
  if (explicitUserId && UUID_REGEX.test(explicitUserId)) return explicitUserId
  const masonIds = new Set<string>()
  for (const m of matchedMods) {
    if (m?.mason_id && UUID_REGEX.test(String(m.mason_id))) masonIds.add(String(m.mason_id))
  }
  for (const bp of matchedBlueprints) {
    if (bp?.mason_id && UUID_REGEX.test(String(bp.mason_id))) masonIds.add(String(bp.mason_id))
  }
  if (masonIds.size === 0) return null

  const idList = Array.from(masonIds)
  const { data: masonRows } = await gameDb
    .from('masons')
    .select('id, profile_id')
    .in('id', idList)
  for (const mr of masonRows || []) {
    if (mr?.profile_id && UUID_REGEX.test(String(mr.profile_id))) {
      return String(mr.profile_id)
    }
  }

  const { data: directProfileRows } = await gameDb
    .from('profiles')
    .select('id')
    .in('id', idList)
    .limit(1)
  if (directProfileRows && directProfileRows[0]?.id) {
    return String(directProfileRows[0].id)
  }
  return null
}

async function stripHashesFromPublicBlueprints(gameDb: any, targetHashes: string[]) {
  if (targetHashes.length === 0) return 0
  const hashSet = new Set(targetHashes.map((h) => h.toLowerCase()))
  const { data: blueprints } = await gameDb
    .from('blueprints')
    .select('id, artifacts, compliance_tier')
    .eq('is_public', true)
    .not('artifacts', 'is', null)

  let strippedCount = 0
  for (const bp of blueprints || []) {
    if (!Array.isArray(bp?.artifacts) || bp.artifacts.length === 0) continue
    let changed = false
    const filtered = bp.artifacts.filter((item: any) => {
      const h = String(item?.dna_hash || item?.hash || item || '').trim().toLowerCase()
      if (hashSet.has(h)) {
        changed = true
        return false
      }
      return true
    })
    if (changed) {
      await gameDb
        .from('blueprints')
        .update({ artifacts: filtered })
        .eq('id', bp.id)
      strippedCount++
    }
  }
  return strippedCount
}

export async function handleSubmitDmcaOrLegalNotice(ctx: {
  payload: any;
  user: any;
  supabaseAdmin: any;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const { payload, user, supabaseAdmin, corsHeaders } = ctx
  const noticeType = String(payload?.notice_type || '').trim().toLowerCase()
  if (!['dmca_takedown', 'dmca_counter', 'privacy_general'].includes(noticeType)) {
    throw new Error('Invalid legal/compliance notice_type')
  }

  const contact = (payload?.legal_contact && typeof payload.legal_contact === 'object')
    ? payload.legal_contact
    : {}
  const fullLegalName = String(contact.full_legal_name || payload?.legal_name || '').trim()
  const companyOrAgent = String(contact.company_or_agent || '').trim()
  const physicalAddress = String(contact.physical_address || '').trim()
  const phone = String(contact.phone || '').trim()
  const replyEmail = String(contact.email || payload?.reply_email || payload?.reply_handle || '').trim()

  const rawTargetScope = String(payload?.target_scope || 'hub').trim().toLowerCase()
  const targetScope = rawTargetScope === 'spoke' ? 'spoke' : 'hub'
  const targetSpokeId = targetScope === 'spoke' ? String(payload?.target_spoke_id || '').trim() : null
  if (targetScope === 'spoke' && !UUID_REGEX.test(String(targetSpokeId || ''))) {
    throw new Error('Valid target Partner Spoke selection is required')
  }

  const targetIdentifiers = normalizeTargetIdentifiers(payload?.target_identifiers)
  const workDescription = String(payload?.work_description || payload?.description || '').trim()
  const workUrl = String(payload?.work_url || '').trim()
  const electronicSignature = String(payload?.electronic_signature || '').trim()

  const goodFaithAttested = Boolean(payload?.good_faith_attested)
  const perjuryAuthorityAttested = Boolean(payload?.perjury_authority_attested)
  const jurisdictionAttested = Boolean(payload?.jurisdiction_attested)
  const forwardingAcknowledged = Boolean(payload?.forwarding_acknowledged)

  if (noticeType === 'dmca_takedown') {
    if (!isValidLegalNoticeEmail(replyEmail)) {
      throw new Error(
        '17 U.S.C. § 512(c)(3): A real, routable email address is strictly required. Discord handles and synthetic Blinded Email aliases cannot be used for DMCA notices.'
      )
    }
    if (targetIdentifiers.length === 0 || !targetIdentifiers.every(isValidTargetIdentifierToken)) {
      throw new Error(
        '17 U.S.C. § 512(c)(3)(A)(iii): Provide exact UUID(s), 64-char SHA-256 hash(es), or public Cloud Blueprint code(s) identifying the specific material.'
      )
    }
    if (workDescription.length < 15 || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(workUrl)) {
      throw new Error(
        '17 U.S.C. § 512(c)(3)(A)(ii): Provide a specific description (>= 15 characters) and valid official http(s) URL of the copyrighted work.'
      )
    }
    if (fullLegalName.length < 3 || physicalAddress.length < 8 || phone.length < 7) {
      throw new Error(
        '17 U.S.C. § 512(c)(3)(A)(iv): Full legal name, physical mailing address, phone number, and real email address are required.'
      )
    }
    if (!goodFaithAttested || !perjuryAuthorityAttested) {
      throw new Error(
        '17 U.S.C. § 512(c)(3)(A)(v)-(vi): Both good-faith belief and accuracy/authority under penalty of perjury attestations are required.'
      )
    }
    if (!electronicSignature || electronicSignature.toLowerCase() !== fullLegalName.toLowerCase()) {
      throw new Error(
        '17 U.S.C. § 512(c)(3)(A)(i): Electronic signature must match your full legal name.'
      )
    }
  } else if (noticeType === 'dmca_counter') {
    if (!isValidLegalNoticeEmail(replyEmail)) {
      throw new Error(
        '17 U.S.C. § 512(g)(3): A real, routable email address is strictly required for DMCA counter-notices.'
      )
    }
    const originalNoticeId = String(payload?.original_notice_id || '').trim()
    const hasRefOrId = UUID_REGEX.test(originalNoticeId) || (targetIdentifiers.length > 0 && targetIdentifiers.every(isValidTargetIdentifierToken))
    if (!hasRefOrId || workDescription.length < 10) {
      throw new Error(
        '17 U.S.C. § 512(g)(3)(B): Provide the original Notice ID or specific Target Identifier(s) and description of the removed material.'
      )
    }
    if (fullLegalName.length < 3 || physicalAddress.length < 8 || phone.length < 7) {
      throw new Error(
        '17 U.S.C. § 512(g)(3)(A): Full legal name, physical address, phone number, and real email address are required.'
      )
    }
    if (!goodFaithAttested || !perjuryAuthorityAttested || !jurisdictionAttested || !forwardingAcknowledged) {
      throw new Error(
        '17 U.S.C. § 512(g)(3)(C)-(D): Statutory mistake/misidentification perjury attestation, Federal Court jurisdiction consent, and claimant-forwarding acknowledgment are all required.'
      )
    }
    if (!electronicSignature || electronicSignature.toLowerCase() !== fullLegalName.toLowerCase()) {
      throw new Error(
        '17 U.S.C. § 512(g)(3)(A): Electronic signature must match your full legal name.'
      )
    }
  } else {
    if (replyEmail.length < 3 || workDescription.length < 10) {
      throw new Error('Reply contact and detailed description (>= 10 characters) are required.')
    }
    if (electronicSignature.length < 2 && fullLegalName.length < 2) {
      throw new Error('Legal name or signature is required.')
    }
  }

  const noticeId = crypto.randomUUID()
  const nowIso = new Date().toISOString()
  const isDmcaSpokeRelay =
    targetScope === 'spoke' && (noticeType === 'dmca_takedown' || noticeType === 'dmca_counter')
  const slaDeadlineAt = isDmcaSpokeRelay
    ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    : null
  const relayStatus = isDmcaSpokeRelay ? 'SPOKE_PENDING_SLA' : 'OPEN'

  const sealedContact = await sealLegalContact(
    {
      full_legal_name: fullLegalName || electronicSignature,
      company_or_agent: companyOrAgent || null,
      physical_address: physicalAddress || null,
      phone: phone || null,
      email: replyEmail,
      electronic_signature: electronicSignature || fullLegalName,
      submitted_at: nowIso,
    },
    noticeId
  )

  const claimantMasked = maskLegalName(fullLegalName || electronicSignature)
  const replyMasked = replyEmail.includes('@') && !replyEmail.startsWith('@')
    ? maskEmailAddress(replyEmail)
    : `${replyEmail.slice(0, 3)}***`

  let spokeName = 'Sanctuary OS (Keepers Core)'
  let resolvedSpoke: any = null
  if (targetScope === 'spoke' && targetSpokeId) {
    resolvedSpoke = await resolveGameWithServiceKey(supabaseAdmin, targetSpokeId)
    if (resolvedSpoke.error || !resolvedSpoke.game) {
      throw new Error('Target Partner Spoke could not be resolved')
    }
    spokeName = resolvedSpoke.game.name || resolvedSpoke.game.schema_id || 'Partner Spoke'
  }

  const noticeLabel =
    noticeType === 'dmca_takedown'
      ? 'DMCA Takedown Notice (§ 512(c)(3))'
      : noticeType === 'dmca_counter'
        ? 'DMCA Counter-Notice (§ 512(g)(3))'
        : 'Privacy & General Legal Inquiry'

  const sanitizedSummary = [
    `Notice Type: ${noticeLabel}`,
    `Notice ID: #${noticeId.slice(0, 8)}`,
    `Target Scope: ${spokeName}`,
    targetIdentifiers.length > 0 ? `Target Identifiers: ${targetIdentifiers.join(', ')}` : null,
    workUrl ? `Original Work URL: ${workUrl}` : null,
    `Claimant (Masked): ${claimantMasked} • Reply (Masked): ${replyMasked}`,
    slaDeadlineAt ? `48h Spoke SLA Deadline: ${slaDeadlineAt}` : null,
    '',
    'Full statutory contact block is encrypted inside Keepers/Oversight Compliance Dossier (PII Zero-Plaintext Vault).',
  ]
    .filter(Boolean)
    .join('\n')

  const ticketTitle = `[Legal • ${
    noticeType === 'dmca_takedown' ? 'DMCA §512(c)(3)' : noticeType === 'dmca_counter' ? 'Counter §512(g)(3)' : 'Privacy/Legal'
  }] ${String(payload?.subject || spokeName).trim().slice(0, 120)}`

  const { data: createdHubTicket, error: hubTicketErr } = await supabaseAdmin
    .from('keeper_tickets')
    .insert({
      author_id: user?.id || null,
      ticket_type: 'Direct Contact - Legal & Compliance',
      title: ticketTitle,
      description: sanitizedSummary,
      status: 'NEW',
      metadata: {
        dmca_notice_id: noticeId,
        notice_type: noticeType,
        target_scope: targetScope,
        target_spoke_id: targetSpokeId,
        target_spoke_name: spokeName,
        sla_deadline_at: slaDeadlineAt,
        contact_meta: {
          category: 'Legal, DMCA & Privacy Compliance',
          notice_type: noticeType,
          reply_handle_masked: replyMasked,
          is_blinded_relay_rejected: true,
        },
      },
    })
    .select('id')
    .single()
  if (hubTicketErr) throw hubTicketErr

  const { error: noticeErr } = await supabaseAdmin
    .from('dmca_compliance_notices')
    .insert({
      id: noticeId,
      ticket_id: createdHubTicket?.id || null,
      notice_type: noticeType,
      target_scope: targetScope,
      target_spoke_id: targetSpokeId,
      target_identifiers: targetIdentifiers,
      work_description: workDescription || null,
      work_url: workUrl || null,
      claimant_name_masked: claimantMasked,
      reply_email_masked: replyMasked,
      sealed_legal_contact: sealedContact,
      good_faith_attested: goodFaithAttested,
      perjury_authority_attested: perjuryAuthorityAttested,
      jurisdiction_attested: jurisdictionAttested,
      forwarding_acknowledged: forwardingAcknowledged,
      electronic_signature: electronicSignature || fullLegalName,
      submitter_user_id: user?.id || null,
      relay_status: relayStatus,
      sla_deadline_at: slaDeadlineAt,
      metadata: {
        original_notice_id: payload?.original_notice_id || null,
        subject: String(payload?.subject || '').trim().slice(0, 160) || null,
        target_spoke_name: spokeName,
      },
    })
  if (noticeErr) throw noticeErr

  let spokeTicketId: string | null = null
  if (targetScope === 'spoke' && resolvedSpoke?.serviceKey) {
    try {
      const spokeDb = createSpokeClient(
        resolvedSpoke.game.supabase_url,
        resolvedSpoke.game.supabase_anon_key || '',
        resolvedSpoke.serviceKey
      )
      let relayAuthorId: string | null = user?.id || null
      if (relayAuthorId) {
        const { data: existingProf } = await spokeDb
          .from('profiles')
          .select('id')
          .eq('id', relayAuthorId)
          .maybeSingle()
        if (!existingProf?.id) {
          await spokeDb
            .from('profiles')
            .insert({
              id: relayAuthorId,
              username: `Citizen_${relayAuthorId.slice(0, 6)}`,
              role: 'citizen',
            })
            .select('id')
            .maybeSingle()
        }
      } else {
        const { data: staffAnchors } = await spokeDb
          .from('profiles')
          .select('id, role')
          .in('role', ['wayfinder', 'oversight', 'admin'])
          .limit(1)
        if (staffAnchors && staffAnchors[0]?.id) {
          relayAuthorId = String(staffAnchors[0].id)
        } else {
          const { data: anyProf } = await spokeDb.from('profiles').select('id').limit(1)
          relayAuthorId = anyProf?.[0]?.id ? String(anyProf[0].id) : null
        }
      }

      const spokeTicketBody: Record<string, any> = {
        ticket_type: 'DMCA & Legal Compliance',
        status: 'OPEN',
        title: ticketTitle,
        description: sanitizedSummary,
        metadata: {
          dmca_notice_id: noticeId,
          hub_ticket_id: createdHubTicket?.id || null,
          notice_type: noticeType,
          sla_deadline_at: slaDeadlineAt,
          target_identifiers: targetIdentifiers,
          external_claimant_relay: !user?.id,
        },
      }
      if (relayAuthorId) spokeTicketBody.author_id = relayAuthorId

      const { data: createdSpokeTicket, error: spokeTicketErr } = await spokeDb
        .from('sanctuary_tickets')
        .insert(spokeTicketBody)
        .select('id')
        .maybeSingle()

      if (!spokeTicketErr && createdSpokeTicket?.id) {
        spokeTicketId = String(createdSpokeTicket.id)
        await supabaseAdmin
          .from('dmca_compliance_notices')
          .update({ spoke_ticket_id: spokeTicketId })
          .eq('id', noticeId)
      }
    } catch (relayErr) {
      console.warn('Spoke DMCA relay warning:', relayErr)
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      notice_id: noticeId,
      hub_ticket_id: createdHubTicket?.id || null,
      spoke_ticket_id: spokeTicketId,
      relay_status: relayStatus,
      sla_deadline_at: slaDeadlineAt,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  )
}

export async function handleListSpokeDmcaNotices(ctx: {
  payload: any;
  game?: any;
  hubRole: string;
  callerSpokeRole?: string;
  supabaseAdmin: any;
}) {
  const { payload, game, hubRole, callerSpokeRole, supabaseAdmin } = ctx
  const isKeeper = hubRole === 'keeper'
  const isSpokeCompliance =
    Boolean(game?.id) &&
    ['wayfinder', 'oversight', 'admin'].includes(String(callerSpokeRole || '').toLowerCase())

  if (!isKeeper && !isSpokeCompliance) {
    throw new Error('Forbidden: Wayfinder, Oversight, or Keeper clearance required for DMCA notices')
  }

  let q = supabaseAdmin
    .from('dmca_compliance_notices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (!isKeeper && game?.id) {
    q = q.eq('target_scope', 'spoke').eq('target_spoke_id', game.id)
  } else if (payload?.filter_game_id && UUID_REGEX.test(String(payload.filter_game_id))) {
    q = q.eq('target_spoke_id', String(payload.filter_game_id))
  }

  const { data: rows, error } = await q
  if (error) throw error

  const nowMs = Date.now()
  const overdueSpokeCounts: Record<string, number> = {}
  const enriched = await Promise.all(
    (rows || []).map(async (row: any) => {
      const decryptedContact = await openLegalContact(
        String(row.sealed_legal_contact || ''),
        String(row.id)
      )
      const isOverdue =
        row.target_scope === 'spoke' &&
        row.relay_status === 'SPOKE_PENDING_SLA' &&
        row.sla_deadline_at &&
        new Date(row.sla_deadline_at).getTime() < nowMs

      if (isOverdue && row.target_spoke_id) {
        const key = String(row.target_spoke_id)
        overdueSpokeCounts[key] = (overdueSpokeCounts[key] || 0) + 1
      }

      return {
        ...row,
        sealed_legal_contact: undefined,
        decrypted_contact: decryptedContact,
        is_sla_overdue: Boolean(isOverdue),
      }
    })
  )

  return {
    notices: enriched,
    overdue_spoke_counts: overdueSpokeCounts,
  }
}

export async function handleExecuteDmcaTriageAction(ctx: {
  payload: any;
  game?: any;
  gameDb?: any;
  v_user_id: string;
  hubRole: string;
  callerSpokeRole?: string;
  supabaseAdmin: any;
}) {
  const { payload, game, gameDb: explicitGameDb, v_user_id, hubRole, callerSpokeRole, supabaseAdmin } = ctx
  const noticeId = String(payload?.notice_id || '').trim()
  const subAction = String(payload?.triage_action || '').trim().toUpperCase()
  const resolutionNotes = String(payload?.resolution_notes || '').trim().slice(0, 1500)

  if (!UUID_REGEX.test(noticeId)) throw new Error('Invalid notice_id')
  if (!['VALIDATE_TAKEDOWN', 'REJECT_NOTICE', 'ACCEPT_COUNTER_NOTICE', 'RESTORE_MATERIAL'].includes(subAction)) {
    throw new Error('Invalid DMCA triage action')
  }

  const isKeeper = hubRole === 'keeper'
  const isSpokeCompliance =
    Boolean(game?.id) &&
    ['wayfinder', 'oversight', 'admin'].includes(String(callerSpokeRole || '').toLowerCase())

  if (!isKeeper && !isSpokeCompliance) {
    throw new Error('Forbidden: Wayfinder, Oversight, or Keeper clearance required to triage DMCA notices')
  }

  const { data: notice, error: fetchErr } = await supabaseAdmin
    .from('dmca_compliance_notices')
    .select('*')
    .eq('id', noticeId)
    .maybeSingle()
  if (fetchErr || !notice) throw new Error('Compliance notice record not found')

  if (!isKeeper && String(notice.target_spoke_id || '') !== String(game?.id || '')) {
    throw new Error('Forbidden: Cross-Spoke DMCA triage denied')
  }

  const nowIso = new Date().toISOString()
  const windowEndsIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { gameDb, game: resolvedGame } = await resolveSpokeClientForNotice(
    supabaseAdmin,
    notice,
    explicitGameDb,
    game
  )

  let nextRelayStatus = notice.relay_status
  let nextAffectedUserId = notice.affected_user_id || null
  let strikeCountUpdated: number | null = null
  let publishingRevokedNow = false
  let affectedModsCount = 0
  let affectedBlueprintsCount = 0

  if (subAction === 'VALIDATE_TAKEDOWN') {
    const holdReason = `[DMCA HOLD - TIER 6] ${resolutionNotes || '17 U.S.C. § 512(c)(3) Validated Takedown Hold (10-14 business day window)'}`
    if (gameDb) {
      const { hashTokens, matchedMods, matchedBlueprints } = await findMatchingSpokeTargets(
        gameDb,
        notice.target_identifiers || []
      )
      if (matchedMods.length > 0) {
        const modIdList = matchedMods.map((m) => m.id)
        await gameDb
          .from('mods')
          .update({
            compliance_tier: 6,
            status: 'verified',
            status_reason: holdReason,
            has_pending_flag: false,
          })
          .in('id', modIdList)
        affectedModsCount = modIdList.length
      }
      if (matchedBlueprints.length > 0) {
        const bpIds = matchedBlueprints.map((b) => b.id)
        await gameDb
          .from('blueprints')
          .update({
            compliance_tier: 6,
            is_public: false,
            has_pending_flag: false,
          })
          .in('id', bpIds)
        affectedBlueprintsCount = bpIds.length
      }
      if (hashTokens.length > 0) {
        affectedBlueprintsCount += await stripHashesFromPublicBlueprints(gameDb, hashTokens)
      }

      nextAffectedUserId = await resolveAffectedHubProfileId(
        gameDb,
        matchedMods,
        matchedBlueprints,
        notice.affected_user_id
      )

      if (nextAffectedUserId) {
        const { data: hubProf } = await supabaseAdmin
          .from('profiles')
          .select('dmca_strike_count, dmca_strike_log')
          .eq('id', nextAffectedUserId)
          .maybeSingle()

        const currentStrikes = Number(hubProf?.dmca_strike_count || 0)
        const nextStrikes = currentStrikes + 1
        strikeCountUpdated = nextStrikes
        publishingRevokedNow = nextStrikes >= 3

        const strikeEntry = {
          notice_id: noticeId,
          spoke_id: notice.target_spoke_id,
          strike_number: nextStrikes,
          recorded_at: nowIso,
          notes: resolutionNotes || 'Validated § 512(c)(3) takedown hold',
        }
        const prevLog = Array.isArray(hubProf?.dmca_strike_log) ? hubProf.dmca_strike_log : []

        await supabaseAdmin
          .from('profiles')
          .update({
            dmca_strike_count: nextStrikes,
            cloud_publishing_revoked: publishingRevokedNow,
            cloud_publishing_revoked_reason: publishingRevokedNow
              ? '3 uncontested DMCA takedown strikes (17 U.S.C. § 512(i))'
              : null,
            dmca_strike_log: [...prevLog, strikeEntry],
          })
          .eq('id', nextAffectedUserId)

        await gameDb
          .from('profiles')
          .update({
            dmca_strike_count: nextStrikes,
            cloud_publishing_revoked: publishingRevokedNow,
          })
          .eq('id', nextAffectedUserId)

        if (publishingRevokedNow) {
          await gameDb
            .from('masons')
            .update({ is_verified: false })
            .eq('profile_id', nextAffectedUserId)
        }

        try {
          await gameDb.from('notifications').insert({
            user_id: nextAffectedUserId,
            actor_id: v_user_id,
            type: 'dmca_takedown_notice',
            title: publishingRevokedNow
              ? 'DMCA Takedown & Cloud Publishing Revoked (§ 512(i))'
              : `DMCA Takedown Hold Placed (Strike ${nextStrikes}/3)`,
            message: `Material referenced under DMCA Notice #${noticeId.slice(0, 8)} has been soft-delisted (Tier 6). You have 10–14 business days to file a § 512(g)(3) counter-notice.${
              publishingRevokedNow
                ? ' Cloud publishing privileges have been automatically revoked upon reaching 3 strikes.'
                : ''
            }`,
          })
        } catch {
          // Notification table best-effort
        }
      }
    }
    nextRelayStatus = 'VALIDATED_HOLD'
  } else if (subAction === 'REJECT_NOTICE') {
    if (!resolutionNotes) {
      throw new Error('Rejection reason is required to reject an incomplete or invalid DMCA notice')
    }
    nextRelayStatus = 'REJECTED_INVALID'
  } else if (subAction === 'ACCEPT_COUNTER_NOTICE') {
    nextRelayStatus = 'COUNTER_NOTICE_PENDING_10_14D'
  } else if (subAction === 'RESTORE_MATERIAL') {
    if (gameDb) {
      const { matchedMods, matchedBlueprints } = await findMatchingSpokeTargets(
        gameDb,
        notice.target_identifiers || []
      )
      if (matchedMods.length > 0) {
        await gameDb
          .from('mods')
          .update({
            compliance_tier: 0,
            status: 'verified',
            status_reason: resolutionNotes || 'Restored following § 512(g) resolution',
          })
          .in('id', matchedMods.map((m) => m.id))
        affectedModsCount = matchedMods.length
      }
      if (matchedBlueprints.length > 0) {
        await gameDb
          .from('blueprints')
          .update({
            compliance_tier: 0,
            is_public: true,
          })
          .in('id', matchedBlueprints.map((b) => b.id))
        affectedBlueprintsCount = matchedBlueprints.length
      }
      const affectedUid =
        notice.affected_user_id ||
        (await resolveAffectedHubProfileId(gameDb, matchedMods, matchedBlueprints, null))
      if (affectedUid) {
        const { data: hubProf } = await supabaseAdmin
          .from('profiles')
          .select('dmca_strike_count')
          .eq('id', affectedUid)
          .maybeSingle()
        const currentStrikes = Number(hubProf?.dmca_strike_count || 0)
        const nextStrikes = Math.max(0, currentStrikes - 1)
        const stillRevoked = nextStrikes >= 3
        strikeCountUpdated = nextStrikes

        await supabaseAdmin
          .from('profiles')
          .update({
            dmca_strike_count: nextStrikes,
            cloud_publishing_revoked: stillRevoked,
            cloud_publishing_revoked_reason: stillRevoked
              ? '3 uncontested DMCA takedown strikes (17 U.S.C. § 512(i))'
              : null,
          })
          .eq('id', affectedUid)

        await gameDb
          .from('profiles')
          .update({
            dmca_strike_count: nextStrikes,
            cloud_publishing_revoked: stillRevoked,
          })
          .eq('id', affectedUid)
      }
    }
    nextRelayStatus = 'RESTORED'
  }

  const noticeUpdate: Record<string, any> = {
    relay_status: nextRelayStatus,
    affected_user_id: nextAffectedUserId,
    resolution_notes: resolutionNotes || null,
    resolved_at: nowIso,
    updated_at: nowIso,
  }
  if (subAction === 'VALIDATE_TAKEDOWN' || subAction === 'ACCEPT_COUNTER_NOTICE') {
    noticeUpdate.counter_window_ends_at = windowEndsIso
  }

  const { error: updNoticeErr } = await supabaseAdmin
    .from('dmca_compliance_notices')
    .update(noticeUpdate)
    .eq('id', noticeId)
  if (updNoticeErr) throw updNoticeErr

  const closedTicketStatus =
    subAction === 'REJECT_NOTICE' ? 'REJECTED' : 'RESOLVED'
  if (notice.ticket_id) {
    await supabaseAdmin
      .from('keeper_tickets')
      .update({ status: closedTicketStatus, updated_at: nowIso })
      .eq('id', notice.ticket_id)
  }
  if (gameDb && notice.spoke_ticket_id) {
    await gameDb
      .from('sanctuary_tickets')
      .update({ status: closedTicketStatus, updated_at: nowIso })
      .eq('id', notice.spoke_ticket_id)
  }

  try {
    await supabaseAdmin.from('audit_logs').insert({
      action: `DMCA Triage: ${subAction}`,
      target_table: 'dmca_compliance_notices',
      target_name: `#${noticeId.slice(0, 8)} (${nextRelayStatus})`,
      actor_id: v_user_id,
      game_name: resolvedGame?.name || 'Keepers Core',
      reason: resolutionNotes || `Executed ${subAction}`,
    })
  } catch {
    // audit best-effort
  }

  if (gameDb) {
    try {
      await gameDb.from('audit_logs').insert({
        action: `DMCA Triage: ${subAction}`,
        target_table: 'sanctuary_tickets',
        target_name: `#${noticeId.slice(0, 8)} (${nextRelayStatus})`,
        actor_id: v_user_id,
        reason: resolutionNotes || `Executed ${subAction}`,
      })
    } catch {
      // Spoke audit best-effort
    }
  }

  return {
    ok: true,
    notice_id: noticeId,
    relay_status: nextRelayStatus,
    affected_mods_count: affectedModsCount,
    affected_blueprints_count: affectedBlueprintsCount,
    strike_count: strikeCountUpdated,
    cloud_publishing_revoked: publishingRevokedNow,
  }
}

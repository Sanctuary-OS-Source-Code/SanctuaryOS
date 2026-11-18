/// <reference path="../deno.d.ts" />
export const SERVER_AUTH_OPTS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

export const ALLOWED_FILTER_METHODS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'overlaps',
  'not',
  'or',
  'match',
  'filter',
  'textSearch',
]);

export function applySpokeQueryFilters(query: any, filters: any[]) {
  let q = query;
  if (!Array.isArray(filters)) return q;
  for (const f of filters) {
    if (!f || typeof f.method !== 'string' || !ALLOWED_FILTER_METHODS.has(f.method)) continue;
    const args = Array.isArray(f.args) ? f.args : [];
    if (typeof q[f.method] === 'function') {
      q = q[f.method](...args);
    }
  }
  return q;
}

export function applySpokeQueryModifiers(query: any, spec: any) {
  let q = applySpokeQueryFilters(query, spec?.filters || []);
  if (Array.isArray(spec?.orders)) {
    for (const ord of spec.orders) {
      if (ord && typeof ord.column === 'string' && typeof q.order === 'function') {
        q = q.order(ord.column, ord.options || {});
      }
    }
  }
  if (Array.isArray(spec?.range) && spec.range.length === 2 && typeof q.range === 'function') {
    q = q.range(Number(spec.range[0]) || 0, Number(spec.range[1]) || 0);
  }
  if (typeof spec?.limit === 'number' && Number.isFinite(spec.limit) && typeof q.limit === 'function') {
    q = q.limit(spec.limit);
  }
  if (spec?.singleMode === 'single' && typeof q.single === 'function') {
    q = q.single();
  } else if (spec?.singleMode === 'maybeSingle' && typeof q.maybeSingle === 'function') {
    q = q.maybeSingle();
  }
  return q;
}

export const STATIC_ALLOWED_ORIGINS = new Set([
  'https://sanctuaryos.net',
  'https://www.sanctuaryos.net',
  'https://app.sanctuaryos.net',
  'https://sanctuaryos.gg',
  'https://www.sanctuaryos.gg',
  'https://app.sanctuaryos.gg',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
])

export function isAllowedCorsOrigin(origin: string): boolean {
  const clean = String(origin || '').trim().replace(/\/+$/, '')
  if (!clean) return false
  if (STATIC_ALLOWED_ORIGINS.has(clean)) return true
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) return true
  const extraRaw = String(Deno.env.get('ALLOWED_ORIGINS') || '')
  if (extraRaw) {
    for (const entry of extraRaw.split(',')) {
      const normalized = entry.trim().replace(/\/+$/, '')
      if (normalized && normalized === clean) return true
    }
  }
  return false
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const reqOrigin = req.headers.get('origin') || ''
  const allowOrigin = isAllowedCorsOrigin(reqOrigin) ? reqOrigin : 'https://sanctuaryos.net'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function sanitizeGatewayErrorMessage(err: any): string {
  const msg = String(err?.message || err || 'Gateway operation failed').trim()
  if (/^(Forbidden|Missing|Invalid|Refusing|Unsupported|Unknown action|Could not|Profile sync|No owned)/i.test(msg)) {
    return msg.slice(0, 240)
  }
  if (/mason_post_views_post_id_user_id_key/i.test(msg)) {
    return 'Conflict: mason_post_views_post_id_user_id_key'
  }
  if (/duplicate key|violates unique constraint|already exists/i.test(msg)) {
    return 'Conflict: Record already exists'
  }
  if (/violates foreign key constraint/i.test(msg)) {
    return 'Invalid reference target'
  }
  if (/violates check constraint/i.test(msg)) {
    return 'Invalid field value'
  }
  if (/JWT|token|Unauthorized|Authentication/i.test(msg)) {
    return 'Authentication failed'
  }
  return 'Gateway operation failed'
}

export const FORBIDDEN_EMBEDDED_TABLES = new Set([
  'sanctuary_tickets',
  'malware_reports',
  'notifications',
  'pwa_push_subscriptions',
  'citizen_staging_queue',
  'blueprint_reports',
  'nexus_reports',
  'content_flags',
  'hardware_bans',
  'keeper_tickets',
  'keeper_email_dispatches',
  'audit_logs',
])

export const SAFE_EMBEDDED_PROFILE_COLS = new Set(['id', 'username', 'role', 'avatar_url'])

export function sanitizeSpokeSelectColumns(rawSelect: string): string {
  const clean = String(rawSelect || '*').trim() || '*'
  if (/[;\r\n\0]|--|\/\*/.test(clean)) {
    throw new Error('Invalid select column specification')
  }
  const embedRegex = /(?:[a-zA-Z0-9_]+\s*:\s*)?([a-zA-Z0-9_]+)\s*(?:![a-zA-Z0-9_]+)?\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = embedRegex.exec(clean)) !== null) {
    const tbl = String(m[1] || '').trim().toLowerCase()
    const inner = String(m[2] || '').trim()
    if (FORBIDDEN_EMBEDDED_TABLES.has(tbl)) {
      throw new Error(`Forbidden: Embedded join not permitted on ${tbl}`)
    }
    if (tbl === 'profiles') {
      const cols = inner.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
      if (cols.length === 0 || cols.some((c) => !SAFE_EMBEDDED_PROFILE_COLS.has(c))) {
        throw new Error('Forbidden: Embedded profiles join only permits safe public columns')
      }
    }
  }
  return clean
}

export function redactRestrictedEmbeddedRelations(data: any): any {
  const cleanRow = (row: any): { keep: boolean; row: any } => {
    if (!row || typeof row !== 'object') return { keep: true, row }
    const next = { ...row }
    for (const relKey of ['mods', 'collections']) {
      const rel = next[relKey]
      if (!rel) continue
      if (Array.isArray(rel)) {
        next[relKey] = rel.filter((item: any) => {
          const t = Number(item?.compliance_tier ?? 0)
          return !((t >= 1 && t <= 4) || t === 6)
        })
      } else if (typeof rel === 'object') {
        const t = Number(rel?.compliance_tier ?? 0)
        if ((t >= 1 && t <= 4) || t === 6) {
          next[relKey] = null
        }
      }
    }
    return { keep: true, row: next }
  }
  if (Array.isArray(data)) {
    return data.map((r) => cleanRow(r).row)
  }
  if (data && typeof data === 'object') {
    return cleanRow(data).row
  }
  return data
}


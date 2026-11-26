// A fake IAM at the network (used by the e2e tests, `npm run dev:harness` and `npm run dev:mock-iam`): it answers the requests the real adapters send, as the three IAM services
// would (snake_case JSON, RFC 9457 problems with an errorCode, optimistic locking, idempotency, a cursor),
// and a fake object storage for the presigned PUT. Every IAM request and answer is also checked against the
// pinned Swagger when a `check` is given (the tests pass the contract harness, so the fake cannot drift from the
// services: a mismatch is recorded in `violations`). Failures are injectable per route. No test library here: it
// also runs in a browser and in plain Node.

export const ME = '11111111-1111-4111-8111-111111111111'
export const GRACE = '11111111-1111-4111-8111-222222222222'
export const ALAN = '11111111-1111-4111-8111-333333333333'
export const SUSPENDED = '11111111-1111-4111-8111-444444444444'
export const ENG = '22222222-2222-4222-8222-111111111111'
export const TENANT = 'tenant-1'
export const BUCKET = 'https://bucket.example'

type Json = Record<string, unknown>

/** What a request looked like to the fake, for a conformance check. */
export interface Captured {
  method: string
  pathname: string
  rawPath: string
  query: [string, string][]
  headers: Record<string, string>
  body: unknown
}
/** Returns what is wrong with a request and the answer it was given (empty when it conforms). */
export type Check = (call: Captured, answer: { status: number; body?: unknown }) => { problems: string[] }
export interface Injected {
  readonly status: number
  readonly errorCode?: string
  readonly extra?: Json
  /** Answer with a network failure instead of a response. */
  readonly network?: boolean
}

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')

export function createFakeIamServer(options: { check?: Check } = {}) {
  const state = {
    profile: {
      id: ME,
      tenant_id: TENANT,
      username: 'ada',
      display_name: 'Ada Lovelace',
      display_name_overridden: false,
      job_title: 'Engineer',
      job_title_overridden: false,
      email: 'ada@example.com',
      phone: '+442071838750',
      timezone: 'Europe/London',
      locale: 'en',
      credentials: { cert: 'AWS-SAA' } as Record<string, string>,
      source: 'local',
      status: 'active',
      provisional: false,
      record_version: 3,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as Json,
    availability: { user_id: ME, status: 'available', record_version: 2 } as Json,
    llm: undefined as Json | undefined,
    notifications: [] as Json[],
    delegations: [] as Json[],
    policy: { max_duration_days: 90, review_window_days: 90, record_version: 1 },
    users: new Map<string, Json>([
      [GRACE, { id: GRACE, display_name: 'Grace Hopper', email: 'grace@example.com', job_title: 'Admiral', source: 'local', status: 'active', record_version: 1 }],
      [ALAN, { id: ALAN, display_name: 'Alan Turing', email: 'alan@example.com', source: 'local', status: 'active', availability: { status: 'ooo' }, record_version: 1 }],
    ]),
    signature: undefined as { key: string; hash: string } | undefined,
    erasurePending: false,
    stored: new Map<string, { bytes: number; sha256: string; type: string | null }>(),
    idempotent: new Map<string, Json>(),
    nextDelegation: 1,
  }
  const log: string[] = []
  const bodies: Record<string, unknown[]> = {}
  const headersSeen: Record<string, Record<string, string>[]> = {}
  const violations: string[] = []
  const injected = new Map<string, Injected[]>()
  const storageInjected: Injected[] = []
  const storageRequests: { url: string; headers: Record<string, string>; credentials?: string; redirect?: string; referrerPolicy?: string; bytes: number }[] = []

  /** Fail the next call of a route, written `METHOD /path/with/:params` (as the Swagger writes it, without /api/v1). */
  const failNext = (route: string, f: Injected) => void injected.set(route, [...(injected.get(route) ?? []), f])
  const failStorage = (f: Injected) => void storageInjected.push(f)

  const problem = (status: number, errorCode: string, extra: Json = {}) =>
    new Response(
      JSON.stringify({ type: 'about:blank', title: 'Problem', status, detail: 'a sentence the service wrote', traceId: 'trace-1', errorCode, timestamp: '2026-11-26T10:00:00Z', ...extra }),
      { status, headers: { 'content-type': 'application/problem+json' } },
    )
  const json = (status: number, body?: unknown) => (body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  const typeOf = (status: number) => `https://errors.company.com/platform/${status === 409 ? 'conflict' : status === 404 ? 'not-found' : status === 422 ? 'validation-failed' : status === 429 ? 'rate-limit-exceeded' : status === 413 ? 'payload-too-large' : status === 403 ? 'forbidden' : 'service-unavailable'}`
  const fail = (status: number, errorCode: string, extra: Json = {}) => problem(status, errorCode, { type: typeOf(status), ...extra })
  const lock = (sent: unknown, current: unknown) => (typeof sent === 'number' && sent !== current ? fail(409, 'VERSION_CONFLICT', { record_version: current }) : undefined)

  const days = (n: number) => n * 86_400_000

  type Route = { method: string; pattern: RegExp; template: string; handle: (m: RegExpMatchArray, c: Captured) => Response | Promise<Response> }
  const routes: Route[] = [
    // ── User Profile ──
    { method: 'GET', template: '/users/:id', pattern: /^\/api\/v1\/users\/([^/:]+)$/, handle: () => json(200, { ...state.profile, availability: embedded() }) },
    {
      method: 'PATCH',
      template: '/users/:id',
      pattern: /^\/api\/v1\/users\/([^/:]+)$/,
      handle: (_m, c) => {
        const b = c.body as Json
        const conflict = lock(b['expected_version'], state.profile['record_version'])
        if (conflict) return conflict
        const bad: { field: string; message: string }[] = []
        if (typeof b['phone'] === 'string' && b['phone'] !== '' && !/^\+[0-9]{7,15}$/.test(b['phone'])) bad.push({ field: 'phone', message: 'must be E.164' })
        if (bad.length) return fail(422, 'VALIDATION_FAILED', { validationErrors: bad })
        const creds = { ...(state.profile['credentials'] as Record<string, string>), ...((b['credentials'] as Record<string, string>) ?? {}) }
        for (const k of (b['delete_credentials'] as string[]) ?? []) delete creds[k]
        for (const k of ['display_name', 'display_name_overridden', 'job_title', 'job_title_overridden', 'phone', 'timezone', 'locale']) if (k in b) state.profile[k] = b[k]
        state.profile['credentials'] = creds
        state.profile['record_version'] = (state.profile['record_version'] as number) + 1
        return json(200, { ...state.profile, availability: embedded() })
      },
    },
    {
      method: 'POST',
      template: '/users:batch',
      pattern: /^\/api\/v1\/users:batch$/,
      handle: (_m, c) => {
        const ids = (c.body as { ids: string[] }).ids
        const found = ids.flatMap((i) => (i === ME ? [{ ...state.profile, availability: embedded() }] : state.users.get(i) ? [state.users.get(i)!] : []))
        return json(200, { users: found, missing: ids.filter((i) => i !== ME && !state.users.has(i)) })
      },
    },
    { method: 'GET', template: '/users/:id/availability', pattern: /^\/api\/v1\/users\/[^/]+\/availability$/, handle: () => json(200, state.availability) },
    {
      method: 'PUT',
      template: '/users/:id/availability',
      pattern: /^\/api\/v1\/users\/[^/]+\/availability$/,
      handle: (_m, c) => {
        const b = c.body as Json
        const conflict = lock(b['expected_version'], state.availability['record_version'])
        if (conflict) return conflict
        if (b['status'] === 'ooo' && state.availability['delegate_user_id']) return fail(409, 'OOO_WINDOW_CONFLICT')
        const next: Json = { user_id: ME, status: b['status'], record_version: (state.availability['record_version'] as number) + 1 }
        for (const k of ['ooo_from', 'ooo_until', 'note']) if (b[k]) next[k] = b[k]
        if (state.availability['delegate_user_id']) next['delegate_user_id'] = state.availability['delegate_user_id']
        state.availability = next
        return json(200, next)
      },
    },
    { method: 'GET', template: '/users/:id/llm-preferences', pattern: /^\/api\/v1\/users\/[^/]+\/llm-preferences$/, handle: () => (state.llm ? json(200, state.llm) : fail(404, 'NOT_FOUND')) },
    {
      method: 'PUT',
      template: '/users/:id/llm-preferences',
      pattern: /^\/api\/v1\/users\/[^/]+\/llm-preferences$/,
      handle: (_m, c) => {
        const b = c.body as Json
        const conflict = lock(b['expected_version'], state.llm?.['record_version'] ?? 0)
        if (conflict) return conflict
        if (b['preferred_model'] === 'retired-model') return fail(422, 'UNKNOWN_MODEL')
        state.llm = { preferred_model: b['preferred_model'], writing_tone: b['writing_tone'], templates: b['templates'] ?? [], context_documents: b['context_documents'] ?? [], record_version: ((state.llm?.['record_version'] as number) ?? 0) + 1 }
        return json(200, state.llm)
      },
    },
    { method: 'GET', template: '/users/:id/notification-preferences', pattern: /^\/api\/v1\/users\/[^/]+\/notification-preferences$/, handle: () => json(200, { preferences: state.notifications }) },
    {
      method: 'PUT',
      template: '/users/:id/notification-preferences',
      pattern: /^\/api\/v1\/users\/[^/]+\/notification-preferences$/,
      handle: (_m, c) => {
        state.notifications = (c.body as { preferences: Json[] }).preferences
        return json(200, { preferences: state.notifications })
      },
    },
    {
      method: 'POST',
      template: '/users/:id/signature',
      pattern: /^\/api\/v1\/users\/[^/]+\/signature$/,
      handle: (_m, c) => {
        if (state.erasurePending) return fail(409, 'SIGNATURE_ERASURE_PENDING')
        const b = c.body as { byte_size: number; content_type: string }
        return json(200, { upload_url: `${BUCKET}/${ME}/signatures/sig.png?X-Amz-Signature=SECRET-${b.byte_size}`, object_key: `${ME}/signatures/sig.png`, expires_in: 300 })
      },
    },
    {
      method: 'PUT',
      template: '/users/:id/signature',
      pattern: /^\/api\/v1\/users\/[^/]+\/signature$/,
      handle: (_m, c) => {
        const b = c.body as { object_key: string; sha256: string }
        const stored = state.stored.get(b.object_key)
        if (!/^[0-9a-f]{64}$/.test(b.sha256) || !b.object_key.startsWith(`${ME}/`) || !stored || stored.sha256 !== b.sha256) return fail(422, 'VALIDATION_FAILED')
        if (stored.bytes > 1_048_576) return fail(413, 'PAYLOAD_TOO_LARGE')
        const replaced = state.signature !== undefined
        state.signature = { key: b.object_key, hash: b.sha256 }
        return json(replaced ? 200 : 201, { user_id: ME, signature_image_hash: b.sha256, signature_key: b.object_key, updated_at: '2026-11-26T10:00:00Z' })
      },
    },
    {
      method: 'DELETE',
      template: '/users/:id/signature',
      pattern: /^\/api\/v1\/users\/[^/]+\/signature$/,
      handle: () => {
        state.signature = undefined
        state.erasurePending = true
        return json(204)
      },
    },
    // ── Delegation ──
    { method: 'GET', template: '/delegations', pattern: /^\/api\/v1\/delegations$/, handle: () => json(200, { items: state.delegations }) },
    {
      method: 'POST',
      template: '/delegations',
      pattern: /^\/api\/v1\/delegations$/,
      handle: (_m, c) => {
        const key = c.headers['idempotency-key']!
        const earlier = state.idempotent.get(key)
        if (earlier) return json(201, earlier)
        const b = c.body as Json
        if (b['delegate_id'] === ME) return fail(422, 'self_delegation')
        if (b['delegate_id'] === ALAN) return fail(422, 'delegate_unavailable')
        const row: Json = {
          delegation_id: `dlg-${state.nextDelegation++}`,
          delegator_id: ME,
          delegate_id: b['delegate_id'],
          scope: b['scope'],
          ...(b['scope_id'] ? { scope_id: b['scope_id'] } : {}),
          starts_at: (b['starts_at'] as string) ?? iso(Date.now()),
          ...(b['ends_at'] ? { ends_at: b['ends_at'] } : { review_due_at: iso(Date.now() + days(90)), review_window_days: 90 }),
          status: 'active',
          record_version: 1,
        }
        state.idempotent.set(key, row)
        state.delegations = [...state.delegations, row]
        state.availability = { ...state.availability, delegate_user_id: b['delegate_id'] }
        return json(201, row)
      },
    },
    {
      method: 'DELETE',
      template: '/delegations/:id',
      pattern: /^\/api\/v1\/delegations\/([^/]+)$/,
      handle: (m, c) => {
        const row = state.delegations.find((d) => d['delegation_id'] === m[1])
        if (!row) return fail(404, 'NOT_FOUND')
        const conflict = lock(Number(c.query.find(([k]) => k === 'record_version')?.[1]), row['record_version'])
        if (conflict) return fail(409, 'optimistic_lock_conflict', { record_version: row['record_version'] })
        state.delegations = state.delegations.filter((d) => d !== row)
        return json(200, { ...row, status: 'ended' })
      },
    },
    {
      method: 'POST',
      template: '/delegations/:id/extend',
      pattern: /^\/api\/v1\/delegations\/([^/]+)\/extend$/,
      handle: (m, c) => {
        const row = state.delegations.find((d) => d['delegation_id'] === m[1])
        if (!row) return fail(404, 'NOT_FOUND')
        const b = c.body as { extend_days: number; record_version: number }
        if (b.record_version !== row['record_version']) return fail(409, 'optimistic_lock_conflict', { record_version: row['record_version'] })
        if (row['ends_at']) return fail(422, 'not_review_tracked')
        row['review_due_at'] = iso(Date.parse(row['review_due_at'] as string) + days(b.extend_days))
        row['record_version'] = (row['record_version'] as number) + 1
        return json(200, { delegation_id: row['delegation_id'], record_version: row['record_version'], review_due_at: row['review_due_at'], review_last_warned_bucket: 0 })
      },
    },
    {
      method: 'POST',
      template: '/delegations/:id/reassign',
      pattern: /^\/api\/v1\/delegations\/([^/]+)\/reassign$/,
      handle: (m, c) => {
        const row = state.delegations.find((d) => d['delegation_id'] === m[1])
        if (!row) return fail(404, 'NOT_FOUND')
        const b = c.body as Json
        if (b['record_version'] !== row['record_version']) return fail(409, 'optimistic_lock_conflict', { record_version: row['record_version'] })
        // The current delegation ends first; the new one is created after (and is not rolled back).
        state.delegations = state.delegations.filter((d) => d !== row)
        if (b['new_delegate_id'] === ALAN) return fail(422, 'delegate_unavailable')
        const next: Json = { ...row, delegation_id: `dlg-${state.nextDelegation++}`, record_version: 1 }
        if (b['new_delegate_id']) next['delegate_id'] = b['new_delegate_id']
        if (b['scope']) next['scope'] = b['scope']
        if (b['scope_id']) next['scope_id'] = b['scope_id']
        if (b['ends_at']) next['ends_at'] = b['ends_at']
        state.delegations = [...state.delegations, next]
        return json(201, next)
      },
    },
    { method: 'GET', template: '/delegations/settings', pattern: /^\/api\/v1\/delegations\/settings$/, handle: () => json(200, state.policy) },
    // ── Org & Membership (read only) ──
    {
      method: 'GET',
      template: '/tenants/:id/members',
      pattern: /^\/api\/v1\/tenants\/[^/]+\/members$/,
      handle: (_m, c) => {
        const all = [ME, GRACE, ALAN, SUSPENDED].map((id) => ({ user_id: id, status: id === SUSPENDED ? 'suspended' : 'active', tenant_roles: [], departments: [], record_version: 1, updated_at: '2026-01-01T00:00:00Z' }))
        const start = Number(c.query.find(([k]) => k === 'cursor')?.[1] ?? 0)
        const size = Number(c.query.find(([k]) => k === 'limit')?.[1] ?? 50)
        const page = all.slice(start, start + size)
        return json(200, { items: page, ...(start + size < all.length ? { next_cursor: String(start + size) } : {}) })
      },
    },
    { method: 'GET', template: '/tenants/:id/departments', pattern: /^\/api\/v1\/tenants\/[^/]+\/departments$/, handle: () => json(200, { items: [{ department_id: ENG, code: 'ENG', name: 'Engineering', is_active: true, is_system: true, record_version: 1 }] }) },
    { method: 'GET', template: '/tenants/:id/roles', pattern: /^\/api\/v1\/tenants\/[^/]+\/roles$/, handle: () => json(200, { items: [{ role_code: 'approver', display_name: 'Lead approver', record_version: 1 }] }) },
  ]

  function embedded() {
    return { status: state.availability['status'], ...(state.availability['ooo_from'] ? { ooo_from: state.availability['ooo_from'] } : {}), ...(state.availability['ooo_until'] ? { ooo_until: state.availability['ooo_until'] } : {}), ...(state.availability['note'] ? { note: state.availability['note'] } : {}), ...(state.availability['delegate_user_id'] ? { delegate_user_id: state.availability['delegate_user_id'] } : {}) }
  }

  async function handleStorage(url: URL, init: RequestInit | undefined, req: Request | undefined): Promise<Response> {
    const headers = Object.fromEntries([...new Headers(init?.headers ?? req?.headers).entries()])
    const body = init?.body ?? (req ? await req.arrayBuffer() : undefined)
    const bytes = body instanceof Uint8Array ? body : body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array()
    storageRequests.push({ url: url.toString(), headers, ...(init?.credentials ? { credentials: init.credentials } : {}), ...(init?.redirect ? { redirect: init.redirect } : {}), ...(init?.referrerPolicy ? { referrerPolicy: init.referrerPolicy } : {}), bytes: bytes.length })
    const injectedStorage = storageInjected.shift()
    if (injectedStorage?.network) throw new TypeError('Failed to fetch')
    if (injectedStorage) return new Response('denied', { status: injectedStorage.status })
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    state.stored.set(url.pathname.slice(1), { bytes: bytes.length, sha256, type: headers['content-type'] ?? null })
    return new Response(null, { status: 200 })
  }

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = input instanceof Request ? input : undefined
    const url = new URL(req ? req.url : String(input), 'http://localhost/')
    if (url.origin === BUCKET) return handleStorage(url, init, req)
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
    const text = req ? await req.clone().text() : typeof init?.body === 'string' ? init.body : ''
    const call: Captured = {
      method,
      pathname: decodeURIComponent(url.pathname),
      rawPath: url.pathname,
      query: [...url.searchParams.entries()],
      headers: Object.fromEntries([...new Headers(init?.headers ?? req?.headers).entries()]),
      body: text ? JSON.parse(text) : undefined,
    }
    const route = routes.find((r) => r.method === method && r.pattern.test(call.pathname))
    if (!route) return fail(404, 'NOT_FOUND')
    const key = `${method} ${route.template}`
    log.push(key)
    if (call.body !== undefined) (bodies[key] ??= []).push(call.body)
    ;(headersSeen[key] ??= []).push(call.headers)
    const queued = injected.get(key)?.shift()
    let response: Response
    if (queued?.network) throw new TypeError('Failed to fetch')
    if (queued) response = fail(queued.status, queued.errorCode ?? 'ERROR', queued.extra ?? {})
    else response = await route.handle(call.pathname.match(route.pattern)!, call)
    // Hold the fake to the Swagger: the request and the answer must both conform.
    const answer = response.status === 204 ? undefined : await response.clone().json().catch(() => undefined)
    if (options.check && response.status < 400) {
      const verdict = options.check(call, { status: response.status, ...(answer !== undefined ? { body: answer } : {}) })
      violations.push(...verdict.problems.map((p) => `${key}: ${p}`))
    }
    return response
  }

  return {
    fetch: handle, state, log, bodies, headersSeen, violations, storageRequests, failNext, failStorage, count: (route: string) => log.filter((l) => l === route).length }
}

export type FakeIamServer = ReturnType<typeof createFakeIamServer>

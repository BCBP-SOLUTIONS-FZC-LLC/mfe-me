// Contract harness: runs an adapter through the real SDK ApiClient with a stubbed fetch, then checks
// what it sent and what it was given against the vendored IAM Swagger (test/contract/swagger, pinned
// by SHA-256 in PIN.json): the operation exists for the method and path, every query name and the
// body are declared, the body validates and has no field the schema does not know, and the answer a
// fixture stands in for validates against the status' schema.
import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
import Ajv, { type ValidateFunction } from 'ajv'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rs } from '@rstest/core'
import { parse } from 'yaml'

const DIR = join(__dirname, 'swagger')

type Schema = Record<string, unknown>
interface Parameter {
  in: string
  name: string
  required?: boolean
  schema?: Schema
}
interface Operation {
  parameters?: Parameter[]
  responses?: Record<string, { schema?: Schema }>
}
interface Doc {
  basePath?: string
  paths: Record<string, Record<string, Operation>>
  definitions: Record<string, Schema>
}

export const SERVICES = ['org-membership', 'user-profile', 'delegation'] as const
export type Service = (typeof SERVICES)[number]

const docs = new Map<Service, Doc>(SERVICES.map((s) => [s, parse(readFileSync(join(DIR, `iam-${s}.yaml`), 'utf8')) as Doc]))

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

interface Indexed {
  service: Service
  /** The Swagger path (`/tenants/{id}/members`), and the full browser path with the base path in front. */
  path: string
  full: string
  method: string
  op: Operation
  regex: RegExp
}

const index: Indexed[] = []
for (const [service, doc] of docs) {
  const base = doc.basePath && doc.basePath !== '/' ? doc.basePath.replace(/\/$/, '') : ''
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method]
      if (!op) continue
      const full = `${base}${path}`
      const regex = new RegExp(`^${full.split(/(\{[^}]+\})/).map((p) => (p.startsWith('{') ? '[^/]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`)
      index.push({ service, path, full, method: method.toUpperCase(), op, regex })
    }
  }
}

/** The operation a concrete call matches, preferring the path with the most literal segments. */
export function findOperation(method: string, pathname: string): Indexed {
  const hits = index.filter((o) => o.method === method && o.regex.test(pathname))
  if (hits.length === 0) throw new Error(`no Swagger operation for ${method} ${pathname}`)
  hits.sort((a, b) => b.full.replace(/\{[^}]+\}/g, '').length - a.full.replace(/\{[^}]+\}/g, '').length)
  return hits[0]!
}

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
const validators = new Map<string, ValidateFunction>()

function resolve(doc: Doc, schema: Schema | undefined): Schema | undefined {
  const ref = schema?.['$ref']
  if (typeof ref === 'string') return resolve(doc, doc.definitions[ref.replace('#/definitions/', '')])
  return schema
}

function validator(service: Service, schema: Schema): ValidateFunction {
  const key = `${service}:${JSON.stringify(schema)}`
  let v = validators.get(key)
  if (!v) {
    v = ajv.compile({ ...schema, definitions: docs.get(service)!.definitions })
    validators.set(key, v)
  }
  return v
}

/** Keys in `value` the schema does not declare (an object with `properties` and no `additionalProperties`). */
function unknownKeys(doc: Doc, schema: Schema | undefined, value: unknown, path: string): string[] {
  const s = resolve(doc, schema)
  if (!s || value === null || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap((v, i) => unknownKeys(doc, s['items'] as Schema | undefined, v, `${path}[${i}]`))
  const props = s['properties'] as Record<string, Schema> | undefined
  if (!props) return []
  const open = s['additionalProperties'] !== undefined
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    k in props ? unknownKeys(doc, props[k], v, `${path}.${k}`) : open ? [] : [`${path}.${k}`],
  )
}

export interface Captured {
  method: string
  /** The path as the server would route it: percent-decoded, with the `/api` prefix. */
  pathname: string
  rawPath: string
  query: [string, string][]
  /** The request headers, names lower-cased. */
  headers: Record<string, string>
  body: unknown
}

/** Checks `value` against `schema` of `service`; returns what is wrong (empty when it conforms). */
function problems(service: Service, schema: Schema | undefined, value: unknown, what: string): string[] {
  const doc = docs.get(service)!
  const s = resolve(doc, schema)
  if (!s) return []
  const validate = validator(service, schema!)
  const out: string[] = []
  if (!validate(value)) out.push(...(validate.errors ?? []).map((e) => `${what}${e.instancePath} ${e.message}`))
  out.push(...unknownKeys(doc, schema, value, what).map((k) => `${k} is not in the Swagger`))
  return out
}

export interface Conformance {
  service: Service
  swaggerPath: string
  problems: string[]
}

/** Whether a captured call, and the answer it was given, conform to the Swagger. */
export function conformance(call: Captured, answer: { status: number; body?: unknown }): Conformance {
  const hit = findOperation(call.method, call.pathname)
  const doc = docs.get(hit.service)!
  const out: string[] = []

  const declaredQuery = new Set((hit.op.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name))
  for (const [name] of call.query) if (!declaredQuery.has(name)) out.push(`query ${name} is not declared by ${hit.method} ${hit.path}`)

  // A required header the operation declares (DLG-2's Idempotency-Key) must have been sent.
  for (const p of (hit.op.parameters ?? []).filter((x) => x.in === 'header' && x.required)) {
    if (!call.headers[p.name.toLowerCase()]) out.push(`header ${p.name} is required by ${hit.method} ${hit.path}`)
  }

  const bodyParam = (hit.op.parameters ?? []).find((p) => p.in === 'body')
  if (bodyParam) {
    if (call.body === undefined) {
      if (bodyParam.required) out.push(`${hit.method} ${hit.path} needs a body`)
    } else out.push(...problems(hit.service, bodyParam.schema, call.body, 'request'))
  } else if (call.body !== undefined) out.push(`${hit.method} ${hit.path} takes no body`)

  const response = hit.op.responses?.[String(answer.status)]
  if (!response) out.push(`${hit.method} ${hit.path} declares no ${answer.status} answer`)
  else if (response.schema && answer.body !== undefined) out.push(...problems(hit.service, response.schema, answer.body, `answer ${answer.status}`))
  else if (response.schema && answer.status !== 204) out.push(`${answer.status} should carry a body`)
  void doc
  return { service: hit.service, swaggerPath: hit.path, problems: out }
}

/** Replaces fetch: records each request and answers with what `reply` queued. */
export function stubServer() {
  const calls: Captured[] = []
  const answers: { status: number; body?: unknown }[] = []
  rs.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    // The client hands fetch a ready Request (headers and all); copying it would lose its headers in this DOM.
    const req = input instanceof Request ? input : new Request(new URL(String(input), 'http://localhost/'), init)
    const url = new URL(req.url)
    const text = await req.text()
    calls.push({
      method: req.method,
      pathname: decodeURIComponent(url.pathname),
      rawPath: url.pathname,
      query: [...url.searchParams.entries()],
      headers: Object.fromEntries([...new Headers(init?.headers ?? req.headers).entries()]),
      body: text ? JSON.parse(text) : undefined,
    })
    const a = answers.shift() ?? { status: 200, body: {} }
    return a.status === 204 || a.body === undefined
      ? new Response(null, { status: a.status })
      : new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': a.status >= 400 ? 'application/problem+json' : 'application/json' } })
  })
  return {
    calls,
    /** Queues the answer to the next request. */
    reply(status: number, body?: unknown) {
      answers.push({ status, ...(body !== undefined ? { body } : {}) })
    },
  }
}

export const client = () => createApiClient({ mfe: 'me' })
export const TENANT = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
export const swaggerDoc = (service: Service) => docs.get(service)!

/** Whether a problem body validates against the service's `ProblemResponse` (top-level extension members aside). */
export function problemProblems(service: Service, body: Record<string, unknown>): string[] {
  const doc = docs.get(service)!
  const name = Object.keys(doc.definitions).find((k) => k.endsWith('ProblemResponse') || k.endsWith('ProblemDetails'))
  if (!name) return ['the service declares no problem schema']
  const base = Object.fromEntries(Object.entries(body).filter(([k]) => k in ((doc.definitions[name]!['properties'] as Record<string, unknown>) ?? {})))
  return problems(service, { $ref: `#/definitions/${name}` }, base, 'problem')
}

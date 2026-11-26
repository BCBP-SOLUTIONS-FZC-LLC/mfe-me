// The harness has to catch a wrong request, or a green contract test means nothing: each case below is a
// request or answer that is wrong against the pinned Swagger, and must be reported.
import { describe, expect, it } from '@rstest/core'
import { conformance, findOperation, TENANT, type Captured } from './harness'
import * as f from './fixtures'

const call = (o: Partial<Captured> & Pick<Captured, 'method' | 'pathname'>): Captured => ({ rawPath: o.pathname, query: [], headers: {}, body: undefined, ...o })
const U = `/api/v1/users/${f.ME}`
const T = `/api/v1/tenants/${TENANT}`

describe('the contract harness catches', () => {
  it('a path the Swagger does not have', () => {
    expect(() => findOperation('GET', `${U}/signature`)).toThrow('no Swagger operation')
  })

  it('a method the path does not have', () => {
    expect(() => findOperation('DELETE', `${T}/members`)).toThrow('no Swagger operation')
  })

  it('a body field the Swagger does not declare', () => {
    const v = conformance(call({ method: 'PATCH', pathname: U, body: { display_name: 'A', tenant_id: TENANT } }), { status: 200, body: f.userResponse })
    expect(v.problems.join(' ')).toContain('.tenant_id is not in the Swagger')
  })

  it('a body value of the wrong type or over a limit', () => {
    const wrongType = conformance(call({ method: 'PATCH', pathname: U, body: { expected_version: '3' } }), { status: 200, body: f.userResponse })
    expect(wrongType.problems.length).toBeGreaterThan(0)
    const tooLong = conformance(call({ method: 'PATCH', pathname: U, body: { display_name: 'x'.repeat(201) } }), { status: 200, body: f.userResponse })
    expect(tooLong.problems.length).toBeGreaterThan(0)
    const bigFile = conformance(call({ method: 'POST', pathname: `${U}/signature`, body: { content_type: 'image/png', byte_size: 2_000_000 } }), { status: 200, body: f.presignResponse })
    expect(bigFile.problems.length).toBeGreaterThan(0)
  })

  it('a value outside an enum', () => {
    const v = conformance(call({ method: 'PUT', pathname: `${U}/llm-preferences`, body: { writing_tone: 'sarcastic' } }), { status: 200, body: f.llmPreferencesResponse })
    expect(v.problems.length).toBeGreaterThan(0)
  })

  it('a missing required body', () => {
    const v = conformance(call({ method: 'PUT', pathname: `${U}/availability` }), { status: 200, body: f.availabilityResponse })
    expect(v.problems.join(' ')).toContain('needs a body')
  })

  it('a body sent where the operation takes none', () => {
    const v = conformance(call({ method: 'GET', pathname: U, body: { x: 1 } }), { status: 200, body: f.userResponse })
    expect(v.problems.join(' ')).toContain('takes no body')
  })

  it('a query parameter the operation does not declare', () => {
    const v = conformance(call({ method: 'GET', pathname: `${T}/members`, query: [['search', 'ada']] }), { status: 200, body: f.memberPage })
    expect(v.problems.join(' ')).toContain('query search is not declared')
  })

  it('a missing Idempotency-Key on DLG-2', () => {
    const v = conformance(call({ method: 'POST', pathname: '/api/v1/delegations', body: { delegate_id: f.OTHER, scope: 'all' } }), { status: 201, body: f.delegationResponse })
    expect(v.problems.join(' ')).toContain('header Idempotency-Key is required')
    const ok = conformance(call({ method: 'POST', pathname: '/api/v1/delegations', headers: { 'idempotency-key': 'k' }, body: { delegate_id: f.OTHER, scope: 'all' } }), { status: 201, body: f.delegationResponse })
    expect(ok.problems).toEqual([])
  })

  it('a status the operation does not answer', () => {
    const v = conformance(call({ method: 'GET', pathname: U }), { status: 201, body: f.userResponse })
    expect(v.problems.join(' ')).toContain('declares no 201 answer')
  })

  it('an answer with a missing body, a wrong type, or a field the Swagger lacks', () => {
    const noBody = conformance(call({ method: 'GET', pathname: U }), { status: 200 })
    expect(noBody.problems.join(' ')).toContain('should carry a body')
    const typeBad = conformance(call({ method: 'GET', pathname: U }), { status: 200, body: { ...f.userResponse, record_version: '3' } })
    expect(typeBad.problems.length).toBeGreaterThan(0)
    const extra = conformance(call({ method: 'GET', pathname: U }), { status: 200, body: { ...f.userResponse, signature_url: 'https://x' } })
    expect(extra.problems.join(' ')).toContain('signature_url is not in the Swagger')
  })

  it('accepts a correct request and answer', () => {
    const v = conformance(call({ method: 'GET', pathname: U }), { status: 200, body: f.userResponse })
    expect(v).toEqual({ service: 'user-profile', swaggerPath: '/users/{id}', problems: [] })
  })

  it('tells the three services apart: the Delegation paths already carry /api/v1', () => {
    expect(findOperation('GET', '/api/v1/delegations/settings').service).toBe('delegation')
    expect(findOperation('GET', `${T}/departments`).service).toBe('org-membership')
    expect(findOperation('POST', '/api/v1/users:batch').service).toBe('user-profile')
  })
})

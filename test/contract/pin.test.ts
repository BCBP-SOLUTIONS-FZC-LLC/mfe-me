// The vendored Swagger files are what the contract tests trust: they must be exactly what PIN.json says, so
// a hand edit or a partial copy cannot make a wrong adapter pass. To follow IAM, read the diff
// (`npm run contracts:check`), update the adapters and fixtures, then `npm run contracts:pin`.
// The tripwires at the end pin the gaps the LLD lists (§15 #4, #5, #6): when IAM closes one, the test fails
// loudly so the screen can use the new field.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { swaggerDoc } from './harness'

const DIR = join(__dirname, 'swagger')
const pin = JSON.parse(readFileSync(join(DIR, 'PIN.json'), 'utf8')) as { pinnedOn: string; files: Record<string, string> }
const text = (file: string) => readFileSync(join(DIR, file), 'utf8')

describe('pinned IAM Swagger', () => {
  it('has exactly the three services this remote calls', () => {
    expect(Object.keys(pin.files).sort()).toEqual(['iam-delegation.yaml', 'iam-org-membership.yaml', 'iam-user-profile.yaml'])
    expect(readdirSync(DIR).filter((f) => f.endsWith('.yaml')).sort()).toEqual(Object.keys(pin.files).sort())
  })

  it.each(Object.entries(pin.files))('%s matches its pinned SHA-256', (file, sha) => {
    expect(createHash('sha256').update(readFileSync(join(DIR, file))).digest('hex')).toBe(sha)
  })

  it('records when it was pinned', () => {
    expect(pin.pinnedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('known gaps in the pinned Swagger (a failure means IAM fixed one: update the screen, the notes and this test)', () => {
  const userResponse = () => Object.keys((swaggerDoc('user-profile').definitions['http.UserResponse']!['properties'] as Record<string, unknown>))

  it('#4 UserResponse has no signature field, and no browser route reads my signature', () => {
    expect(userResponse().filter((k) => /signature/i.test(k))).toEqual([])
    const paths = Object.entries(swaggerDoc('user-profile').paths).filter(([p]) => p === '/users/{id}/signature')
    expect(Object.keys(paths[0]![1]).sort()).toEqual(['delete', 'post', 'put'])
    expect(text('iam-user-profile.yaml')).toContain('/internal/users/{id}/signature:')
  })

  it('#21 UserResponse has no avatar field', () => {
    expect(userResponse().filter((k) => /avatar|photo|picture/i.test(k))).toEqual([])
  })

  it('#5 DelegationResponse has no ended_reason, ooo_note or created_at, and DLG-1 takes no status filter', () => {
    const doc = swaggerDoc('delegation')
    const fields = Object.keys(doc.definitions['http.DelegationResponse']!['properties'] as Record<string, unknown>)
    for (const missing of ['ended_reason', 'ooo_note', 'created_at']) expect(fields).not.toContain(missing)
    const list = doc.paths['/api/v1/delegations']!['get']!
    expect(list.parameters ?? []).toEqual([])
  })

  it('#6 Delegation scope, status and the note limit are free strings in the Swagger', () => {
    const defs = swaggerDoc('delegation').definitions
    const props = (n: string) => defs[n]!['properties'] as Record<string, Record<string, unknown>>
    expect(props('http.DelegationResponse')['scope']).toEqual({ type: 'string' })
    expect(props('http.DelegationResponse')['status']).toEqual({ type: 'string' })
    expect(props('http.DelegationCreateRequest')['ooo_note']).toEqual({ type: 'string' })
    expect(props('http.DelegationReassignRequest')['reason']).toEqual({ type: 'string' })
    expect(props('http.DelegationCreateRequest')['starts_at']).toBeDefined()
  })

  it('#10 the notification preferences list carries no version', () => {
    const defs = swaggerDoc('user-profile').definitions
    expect(Object.keys(defs['http.NotifPrefsListResponse']!['properties'] as Record<string, unknown>)).toEqual(['preferences'])
    expect(Object.keys(defs['http.PutNotifPrefsRequest']!['properties'] as Record<string, unknown>)).toEqual(['preferences'])
  })

  it('credentials are string → string, not string → list (implementation-notes.md)', () => {
    const defs = swaggerDoc('user-profile').definitions
    const credentials = (defs['http.PatchUserRequest']!['properties'] as Record<string, { additionalProperties?: unknown }>)['credentials']!
    expect(credentials.additionalProperties).toEqual({ type: 'string' })
  })

  it('P-4 takes only limit and cursor: no search or filter (IAM-FE-Q5)', () => {
    const get = swaggerDoc('org-membership').paths['/tenants/{id}/members']!['get']!
    expect((get.parameters ?? []).map((p) => p.name).filter((n) => n !== 'id').sort()).toEqual(['cursor', 'limit'])
  })

  it('the signature confirm answers 413 and 422 without an error code of their own', () => {
    const put = swaggerDoc('user-profile').paths['/users/{id}/signature']!['put']!
    expect(Object.keys(put.responses ?? {})).toEqual(expect.arrayContaining(['200', '201', '409', '413', '422']))
  })
})

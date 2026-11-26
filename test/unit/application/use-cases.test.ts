// Each use case forwards to its port operation unchanged (ADR 0004: the rules run in the feature hooks,
// the use cases are the seam), and createUseCases wires every one to the right port. The signature
// upload, which does real work, is tested stage by stage in upload-signature.test.ts.
import { describe, expect, it, rs } from '@rstest/core'
import { createUseCases, type MeRepositories, type MeTools } from '../../../src/application/use-cases'
import type { DelegationPort } from '../../../src/domain/repositories/DelegationPort'
import type { OrgDirectoryPort } from '../../../src/domain/repositories/OrgDirectoryPort'
import type { UserProfilePort } from '../../../src/domain/repositories/UserProfilePort'

const spyAll = <T extends object>(names: (keyof T)[]) => Object.fromEntries(names.map((n) => [n, rs.fn(async (...args: unknown[]) => ({ called: n, args }))])) as unknown as T

const userProfile = spyAll<UserProfilePort>(['getUser', 'updateUser', 'batch', 'getAvailability', 'putAvailability', 'getLlmPreferences', 'putLlmPreferences', 'getNotificationPreferences', 'putNotificationPreferences', 'presignSignature', 'confirmSignature', 'deleteSignature'])
const delegation = spyAll<DelegationPort>(['list', 'create', 'cancel', 'extend', 'reassign', 'getPolicy'])
const orgDirectory = spyAll<OrgDirectoryPort>(['listMembers', 'listDepartments', 'listRoleLabels'])
const repositories: MeRepositories = { userProfile, delegation, orgDirectory, signatureStorage: { put: async () => {} } }
const tools: MeTools = { images: { toPng: async (s) => s.bytes }, hasher: { sha256Hex: async () => 'a'.repeat(64) }, telemetry: { signatureUploadFailed: () => {} } }
const useCases = createUseCases(repositories, tools)

const table: [keyof typeof useCases, object, string][] = [
  ['getUserProfile', userProfile, 'getUser'],
  ['updateUserProfile', userProfile, 'updateUser'],
  ['batchUserProfiles', userProfile, 'batch'],
  ['getAvailability', userProfile, 'getAvailability'],
  ['putAvailability', userProfile, 'putAvailability'],
  ['getLlmPreferences', userProfile, 'getLlmPreferences'],
  ['putLlmPreferences', userProfile, 'putLlmPreferences'],
  ['getNotificationPreferences', userProfile, 'getNotificationPreferences'],
  ['putNotificationPreferences', userProfile, 'putNotificationPreferences'],
  ['deleteSignature', userProfile, 'deleteSignature'],
  ['listDelegations', delegation, 'list'],
  ['createDelegation', delegation, 'create'],
  ['cancelDelegation', delegation, 'cancel'],
  ['extendDelegation', delegation, 'extend'],
  ['reassignDelegation', delegation, 'reassign'],
  ['getDelegationPolicy', delegation, 'getPolicy'],
  ['listMembers', orgDirectory, 'listMembers'],
  ['listDepartments', orgDirectory, 'listDepartments'],
  ['listRoleLabels', orgDirectory, 'listRoleLabels'],
]

describe('createUseCases', () => {
  it.each(table)('%s forwards its arguments to %s.%s and returns its answer', async (name, _port, method) => {
    const useCase = useCases[name] as { execute: (...a: unknown[]) => Promise<unknown> }
    expect(await useCase.execute('x', 'y')).toEqual({ called: method, args: ['x', 'y'] })
  })

  it('builds one use case per port operation, plus the signature upload', () => {
    expect(Object.keys(useCases)).toHaveLength(table.length + 1)
    expect(useCases.uploadSignature).toBeDefined()
  })
})

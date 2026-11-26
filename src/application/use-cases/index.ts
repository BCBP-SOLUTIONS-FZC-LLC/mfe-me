// The application layer's use cases: one class per operation, built over the domain's repository
// ports. Presentation calls `execute()`; it never reaches a port or an adapter directly (ADR 0004).
import type { DelegationPort } from '../../domain/repositories/DelegationPort'
import type { OrgDirectoryPort } from '../../domain/repositories/OrgDirectoryPort'
import type { SignatureStoragePort } from '../../domain/repositories/SignatureStoragePort'
import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'
import type { Hasher } from '../ports/hashing'
import type { ImageProcessor } from '../ports/media'
import type { MeTelemetry } from '../ports/telemetry'
import { BatchUserProfilesUseCase } from './BatchUserProfilesUseCase'
import { CancelDelegationUseCase } from './CancelDelegationUseCase'
import { CreateDelegationUseCase } from './CreateDelegationUseCase'
import { DeleteSignatureUseCase } from './DeleteSignatureUseCase'
import { ExtendDelegationUseCase } from './ExtendDelegationUseCase'
import { GetAvailabilityUseCase } from './GetAvailabilityUseCase'
import { GetDelegationPolicyUseCase } from './GetDelegationPolicyUseCase'
import { GetLlmPreferencesUseCase } from './GetLlmPreferencesUseCase'
import { GetNotificationPreferencesUseCase } from './GetNotificationPreferencesUseCase'
import { GetUserProfileUseCase } from './GetUserProfileUseCase'
import { ListDelegationsUseCase } from './ListDelegationsUseCase'
import { ListDepartmentsUseCase } from './ListDepartmentsUseCase'
import { ListMembersUseCase } from './ListMembersUseCase'
import { ListRoleLabelsUseCase } from './ListRoleLabelsUseCase'
import { PutAvailabilityUseCase } from './PutAvailabilityUseCase'
import { PutLlmPreferencesUseCase } from './PutLlmPreferencesUseCase'
import { PutNotificationPreferencesUseCase } from './PutNotificationPreferencesUseCase'
import { ReassignDelegationUseCase } from './ReassignDelegationUseCase'
import { UpdateUserProfileUseCase } from './UpdateUserProfileUseCase'
import { UploadSignatureUseCase } from './UploadSignatureUseCase'

export { SignatureUploadError } from './UploadSignatureUseCase'

/** The repository ports the use cases are built over (the composition root supplies the adapters). */
export interface MeRepositories {
  readonly userProfile: UserProfilePort
  readonly delegation: DelegationPort
  readonly orgDirectory: OrgDirectoryPort
  readonly signatureStorage: SignatureStoragePort
}

/** What the signature upload needs besides the ports: the browser work and its telemetry. */
export interface MeTools {
  readonly images: ImageProcessor
  readonly hasher: Hasher
  readonly telemetry: Pick<MeTelemetry, 'signatureUploadFailed'>
}

export interface MeUseCases {
  readonly getUserProfile: GetUserProfileUseCase
  readonly updateUserProfile: UpdateUserProfileUseCase
  readonly batchUserProfiles: BatchUserProfilesUseCase
  readonly getAvailability: GetAvailabilityUseCase
  readonly putAvailability: PutAvailabilityUseCase
  readonly getLlmPreferences: GetLlmPreferencesUseCase
  readonly putLlmPreferences: PutLlmPreferencesUseCase
  readonly getNotificationPreferences: GetNotificationPreferencesUseCase
  readonly putNotificationPreferences: PutNotificationPreferencesUseCase
  readonly uploadSignature: UploadSignatureUseCase
  readonly deleteSignature: DeleteSignatureUseCase
  readonly listDelegations: ListDelegationsUseCase
  readonly createDelegation: CreateDelegationUseCase
  readonly cancelDelegation: CancelDelegationUseCase
  readonly extendDelegation: ExtendDelegationUseCase
  readonly reassignDelegation: ReassignDelegationUseCase
  readonly getDelegationPolicy: GetDelegationPolicyUseCase
  readonly listMembers: ListMembersUseCase
  readonly listDepartments: ListDepartmentsUseCase
  readonly listRoleLabels: ListRoleLabelsUseCase
}

export function createUseCases(repositories: MeRepositories, tools: MeTools): MeUseCases {
  const { userProfile, delegation, orgDirectory, signatureStorage } = repositories
  return {
    getUserProfile: new GetUserProfileUseCase(userProfile),
    updateUserProfile: new UpdateUserProfileUseCase(userProfile),
    batchUserProfiles: new BatchUserProfilesUseCase(userProfile),
    getAvailability: new GetAvailabilityUseCase(userProfile),
    putAvailability: new PutAvailabilityUseCase(userProfile),
    getLlmPreferences: new GetLlmPreferencesUseCase(userProfile),
    putLlmPreferences: new PutLlmPreferencesUseCase(userProfile),
    getNotificationPreferences: new GetNotificationPreferencesUseCase(userProfile),
    putNotificationPreferences: new PutNotificationPreferencesUseCase(userProfile),
    uploadSignature: new UploadSignatureUseCase({ userProfile, storage: signatureStorage, images: tools.images, hasher: tools.hasher, telemetry: tools.telemetry }),
    deleteSignature: new DeleteSignatureUseCase(userProfile),
    listDelegations: new ListDelegationsUseCase(delegation),
    createDelegation: new CreateDelegationUseCase(delegation),
    cancelDelegation: new CancelDelegationUseCase(delegation),
    extendDelegation: new ExtendDelegationUseCase(delegation),
    reassignDelegation: new ReassignDelegationUseCase(delegation),
    getDelegationPolicy: new GetDelegationPolicyUseCase(delegation),
    listMembers: new ListMembersUseCase(orgDirectory),
    listDepartments: new ListDepartmentsUseCase(orgDirectory),
    listRoleLabels: new ListRoleLabelsUseCase(orgDirectory),
  }
}

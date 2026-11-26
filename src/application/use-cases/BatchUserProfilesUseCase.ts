import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** BatchUserProfiles: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class BatchUserProfilesUseCase {
  private readonly repository: Pick<UserProfilePort, 'batch'>

  constructor(repository: Pick<UserProfilePort, 'batch'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['batch']>): ReturnType<UserProfilePort['batch']> {
    return this.repository.batch(...args)
  }
}

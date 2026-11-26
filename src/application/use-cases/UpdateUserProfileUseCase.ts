import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** UpdateUserProfile: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class UpdateUserProfileUseCase {
  private readonly repository: Pick<UserProfilePort, 'updateUser'>

  constructor(repository: Pick<UserProfilePort, 'updateUser'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['updateUser']>): ReturnType<UserProfilePort['updateUser']> {
    return this.repository.updateUser(...args)
  }
}

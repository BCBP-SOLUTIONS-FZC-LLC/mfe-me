import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** GetUserProfile: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class GetUserProfileUseCase {
  private readonly repository: Pick<UserProfilePort, 'getUser'>

  constructor(repository: Pick<UserProfilePort, 'getUser'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['getUser']>): ReturnType<UserProfilePort['getUser']> {
    return this.repository.getUser(...args)
  }
}

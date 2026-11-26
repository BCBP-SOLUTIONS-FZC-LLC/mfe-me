import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** PutAvailability: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class PutAvailabilityUseCase {
  private readonly repository: Pick<UserProfilePort, 'putAvailability'>

  constructor(repository: Pick<UserProfilePort, 'putAvailability'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['putAvailability']>): ReturnType<UserProfilePort['putAvailability']> {
    return this.repository.putAvailability(...args)
  }
}

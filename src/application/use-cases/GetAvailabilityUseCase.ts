import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** GetAvailability: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class GetAvailabilityUseCase {
  private readonly repository: Pick<UserProfilePort, 'getAvailability'>

  constructor(repository: Pick<UserProfilePort, 'getAvailability'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['getAvailability']>): ReturnType<UserProfilePort['getAvailability']> {
    return this.repository.getAvailability(...args)
  }
}

import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** GetNotificationPreferences: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class GetNotificationPreferencesUseCase {
  private readonly repository: Pick<UserProfilePort, 'getNotificationPreferences'>

  constructor(repository: Pick<UserProfilePort, 'getNotificationPreferences'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['getNotificationPreferences']>): ReturnType<UserProfilePort['getNotificationPreferences']> {
    return this.repository.getNotificationPreferences(...args)
  }
}

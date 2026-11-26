import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** PutNotificationPreferences: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class PutNotificationPreferencesUseCase {
  private readonly repository: Pick<UserProfilePort, 'putNotificationPreferences'>

  constructor(repository: Pick<UserProfilePort, 'putNotificationPreferences'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['putNotificationPreferences']>): ReturnType<UserProfilePort['putNotificationPreferences']> {
    return this.repository.putNotificationPreferences(...args)
  }
}

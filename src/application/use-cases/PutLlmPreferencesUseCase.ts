import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** PutLlmPreferences: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class PutLlmPreferencesUseCase {
  private readonly repository: Pick<UserProfilePort, 'putLlmPreferences'>

  constructor(repository: Pick<UserProfilePort, 'putLlmPreferences'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['putLlmPreferences']>): ReturnType<UserProfilePort['putLlmPreferences']> {
    return this.repository.putLlmPreferences(...args)
  }
}

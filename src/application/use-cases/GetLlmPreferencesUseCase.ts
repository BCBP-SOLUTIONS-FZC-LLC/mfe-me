import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** GetLlmPreferences: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class GetLlmPreferencesUseCase {
  private readonly repository: Pick<UserProfilePort, 'getLlmPreferences'>

  constructor(repository: Pick<UserProfilePort, 'getLlmPreferences'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['getLlmPreferences']>): ReturnType<UserProfilePort['getLlmPreferences']> {
    return this.repository.getLlmPreferences(...args)
  }
}

import type { UserProfilePort } from '../../domain/repositories/UserProfilePort'

/** DeleteSignature: one operation of UserProfilePort, called by the presentation layer's feature hooks. */
export class DeleteSignatureUseCase {
  private readonly repository: Pick<UserProfilePort, 'deleteSignature'>

  constructor(repository: Pick<UserProfilePort, 'deleteSignature'>) {
    this.repository = repository
  }

  execute(...args: Parameters<UserProfilePort['deleteSignature']>): ReturnType<UserProfilePort['deleteSignature']> {
    return this.repository.deleteSignature(...args)
  }
}

import type { DelegationPort } from '../../domain/repositories/DelegationPort'

/** CreateDelegation: one operation of DelegationPort, called by the presentation layer's feature hooks. */
export class CreateDelegationUseCase {
  private readonly repository: Pick<DelegationPort, 'create'>

  constructor(repository: Pick<DelegationPort, 'create'>) {
    this.repository = repository
  }

  execute(...args: Parameters<DelegationPort['create']>): ReturnType<DelegationPort['create']> {
    return this.repository.create(...args)
  }
}

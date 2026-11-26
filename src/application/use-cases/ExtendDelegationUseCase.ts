import type { DelegationPort } from '../../domain/repositories/DelegationPort'

/** ExtendDelegation: one operation of DelegationPort, called by the presentation layer's feature hooks. */
export class ExtendDelegationUseCase {
  private readonly repository: Pick<DelegationPort, 'extend'>

  constructor(repository: Pick<DelegationPort, 'extend'>) {
    this.repository = repository
  }

  execute(...args: Parameters<DelegationPort['extend']>): ReturnType<DelegationPort['extend']> {
    return this.repository.extend(...args)
  }
}

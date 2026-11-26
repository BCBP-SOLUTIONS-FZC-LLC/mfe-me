import type { DelegationPort } from '../../domain/repositories/DelegationPort'

/** CancelDelegation: one operation of DelegationPort, called by the presentation layer's feature hooks. */
export class CancelDelegationUseCase {
  private readonly repository: Pick<DelegationPort, 'cancel'>

  constructor(repository: Pick<DelegationPort, 'cancel'>) {
    this.repository = repository
  }

  execute(...args: Parameters<DelegationPort['cancel']>): ReturnType<DelegationPort['cancel']> {
    return this.repository.cancel(...args)
  }
}

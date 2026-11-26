import type { DelegationPort } from '../../domain/repositories/DelegationPort'

/** ReassignDelegation: one operation of DelegationPort, called by the presentation layer's feature hooks. */
export class ReassignDelegationUseCase {
  private readonly repository: Pick<DelegationPort, 'reassign'>

  constructor(repository: Pick<DelegationPort, 'reassign'>) {
    this.repository = repository
  }

  execute(...args: Parameters<DelegationPort['reassign']>): ReturnType<DelegationPort['reassign']> {
    return this.repository.reassign(...args)
  }
}

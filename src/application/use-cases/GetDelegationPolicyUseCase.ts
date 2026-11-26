import type { DelegationPort } from '../../domain/repositories/DelegationPort'

/** GetDelegationPolicy: one operation of DelegationPort, called by the presentation layer's feature hooks. */
export class GetDelegationPolicyUseCase {
  private readonly repository: Pick<DelegationPort, 'getPolicy'>

  constructor(repository: Pick<DelegationPort, 'getPolicy'>) {
    this.repository = repository
  }

  execute(...args: Parameters<DelegationPort['getPolicy']>): ReturnType<DelegationPort['getPolicy']> {
    return this.repository.getPolicy(...args)
  }
}
